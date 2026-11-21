import { contextBridge, ipcRenderer } from 'electron';
import {
  AppData,
  AppInfo,
  LiveFetchResult,
  LiveStreamResolveResult,
  OpenFileResult,
  OpenImageResult,
  SaveFileResult,
} from './types';

// Prevent MaxListenersExceededWarning when 16+ streams or listeners are active
ipcRenderer.setMaxListeners(50);

const electronAPI = {
  loadData: (): Promise<AppData> => ipcRenderer.invoke('store:load'),
  saveData: (data: AppData): Promise<AppData> => ipcRenderer.invoke('store:save', data),
  saveDataSync: (data: AppData): boolean =>
    Boolean(ipcRenderer.sendSync('store:saveSync', data)),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:openExternal', url),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('shell:openDataFolder'),
  openCsvFile: (): Promise<OpenFileResult> => ipcRenderer.invoke('dialog:openCsvFile'),
  openJsonBackup: (): Promise<OpenFileResult> =>
    ipcRenderer.invoke('dialog:openJsonBackup'),
  openImageFile: (): Promise<OpenImageResult> =>
    ipcRenderer.invoke('dialog:openImageFile'),
  saveExportFile: (params: {
    defaultName: string;
    content: string;
    extension: 'csv' | 'json' | 'txt';
  }): Promise<SaveFileResult> => ipcRenderer.invoke('dialog:saveExportFile', params),
  copyText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('clipboard:writeText', text),
  readClipboardText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
  fetchLiveJson: (url: string, authHeader?: string): Promise<LiveFetchResult> =>
    ipcRenderer.invoke('live:fetchJson', { url, authHeader }),
  checkWatchlistModels: (usernames: string[]): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('live:checkWatchlistModels', usernames),
  resolveLiveStream: (username: string): Promise<LiveStreamResolveResult> =>
    ipcRenderer.invoke('live:resolveStream', username),
  deleteThumbnail: (mediaUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('media:deleteThumbnail', mediaUrl),
  openPip: (params: {
    username: string;
    muted?: boolean;
    videoOnly?: boolean;
    embedTemplate?: string;
  }) => ipcRenderer.invoke('pip:open', params),
  closePip: (): Promise<boolean> => ipcRenderer.invoke('pip:close'),
  togglePip: (params: {
    username: string;
    muted?: boolean;
    videoOnly?: boolean;
    embedTemplate?: string;
  }) => ipcRenderer.invoke('pip:toggle', params),
  getPipState: () => ipcRenderer.invoke('pip:getState'),
  focusMainWindow: (): Promise<void> => ipcRenderer.invoke('pip:focusMainWindow'),
  onPipStateChanged: (callback: (state: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on('pip:stateChanged', handler);
    return () => ipcRenderer.removeListener('pip:stateChanged', handler);
  },
  onPipNavigate: (callback: (params: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, params: unknown) => callback(params);
    ipcRenderer.on('pip:navigate', handler);
    return () => ipcRenderer.removeListener('pip:navigate', handler);
  },
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) =>
      callback(isMaximized);
    ipcRenderer.on('window:maximize-change', handler);
    return () => ipcRenderer.removeListener('window:maximize-change', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
