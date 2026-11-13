import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createDefaultAppData, desktopBridge } from '../services/bridge';
import {
  AppData,
  AppInfo,
  AppSettings,
  ImportCandidate,
  InboxConfig,
  LiveRoomInfo,
  ModelRecord,
  ThemeMode,
  TierDefinition,
  ToastNotice,
  UndoEntry,
} from '../types/models';
import {
  buildPresenceHoursFromCbexplorerStreams,
  CbexplorerStreamSession,
  computeActivitySummary,
  recordPresenceTick,
} from '../utils/activityStats';
import {
  sanitizeClientAppData,
  sanitizeClientSettings,
} from '../utils/appDataSanitizer';
import { buildFeedPageUrl, extractRoomsFromPayload } from '../utils/liveFeed';
import { sanitizeUsername } from '../utils/sanitizer';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface AddSingleModelInput {
  rawUsernameOrUrl: string;
  displayName?: string;
  originalLink?: string;
  tierId?: string;
  cbexplorerAdded?: boolean;
  thumbnail?: string;
  notes?: string;
  tags?: string[];
}

export type DuplicatePolicy = 'skip' | 'update';

export interface LivePollingState {
  loading: boolean;
  lastPolledAt: string | null;
  error: string | null;
  totalMatched: number;
  totalFeedRooms: number;
  lastStatus?: number;
}

export interface BatchActivitySyncState {
  running: boolean;
  completed: number;
  total: number;
  updatedCount: number;
}

function applyCbexplorerStreamsToModel(
  model: ModelRecord,
  streams: CbexplorerStreamSession[],
  nowDate: Date,
  nowIso: string
): { model: ModelRecord; streamsCount: number; tracked30dHours: number } {
  const merged = buildPresenceHoursFromCbexplorerStreams(
    streams,
    model.presenceHours,
    nowDate
  );
  const existingLiveMs = model.lastSeenLiveAt
    ? Date.parse(model.lastSeenLiveAt)
    : 0;
  const fetchedLiveMs = merged.latestStreamEndAt
    ? Date.parse(merged.latestStreamEndAt)
    : 0;
  const nextLastSeenLiveAt =
    Number.isFinite(fetchedLiveMs) &&
    fetchedLiveMs > (Number.isFinite(existingLiveMs) ? existingLiveMs : 0)
      ? merged.latestStreamEndAt
      : model.lastSeenLiveAt;

  const updatedModel: ModelRecord = {
    ...model,
    presenceHours: merged.presenceHours,
    activitySyncedAt: nowIso,
    lastSeenLiveAt: nextLastSeenLiveAt,
  };

  return {
    model: updatedModel,
    streamsCount: merged.streamsCount,
    tracked30dHours: computeActivitySummary(updatedModel, nowDate).tracked30DayHours,
  };
}

interface AppContextValue {
  data: AppData;
  isLoaded: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  appInfo: AppInfo | null;
  toasts: ToastNotice[];
  canUndo: boolean;
  lastUndoLabel: string | null;
  allKnownTags: string[];
  liveRoomsByUsername: Record<string, LiveRoomInfo>;
  livePollingState: LivePollingState;
  batchActivitySyncState: BatchActivitySyncState;
  refreshLiveFeed: (manual?: boolean) => Promise<void>;
  applyDetectedLiveRooms: (rooms: LiveRoomInfo[], replaceExisting?: boolean) => void;
  toggleManualLiveStatus: (username: string) => void;
  clearLiveCache: () => void;
  syncModelActivity: (
    modelId: string,
    options?: { force?: boolean; silent?: boolean }
  ) => Promise<{ ok: boolean; streamsCount: number; error?: string }>;
  syncStaleModelsActivity: (modelIds?: string[]) => Promise<void>;
  cancelBatchActivitySync: () => void;
  markModelReviewed: (id: string, recordUndo?: boolean) => void;
  resanitizeAllUsernames: () => number;
  resetReviewTimestamps: () => void;
  notify: (
    message: string,
    tone?: ToastNotice['tone'],
    undoAction?: () => void
  ) => void;
  dismissToast: (id: string) => void;
  undoLast: () => void;
  addModelsFromImport: (
    candidates: ImportCandidate[],
    targetTierId: string,
    duplicatePolicy: DuplicatePolicy
  ) => { added: number; updated: number; skipped: number };
  addSingleModel: (input: AddSingleModelInput) => {
    ok: boolean;
    error?: string;
    trashedModelId?: string;
    model?: ModelRecord;
  };
  updateModel: (
    id: string,
    patch: Partial<Omit<ModelRecord, 'id' | 'createdAt'>>,
    recordUndo?: boolean
  ) => { ok: boolean; error?: string };
  moveModelToTier: (
    id: string,
    targetTierId: string,
    targetIndex?: number,
    recordUndo?: boolean
  ) => void;
  reorderModelsInTier: (tierId: string, orderedIds: string[]) => void;
  toggleCbexplorer: (id: string) => void;
  deleteModels: (ids: string[]) => void;
  restoreFromTrash: (ids: string[]) => void;
  permanentlyDeleteTrashed: (ids: string[]) => void;
  emptyTrash: () => void;
  bulkUpdateModels: (
    ids: string[],
    options: {
      tierId?: string;
      cbexplorerAdded?: boolean;
      addTag?: string;
    }
  ) => void;
  updateInbox: (patch: Partial<Omit<InboxConfig, 'id'>>) => void;
  addTier: (tier: Omit<TierDefinition, 'id' | 'order'>) => TierDefinition;
  updateTier: (id: string, patch: Partial<Omit<TierDefinition, 'id'>>) => void;
  reorderTiers: (orderedIds: string[]) => void;
  deleteTier: (id: string, reassignToTierId: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setThemeMode: (mode: ThemeMode) => void;
  restoreBackupData: (rawData: AppData) => void;
  loadDemoModels: () => number;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEMO_SEEDS: Array<{
  username: string;
  displayName: string;
  originalLink: string;
  tags: string[];
  notes: string;
  cbexplorerAdded: boolean;
}> = [
  {
    username: 'seduza_hyun',
    displayName: 'Seduza Hyun',
    originalLink: 'https://chaturbate.com/seduza_hyun/',
    tags: ['Late Night', '1080p', 'Interactive'],
    notes: 'Usually online 23:00–02:30 UTC. Crisp mic & lighting.',
    cbexplorerAdded: true,
  },
  {
    username: 'luna_vibe',
    displayName: 'Luna Vibe',
    originalLink: 'https://chaturbate.com/luna_vibe/',
    tags: ['Acoustic', 'Chill', 'Weekends'],
    notes: 'Acoustic guitar sets and relaxed Q&A streams.',
    cbexplorerAdded: false,
  },
  {
    username: 'neon_kairo',
    displayName: 'Neon Kairo',
    originalLink: 'https://chaturbate.com/neon_kairo/',
    tags: ['RGB Setup', 'Gaming', '4K'],
    notes: 'High-bitrate RGB studio, streams Fri–Sun.',
    cbexplorerAdded: true,
  },
  {
    username: 'aria_solstice',
    displayName: 'Aria Solstice',
    originalLink: 'https://chaturbate.com/aria_solstice/',
    tags: ['Morning', 'Dance'],
    notes: 'Early morning coffee + dance streams.',
    cbexplorerAdded: false,
  },
  {
    username: 'velvet_echo',
    displayName: 'Velvet Echo',
    originalLink: 'https://chaturbate.com/velvet_echo/',
    tags: ['ASMR', 'Binaural'],
    notes: 'Binaural mic setup, low-light aesthetic.',
    cbexplorerAdded: false,
  },
];

function resequenceTierOrders(models: ModelRecord[], tierId: string): ModelRecord[] {
  let seq = 0;
  return models.map((m) => {
    if (m.tierId !== tierId) return m;
    const next = { ...m, order: seq };
    seq += 1;
    return next;
  });
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [data, setData] = useState<AppData>(() => createDefaultAppData());
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [liveRoomsByUsername, setLiveRoomsByUsername] = useState<
    Record<string, LiveRoomInfo>
  >({});
  const [livePollingState, setLivePollingState] = useState<LivePollingState>({
    loading: false,
    lastPolledAt: null,
    error: null,
    totalMatched: 0,
    totalFeedRooms: 0,
  });

  const saveTimerRef = useRef<number | null>(null);
  const savedBadgeTimerRef = useRef<number | null>(null);
  const hasPendingSaveRef = useRef(false);
  const pollSeqRef = useRef(0);
  const lastPresenceFlushRef = useRef(0);
  const latestDataRef = useRef<AppData>(data);
  latestDataRef.current = data;
  const undoStackRef = useRef<UndoEntry[]>(undoStack);
  undoStackRef.current = undoStack;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (
      message: string,
      tone: ToastNotice['tone'] = 'info',
      undoAction?: () => void
    ) => {
      const id = makeId('toast');
      setToasts((prev) => [...prev.slice(-3), { id, message, tone, undoAction }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  useEffect(() => {
    let active = true;
    Promise.all([desktopBridge.loadData(), desktopBridge.getAppInfo()])
      .then(([loadedData, info]) => {
        if (!active) return;

        let hydrated = sanitizeClientAppData(loadedData);
        if ((loadedData.version ?? 1) < 2) {
          let changed = false;
          const migratedModels = hydrated.models.map((m) => {
            const fromLink = m.originalLink ? sanitizeUsername(m.originalLink) : '';
            const fromDisplay =
              m.displayName && !/\s/.test(m.displayName.trim())
                ? sanitizeUsername(m.displayName)
                : '';
            const candidate = fromLink || fromDisplay;
            if (
              candidate &&
              candidate !== m.username &&
              candidate.replace(/^[_.-]+|[_.-]+$/g, '') === m.username
            ) {
              changed = true;
              return { ...m, username: candidate };
            }
            return m;
          });
          hydrated = sanitizeClientAppData({
            ...hydrated,
            version: 2,
            models: migratedModels,
          });
          if (changed || hydrated.models.length > 0) {
            void desktopBridge.saveData(hydrated);
          }
        }

        latestDataRef.current = hydrated;
        setData(hydrated);
        setAppInfo(info);
        setIsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const persistData = useCallback((nextData: AppData) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (savedBadgeTimerRef.current) {
      window.clearTimeout(savedBadgeTimerRef.current);
    }
    hasPendingSaveRef.current = true;
    setSaveState('saving');
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      desktopBridge
        .saveData(nextData)
        .then(() => {
          hasPendingSaveRef.current = false;
          setSaveState('saved');
          savedBadgeTimerRef.current = window.setTimeout(() => {
            setSaveState('idle');
          }, 1600);
        })
        .catch(() => {
          setSaveState('error');
        });
    }, 180);
  }, []);

  // Flush any debounced/unpersisted edits synchronously right before window unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasPendingSaveRef.current) return;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      desktopBridge.saveDataSync(latestDataRef.current);
      hasPendingSaveRef.current = false;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const commitData = useCallback(
    (
      updater: (prev: AppData) => AppData,
      undoLabel?: string,
      options?: { suppressPersist?: boolean }
    ) => {
      const prev = latestDataRef.current;
      if (undoLabel) {
        const entry: UndoEntry = {
          id: makeId('undo'),
          label: undoLabel,
          previousModels: prev.models,
          previousTrashedModels: prev.trashedModels ?? [],
          previousTiers: prev.tiers,
          previousDeckSourceFilter: prev.settings.deckSourceFilter,
        };
        const nextStack = [...undoStackRef.current.slice(-29), entry];
        undoStackRef.current = nextStack;
        setUndoStack(nextStack);
      }

      const next = updater(prev);
      latestDataRef.current = next;
      setData(next);
      if (options?.suppressPersist) {
        hasPendingSaveRef.current = true;
      } else {
        persistData(next);
      }
    },
    [persistData]
  );

  const undoLast = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    const nextStack = stack.slice(0, -1);
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);

    const prev = latestDataRef.current;
    const restoredTiers = last.previousTiers ?? prev.tiers;
    const validTierIds = new Set(restoredTiers.map((t) => t.id));
    validTierIds.add('inbox');
    const restoredModels = last.previousModels.map((m) =>
      validTierIds.has(m.tierId) ? m : { ...m, tierId: 'inbox' }
    );
    const next: AppData = {
      ...prev,
      tiers: restoredTiers,
      models: restoredModels,
      trashedModels:
        last.previousTrashedModels !== undefined
          ? last.previousTrashedModels
          : prev.trashedModels,
      settings:
        last.previousDeckSourceFilter !== undefined
          ? {
              ...prev.settings,
              deckSourceFilter: last.previousDeckSourceFilter,
            }
          : prev.settings,
    };
    latestDataRef.current = next;
    setData(next);
    persistData(next);
    notify(`Undid: ${last.label}`, 'info');
  }, [notify, persistData]);

  const addModelsFromImport = useCallback(
    (
      candidates: ImportCandidate[],
      targetTierId: string,
      duplicatePolicy: DuplicatePolicy
    ) => {
      let added = 0;
      let updated = 0;
      let skipped = 0;

      commitData((prev) => {
        const now = new Date().toISOString();
        const tierNameMap = new Map<string, string>();
        for (const t of prev.tiers) {
          tierNameMap.set(t.name.trim().toLowerCase(), t.id);
        }
        tierNameMap.set(prev.inbox.name.trim().toLowerCase(), 'inbox');
        tierNameMap.set('inbox', 'inbox');
        tierNameMap.set('unsorted', 'inbox');

        let nextModels = [...prev.models];
        const byUsername = new Map<string, number>();
        nextModels.forEach((m, idx) => {
          byUsername.set(m.username.toLowerCase(), idx);
        });

        let maxOrder = nextModels.reduce((acc, m) => Math.max(acc, m.order), -1);

        for (const cand of candidates) {
          const cleanUsername = sanitizeUsername(cand.username);
          if (!cleanUsername) {
            skipped += 1;
            continue;
          }

          const resolvedTierId =
            cand.tierHint && tierNameMap.has(cand.tierHint.trim().toLowerCase())
              ? (tierNameMap.get(cand.tierHint.trim().toLowerCase()) as string)
              : targetTierId;

          const existingIdx = byUsername.get(cleanUsername);
          if (existingIdx !== undefined) {
            if (duplicatePolicy === 'skip') {
              skipped += 1;
              continue;
            }

            const existing = nextModels[existingIdx];
            const mergedTags = Array.from(
              new Set([...existing.tags, ...cand.tags])
            );
            const hasExplicitTierHint = Boolean(
              cand.tierHint && tierNameMap.has(cand.tierHint.trim().toLowerCase())
            );
            const nextNotes =
              cand.notes && cand.notes.trim()
                ? !existing.notes.trim()
                  ? cand.notes.trim()
                  : existing.notes.includes(cand.notes.trim())
                    ? existing.notes
                    : `${existing.notes}\n${cand.notes.trim()}`
                : existing.notes;
            nextModels[existingIdx] = {
              ...existing,
              displayName: cand.displayName || existing.displayName,
              originalLink: cand.originalLink || existing.originalLink,
              tierId: hasExplicitTierHint ? resolvedTierId : existing.tierId,
              notes: nextNotes,
              tags: mergedTags,
              thumbnail: cand.thumbnail || existing.thumbnail,
              cbexplorerAdded: existing.cbexplorerAdded || cand.cbexplorerAdded,
              updatedAt: now,
              lastReviewedAt:
                hasExplicitTierHint && resolvedTierId !== existing.tierId
                  ? now
                  : existing.lastReviewedAt,
            };
            updated += 1;
            continue;
          }

          maxOrder += 1;
          const record: ModelRecord = {
            id: makeId('mdl'),
            username: cleanUsername,
            displayName: cand.displayName,
            originalLink: cand.originalLink,
            tierId: resolvedTierId,
            order: maxOrder,
            cbexplorerAdded: cand.cbexplorerAdded,
            thumbnail: cand.thumbnail ?? '',
            notes: cand.notes ?? '',
            tags: cand.tags,
            customLinks: [],
            createdAt: now,
            updatedAt: now,
            lastReviewedAt: resolvedTierId !== 'inbox' ? now : undefined,
          };

          byUsername.set(cleanUsername, nextModels.length);
          nextModels.push(record);
          added += 1;
        }

        return { ...prev, models: nextModels };
      }, `Import models`);

      return { added, updated, skipped };
    },
    [commitData]
  );

  const addSingleModel = useCallback(
    (input: AddSingleModelInput) => {
      const cleanUsername = sanitizeUsername(input.rawUsernameOrUrl);
      if (!cleanUsername) {
        return { ok: false, error: 'Please enter a valid username or profile URL.' };
      }

      const duplicate = latestDataRef.current.models.find(
        (m) => m.username.toLowerCase() === cleanUsername
      );
      if (duplicate) {
        return {
          ok: false,
          error: `Model "${cleanUsername}" already exists in your workspace.`,
        };
      }

      const trashedMatch = (latestDataRef.current.trashedModels ?? []).find(
        (m) => m.username.toLowerCase() === cleanUsername
      );
      if (trashedMatch) {
        return {
          ok: false,
          trashedModelId: trashedMatch.id,
          error: `Model "${cleanUsername}" is currently in the Recycling Bin.`,
        };
      }

      const now = new Date().toISOString();
      const maxOrder = latestDataRef.current.models.reduce(
        (acc, m) => Math.max(acc, m.order),
        -1
      );

      const created: ModelRecord = {
        id: makeId('mdl'),
        username: cleanUsername,
        displayName: input.displayName?.trim() ?? '',
        originalLink:
          input.originalLink?.trim() ||
          (/^https?:\/\//i.test(input.rawUsernameOrUrl.trim())
            ? input.rawUsernameOrUrl.trim()
            : ''),
        tierId: input.tierId || 'inbox',
        order: maxOrder + 1,
        cbexplorerAdded: Boolean(input.cbexplorerAdded),
        thumbnail: input.thumbnail?.trim() ?? '',
        notes: input.notes?.trim() ?? '',
        tags: input.tags ?? [],
        customLinks: [],
        createdAt: now,
        updatedAt: now,
        lastReviewedAt:
          (input.tierId || 'inbox') !== 'inbox' ? now : undefined,
      };

      commitData(
        (prev) => ({ ...prev, models: [...prev.models, created] }),
        `Add ${cleanUsername}`
      );
      return { ok: true, model: created };
    },
    [commitData]
  );

  const updateModel = useCallback(
    (
      id: string,
      patch: Partial<Omit<ModelRecord, 'id' | 'createdAt'>>,
      recordUndo = false
    ): { ok: boolean; error?: string } => {
      const current = latestDataRef.current;
      const target = current.models.find((m) => m.id === id);
      if (!target) {
        return { ok: false, error: 'Model not found.' };
      }

      let nextUsername = target.username;
      if (patch.username !== undefined) {
        const sanitized = sanitizeUsername(patch.username);
        if (sanitized) {
          const conflict = current.models.find(
            (m) => m.id !== id && m.username.toLowerCase() === sanitized
          );
          if (conflict) {
            return {
              ok: false,
              error: `Another model already uses "@${sanitized}".`,
            };
          }
          nextUsername = sanitized;
        }
      }

      const oldThumb = target.thumbnail;
      const nextThumb =
        patch.thumbnail !== undefined ? patch.thumbnail : oldThumb;

      commitData((prev) => {
        const now = new Date().toISOString();
        const models = prev.models.map((m) => {
          if (m.id !== id) return m;
          return {
            ...m,
            ...patch,
            username: nextUsername,
            updatedAt: now,
          };
        });
        return { ...prev, models };
      }, recordUndo ? 'Edit model' : undefined);

      if (
        patch.thumbnail !== undefined &&
        oldThumb !== nextThumb &&
        oldThumb.startsWith('local-media://thumb/')
      ) {
        const after = latestDataRef.current;
        const stillReferenced =
          after.models.some((m) => m.thumbnail === oldThumb) ||
          (after.trashedModels ?? []).some((m) => m.thumbnail === oldThumb);
        if (!stillReferenced) {
          void desktopBridge.deleteThumbnail(oldThumb);
        }
      }

      return { ok: true };
    },
    [commitData]
  );

  const moveModelToTier = useCallback(
    (
      id: string,
      targetTierId: string,
      targetIndex?: number,
      recordUndo = true
    ) => {
      const targetName =
        targetTierId === 'inbox'
          ? latestDataRef.current.inbox.name
          : latestDataRef.current.tiers.find((t) => t.id === targetTierId)?.name ??
            'tier';

      commitData(
        (prev) => {
          const moving = prev.models.find((m) => m.id === id);
          if (!moving) return prev;

          const now = new Date().toISOString();
          const updatedModel: ModelRecord = {
            ...moving,
            tierId: targetTierId,
            updatedAt: now,
            lastReviewedAt: now,
          };

          const withoutMoving = prev.models.filter((m) => m.id !== id);
          const targetColumn = withoutMoving
            .filter((m) => m.tierId === targetTierId)
            .sort((a, b) => a.order - b.order);

          const insertAt =
            targetIndex !== undefined
              ? Math.max(0, Math.min(targetIndex, targetColumn.length))
              : targetColumn.length;

          targetColumn.splice(insertAt, 0, updatedModel);
          const reorderedTarget = targetColumn.map((m, idx) => ({
            ...m,
            order: idx,
          }));

          const others = withoutMoving.filter((m) => m.tierId !== targetTierId);
          const merged = resequenceTierOrders(
            [...others, ...reorderedTarget],
            moving.tierId
          );

          return { ...prev, models: merged };
        },
        recordUndo ? `Move to ${targetName}` : undefined
      );
    },
    [commitData]
  );

  const reorderModelsInTier = useCallback(
    (tierId: string, orderedIds: string[]) => {
      commitData((prev) => {
        const rank = new Map<string, number>();
        orderedIds.forEach((id, idx) => rank.set(id, idx));
        const now = new Date().toISOString();

        const models = prev.models.map((m) => {
          if (m.tierId !== tierId) return m;
          const nextOrder = rank.get(m.id);
          if (nextOrder === undefined) return m;
          return { ...m, order: nextOrder, updatedAt: now };
        });
        return { ...prev, models };
      }, 'Reorder column');
    },
    [commitData]
  );

  const toggleCbexplorer = useCallback(
    (id: string) => {
      commitData((prev) => {
        const now = new Date().toISOString();
        const models = prev.models.map((m) =>
          m.id === id
            ? { ...m, cbexplorerAdded: !m.cbexplorerAdded, updatedAt: now }
            : m
        );
        return { ...prev, models };
      });
    },
    [commitData]
  );

  const deleteModels = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const retentionDays = latestDataRef.current.settings.trashRetentionDays || 45;
      commitData((prev) => {
        const now = new Date().toISOString();
        const remaining: ModelRecord[] = [];
        const newlyTrashed: ModelRecord[] = [];

        for (const m of prev.models) {
          if (idSet.has(m.id)) {
            newlyTrashed.push({
              ...m,
              deletedAt: now,
              deletedFromTierId: m.tierId,
            });
          } else {
            remaining.push(m);
          }
        }

        return {
          ...prev,
          models: remaining,
          trashedModels: [...(prev.trashedModels ?? []), ...newlyTrashed],
        };
      }, ids.length === 1 ? 'Move to Recycling Bin' : `Move ${ids.length} models to Recycling Bin`);

      notify(
        ids.length === 1
          ? `Moved 1 model to Recycling Bin (${retentionDays}d retention)`
          : `Moved ${ids.length} models to Recycling Bin (${retentionDays}d retention)`,
        'warning',
        () => undoLast()
      );
    },
    [commitData, notify, undoLast]
  );

  const restoreFromTrash = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      commitData((prev) => {
        const validTierIds = new Set(prev.tiers.map((t) => t.id));
        validTierIds.add('inbox');
        const now = new Date().toISOString();
        let nextOrder = prev.models.reduce((acc, m) => Math.max(acc, m.order), -1);

        const stillTrashed: ModelRecord[] = [];
        const restored: ModelRecord[] = [];

        for (const m of prev.trashedModels ?? []) {
          if (idSet.has(m.id)) {
            nextOrder += 1;
            const originTier =
              m.deletedFromTierId && validTierIds.has(m.deletedFromTierId)
                ? m.deletedFromTierId
                : 'inbox';
            const { deletedAt: _d, deletedFromTierId: _dt, ...clean } = m;
            restored.push({
              ...clean,
              tierId: originTier,
              order: nextOrder,
              updatedAt: now,
            });
          } else {
            stillTrashed.push(m);
          }
        }

        return {
          ...prev,
          models: [...prev.models, ...restored],
          trashedModels: stillTrashed,
        };
      }, `Restore ${ids.length} model(s)`);
      notify(
        ids.length === 1
          ? 'Restored 1 model from Recycling Bin.'
          : `Restored ${ids.length} models from Recycling Bin.`,
        'success'
      );
    },
    [commitData, notify]
  );

  const permanentlyDeleteTrashed = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const targets = (latestDataRef.current.trashedModels ?? []).filter((m) =>
        idSet.has(m.id)
      );
      for (const m of targets) {
        if (m.thumbnail.startsWith('local-media://thumb/')) {
          void desktopBridge.deleteThumbnail(m.thumbnail);
        }
      }
      commitData((prev) => ({
        ...prev,
        trashedModels: (prev.trashedModels ?? []).filter((m) => !idSet.has(m.id)),
      }));
      notify(
        ids.length === 1
          ? 'Permanently deleted 1 model.'
          : `Permanently deleted ${ids.length} models.`,
        'info'
      );
    },
    [commitData, notify]
  );

  const emptyTrash = useCallback(() => {
    const allTrashed = latestDataRef.current.trashedModels ?? [];
    for (const m of allTrashed) {
      if (m.thumbnail.startsWith('local-media://thumb/')) {
        void desktopBridge.deleteThumbnail(m.thumbnail);
      }
    }
    commitData((prev) => ({
      ...prev,
      trashedModels: [],
    }));
    notify('Recycling Bin emptied permanently.', 'info');
  }, [commitData, notify]);

  const bulkUpdateModels = useCallback(
    (
      ids: string[],
      options: {
        tierId?: string;
        cbexplorerAdded?: boolean;
        addTag?: string;
      }
    ) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const cleanTag = options.addTag?.trim();

      commitData((prev) => {
        const now = new Date().toISOString();
        let nextOrder = prev.models.reduce((acc, m) => Math.max(acc, m.order), -1);

        const models = prev.models.map((m) => {
          if (!idSet.has(m.id)) return m;
          nextOrder += 1;
          return {
            ...m,
            tierId: options.tierId !== undefined ? options.tierId : m.tierId,
            order: options.tierId !== undefined ? nextOrder : m.order,
            cbexplorerAdded:
              options.cbexplorerAdded !== undefined
                ? options.cbexplorerAdded
                : m.cbexplorerAdded,
            tags:
              cleanTag && !m.tags.includes(cleanTag)
                ? [...m.tags, cleanTag]
                : m.tags,
            updatedAt: now,
            lastReviewedAt:
              options.tierId !== undefined ? now : m.lastReviewedAt,
          };
        });
        return { ...prev, models };
      }, `Bulk edit ${ids.length} models`);
    },
    [commitData]
  );

  const updateInbox = useCallback(
    (patch: Partial<Omit<InboxConfig, 'id'>>) => {
      commitData((prev) => ({
        ...prev,
        inbox: {
          ...prev.inbox,
          ...patch,
          id: 'inbox',
        },
      }));
    },
    [commitData]
  );

  const addTier = useCallback(
    (tier: Omit<TierDefinition, 'id' | 'order'>): TierDefinition => {
      const created: TierDefinition = {
        ...tier,
        id: makeId('tier'),
        order: latestDataRef.current.tiers.length,
      };
      commitData((prev) => ({
        ...prev,
        tiers: [
          ...prev.tiers,
          { ...created, order: prev.tiers.length },
        ],
      }));
      return created;
    },
    [commitData]
  );

  const updateTier = useCallback(
    (id: string, patch: Partial<Omit<TierDefinition, 'id'>>) => {
      commitData((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }));
    },
    [commitData]
  );

  const reorderTiers = useCallback(
    (orderedIds: string[]) => {
      commitData((prev) => {
        const byId = new Map(prev.tiers.map((t) => [t.id, t]));
        const reordered: TierDefinition[] = [];
        orderedIds.forEach((id, idx) => {
          const item = byId.get(id);
          if (item) {
            reordered.push({ ...item, order: idx });
            byId.delete(id);
          }
        });
        for (const leftover of byId.values()) {
          reordered.push({ ...leftover, order: reordered.length });
        }
        return { ...prev, tiers: reordered };
      });
    },
    [commitData]
  );

  const deleteTier = useCallback(
    (id: string, reassignToTierId: string) => {
      const safeTarget = reassignToTierId === id ? 'inbox' : reassignToTierId;
      commitData((prev) => {
        const now = new Date().toISOString();
        const remainingTiers = prev.tiers
          .filter((t) => t.id !== id)
          .map((t, idx) => ({ ...t, order: idx }));

        const models = prev.models.map((m) =>
          m.tierId === id ? { ...m, tierId: safeTarget, updatedAt: now } : m
        );

        const nextSource =
          prev.settings.deckSourceFilter === id
            ? 'inbox'
            : prev.settings.deckSourceFilter;

        return {
          ...prev,
          tiers: remainingTiers,
          models,
          settings: {
            ...prev.settings,
            deckSourceFilter: nextSource,
          },
        };
      }, 'Delete tier');
    },
    [commitData]
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      commitData((prev) => ({
        ...prev,
        settings: sanitizeClientSettings(
          { ...prev.settings, ...patch },
          prev.settings
        ),
      }));
    },
    [commitData]
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      updateSettings({ themeMode: mode });
    },
    [updateSettings]
  );

  useEffect(() => {
    const mode = data.settings.themeMode || 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  }, [data.settings.themeMode]);

  const restoreBackupData = useCallback(
    (rawData: AppData) => {
      const sanitized = sanitizeClientAppData(rawData);
      undoStackRef.current = [];
      setUndoStack([]);
      commitData(() => sanitized);
      notify('Workspace backup restored successfully.', 'success');
    },
    [commitData, notify]
  );

  const loadDemoModels = useCallback(() => {
    const candidates: ImportCandidate[] = DEMO_SEEDS.map((seed, idx) => ({
      tempId: `demo_${idx}`,
      rawInput: seed.originalLink,
      username: seed.username,
      displayName: seed.displayName,
      originalLink: seed.originalLink,
      tags: seed.tags,
      notes: seed.notes,
      cbexplorerAdded: seed.cbexplorerAdded,
      isDuplicate: false,
    }));
    const res = addModelsFromImport(candidates, 'inbox', 'skip');
    if (res.added > 0) {
      notify(`Loaded ${res.added} sample models into Inbox.`, 'success');
    } else {
      notify('Sample models are already in your workspace.', 'info');
    }
    return res.added;
  }, [addModelsFromImport, notify]);

  const markModelReviewed = useCallback(
    (id: string, recordUndo = true) => {
      commitData((prev) => {
        const now = new Date().toISOString();
        return {
          ...prev,
          models: prev.models.map((m) =>
            m.id === id ? { ...m, lastReviewedAt: now, updatedAt: now } : m
          ),
        };
      }, recordUndo ? 'Confirm tier review' : undefined);
    },
    [commitData]
  );

  const resanitizeAllUsernames = useCallback(() => {
    const prev = latestDataRef.current;
    const seen = new Set<string>();
    const updates = new Map<string, string>();

    for (const m of prev.models) {
      const fromLink = m.originalLink ? sanitizeUsername(m.originalLink) : '';
      const clean = fromLink || sanitizeUsername(m.username);
      const target = clean || m.username;
      const key = target.toLowerCase();
      if (clean && clean !== m.username && !seen.has(key)) {
        seen.add(key);
        updates.set(m.id, clean);
      } else {
        seen.add(m.username.toLowerCase());
      }
    }

    if (updates.size === 0) return 0;

    commitData((curr) => {
      const now = new Date().toISOString();
      return {
        ...curr,
        models: curr.models.map((m) =>
          updates.has(m.id)
            ? { ...m, username: updates.get(m.id) as string, updatedAt: now }
            : m
        ),
      };
    }, 'Re-sanitize usernames');

    return updates.size;
  }, [commitData]);

  const resetReviewTimestamps = useCallback(() => {
    commitData((prev) => {
      const now = new Date().toISOString();
      return {
        ...prev,
        models: prev.models.map((m) => ({ ...m, lastReviewedAt: now })),
      };
    }, 'Reset review timestamps');
    notify('Marked all models as reviewed today.', 'success');
  }, [commitData, notify]);

  const clearLiveCache = useCallback(() => {
    pollSeqRef.current += 1;
    setLiveRoomsByUsername({});
    setLivePollingState({
      loading: false,
      lastPolledAt: null,
      error: null,
      totalMatched: 0,
      totalFeedRooms: 0,
    });
  }, []);

  const applyDetectedLiveRooms = useCallback(
    (rooms: LiveRoomInfo[], replaceExisting = true) => {
      const nowIso = new Date().toISOString();
      const nowDate = new Date();

      setLiveRoomsByUsername((prev) => {
        const next: Record<string, LiveRoomInfo> = replaceExisting
          ? {}
          : { ...prev };
        for (const room of rooms) {
          next[room.username.toLowerCase()] = room;
        }
        return next;
      });

      const matchedSet = new Set(rooms.map((r) => r.username.toLowerCase()));
      if (matchedSet.size > 0) {
        commitData((prev) => ({
          ...prev,
          models: prev.models.map((m) =>
            matchedSet.has(m.username.toLowerCase())
              ? {
                  ...m,
                  lastSeenLiveAt: nowIso,
                  presenceHours: recordPresenceTick(m.presenceHours, 1, nowDate),
                }
              : m
          ),
        }));
      }

      setLivePollingState((prev) => ({
        ...prev,
        loading: false,
        lastPolledAt: nowIso,
        error: null,
        totalMatched: matchedSet.size,
      }));
    },
    [commitData]
  );

  const toggleManualLiveStatus = useCallback(
    (username: string) => {
      const key = username.toLowerCase();
      const nowIso = new Date().toISOString();
      const currentlyLive = Boolean(liveRoomsByUsername[key]);

      setLiveRoomsByUsername((prev) => {
        const next = { ...prev };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = {
            username: key,
            currentShow: 'public',
            numUsers: 0,
            roomSubject: '',
            tags: [],
            isHd: false,
            imageUrl: '',
            iframeEmbed: '',
            lastCheckedAt: nowIso,
          };
        }
        return next;
      });

      if (!currentlyLive) {
        commitData((prev) => ({
          ...prev,
          models: prev.models.map((m) =>
            m.username.toLowerCase() === key
              ? { ...m, lastSeenLiveAt: nowIso }
              : m
          ),
        }));
      }
    },
    [commitData, liveRoomsByUsername]
  );

  const refreshLiveFeed = useCallback(
    async (manual = false) => {
      const current = latestDataRef.current;
      const feedCfg = current.settings.liveFeed;
      if (!feedCfg.enabled && !manual) return;

      const needsWm = feedCfg.endpointTemplate.includes('{wm}');
      if (needsWm && !feedCfg.affiliateWm.trim() && !manual) {
        return;
      }

      const pollSeq = ++pollSeqRef.current;
      setLivePollingState((prev) => ({ ...prev, loading: true, error: null }));

      const pageSize = 500;
      const maxPages = Math.max(1, Math.min(25, feedCfg.maxPages || 1));
      const collected: Record<string, LiveRoomInfo> = {};
      let totalFeedRooms = 0;
      let lastStatus: number | undefined;
      let fetchError: string | null = null;
      const nowIso = new Date().toISOString();

      for (let page = 0; page < maxPages; page += 1) {
        const url = buildFeedPageUrl(feedCfg, page, pageSize);
        const res = await desktopBridge.fetchLiveJson(url, feedCfg.authHeader);
        if (pollSeq !== pollSeqRef.current) return;
        lastStatus = res.status;

        if (!res.ok) {
          fetchError = res.error || `Feed request failed (HTTP ${res.status})`;
          break;
        }

        const { rooms, totalReported } = extractRoomsFromPayload(res.data, nowIso);
        totalFeedRooms += rooms.length;
        for (const room of rooms) {
          collected[room.username] = room;
        }

        if (
          rooms.length < pageSize ||
          (totalReported !== undefined && totalFeedRooms >= totalReported) ||
          !feedCfg.endpointTemplate.includes('{offset}')
        ) {
          break;
        }
      }

      if (pollSeq !== pollSeqRef.current) return;

      if (fetchError && Object.keys(collected).length === 0) {
        setLivePollingState({
          loading: false,
          lastPolledAt: nowIso,
          error: fetchError,
          totalMatched: 0,
          totalFeedRooms: 0,
          lastStatus,
        });
        if (manual) {
          notify(`Live feed check: ${fetchError}`, 'warning');
        }
        return;
      }

      const trackedUsernames = new Set(
        latestDataRef.current.models.map((m) => m.username.toLowerCase())
      );
      const matchedMap: Record<string, LiveRoomInfo> = {};
      for (const [uname, room] of Object.entries(collected)) {
        if (trackedUsernames.has(uname)) {
          matchedMap[uname] = room;
        }
      }

      setLiveRoomsByUsername(matchedMap);

      const matchedCount = Object.keys(matchedMap).length;
      if (matchedCount > 0) {
        const nowMs = Date.now();
        const shouldFlushToDisk =
          manual || nowMs - lastPresenceFlushRef.current >= 180_000;
        if (shouldFlushToDisk) {
          lastPresenceFlushRef.current = nowMs;
        }
        const nowDate = new Date(nowMs);
        const minutesPerTick = manual
          ? 0.5
          : Math.max(0.25, (feedCfg.refreshIntervalSec || 45) / 60);
        commitData(
          (prev) => ({
            ...prev,
            models: prev.models.map((m) =>
              matchedMap[m.username.toLowerCase()]
                ? {
                    ...m,
                    lastSeenLiveAt: nowIso,
                    presenceHours: recordPresenceTick(
                      m.presenceHours,
                      minutesPerTick,
                      nowDate
                    ),
                  }
                : m
            ),
          }),
          undefined,
          { suppressPersist: !shouldFlushToDisk }
        );
      }

      setLivePollingState({
        loading: false,
        lastPolledAt: nowIso,
        error: fetchError,
        totalMatched: matchedCount,
        totalFeedRooms,
        lastStatus,
      });

      if (manual) {
        notify(
          `Synced ${totalFeedRooms} live rooms — ${matchedCount} watchlist model(s) online.`,
          'success'
        );
      }
    },
    [commitData, notify]
  );

  const activityInFlightRef = useRef<
    Map<string, Promise<{ ok: boolean; streamsCount: number; error?: string }>>
  >(new Map());

  const [batchActivitySyncState, setBatchActivitySyncState] =
    useState<BatchActivitySyncState>({
      running: false,
      completed: 0,
      total: 0,
      updatedCount: 0,
    });
  const batchSyncCancelRef = useRef(false);
  const batchSyncRunningRef = useRef(false);

  useEffect(() => {
    return () => {
      batchSyncCancelRef.current = true;
    };
  }, []);

  const syncModelActivity = useCallback(
    async (
      modelId: string,
      options?: { force?: boolean; silent?: boolean }
    ): Promise<{ ok: boolean; streamsCount: number; error?: string }> => {
      const target = latestDataRef.current.models.find((m) => m.id === modelId);
      if (!target) {
        return { ok: false, streamsCount: 0, error: 'Model not found.' };
      }

      const staleAfterMs = 6 * 60 * 60 * 1000;
      const lastSyncedMs = target.activitySyncedAt
        ? Date.parse(target.activitySyncedAt)
        : 0;
      if (
        !options?.force &&
        Number.isFinite(lastSyncedMs) &&
        lastSyncedMs > 0 &&
        Date.now() - lastSyncedMs < staleAfterMs
      ) {
        return { ok: true, streamsCount: 0 };
      }

      const existingPromise = activityInFlightRef.current.get(modelId);
      if (existingPromise) {
        return existingPromise;
      }

      const cleanUser =
        sanitizeUsername(target.username) || target.username.trim().toLowerCase();
      if (!cleanUser) {
        return { ok: false, streamsCount: 0, error: 'Invalid model username.' };
      }

      const task = (async () => {
        try {
          const url = `https://cbexplorer.com/api/internal/livestats/streams?modelName=${encodeURIComponent(
            cleanUser
          )}`;
          const res = await desktopBridge.fetchLiveJson(url);
          if (!res.ok || !Array.isArray(res.data)) {
            const errMsg =
              res.error || 'Could not load broadcast history from CBExplorer.';
            if (!options?.silent) {
              notify(`CBExplorer history sync failed: ${errMsg}`, 'warning');
            }
            return { ok: false, streamsCount: 0, error: errMsg };
          }

          const streams = res.data as CbexplorerStreamSession[];
          const nowDate = new Date();
          const nowIso = nowDate.toISOString();
          const previewBase =
            latestDataRef.current.models.find((m) => m.id === modelId) ?? target;
          const previewMerged = applyCbexplorerStreamsToModel(
            previewBase,
            streams,
            nowDate,
            nowIso
          );

          commitData((prev) => ({
            ...prev,
            models: prev.models.map((m) =>
              m.id === modelId
                ? applyCbexplorerStreamsToModel(m, streams, nowDate, nowIso).model
                : m
            ),
          }));

          if (!options?.silent) {
            notify(
              previewMerged.streamsCount > 0
                ? `Synced ${previewMerged.streamsCount} stream(s) from CBExplorer for @${cleanUser} (${previewMerged.tracked30dHours}h in last 30d).`
                : `No recent CBExplorer stream history found for @${cleanUser}.`,
              'info'
            );
          }

          return { ok: true, streamsCount: previewMerged.streamsCount };
        } catch (err) {
          const errMsg =
            err instanceof Error
              ? err.message
              : 'CBExplorer activity request failed.';
          if (!options?.silent) {
            notify(`CBExplorer history sync failed: ${errMsg}`, 'warning');
          }
          return { ok: false, streamsCount: 0, error: errMsg };
        } finally {
          activityInFlightRef.current.delete(modelId);
        }
      })();

      activityInFlightRef.current.set(modelId, task);
      return task;
    },
    [commitData, notify]
  );

  const cancelBatchActivitySync = useCallback(() => {
    batchSyncCancelRef.current = true;
  }, []);

  const syncStaleModelsActivity = useCallback(
    async (modelIds?: string[]) => {
      if (batchSyncRunningRef.current) return;
      const scopeSet = modelIds ? new Set(modelIds) : null;
      const staleAfterMs = 12 * 60 * 60 * 1000;
      const nowMs = Date.now();

      const targets = latestDataRef.current.models.filter((m) => {
        if (scopeSet && !scopeSet.has(m.id)) return false;
        const lastSyncedMs = m.activitySyncedAt ? Date.parse(m.activitySyncedAt) : 0;
        return (
          !Number.isFinite(lastSyncedMs) ||
          lastSyncedMs <= 0 ||
          nowMs - lastSyncedMs >= staleAfterMs
        );
      });

      if (targets.length === 0) {
        notify('All model CBExplorer schedules are already up to date.', 'info');
        return;
      }

      batchSyncRunningRef.current = true;
      batchSyncCancelRef.current = false;
      setBatchActivitySyncState({
        running: true,
        completed: 0,
        total: targets.length,
        updatedCount: 0,
      });

      let cursor = 0;
      let completed = 0;
      let updatedCount = 0;
      const pendingPatches = new Map<string, CbexplorerStreamSession[]>();

      const flushPending = (persistToDisk: boolean) => {
        if (pendingPatches.size === 0) return;
        const snapshotMap = new Map(pendingPatches);
        pendingPatches.clear();
        const nowDate = new Date();
        const nowIso = nowDate.toISOString();
        commitData(
          (prev) => ({
            ...prev,
            models: prev.models.map((m) => {
              const streams = snapshotMap.get(m.id);
              if (!streams) return m;
              return applyCbexplorerStreamsToModel(m, streams, nowDate, nowIso).model;
            }),
          }),
          undefined,
          { suppressPersist: !persistToDisk }
        );
      };

      const worker = async () => {
        while (!batchSyncCancelRef.current) {
          const idx = cursor;
          cursor += 1;
          if (idx >= targets.length) break;

          const model = targets[idx];
          const cleanUser =
            sanitizeUsername(model.username) || model.username.trim().toLowerCase();
          if (cleanUser) {
            try {
              const url = `https://cbexplorer.com/api/internal/livestats/streams?modelName=${encodeURIComponent(
                cleanUser
              )}`;
              const res = await desktopBridge.fetchLiveJson(url);
              if (res.ok && Array.isArray(res.data)) {
                pendingPatches.set(model.id, res.data as CbexplorerStreamSession[]);
                updatedCount += 1;
              }
            } catch {
              // skip individual failure safely and continue queue
            }
          }

          completed += 1;
          if (pendingPatches.size >= 8) {
            flushPending(true);
          }
          setBatchActivitySyncState({
            running: true,
            completed,
            total: targets.length,
            updatedCount,
          });
        }
      };

      try {
        const concurrency = Math.min(2, targets.length);
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        flushPending(true);
        notify(
          batchSyncCancelRef.current
            ? `Stopped CBExplorer schedule sync (${updatedCount} updated).`
            : `Synced CBExplorer 90d schedules for ${updatedCount} of ${targets.length} model(s).`,
          batchSyncCancelRef.current ? 'info' : 'success'
        );
      } finally {
        batchSyncRunningRef.current = false;
        batchSyncCancelRef.current = false;
        setBatchActivitySyncState({
          running: false,
          completed: 0,
          total: 0,
          updatedCount: 0,
        });
      }
    },
    [commitData, notify]
  );

  // Periodic background live-feed sync when enabled & configured
  useEffect(() => {
    if (!isLoaded) return;
    const cfg = data.settings.liveFeed;
    if (!cfg.enabled || !cfg.autoRefreshSnapshots) return;
    const needsWm = cfg.endpointTemplate.includes('{wm}');
    if (needsWm && !cfg.affiliateWm.trim()) return;
    if (data.models.length === 0) return;

    void refreshLiveFeed(false);
    const intervalMs = Math.max(10, cfg.refreshIntervalSec || 30) * 1000;
    const id = window.setInterval(() => {
      void refreshLiveFeed(false);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [
    data.models.length,
    data.settings.liveFeed,
    isLoaded,
    refreshLiveFeed,
  ]);

  const allKnownTags = useMemo(() => {
    const set = new Set<string>();
    for (const model of data.models) {
      for (const tag of model.tags) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.models]);

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      isLoaded,
      saveState,
      appInfo,
      toasts,
      canUndo: undoStack.length > 0,
      lastUndoLabel:
        undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null,
      allKnownTags,
      liveRoomsByUsername,
      livePollingState,
      batchActivitySyncState,
      refreshLiveFeed,
      applyDetectedLiveRooms,
      toggleManualLiveStatus,
      clearLiveCache,
      syncModelActivity,
      syncStaleModelsActivity,
      cancelBatchActivitySync,
      markModelReviewed,
      resanitizeAllUsernames,
      resetReviewTimestamps,
      notify,
      dismissToast,
      undoLast,
      addModelsFromImport,
      addSingleModel,
      updateModel,
      moveModelToTier,
      reorderModelsInTier,
      toggleCbexplorer,
      deleteModels,
      restoreFromTrash,
      permanentlyDeleteTrashed,
      emptyTrash,
      bulkUpdateModels,
      updateInbox,
      addTier,
      updateTier,
      reorderTiers,
      deleteTier,
      updateSettings,
      setThemeMode,
      restoreBackupData,
      loadDemoModels,
    }),
    [
      data,
      isLoaded,
      saveState,
      appInfo,
      toasts,
      undoStack,
      allKnownTags,
      liveRoomsByUsername,
      livePollingState,
      batchActivitySyncState,
      refreshLiveFeed,
      applyDetectedLiveRooms,
      toggleManualLiveStatus,
      clearLiveCache,
      syncModelActivity,
      syncStaleModelsActivity,
      cancelBatchActivitySync,
      markModelReviewed,
      resanitizeAllUsernames,
      resetReviewTimestamps,
      notify,
      dismissToast,
      undoLast,
      addModelsFromImport,
      addSingleModel,
      updateModel,
      moveModelToTier,
      reorderModelsInTier,
      toggleCbexplorer,
      deleteModels,
      restoreFromTrash,
      permanentlyDeleteTrashed,
      emptyTrash,
      bulkUpdateModels,
      updateInbox,
      addTier,
      updateTier,
      reorderTiers,
      deleteTier,
      updateSettings,
      setThemeMode,
      restoreBackupData,
      loadDemoModels,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppStore must be used inside AppProvider');
  }
  return ctx;
}
