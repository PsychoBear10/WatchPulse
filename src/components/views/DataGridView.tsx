import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  MonitorPlay,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModelRecord } from '../../types/models';
import { getModelReviewStatus } from '../../utils/review';
import { CbexplorerToggle } from '../common/CbexplorerToggle';
import { LinkPillGroup } from '../common/LinkPillGroup';
import { ModelAvatar } from '../common/ModelAvatar';

interface DataGridViewProps {
  onEditModel: (model: ModelRecord) => void;
  onSilentPreview: (model: ModelRecord) => void;
  onOpenImport: () => void;
  onOpenRapidSorter?: () => void;
  onRequestDelete: (models: ModelRecord[]) => void;
}

type SortKey = 'username' | 'tier' | 'cbexplorer' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export const DataGridView: React.FC<DataGridViewProps> = ({
  onEditModel,
  onSilentPreview,
  onOpenImport,
  onOpenRapidSorter,
  onRequestDelete,
}) => {
  const {
    data,
    allKnownTags,
    liveRoomsByUsername,
    updateModel,
    moveModelToTier,
    toggleCbexplorer,
    bulkUpdateModels,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [cbFilter, setCbFilter] = useState<'all' | 'added' | 'pending'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'live' | 'due' | 'stale'
  >('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTierId, setBulkTierId] = useState('');
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const tierMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string; order: number }>();
    map.set('inbox', {
      name: data.inbox.name,
      color: data.inbox.color,
      order: -1,
    });
    sortedTiers.forEach((t, idx) => {
      map.set(t.id, { name: t.name, color: t.color, order: idx });
    });
    return map;
  }, [data.inbox, sortedTiers]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowMs = Date.now();
    const filtered = data.models.filter((m) => {
      if (tierFilter !== 'all' && m.tierId !== tierFilter) return false;
      if (tagFilter !== 'all' && !m.tags.includes(tagFilter)) return false;
      if (cbFilter === 'added' && !m.cbexplorerAdded) return false;
      if (cbFilter === 'pending' && m.cbexplorerAdded) return false;
      if (statusFilter === 'live' && !liveRoomsByUsername[m.username.toLowerCase()]) {
        return false;
      }
      if (statusFilter === 'due' || statusFilter === 'stale') {
        const st = getModelReviewStatus(
          m,
          sortedTiers.find((t) => t.id === m.tierId),
          data.settings.defaultReviewCadenceDays,
          data.settings.staleOfflineDays,
          nowMs
        );
        if (statusFilter === 'due' && !st.isDueForReview) return false;
        if (statusFilter === 'stale' && !st.isStaleOffline) return false;
      }
      if (q) {
        const hay = `${m.username} ${m.displayName} ${m.notes} ${m.tags.join(' ')} ${m.originalLink}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'username') {
        cmp = a.username.localeCompare(b.username);
      } else if (sortKey === 'tier') {
        const oa = tierMap.get(a.tierId)?.order ?? 999;
        const ob = tierMap.get(b.tierId)?.order ?? 999;
        cmp = oa - ob;
      } else if (sortKey === 'cbexplorer') {
        cmp = Number(a.cbexplorerAdded) - Number(b.cbexplorerAdded);
      } else {
        cmp = a.updatedAt.localeCompare(b.updatedAt);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [
    cbFilter,
    data.models,
    data.settings.defaultReviewCadenceDays,
    data.settings.staleOfflineDays,
    liveRoomsByUsername,
    search,
    sortDir,
    sortKey,
    sortedTiers,
    statusFilter,
    tagFilter,
    tierFilter,
    tierMap,
  ]);

  const totalPages =
    pageSize <= 0 ? 1 : Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedModels = useMemo(() => {
    if (pageSize <= 0) return filteredAndSorted;
    const start = (safePage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, pageSize, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    tierFilter,
    tagFilter,
    cbFilter,
    statusFilter,
    sortKey,
    sortDir,
    pageSize,
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'updatedAt' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-400" />
    );
  };

  const filteredIds = filteredAndSorted.map((m) => m.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedArray = Array.from(selectedIds).filter((id) =>
    data.models.some((m) => m.id === id)
  );

  const handleBulkMove = (targetTier: string) => {
    if (!targetTier || selectedArray.length === 0) return;
    bulkUpdateModels(selectedArray, { tierId: targetTier });
    setBulkTierId('');
  };

  const handleBulkTag = () => {
    const clean = bulkTagInput.trim().replace(/^#/, '');
    if (!clean || selectedArray.length === 0) return;
    bulkUpdateModels(selectedArray, { addTag: clean });
    setBulkTagInput('');
  };

  const handleBulkDelete = () => {
    if (selectedArray.length === 0) return;
    const idSet = new Set(selectedArray);
    const targets = data.models.filter((m) => idSet.has(m.id));
    onRequestDelete(targets);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Filter Toolbar */}
      <div className="px-5 py-3 border-b border-white/[0.07] bg-[#0C0F16] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenRapidSorter && (
            <button
              type="button"
              onClick={onOpenRapidSorter}
              title="Back to Rapid Sorter card deck (Ctrl+2)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-500/35 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-300" />
              Rapid Sorter
            </button>
          )}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username, notes, tags..."
              className="studio-input text-xs pl-8 py-1.5"
            />
          </div>

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Tiers</option>
            <option value="inbox">{data.inbox.name}</option>
            {sortedTiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Tags</option>
            {allKnownTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>

          <select
            value={cbFilter}
            onChange={(e) =>
              setCbFilter(e.target.value as 'all' | 'added' | 'pending')
            }
            className="bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">CBExplorer: All</option>
            <option value="added">CBExplorer: Added</option>
            <option value="pending">CBExplorer: Not Added</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'live' | 'due' | 'stale')
            }
            className="bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Activity: All</option>
            <option value="live">Live Now</option>
            <option value="due">Due for Re-sort</option>
            <option value="stale">Stale Offline</option>
          </select>

          {(search ||
            tierFilter !== 'all' ||
            tagFilter !== 'all' ||
            cbFilter !== 'all' ||
            statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTierFilter('all');
                setTagFilter('all');
                setCbFilter('all');
                setStatusFilter('all');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            <strong className="text-slate-100">{filteredAndSorted.length}</strong> of{' '}
            {data.models.length} rows
          </span>
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10"
          >
            <Plus className="w-3.5 h-3.5" />
            Import
          </button>
        </div>
      </div>

      {/* Bulk Operations Bar */}
      {selectedArray.length > 0 && (
        <div className="px-5 py-2.5 border-b border-indigo-500/30 bg-indigo-950/35 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-md font-semibold bg-indigo-500/25 text-indigo-200 border border-indigo-400/40">
              {selectedArray.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white underline text-[11px]"
            >
              Deselect
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkTierId}
              onChange={(e) => handleBulkMove(e.target.value)}
              className="bg-[#11141D] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="">Move selected to tier...</option>
              <option value="inbox">{data.inbox.name}</option>
              {sortedTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                bulkUpdateModels(selectedArray, { cbexplorerAdded: true })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
            >
              <Check className="w-3.5 h-3.5" />
              Mark CBExplorer Added
            </button>

            <button
              type="button"
              onClick={() =>
                bulkUpdateModels(selectedArray, { cbexplorerAdded: false })
              }
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] text-slate-300 border border-white/10 hover:bg-white/[0.1]"
            >
              Unmark CBExplorer
            </button>

            <div className="flex items-center gap-1">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBulkTag();
                }}
                placeholder="Bulk add tag..."
                className="w-32 bg-[#11141D] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={handleBulkTag}
                disabled={!bulkTagInput.trim()}
                className="px-2 py-1.5 rounded-lg text-xs font-medium bg-white/[0.07] text-slate-200 border border-white/10 hover:bg-white/[0.14] disabled:opacity-40"
              >
                Tag
              </button>
            </div>

            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/35 hover:bg-rose-500/25"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filteredAndSorted.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <p className="text-sm font-medium text-slate-300">No matching models</p>
            <p className="text-xs mt-1">
              Adjust your search/filters or import models to populate the data grid.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead className="sticky top-0 z-10 bg-[#10131C] border-b border-white/[0.08] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all filtered models"
                    className="rounded border-white/20 bg-black/40 text-indigo-500 focus:ring-indigo-500/40"
                  />
                </th>
                <th className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort('username')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Model {renderSortIcon('username')}
                  </button>
                </th>
                <th className="px-3 py-3 w-44">
                  <button
                    type="button"
                    onClick={() => toggleSort('tier')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Tier {renderSortIcon('tier')}
                  </button>
                </th>
                <th className="px-3 py-3 w-36">
                  <button
                    type="button"
                    onClick={() => toggleSort('cbexplorer')}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    CBExplorer {renderSortIcon('cbexplorer')}
                  </button>
                </th>
                <th className="px-3 py-3 w-52">Quick Links</th>
                <th className="px-3 py-3 w-48">Tags</th>
                <th className="px-3 py-3">Inline Notes</th>
                <th className="px-4 py-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-xs">
              {paginatedModels.map((model) => {
                const isSelected = selectedIds.has(model.id);
                const tierMeta = tierMap.get(model.tierId) ?? {
                  name: data.inbox.name,
                  color: data.inbox.color,
                };

                return (
                  <tr
                    key={model.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-indigo-500/[0.08]' : 'hover:bg-white/[0.025]'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(model.id)}
                        aria-label={`Select ${model.username}`}
                        className="rounded border-white/20 bg-black/40 text-indigo-500 focus:ring-indigo-500/40"
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ModelAvatar
                          username={model.username}
                          displayName={model.displayName}
                          thumbnail={model.thumbnail}
                          size="sm"
                          accentColor={tierMeta.color}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {liveRoomsByUsername[model.username.toLowerCase()] && (
                              <span
                                title="Currently Live"
                                className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                              />
                            )}
                            <span className="font-semibold text-white truncate max-w-[160px]">
                              {model.displayName || model.username}
                            </span>
                            {getModelReviewStatus(
                              model,
                              sortedTiers.find((t) => t.id === model.tierId),
                              data.settings.defaultReviewCadenceDays,
                              data.settings.staleOfflineDays
                            ).isDueForReview && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/35 shrink-0">
                                Due
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-indigo-300/80 truncate max-w-[180px]">
                            @{model.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: tierMeta.color }}
                        />
                        <select
                          value={model.tierId}
                          onChange={(e) => moveModelToTier(model.id, e.target.value)}
                          className="w-full bg-[#151924] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="inbox">{data.inbox.name}</option>
                          {sortedTiers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <CbexplorerToggle
                        checked={model.cbexplorerAdded}
                        onToggle={() => toggleCbexplorer(model.id)}
                        size="compact"
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      <LinkPillGroup
                        username={model.username}
                        originalLink={model.originalLink}
                        variant="compact"
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {model.tags.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => onEditModel(model)}
                            className="text-[11px] text-slate-600 hover:text-slate-300"
                          >
                            + tags
                          </button>
                        ) : (
                          model.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/12 text-indigo-200 border border-indigo-500/20"
                            >
                              #{tag}
                            </span>
                          ))
                        )}
                        {model.tags.length > 3 && (
                          <span className="text-[10px] text-slate-500">
                            +{model.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={model.notes}
                        onChange={(e) =>
                          updateModel(model.id, { notes: e.target.value })
                        }
                        placeholder="Add activity note..."
                        className="w-full bg-transparent hover:bg-black/30 focus:bg-[#0B0E15] border border-transparent hover:border-white/10 focus:border-indigo-500/60 rounded-md px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none transition-colors"
                      />
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSilentPreview(model)}
                          title="Silent Live View"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-white/10 transition-colors"
                        >
                          <MonitorPlay className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditModel(model)}
                          title="Open full card editor"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDelete([model])}
                          title="Move to Recycling Bin"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {filteredAndSorted.length > 0 && (
        <div className="px-5 py-2.5 border-t border-white/[0.07] bg-[#0C0F16] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div>
            Showing{' '}
            <span className="font-semibold text-slate-200">
              {pageSize <= 0 ? 1 : (safePage - 1) * pageSize + 1}
            </span>
            –
            <span className="font-semibold text-slate-200">
              {pageSize <= 0
                ? filteredAndSorted.length
                : Math.min(filteredAndSorted.length, safePage * pageSize)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-slate-200">
              {filteredAndSorted.length}
            </span>{' '}
            filtered model(s)
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[11px]">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-[#151924] border border-white/10 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={0}>All</option>
              </select>
            </label>

            {totalPages > 1 && (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-1.5 font-mono text-[11px] text-slate-300">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
