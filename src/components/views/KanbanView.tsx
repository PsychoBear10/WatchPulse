import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GripVertical,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModelRecord } from '../../types/models';
import { getModelReviewStatus } from '../../utils/review';
import { CbexplorerToggle } from '../common/CbexplorerToggle';
import { LinkPillGroup } from '../common/LinkPillGroup';
import { ModelAvatar } from '../common/ModelAvatar';

interface KanbanViewProps {
  onEditModel: (model: ModelRecord) => void;
  onSilentPreview: (model: ModelRecord) => void;
  onOpenImport: () => void;
  onJumpToDeckForTier: (tierId: string) => void;
  onRequestDelete: (models: ModelRecord[]) => void;
}

interface ColumnDef {
  id: string;
  name: string;
  color: string;
  hotkey: string;
  description?: string;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  onEditModel,
  onSilentPreview,
  onOpenImport,
  onJumpToDeckForTier,
  onRequestDelete,
}) => {
  const {
    data,
    allKnownTags,
    liveRoomsByUsername,
    moveModelToTier,
    reorderModelsInTier,
    toggleCbexplorer,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [cbFilter, setCbFilter] = useState<'all' | 'added' | 'pending'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredModels.length > 0) {
      const firstId = filteredModels[0].id;
      const el = document.getElementById(`kanban-card-${firstId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        el.classList.add('ring-2', 'ring-indigo-400', 'shadow-glow');
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-indigo-400', 'shadow-glow');
        }, 1400);
      }
    }
  };

  const [draggedModelId, setDraggedModelId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef[]>(() => {
    const sortedTiers = [...data.tiers].sort((a, b) => a.order - b.order);
    return [
      {
        id: 'inbox',
        name: data.inbox.name,
        color: data.inbox.color,
        hotkey: data.inbox.hotkey,
        description: 'Default incoming queue',
      },
      ...sortedTiers.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        hotkey: t.hotkey,
        description: t.description,
      })),
    ];
  }, [data.inbox, data.tiers]);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.models.filter((m) => {
      if (cbFilter === 'added' && !m.cbexplorerAdded) return false;
      if (cbFilter === 'pending' && m.cbexplorerAdded) return false;
      if (tagFilter !== 'all' && !m.tags.includes(tagFilter)) return false;
      if (q) {
        const hay = `${m.username} ${m.displayName} ${m.notes} ${m.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cbFilter, data.models, search, tagFilter]);

  const modelsByColumn = useMemo(() => {
    const map = new Map<string, ModelRecord[]>();
    for (const col of columns) {
      map.set(col.id, []);
    }
    for (const model of filteredModels) {
      const bucket = map.get(model.tierId) ?? map.get('inbox');
      bucket?.push(model);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [columns, filteredModels]);

  const totalByColumn = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data.models) {
      counts.set(m.tierId, (counts.get(m.tierId) ?? 0) + 1);
    }
    return counts;
  }, [data.models]);

  const handleDragStart = (e: React.DragEvent, modelId: string) => {
    setDraggedModelId(modelId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', modelId);
  };

  const handleDragEnd = () => {
    setDraggedModelId(null);
    setDragOverColumnId(null);
    setDragOverCardId(null);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const modelId = draggedModelId || e.dataTransfer.getData('text/plain');
    if (!modelId) {
      handleDragEnd();
      return;
    }

    const moving = data.models.find((m) => m.id === modelId);
    if (!moving) {
      handleDragEnd();
      return;
    }

    // Operate on the full tier ordering (not just filteredSubset) so hidden filtered cards are preserved
    const fullTargetIds = data.models
      .filter((m) => m.tierId === targetColId)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.id);

    if (moving.tierId === targetColId) {
      const visibleCol = modelsByColumn.get(targetColId) ?? [];
      const fromVisibleIdx = visibleCol.findIndex((m) => m.id === modelId);
      const overVisibleIdx =
        dragOverCardId && dragOverCardId !== modelId
          ? visibleCol.findIndex((m) => m.id === dragOverCardId)
          : -1;

      const remaining = fullTargetIds.filter((id) => id !== modelId);
      let insertIndex = remaining.length;

      if (dragOverCardId && dragOverCardId !== modelId) {
        const anchorIdx = remaining.indexOf(dragOverCardId);
        if (anchorIdx !== -1) {
          insertIndex =
            fromVisibleIdx !== -1 &&
            overVisibleIdx !== -1 &&
            fromVisibleIdx < overVisibleIdx
              ? anchorIdx + 1
              : anchorIdx;
        }
      }

      remaining.splice(insertIndex, 0, modelId);
      reorderModelsInTier(targetColId, remaining);
    } else {
      let insertIndex = fullTargetIds.length;
      if (dragOverCardId && dragOverCardId !== modelId) {
        const anchorIdx = fullTargetIds.indexOf(dragOverCardId);
        if (anchorIdx !== -1) {
          insertIndex = anchorIdx;
        }
      }
      moveModelToTier(modelId, targetColId, insertIndex);
    }

    handleDragEnd();
  };

  const handleDeleteCard = (model: ModelRecord) => {
    onRequestDelete([model]);
  };

  const hasActiveFilter =
    search.trim().length > 0 || tagFilter !== 'all' || cbFilter !== 'all';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Kanban Filter Bar */}
      <div className="px-5 py-3 border-b border-white/[0.07] liquid-glass-header flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={handleSearchSubmit} className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models, tags, notes... (Ctrl+F or /)"
              className="studio-input text-xs pl-8 pr-16 py-1.5 rounded-xl border border-white/10 bg-black/20 focus:bg-black/40 focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-400/40 w-full transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-0.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/10">
                ↵
              </span>
            </div>
          </form>

          {search.trim().length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 animate-fade-in">
              {filteredModels.length} match{filteredModels.length === 1 ? '' : 'es'}
            </span>
          )}

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-black/20 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">All Tags</option>
            {allKnownTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>

          <select
            value={cbFilter}
            onChange={(e) =>
              setCbFilter(e.target.value as 'all' | 'added' | 'pending')
            }
            className="bg-black/20 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">CBExplorer: All</option>
            <option value="added">CBExplorer: Watchlisted</option>
            <option value="pending">CBExplorer: Pending</option>
          </select>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTagFilter('all');
                setCbFilter('all');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10"
            >
              <X className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-100">{filteredModels.length}</strong> of{' '}
            {data.models.length} models across {columns.length} columns
          </span>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Models
          </button>
        </div>
      </div>

      {/* Columns Scroller */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((col) => {
            const colCards = modelsByColumn.get(col.id) ?? [];
            const totalInCol = totalByColumn.get(col.id) ?? 0;
            const isDropTarget = dragOverColumnId === col.id;

            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverColumnId !== col.id) {
                    setDragOverColumnId(col.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverColumnId((prev) => (prev === col.id ? null : prev));
                    setDragOverCardId(null);
                  }
                }}
                onDrop={(e) => handleDropOnColumn(e, col.id)}
                className={`w-80 shrink-0 flex flex-col rounded-2xl border liquid-glass-card transition-all ${
                  isDropTarget
                    ? 'border-indigo-400/70 ring-2 ring-indigo-500/25 bg-indigo-950/20'
                    : 'border-white/[0.08]'
                }`}
              >
                {/* Column Header */}
                <div
                  className="px-3.5 py-3 border-b border-white/[0.07] rounded-t-2xl bg-white/[0.02] flex items-center justify-between gap-2"
                  style={{ borderTop: `3px solid ${col.color}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: col.color }}
                    />
                    <h3 className="text-xs font-semibold text-white truncate">
                      {col.name}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-black/40 text-slate-300 border border-white/10">
                      {hasActiveFilter ? `${colCards.length}/${totalInCol}` : totalInCol}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {data.settings.showKeyboardHints && col.hotkey && (
                      <kbd
                        title={`Deck hotkey: ${col.hotkey}`}
                        className="kbd-cap text-[10px]"
                      >
                        {col.hotkey}
                      </kbd>
                    )}
                    {totalInCol > 0 && (
                      <button
                        type="button"
                        onClick={() => onJumpToDeckForTier(col.id)}
                        title={`Rapid-sort ${col.name} in Deck mode`}
                        className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-white/[0.06] transition-colors"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Cards Stack */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {colCards.length === 0 ? (
                    <div
                      className={`h-24 rounded-xl border border-dashed flex items-center justify-center text-[11px] transition-colors ${
                        isDropTarget
                          ? 'border-indigo-400/60 text-indigo-300 bg-indigo-500/5'
                          : 'border-white/[0.08] text-slate-500'
                      }`}
                    >
                      {isDropTarget ? 'Drop card here' : 'No models in this tier'}
                    </div>
                  ) : (
                    colCards.map((model) => {
                      const isDragging = draggedModelId === model.id;
                      const isInsertTarget =
                        dragOverCardId === model.id && draggedModelId !== model.id;

                      return (
                        <article
                          key={model.id}
                          id={`kanban-card-${model.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, model.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragOverCardId !== model.id) {
                              setDragOverCardId(model.id);
                            }
                          }}
                          className={`group rounded-xl liquid-glass border p-3 space-y-2.5 cursor-grab active:cursor-grabbing transition-all hover:border-white/25 hover:shadow-elevation ${
                            isDragging
                              ? 'opacity-40 scale-[0.98] border-indigo-400/50'
                              : isInsertTarget
                                ? 'border-t-2 border-t-indigo-400 border-white/15 pt-2.5'
                                : 'border-white/[0.08]'
                          }`}
                        >
                          {/* Top Row: Grip + Avatar + Name + Edit/Delete */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
                              <ModelAvatar
                                username={model.username}
                                displayName={model.displayName}
                                thumbnail={model.thumbnail}
                                size="sm"
                                accentColor={col.color}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {liveRoomsByUsername[model.username.toLowerCase()] && (
                                    <span
                                      title="Currently Live"
                                      className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                                    />
                                  )}
                                  <span className="text-xs font-semibold text-white truncate">
                                    {model.displayName || model.username}
                                  </span>
                                  {getModelReviewStatus(
                                    model,
                                    data.tiers.find((t) => t.id === model.tierId),
                                    data.settings.defaultReviewCadenceDays,
                                    data.settings.staleOfflineDays
                                  ).isDueForReview && (
                                    <span
                                      title="Due for periodic tier re-sort"
                                      className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/35 shrink-0"
                                    >
                                      Due
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-indigo-300/80 truncate">
                                  @{model.username}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onSilentPreview(model)}
                                title="Silent Live View"
                                className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-white/10"
                              >
                                <MonitorPlay className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditModel(model)}
                                title="Edit card details"
                                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(model)}
                                title="Delete card"
                                className="p-1 rounded-md text-slate-400 hover:text-rose-300 hover:bg-rose-500/15"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Tags */}
                          {model.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {model.tags.slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/12 text-indigo-200 border border-indigo-500/20"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {model.tags.length > 4 && (
                                <span className="text-[10px] text-slate-500">
                                  +{model.tags.length - 4}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Notes snippet */}
                          {model.notes.trim() && (
                            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                              {model.notes}
                            </p>
                          )}

                          {/* Compact Links */}
                          <div className="pt-0.5">
                            <LinkPillGroup
                              username={model.username}
                              originalLink={model.originalLink}
                              variant="compact"
                            />
                          </div>

                          {/* Footer: CBExplorer Toggle + Tier Dropdown */}
                          <div className="pt-1.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
                            <CbexplorerToggle
                              checked={model.cbexplorerAdded}
                              onToggle={() => toggleCbexplorer(model.id)}
                              size="compact"
                            />

                            <select
                              value={model.tierId}
                              onChange={(e) => moveModelToTier(model.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              title="Change tier"
                              className="max-w-[115px] bg-black/40 border border-white/10 rounded-md px-1.5 py-1 text-[10px] font-medium text-slate-300 focus:outline-none focus:border-indigo-500"
                            >
                              {columns.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
