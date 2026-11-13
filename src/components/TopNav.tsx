import React from 'react';
import {
  CheckCircle2,
  CircleDot,
  Download,
  Kanban,
  Moon,
  Plus,
  Radio,
  Settings,
  Sun,
  Trash2,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ActiveView, ThemeMode } from '../types/models';
import { WatchPulseLogo } from './common/WatchPulseLogo';

interface TopNavProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onChangeView,
  onOpenImport,
  onOpenExport,
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
      label: 'Rapid Sorter',
      icon: <Zap className="w-3.5 h-3.5" />,
      shortcut: 'Ctrl+2',
    },
    {
      id: 'kanban',
      label: 'Kanban Board',
      icon: <Kanban className="w-3.5 h-3.5" />,
      shortcut: 'Ctrl+3',
    },
  ];

  return (
    <header className="h-14 shrink-0 px-4 liquid-glass-header flex items-center justify-between gap-3 select-none z-10 transition-colors">
      {/* Left: Brand + View Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <WatchPulseLogo size="md" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
              <span>WatchPulse</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                v3.0
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span>{totalCount} models</span>
              <span className="text-slate-600">•</span>
              <span>{inboxCount} unsorted</span>
              {totalCount > 0 && (
                <>
                  <span className="text-slate-600">•</span>
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
              (item.id === 'sorter' && activeView === 'grid');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                title={`${item.label} (${item.shortcut})`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 shadow-[0_2px_12px_rgba(99,102,241,0.25)]'
                    : 'text-slate-400 border border-transparent hover:text-slate-100 hover:bg-white/[0.04]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Theme Switcher + Save Status + Actions */}
      <div className="flex items-center gap-2">
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
                className={`p-1.5 rounded-full text-xs font-medium transition-all ${
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
          onClick={onOpenImport}
          title="Import / Add Models (Ctrl+I)"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5" />
          Import
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          title="Export Watchlist Data (Ctrl+E)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium liquid-pill text-slate-200 transition-all active:scale-[0.98]"
        >
          <Download className="w-3.5 h-3.5 text-emerald-300" />
          Export
        </button>

        <button
          type="button"
          onClick={onOpenTrash}
          title={`Recycling Bin (${data.settings.trashRetentionDays || 45}-day retention)`}
          className="relative inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-slate-400 hover:text-white liquid-pill transition-all active:scale-[0.98]"
        >
          <Trash2 className="w-4 h-4" />
          {trashedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/35">
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
      </div>
    </header>
  );
};
