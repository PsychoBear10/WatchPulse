import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
} from 'electron';
import * as crypto from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JsonStorageService } from './storage';
import {
  AppData,
  AppInfo,
  LiveFetchResult,
  LiveStreamResolveResult,
  OpenFileResult,
  OpenImageResult,
  SaveFileResult,
} from './types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const ALLOWED_IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
]);

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getThumbnailsDir(): string {
  return path.join(app.getPath('userData'), 'thumbnails');
}

function getBuildIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.png'),
  ];
  return candidates.find((p) => p && fsSync.existsSync(p));
}

function isAllowedAppNavigation(targetUrl: string): boolean {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && targetUrl.startsWith('http://localhost:5173')) {
    return true;
  }
  if (!isDev && targetUrl.startsWith('file://')) {
    return true;
  }
  return false;
}

let mainWindow: BrowserWindow | null = null;
let storageService: JsonStorageService | null = null;

function createWindow(): void {
  const isDev = process.env.NODE_ENV === 'development';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'WatchPulse',
    backgroundColor: '#090B10',
    show: false,
    icon: getBuildIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!params.src || !isSafeExternalUrl(params.src)) {
      event.preventDefault();
    }
  });

  // Prevent dragged links/files from navigating the main WatchPulse shell away from index.html
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedAppNavigation(navigationUrl)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[WatchPulse] Renderer process gone:', details.reason);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
  });

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools();
      }
    });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerMediaProtocol(): void {
  protocol.handle('local-media', async (request) => {
    try {
      const url = new URL(request.url);
      let targetPath = '';

      if (url.hostname === 'thumb') {
        const fileName = path.basename(decodeURIComponent(url.pathname));
        const thumbsDir = getThumbnailsDir();
        targetPath = path.join(thumbsDir, fileName);
      } else if (url.hostname === 'local') {
        const rawPath = url.searchParams.get('path') || '';
        targetPath = path.resolve(rawPath);
      } else {
        return new Response('Forbidden', { status: 403 });
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        return new Response('Unsupported media type', { status: 415 });
      }

      await fs.access(targetPath);
      return net.fetch(pathToFileURL(targetPath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function getLegacyUserDataDirs(): string[] {
  return [path.join(app.getPath('appData'), 'modelsort-studio')];
}

function registerIpcHandlers(): void {
  storageService = new JsonStorageService(
    app.getPath('userData'),
    getLegacyUserDataDirs()
  );

  ipcMain.handle('store:load', async (): Promise<AppData> => {
    if (!storageService) {
      storageService = new JsonStorageService(
        app.getPath('userData'),
        getLegacyUserDataDirs()
      );
    }
    return storageService.load();
  });

  ipcMain.handle('store:save', async (_event, data: AppData): Promise<AppData> => {
    if (!storageService) {
      storageService = new JsonStorageService(
        app.getPath('userData'),
        getLegacyUserDataDirs()
      );
    }
    return storageService.save(data);
  });

  ipcMain.on('store:saveSync', (event, data: AppData) => {
    try {
      if (!storageService) {
        storageService = new JsonStorageService(
          app.getPath('userData'),
          getLegacyUserDataDirs()
        );
      }
      storageService.saveSync(data);
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.handle('shell:openExternal', async (_event, rawUrl: string): Promise<boolean> => {
    if (!isSafeExternalUrl(rawUrl)) {
      return false;
    }
    await shell.openExternal(rawUrl);
    return true;
  });

  ipcMain.handle('shell:openDataFolder', async (): Promise<void> => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('dialog:openCsvFile', async (): Promise<OpenFileResult> => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Import CSV or Model List',
          properties: ['openFile'],
          filters: [
            { name: 'CSV & Text Lists', extensions: ['csv', 'txt', 'tsv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      : await dialog.showOpenDialog({
          title: 'Import CSV or Model List',
          properties: ['openFile'],
          filters: [
            { name: 'CSV & Text Lists', extensions: ['csv', 'txt', 'tsv'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { canceled: false, filePath, content };
    } catch {
      return { canceled: true };
    }
  });

  ipcMain.handle('dialog:openJsonBackup', async (): Promise<OpenFileResult> => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Restore Workspace JSON Backup',
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { canceled: false, filePath, content };
    } catch {
      return { canceled: true };
    }
  });

  ipcMain.handle('dialog:openImageFile', async (): Promise<OpenImageResult> => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Choose Profile Thumbnail Image',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'],
        },
      ],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const sourcePath = result.filePaths[0];
    try {
      const ext = path.extname(sourcePath).toLowerCase() || '.png';
      const thumbsDir = getThumbnailsDir();
      await fs.mkdir(thumbsDir, { recursive: true });
      const fileName = `${crypto.randomUUID()}${ext}`;
      const destPath = path.join(thumbsDir, fileName);
      await fs.copyFile(sourcePath, destPath);

      return {
        canceled: false,
        mediaUrl: `local-media://thumb/${encodeURIComponent(fileName)}`,
        originalPath: sourcePath,
      };
    } catch {
      return { canceled: true };
    }
  });

  ipcMain.handle(
    'dialog:saveExportFile',
    async (
      _event,
      params: { defaultName: string; content: string; extension: 'csv' | 'json' | 'txt' }
    ): Promise<SaveFileResult> => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow();
      const filterMap = {
        csv: [{ name: 'CSV Spreadsheet', extensions: ['csv'] }],
        json: [{ name: 'JSON Backup', extensions: ['json'] }],
        txt: [{ name: 'Text Summary', extensions: ['txt', 'md'] }],
      };

      const options: Electron.SaveDialogOptions = {
        title: 'Export Models',
        defaultPath: params.defaultName,
        filters: filterMap[params.extension] || [{ name: 'All Files', extensions: ['*'] }],
      };

      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      try {
        await fs.writeFile(result.filePath, params.content, 'utf-8');
        return { canceled: false, filePath: result.filePath };
      } catch (err) {
        return {
          canceled: false,
          error: err instanceof Error ? err.message : 'Failed to write export file',
        };
      }
    }
  );

  ipcMain.handle('clipboard:writeText', (_event, text: string): boolean => {
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('clipboard:readText', (): string => {
    return clipboard.readText();
  });

  ipcMain.handle('app:getInfo', (): AppInfo => {
    return {
      version: app.getVersion(),
      dataFilePath: storageService?.getDataFilePath() ?? '',
      userDataPath: app.getPath('userData'),
      thumbnailsPath: getThumbnailsDir(),
      platform: process.platform,
    };
  });

  ipcMain.handle(
    'media:deleteThumbnail',
    async (_event, mediaUrl: string): Promise<boolean> => {
      if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('local-media://thumb/')) {
        return false;
      }
      try {
        const parsed = new URL(mediaUrl);
        const fileName = path.basename(decodeURIComponent(parsed.pathname));
        if (!fileName) return false;
        const targetPath = path.join(getThumbnailsDir(), fileName);
        await fs.unlink(targetPath);
        return true;
      } catch {
        return false;
      }
    }
  );

  ipcMain.handle(
    'live:fetchJson',
    async (
      _event,
      params: string | { url: string; authHeader?: string }
    ): Promise<LiveFetchResult> => {
      const rawUrl = typeof params === 'string' ? params : params.url;
      const authHeader =
        typeof params === 'object' && params.authHeader
          ? params.authHeader.trim()
          : '';

      if (!isSafeExternalUrl(rawUrl)) {
        return {
          ok: false,
          status: 0,
          latencyMs: 0,
          contentType: '',
          error: 'Only http:// or https:// URLs are permitted.',
        };
      }

      const started = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json, text/plain, */*',
        };
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const res = await net.fetch(rawUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        const latencyMs = Date.now() - started;
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            latencyMs,
            contentType,
            error: `HTTP ${res.status} ${res.statusText}`.trim(),
            rawSnippet: text.slice(0, 260),
          };
        }

        try {
          const data = JSON.parse(text);
          return {
            ok: true,
            status: res.status,
            latencyMs,
            contentType,
            data,
          };
        } catch {
          return {
            ok: false,
            status: res.status,
            latencyMs,
            contentType,
            error:
              'Endpoint returned non-JSON content (possibly HTML or an access gate).',
            rawSnippet: text.slice(0, 260),
          };
        }
      } catch (err) {
        return {
          ok: false,
          status: 0,
          latencyMs: Date.now() - started,
          contentType: '',
          error: err instanceof Error ? err.message : 'Network request failed.',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }
  );

  ipcMain.handle(
    'live:resolveStream',
    async (_event, rawUsername: string): Promise<LiveStreamResolveResult> => {
      const clean = String(rawUsername || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      if (!clean) {
        return { ok: false, error: 'Invalid username.' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const embedUrl = `https://chaturbate.com/embed/${encodeURIComponent(clean)}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black`;
        const res = await net.fetch(embedUrl, {
          method: 'GET',
          headers: { Accept: 'text/html,application/xhtml+xml' },
          signal: controller.signal,
        });
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}` };
        }
        const html = await res.text();
        const match = html.match(/window\.initialRoomDossier\s*=\s*"([^"]+)"/);
        if (!match?.[1]) {
          return { ok: false, error: 'Stream metadata unavailable in embed.' };
        }
        const rawJsonStr = JSON.parse(`"${match[1]}"`) as string;
        const dossier = JSON.parse(rawJsonStr) as {
          hls_source?: string;
          room_status?: string;
          num_viewers?: number;
        };
        const hlsUrl =
          typeof dossier.hls_source === 'string' &&
          isSafeExternalUrl(dossier.hls_source)
            ? dossier.hls_source
            : '';
        return {
          ok: Boolean(hlsUrl),
          hlsUrl: hlsUrl || undefined,
          roomStatus:
            typeof dossier.room_status === 'string'
              ? dossier.room_status.toLowerCase()
              : undefined,
          numViewers:
            typeof dossier.num_viewers === 'number'
              ? dossier.num_viewers
              : undefined,
          error: hlsUrl ? undefined : 'No active HLS stream source.',
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to resolve stream.',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }
  );
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setAudioMuted(true);
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerMediaProtocol();
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
