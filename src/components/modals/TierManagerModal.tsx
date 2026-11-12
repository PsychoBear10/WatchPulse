import React, { useState } from 'react';
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
  const [isRecording, setIsRecording] = useState(false);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Playlists, Tiers & Hotkey Manager"
      subtitle="Create, rename, recolor, reorder, and customize hotkeys for your playlists / tiers and default Inbox state."
      maxWidthClass="max-w-4xl"
      disableEscapeClose={isRecording}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Done
        </button>
      }
    >
      <TierPlaylistManagerPanel
        active={open}
        onRecordingChange={setIsRecording}
      />
    </ModalShell>
  );
};
