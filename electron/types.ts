export interface TierDefinition {
  id: string;
  name: string;
  color: string;
  hotkey: string;
  order: number;
  description?: string;
  reviewCadenceDays?: number;
}

export interface InboxConfig {
  id: 'inbox';
  name: string;
  color: string;
  hotkey: string;
}

export interface CustomLink {
  id: string;
  label: string;
  url: string;
}

export interface ManualActivityStats {
  monthlyHours?: number;
  avgHoursPerDay?: number;
  usualSchedule?: string;
}

export interface ModelRecord {
  id: string;
  username: string;
  displayName: string;
  originalLink: string;
  tierId: string;
  order: number;
  cbexplorerAdded: boolean;
  thumbnail: string;
  notes: string;
  tags: string[];
  customLinks: CustomLink[];
  createdAt: string;
  updatedAt: string;
  lastReviewedAt?: string;
  lastSeenLiveAt?: string;
  presenceHours?: Record<string, number>;
  activitySyncedAt?: string;
  manualActivityStats?: ManualActivityStats;
  deletedAt?: string;
  deletedFromTierId?: string;
}

export interface UrlTemplates {
  cbhours: string;
  cbexplorer: string;
  archivebate: string;
  livePreview: string;
}

export interface LiveFeedConfig {
  enabled: boolean;
  endpointTemplate: string;
  affiliateWm: string;
  authHeader?: string;
  refreshIntervalSec: number;
  maxPages: number;
  autoRefreshSnapshots: boolean;
}

export type ThemeMode = 'dark' | 'grey' | 'light';

export interface AppSettings {
  confirmDelete: boolean;
  deckSourceFilter: string;
  showKeyboardHints: boolean;
  themeMode?: ThemeMode;
  defaultReviewCadenceDays: number;
  staleOfflineDays: number;
  trashRetentionDays: number;
  urlTemplates: UrlTemplates;
  liveFeed: LiveFeedConfig;
}

export interface AppData {
  version: number;
  inbox: InboxConfig;
  tiers: TierDefinition[];
  models: ModelRecord[];
  trashedModels?: ModelRecord[];
  settings: AppSettings;
}

export interface OpenFileResult {
  canceled: boolean;
  filePath?: string;
  content?: string;
}

export interface OpenImageResult {
  canceled: boolean;
  mediaUrl?: string;
  originalPath?: string;
}

export interface SaveFileResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface LiveFetchResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  contentType: string;
  data?: unknown;
  error?: string;
  rawSnippet?: string;
}

export interface LiveStreamResolveResult {
  ok: boolean;
  hlsUrl?: string;
  roomStatus?: string;
  numViewers?: number;
  error?: string;
}

export interface AppInfo {
  version: string;
  dataFilePath: string;
  userDataPath: string;
  thumbnailsPath: string;
  platform: string;
}
