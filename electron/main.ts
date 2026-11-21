import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import * as crypto from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JsonStorageService } from './storage';
import {
  AppData,
  AppInfo,
  LiveFetchResult,
  LiveRoomInfo,
  LiveStreamResolveResult,
  OpenFileResult,
  OpenImageResult,
  PipParams,
  PipState,
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
  const isWin = process.platform === 'win32';
  const iconNames = isWin ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  const baseDirs = [
    path.join(__dirname, '..', 'build'),
    path.join(process.resourcesPath || '', 'build'),
    path.join(__dirname, '..', 'dist'),
    path.join(process.resourcesPath || '', 'dist'),
  ];
  for (const dir of baseDirs) {
    for (const name of iconNames) {
      const candidate = path.join(dir, name);
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function isInsideDir(childPath: string, parentDir: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedChild = path.resolve(childPath);
  const relative = path.relative(resolvedParent, resolvedChild);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function getDistIndexPath(): string {
  return path.resolve(__dirname, '..', 'dist', 'index.html');
}

function isAllowedAppNavigation(targetUrl: string): boolean {
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && targetUrl.startsWith('http://localhost:5173')) {
    return true;
  }
  if (!isDev) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'file:') {
        const cleanFileUrl = `${parsed.protocol}//${parsed.host || ''}${parsed.pathname}`;
        const targetFilePath = path.resolve(fileURLToPath(cleanFileUrl));
        const allowedDistIndex = getDistIndexPath();
        if (process.platform === 'win32') {
          return targetFilePath.toLowerCase() === allowedDistIndex.toLowerCase();
        }
        return targetFilePath === allowedDistIndex;
      }
    } catch {
      return false;
    }
  }
  return false;
}

let mainWindow: BrowserWindow | null = null;
let pipWindow: BrowserWindow | null = null;
let currentPipUsername: string | null = null;
let pendingPipNavigate: {
  username: string;
  muted: boolean;
  videoOnly: boolean;
  embedTemplate?: string;
} | null = null;
let storageService: JsonStorageService | null = null;

function broadcastPipState(): void {
  const state: PipState = {
    isOpen: Boolean(pipWindow && !pipWindow.isDestroyed()),
    username: currentPipUsername,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pip:stateChanged', state);
  }
}

function openPipWindow(params: PipParams): PipState {
  if (!params || typeof params !== 'object') {
    return { isOpen: false, username: null };
  }
  const isDev = process.env.NODE_ENV === 'development';
  const cleanUsername = String(params.username || '').trim().toLowerCase();
  if (!cleanUsername) {
    return { isOpen: false, username: null };
  }

  const queryParams = new URLSearchParams({
    pip: '1',
    username: cleanUsername,
    muted: params.muted ? '1' : '0',
    videoOnly: params.videoOnly !== false ? '1' : '0',
    ...(params.embedTemplate ? { embedTemplate: params.embedTemplate } : {}),
  });
  const queryString = queryParams.toString();

  const navParams = {
    username: cleanUsername,
    muted: Boolean(params.muted),
    videoOnly: params.videoOnly !== false,
    embedTemplate: params.embedTemplate,
  };

  if (pipWindow && !pipWindow.isDestroyed()) {
    currentPipUsername = cleanUsername;
    pipWindow.setTitle(`WatchPulse PiP — ${cleanUsername}`);
    if (pipWindow.webContents.isLoading()) {
      pendingPipNavigate = navParams;
    } else {
      pipWindow.webContents.send('pip:navigate', navParams);
      pendingPipNavigate = null;
    }
    if (pipWindow.isMinimized()) pipWindow.restore();
    pipWindow.show();
    broadcastPipState();
    return { isOpen: true, username: cleanUsername };
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const targetDisplay =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayNearestPoint(mainWindow.getBounds())
      : primaryDisplay;
  const workArea = targetDisplay.workArea;

  const width = 480;
  const height = 295;
  const x = Math.round(workArea.x + workArea.width - width - 24);
  const y = Math.round(workArea.y + workArea.height - height - 24);

  pipWindow = new BrowserWindow({
    width,
    height,
    minWidth: 320,
    minHeight: 200,
    x,
    y,
    title: `WatchPulse PiP — ${cleanUsername}`,
    backgroundColor: '#090B10',
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    icon: getBuildIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  currentPipUsername = cleanUsername;
  pendingPipNavigate = navParams;

  try {
    pipWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch {
    pipWindow.setAlwaysOnTop(true);
  }

  pipWindow.webContents.on('will-attach-webview', (event, webPreferences, p) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!p.src || !isSafeExternalUrl(p.src)) {
      event.preventDefault();
    }
  });

  pipWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    event.preventDefault();
    if (isSafeExternalUrl(navigationUrl)) {
      void shell.openExternal(navigationUrl);
    }
  });

  pipWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  pipWindow.webContents.on('did-finish-load', () => {
    if (pendingPipNavigate && pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.webContents.send('pip:navigate', pendingPipNavigate);
      pendingPipNavigate = null;
    }
  });

  pipWindow.once('ready-to-show', () => {
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.show();
    }
  });

  pipWindow.on('closed', () => {
    pipWindow = null;
    currentPipUsername = null;
    pendingPipNavigate = null;
    broadcastPipState();
  });

  if (isDev) {
    void pipWindow.loadURL(`http://localhost:5173?${queryString}`);
  } else {
    void pipWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      search: `?${queryString}`,
    });
  }

  broadcastPipState();
  return { isOpen: true, username: cleanUsername };
}

function closePipWindow(): boolean {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close();
    pipWindow = null;
    currentPipUsername = null;
    broadcastPipState();
    return true;
  }
  return false;
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  const defaultState: WindowState = {
    width: 1440,
    height: 920,
    isMaximized: false,
  };
  try {
    const filePath = getWindowStatePath();
    if (!fsSync.existsSync(filePath)) {
      return defaultState;
    }
    const raw = fsSync.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as Partial<WindowState>;
    if (!data || typeof data !== 'object') {
      return defaultState;
    }

    const width =
      typeof data.width === 'number' && Number.isFinite(data.width) && data.width >= 1024
        ? Math.round(data.width)
        : 1440;
    const height =
      typeof data.height === 'number' && Number.isFinite(data.height) && data.height >= 680
        ? Math.round(data.height)
        : 920;
    let x = typeof data.x === 'number' && Number.isFinite(data.x) ? Math.round(data.x) : undefined;
    let y = typeof data.y === 'number' && Number.isFinite(data.y) ? Math.round(data.y) : undefined;
    const isMaximized = Boolean(data.isMaximized);

    // Multi-display safety validation
    if (x !== undefined && y !== undefined) {
      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find((display) => {
        const area = display.workArea;
        return (
          x! + width > area.x + 100 &&
          x! < area.x + area.width - 100 &&
          y! + height > area.y + 100 &&
          y! < area.y + area.height - 100
        );
      });

      if (!targetDisplay) {
        x = undefined;
        y = undefined;
      } else {
        const workArea = targetDisplay.workArea;
        y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - 100));
      }
    }

    return {
      x,
      y,
      width,
      height,
      isMaximized,
    };
  } catch (err) {
    console.error('[WatchPulse] Failed to load window state:', err);
    return defaultState;
  }
}

let saveWindowStateTimer: NodeJS.Timeout | null = null;
let lastKnownBounds = {
  x: undefined as number | undefined,
  y: undefined as number | undefined,
  width: 1440,
  height: 920,
};

function saveWindowState(immediate = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const isMaximized = mainWindow.isMaximized();
  if (!isMaximized && !mainWindow.isMinimized()) {
    const bounds = mainWindow.getBounds();
    lastKnownBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }

  const stateToSave: WindowState = {
    ...lastKnownBounds,
    isMaximized,
  };

  const doWrite = () => {
    try {
      const filePath = getWindowStatePath();
      fsSync.writeFileSync(filePath, JSON.stringify(stateToSave, null, 2), 'utf8');
    } catch (err) {
      console.error('[WatchPulse] Failed to save window state:', err);
    }
  };

  if (immediate) {
    if (saveWindowStateTimer) {
      clearTimeout(saveWindowStateTimer);
      saveWindowStateTimer = null;
    }
    doWrite();
  } else {
    if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer);
    saveWindowStateTimer = setTimeout(doWrite, 500);
  }
}

function createWindow(): void {
  const isDev = process.env.NODE_ENV === 'development';
  const windowState = loadWindowState();
  lastKnownBounds = {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
  };

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x !== undefined && windowState.y !== undefined
      ? { x: windowState.x, y: windowState.y }
      : {}),
    minWidth: 1024,
    minHeight: 680,
    title: 'WatchPulse',
    backgroundColor: '#090B10',
    frame: false,
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
    if (windowState.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  mainWindow.on('resize', () => {
    saveWindowState(false);
  });

  mainWindow.on('move', () => {
    saveWindowState(false);
  });

  mainWindow.on('close', () => {
    saveWindowState(true);
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true);
    saveWindowState(false);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false);
    saveWindowState(false);
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
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.close();
    }
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
        if (!fileName || fileName === '.' || fileName === '..') {
          return new Response('Forbidden', { status: 403 });
        }
        const thumbsDir = getThumbnailsDir();
        targetPath = path.resolve(thumbsDir, fileName);
        if (!isInsideDir(targetPath, thumbsDir)) {
          return new Response('Forbidden', { status: 403 });
        }
      } else if (url.hostname === 'local') {
        const rawPath = url.searchParams.get('path') || '';
        if (!rawPath) {
          return new Response('Bad Request', { status: 400 });
        }
        targetPath = path.resolve(rawPath);
        const userDataDir = app.getPath('userData');
        if (!isInsideDir(targetPath, userDataDir)) {
          return new Response('Forbidden', { status: 403 });
        }
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
      if (!params || typeof params !== 'object') {
        return { canceled: true, error: 'Invalid export parameters.' };
      }
      const defaultName = typeof params.defaultName === 'string' ? params.defaultName : 'export';
      const content = typeof params.content === 'string' ? params.content : '';
      const extension =
        params.extension === 'csv' || params.extension === 'json' || params.extension === 'txt'
          ? params.extension
          : 'txt';

      const win = mainWindow ?? BrowserWindow.getFocusedWindow();
      const filterMap = {
        csv: [{ name: 'CSV Spreadsheet', extensions: ['csv'] }],
        json: [{ name: 'JSON Backup', extensions: ['json'] }],
        txt: [{ name: 'Text Summary', extensions: ['txt', 'md'] }],
      };

      const options: Electron.SaveDialogOptions = {
        title: 'Export Models',
        defaultPath: defaultName,
        filters: filterMap[extension] || [{ name: 'All Files', extensions: ['*'] }],
      };

      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      try {
        await fs.writeFile(result.filePath, content, 'utf-8');
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
        if (!fileName || fileName === '.' || fileName === '..') return false;
        const thumbsDir = getThumbnailsDir();
        const targetPath = path.resolve(thumbsDir, fileName);
        if (!isInsideDir(targetPath, thumbsDir)) {
          return false;
        }
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
      if (!params || (typeof params !== 'string' && typeof params !== 'object')) {
        return {
          ok: false,
          status: 0,
          latencyMs: 0,
          contentType: '',
          error: 'Invalid request parameters.',
        };
      }
      let rawUrl =
        typeof params === 'string'
          ? params
          : typeof params.url === 'string'
          ? params.url
          : '';
      if (!rawUrl) {
        return {
          ok: false,
          status: 0,
          latencyMs: 0,
          contentType: '',
          error: 'Invalid or missing URL parameter.',
        };
      }
      const authHeader =
        typeof params === 'object' && typeof params.authHeader === 'string'
          ? params.authHeader.trim()
          : '';

      // Auto-rewrite deprecated digitaloceanspaces & legacy cbexplorer URLs to Chaturbate native roomlist
      if (
        rawUrl.includes('digitaloceanspaces.com') ||
        rawUrl.includes('cbexplorer.com/cbexplorer_users_online_v3.json') ||
        rawUrl.includes('cbexplorer.com/api/cb_users_online_v3.json')
      ) {
        rawUrl =
          'https://chaturbate.com/api/ts/roomlist/room-list/?offset=0&limit=100';
      }

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
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WatchPulse/3.0',
        };
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        let res = await net.fetch(rawUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        // Graceful fallback to status bucket format if columnar file fails
        if (
          !res.ok &&
          rawUrl === 'https://cbexplorer.com/cbexplorer_users_online_v3.json'
        ) {
          try {
            res = await net.fetch(
              'https://cbexplorer.com/api/cb_users_online_v3.json',
              {
                method: 'GET',
                headers,
                signal: controller.signal,
              }
            );
          } catch {
            // keep original response
          }
        }

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
    'live:checkWatchlistModels',
    async (_event, usernames: string[]): Promise<Record<string, LiveRoomInfo>> => {
      const results: Record<string, LiveRoomInfo> = {};
      if (!Array.isArray(usernames) || usernames.length === 0) return results;

      const cleanUsernames = usernames
        .map((u) => String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, ''))
        .filter(Boolean);

      // Check up to 200 models in fast parallel batches to maintain snappy responsiveness
      const targetUsernames = cleanUsernames.slice(0, 200);

      const checkOne = async (username: string) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const embedUrl = `https://chaturbate.com/embed/${encodeURIComponent(username)}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black`;
          const res = await net.fetch(embedUrl, {
            method: 'GET',
            headers: {
              Accept: 'text/html,application/xhtml+xml',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WatchPulse/3.0',
            },
            signal: controller.signal,
          });
          if (!res.ok) return;
          const html = await res.text();
          const match = html.match(/window\.initialRoomDossier\s*=\s*"((?:\\.|[^"\\])*)"/);
          if (!match?.[1]) return;
          const rawJsonStr = JSON.parse(`"${match[1]}"`) as string;
          const dossier = JSON.parse(rawJsonStr) as {
            room_status?: string;
            hls_source?: string;
            num_users?: number;
            room_title?: string;
            tags?: string[];
          };
          if (
            dossier.room_status === 'public' ||
            dossier.room_status === 'private' ||
            dossier.room_status === 'away' ||
            Boolean(dossier.hls_source)
          ) {
            results[username] = {
              username,
              currentShow: (dossier.room_status || 'public').toLowerCase(),
              numUsers: typeof dossier.num_users === 'number' ? dossier.num_users : 0,
              roomSubject: dossier.room_title || '',
              tags: Array.isArray(dossier.tags) ? dossier.tags : [],
              isHd: false,
              imageUrl: `https://thumb.live.mmcdn.com/ri/${encodeURIComponent(username)}.jpg`,
              iframeEmbed: '',
              lastCheckedAt: new Date().toISOString(),
            };
          }
        } catch {
          // ignore individual timeout/fetch error
        } finally {
          clearTimeout(timer);
        }
      };

      const concurrency = 6;
      for (let i = 0; i < targetUsernames.length; i += concurrency) {
        const batch = targetUsernames.slice(i, i + concurrency);
        await Promise.all(batch.map((u) => checkOne(u)));
      }

      return results;
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
        const match = html.match(/window\.initialRoomDossier\s*=\s*"((?:\\.|[^"\\])*)"/);
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

  ipcMain.handle('pip:open', async (_event, params: PipParams): Promise<PipState> => {
    if (!params || typeof params !== 'object') {
      return { isOpen: false, username: null };
    }
    return openPipWindow(params);
  });

  ipcMain.handle('pip:close', async (): Promise<boolean> => {
    return closePipWindow();
  });

  ipcMain.handle('pip:toggle', async (_event, params: PipParams): Promise<PipState> => {
    if (!params || typeof params !== 'object') {
      return { isOpen: false, username: null };
    }
    const clean = String(params.username || '').trim().toLowerCase();
    if (pipWindow && !pipWindow.isDestroyed() && currentPipUsername === clean) {
      closePipWindow();
      return { isOpen: false, username: null };
    }
    return openPipWindow(params);
  });

  ipcMain.handle('pip:getState', async (): Promise<PipState> => {
    return {
      isOpen: Boolean(pipWindow && !pipWindow.isDestroyed()),
      username: currentPipUsername,
    };
  });

  ipcMain.handle('pip:focusMainWindow', async (): Promise<void> => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Window Controls (iMac Style / Custom Title Bar)
  ipcMain.handle('window:minimize', async (): Promise<void> => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window:maximize', async (): Promise<boolean> => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  });

  ipcMain.handle('window:close', async (): Promise<void> => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('window:isMaximized', async (): Promise<boolean> => {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
  });
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

app.on('before-quit', () => {
  saveWindowState(true);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
