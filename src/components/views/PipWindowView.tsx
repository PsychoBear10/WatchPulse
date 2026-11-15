import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  RotateCw,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { WatchPulseLogo } from '../common/WatchPulseLogo';
import { LiveStreamPlayer } from '../common/LiveStreamPlayer';

interface PipWindowViewProps {
  username: string;
  initialMuted?: boolean;
  initialVideoOnly?: boolean;
  embedTemplate?: string;
}

export const PipWindowView: React.FC<PipWindowViewProps> = ({
  username: initialUsername,
  initialMuted = false,
  initialVideoOnly = true,
  embedTemplate: initialEmbedTemplate,
}) => {
  const [username, setUsername] = useState(initialUsername);
  const [muted, setMuted] = useState(initialMuted);
  const [videoOnly, setVideoOnly] = useState(initialVideoOnly);
  const [embedTemplate, setEmbedTemplate] = useState(initialEmbedTemplate);
  const [reloadToken, setReloadToken] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Smoothly switch model stream in-place when user picks another model without window reloading
  useEffect(() => {
    return desktopBridge.onPipNavigate((params) => {
      if (params.username) {
        setUsername(params.username);
        if (params.muted !== undefined) setMuted(params.muted);
        if (params.videoOnly !== undefined) setVideoOnly(params.videoOnly);
        if (params.embedTemplate !== undefined) setEmbedTemplate(params.embedTemplate);
      }
    });
  }, []);

  const handleMouseMove = () => {
    setIsHovered(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 2500);
  };

  const handleMouseLeave = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    setIsHovered(false);
  };

  const handleClose = async () => {
    await desktopBridge.closePip();
  };

  const handleReturnToStudio = async () => {
    await desktopBridge.closePip();
    await desktopBridge.focusMainWindow();
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-screen h-screen bg-black flex flex-col select-none overflow-hidden group"
    >
      {/* Top Drag Handle Bar (Invisible, allows moving window effortlessly from top edge) */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onDoubleClick={handleReturnToStudio}
        title="Double-click to return to WatchPulse Studio"
        className="absolute top-0 left-0 right-0 h-8 z-20 cursor-move"
      />

      {/* Pure Edge-to-Edge Live Stream Video (100% full window, zero black borders or bars) */}
      <main className="absolute inset-0 w-full h-full bg-black overflow-hidden flex items-center justify-center">
        <LiveStreamPlayer
          username={username}
          muted={muted}
          videoOnly={videoOnly}
          embedTemplate={embedTemplate}
          reloadToken={reloadToken}
          compact
          showPipOverlay={false}
          className="w-full h-full"
        />
      </main>

      {/* Apple-Style Decluttered Autohiding Floating Glass Controls */}
      <div
        className={`absolute top-2.5 left-3 right-3 z-30 transition-all duration-300 pointer-events-none ${
          isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
      >
        <div
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          onDoubleClick={handleReturnToStudio}
          className="h-9 px-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.6)] flex items-center justify-between gap-2.5 pointer-events-auto transition-colors"
        >
          {/* Left: Brand + Model Name + Live Dot (Draggable) */}
          <div className="flex items-center gap-2 min-w-0">
            <WatchPulseLogo size="sm" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-white tracking-tight truncate max-w-[170px]">
                {username}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-red-500/25 text-red-300 border border-red-500/40 text-[9px] font-bold uppercase tracking-wider shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            </div>
          </div>

          {/* Right: Minimal Essential Controls (Non-Draggable) */}
          <div
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-0.5 shrink-0"
          >
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                muted
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Video-Only Mode Toggle */}
            <button
              type="button"
              onClick={() => setVideoOnly((v) => !v)}
              title={videoOnly ? 'Video-Only Mode (Clean stream)' : 'Embedded Mode (With chat)'}
              className={`p-1.5 rounded-lg transition-all active:scale-90 ${
                videoOnly
                  ? 'text-indigo-300 bg-indigo-500/25 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
            </button>

            {/* Reload Stream */}
            <button
              type="button"
              onClick={() => setReloadToken((t) => t + 1)}
              title="Reload stream"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            {/* Return to WatchPulse Studio */}
            <button
              type="button"
              onClick={handleReturnToStudio}
              title="Return to WatchPulse Studio (Restores stream to Stage)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Close PiP */}
            <button
              type="button"
              onClick={handleClose}
              title="Close Picture in Picture"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/25 transition-all active:scale-90"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
