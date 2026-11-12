import {
  AppData,
  AppInfo,
  LiveFetchResult,
  LiveFeedConfig,
  LiveStreamResolveResult,
  OpenFileResult,
  OpenImageResult,
  SaveFileResult,
  UrlTemplates,
} from '../types/models';

const LOCAL_STORAGE_KEY = 'watchpulse_fallback_v1';
const LEGACY_LOCAL_STORAGE_KEY = 'modelsort_studio_fallback_v1';

export const DEFAULT_URL_TEMPLATES: UrlTemplates = {
  cbhours: 'https://www.cbhours.com/user/{username}.html',
  cbexplorer: 'https://cbexplorer.com/{username}',
  archivebate: 'https://archivebate.com/profile/{username}',
  livePreview:
    'https://chaturbate.com/embed/{username}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black',
};

export const DEFAULT_LIVE_FEED: LiveFeedConfig = {
  enabled: true,
  endpointTemplate:
    'https://cbexplorer.nyc3.cdn.digitaloceanspaces.com/cbexplorer_users_online_v3.json',
  affiliateWm: '',
  authHeader: '',
  refreshIntervalSec: 45,
  maxPages: 5,
  autoRefreshSnapshots: true,
};

export function createDefaultAppData(): AppData {
  return {
    version: 2,
    inbox: {
      id: 'inbox',
      name: 'Unsorted / Inbox',
      color: '#94A3B8',
      hotkey: '0',
    },
    tiers: [
      {
        id: 'tier_priority_1',
        name: 'Priority 1',
        color: '#F43F5E',
        hotkey: '1',
        order: 0,
        description: 'Top-priority models to monitor closely',
        reviewCadenceDays: 7,
      },
      {
        id: 'tier_priority_2',
        name: 'Priority 2',
        color: '#F59E0B',
        hotkey: '2',
        order: 1,
        description: 'Strong favorites and frequent streams',
        reviewCadenceDays: 14,
      },
      {
        id: 'tier_watchlist',
        name: 'Watchlist',
        color: '#10B981',
        hotkey: 'W',
        order: 2,
        description: 'Active discovery and schedule tracking',
        reviewCadenceDays: 21,
      },
      {
        id: 'tier_backlog',
        name: 'Backlog',
        color: '#6366F1',
        hotkey: 'B',
        order: 3,
        description: 'Review later when time permits',
        reviewCadenceDays: 30,
      },
      {
        id: 'tier_inactive',
        name: 'Inactive',
        color: '#64748B',
        hotkey: 'X',
        order: 4,
        description: 'Archived or rarely online',
        reviewCadenceDays: 0,
      },
    ],
    models: [],
    trashedModels: [],
    settings: {
      confirmDelete: true,
      deckSourceFilter: 'inbox',
      showKeyboardHints: true,
      defaultReviewCadenceDays: 14,
      staleOfflineDays: 30,
      trashRetentionDays: 45,
      urlTemplates: { ...DEFAULT_URL_TEMPLATES },
      liveFeed: { ...DEFAULT_LIVE_FEED },
    },
  };
}

export const desktopBridge = {
  isElectron(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI);
  },

  async loadData(): Promise<AppData> {
    if (window.electronAPI) {
      return window.electronAPI.loadData();
    }
    try {
      const raw =
        localStorage.getItem(LOCAL_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as AppData;
      }
    } catch {
      // ignore corrupted fallback storage
    }
    const defaults = createDefaultAppData();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  },

  async saveData(data: AppData): Promise<AppData> {
    if (window.electronAPI) {
      return window.electronAPI.saveData(data);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    return data;
  },

  saveDataSync(data: AppData): boolean {
    if (window.electronAPI?.saveDataSync) {
      return window.electronAPI.saveDataSync(data);
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  async openExternal(url: string): Promise<boolean> {
    if (!url) return false;
    if (window.electronAPI) {
      return window.electronAPI.openExternal(url);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },

  async openDataFolder(): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.openDataFolder();
    }
  },

  async openCsvFile(): Promise<OpenFileResult> {
    if (window.electronAPI) {
      return window.electronAPI.openCsvFile();
    }
    return { canceled: true };
  },

  async openJsonBackup(): Promise<OpenFileResult> {
    if (window.electronAPI) {
      return window.electronAPI.openJsonBackup();
    }
    return { canceled: true };
  },

  async openImageFile(): Promise<OpenImageResult> {
    if (window.electronAPI) {
      return window.electronAPI.openImageFile();
    }
    return { canceled: true };
  },

  async saveExportFile(params: {
    defaultName: string;
    content: string;
    extension: 'csv' | 'json' | 'txt';
  }): Promise<SaveFileResult> {
    if (window.electronAPI) {
      return window.electronAPI.saveExportFile(params);
    }
    const blob = new Blob([params.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = params.defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return { canceled: false, filePath: params.defaultName };
  },

  async copyText(text: string): Promise<boolean> {
    if (window.electronAPI) {
      return window.electronAPI.copyText(text);
    }
    await navigator.clipboard.writeText(text);
    return true;
  },

  async readClipboardText(): Promise<string> {
    if (window.electronAPI) {
      return window.electronAPI.readClipboardText();
    }
    return navigator.clipboard.readText();
  },

  async getAppInfo(): Promise<AppInfo> {
    if (window.electronAPI) {
      return window.electronAPI.getAppInfo();
    }
    return {
      version: '1.0.0-web',
      dataFilePath: 'Browser localStorage',
      userDataPath: '',
      thumbnailsPath: '',
      platform: 'browser',
    };
  },

  async fetchLiveJson(url: string, authHeader?: string): Promise<LiveFetchResult> {
    if (window.electronAPI) {
      return window.electronAPI.fetchLiveJson(url, authHeader);
    }
    const started = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (authHeader?.trim()) {
        headers.Authorization = authHeader.trim();
      }
      const res = await fetch(url, { headers });
      const data = await res.json();
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - started,
        contentType: res.headers.get('content-type') || '',
        data,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        latencyMs: Date.now() - started,
        contentType: '',
        error: err instanceof Error ? err.message : 'Fetch failed',
      };
    }
  },

  async resolveLiveStream(username: string): Promise<LiveStreamResolveResult> {
    if (window.electronAPI) {
      return window.electronAPI.resolveLiveStream(username);
    }
    return {
      ok: false,
      error: 'Direct HLS stream resolver requires WatchPulse desktop app.',
    };
  },

  async deleteThumbnail(mediaUrl: string): Promise<boolean> {
    if (window.electronAPI) {
      return window.electronAPI.deleteThumbnail(mediaUrl);
    }
    return false;
  },
};
