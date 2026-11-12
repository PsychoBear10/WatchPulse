import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Lock, MonitorPlay, RefreshCw, Tv } from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { LiveRoomInfo, LiveStreamResolveResult } from '../../types/models';
import { buildLivePreviewUrl } from '../../utils/sanitizer';
import { SeamlessWebView } from './SeamlessWebView';

interface LiveStreamPlayerProps {
  username: string;
  muted: boolean;
  videoOnly: boolean;
  embedTemplate?: string;
  reloadToken?: number;
  liveRoom?: LiveRoomInfo;
  compact?: boolean;
  className?: string;
}

const STREAM_RESOLVE_CACHE = new Map<
  string,
  { resolvedAt: number; result: LiveStreamResolveResult }
>();
const CACHE_TTL_MS = 20_000;

export const LiveStreamPlayer: React.FC<LiveStreamPlayerProps> = ({
  username,
  muted,
  videoOnly,
  embedTemplate,
  reloadToken = 0,
  liveRoom,
  compact = false,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReloadRef = useRef(reloadToken);
  const mutedRef = useRef(muted);

  const [resolving, setResolving] = useState(videoOnly);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<string | undefined>(
    liveRoom?.currentShow
  );
  const [fallbackToWebview, setFallbackToWebview] = useState(!videoOnly);

  const embedSrc = buildLivePreviewUrl(username, embedTemplate, videoOnly, muted);
  const thumbSrc =
    liveRoom?.imageUrl ||
    `https://thumb.live.mmcdn.com/ri/${encodeURIComponent(username)}.jpg`;

  // Sync mute state immediately onto active HTML5 video without tearing down HLS
  useEffect(() => {
    mutedRef.current = muted;
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  // Resolve HLS stream URL when Video Only mode is enabled
  useEffect(() => {
    if (!videoOnly) {
      setResolving(false);
      setHlsUrl(null);
      setFallbackToWebview(true);
      return;
    }

    let cancelled = false;
    const forceRefresh = lastReloadRef.current !== reloadToken;
    lastReloadRef.current = reloadToken;

    const cleanKey = username.trim().toLowerCase();
    const cached = !forceRefresh ? STREAM_RESOLVE_CACHE.get(cleanKey) : undefined;
    if (
      cached &&
      Date.now() - cached.resolvedAt < CACHE_TTL_MS &&
      (!liveRoom?.currentShow ||
        !cached.result.roomStatus ||
        cached.result.roomStatus === liveRoom.currentShow)
    ) {
      const res = cached.result;
      setResolving(false);
      setRoomStatus(res.roomStatus ?? liveRoom?.currentShow);
      if (res.ok && res.hlsUrl) {
        setHlsUrl(res.hlsUrl);
        setFallbackToWebview(false);
      } else {
        setHlsUrl(null);
        setFallbackToWebview(
          !['private', 'away', 'hidden', 'offline'].includes(res.roomStatus || '')
        );
      }
      return;
    }

    setResolving(true);
    setFallbackToWebview(false);

    void desktopBridge.resolveLiveStream(cleanKey).then((res) => {
      if (cancelled) return;
      STREAM_RESOLVE_CACHE.set(cleanKey, {
        resolvedAt: Date.now(),
        result: res,
      });
      setResolving(false);
      setRoomStatus(res.roomStatus ?? liveRoom?.currentShow);
      if (res.ok && res.hlsUrl) {
        setHlsUrl(res.hlsUrl);
        setFallbackToWebview(false);
      } else {
        setHlsUrl(null);
        const isExplicitNonPublic =
          res.roomStatus &&
          ['private', 'away', 'hidden', 'offline'].includes(res.roomStatus);
        setFallbackToWebview(!isExplicitNonPublic);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [liveRoom?.currentShow, reloadToken, username, videoOnly]);

  // Mount hls.js onto <video> once hlsUrl resolves
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl || !videoOnly || fallbackToWebview) return;

    video.muted = mutedRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let recoveredOnce = false;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 12,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = mutedRef.current;
        void video.play().catch(() => {
          // ignore autoplay promise rejection if tab hidden
        });
      });
      hls.on(Hls.Events.ERROR, (_event, errData) => {
        if (!errData.fatal) return;
        if (errData.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredOnce) {
          recoveredOnce = true;
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        hlsRef.current = null;
        setFallbackToWebview(true);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.muted = mutedRef.current;
      video.src = hlsUrl;
      void video.play().catch(() => {
        // ignore autoplay promise rejection
      });
    } else {
      setFallbackToWebview(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [fallbackToWebview, hlsUrl, videoOnly]);

  if (!videoOnly || fallbackToWebview) {
    return (
      <SeamlessWebView
        src={embedSrc}
        muted={muted}
        videoOnly={videoOnly}
        title={username}
        reloadToken={reloadToken}
        className={className}
      />
    );
  }

  const normalizedStatus = (roomStatus || '').toLowerCase();
  const nonPublicStatus =
    !hlsUrl &&
    !resolving &&
    ['private', 'away', 'hidden', 'offline'].includes(normalizedStatus);

  if (nonPublicStatus) {
    const labelMap: Record<string, string> = {
      private: 'Private Show in Progress',
      away: 'Performer Is Away',
      hidden: 'Room Hidden',
      offline: 'Currently Offline',
    };
    return (
      <div
        className={`relative w-full h-full bg-[#090B10] flex flex-col items-center justify-center p-3 text-center gap-2 ${className}`}
      >
        <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <Lock className="w-4 h-4 text-amber-300" />
        </div>
        <div className="text-xs font-semibold text-slate-200">
          {labelMap[normalizedStatus] || normalizedStatus}
        </div>
        {!compact && (
          <button
            type="button"
            onClick={() => setFallbackToWebview(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.07] hover:bg-white/[0.14] text-slate-200 border border-white/10"
          >
            <MonitorPlay className="w-3 h-3" />
            Open Embed View
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        muted={muted}
        autoPlay
        playsInline
        controls={!compact}
        poster={thumbSrc}
        className="w-full h-full object-contain bg-black"
      />
      {resolving && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
          <RefreshCw className="w-4 h-4 text-indigo-300 animate-spin" />
          {!compact && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
              <Tv className="w-3 h-3 text-indigo-400" />
              Loading live video stream...
            </span>
          )}
        </div>
      )}
    </div>
  );
};
