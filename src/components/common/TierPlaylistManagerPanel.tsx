import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Inbox,
  Keyboard,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { isReservedDeckKey, normalizeHotkey } from '../../utils/hotkeys';

interface TierPlaylistManagerPanelProps {
  active: boolean;
  onRecordingChange?: (recording: boolean) => void;
}

const COLOR_SWATCHES = [
  '#F43F5E',
  '#FB7185',
  '#F59E0B',
  '#10B981',
  '#06B6D4',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#94A3B8',
];

export const TierPlaylistManagerPanel: React.FC<TierPlaylistManagerPanelProps> = ({
  active,
  onRecordingChange,
}) => {
  const {
    data,
    updateInbox,
    addTier,
    updateTier,
    reorderTiers,
    deleteTier,
    notify,
  } = useAppStore();

  const [newTierName, setNewTierName] = useState('');
  const [newTierColor, setNewTierColor] = useState('#06B6D4');
  const [newTierHotkey, setNewTierHotkey] = useState('');
  const [recordingForId, setRecordingForId] = useState<string | null>(null);
  const [draggedTierId, setDraggedTierId] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('inbox');

  useEffect(() => {
    onRecordingChange?.(active && Boolean(recordingForId));
  }, [active, onRecordingChange, recordingForId]);

  useEffect(() => {
    if (!active) {
      setRecordingForId(null);
      setPendingDeleteId(null);
    }
  }, [active]);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const modelCountByTier = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data.models) {
      counts.set(m.tierId, (counts.get(m.tierId) ?? 0) + 1);
    }
    return counts;
  }, [data.models]);

  // Interactive hotkey recorder listener
  useEffect(() => {
    if (!active || !recordingForId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingForId(null);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (recordingForId === 'inbox') {
          updateInbox({ hotkey: '' });
        } else if (recordingForId === '__new__') {
          setNewTierHotkey('');
        } else {
          updateTier(recordingForId, { hotkey: '' });
        }
        setRecordingForId(null);
        return;
      }

      if (e.key.length !== 1) return;
      const normalized = normalizeHotkey(e.key);
      if (!normalized || isReservedDeckKey(normalized)) {
        notify(
          `Key "${e.key.toUpperCase()}" is reserved for Deck navigation (Space, Z, Backspace, Esc).`,
          'warning'
        );
        return;
      }

      // Check conflict with other tiers / inbox
      if (
        recordingForId !== 'inbox' &&
        data.inbox.hotkey.toUpperCase() === normalized
      ) {
        updateInbox({ hotkey: '' });
      }
      for (const t of data.tiers) {
        if (t.id !== recordingForId && t.hotkey.toUpperCase() === normalized) {
          updateTier(t.id, { hotkey: '' });
        }
      }

      if (recordingForId === 'inbox') {
        updateInbox({ hotkey: normalized });
      } else if (recordingForId === '__new__') {
        setNewTierHotkey(normalized);
      } else {
        updateTier(recordingForId, { hotkey: normalized });
      }

      setRecordingForId(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    active,
    data.inbox.hotkey,
    data.tiers,
    notify,
    recordingForId,
    updateInbox,
    updateTier,
  ]);

  const handleAddTier = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTierName.trim();
    if (!cleanName) return;

    const cleanHotkey = normalizeHotkey(newTierHotkey);
    if (cleanHotkey && isReservedDeckKey(cleanHotkey)) {
      notify('Space, Z, Backspace, and Esc are reserved for Deck controls.', 'warning');
      return;
    }

    if (cleanHotkey) {
      if (data.inbox.hotkey.toUpperCase() === cleanHotkey) {
        updateInbox({ hotkey: '' });
      }
      for (const t of data.tiers) {
        if (t.hotkey.toUpperCase() === cleanHotkey) {
          updateTier(t.id, { hotkey: '' });
        }
      }
    }

    addTier({
      name: cleanName,
      color: newTierColor,
      hotkey: cleanHotkey,
      description: '',
    });

    setNewTierName('');
    setNewTierHotkey('');
    notify(`Created playlist / tier "${cleanName}"`, 'success');
  };

  const moveTierByOffset = (tierId: string, delta: -1 | 1) => {
    const idx = sortedTiers.findIndex((t) => t.id === tierId);
    const nextIdx = idx + delta;
    if (idx === -1 || nextIdx < 0 || nextIdx >= sortedTiers.length) return;
    const ids = sortedTiers.map((t) => t.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(nextIdx, 0, moved);
    reorderTiers(ids);
  };

  const handleTierDrop = (targetId: string) => {
    if (!draggedTierId || draggedTierId === targetId) {
      setDraggedTierId(null);
      return;
    }
    const ids = sortedTiers.map((t) => t.id);
    const fromIdx = ids.indexOf(draggedTierId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    reorderTiers(ids);
    setDraggedTierId(null);
  };

  const handleConfirmDelete = (tierId: string) => {
    deleteTier(tierId, reassignTarget);
    setPendingDeleteId(null);
    setReassignTarget('inbox');
    notify('Playlist / tier removed and models reassigned safely.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Default Inbox / Unsorted Configuration */}
      <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-300" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Default Unsorted / Inbox State
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            {modelCountByTier.get('inbox') ?? 0} models currently here
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-6">
            <label className="block text-[10px] text-slate-400 mb-1">
              Inbox Label
            </label>
            <input
              type="text"
              value={data.inbox.name}
              onChange={(e) => updateInbox({ name: e.target.value })}
              onBlur={() =>
                updateInbox({
                  name: data.inbox.name.trim() || 'Unsorted / Inbox',
                })
              }
              placeholder="Unsorted / Inbox"
              className="studio-input text-xs py-1.5"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[10px] text-slate-400 mb-1">
              Badge Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.inbox.color}
                onChange={(e) => updateInbox({ color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
              />
              <span className="text-xs font-mono text-slate-300">
                {data.inbox.color}
              </span>
            </div>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[10px] text-slate-400 mb-1">
              Optional Hotkey
            </label>
            <button
              type="button"
              onClick={() =>
                setRecordingForId((prev) => (prev === 'inbox' ? null : 'inbox'))
              }
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border text-left flex items-center justify-between transition-colors ${
                recordingForId === 'inbox'
                  ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200 animate-pulse'
                  : 'bg-[#0C0F16] border-white/10 text-slate-200 hover:border-white/25'
              }`}
            >
              <span>
                {recordingForId === 'inbox'
                  ? 'Press key...'
                  : data.inbox.hotkey || 'None'}
              </span>
              <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Playlists / Custom Tiers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Playlists & Custom Tiers ({sortedTiers.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Drag rows or use arrows to reorder playlists/columns. Reserved Deck keys: Space (Skip), Z / Backspace (Undo).
            </p>
          </div>
        </div>

        {sortedTiers.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-white/15 text-center text-xs text-slate-400">
            No custom playlists or tiers defined. Add your first one below!
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTiers.map((tier, idx) => {
              const count = modelCountByTier.get(tier.id) ?? 0;
              const isDeleting = pendingDeleteId === tier.id;

              return (
                <div
                  key={tier.id}
                  draggable
                  onDragStart={() => setDraggedTierId(tier.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleTierDrop(tier.id)}
                  onDragEnd={() => setDraggedTierId(null)}
                  className={`p-3 rounded-xl bg-[#161B27] border transition-colors ${
                    draggedTierId === tier.id
                      ? 'opacity-50 border-indigo-400'
                      : 'border-white/[0.08] hover:border-white/15'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <GripVertical className="w-4 h-4 text-slate-500 cursor-grab shrink-0" />

                    {/* Color Picker + Swatches */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="color"
                        value={tier.color}
                        onChange={(e) =>
                          updateTier(tier.id, { color: e.target.value })
                        }
                        title="Choose custom color"
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/15"
                      />
                      <div className="hidden lg:flex items-center gap-1">
                        {COLOR_SWATCHES.slice(0, 5).map((swatch) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => updateTier(tier.id, { color: swatch })}
                            className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-110 ${
                              tier.color.toUpperCase() === swatch
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-70'
                            }`}
                            style={{ backgroundColor: swatch }}
                            title={`Use ${swatch}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Playlist / Tier Name */}
                    <input
                      type="text"
                      value={tier.name}
                      onChange={(e) =>
                        updateTier(tier.id, { name: e.target.value })
                      }
                      onBlur={() =>
                        updateTier(tier.id, {
                          name: tier.name.trim() || 'Untitled Tier',
                        })
                      }
                      className="flex-1 min-w-[140px] studio-input text-xs font-medium py-1.5"
                      placeholder="Playlist / tier name"
                    />

                    {/* Hotkey Recorder */}
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingForId((prev) =>
                          prev === tier.id ? null : tier.id
                        )
                      }
                      title="Click and press a key (or Backspace to clear)"
                      className={`w-28 px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center justify-between shrink-0 transition-colors ${
                        recordingForId === tier.id
                          ? 'bg-indigo-500/25 border-indigo-400 text-indigo-100 animate-pulse'
                          : 'bg-[#0C0F16] border-white/10 text-slate-200 hover:border-white/25'
                      }`}
                    >
                      <span>
                        {recordingForId === tier.id
                          ? 'Press key...'
                          : tier.hotkey
                            ? `Key: ${tier.hotkey}`
                            : 'No key'}
                      </span>
                      <Keyboard className="w-3 h-3 text-slate-500" />
                    </button>

                    {/* Re-sort Cadence (days) */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      title="Re-sort cadence in days (0 = never flag for re-sort, blank = use global default)"
                    >
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={tier.reviewCadenceDays ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateTier(tier.id, {
                            reviewCadenceDays:
                              raw === ''
                                ? undefined
                                : Math.max(0, Number.parseInt(raw, 10) || 0),
                          });
                        }}
                        placeholder={`${data.settings.defaultReviewCadenceDays}`}
                        className="w-14 bg-[#0C0F16] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-[10px] text-slate-500">d</span>
                    </div>

                    {/* Model count badge */}
                    <span className="px-2 py-1 rounded-md text-[11px] bg-black/35 text-slate-400 border border-white/[0.06] shrink-0">
                      {count} models
                    </span>

                    {/* Reorder + Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveTierByOffset(tier.id, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTierByOffset(tier.id, 1)}
                        disabled={idx === sortedTiers.length - 1}
                        title="Move down"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (count === 0) {
                            deleteTier(tier.id, 'inbox');
                            notify(`Deleted "${tier.name}"`, 'info');
                          } else {
                            setPendingDeleteId(isDeleting ? null : tier.id);
                            setReassignTarget('inbox');
                          }
                        }}
                        title="Delete playlist / tier"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Safe Delete Confirmation Bar */}
                  {isDeleting && (
                    <div className="mt-3 pt-3 border-t border-rose-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          Move <strong>{count}</strong> model(s) from "{tier.name}" to:
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={reassignTarget}
                          onChange={(e) => setReassignTarget(e.target.value)}
                          className="bg-[#0C0F16] border border-white/15 rounded-lg px-2 py-1 text-xs text-slate-100"
                        >
                          <option value="inbox">{data.inbox.name}</option>
                          {sortedTiers
                            .filter((other) => other.id !== tier.id)
                            .map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(tier.id)}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add New Playlist / Tier Form */}
      <form
        onSubmit={handleAddTier}
        className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/25 space-y-3"
      >
        <div className="text-xs font-semibold text-indigo-200">
          + Add Custom Playlist / Tier
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="color"
            value={newTierColor}
            onChange={(e) => setNewTierColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/15 shrink-0"
          />
          <input
            type="text"
            value={newTierName}
            onChange={(e) => setNewTierName(e.target.value)}
            placeholder="e.g. VIP Favorites, Weekend Streamers, Test..."
            className="flex-1 min-w-[180px] studio-input text-xs py-1.5"
          />
          <button
            type="button"
            onClick={() =>
              setRecordingForId((prev) =>
                prev === '__new__' ? null : '__new__'
              )
            }
            className={`w-32 px-2.5 py-1.5 rounded-lg text-xs font-mono border flex items-center justify-between shrink-0 ${
              recordingForId === '__new__'
                ? 'bg-indigo-500/25 border-indigo-400 text-indigo-100 animate-pulse'
                : 'bg-[#0C0F16] border-white/10 text-slate-200'
            }`}
          >
            <span>
              {recordingForId === '__new__'
                ? 'Press key...'
                : newTierHotkey
                  ? `Key: ${newTierHotkey}`
                  : 'Assign key'}
            </span>
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button
            type="submit"
            disabled={!newTierName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Playlist
          </button>
        </div>
      </form>
    </div>
  );
};
