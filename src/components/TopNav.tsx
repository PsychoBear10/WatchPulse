import React from 'react';
import {
  CheckCircle2,
  Download,
  Kanban,
  Plus,
  Radio,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ActiveView } from '../types/models';

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
  const { data, saveState, liveRoomsByUsername } = useAppStore();

  const totalCount = data.models.length;
  const inboxCount = data.models.filter((m) => m.tierId === 'inbox').length;
  const watchlistedCount = data.models.filter((m) => m.cbexplorerAdded).length;
  const trashedCount = data.trashedModels?.length ?? 0;
  const liveCount = Object.keys(liveRoomsByUsername).length;

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
    <header className="h-14 shrink-0 px-4 border-b border-white/[0.08] bg-[#0D1017]/95 backdrop-blur flex items-center justify-between gap-3 select-none">
      {/* Left: Brand + View Switcher */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0B0E18] border border-indigo-400/35 flex items-center justify-center shadow-lg shadow-indigo-500/20 overflow-hidden">
            <svg
              viewBox="0 0 32 32"
              className="w-6 h-6"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="16"
                cy="12"
                r="7.5"
                stroke="#6366F1"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              <path
                d="M5.5 12C8.3 7.5 12 5.7 16 5.7C20 5.7 23.7 7.5 26.5 12C23.7 16.5 20 18.3 16 18.3C12 18.3 8.3 16.5 5.5 12Z"
                stroke="#A5B4FC"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle
                cx="16"
                cy="12"
                r="3.2"
                stroke="#34D399"
                strokeWidth="1.6"
              />
              <circle cx="16" cy="12" r="1.7" fill="#10B981" />
              <rect x="7" y="21" width="18" height="2.2" rx="1.1" fill="#F43F5E" />
              <rect x="7" y="24.5" width="14" height="2.2" rx="1.1" fill="#F59E0B" />
              <rect x="7" y="28" width="10" height="2.2" rx="1.1" fill="#10B981" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">
              WatchPulse
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

        <nav className="flex items-center p-1 rounded-xl bg-black/40 border border-white/[0.07]">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 shadow-sm'
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

      {/* Right: Save Status + Actions */}
      <div className="flex items-center gap-2">
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Import
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          title="Export Watchlist Data (Ctrl+E)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-emerald-300" />
          Export
        </button>

        <button
          type="button"
          onClick={onOpenTrash}
          title={`Recycling Bin (${data.settings.trashRetentionDays || 45}-day retention)`}
          className="relative inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/10 bg-white/[0.03] transition-colors"
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
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/10 bg-white/[0.03] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
