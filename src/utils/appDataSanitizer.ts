import { DEFAULT_LIVE_FEED, DEFAULT_URL_TEMPLATES, createDefaultAppData } from '../services/bridge';
import { AppData, AppSettings, ManualActivityStats, ModelRecord } from '../types/models';

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidIsoTimestamp(val: unknown): val is string {
  return (
    typeof val === 'string' &&
    val.trim().length > 0 &&
    Number.isFinite(Date.parse(val))
  );
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

export function sanitizeClientSettings(
  raw: unknown,
  fallbackSettings: AppSettings = createDefaultAppData().settings
): AppSettings {
  const settingsRaw = isRecord(raw) ? raw : {};
  const templatesRaw = isRecord(settingsRaw.urlTemplates)
    ? settingsRaw.urlTemplates
    : {};
  const liveFeedRaw = isRecord(settingsRaw.liveFeed) ? settingsRaw.liveFeed : {};

  return {
    confirmDelete:
      typeof settingsRaw.confirmDelete === 'boolean'
        ? settingsRaw.confirmDelete
        : fallbackSettings.confirmDelete,
    deckSourceFilter:
      typeof settingsRaw.deckSourceFilter === 'string'
        ? settingsRaw.deckSourceFilter
        : fallbackSettings.deckSourceFilter,
    showKeyboardHints:
      typeof settingsRaw.showKeyboardHints === 'boolean'
        ? settingsRaw.showKeyboardHints
        : fallbackSettings.showKeyboardHints,
    defaultReviewCadenceDays:
      typeof settingsRaw.defaultReviewCadenceDays === 'number' &&
      Number.isFinite(settingsRaw.defaultReviewCadenceDays) &&
      settingsRaw.defaultReviewCadenceDays >= 0
        ? settingsRaw.defaultReviewCadenceDays
        : fallbackSettings.defaultReviewCadenceDays,
    staleOfflineDays:
      typeof settingsRaw.staleOfflineDays === 'number' &&
      Number.isFinite(settingsRaw.staleOfflineDays) &&
      settingsRaw.staleOfflineDays >= 0
        ? settingsRaw.staleOfflineDays
        : fallbackSettings.staleOfflineDays,
    trashRetentionDays:
      typeof settingsRaw.trashRetentionDays === 'number' &&
      Number.isFinite(settingsRaw.trashRetentionDays) &&
      settingsRaw.trashRetentionDays >= 1
        ? Math.round(settingsRaw.trashRetentionDays)
        : fallbackSettings.trashRetentionDays,
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
          ? templatesRaw.livePreview.trim()
          : DEFAULT_URL_TEMPLATES.livePreview,
    },
    liveFeed: {
      enabled:
        typeof liveFeedRaw.enabled === 'boolean'
          ? liveFeedRaw.enabled
          : DEFAULT_LIVE_FEED.enabled,
      endpointTemplate:
        typeof liveFeedRaw.endpointTemplate === 'string' &&
        liveFeedRaw.endpointTemplate.trim()
          ? liveFeedRaw.endpointTemplate.trim()
          : DEFAULT_LIVE_FEED.endpointTemplate,
      affiliateWm:
        typeof liveFeedRaw.affiliateWm === 'string'
          ? liveFeedRaw.affiliateWm.trim()
          : DEFAULT_LIVE_FEED.affiliateWm,
      authHeader:
        typeof liveFeedRaw.authHeader === 'string'
          ? liveFeedRaw.authHeader.trim()
          : DEFAULT_LIVE_FEED.authHeader ?? '',
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
    themeMode:
      settingsRaw.themeMode === 'light' ||
      settingsRaw.themeMode === 'grey' ||
      settingsRaw.themeMode === 'dark'
        ? settingsRaw.themeMode
        : fallbackSettings.themeMode ?? 'dark',
  };
}

function sanitizeClientModel(
  m: Record<string, unknown>,
  idx: number,
  validTierIds: Set<string>,
  now: string
): ModelRecord {
  const tierId =
    typeof m.tierId === 'string' && validTierIds.has(m.tierId) ? m.tierId : 'inbox';
  const tags = Array.isArray(m.tags)
    ? m.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const customLinks = Array.isArray(m.customLinks)
    ? m.customLinks
        .filter(isRecord)
        .filter((l) => typeof l.url === 'string' && l.url.trim().length > 0)
        .map((l, lIdx) => ({
          id: typeof l.id === 'string' && l.id ? l.id : `link_${idx}_${lIdx}`,
          label:
            typeof l.label === 'string' && l.label.trim()
              ? l.label.trim()
              : 'Recording',
          url: (l.url as string).trim(),
        }))
    : [];

  let presenceHours: Record<string, number> | undefined;
  if (isRecord(m.presenceHours)) {
    const cleaned: Record<string, number> = {};
    for (const [k, mins] of Object.entries(m.presenceHours)) {
      if (
        isValidPresenceBucket(k) &&
        typeof mins === 'number' &&
        Number.isFinite(mins) &&
        mins > 0
      ) {
        cleaned[k] = Math.min(60, mins);
      }
    }
    if (Object.keys(cleaned).length > 0) presenceHours = cleaned;
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
        typeof ms.avgHoursPerDay === 'number' && Number.isFinite(ms.avgHoursPerDay)
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
    id: typeof m.id === 'string' && m.id.trim() ? m.id.trim() : `model_${idx}`,
    username: typeof m.username === 'string' ? m.username.trim() : '',
    displayName: typeof m.displayName === 'string' ? m.displayName : '',
    originalLink: typeof m.originalLink === 'string' ? m.originalLink : '',
    tierId,
    order: typeof m.order === 'number' && Number.isFinite(m.order) ? m.order : idx,
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

export function sanitizeClientAppData(raw: unknown): AppData {
  const defaults = createDefaultAppData();
  if (!isRecord(raw)) return defaults;

  const usedHotkeys = new Set<string>();
  const inboxRaw = isRecord(raw.inbox) ? raw.inbox : {};
  const rawInboxKey =
    inboxRaw.hotkey !== undefined
      ? sanitizeHotkeyValue(inboxRaw.hotkey)
      : defaults.inbox.hotkey;
  if (rawInboxKey) usedHotkeys.add(rawInboxKey);

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
          if (hotkey && usedHotkeys.has(hotkey)) hotkey = '';
          else if (hotkey) usedHotkeys.add(hotkey);

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
            order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : idx,
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
      const s = sanitizeClientModel(m, idx, validTierIds, now);
      if (!s.username) return;
      const uKey = s.username.toLowerCase();
      if (seenUsernames.has(uKey)) return;
      seenUsernames.add(uKey);
      const uniqueId = seenModelIds.has(s.id) ? `${s.id}_${idx}` : s.id;
      seenModelIds.add(uniqueId);
      models.push(uniqueId === s.id ? s : { ...s, id: uniqueId });
    });
  }

  const settings = sanitizeClientSettings(raw.settings, defaults.settings);
  const retentionCutoffMs =
    Date.now() - settings.trashRetentionDays * 24 * 60 * 60 * 1000;

  const trashedModels: ModelRecord[] = [];
  if (Array.isArray(raw.trashedModels)) {
    raw.trashedModels.filter(isRecord).forEach((m, idx) => {
      const s = sanitizeClientModel(m, idx, validTierIds, now);
      if (!s.username) return;
      const uKey = s.username.toLowerCase();
      if (seenUsernames.has(uKey)) return;
      if (s.deletedAt) {
        const deletedMs = Date.parse(s.deletedAt);
        if (Number.isFinite(deletedMs) && deletedMs <= retentionCutoffMs) {
          return;
        }
      }
      seenUsernames.add(uKey);
      const uniqueId = seenModelIds.has(s.id) ? `${s.id}_tr_${idx}` : s.id;
      seenModelIds.add(uniqueId);
      trashedModels.push(uniqueId === s.id ? s : { ...s, id: uniqueId });
    });
  }

  return {
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 1
        ? raw.version
        : 2,
    inbox,
    tiers,
    models,
    trashedModels,
    settings,
  };
}
