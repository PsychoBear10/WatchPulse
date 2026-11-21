import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDot,
  Moon,
  Radio,
  Settings,
  Sun,
  Trash2,
  Zap,
} from 'lucide-react';
import { desktopBridge } from '../services/bridge';
import { useAppStore } from '../store/useAppStore';
import { ActiveView, ThemeMode } from '../types/models';
import { WatchPulseLogo } from './common/WatchPulseLogo';

interface TopNavProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  onOpenImport?: () => void;
  onOpenExport?: () => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onChangeView,
  onOpenTrash,
  onOpenSettings,
}) => {
  const { data, saveState, liveRoomsByUsername, setThemeMode } = useAppStore();

  const totalCount = data.models.length;
  const inboxCount = data.models.filter((m) => m.tierId === 'inbox').length;
  const watchlistedCount = data.models.filter((m) => m.cbexplorerAdded).length;
  const trashedCount = data.trashedModels?.length ?? 0;
  const liveCount = Object.keys(liveRoomsByUsername).length;
  const activeTheme = data.settings.themeMode || 'dark';

  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = desktopBridge.isElectron();

  useEffect(() => {
    if (!isElectron) return;
    desktopBridge.isWindowMaximized().then(setIsMaximized).catch(() => {});
    return desktopBridge.onWindowMaximizeChange((maximized) => {
      setIsMaximized(maximized);
    });
  }, [isElectron]);

  const themeOptions: Array<{ id: ThemeMode; label: string; icon: React.ReactNode }> = [
    {
      id: 'dark',
      label: 'Dark Mode (Midnight)',
      icon: <Moon className="w-3 h-3" />,
    },
    {
      id: 'grey',
      label: 'Grey Mode (Space Gray)',
      icon: <CircleDot className="w-3 h-3" />,
    },
    {
      id: 'light',
      label: 'Light Mode (Ice Glass)',
      icon: <Sun className="w-3 h-3" />,
    },
  ];

  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ReactNode;
    shortcut: string;
    badge?: number;
  }> = [
    {
      id: 'live',
      label: 'Live Monitor',
      icon: <Radio className="w-3.5 h-3.5" />,
      shortcut: 'Ctrl+1',
      badge: liveCount > 0 ? liveCount : undefined,
    },
    {
      id: 'sorter',
      label: 'Triage Model Library',
      icon: <Zap className="w-3.5 h-3.5" />,
      shortcut: 'Ctrl+2',
    },
  ];

  return (
    <header
      onDoubleClick={() => {
        if (isElectron) {
          void desktopBridge.maximizeWindow();
        }
      }}
      className="h-14 shrink-0 px-4 liquid-glass-header flex items-center justify-between gap-3 select-none z-10 transition-colors app-region-drag"
    >
      {/* Left: Brand + View Switcher */}
      <div className="flex items-center gap-4 app-region-no-drag">
        <div className="flex items-center gap-2.5">
          <WatchPulseLogo size="md" />
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
              <span>WatchPulse</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                v3.09
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 whitespace-nowrap truncate">
              <span>{totalCount} models</span>
              <span className="text-slate-400">•</span>
              <span>{inboxCount} unsorted</span>
              {totalCount > 0 && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-emerald-400/90 inline-flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {watchlistedCount}/{totalCount}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="flex items-center p-1 rounded-2xl liquid-segmented">
          {navItems.map((item) => {
            const active =
              activeView === item.id ||
              (item.id === 'sorter' && (activeView === 'grid' || activeView === 'kanban'));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                title={`${item.label} (${item.shortcut})`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 shadow-[0_2px_12px_rgba(99,102,241,0.25)]'
                    : 'text-slate-400 border border-transparent hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.04]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Theme Switcher + Save Status + Actions + iMac Window Controls */}
      <div className="flex items-center gap-2 app-region-no-drag">
        {/* Apple 3-Way Theme Switcher */}
        <div
          className="liquid-segmented p-0.5 rounded-full"
          title="Switch Appearance: Dark Mode / Grey Mode / Light Mode"
        >
          {themeOptions.map((opt) => {
            const isSelected = activeTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setThemeMode(opt.id)}
                title={opt.label}
                className={`p-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-white/20 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] border border-white/25 scale-105'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {opt.icon}
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center mr-1 text-[11px] font-medium">
          {saveState === 'saving' && (
            <span className="text-amber-300/80">Saving...</span>
          )}
          {saveState === 'saved' && (
            <span className="text-emerald-400/90">Saved</span>
          )}
          {saveState === 'error' && (
            <span className="text-rose-400">Save failed</span>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenTrash}
          title={`Recycling Bin (${data.settings.trashRetentionDays || 45}-day retention)`}
          className="relative inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-slate-400 hover:text-white liquid-pill transition-all active:scale-[0.98]"
        >
          <Trash2 className="w-4 h-4" />
          {trashedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/35">
              {trashedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Workspace Settings & Shortcuts"
          className="p-2 rounded-xl text-slate-400 hover:text-white liquid-pill transition-all active:scale-[0.98]"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* iMac Style Traffic Light Window Controls */}
        {isElectron && (
          <>
            <div className="h-5 w-px bg-white/10 mx-1" />
            <div
              className="group/traffic flex items-center gap-2 px-2.5 py-1.5 rounded-full liquid-pill app-region-no-drag select-none shadow-sm"
              title="Window Controls (iMac Style)"
            >
              {/* Close - Red */}
              <button
                type="button"
                onClick={() => void desktopBridge.closeWindow()}
                title="Close WatchPulse"
                className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] border border-[#E0443E]/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 focus:outline-none cursor-pointer"
              >
                <span className="opacity-0 group-hover/traffic:opacity-100 text-[#4C0000] text-[8px] font-black leading-none transition-opacity select-none">
                  ✕
                </span>
              </button>

              {/* Minimize - Yellow */}
              <button
                type="button"
                onClick={() => void desktopBridge.minimizeWindow()}
                title="Minimize to Taskbar"
                className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 focus:outline-none cursor-pointer"
              >
                <span className="opacity-0 group-hover/traffic:opacity-100 text-[#5C3C00] text-[8px] font-black leading-none transition-opacity select-none -translate-y-[0.5px]">
                  —
                </span>
              </button>

              {/* Maximize / Restore - Green */}
              <button
                type="button"
                onClick={() => void desktopBridge.maximizeWindow()}
                title={isMaximized ? 'Restore Window' : 'Maximize Window'}
                className="w-3.5 h-3.5 rounded-full bg-[#27C93F] border border-[#1AAB29]/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)] flex items-center justify-center transition-all hover:scale-110 active:scale-95 focus:outline-none cursor-pointer"
              >
                <span className="opacity-0 group-hover/traffic:opacity-100 text-[#004D11] text-[7px] font-black leading-none transition-opacity select-none">
                  {isMaximized ? '⤡' : '⤢'}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
