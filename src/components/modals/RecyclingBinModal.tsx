import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModelAvatar } from '../common/ModelAvatar';
import { ModalShell } from '../common/ModalShell';

interface RecyclingBinModalProps {
  open: boolean;
  onClose: () => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const RecyclingBinModal: React.FC<RecyclingBinModalProps> = ({
  open,
  onClose,
}) => {
  const {
    data,
    restoreFromTrash,
    permanentlyDeleteTrashed,
    emptyTrash,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const retentionDays = data.settings.trashRetentionDays || 45;
  const trashed = data.trashedModels ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = trashed.filter((m) => {
      if (!q) return true;
      return `${m.username} ${m.displayName} ${m.notes}`.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) =>
      (b.deletedAt || '').localeCompare(a.deletedAt || '')
    );
  }, [search, trashed]);

  const getDaysRemaining = (deletedAt?: string) => {
    if (!deletedAt) return retentionDays;
    const elapsedDays = (Date.now() - Date.parse(deletedAt)) / MS_PER_DAY;
    return Math.max(0, Math.ceil(retentionDays - elapsedDays));
  };

  const getOriginTierName = (tierId?: string) => {
    if (!tierId || tierId === 'inbox') return data.inbox.name;
    return data.tiers.find((t) => t.id === tierId)?.name ?? data.inbox.name;
  };

  return (
    <ModalShell
      open={open}
      onClose={() => {
        setConfirmEmpty(false);
        onClose();
      }}
      title={`Recycling Bin (${trashed.length})`}
      subtitle={`Deleted models are retained for ${retentionDays} days, then permanently purged along with local data.`}
      maxWidthClass="max-w-3xl"
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {trashed.length > 0 ? (
            confirmEmpty ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-rose-300 font-medium inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Permanently purge all {trashed.length} item(s)?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    emptyTrash();
                    setConfirmEmpty(false);
                  }}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-rose-600 hover:bg-rose-500 text-white"
                >
                  Confirm Purge
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEmpty(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEmpty(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Empty Recycling Bin
              </button>
            )
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {trashed.length > 0 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recycled models..."
              className="studio-input text-xs pl-8 py-1.5"
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-slate-500">
            <Trash2 className="w-8 h-8 mx-auto opacity-35" />
            <div className="text-sm font-medium text-slate-300">
              {trashed.length === 0
                ? 'Recycling Bin is empty'
                : 'No recycled models match your search'}
            </div>
            <p className="text-xs text-slate-500">
              Any deleted models stay here safely for {retentionDays} days before permanent removal.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filtered.map((model) => {
              const daysLeft = getDaysRemaining(model.deletedAt);
              return (
                <div
                  key={model.id}
                  className="p-3 rounded-xl bg-[#161B27] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ModelAvatar
                      username={model.username}
                      displayName={model.displayName}
                      thumbnail={model.thumbnail}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {model.displayName || model.username}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono text-indigo-300/80">
                          @{model.username}
                        </span>
                        <span>•</span>
                        <span>From: {getOriginTierName(model.deletedFromTierId)}</span>
                        <span>•</span>
                        <span
                          className={
                            daysLeft <= 5 ? 'text-rose-300 font-medium' : 'text-amber-300/90'
                          }
                        >
                          {daysLeft}d left
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => restoreFromTrash([model.id])}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => permanentlyDeleteTrashed([model.id])}
                      title="Delete permanently right now"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Purge
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
