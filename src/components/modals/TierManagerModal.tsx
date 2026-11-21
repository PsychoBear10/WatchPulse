import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModalShell } from '../common/ModalShell';
import { TierPlaylistManagerPanel } from '../common/TierPlaylistManagerPanel';

interface TierManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export const TierManagerModal: React.FC<TierManagerModalProps> = ({
  open,
  onClose,
}) => {
  const { data } = useAppStore();
  const [isRecording, setIsRecording] = useState(false);

  const assignedHotkeyCount = useMemo(() => {
    const keys = new Set<string>();
    if (data.inbox.hotkey?.trim()) {
      keys.add(data.inbox.hotkey.trim().toUpperCase());
    }
    for (const t of data.tiers) {
      if (t.hotkey?.trim()) {
        keys.add(t.hotkey.trim().toUpperCase());
      }
    }
    return keys.size;
  }, [data.inbox.hotkey, data.tiers]);

  const isHotkeyCapacityReached = assignedHotkeyCount >= 35 || data.tiers.length >= 35;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Playlists, Tiers & Hotkey Manager"
      subtitle="Create, rename, recolor, reorder, and customize hotkeys for your playlists / tiers and default Inbox state."
      maxWidthClass="max-w-4xl"
      heightClass="h-[84vh] min-h-[580px] max-h-[820px]"
      disableEscapeClose={isRecording}
      footer={
        <div className="flex items-center justify-between w-full">
          {isHotkeyCapacityReached ? (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Single-character hotkey capacity reached (35 hotkeys in use)</span>
            </div>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Done
          </button>
        </div>
      }
    >
      {isHotkeyCapacityReached && (
        <div
          data-testid="hotkey-capacity-notice"
          className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-200"
        >
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Single-character hotkey capacity reached (35 hotkeys). All available single-character sorting keys are currently in use.
          </span>
        </div>
      )}
      <TierPlaylistManagerPanel
        active={open}
        onRecordingChange={setIsRecording}
      />
    </ModalShell>
  );
};
