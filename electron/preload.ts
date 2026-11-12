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
  resolveLiveStream: (username: string): Promise<LiveStreamResolveResult> =>
    ipcRenderer.invoke('live:resolveStream', username),
  deleteThumbnail: (mediaUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('media:deleteThumbnail', mediaUrl),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
