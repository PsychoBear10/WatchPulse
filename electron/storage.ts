import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AppData,
  LiveFeedConfig,
  ManualActivityStats,
  ModelRecord,
  UrlTemplates,
} from './types';

export const DATA_FILE_NAME = 'watchpulse-data.json';
export const BACKUP_FILE_NAME = 'watchpulse-data.bak.json';
export const LEGACY_DATA_FILE_NAME = 'modelsort-data.json';
export const LEGACY_BACKUP_FILE_NAME = 'modelsort-data.bak.json';

export const DEFAULT_URL_TEMPLATES: UrlTemplates = {
  cbhours: 'https://www.cbhours.com/user/{username}.html',
  cbexplorer: 'https://cbexplorer.com/{username}',
  archivebate: 'https://archivebate.com/profile/{username}',
  livePreview:
    'https://chaturbate.com/embed/{username}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black',
};

const LEGACY_DEFAULT_LIVE_PREVIEW_TEMPLATES = new Set([
  'https://chaturbate.com/embed/{username}/?disable_sound=1&bgcolor=black',
  'https://chaturbate.com/embed/{username}/?embed_video_only=1&disable_sound=1&bgcolor=black',
]);

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

const LEGACY_DEFAULT_FEED_TEMPLATES = new Set([
  'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&format=json&limit=500&offset={offset}',
  'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&format=json&limit={limit}&offset={offset}',
  'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&client_ip=request_ip&format=json&limit={limit}&offset={offset}',
]);

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

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidIsoTimestamp(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0 && Number.isFinite(Date.parse(val));
}

function sanitizeHotkeyValue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || trimmed.length !== 1 || trimmed === 'Z') {
    return '';
  }
  return trimmed;
}

function isValidPresenceBucket(bucket: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(bucket);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23) {
    return false;
  }
  const dt = new Date(year, month - 1, day, hour, 0, 0, 0);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

function sanitizeModelRecord(
  m: Record<string, unknown>,
  idx: number,
  validTierIds: Set<string>,
  now: string
): ModelRecord {
  const tierId =
    typeof m.tierId === 'string' && validTierIds.has(m.tierId)
      ? m.tierId
      : 'inbox';

  const tags = Array.isArray(m.tags)
    ? m.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const customLinks = Array.isArray(m.customLinks)
    ? m.customLinks
        .filter(isRecord)
        .filter(
          (link) => typeof link.url === 'string' && link.url.trim().length > 0
        )
        .map((link, linkIdx) => ({
          id:
            typeof link.id === 'string' && link.id
              ? link.id
              : `link_${idx}_${linkIdx}`,
          label:
            typeof link.label === 'string' && link.label.trim()
              ? link.label.trim()
              : 'Recording',
          url: (link.url as string).trim(),
        }))
    : [];

  let presenceHours: Record<string, number> | undefined;
  if (isRecord(m.presenceHours)) {
    const cleaned: Record<string, number> = {};
    for (const [bucket, mins] of Object.entries(m.presenceHours)) {
      if (
        isValidPresenceBucket(bucket) &&
        typeof mins === 'number' &&
        Number.isFinite(mins) &&
        mins > 0
      ) {
        cleaned[bucket] = Math.min(60, mins);
      }
    }
    if (Object.keys(cleaned).length > 0) {
      presenceHours = cleaned;
    }
  }

  let manualActivityStats: ManualActivityStats | undefined;
  if (isRecord(m.manualActivityStats)) {
    const ms = m.manualActivityStats;
    const cleanedStats: ManualActivityStats = {
      monthlyHours:
        typeof ms.monthlyHours === 'number' && Number.isFinite(ms.monthlyHours)
          ? Math.max(0, ms.monthlyHours)
          : undefined,
      avgHoursPerDay:
        typeof ms.avgHoursPerDay === 'number' &&
        Number.isFinite(ms.avgHoursPerDay)
          ? Math.max(0, ms.avgHoursPerDay)
          : undefined,
      usualSchedule:
        typeof ms.usualSchedule === 'string' && ms.usualSchedule.trim()
          ? ms.usualSchedule.trim()
          : undefined,
    };
    if (
      cleanedStats.monthlyHours !== undefined ||
      cleanedStats.avgHoursPerDay !== undefined ||
      cleanedStats.usualSchedule !== undefined
    ) {
      manualActivityStats = cleanedStats;
    }
  }

  return {
    id:
      typeof m.id === 'string' && m.id.trim() ? m.id.trim() : `model_${idx}`,
    username: typeof m.username === 'string' ? m.username.trim() : '',
    displayName: typeof m.displayName === 'string' ? m.displayName : '',
    originalLink: typeof m.originalLink === 'string' ? m.originalLink : '',
    tierId,
    order:
      typeof m.order === 'number' && Number.isFinite(m.order) ? m.order : idx,
    cbexplorerAdded: Boolean(m.cbexplorerAdded),
    thumbnail: typeof m.thumbnail === 'string' ? m.thumbnail : '',
    notes: typeof m.notes === 'string' ? m.notes : '',
    tags,
    customLinks,
    createdAt: isValidIsoTimestamp(m.createdAt) ? m.createdAt : now,
    updatedAt: isValidIsoTimestamp(m.updatedAt) ? m.updatedAt : now,
    lastReviewedAt: isValidIsoTimestamp(m.lastReviewedAt)
      ? m.lastReviewedAt
      : undefined,
    lastSeenLiveAt: isValidIsoTimestamp(m.lastSeenLiveAt)
      ? m.lastSeenLiveAt
      : undefined,
    presenceHours,
    activitySyncedAt: isValidIsoTimestamp(m.activitySyncedAt)
      ? m.activitySyncedAt
      : undefined,
    manualActivityStats,
    deletedAt: isValidIsoTimestamp(m.deletedAt) ? m.deletedAt : undefined,
    deletedFromTierId:
      typeof m.deletedFromTierId === 'string' ? m.deletedFromTierId : undefined,
  };
}

export function sanitizeAppData(raw: unknown): AppData {
  const defaults = createDefaultAppData();
  if (!isRecord(raw)) {
    return defaults;
  }

  const usedHotkeys = new Set<string>();
  const inboxRaw = isRecord(raw.inbox) ? raw.inbox : {};
  const rawInboxKey =
    inboxRaw.hotkey !== undefined
      ? sanitizeHotkeyValue(inboxRaw.hotkey)
      : defaults.inbox.hotkey;
  if (rawInboxKey) {
    usedHotkeys.add(rawInboxKey);
  }
  const inbox = {
    id: 'inbox' as const,
    name:
      typeof inboxRaw.name === 'string' && inboxRaw.name.trim()
        ? inboxRaw.name.trim()
        : defaults.inbox.name,
    color:
      typeof inboxRaw.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(inboxRaw.color)
        ? inboxRaw.color
        : defaults.inbox.color,
    hotkey: rawInboxKey,
  };

  const seenTierIds = new Set<string>(['inbox']);
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers
        .filter(isRecord)
        .map((t, idx) => {
          const baseId =
            typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `tier_${idx}`;
          const uniqueId = seenTierIds.has(baseId) ? `${baseId}_${idx}` : baseId;
          seenTierIds.add(uniqueId);

          let hotkey = sanitizeHotkeyValue(t.hotkey);
          if (hotkey && usedHotkeys.has(hotkey)) {
            hotkey = '';
          } else if (hotkey) {
            usedHotkeys.add(hotkey);
          }

          return {
            id: uniqueId,
            name:
              typeof t.name === 'string' && t.name.trim()
                ? t.name.trim()
                : `Tier ${idx + 1}`,
            color:
              typeof t.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(t.color)
                ? t.color
                : '#6366F1',
            hotkey,
            order:
              typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : idx,
            description: typeof t.description === 'string' ? t.description : '',
            reviewCadenceDays:
              typeof t.reviewCadenceDays === 'number' &&
              Number.isFinite(t.reviewCadenceDays) &&
              t.reviewCadenceDays >= 0
                ? t.reviewCadenceDays
                : undefined,
          };
        })
        .sort((a, b) => a.order - b.order)
        .map((t, idx) => ({ ...t, order: idx }))
    : defaults.tiers;

  const validTierIds = new Set(tiers.map((t) => t.id));
  validTierIds.add('inbox');

  const now = new Date().toISOString();
  const seenModelIds = new Set<string>();
  const seenUsernames = new Set<string>();
  const models: ModelRecord[] = [];

  if (Array.isArray(raw.models)) {
    raw.models.filter(isRecord).forEach((m, idx) => {
      const sanitized = sanitizeModelRecord(m, idx, validTierIds, now);
      if (!sanitized.username) return;
      const unameKey = sanitized.username.toLowerCase();
      if (seenUsernames.has(unameKey)) return;
      seenUsernames.add(unameKey);

      const uniqueId = seenModelIds.has(sanitized.id)
        ? `${sanitized.id}_${idx}`
        : sanitized.id;
      seenModelIds.add(uniqueId);
      models.push(
        uniqueId === sanitized.id ? sanitized : { ...sanitized, id: uniqueId }
      );
    });
  }

  const settingsRaw = isRecord(raw.settings) ? raw.settings : {};
  const templatesRaw = isRecord(settingsRaw.urlTemplates)
    ? settingsRaw.urlTemplates
    : {};
  const liveFeedRaw = isRecord(settingsRaw.liveFeed) ? settingsRaw.liveFeed : {};

  const trashRetentionDays =
    typeof settingsRaw.trashRetentionDays === 'number' &&
    Number.isFinite(settingsRaw.trashRetentionDays) &&
    settingsRaw.trashRetentionDays >= 1
      ? Math.round(settingsRaw.trashRetentionDays)
      : 45;

  const retentionCutoffMs =
    Date.now() - trashRetentionDays * 24 * 60 * 60 * 1000;

  const trashedModels: ModelRecord[] = [];
  if (Array.isArray(raw.trashedModels)) {
    raw.trashedModels.filter(isRecord).forEach((m, idx) => {
      const sanitized = sanitizeModelRecord(m, idx, validTierIds, now);
      if (!sanitized.username) return;
      const unameKey = sanitized.username.toLowerCase();
      if (seenUsernames.has(unameKey)) return;
      if (sanitized.deletedAt) {
        const deletedMs = Date.parse(sanitized.deletedAt);
        if (Number.isFinite(deletedMs) && deletedMs <= retentionCutoffMs) {
          return;
        }
      }
      seenUsernames.add(unameKey);
      const uniqueId = seenModelIds.has(sanitized.id)
        ? `${sanitized.id}_tr_${idx}`
        : sanitized.id;
      seenModelIds.add(uniqueId);
      trashedModels.push(
        uniqueId === sanitized.id ? sanitized : { ...sanitized, id: uniqueId }
      );
    });
  }

  const settings = {
    confirmDelete:
      typeof settingsRaw.confirmDelete === 'boolean'
        ? settingsRaw.confirmDelete
        : true,
    deckSourceFilter:
      typeof settingsRaw.deckSourceFilter === 'string'
        ? settingsRaw.deckSourceFilter
        : 'inbox',
    showKeyboardHints:
      typeof settingsRaw.showKeyboardHints === 'boolean'
        ? settingsRaw.showKeyboardHints
        : true,
    defaultReviewCadenceDays:
      typeof settingsRaw.defaultReviewCadenceDays === 'number' &&
      Number.isFinite(settingsRaw.defaultReviewCadenceDays) &&
      settingsRaw.defaultReviewCadenceDays >= 0
        ? settingsRaw.defaultReviewCadenceDays
        : 14,
    staleOfflineDays:
      typeof settingsRaw.staleOfflineDays === 'number' &&
      Number.isFinite(settingsRaw.staleOfflineDays) &&
      settingsRaw.staleOfflineDays >= 0
        ? settingsRaw.staleOfflineDays
        : 30,
    trashRetentionDays,
    urlTemplates: {
      cbhours:
        typeof templatesRaw.cbhours === 'string' && templatesRaw.cbhours.trim()
          ? templatesRaw.cbhours.trim()
          : DEFAULT_URL_TEMPLATES.cbhours,
      cbexplorer:
        typeof templatesRaw.cbexplorer === 'string' &&
        templatesRaw.cbexplorer.trim()
          ? templatesRaw.cbexplorer.trim()
          : DEFAULT_URL_TEMPLATES.cbexplorer,
      archivebate:
        typeof templatesRaw.archivebate === 'string' &&
        templatesRaw.archivebate.trim()
          ? templatesRaw.archivebate.trim()
          : DEFAULT_URL_TEMPLATES.archivebate,
      livePreview:
        typeof templatesRaw.livePreview === 'string' &&
        templatesRaw.livePreview.trim()
          ? LEGACY_DEFAULT_LIVE_PREVIEW_TEMPLATES.has(
              templatesRaw.livePreview.trim()
            )
            ? DEFAULT_URL_TEMPLATES.livePreview
            : templatesRaw.livePreview.trim()
          : DEFAULT_URL_TEMPLATES.livePreview,
    },
    liveFeed: {
      enabled:
        typeof liveFeedRaw.enabled === 'boolean'
          ? liveFeedRaw.enabled
          : DEFAULT_LIVE_FEED.enabled,
      endpointTemplate: (() => {
        const rawTpl =
          typeof liveFeedRaw.endpointTemplate === 'string'
            ? liveFeedRaw.endpointTemplate.trim()
            : '';
        const wmVal =
          typeof liveFeedRaw.affiliateWm === 'string'
            ? liveFeedRaw.affiliateWm.trim()
            : '';
        if (!rawTpl) return DEFAULT_LIVE_FEED.endpointTemplate;
        if (LEGACY_DEFAULT_FEED_TEMPLATES.has(rawTpl)) {
          return wmVal
            ? 'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&client_ip=request_ip&format=json&limit={limit}&offset={offset}'
            : DEFAULT_LIVE_FEED.endpointTemplate;
        }
        return rawTpl;
      })(),
      affiliateWm:
        typeof liveFeedRaw.affiliateWm === 'string'
          ? liveFeedRaw.affiliateWm.trim()
          : DEFAULT_LIVE_FEED.affiliateWm,
      authHeader:
        typeof liveFeedRaw.authHeader === 'string'
          ? liveFeedRaw.authHeader.trim()
          : DEFAULT_LIVE_FEED.authHeader,
      refreshIntervalSec:
        typeof liveFeedRaw.refreshIntervalSec === 'number' &&
        Number.isFinite(liveFeedRaw.refreshIntervalSec) &&
        liveFeedRaw.refreshIntervalSec >= 10
          ? Math.round(liveFeedRaw.refreshIntervalSec)
          : DEFAULT_LIVE_FEED.refreshIntervalSec,
      maxPages:
        typeof liveFeedRaw.maxPages === 'number' &&
        Number.isFinite(liveFeedRaw.maxPages) &&
        liveFeedRaw.maxPages >= 1
          ? Math.min(25, Math.round(liveFeedRaw.maxPages))
          : DEFAULT_LIVE_FEED.maxPages,
      autoRefreshSnapshots:
        typeof liveFeedRaw.autoRefreshSnapshots === 'boolean'
          ? liveFeedRaw.autoRefreshSnapshots
          : DEFAULT_LIVE_FEED.autoRefreshSnapshots,
    },
  };

  const version =
    typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 1
      ? raw.version
      : 1;

  return {
    version,
    inbox,
    tiers,
    models,
    trashedModels,
    settings,
  };
}

export class JsonStorageService {
  private readonly filePath: string;
  private readonly backupPath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private writeSeq = 0;

  constructor(
    private readonly userDataDir: string,
    private readonly legacyUserDataDirs: string[] = []
  ) {
    this.filePath = path.join(userDataDir, DATA_FILE_NAME);
    this.backupPath = path.join(userDataDir, BACKUP_FILE_NAME);
  }

  public getDataFilePath(): string {
    return this.filePath;
  }

  private async isValidJsonFile(targetPath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const parsed = JSON.parse(content);
      return isRecord(parsed);
    } catch {
      return false;
    }
  }

  private isValidJsonFileSync(targetPath: string): boolean {
    try {
      const content = fsSync.readFileSync(targetPath, 'utf-8');
      const parsed = JSON.parse(content);
      return isRecord(parsed);
    } catch {
      return false;
    }
  }

  private async writePrimaryOnly(clean: AppData): Promise<void> {
    await fs.mkdir(this.userDataDir, { recursive: true });
    const serialized = JSON.stringify(clean, null, 2);
    const tempPath = `${this.filePath}.${Date.now()}.${++this.writeSeq}.tmp`;
    try {
      await fs.writeFile(tempPath, serialized, 'utf-8');
      await fs.rename(tempPath, this.filePath);
    } catch (err) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  private async migrateLegacyIfNeeded(): Promise<void> {
    try {
      await fs.access(this.filePath);
      return; // Current watchpulse-data.json already exists
    } catch {
      // Proceed to check legacy paths
    }

    const candidateDirs = [this.userDataDir, ...this.legacyUserDataDirs];
    for (const dir of candidateDirs) {
      if (!dir) continue;
      const legacyPrimary = path.join(dir, LEGACY_DATA_FILE_NAME);
      const legacyBackup = path.join(dir, LEGACY_BACKUP_FILE_NAME);
      try {
        await fs.access(legacyPrimary);
        await fs.copyFile(legacyPrimary, this.filePath);
        try {
          await fs.access(legacyBackup);
          await fs.copyFile(legacyBackup, this.backupPath);
        } catch {
          // Optional legacy backup
        }

        // Copy cached thumbnails if migrating from a separate legacy directory
        if (path.resolve(dir) !== path.resolve(this.userDataDir)) {
          const legacyThumbs = path.join(dir, 'thumbnails');
          const targetThumbs = path.join(this.userDataDir, 'thumbnails');
          try {
            const entries = await fs.readdir(legacyThumbs, { withFileTypes: true });
            await fs.mkdir(targetThumbs, { recursive: true });
            for (const entry of entries) {
              if (entry.isFile()) {
                const destFile = path.join(targetThumbs, entry.name);
                try {
                  await fs.access(destFile);
                } catch {
                  await fs.copyFile(path.join(legacyThumbs, entry.name), destFile);
                }
              }
            }
          } catch {
            // No legacy thumbnails folder
          }
        }
        return;
      } catch {
        // Legacy primary file not in this candidate dir
      }
    }
  }

  public async load(): Promise<AppData> {
    await fs.mkdir(this.userDataDir, { recursive: true });
    await this.migrateLegacyIfNeeded();
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return sanitizeAppData(parsed);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        const initial = createDefaultAppData();
        await this.save(initial);
        return initial;
      }

      // Attempt recovery from backup file if primary JSON is corrupted
      try {
        const backupContent = await fs.readFile(this.backupPath, 'utf-8');
        const parsedBackup = JSON.parse(backupContent);
        const repaired = sanitizeAppData(parsedBackup);
        await this.writePrimaryOnly(repaired).catch(() => {});
        return repaired;
      } catch {
        // Preserve corrupted non-empty primary file for manual inspection before resetting
        try {
          const stat = await fs.stat(this.filePath);
          if (stat.isFile() && stat.size > 0) {
            await fs.copyFile(
              this.filePath,
              `${this.filePath}.corrupt-${Date.now()}.bak`
            );
          }
        } catch {
          // ignore if primary was missing or unreadable
        }
        const fallback = createDefaultAppData();
        await this.save(fallback);
        return fallback;
      }
    }
  }

  public async save(data: AppData): Promise<AppData> {
    const clean = sanitizeAppData(data);
    const runWrite = async () => {
      await fs.mkdir(this.userDataDir, { recursive: true });
      const serialized = JSON.stringify(clean, null, 2);
      const tempPath = `${this.filePath}.${Date.now()}.${++this.writeSeq}.tmp`;

      try {
        await fs.writeFile(tempPath, serialized, 'utf-8');

        // Rotate current file to backup only if current primary is valid JSON
        if (await this.isValidJsonFile(this.filePath)) {
          try {
            await fs.copyFile(this.filePath, this.backupPath);
          } catch {
            // Backup copy failure shouldn't abort saving primary
          }
        }

        await fs.rename(tempPath, this.filePath);
      } catch (err) {
        await fs.rm(tempPath, { force: true }).catch(() => {});
        throw err;
      }
    };

    const currentWrite = this.writeQueue.catch(() => {}).then(runWrite);
    this.writeQueue = currentWrite.catch(() => {});
    await currentWrite;
    return clean;
  }

  public saveSync(data: AppData): AppData {
    const clean = sanitizeAppData(data);
    fsSync.mkdirSync(this.userDataDir, { recursive: true });
    const serialized = JSON.stringify(clean, null, 2);
    const tempPath = `${this.filePath}.${Date.now()}.${++this.writeSeq}.sync.tmp`;
    try {
      fsSync.writeFileSync(tempPath, serialized, 'utf-8');
      if (this.isValidJsonFileSync(this.filePath)) {
        try {
          fsSync.copyFileSync(this.filePath, this.backupPath);
        } catch {
          // Optional backup copy
        }
      }
      fsSync.renameSync(tempPath, this.filePath);
    } catch (err) {
      try {
        fsSync.rmSync(tempPath, { force: true });
      } catch {
        // ignore cleanup failure
      }
      throw err;
    }
    return clean;
  }
}
