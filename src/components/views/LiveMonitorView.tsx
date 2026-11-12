import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  EyeOff,
  LayoutGrid,
  Lock,
  Maximize2,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  SkipForward,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Square,
  Tv,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { LiveRoomInfo, ModelRecord } from '../../types/models';
import {
  getUsuallyLiveNowMeta,
  UsuallyLiveNowMeta,
} from '../../utils/activityStats';
import {
  buildTierOrderMap,
  compareMonitorTierPriority,
  isPublicShowStatus,
} from '../../utils/liveMonitorSort';
import { formatRelativeAge, getModelReviewStatus } from '../../utils/review';
import { CbexplorerToggle } from '../common/CbexplorerToggle';
import { LiveStreamPlayer } from '../common/LiveStreamPlayer';
import { ModelAvatar } from '../common/ModelAvatar';

type MonitorLayoutMode = 'grid' | 'wall' | 'single';
type GridShowFilter = 'public' | 'online' | 'usually_now' | 'all';

interface LiveMonitorViewProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string | null) => void;
  onEditModel: (model: ModelRecord) => void;
  onOpenFeedSettings: () => void;
  onOpenTierManager: () => void;
  onJumpToResortDue: () => void;
  onOpenImport: () => void;
  returnLabel?: string | null;
  onReturnBack?: () => void;
}

interface TierGroup {
  id: string;
  name: string;
  color: string;
  hotkey: string;
  items: Array<{
    model: ModelRecord;
    live?: LiveRoomInfo;
    isDue: boolean;
    usuallyNow: UsuallyLiveNowMeta;
  }>;
  liveCount: number;
}

function getShowStatusMeta(show?: string): {
  label: string;
  badgeClass: string;
  isPublic: boolean;
} {
  const s = (show || '').toLowerCase();
  if (s === 'private') {
    return {
      label: 'PRIVATE',
      badgeClass: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
      isPublic: false,
    };
  }
  if (s === 'away') {
    return {
      label: 'AWAY',
      badgeClass: 'bg-slate-600/40 text-slate-200 border-slate-400/30',
      isPublic: false,
    };
  }
  if (s === 'hidden') {
    return {
      label: 'HIDDEN',
      badgeClass: 'bg-purple-500/25 text-purple-200 border-purple-400/40',
      isPublic: false,
    };
  }
  if (s === 'ticket' || s === 'group') {
    return {
      label: s.toUpperCase(),
      badgeClass: 'bg-pink-500/25 text-pink-200 border-pink-400/40',
      isPublic: false,
    };
  }
  return {
    label: 'PUBLIC',
    badgeClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40',
    isPublic: true,
  };
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  selectedModelId,
  onSelectModel,
  onEditModel,
  onOpenFeedSettings,
  onOpenTierManager,
  onJumpToResortDue,
  onOpenImport,
  returnLabel,
  onReturnBack,
}) => {
  const {
    data,
    liveRoomsByUsername,
    livePollingState,
    batchActivitySyncState,
    refreshLiveFeed,
    syncStaleModelsActivity,
    cancelBatchActivitySync,
    toggleManualLiveStatus,
    moveModelToTier,
    toggleCbexplorer,
    notify,
  } = useAppStore();

  const hoverTimerRef = useRef<number | null>(null);

  const [railOpen, setRailOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [onlyLive, setOnlyLive] = useState(false);
  const [usuallyNowOnly, setUsuallyNowOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [scheduleHourKey, setScheduleHourKey] = useState(() => new Date().getHours());
  const [collapsedTiers, setCollapsedTiers] = useState<Set<string>>(new Set());

  const [layoutMode, setLayoutMode] = useState<MonitorLayoutMode>(
    returnLabel ? 'single' : 'grid'
  );
  const [gridShowFilter, setGridShowFilter] = useState<GridShowFilter>('all');
  const [gridCols, setGridCols] = useState<'auto' | 2 | 3 | 4 | 5>('auto');
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [hoverPreviewEnabled, setHoverPreviewEnabled] = useState(true);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [snapshotTick, setSnapshotTick] = useState(() => Date.now());
  const [failedThumbs, setFailedThumbs] = useState<Record<string, string>>({});

  const [stageMuted, setStageMuted] = useState(false);
  const [wallMuted, setWallMuted] = useState(true);
  const [videoOnly, setVideoOnly] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const activeMuted = layoutMode === 'single' ? stageMuted : wallMuted;
  const toggleActiveMuted = () => {
    if (layoutMode === 'single') {
      setStageMuted((v) => !v);
    } else {
      setWallMuted((v) => !v);
    }
  };

  const [wallIds, setWallIds] = useState<string[]>([]);
  const [hiddenWallIds, setHiddenWallIds] = useState<string[]>([]);
  const [wallCols, setWallCols] = useState<'auto' | 2 | 3 | 4>('auto');
  const [wallPublicOnly, setWallPublicOnly] = useState(true);
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);

  // Switch to Stage when jumping in via "Silent View" from Sorter / Kanban / Grid
  useEffect(() => {
    if (returnLabel) {
      setLayoutMode('single');
    }
  }, [returnLabel, selectedModelId]);

  // Auto-collapse sidebar in Watch Wall for theater-style viewing
  useEffect(() => {
    if (layoutMode === 'wall') {
      setRailOpen(false);
    }
    if (layoutMode !== 'grid') {
      setGridMenuOpen(false);
    }
  }, [layoutMode]);

  // Refresh live JPEG thumbnails gently every 15s while Watchlist Grid is active
  useEffect(() => {
    if (layoutMode !== 'grid') return;
    const id = window.setInterval(() => {
      setSnapshotTick(Date.now());
    }, 15000);
    return () => window.clearInterval(id);
  }, [layoutMode]);

  useEffect(() => {
    setFailedThumbs({});
  }, [snapshotTick]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const hr = new Date().getHours();
      setScheduleHourKey((prev) => (prev === hr ? prev : hr));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const tierMap = useMemo(() => {
    const map = new Map<string, (typeof sortedTiers)[number]>();
    for (const t of sortedTiers) map.set(t.id, t);
    return map;
  }, [sortedTiers]);

  const tierOrderMap = useMemo(
    () => buildTierOrderMap(sortedTiers),
    [sortedTiers]
  );

  const enrichedModels = useMemo(() => {
    const nowDate = new Date();
    const nowMs = nowDate.getTime();
    return data.models.map((model) => {
      const live = liveRoomsByUsername[model.username.toLowerCase()];
      const tier = tierMap.get(model.tierId);
      const review = getModelReviewStatus(
        model,
        tier,
        data.settings.defaultReviewCadenceDays,
        data.settings.staleOfflineDays,
        nowMs
      );
      const usuallyNow = getUsuallyLiveNowMeta(model, nowDate);
      return { model, live, isDue: review.isDueForReview, usuallyNow };
    });
  }, [
    data.models,
    data.settings.defaultReviewCadenceDays,
    data.settings.staleOfflineDays,
    liveRoomsByUsername,
    scheduleHourKey,
    tierMap,
  ]);

  const totalLiveCount = useMemo(
    () => enrichedModels.filter((item) => Boolean(item.live)).length,
    [enrichedModels]
  );

  const totalPublicLiveCount = useMemo(
    () =>
      enrichedModels.filter(
        (item) =>
          item.live && getShowStatusMeta(item.live.currentShow).isPublic
      ).length,
    [enrichedModels]
  );

  const totalDueCount = useMemo(
    () => enrichedModels.filter((item) => item.isDue).length,
    [enrichedModels]
  );

  const totalUsuallyNowCount = useMemo(
    () => enrichedModels.filter((item) => item.usuallyNow.isUsuallyLiveNow).length,
    [enrichedModels]
  );

  const unsyncedScheduleCount = useMemo(
    () => data.models.filter((m) => !m.activitySyncedAt).length,
    [data.models]
  );

  // Auto-enable Live-only filtering in sidebar and Public-live filter in Grid once live data arrives
  const didAutoFilterLiveRef = useRef(false);
  useEffect(() => {
    if (totalLiveCount > 0 && !didAutoFilterLiveRef.current) {
      didAutoFilterLiveRef.current = true;
      setOnlyLive(true);
      setGridShowFilter(totalPublicLiveCount > 0 ? 'public' : 'online');
    } else if (totalLiveCount === 0 && didAutoFilterLiveRef.current) {
      didAutoFilterLiveRef.current = false;
      setGridShowFilter('all');
    }
  }, [totalLiveCount, totalPublicLiveCount]);

  // Group filtered models strictly per Watchlist / Tier for the sidebar
  const groupedByWatchlist = useMemo<TierGroup[]>(() => {
    const q = search.trim().toLowerCase();
    const matchesQuery = (model: ModelRecord, live?: LiveRoomInfo) => {
      if (!q) return true;
      return `${model.username} ${model.displayName} ${model.notes} ${model.tags.join(' ')} ${live?.roomSubject ?? ''}`
        .toLowerCase()
        .includes(q);
    };

    const defs: Array<{
      id: string;
      name: string;
      color: string;
      hotkey: string;
    }> = [
      ...sortedTiers.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        hotkey: t.hotkey,
      })),
      {
        id: 'inbox',
        name: data.inbox.name,
        color: data.inbox.color,
        hotkey: data.inbox.hotkey,
      },
    ];

    const groups: TierGroup[] = [];

    for (const def of defs) {
      if (tierFilter !== 'all' && tierFilter !== def.id) continue;

      const allInTier = enrichedModels.filter(
        (item) => item.model.tierId === def.id
      );
      const liveInTier = allInTier.filter((item) => Boolean(item.live)).length;

      const filteredItems = allInTier
        .filter((item) => {
          if (onlyLive && !item.live) return false;
          if (usuallyNowOnly && !item.usuallyNow.isUsuallyLiveNow) return false;
          if (dueOnly && !item.isDue) return false;
          return matchesQuery(item.model, item.live);
        })
        .sort((a, b) => {
          if (Boolean(a.live) !== Boolean(b.live)) return a.live ? -1 : 1;
          if (a.live && b.live && b.live.numUsers !== a.live.numUsers) {
            return b.live.numUsers - a.live.numUsers;
          }
          if (
            usuallyNowOnly &&
            b.usuallyNow.scoreMinutes !== a.usuallyNow.scoreMinutes
          ) {
            return b.usuallyNow.scoreMinutes - a.usuallyNow.scoreMinutes;
          }
          return a.model.order - b.model.order;
        });

      if (
        filteredItems.length === 0 &&
        (onlyLive || usuallyNowOnly || dueOnly || q)
      ) {
        continue;
      }

      groups.push({
        id: def.id,
        name: def.name,
        color: def.color,
        hotkey: def.hotkey,
        items: filteredItems,
        liveCount: liveInTier,
      });
    }

    return groups;
  }, [
    data.inbox,
    dueOnly,
    enrichedModels,
    onlyLive,
    search,
    sortedTiers,
    tierFilter,
    usuallyNowOnly,
  ]);

  const flatVisibleModels = useMemo(
    () => groupedByWatchlist.flatMap((g) => g.items.map((item) => item.model)),
    [groupedByWatchlist]
  );

  // Watchlist Grid cards (CBExplorer-style filtering by tier + show state + search)
  const gridCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedModels
      .filter((item) => {
        if (tierFilter !== 'all' && item.model.tierId !== tierFilter) {
          return false;
        }
        if (dueOnly && !item.isDue) return false;
        if (gridShowFilter === 'public') {
          if (!item.live || !getShowStatusMeta(item.live.currentShow).isPublic) {
            return false;
          }
        } else if (gridShowFilter === 'online') {
          if (!item.live) return false;
        } else if (gridShowFilter === 'usually_now') {
          if (!item.usuallyNow.isUsuallyLiveNow) return false;
        }
        if (q) {
          const hay =
            `${item.model.username} ${item.model.displayName} ${item.model.notes} ${item.model.tags.join(' ')} ${item.live?.roomSubject ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        compareMonitorTierPriority(
          {
            model: a.model,
            live: a.live,
            usuallyNowScore: a.usuallyNow.scoreMinutes,
          },
          {
            model: b.model,
            live: b.live,
            usuallyNowScore: b.usuallyNow.scoreMinutes,
          },
          tierOrderMap,
          { prioritizeUsuallyNowScore: gridShowFilter === 'usually_now' }
        )
      );
  }, [dueOnly, enrichedModels, gridShowFilter, search, tierFilter, tierOrderMap]);

  const activeModel = useMemo(() => {
    if (selectedModelId) {
      const found = data.models.find((m) => m.id === selectedModelId);
      if (found) return found;
    }
    return flatVisibleModels[0] ?? data.models[0] ?? null;
  }, [data.models, flatVisibleModels, selectedModelId]);

  useEffect(() => {
    if (!selectedModelId && activeModel) {
      onSelectModel(activeModel.id);
    }
  }, [activeModel, onSelectModel, selectedModelId]);

  const hiddenWallSet = useMemo(() => new Set(hiddenWallIds), [hiddenWallIds]);

  const allOnlineModels = useMemo(() => {
    return enrichedModels
      .filter((item) => Boolean(item.live))
      .sort((a, b) =>
        compareMonitorTierPriority(
          { model: a.model, live: a.live },
          { model: b.model, live: b.live },
          tierOrderMap
        )
      )
      .map((item) => item.model);
  }, [enrichedModels, tierOrderMap]);

  const wallEligibleOnlineModels = useMemo(() => {
    if (!wallPublicOnly) return allOnlineModels;
    return allOnlineModels.filter((m) =>
      isPublicShowStatus(liveRoomsByUsername[m.username.toLowerCase()]?.currentShow)
    );
  }, [allOnlineModels, liveRoomsByUsername, wallPublicOnly]);

  const unhiddenOnlineModels = useMemo(
    () => wallEligibleOnlineModels.filter((m) => !hiddenWallSet.has(m.id)),
    [wallEligibleOnlineModels, hiddenWallSet]
  );

  const hiddenOnlineModels = useMemo(
    () => allOnlineModels.filter((m) => hiddenWallSet.has(m.id)),
    [allOnlineModels, hiddenWallSet]
  );

  const scopedOnlineModels = useMemo(() => {
    if (tierFilter === 'all') return unhiddenOnlineModels;
    return unhiddenOnlineModels.filter((m) => m.tierId === tierFilter);
  }, [tierFilter, unhiddenOnlineModels]);

  const wallModels = useMemo(() => {
    const byId = new Map(data.models.map((m) => [m.id, m]));
    return wallIds
      .map((id) => byId.get(id))
      .filter((m): m is ModelRecord => Boolean(m))
      .sort((a, b) =>
        compareMonitorTierPriority(
          {
            model: a,
            live: liveRoomsByUsername[a.username.toLowerCase()],
          },
          {
            model: b,
            live: liveRoomsByUsername[b.username.toLowerCase()],
          },
          tierOrderMap
        )
      );
  }, [data.models, liveRoomsByUsername, tierOrderMap, wallIds]);

  const offlineOnWallCount = useMemo(
    () =>
      wallModels.filter(
        (m) => !liveRoomsByUsername[m.username.toLowerCase()]
      ).length,
    [liveRoomsByUsername, wallModels]
  );

  const togglePin = (modelId: string) => {
    setHiddenWallIds((prev) => prev.filter((id) => id !== modelId));
    setWallIds((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
  };

  const pullOnlineToWall = (
    candidates: ModelRecord[],
    label: string,
    respectHidden = true
  ) => {
    const seen = new Set<string>();
    const onlineOnly: ModelRecord[] = [];
    let skippedNonPublic = 0;

    for (const model of candidates) {
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      const room = liveRoomsByUsername[model.username.toLowerCase()];
      if (!room) continue;
      if (wallPublicOnly && !getShowStatusMeta(room.currentShow).isPublic) {
        skippedNonPublic += 1;
        continue;
      }
      if (respectHidden && hiddenWallSet.has(model.id)) continue;
      onlineOnly.push(model);
    }

    onlineOnly.sort((a, b) =>
      compareMonitorTierPriority(
        { model: a, live: liveRoomsByUsername[a.username.toLowerCase()] },
        { model: b, live: liveRoomsByUsername[b.username.toLowerCase()] },
        tierOrderMap
      )
    );

    if (onlineOnly.length === 0) {
      if (skippedNonPublic > 0 && wallPublicOnly) {
        notify(
          `No public watchable streams in ${label} (${skippedNonPublic} online in private/away — switch Wall filter to "All Live" if needed).`,
          'info'
        );
      } else if (respectHidden && hiddenOnlineModels.length > 0) {
        notify(
          `All online models in ${label} are hidden. Click "Re-add All Active" to restore them.`,
          'info'
        );
      } else {
        notify(
          `No online models found in ${label}. Click Sync Live to refresh online rooms.`,
          'info'
        );
      }
      return;
    }

    setWallIds(onlineOnly.map((m) => m.id));
    setLayoutMode('wall');
    notify(
      `Loaded ${onlineOnly.length} online model(s) from ${label} into Watch Wall.`,
      'success'
    );
  };

  const hideFromWall = (model: ModelRecord) => {
    setWallIds((prev) => prev.filter((id) => id !== model.id));
    setHiddenWallIds((prev) =>
      prev.includes(model.id) ? prev : [...prev, model.id]
    );
  };

  const unhideToWall = (modelId: string) => {
    setHiddenWallIds((prev) => prev.filter((id) => id !== modelId));
    setWallIds((prev) => (prev.includes(modelId) ? prev : [...prev, modelId]));
  };

  const readdAllActiveToWall = () => {
    setHiddenWallIds([]);
    setShowHiddenDrawer(false);
    if (wallEligibleOnlineModels.length === 0) {
      notify(
        allOnlineModels.length > 0 && wallPublicOnly
          ? `No public cams online right now (${allOnlineModels.length} in private/away). Switch Wall filter to "All Live" to show them.`
          : 'No active online models detected right now. Click Sync Live to refresh online rooms.',
        'info'
      );
      return;
    }
    setWallIds(wallEligibleOnlineModels.map((m) => m.id));
    setLayoutMode('wall');
    notify(
      `Re-added all ${wallEligibleOnlineModels.length} active online model(s) onto Watch Wall.`,
      'success'
    );
  };

  const dropOfflineFromWall = () => {
    setWallIds((prev) =>
      prev.filter((id) => {
        const m = data.models.find((x) => x.id === id);
        return Boolean(m && liveRoomsByUsername[m.username.toLowerCase()]);
      })
    );
  };

  const handleCardHoverStart = (modelId: string, canPreview: boolean) => {
    if (!hoverPreviewEnabled || !canPreview) return;
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredModelId(modelId);
    }, 450);
  };

  const handleCardHoverEnd = (modelId: string) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredModelId((prev) => (prev === modelId ? null : prev));
  };

  const handleNextVisibleModel = () => {
    const navList =
      gridCards.length > 0
        ? gridCards.map((c) => c.model)
        : flatVisibleModels;
    if (navList.length === 0) return;
    const idx = activeModel
      ? navList.findIndex((m) => m.id === activeModel.id)
      : -1;
    const next = navList[(idx + 1) % navList.length];
    if (next) {
      onSelectModel(next.id);
      setLayoutMode('single');
    }
  };

  const feedConfigured =
    !data.settings.liveFeed.endpointTemplate.includes('{wm}') ||
    Boolean(data.settings.liveFeed.affiliateWm.trim());

  const activeTier = activeModel ? tierMap.get(activeModel.tierId) : undefined;
  const activeTierColor = activeTier?.color ?? data.inbox.color;
  const activeTierName = activeTier?.name ?? data.inbox.name;
  const activeLiveInfo = activeModel
    ? liveRoomsByUsername[activeModel.username.toLowerCase()]
    : undefined;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-canvas">
      {/* Left Watchlist-Grouped Sidebar */}
      {railOpen && (
        <aside className="w-72 lg:w-80 shrink-0 border-r border-white/[0.08] bg-[#0C0F16] flex flex-col min-h-0">
          <div className="p-3 border-b border-white/[0.07] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setOnlyLive((prev) => {
                    const next = !prev;
                    if (next) setUsuallyNowOnly(false);
                    return next;
                  })
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  onlyLive
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/45 shadow-[0_0_14px_-4px_rgba(16,185,129,0.5)]'
                    : 'bg-white/[0.04] text-slate-300 border-white/10 hover:border-white/20'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    onlyLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {onlyLive
                  ? `Only Live (${totalLiveCount})`
                  : `All Watchlists (${data.models.length})`}
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setUsuallyNowOnly((prev) => {
                      const next = !prev;
                      if (next) setOnlyLive(false);
                      return next;
                    })
                  }
                  title="Filter to models whose 30-day schedule usually aligns around your current local hour (+/- 1h)"
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
                    usuallyNowOnly
                      ? 'bg-sky-500/25 text-sky-200 border-sky-400/50'
                      : 'bg-sky-500/10 text-sky-300 border-sky-500/25 hover:bg-sky-500/20'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {totalUsuallyNowCount}
                </button>

                {totalDueCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDueOnly((v) => !v)}
                    title="Filter to models due for periodic re-sort"
                    className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
                      dueOnly
                        ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/25 hover:bg-amber-500/20'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    {totalDueCount}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    pullOnlineToWall(
                      flatVisibleModels,
                      onlyLive ? 'Live Watchlists' : 'Filtered Watchlists'
                    )
                  }
                  disabled={totalLiveCount === 0}
                  title="Pull all online models matching filters into Watch Wall"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-200 hover:bg-white/10 border border-white/10 disabled:opacity-35"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={onOpenTierManager}
                  title="Edit Watchlists / Playlists & Hotkeys (Ctrl+T)"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search live / watchlist..."
                className="studio-input text-xs pl-8 py-1.5"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className={`px-2 py-1 rounded-md text-[10px] font-medium shrink-0 border transition-colors ${
                  tierFilter === 'all'
                    ? 'bg-indigo-500/25 text-indigo-200 border-indigo-500/40'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:text-white'
                }`}
              >
                All
              </button>
              {sortedTiers.map((t) => {
                const liveInT = enrichedModels.filter(
                  (i) => i.model.tierId === t.id && Boolean(i.live)
                ).length;
                const active = tierFilter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTierFilter(t.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium shrink-0 border transition-colors ${
                      active
                        ? 'bg-white/15 text-white border-white/30'
                        : 'bg-white/[0.03] text-slate-300 border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span>{t.name}</span>
                    {liveInT > 0 && (
                      <span className="text-emerald-300 font-bold">
                        {liveInT}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTierFilter('inbox')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium shrink-0 border transition-colors ${
                  tierFilter === 'inbox'
                    ? 'bg-white/15 text-white border-white/30'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.08] hover:text-white'
                }`}
              >
                <span>{data.inbox.name}</span>
              </button>
            </div>
          </div>

          {/* Grouped Watchlists Sidebar List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
            {onlyLive && totalLiveCount === 0 ? (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] text-center space-y-2.5">
                <p className="text-xs font-medium text-slate-200">
                  {livePollingState.loading
                    ? 'Syncing live status across watchlists...'
                    : 'No models currently live right now'}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Click <strong>Sync</strong> at top-right to fetch live streams, or view all offline &amp; saved models.
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => void refreshLiveFeed(true)}
                    disabled={livePollingState.loading}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  >
                    {livePollingState.loading ? 'Syncing...' : 'Sync Live Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyLive(false)}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200"
                  >
                    Show All Watchlists ({data.models.length})
                  </button>
                </div>
              </div>
            ) : groupedByWatchlist.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <p>No models match the active filters.</p>
                {data.models.length === 0 ? (
                  <button
                    type="button"
                    onClick={onOpenImport}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white"
                  >
                    Import Models
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyLive(false);
                      setUsuallyNowOnly(false);
                      setDueOnly(false);
                      setTierFilter('all');
                      setSearch('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-200"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              groupedByWatchlist.map((group) => {
                const isCollapsed = collapsedTiers.has(group.id);
                return (
                  <div key={group.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-[#131722] border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedTiers((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                        className="flex items-center gap-1.5 min-w-0 text-left flex-1"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-[11px] font-semibold text-slate-100 truncate">
                          {group.name}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-black/40 text-slate-300">
                          {group.items.length}
                        </span>
                        {group.liveCount > 0 && !onlyLive && (
                          <span className="text-[10px] font-semibold text-emerald-400">
                            · {group.liveCount} live
                          </span>
                        )}
                      </button>

                      {group.liveCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            pullOnlineToWall(
                              group.items.map((i) => i.model),
                              group.name
                            )
                          }
                          title={`Pull ${group.name} online models into Watch Wall`}
                          className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-white/10 shrink-0"
                        >
                          <LayoutGrid className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-1 pl-1">
                        {group.items.map(({ model, live, isDue, usuallyNow }) => {
                          const isSelected =
                            activeModel?.id === model.id &&
                            layoutMode === 'single';
                          const isPinned = wallIds.includes(model.id);

                          return (
                            <div
                              key={model.id}
                              onClick={() => {
                                onSelectModel(model.id);
                                setLayoutMode('single');
                              }}
                              className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl cursor-pointer border transition-all ${
                                isSelected
                                  ? 'bg-indigo-500/15 border-indigo-500/40'
                                  : 'bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/[0.07]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ModelAvatar
                                  username={model.username}
                                  displayName={model.displayName}
                                  thumbnail={
                                    live?.imageUrl || model.thumbnail
                                  }
                                  size="xs"
                                  accentColor={group.color}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {live && (
                                      <span
                                        title={`${live.currentShow} (${live.numUsers} viewers)`}
                                        className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                                      />
                                    )}
                                    <span className="text-xs font-medium text-white truncate">
                                      {model.displayName || model.username}
                                    </span>
                                    {!live && usuallyNow.isUsuallyLiveNow && (
                                      <span
                                        title={usuallyNow.label}
                                        className="px-1 rounded text-[9px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/30 shrink-0"
                                      >
                                        Usual
                                      </span>
                                    )}
                                    {isDue && (
                                      <span className="px-1 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-200">
                                        Due
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 truncate">
                                    <span>@{model.username}</span>
                                    {live && live.numUsers > 0 && (
                                      <span className="text-emerald-300/90 inline-flex items-center gap-0.5 font-sans">
                                        <Users className="w-2.5 h-2.5" />
                                        {live.numUsers}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(model.id);
                                }}
                                title={
                                  isPinned
                                    ? 'Remove from Watch Wall'
                                    : 'Add to Silent Watch Wall'
                                }
                                className={`p-1 rounded-md transition-colors shrink-0 ${
                                  isPinned
                                    ? 'text-indigo-300 bg-indigo-500/20'
                                    : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                {isPinned ? (
                                  <PinOff className="w-3 h-3" />
                                ) : (
                                  <Pin className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {totalDueCount > 0 && (
            <div className="p-2.5 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={onJumpToResortDue}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/35 inline-flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                Rapid Re-Sort {totalDueCount} Due Model(s)
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Main Content Area */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-canvas">
        {/* Top WatchPulse Control Strip */}
        <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#0D1018] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              title={
                railOpen ? 'Hide Watchlist sidebar' : 'Show Watchlist sidebar'
              }
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
            >
              {railOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>

            {returnLabel && onReturnBack && (
              <button
                type="button"
                onClick={onReturnBack}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {returnLabel}
              </button>
            )}

            {/* Mode Tabs: Watchlist Grid | Watch Wall | Single Stage */}
            <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  layoutMode === 'grid'
                    ? 'bg-indigo-500/25 text-indigo-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Watchlist Grid
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('wall')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  layoutMode === 'wall'
                    ? 'bg-indigo-500/25 text-indigo-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                Watch Wall ({wallModels.length})
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('single')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  layoutMode === 'single'
                    ? 'bg-indigo-500/25 text-indigo-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Stage
              </button>
            </div>

            {layoutMode === 'single' && activeModel && (
              <div className="flex items-center gap-2 min-w-0 pl-1">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeTierColor }}
                />
                <span className="text-xs font-semibold text-white truncate">
                  {activeModel.displayName || activeModel.username}
                </span>
                <span className="text-[11px] font-mono text-indigo-300/80 hidden lg:inline truncate">
                  @{activeModel.username}
                </span>
                <span className="text-[10px] text-slate-500 hidden xl:inline">
                  ·{' '}
                  {formatRelativeAge(
                    activeModel.lastReviewedAt || activeModel.updatedAt
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(layoutMode === 'wall' || layoutMode === 'single') && (
              <>
                {/* Video-Only Stream Isolation Switch */}
                <button
                  type="button"
                  onClick={() => setVideoOnly((v) => !v)}
                  title="Pull only the pure livestream video player without page overlays or chat"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    videoOnly
                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                      : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  Video Only
                </button>

                {/* Audio Mute Switch */}
                <button
                  type="button"
                  onClick={toggleActiveMuted}
                  title={
                    layoutMode === 'single'
                      ? stageMuted
                        ? 'Unmute Stage audio'
                        : 'Mute Stage audio'
                      : wallMuted
                        ? 'Unmute Watch Wall audio'
                        : 'Mute Watch Wall audio'
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activeMuted
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      : 'bg-amber-500/15 text-amber-200 border-amber-500/35'
                  }`}
                >
                  {activeMuted ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  {activeMuted ? 'Muted' : 'Audio On'}
                </button>
              </>
            )}

            {layoutMode === 'single' && activeModel && (
              <>
                <select
                  value={activeModel.tierId}
                  onChange={(e) => moveModelToTier(activeModel.id, e.target.value)}
                  title={`Playlist / Tier: ${activeTierName}`}
                  className="max-w-[130px] bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
                >
                  <option value="inbox">{data.inbox.name}</option>
                  {sortedTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => toggleManualLiveStatus(activeModel.username)}
                  className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    activeLiveInfo
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  {activeLiveInfo ? 'Live' : 'Mark Live'}
                </button>

                <CbexplorerToggle
                  checked={activeModel.cbexplorerAdded}
                  onToggle={() => toggleCbexplorer(activeModel.id)}
                  size="compact"
                />

                <button
                  type="button"
                  onClick={() => onEditModel(activeModel)}
                  title="Edit notes, tags & heatmap"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {(gridCards.length > 1 || flatVisibleModels.length > 1) && (
                  <button
                    type="button"
                    onClick={handleNextVisibleModel}
                    title="Jump to next model"
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10"
                  >
                    Next
                    <SkipForward className="w-3 h-3" />
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setReloadToken((n) => n + 1);
                setSnapshotTick(Date.now());
              }}
              title="Refresh previews / stage"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {feedConfigured && (
              <button
                type="button"
                onClick={() => void refreshLiveFeed(true)}
                disabled={livePollingState.loading}
                title="Sync live online models across all watchlists"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 disabled:opacity-50"
              >
                <Radio
                  className={`w-3.5 h-3.5 text-emerald-400 ${
                    livePollingState.loading ? 'animate-spin' : ''
                  }`}
                />
                Sync Live
              </button>
            )}

            <button
              type="button"
              onClick={onOpenFeedSettings}
              title="Configure live feed & templates"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-white/10"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Stage Body */}
        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {layoutMode === 'grid' ? (
            <>
              {/* CBExplorer-style Watchlist Grid Toolbar */}
              <div className="px-4 py-2 border-b border-white/[0.07] bg-[#0B0E15] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Show Filter: Public Live / All Online / All Models */}
                  <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setGridShowFilter('public')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors ${
                        gridShowFilter === 'public'
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Public Live ({totalPublicLiveCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridShowFilter('online')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors ${
                        gridShowFilter === 'online'
                          ? 'bg-indigo-500/25 text-indigo-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Online ({totalLiveCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridShowFilter('usually_now')}
                      title="Show models whose 30-day CBExplorer schedule usually matches your current local hour (+/- 1h)"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors ${
                        gridShowFilter === 'usually_now'
                          ? 'bg-sky-500/25 text-sky-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Usually Now ({totalUsuallyNowCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridShowFilter('all')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors ${
                        gridShowFilter === 'all'
                          ? 'bg-white/15 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Models ({data.models.length})
                    </button>
                  </div>

                  {batchActivitySyncState.running && (
                    <button
                      type="button"
                      onClick={cancelBatchActivitySync}
                      title="Stop pulling CBExplorer 90-day schedules"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/35"
                    >
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {`Stop Sync (${batchActivitySyncState.completed}/${batchActivitySyncState.total})`}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      pullOnlineToWall(
                        gridCards.map((c) => c.model),
                        tierFilter === 'all'
                          ? 'Watchlist Grid'
                          : tierMap.get(tierFilter)?.name || data.inbox.name
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Pull Online to Wall ({scopedOnlineModels.length})
                  </button>

                  {wallModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLayoutMode('wall')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-200 border border-indigo-500/35"
                    >
                      Open Wall ({wallModels.length})
                    </button>
                  )}
                </div>

                <div className="relative flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGridMenuOpen((v) => !v)}
                    title="Grid columns, hover preview, schedules & hidden models"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      gridMenuOpen
                        ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40'
                        : 'bg-white/[0.04] text-slate-300 border-white/10 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Options
                    {unsyncedScheduleCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    )}
                  </button>

                  {gridMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setGridMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-[#131722] border border-white/15 shadow-2xl p-3 space-y-3 z-30">
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Grid Columns
                          </div>
                          <div className="grid grid-cols-5 gap-1 p-0.5 rounded-lg bg-black/40 border border-white/10 text-[11px]">
                            {(['auto', 2, 3, 4, 5] as const).map((cols) => (
                              <button
                                key={String(cols)}
                                type="button"
                                onClick={() => setGridCols(cols)}
                                className={`py-1 rounded font-medium transition-colors ${
                                  gridCols === cols
                                    ? 'bg-indigo-500/25 text-indigo-200'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                {cols === 'auto' ? 'Auto' : `${cols}x`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setHoverPreviewEnabled((v) => !v)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            hoverPreviewEnabled
                              ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35'
                              : 'bg-white/[0.03] text-slate-300 border-white/10'
                          }`}
                        >
                          <span>Hover Live Preview</span>
                          <span>{hoverPreviewEnabled ? 'On' : 'Off'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (batchActivitySyncState.running) {
                              cancelBatchActivitySync();
                            } else {
                              void syncStaleModelsActivity();
                            }
                            setGridMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/30 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <RefreshCw
                              className={`w-3 h-3 ${
                                batchActivitySyncState.running ? 'animate-spin' : ''
                              }`}
                            />
                            {batchActivitySyncState.running
                              ? `Stop Sync (${batchActivitySyncState.completed}/${batchActivitySyncState.total})`
                              : unsyncedScheduleCount > 0
                                ? `Sync Schedules (${data.models.length - unsyncedScheduleCount}/${data.models.length})`
                                : 'Refresh Schedules'}
                          </span>
                        </button>

                        {hiddenOnlineModels.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              readdAllActiveToWall();
                              setGridMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/10"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Re-add All Active ({wallEligibleOnlineModels.length})
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Grid Cards Body */}
              {gridCards.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-indigo-300" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">
                    {data.models.length === 0
                      ? 'Import a Watchlist to Begin'
                      : livePollingState.loading
                        ? 'Checking Who Is Live...'
                        : 'No Models Match This Live Filter'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {data.models.length === 0
                      ? 'Import CSV rows, handles, or paste a CBExplorer list URL like https://cbexplorer.com/lists/... inside Import Models.'
                      : 'Switch to "All Models" above to view offline watchlist profiles, or click Sync Live to re-check active rooms.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {data.models.length === 0 ? (
                      <button
                        type="button"
                        onClick={onOpenImport}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Import Watchlist / Models
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void refreshLiveFeed(true)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          Sync Live Now
                        </button>
                        <button
                          type="button"
                          onClick={() => setGridShowFilter('all')}
                          className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/10"
                        >
                          Show All Models ({data.models.length})
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`flex-1 overflow-y-auto p-3 grid gap-3 auto-rows-max ${
                    gridCols === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : gridCols === 3
                        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : gridCols === 4
                          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                          : gridCols === 5
                            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  }`}
                >
                  {gridCards.map(({ model, live, usuallyNow }) => {
                    const cardTier = tierMap.get(model.tierId);
                    const cardColor = cardTier?.color ?? data.inbox.color;
                    const statusMeta = live
                      ? getShowStatusMeta(live.currentShow)
                      : null;
                    const isHoverPlaying =
                      hoverPreviewEnabled &&
                      hoveredModelId === model.id &&
                      Boolean(live) &&
                      Boolean(statusMeta?.isPublic);
                    const isOnWall = wallIds.includes(model.id);
                    const isHidden = hiddenWallSet.has(model.id);
                    const snapshotUrl = live
                      ? `https://thumb.live.mmcdn.com/ri/${encodeURIComponent(
                          model.username
                        )}.jpg?t=${snapshotTick}`
                      : model.thumbnail;

                    return (
                      <div
                        key={model.id}
                        onMouseEnter={() =>
                          handleCardHoverStart(
                            model.id,
                            Boolean(live && statusMeta?.isPublic)
                          )
                        }
                        onMouseLeave={() => handleCardHoverEnd(model.id)}
                        className={`group flex flex-col rounded-xl overflow-hidden border transition-all bg-[#0D1018] ${
                          live
                            ? 'border-white/12 hover:border-indigo-400/50 shadow-md'
                            : 'border-white/[0.06] opacity-70 hover:opacity-100'
                        }`}
                      >
                        {/* 16:9 Live Preview Area */}
                        <div
                          onClick={() => {
                            onSelectModel(model.id);
                            setLayoutMode('single');
                          }}
                          className="relative aspect-video bg-black cursor-pointer overflow-hidden"
                        >
                          {isHoverPlaying ? (
                            <LiveStreamPlayer
                              username={model.username}
                              muted
                              videoOnly={videoOnly}
                              embedTemplate={data.settings.urlTemplates.livePreview}
                              liveRoom={live}
                              compact
                            />
                          ) : snapshotUrl && failedThumbs[model.id] !== snapshotUrl ? (
                            <img
                              src={snapshotUrl}
                              alt={model.displayName || model.username}
                              loading="lazy"
                              onError={() =>
                                setFailedThumbs((prev) => ({
                                  ...prev,
                                  [model.id]: snapshotUrl,
                                }))
                              }
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#090B10]">
                              <ModelAvatar
                                username={model.username}
                                displayName={model.displayName}
                                thumbnail={
                                  failedThumbs[model.id] === model.thumbnail
                                    ? undefined
                                    : model.thumbnail
                                }
                                size="lg"
                                accentColor={cardColor}
                              />
                            </div>
                          )}

                          {/* Status Badges Top-Left */}
                          <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                            {statusMeta ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border backdrop-blur-sm ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.isPublic ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                ) : live?.currentShow === 'away' ? (
                                  <Clock className="w-2.5 h-2.5" />
                                ) : (
                                  <Lock className="w-2.5 h-2.5" />
                                )}
                                {statusMeta.label}
                              </span>
                            ) : !live && usuallyNow.isUsuallyLiveNow ? (
                              <span
                                title={usuallyNow.label}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border backdrop-blur-sm bg-sky-500/25 text-sky-200 border-sky-400/40"
                              >
                                <Clock className="w-2.5 h-2.5" />
                                USUALLY NOW · {usuallyNow.confidencePct}%
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/75 text-slate-400 border border-white/10">
                                OFFLINE
                              </span>
                            )}
                            {live && live.numUsers > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-black/75 text-white border border-white/10">
                                <Users className="w-2.5 h-2.5 text-emerald-400" />
                                {live.numUsers.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* Card Wall Pick / Hide Top-Right */}
                          <div
                            className="absolute top-2 right-2 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {live && (
                              <button
                                type="button"
                                onClick={() => togglePin(model.id)}
                                title={
                                  isOnWall
                                    ? 'Remove from Watch Wall selection'
                                    : 'Select for Watch Wall'
                                }
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border backdrop-blur-sm transition-all ${
                                  isOnWall
                                    ? 'bg-indigo-600 text-white border-indigo-400 opacity-100'
                                    : 'bg-black/70 text-slate-200 border-white/15 hover:bg-indigo-600/80 opacity-0 group-hover:opacity-100 focus:opacity-100'
                                }`}
                              >
                                {isOnWall ? (
                                  <CheckSquare className="w-3 h-3" />
                                ) : (
                                  <Square className="w-3 h-3" />
                                )}
                                Wall
                              </button>
                            )}
                            {live && !isHidden && (
                              <button
                                type="button"
                                onClick={() => hideFromWall(model)}
                                title="Hide from Watch Wall pulls"
                                className="p-1 rounded-md bg-black/70 text-slate-300 hover:text-amber-200 hover:bg-amber-500/30 border border-white/15 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              >
                                <EyeOff className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="p-2.5 space-y-1.5 bg-[#0E121B]">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectModel(model.id);
                                setLayoutMode('single');
                              }}
                              className="flex items-center gap-1.5 min-w-0 text-left hover:text-indigo-300"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cardColor }}
                              />
                              <span className="text-xs font-semibold text-white truncate">
                                {model.displayName || model.username}
                              </span>
                            </button>

                            <select
                              value={model.tierId}
                              onChange={(e) =>
                                moveModelToTier(model.id, e.target.value)
                              }
                              className="max-w-[95px] bg-black/50 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-slate-200 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            >
                              <option value="inbox">{data.inbox.name}</option>
                              {sortedTiers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {live?.roomSubject ? (
                            <p className="text-[11px] text-slate-400 truncate">
                              {live.roomSubject}
                            </p>
                          ) : (
                            <p className="text-[11px] font-mono text-slate-500 truncate">
                              @{model.username}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : layoutMode === 'wall' ? (
            <>
              {/* Watch Wall Toolbar */}
              <div className="px-4 py-2 border-b border-white/[0.07] bg-[#0B0E15] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      pullOnlineToWall(
                        tierFilter === 'all' ? wallEligibleOnlineModels : scopedOnlineModels,
                        tierFilter === 'all'
                          ? 'All Watchlists'
                          : tierMap.get(tierFilter)?.name || data.inbox.name
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    {tierFilter === 'all'
                      ? `Pull Online Only (${unhiddenOnlineModels.length})`
                      : `Pull ${tierMap.get(tierFilter)?.name || data.inbox.name} Online (${scopedOnlineModels.length})`}
                  </button>

                  {tierFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() =>
                        pullOnlineToWall(wallEligibleOnlineModels, 'All Watchlists')
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/10"
                    >
                      All Online ({unhiddenOnlineModels.length})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={readdAllActiveToWall}
                    disabled={wallEligibleOnlineModels.length === 0}
                    title="Unhide any hidden models and load all active online models onto Watch Wall"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/35 disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Re-add All Active ({wallEligibleOnlineModels.length})
                  </button>

                  {hiddenOnlineModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHiddenDrawer((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        showHiddenDrawer
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                          : 'bg-white/[0.04] text-slate-300 border-white/10 hover:text-white'
                      }`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Hidden ({hiddenOnlineModels.length})
                    </button>
                  )}

                  {offlineOnWallCount > 0 && (
                    <button
                      type="button"
                      onClick={dropOfflineFromWall}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30"
                    >
                      Drop Offline ({offlineOnWallCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/10 text-[11px]"
                    title="Choose whether Watch Wall pulls only watchable Public streams or also Private/Away/Hidden rooms"
                  >
                    <button
                      type="button"
                      onClick={() => setWallPublicOnly(true)}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        wallPublicOnly
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Public Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setWallPublicOnly(false)}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        !wallPublicOnly
                          ? 'bg-amber-500/25 text-amber-200'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All Live
                    </button>
                  </div>

                  <select
                    value={String(wallCols)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWallCols(
                        val === 'auto' ? 'auto' : (Number(val) as 2 | 3 | 4)
                      );
                    }}
                    title="Watch Wall columns"
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-400"
                  >
                    <option value="auto">Auto Cols</option>
                    <option value="2">2 Cols</option>
                    <option value="3">3 Cols</option>
                    <option value="4">4 Cols</option>
                  </select>
                </div>
              </div>

              {showHiddenDrawer && hiddenOnlineModels.length > 0 && (
                <div className="px-4 py-2 border-b border-white/[0.07] bg-[#111521] flex flex-wrap items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-medium text-slate-400 mr-1">
                    Hidden Active Models (click to restore):
                  </span>
                  {hiddenOnlineModels.map((hm) => (
                    <button
                      key={hm.id}
                      type="button"
                      onClick={() => unhideToWall(hm.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/[0.07] hover:bg-emerald-500/25 text-slate-200 hover:text-emerald-200 border border-white/10"
                    >
                      <span>+</span>
                      <span>{hm.displayName || hm.username}</span>
                    </button>
                  ))}
                </div>
              )}

              {wallModels.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                    <LayoutGrid className="w-6 h-6 text-indigo-300" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">
                    Silent Watch Wall (Video Only)
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pull all currently active online models into a multi-stream muted video wall, hide unnecessary streams anytime, and restore all active models with one click.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {wallEligibleOnlineModels.length > 0 ? (
                      <button
                        type="button"
                        onClick={readdAllActiveToWall}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        Pull All Online Models ({wallEligibleOnlineModels.length})
                      </button>
                    ) : allOnlineModels.length > 0 && wallPublicOnly ? (
                      <button
                        type="button"
                        onClick={() => setWallPublicOnly(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white"
                      >
                        Include {allOnlineModels.length} Private / Away Room(s)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void refreshLiveFeed(true)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Sync Live Models
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`flex-1 min-h-0 p-2 bg-[#07090E] grid gap-2 ${
                    wallCols === 'auto' && wallModels.length <= 4
                      ? wallModels.length === 1
                        ? 'grid-cols-1 grid-rows-1 overflow-hidden'
                        : wallModels.length === 2
                          ? 'grid-cols-1 md:grid-cols-2 grid-rows-1 overflow-hidden'
                          : 'grid-cols-2 grid-rows-2 overflow-hidden'
                      : wallCols === 2
                        ? 'grid-cols-1 md:grid-cols-2 overflow-y-auto auto-rows-max'
                        : wallCols === 4
                          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 overflow-y-auto auto-rows-max'
                          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 overflow-y-auto auto-rows-max'
                  }`}
                >
                  {wallModels.map((model) => {
                    const tileTier = tierMap.get(model.tierId);
                    const tileColor = tileTier?.color ?? data.inbox.color;
                    const tileLive =
                      liveRoomsByUsername[model.username.toLowerCase()];
                    const isFixedScrollTile =
                      wallCols !== 'auto' || wallModels.length > 4;

                    return (
                      <div
                        key={model.id}
                        className={`relative flex flex-col rounded-xl overflow-hidden border bg-[#0B0D14] ${
                          tileLive
                            ? 'border-emerald-500/25'
                            : 'border-white/10 opacity-80'
                        } ${isFixedScrollTile ? 'aspect-video min-h-[240px]' : 'h-full min-h-0'}`}
                      >
                        <div className="px-2.5 py-1.5 bg-[#11141E] border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tileColor }}
                            />
                            {tileLive ? (
                              <span
                                title={`${tileLive.currentShow} (${tileLive.numUsers} viewers)`}
                                className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                              />
                            ) : (
                              <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-slate-700/60 text-slate-300 shrink-0">
                                Offline
                              </span>
                            )}
                            <span className="text-xs font-semibold text-white truncate">
                              {model.displayName || model.username}
                            </span>
                            {tileLive && tileLive.numUsers > 0 && (
                              <span className="text-[10px] text-emerald-300/90 shrink-0">
                                {tileLive.numUsers}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <select
                              value={model.tierId}
                              onChange={(e) =>
                                moveModelToTier(model.id, e.target.value)
                              }
                              className="max-w-[90px] bg-black/50 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                            >
                              <option value="inbox">{data.inbox.name}</option>
                              {sortedTiers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectModel(model.id);
                                setLayoutMode('single');
                              }}
                              title="Focus in Single Stage"
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => hideFromWall(model)}
                              title="Hide unnecessary model from Watch Wall"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-300 hover:text-amber-200 hover:bg-amber-500/20"
                            >
                              <EyeOff className="w-3 h-3" />
                              Hide
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0">
                          <LiveStreamPlayer
                            username={model.username}
                            muted={wallMuted}
                            videoOnly={videoOnly}
                            embedTemplate={data.settings.urlTemplates.livePreview}
                            reloadToken={reloadToken}
                            liveRoom={tileLive}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : !activeModel ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-300" />
              </div>
              <h3 className="text-sm font-semibold text-white">
                Add or Import Models to Monitor
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Import your watchlist CSV or paste a CBExplorer list URL first to watch and evaluate a model in Stage view.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Import / Add Models
                </button>
              </div>
            </div>
          ) : (
            <LiveStreamPlayer
              username={activeModel.username}
              muted={stageMuted}
              videoOnly={videoOnly}
              embedTemplate={data.settings.urlTemplates.livePreview}
              reloadToken={reloadToken}
              liveRoom={activeLiveInfo}
            />
          )}
        </div>
      </section>
    </div>
  );
};
