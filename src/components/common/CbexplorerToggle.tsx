import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface CbexplorerToggleProps {
  checked: boolean;
  onToggle: () => void;
  size?: 'compact' | 'default';
}

export const CbexplorerToggle: React.FC<CbexplorerToggleProps> = ({
  checked,
  onToggle,
  size = 'default',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  if (size === 'compact') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleClick}
        title={
          checked
            ? 'Added to CBExplorer Watchlist (click to unmark)'
            : 'Mark as Added to CBExplorer Watchlist'
        }
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
          checked
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25'
            : 'bg-white/[0.03] text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20'
        }`}
      >
        {checked ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}
        <span>{checked ? 'Watchlisted' : 'CBExplorer'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      className={`group flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl border text-left transition-all ${
        checked
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 shadow-[0_0_20px_-6px_rgba(16,185,129,0.45)]'
          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06] hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {checked ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <Circle className="w-4 h-4 text-slate-500 group-hover:text-slate-300 shrink-0" />
        )}
        <span className="text-xs font-medium">Added to CBExplorer Watchlist</span>
      </div>
      <div
        className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
          checked ? 'bg-emerald-500' : 'bg-slate-700'
        }`}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  );
};
