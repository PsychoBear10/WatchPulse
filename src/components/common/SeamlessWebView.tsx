import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { DetectedLiveCandidate } from '../../utils/liveFeed';

interface SeamlessWebViewProps {
  src: string;
  muted: boolean;
  title: string;
  reloadToken?: number;
  className?: string;
  videoOnly?: boolean;
  onPageReady?: () => void;
}

export interface SeamlessWebViewHandle {
  reload: () => void;
  scanVisibleCandidates: () => Promise<DetectedLiveCandidate[]>;
}

interface WebviewElement extends HTMLElement {
  src: string;
  reload: () => void;
  setAudioMuted: (muted: boolean) => void;
  executeJavaScript: <T = unknown>(code: string) => Promise<T>;
  insertCSS: (css: string) => Promise<string>;
}

const VIDEO_ONLY_CSS = `
html.wp-video-only-active,
html.wp-video-only-active body {
  background: #000 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  width: 100% !important;
  height: 100% !important;
}
html.wp-video-only-active header,
html.wp-video-only-active nav,
html.wp-video-only-active footer,
html.wp-video-only-active .top-section,
html.wp-video-only-active .chat-holder,
html.wp-video-only-active .TheaterModeHeader,
html.wp-video-only-active [class*="promo" i],
html.wp-video-only-active [class*="banner" i],
html.wp-video-only-active [class*="upsell" i],
html.wp-video-only-active [class*="logo" i],
html.wp-video-only-active [class*="watermark" i],
html.wp-video-only-active [class*="overlay" i],
html.wp-video-only-active a[href*="/in/?"] {
  display: none !important;
}
html.wp-video-only-active [data-wp-video-host="1"] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #000 !important;
  z-index: 2147483640 !important;
}
html.wp-video-only-active [data-wp-video-host="1"] video,
html.wp-video-only-active video[data-wp-video-host="1"] {
  width: 100% !important;
  height: 100% !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  object-fit: contain !important;
  background: #000 !important;
}
`;

function buildVideoIsolationScript(enabled: boolean): string {
  if (!enabled) {
    return `(() => {
      try {
        document.documentElement.classList.remove('wp-video-only-active');
        document.querySelectorAll('[data-wp-video-host="1"]').forEach((node) => {
          node.removeAttribute('data-wp-video-host');
        });
      } catch {}
    })()`;
  }

  return `(() => {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      const playable = videos.find((v) =>
        v.readyState >= 1 ||
        v.videoWidth > 0 ||
        Boolean(v.currentSrc) ||
        Boolean(v.getAttribute('src')) ||
        Boolean(v.querySelector('source'))
      );
      if (!playable) return false;
      const host =
        playable.closest('.video-js, #player, #still_video_object, [class*="player"]') ||
        playable;
      document.querySelectorAll('[data-wp-video-host="1"]').forEach((node) => {
        if (node !== host) node.removeAttribute('data-wp-video-host');
      });
      host.setAttribute('data-wp-video-host', '1');
      document.documentElement.classList.add('wp-video-only-active');
      return true;
    } catch {
      return false;
    }
  })()`;
}

const DOM_SCAN_SCRIPT = `(() => {
  try {
    const results = [];
    const seen = new Set();
    const cards = document.querySelectorAll('[data-room], li.room_list_room, .roomcard, .room-card, [class*="roomCard"]');
    for (const card of cards) {
      const dataRoom = card.getAttribute('data-room');
      const linkEl = card.querySelector('a[href]');
      const href = dataRoom || (linkEl ? linkEl.getAttribute('href') : '');
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const viewerNode = card.querySelector('.viewers, [class*="viewer"], .cams');
      const viewerText = viewerNode ? viewerNode.textContent || '' : '';
      const numMatch = viewerText.replace(/,/g, '').match(/\\d+/);
      const subjNode = card.querySelector('.subject, [class*="subject"], .title');
      results.push({
        hrefOrSlug: href,
        viewers: numMatch ? parseInt(numMatch[0], 10) : undefined,
        subject: subjNode ? (subjNode.textContent || '').trim().slice(0, 140) : undefined
      });
    }
    const mainLinks = document.querySelectorAll('main a[href], #room_list a[href], .list a[href], a[href]');
    for (const a of mainLinks) {
      if (a.closest('nav, header, footer')) continue;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      results.push({ hrefOrSlug: href });
    }
    return results.slice(0, 1500);
  } catch {
    return [];
  }
})()`;

export const SeamlessWebView = forwardRef<
  SeamlessWebViewHandle,
  SeamlessWebViewProps
>(
  (
    {
      src,
      muted,
      title,
      reloadToken = 0,
      className = '',
      videoOnly = false,
      onPageReady,
    },
    ref
  ) => {
  const webviewRef = useRef<WebviewElement | null>(null);
  const domReadyRef = useRef(false);
  const mutedRef = useRef(muted);
  const onPageReadyRef = useRef(onPageReady);
  mutedRef.current = muted;
  onPageReadyRef.current = onPageReady;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const isElectron = desktopBridge.isElectron();

  useImperativeHandle(
    ref,
    () => ({
      reload: () => {
        try {
          webviewRef.current?.reload();
        } catch {
          // ignore if unmounted
        }
      },
      scanVisibleCandidates: async () => {
        const el = webviewRef.current;
        if (!el || !isElectron) return [];
        try {
          const rows = await el.executeJavaScript<DetectedLiveCandidate[]>(
            DOM_SCAN_SCRIPT
          );
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      },
    }),
    [isElectron]
  );

  useEffect(() => {
    domReadyRef.current = false;
    setLoading(true);
    setLoadFailed(false);
  }, [src, reloadToken]);

  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !isElectron) return;
    try {
      el.setAudioMuted(muted);
    } catch {
      // webview may still be initializing
    }
  }, [isElectron, muted]);

  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !isElectron) return;

    let cancelled = false;
    let pollTimer: number | undefined;

    const applyMute = () => {
      try {
        el.setAudioMuted(mutedRef.current);
      } catch {
        // webview may still be initializing
      }
    };

    const syncVideoIsolation = async () => {
      if (cancelled || !domReadyRef.current) return;
      try {
        if (videoOnly) {
          await el.insertCSS(VIDEO_ONLY_CSS);
        }
        const isolated = await el.executeJavaScript<boolean>(
          buildVideoIsolationScript(videoOnly)
        );
        return Boolean(isolated);
      } catch {
        return false;
      }
    };

    const startVideoIsolationRetry = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
      if (!videoOnly) {
        void syncVideoIsolation();
        return;
      }
      let attempts = 0;
      const attemptIsolate = async () => {
        attempts += 1;
        const ok = await syncVideoIsolation();
        if ((ok || attempts >= 14) && pollTimer !== undefined) {
          window.clearInterval(pollTimer);
          pollTimer = undefined;
        }
      };
      void attemptIsolate();
      pollTimer = window.setInterval(() => {
        void attemptIsolate();
      }, 600);
    };

    const handleDomReady = () => {
      domReadyRef.current = true;
      applyMute();
      setLoading(false);
      startVideoIsolationRetry();
    };
    const handleStart = () => {
      domReadyRef.current = false;
      setLoading(true);
      setLoadFailed(false);
    };
    const handleStop = () => {
      domReadyRef.current = true;
      applyMute();
      setLoading(false);
      startVideoIsolationRetry();
      onPageReadyRef.current?.();
    };
    const handleFail = (event: Event) => {
      const failEvt = event as Event & {
        errorCode?: number;
        isMainFrame?: boolean;
      };
      // Ignore ERR_ABORTED (-3) redirects and sub-frame cancellations
      if (failEvt.errorCode === -3 || failEvt.isMainFrame === false) {
        return;
      }
      setLoading(false);
      setLoadFailed(true);
    };

    el.addEventListener('dom-ready', handleDomReady);
    el.addEventListener('did-start-loading', handleStart);
    el.addEventListener('did-stop-loading', handleStop);
    el.addEventListener('did-fail-load', handleFail);
    applyMute();
    if (domReadyRef.current) {
      startVideoIsolationRetry();
    }

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
      el.removeEventListener('dom-ready', handleDomReady);
      el.removeEventListener('did-start-loading', handleStart);
      el.removeEventListener('did-stop-loading', handleStop);
      el.removeEventListener('did-fail-load', handleFail);
    };
  }, [isElectron, src, videoOnly]);

  useEffect(() => {
    const el = webviewRef.current;
    if (!el || !isElectron || reloadToken === 0) return;
    try {
      el.reload();
    } catch {
      // ignore if not yet attached
    }
  }, [isElectron, reloadToken]);

  return (
    <div className={`relative w-full h-full bg-[#090B10] overflow-hidden ${className}`}>
      {isElectron ? (
        <webview
          ref={(node) => {
            webviewRef.current = node as WebviewElement | null;
          }}
          src={src}
          partition="persist:live-preview"
          className="w-full h-full"
        />
      ) : (
        <iframe
          key={`${src}_${reloadToken}`}
          src={src}
          title={title}
          onLoad={() => setLoading(false)}
          className="w-full h-full border-0 bg-[#090B10]"
          allow="autoplay; fullscreen"
        />
      )}

      {loading && (
        <div className="absolute inset-0 bg-[#090B10]/90 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
          <span className="text-[11px] text-slate-400">Connecting view...</span>
        </div>
      )}

      {loadFailed && (
        <div className="absolute inset-0 bg-[#090B10]/95 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-xs text-slate-300">
            Could not load embedded view directly.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoadFailed(false);
                setLoading(true);
                webviewRef.current?.reload();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void desktopBridge.openExternal(src)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Browser
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

SeamlessWebView.displayName = 'SeamlessWebView';
