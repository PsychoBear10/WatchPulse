import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Code2,
  FolderOpen,
  HardDrive,
  Keyboard,
  Link2,
  Moon,
  Palette,
  Radio,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wrench,
} from 'lucide-react';
import {
  DEFAULT_LIVE_FEED,
  DEFAULT_URL_TEMPLATES,
  desktopBridge,
} from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import { AppData, LiveFetchResult } from '../../types/models';
import { buildFeedPageUrl, extractRoomsFromPayload } from '../../utils/liveFeed';
import { ModalShell } from '../common/ModalShell';
import { TierPlaylistManagerPanel } from '../common/TierPlaylistManagerPanel';

export type SettingsTab = 'general' | 'playlists' | 'live' | 'templates' | 'advanced';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  initialTab = 'general',
}) => {
  const {
    data,
    appInfo,
    updateSettings,
    restoreBackupData,
    loadDemoModels,
    resanitizeAllUsernames,
    resetReviewTimestamps,
    clearLiveCache,
    refreshLiveFeed,
    notify,
  } = useAppStore();

  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [testingFeed, setTestingFeed] = useState(false);
  const [feedTestResult, setFeedTestResult] = useState<
    (LiveFetchResult & { parsedCount?: number; testedUrl?: string }) | null
  >(null);

  const [jsonScope, setJsonScope] = useState<'settings' | 'full'>('settings');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);

  const latestDataRef = useRef(data);
  latestDataRef.current = data;

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setFeedTestResult(null);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const snapshot = latestDataRef.current;
    setJsonError('');
    setJsonDraft(
      JSON.stringify(
        jsonScope === 'settings' ? snapshot.settings : snapshot,
        null,
        2
      )
    );
  }, [jsonScope, open, tab]);

  const handleRestoreJson = async () => {
    const res = await desktopBridge.openJsonBackup();
    if (res.canceled || !res.content) return;
    try {
      const parsed = JSON.parse(res.content) as AppData;
      if (!parsed || !Array.isArray(parsed.models) || !Array.isArray(parsed.tiers)) {
        notify('Selected JSON file is not a valid WatchPulse backup.', 'error');
        return;
      }
      restoreBackupData(parsed);
      onClose();
    } catch {
      notify('Could not parse JSON backup file.', 'error');
    }
  };

  const handleTestFeed = async () => {
    setTestingFeed(true);
    setFeedTestResult(null);
    const testedUrl = buildFeedPageUrl(data.settings.liveFeed, 0, 100);
    const res = await desktopBridge.fetchLiveJson(
      testedUrl,
      data.settings.liveFeed.authHeader
    );
    let parsedCount = 0;
    if (res.ok && res.data !== undefined) {
      parsedCount = extractRoomsFromPayload(res.data).rooms.length;
    }
    setFeedTestResult({ ...res, parsedCount, testedUrl });
    setTestingFeed(false);
  };

  const handleApplyRawJson = () => {
    setJsonError('');
    try {
      const parsed = JSON.parse(jsonDraft) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('JSON root must be an object.');
        return;
      }
      if (jsonScope === 'settings') {
        updateSettings(parsed as Partial<AppData['settings']>);
        notify('Updated internal settings from JSON.', 'success');
      } else {
        const candidate = parsed as AppData;
        if (
          !Array.isArray(candidate.tiers) ||
          !Array.isArray(candidate.models) ||
          !candidate.inbox
        ) {
          setJsonError(
            'Full AppData JSON must include inbox, tiers[], and models[].'
          );
          return;
        }
        restoreBackupData(candidate);
      }
    } catch (err) {
      setJsonError(
        err instanceof Error ? err.message : 'Invalid JSON syntax.'
      );
    }
  };

  const tabButton = (id: SettingsTab, label: string, icon: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        tab === id
          ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
          : 'text-slate-400 hover:text-white border border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Settings & Under-the-Hood Config"
      subtitle={`WatchPulse v${appInfo?.version ?? '2.0.0'}`}
      maxWidthClass="max-w-4xl"
      disableEscapeClose={tab === 'playlists' && isRecordingHotkey}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          Done
        </button>
      }
    >
      <div className="space-y-5">
        {/* Settings Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.08] w-fit">
          {tabButton('general', 'General & Shortcuts', <Sliders className="w-3.5 h-3.5" />)}
          {tabButton('playlists', 'Playlists & Tiers', <SlidersHorizontal className="w-3.5 h-3.5" />)}
          {tabButton('live', 'Live Monitor & Re-Sort', <Radio className="w-3.5 h-3.5" />)}
          {tabButton('templates', 'URL Templates', <Link2 className="w-3.5 h-3.5" />)}
          {tabButton('advanced', 'Under the Hood', <Wrench className="w-3.5 h-3.5" />)}
        </div>

        {tab === 'playlists' && (
          <TierPlaylistManagerPanel
            active={open && tab === 'playlists'}
            onRecordingChange={setIsRecordingHotkey}
          />
        )}

        {/* Tab 1: General & Shortcuts */}
        {tab === 'general' && (
          <div className="space-y-5">
            {/* Appearance & Theme (Dark, Grey, Light) */}
            <div className="p-4 rounded-xl liquid-glass border border-white/[0.08] space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Appearance &amp; Theme
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Choose between Deep Obsidian Dark, Frosted Grey, or Modern Light mode with Apple liquid glass materials.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {(
                  [
                    {
                      id: 'dark',
                      label: 'Dark Mode',
                      desc: 'Deep obsidian acrylic',
                      icon: Moon,
                    },
                    {
                      id: 'grey',
                      label: 'Grey Mode',
                      desc: 'Subtle slate studio glass',
                      icon: CircleDot,
                    },
                    {
                      id: 'light',
                      label: 'Light Mode',
                      desc: 'Bright high-contrast liquid',
                      icon: Sun,
                    },
                  ] as const
                ).map(({ id, label, desc, icon: Icon }) => {
                  const active = (data.settings.themeMode ?? 'dark') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateSettings({ themeMode: id })}
                      className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'border-indigo-400/80 bg-indigo-500/15 shadow-[0_0_16px_rgba(99,102,241,0.25)] ring-1 ring-indigo-400/50'
                          : 'border-white/10 bg-black/20 hover:bg-white/[0.04] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`w-4 h-4 ${
                            active ? 'text-indigo-300' : 'text-slate-400'
                          }`}
                        />
                        <span className="text-xs font-semibold text-white">
                          {label}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Workflow Preferences
              </h3>

              <label className="flex items-center justify-between gap-3 text-xs text-slate-200 cursor-pointer">
                <span>Show keyboard hotkey badges across buttons and columns</span>
                <input
                  type="checkbox"
                  checked={data.settings.showKeyboardHints}
                  onChange={(e) =>
                    updateSettings({ showKeyboardHints: e.target.checked })
                  }
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
              </label>

              <label className="flex items-center justify-between gap-3 text-xs text-slate-200 cursor-pointer">
                <span>Confirm before deleting models</span>
                <input
                  type="checkbox"
                  checked={data.settings.confirmDelete}
                  onChange={(e) =>
                    updateSettings({ confirmDelete: e.target.checked })
                  }
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
              </label>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Local Persistence & Backups
                </h3>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0A0C12] border border-white/[0.06] text-[11px] font-mono text-slate-400 break-all">
                {appInfo?.dataFilePath || 'Local browser storage fallback'}
              </div>

              <div className="flex flex-wrap gap-2">
                {desktopBridge.isElectron() && (
                  <button
                    type="button"
                    onClick={() => void desktopBridge.openDataFolder()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
                    Open Data Folder
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRestoreJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-300" />
                  Restore JSON Backup...
                </button>

                <button
                  type="button"
                  onClick={() => {
                    loadDemoModels();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Load Sample Models
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-indigo-300" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Keyboard Shortcuts
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Live Monitor View</span>
                  <kbd className="kbd-cap">Ctrl+1</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Rapid Sorter View</span>
                  <kbd className="kbd-cap">Ctrl+2</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Kanban Board View</span>
                  <kbd className="kbd-cap">Ctrl+3</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Rapid Sorter → Data Grid</span>
                  <kbd className="kbd-cap">Ctrl+4</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Import / Add Models</span>
                  <kbd className="kbd-cap">Ctrl+I</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Skip Deck Card</span>
                  <kbd className="kbd-cap">Space</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Undo Deck Action</span>
                  <kbd className="kbd-cap">Z / ⌫</kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
                  <span className="text-slate-400">Exit Quick-Edit Input</span>
                  <kbd className="kbd-cap">Esc</kbd>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Live Monitor & Periodic Re-Sort */}
        {tab === 'live' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Periodic Tier Re-Sort & Stale Thresholds
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Flag models whose tier hasn&apos;t been reviewed within N days (override per tier in Tiers &amp; Hotkeys).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Default Review Cadence (Days, 0 = off)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={data.settings.defaultReviewCadenceDays}
                    onChange={(e) =>
                      updateSettings({
                        defaultReviewCadenceDays: Math.max(
                          0,
                          Number.parseInt(e.target.value, 10) || 0
                        ),
                      })
                    }
                    className="studio-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Stale Offline Threshold (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={data.settings.staleOfflineDays}
                    onChange={(e) =>
                      updateSettings({
                        staleOfflineDays: Math.max(
                          0,
                          Number.parseInt(e.target.value, 10) || 0
                        ),
                      })
                    }
                    className="studio-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Recycling Bin Retention (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={data.settings.trashRetentionDays}
                    onChange={(e) =>
                      updateSettings({
                        trashRetentionDays: Math.max(
                          1,
                          Number.parseInt(e.target.value, 10) || 45
                        ),
                      })
                    }
                    className="studio-input text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Live Room Feed Poller (Zero-Config / Affiliate / Custom JSON)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    By default, WatchPulse polls CBExplorer&apos;s public CDN live rooms index (no campaign code required). You can also switch to a Chaturbate Affiliate <code className="text-indigo-300">wm</code> URL or custom/Statbate JSON feed. Placeholders:{' '}
                    <code className="text-indigo-300">{'{wm}'}</code>,{' '}
                    <code className="text-indigo-300">{'{limit}'}</code>,{' '}
                    <code className="text-indigo-300">{'{offset}'}</code>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      liveFeed: { ...DEFAULT_LIVE_FEED },
                    })
                  }
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Reset Feed Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0C0F16] border border-white/10 text-xs text-slate-200 cursor-pointer">
                  <span>Enable Live Monitor Polling</span>
                  <input
                    type="checkbox"
                    checked={data.settings.liveFeed.enabled}
                    onChange={(e) =>
                      updateSettings({
                        liveFeed: {
                          ...data.settings.liveFeed,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-white/20 bg-black/40 text-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0C0F16] border border-white/10 text-xs text-slate-200 cursor-pointer">
                  <span>Auto-Refresh Snapshots on Timer</span>
                  <input
                    type="checkbox"
                    checked={data.settings.liveFeed.autoRefreshSnapshots}
                    onChange={(e) =>
                      updateSettings({
                        liveFeed: {
                          ...data.settings.liveFeed,
                          autoRefreshSnapshots: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-white/20 bg-black/40 text-indigo-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Affiliate Campaign Code (wm)
                  </label>
                  <input
                    type="text"
                    value={data.settings.liveFeed.affiliateWm}
                    onChange={(e) =>
                      updateSettings({
                        liveFeed: {
                          ...data.settings.liveFeed,
                          affiliateWm: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g. your_wm_code"
                    className="studio-input text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Refresh Interval (Seconds, min 10)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={data.settings.liveFeed.refreshIntervalSec}
                    onChange={(e) =>
                      updateSettings({
                        liveFeed: {
                          ...data.settings.liveFeed,
                          refreshIntervalSec: Math.max(
                            10,
                            Number.parseInt(e.target.value, 10) || 30
                          ),
                        },
                      })
                    }
                    className="studio-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Max Pages per Poll (500/page, up to 25)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={data.settings.liveFeed.maxPages}
                    onChange={(e) =>
                      updateSettings({
                        liveFeed: {
                          ...data.settings.liveFeed,
                          maxPages: Math.min(
                            25,
                            Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                          ),
                        },
                      })
                    }
                    className="studio-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Online Rooms API Endpoint Template
                </label>
                <input
                  type="text"
                  value={data.settings.liveFeed.endpointTemplate}
                  onChange={(e) =>
                    updateSettings({
                      liveFeed: {
                        ...data.settings.liveFeed,
                        endpointTemplate: e.target.value,
                      },
                    })
                  }
                  className="studio-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Authorization Header (optional — e.g. Bearer token for Statbate Plus / custom feed)
                </label>
                <input
                  type="password"
                  value={data.settings.liveFeed.authHeader ?? ''}
                  onChange={(e) =>
                    updateSettings({
                      liveFeed: {
                        ...data.settings.liveFeed,
                        authHeader: e.target.value,
                      },
                    })
                  }
                  placeholder="Bearer your_api_token"
                  className="studio-input text-xs font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleTestFeed()}
                  disabled={testingFeed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-white disabled:opacity-50"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  {testingFeed ? 'Testing...' : 'Test Feed Connection'}
                </button>

                <button
                  type="button"
                  onClick={() => void refreshLiveFeed(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Sync All Watchlist Now
                </button>
              </div>

              {feedTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    feedTestResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                      : 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                  }`}
                >
                  <div className="font-semibold flex items-center justify-between">
                    <span>
                      {feedTestResult.ok
                        ? `Connected cleanly — parsed ${feedTestResult.parsedCount ?? 0} rooms`
                        : `Connection check failed: ${feedTestResult.error}`}
                    </span>
                    <span className="font-mono text-[11px] opacity-80">
                      HTTP {feedTestResult.status} · {feedTestResult.latencyMs}ms
                    </span>
                  </div>
                  {feedTestResult.testedUrl && (
                    <div className="text-[10px] font-mono opacity-75 break-all">
                      {feedTestResult.testedUrl}
                    </div>
                  )}
                  {feedTestResult.rawSnippet && (
                    <pre className="mt-1 p-2 rounded bg-black/40 text-[10px] font-mono overflow-x-auto">
                      {feedTestResult.rawSnippet}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: URL Templates */}
        {tab === 'templates' && (
          <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Automated URL & Silent Preview Templates
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Customize every dynamically generated URL. Use{' '}
                  <code className="text-indigo-300">{'{username}'}</code> where the sanitized handle belongs.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ urlTemplates: { ...DEFAULT_URL_TEMPLATES } })
                }
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Reset Defaults
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  CBHours Tracker Template
                </label>
                <input
                  type="text"
                  value={data.settings.urlTemplates.cbhours}
                  onChange={(e) =>
                    updateSettings({
                      urlTemplates: {
                        ...data.settings.urlTemplates,
                        cbhours: e.target.value,
                      },
                    })
                  }
                  className="studio-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  CBExplorer Watchlist Template
                </label>
                <input
                  type="text"
                  value={data.settings.urlTemplates.cbexplorer}
                  onChange={(e) =>
                    updateSettings({
                      urlTemplates: {
                        ...data.settings.urlTemplates,
                        cbexplorer: e.target.value,
                      },
                    })
                  }
                  className="studio-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  ArchiveBate Recordings Template
                </label>
                <input
                  type="text"
                  value={data.settings.urlTemplates.archivebate}
                  onChange={(e) =>
                    updateSettings({
                      urlTemplates: {
                        ...data.settings.urlTemplates,
                        archivebate: e.target.value,
                      },
                    })
                  }
                  className="studio-input text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Silent Live View Embed Template (Muted Webview)
                </label>
                <input
                  type="text"
                  value={data.settings.urlTemplates.livePreview}
                  onChange={(e) =>
                    updateSettings({
                      urlTemplates: {
                        ...data.settings.urlTemplates,
                        livePreview: e.target.value,
                      },
                    })
                  }
                  className="studio-input text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Under the Hood (Maintenance + Raw JSON Inspector) */}
        {tab === 'advanced' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Batch Maintenance Utilities
              </h3>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const count = resanitizeAllUsernames();
                    notify(
                      count > 0
                        ? `Re-sanitized ${count} model username(s).`
                        : 'All model usernames are already clean.',
                      'success'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Re-sanitize All Usernames
                </button>

                <button
                  type="button"
                  onClick={resetReviewTimestamps}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                >
                  Mark All Reviewed Today
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearLiveCache();
                    notify('Cleared live room status cache.', 'info');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
                >
                  Clear Live Cache
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-white/[0.08] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-indigo-300" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Internal JSON Tweaker
                  </h3>
                </div>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/40 border border-white/10 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setJsonScope('settings')}
                    className={`px-2.5 py-1 rounded font-medium ${
                      jsonScope === 'settings'
                        ? 'bg-indigo-500/25 text-indigo-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    settings JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setJsonScope('full')}
                    className={`px-2.5 py-1 rounded font-medium ${
                      jsonScope === 'full'
                        ? 'bg-indigo-500/25 text-indigo-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Full AppData JSON
                  </button>
                </div>
              </div>

              <textarea
                rows={12}
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                spellCheck={false}
                className="w-full rounded-xl bg-[#080A10] border border-white/10 p-3 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
              />

              {jsonError && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
                  {jsonError}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setJsonError('');
                    setJsonDraft(
                      JSON.stringify(
                        jsonScope === 'settings' ? data.settings : data,
                        null,
                        2
                      )
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300"
                >
                  Reload Current State
                </button>

                <button
                  type="button"
                  onClick={handleApplyRawJson}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Validate &amp; Apply JSON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
