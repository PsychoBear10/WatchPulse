import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Keyboard,
  Link2,
  MonitorPlay,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Radio,
  RotateCcw,
  SkipForward,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import { CustomLink, ModelRecord } from '../../types/models';
import { isEditableTarget } from '../../utils/hotkeys';
import { formatRelativeAge, getModelReviewStatus } from '../../utils/review';
import { normalizeExternalUrl, sanitizeUsername } from '../../utils/sanitizer';
import { ActivityHeatmap } from '../common/ActivityHeatmap';
import { CbexplorerToggle } from '../common/CbexplorerToggle';
import { LinkPillGroup } from '../common/LinkPillGroup';
import { ModelAvatar } from '../common/ModelAvatar';
import { TagInput } from '../common/TagInput';

interface RapidSorterViewProps {
  hasOpenModal: boolean;
  onOpenImport: () => void;
  onOpenTierManager: () => void;
  onOpenDataGrid: () => void;
  onSilentPreview: (model: ModelRecord) => void;
  onRequestDelete: (models: ModelRecord[]) => void;
}

interface DeckHistoryEntry {
  action: 'sort' | 'skip';
  modelId: string;
  previousTierId: string;
  previousOrder: number;
  previousReviewedAt?: string;
  previousSkippedIds: string[];
}

export const RapidSorterView: React.FC<RapidSorterViewProps> = ({
  hasOpenModal,
  onOpenImport,
  onOpenTierManager,
  onOpenDataGrid,
  onSilentPreview,
  onRequestDelete,
}) => {
  const {
    data,
    allKnownTags,
    liveRoomsByUsername,
    moveModelToTier,
    markModelReviewed,
    updateModel,
    toggleCbexplorer,
    updateSettings,
    loadDemoModels,
    notify,
  } = useAppStore();

  const [pendingWatchlistOnly, setPendingWatchlistOnly] = useState(false);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [deckHistory, setDeckHistory] = useState<DeckHistoryEntry[]>([]);
  const [sessionSorted, setSessionSorted] = useState(0);
  const [showInspector, setShowInspector] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');

  // Quick-add custom link draft inside inspector
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Drop deleted/trashed model IDs from skippedIds so stale skips never accumulate
  useEffect(() => {
    setSkippedIds((prev) => {
      if (prev.length === 0) return prev;
      const validIds = new Set(data.models.map((m) => m.id));
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [data.models]);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const tierById = useMemo(() => {
    const map = new Map<string, (typeof sortedTiers)[number]>();
    for (const t of sortedTiers) map.set(t.id, t);
    return map;
  }, [sortedTiers]);

  const sourceFilter = data.settings.deckSourceFilter || 'inbox';

  const dueCount = useMemo(() => {
    const nowMs = Date.now();
    return data.models.filter((m) =>
      getModelReviewStatus(
        m,
        tierById.get(m.tierId),
        data.settings.defaultReviewCadenceDays,
        data.settings.staleOfflineDays,
        nowMs
      ).isDueForReview
    ).length;
  }, [
    data.models,
    data.settings.defaultReviewCadenceDays,
    data.settings.staleOfflineDays,
    tierById,
  ]);

  const filteredModels = useMemo(() => {
    const nowMs = Date.now();
    return data.models
      .filter((m) => {
        if (sourceFilter === '__due__') {
          const st = getModelReviewStatus(
            m,
            tierById.get(m.tierId),
            data.settings.defaultReviewCadenceDays,
            data.settings.staleOfflineDays,
            nowMs
          );
          if (!st.isDueForReview) return false;
        } else if (sourceFilter !== 'all' && m.tierId !== sourceFilter) {
          return false;
        }
        if (pendingWatchlistOnly && m.cbexplorerAdded) return false;
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [
    data.models,
    data.settings.defaultReviewCadenceDays,
    data.settings.staleOfflineDays,
    pendingWatchlistOnly,
    sourceFilter,
    tierById,
  ]);

  // Put skipped cards at the back of the queue so skipped items cycle cleanly
  const orderedDeck = useMemo(() => {
    if (skippedIds.length === 0) return filteredModels;
    const skipRank = new Map<string, number>();
    skippedIds.forEach((id, idx) => skipRank.set(id, idx));

    const unskipped: ModelRecord[] = [];
    const skipped: ModelRecord[] = [];
    for (const model of filteredModels) {
      if (skipRank.has(model.id)) {
        skipped.push(model);
      } else {
        unskipped.push(model);
      }
    }
    skipped.sort((a, b) => (skipRank.get(a.id) ?? 0) - (skipRank.get(b.id) ?? 0));
    return [...unskipped, ...skipped];
  }, [filteredModels, skippedIds]);

  const activeModel = orderedDeck[0] ?? null;
  const nextModel = orderedDeck[1] ?? null;

  const activeTierMeta = useMemo(() => {
    if (!activeModel) return null;
    if (activeModel.tierId === 'inbox') {
      return { name: data.inbox.name, color: data.inbox.color };
    }
    const found = sortedTiers.find((t) => t.id === activeModel.tierId);
    return found
      ? { name: found.name, color: found.color }
      : { name: data.inbox.name, color: data.inbox.color };
  }, [activeModel, data.inbox, sortedTiers]);

  const triggerFlash = useCallback((color: string) => {
    setFlashColor(color);
    window.setTimeout(() => setFlashColor(null), 260);
  }, []);

  const handleAssignTier = useCallback(
    (targetTierId: string, color: string) => {
      if (!activeModel) return;
      setDeckHistory((prev) => [
        ...prev.slice(-49),
        {
          action: 'sort',
          modelId: activeModel.id,
          previousTierId: activeModel.tierId,
          previousOrder: activeModel.order,
          previousReviewedAt: activeModel.lastReviewedAt,
          previousSkippedIds: skippedIds,
        },
      ]);

      // Remove from skipped list if it was skipped earlier
      setSkippedIds((prev) => prev.filter((id) => id !== activeModel.id));
      triggerFlash(color);

      if (activeModel.tierId === targetTierId) {
        markModelReviewed(activeModel.id, false);
        if (sourceFilter !== '__due__') {
          setSkippedIds((prev) => [
            ...prev.filter((id) => id !== activeModel.id),
            activeModel.id,
          ]);
        }
      } else {
        moveModelToTier(activeModel.id, targetTierId);
      }

      setSessionSorted((c) => c + 1);
    },
    [
      activeModel,
      markModelReviewed,
      moveModelToTier,
      skippedIds,
      sourceFilter,
      triggerFlash,
    ]
  );

  const handleSkip = useCallback(() => {
    if (!activeModel) return;
    setDeckHistory((prev) => [
      ...prev.slice(-49),
      {
        action: 'skip',
        modelId: activeModel.id,
        previousTierId: activeModel.tierId,
        previousOrder: activeModel.order,
        previousSkippedIds: skippedIds,
      },
    ]);
    setSkippedIds((prev) => [
      ...prev.filter((id) => id !== activeModel.id),
      activeModel.id,
    ]);
  }, [activeModel, skippedIds]);

  const handleUndo = useCallback(() => {
    if (deckHistory.length === 0) return;
    const last = deckHistory[deckHistory.length - 1];
    setDeckHistory((prev) => prev.slice(0, -1));
    setSkippedIds(last.previousSkippedIds);

    if (last.action === 'sort') {
      const exists = data.models.some((m) => m.id === last.modelId);
      if (exists) {
        moveModelToTier(last.modelId, last.previousTierId, last.previousOrder, false);
        updateModel(last.modelId, { lastReviewedAt: last.previousReviewedAt });
        setSessionSorted((c) => Math.max(0, c - 1));
      }
      notify('Undid last card sort', 'info');
    } else {
      notify('Restored skipped card', 'info');
    }
  }, [data.models, deckHistory, moveModelToTier, notify, updateModel]);

  useEffect(() => {
    setUsernameDraft(activeModel?.username ?? '');
  }, [activeModel?.id, activeModel?.username]);

  const commitUsernameDraft = useCallback(() => {
    if (!activeModel) return;
    const clean = sanitizeUsername(usernameDraft);
    if (!clean) {
      setUsernameDraft(activeModel.username);
      notify('Username cannot be empty.', 'error');
      return;
    }
    if (clean === activeModel.username) {
      setUsernameDraft(clean);
      return;
    }
    const res = updateModel(activeModel.id, { username: clean }, true);
    if (!res.ok) {
      setUsernameDraft(activeModel.username);
      notify(res.error || 'Could not update username.', 'error');
      return;
    }
    setUsernameDraft(clean);
  }, [activeModel, notify, updateModel, usernameDraft]);

  // Global keyboard sorting listener for Rapid Sorter
  useEffect(() => {
    if (hasOpenModal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Pressing Escape inside an inspector field returns focus to keyboard sorting
      if (e.key === 'Escape' && isEditableTarget(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }

      if (isEditableTarget(e.target)) return;

      const keyUpper = e.key.toUpperCase();

      if (keyUpper === 'Z' || e.key === 'Backspace') {
        if (deckHistory.length > 0) {
          e.preventDefault();
          handleUndo();
        }
        return;
      }

      if (!activeModel) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handleSkip();
        return;
      }

      const matchedTier = sortedTiers.find(
        (t) => t.hotkey && t.hotkey.toUpperCase() === keyUpper
      );
      if (matchedTier) {
        e.preventDefault();
        handleAssignTier(matchedTier.id, matchedTier.color);
        return;
      }

      if (data.inbox.hotkey && data.inbox.hotkey.toUpperCase() === keyUpper) {
        e.preventDefault();
        handleAssignTier('inbox', data.inbox.color);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeModel,
    data.inbox.color,
    data.inbox.hotkey,
    deckHistory.length,
    handleAssignTier,
    handleSkip,
    handleUndo,
    hasOpenModal,
    sortedTiers,
  ]);

  const handlePickImage = async () => {
    if (!activeModel) return;
    const res = await desktopBridge.openImageFile();
    if (!res.canceled && res.mediaUrl) {
      updateModel(activeModel.id, { thumbnail: res.mediaUrl });
      notify('Thumbnail updated', 'success');
    }
  };

  const handleAddCustomLink = () => {
    if (!activeModel) return;
    const cleanUrl = normalizeExternalUrl(newLinkUrl);
    if (!cleanUrl) return;
    const newItem: CustomLink = {
      id: `lnk_${Date.now()}`,
      label: newLinkLabel.trim() || 'Recording',
      url: cleanUrl,
    };
    updateModel(activeModel.id, {
      customLinks: [...activeModel.customLinks, newItem],
    });
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveCustomLink = (linkId: string) => {
    if (!activeModel) return;
    updateModel(activeModel.id, {
      customLinks: activeModel.customLinks.filter((l) => l.id !== linkId),
    });
  };

  const handleDeleteCurrent = () => {
    if (!activeModel) return;
    onRequestDelete([activeModel]);
  };

  const countForFilter = (id: string) =>
    id === 'all'
      ? data.models.length
      : data.models.filter((m) => m.tierId === id).length;

  const showHints = data.settings.showKeyboardHints;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-header Deck Controls */}
      <div className="px-5 py-3 border-b border-white/[0.07] bg-[#0C0F16] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Deck Queue:</span>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSkippedIds([]);
                updateSettings({ deckSourceFilter: e.target.value });
              }}
              className="bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="inbox">
                {data.inbox.name} ({countForFilter('inbox')})
              </option>
              <option value="__due__">
                Due for Re-sort ({dueCount})
              </option>
              <option value="all">
                All Models ({countForFilter('all')})
              </option>
              {sortedTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({countForFilter(t.id)})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setPendingWatchlistOnly((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              pendingWatchlistOnly
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-white/[0.03] text-slate-400 border-white/10 hover:text-slate-200'
            }`}
          >
            {pendingWatchlistOnly ? '✓ Not Yet on CBExplorer' : 'Filter: Not on CBExplorer'}
          </button>

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07] text-xs text-slate-400">
            <span>
              <strong className="text-slate-100">{orderedDeck.length}</strong> in queue
            </span>
            <span className="text-slate-600">•</span>
            <span>
              <strong className="text-indigo-300">{sessionSorted}</strong> sorted this session
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={deckHistory.length === 0}
            title="Undo last sort or skip (Z or Backspace)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-200 hover:bg-white/[0.09] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo
            {showHints && <kbd className="kbd-cap ml-0.5">Z</kbd>}
          </button>

          <button
            type="button"
            onClick={() => setShowInspector((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.09] transition-colors"
          >
            {showInspector ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            Quick Edit
          </button>
        </div>
      </div>

      {/* Main Split Stage */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Center Deck Stage */}
        <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-y-auto relative">
          <div className="w-full flex items-center justify-start shrink-0 mb-2">
            <button
              type="button"
              onClick={onOpenDataGrid}
              title="Open Data Grid table for bulk editing & multi-column sorting (Ctrl+4)"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#131722] hover:bg-[#191F2E] text-slate-200 hover:text-white border border-white/10 hover:border-indigo-400/40 shadow-md transition-all"
            >
              <Table2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Open Data Grid</span>
              {showHints && <kbd className="kbd-cap text-[10px]">Ctrl+4</kbd>}
            </button>
          </div>
          {!activeModel ? (
            <div className="my-auto max-w-md text-center space-y-4 p-8 rounded-2xl bg-[#11141D] border border-white/[0.08] shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                {data.models.length === 0 ? (
                  <Upload className="w-6 h-6 text-indigo-300" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                )}
              </div>

              {data.models.length === 0 ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Your Model Deck is Empty
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      Import a CSV or paste usernames/URLs to automatically sanitize handles,
                      generate CBHours, CBExplorer & ArchiveBate links, and sort rapidly with hotkeys.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={onOpenImport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Import CSV / Paste List
                    </button>
                    <button
                      type="button"
                      onClick={loadDemoModels}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/10 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Load 5 Sample Models
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Queue Complete!
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5">
                      No remaining models match the active deck filter. Switch the Deck Queue above,
                      turn off the CBExplorer filter, or import more models.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {sourceFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => updateSettings({ deckSourceFilter: 'all' })}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                      >
                        Browse All Models ({data.models.length})
                      </button>
                    )}
                    {pendingWatchlistOnly && (
                      <button
                        type="button"
                        onClick={() => setPendingWatchlistOnly(false)}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/10 transition-colors"
                      >
                        Show Watchlisted Too
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenImport}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/10 transition-colors"
                    >
                      Import More
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl my-auto flex flex-col items-center gap-5">
              {/* Stacked Card Container */}
              <div className="relative w-full">
                {nextModel && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-4 -bottom-2.5 h-full rounded-2xl bg-[#131722] border border-white/[0.06] opacity-70 pointer-events-none"
                  />
                )}

                <div
                  key={activeModel.id}
                  className="relative rounded-2xl bg-[#141824] border border-white/[0.1] shadow-2xl p-6 space-y-5 animate-card-enter transition-shadow"
                  style={
                    flashColor
                      ? {
                          boxShadow: `0 0 0 2px ${flashColor}, 0 24px 60px -12px ${flashColor}55`,
                        }
                      : undefined
                  }
                >
                  {/* Card Header: Avatar + Identity + Current Tier + Delete */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <ModelAvatar
                        username={activeModel.username}
                        displayName={activeModel.displayName}
                        thumbnail={activeModel.thumbnail}
                        size="xl"
                        accentColor={activeTierMeta?.color}
                      />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
                            style={{
                              backgroundColor: `${activeTierMeta?.color ?? '#94A3B8'}18`,
                              borderColor: `${activeTierMeta?.color ?? '#94A3B8'}45`,
                              color: activeTierMeta?.color ?? '#E2E8F0',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: activeTierMeta?.color }}
                            />
                            {activeTierMeta?.name}
                          </span>

                          {skippedIds.includes(activeModel.id) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Skipped earlier
                            </span>
                          )}

                          {liveRoomsByUsername[activeModel.username.toLowerCase()] && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                              <Radio className="w-2.5 h-2.5 animate-pulse" />
                              LIVE · {liveRoomsByUsername[activeModel.username.toLowerCase()].numUsers.toLocaleString()}
                            </span>
                          )}

                          {getModelReviewStatus(
                            activeModel,
                            tierById.get(activeModel.tierId),
                            data.settings.defaultReviewCadenceDays,
                            data.settings.staleOfflineDays
                          ).isDueForReview && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/35">
                              <Clock className="w-2.5 h-2.5" />
                              Re-sort Due
                            </span>
                          )}
                        </div>

                        <h2 className="text-2xl font-bold tracking-tight text-white truncate">
                          {activeModel.displayName || activeModel.username}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-indigo-300/90 truncate">
                          <span>@{activeModel.username}</span>
                          <span className="text-slate-600 font-sans">•</span>
                          <span className="font-sans text-[11px] text-slate-400">
                            Reviewed {formatRelativeAge(activeModel.lastReviewedAt || activeModel.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSilentPreview(activeModel)}
                        title="Open Silent Live View (muted)"
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-indigo-600/30 text-slate-200 border border-white/10 hover:border-indigo-400/50 transition-colors"
                      >
                        <MonitorPlay className="w-3.5 h-3.5 text-indigo-300" />
                        Silent View
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCurrent}
                        title="Delete model"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-white/[0.08] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Prominent CBExplorer Watchlist Switch */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <CbexplorerToggle
                      checked={activeModel.cbexplorerAdded}
                      onToggle={() => toggleCbexplorer(activeModel.id)}
                    />
                    <div className="text-[11px] text-slate-500">
                      {nextModel ? (
                        <span>
                          Up next:{' '}
                          <span className="text-slate-300 font-mono">
                            @{nextModel.username}
                          </span>
                        </span>
                      ) : (
                        <span>Last card in queue</span>
                      )}
                    </div>
                  </div>

                  {/* Compact Inline Profile Links */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Links
                    </span>
                    <LinkPillGroup
                      username={activeModel.username}
                      originalLink={activeModel.originalLink}
                      customLinks={activeModel.customLinks}
                      variant="compact"
                      showOpenAll
                    />
                  </div>

                  {/* Notes & Tags Preview */}
                  {(activeModel.notes.trim() || activeModel.tags.length > 0) && (
                    <div className="space-y-2.5 pt-1">
                      {activeModel.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activeModel.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/12 text-indigo-200 border border-indigo-500/25"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {activeModel.notes.trim() && (
                        <p className="text-xs text-slate-300 leading-relaxed bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2.5 whitespace-pre-wrap">
                          {activeModel.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Tier Action Deck */}
              <div className="w-full space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {sortedTiers.length === 0 ? (
                    <button
                      type="button"
                      onClick={onOpenTierManager}
                      className="px-4 py-2.5 rounded-xl text-xs font-medium bg-indigo-500/15 text-indigo-200 border border-indigo-500/35 hover:bg-indigo-500/25 transition-colors"
                    >
                      + Create Custom Tiers in Tier Manager
                    </button>
                  ) : (
                    sortedTiers.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => handleAssignTier(tier.id, tier.color)}
                        className="group relative inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[#161B28] hover:bg-[#1E2436] text-slate-100 border transition-all active:scale-[0.98]"
                        style={{
                          borderColor: `${tier.color}55`,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tier.color }}
                        />
                        <span>{tier.name}</span>
                        {showHints && tier.hotkey && (
                          <kbd className="kbd-cap ml-0.5">{tier.hotkey}</kbd>
                        )}
                      </button>
                    ))
                  )}

                  {sourceFilter !== 'inbox' && (
                    <button
                      type="button"
                      onClick={() => handleAssignTier('inbox', data.inbox.color)}
                      className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium bg-[#141822] hover:bg-[#1C2130] text-slate-300 border border-white/15 transition-all"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: data.inbox.color }}
                      />
                      <span>{data.inbox.name}</span>
                      {showHints && data.inbox.hotkey && (
                        <kbd className="kbd-cap">{data.inbox.hotkey}</kbd>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSkip}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10 transition-all active:scale-[0.98]"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>Skip</span>
                    {showHints && <kbd className="kbd-cap">Space</kbd>}
                  </button>
                </div>

                {showHints && (
                  <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Keyboard className="w-3.5 h-3.5" />
                      Press tier hotkeys to sort
                    </span>
                    <span>•</span>
                    <span>Space: Skip</span>
                    <span>•</span>
                    <span>Z / Backspace: Undo</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Quick-Edit Panel */}
        {showInspector && (
          <aside className="w-80 lg:w-96 shrink-0 border-l border-white/[0.08] bg-[#0E1118] flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Quick-Edit Card
              </span>
              <span className="text-[10px] text-slate-500">
                Press <kbd className="kbd-cap text-[10px] h-4 min-w-4">Esc</kbd> to resume hotkeys
              </span>
            </div>

            {!activeModel ? (
              <div className="p-6 text-xs text-slate-500 text-center my-auto">
                Select or import a model to edit notes, tags, thumbnail, and recording links here.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Identity */}
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={usernameDraft}
                        onChange={(e) => setUsernameDraft(e.target.value)}
                        onBlur={commitUsernameDraft}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitUsernameDraft();
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === 'Escape') {
                            setUsernameDraft(activeModel.username);
                          }
                        }}
                        className="studio-input text-xs font-mono py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={activeModel.displayName}
                        onChange={(e) =>
                          updateModel(activeModel.id, { displayName: e.target.value })
                        }
                        placeholder="Optional label"
                        className="studio-input text-xs py-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Original Link
                    </label>
                    <input
                      type="text"
                      value={activeModel.originalLink}
                      onChange={(e) =>
                        updateModel(activeModel.id, { originalLink: e.target.value })
                      }
                      placeholder="https://chaturbate.com/..."
                      className="studio-input text-xs py-1.5"
                    />
                  </div>
                </div>

                {/* Thumbnail */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Profile Thumbnail (URL or Local File)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={activeModel.thumbnail}
                      onChange={(e) =>
                        updateModel(activeModel.id, { thumbnail: e.target.value })
                      }
                      placeholder="https://... or local path"
                      className="studio-input text-xs py-1.5"
                    />
                    <button
                      type="button"
                      onClick={handlePickImage}
                      title="Browse local image file"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] border border-white/10 text-slate-200 hover:bg-white/[0.12] shrink-0 inline-flex items-center gap-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Browse
                    </button>
                  </div>
                </div>

                {/* CBExplorer Activity & Heatmap */}
                <ActivityHeatmap model={activeModel} compact />

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-400">
                    Activity Notes (hours, quality, details)
                  </label>
                  <textarea
                    rows={4}
                    value={activeModel.notes}
                    onChange={(e) =>
                      updateModel(activeModel.id, { notes: e.target.value })
                    }
                    placeholder="Usual streaming hours, A/V quality, preferences..."
                    className="studio-input text-xs resize-y leading-relaxed"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-400">
                    Niche Tags
                  </label>
                  <TagInput
                    tags={activeModel.tags}
                    onChange={(tags) => updateModel(activeModel.id, { tags })}
                    suggestions={allKnownTags}
                  />
                </div>

                {/* Custom Recording Links */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <Link2 className="w-3.5 h-3.5" />
                    Custom Recording Links
                  </label>

                  {activeModel.customLinks.length > 0 && (
                    <div className="space-y-1.5">
                      {activeModel.customLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => void desktopBridge.openExternal(lnk.url)}
                            className="flex items-center gap-1.5 text-amber-200 hover:underline truncate text-left"
                            title={lnk.url}
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate font-medium">{lnk.label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomLink(lnk.id)}
                            className="text-slate-500 hover:text-rose-300 shrink-0"
                            title="Remove link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-1.5">
                    <input
                      type="text"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="Label"
                      className="col-span-2 studio-input text-xs py-1.5"
                    />
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomLink();
                        }
                      }}
                      placeholder="https://..."
                      className="col-span-3 studio-input text-xs py-1.5"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomLink}
                    disabled={!newLinkUrl.trim()}
                    className="w-full py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 disabled:opacity-40 transition-colors"
                  >
                    + Add Recording Link
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
