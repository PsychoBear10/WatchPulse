import React from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModelRecord } from '../../types/models';
import { ModalShell } from '../common/ModalShell';

interface DeleteConfirmModalProps {
  models: ModelRecord[];
  onClose: () => void;
  onConfirmRecycle: (ids: string[]) => void;
  onConfirmArchiveToTier?: (ids: string[], tierId: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  models,
  onClose,
  onConfirmRecycle,
  onConfirmArchiveToTier,
}) => {
  const { data } = useAppStore();

  if (models.length === 0) return null;

  const retentionDays = data.settings.trashRetentionDays || 45;
  const inactiveTier = data.tiers.find((t) =>
    t.name.toLowerCase().includes('inactive')
  );
  const ids = models.map((m) => m.id);

  return (
    <ModalShell
      open={models.length > 0}
      onClose={onClose}
      title={
        models.length === 1
          ? `Remove "${models[0].displayName || models[0].username}"?`
          : `Remove ${models.length} Selected Models?`
      }
      subtitle={`Items sent to the Recycling Bin remain recoverable for ${retentionDays} days before permanent deletion.`}
      maxWidthClass="max-w-lg"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          {inactiveTier && onConfirmArchiveToTier ? (
            <button
              type="button"
              onClick={() => {
                onConfirmArchiveToTier(ids, inactiveTier.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
            >
              <Archive className="w-3.5 h-3.5 text-slate-400" />
              Move to {inactiveTier.name}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmRecycle(ids);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Move to Recycling Bin
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-xs text-slate-300">
        <div className="p-3 rounded-xl bg-black/30 border border-white/[0.08] max-h-40 overflow-y-auto space-y-1">
          {models.slice(0, 15).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span className="font-medium text-white truncate">
                {m.displayName || m.username}
              </span>
              <span className="font-mono text-[11px] text-indigo-300 shrink-0">
                @{m.username}
              </span>
            </div>
          ))}
          {models.length > 15 && (
            <div className="text-[11px] text-slate-500 pt-1">
              ...and {models.length - 15} more
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          All notes, tags, custom links, and tracked activity history stay intact inside the{' '}
          <strong className="text-slate-200">Recycling Bin</strong> for{' '}
          <strong className="text-slate-200">{retentionDays} days</strong>, then are permanently erased.
        </p>
      </div>
    </ModalShell>
  );
};
