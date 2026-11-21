import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ModelRecord } from '../../types/models';
import { computeActivitySummary } from '../../utils/activityStats';
import { formatRelativeAge } from '../../utils/review';

interface ActivityHeatmapProps {
  model: ModelRecord;
  compact?: boolean;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AUTO_SYNC_STALE_MS = 6 * 60 * 60 * 1000;

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  model,
  compact = false,
}) => {
  const { syncModelActivity } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentDayIdx = (now.getDay() + 6) % 7; // Mon = 0 .. Sun = 6
  const currentHour = now.getHours(); // 0 .. 23

  useEffect(() => {
    const lastSyncedMs = model.activitySyncedAt
      ? Date.parse(model.activitySyncedAt)
      : 0;
    const isStale =
      !Number.isFinite(lastSyncedMs) ||
      lastSyncedMs <= 0 ||
      Date.now() - lastSyncedMs >= AUTO_SYNC_STALE_MS;

    if (!isStale) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSyncing(true);
      void syncModelActivity(model.id, { silent: true }).finally(() => {
        if (!cancelled) {
          setSyncing(false);
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [model.activitySyncedAt, model.id, syncModelActivity]);

  const handleManualSync = () => {
    if (syncing) return;
    setSyncing(true);
    void syncModelActivity(model.id, { force: true, silent: false }).finally(
      () => {
        setSyncing(false);
      }
    );
  };

  const summary = computeActivitySummary(model);
  const manual = model.manualActivityStats;

  const displayMonthlyHours =
    manual?.monthlyHours !== undefined
      ? `${manual.monthlyHours}h (pinned)`
      : `${summary.tracked30DayHours}h`;

  const displayAvgHours =
    manual?.avgHoursPerDay !== undefined
      ? `${manual.avgHoursPerDay}h/day`
      : `${summary.trackedAvgHoursPerDay}h/day`;

  const displaySchedule = manual?.usualSchedule?.trim() || summary.peakWindowLabel;

  const getCellClasses = (mins: number, isCurrent: boolean) => {
    let bg = 'bg-white/[0.04]';
    let border = 'border-white/[0.04]';

    if (mins > 0 && summary.maxCellMinutes > 0) {
      const ratio = mins / summary.maxCellMinutes;
      if (ratio >= 0.75) {
        bg = 'bg-emerald-400';
        border = 'border-emerald-300/40';
      } else if (ratio >= 0.5) {
        bg = 'bg-emerald-500/75';
        border = 'border-emerald-400/30';
      } else if (ratio >= 0.25) {
        bg = 'bg-emerald-500/45';
        border = 'border-emerald-500/20';
      } else {
        bg = 'bg-emerald-500/20';
        border = 'border-emerald-500/15';
      }
    }

    if (isCurrent) {
      return `${bg} border-sky-300 ring-1 ring-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.85)] z-10 relative scale-110`;
    }

    return `${bg} ${border}`;
  };

  return (
    <div
      className={`${
        compact ? 'p-3' : 'p-3.5'
      } rounded-xl bg-black/30 border border-white/[0.08] space-y-3`}
    >
      {/* Source Status & Manual CBExplorer Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <span className="text-slate-400">
          {syncing
            ? 'Pulling 90d schedule from CBExplorer...'
            : model.activitySyncedAt
              ? `CBExplorer history · Synced ${formatRelativeAge(
                  model.activitySyncedAt
                )}`
              : 'CBExplorer history · Waiting to sync'}
        </span>

        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing}
          title="Pull recent stream sessions directly from CBExplorer (works even when WatchPulse was closed)"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-500/30 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync CBExplorer'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-[#0D1018] border border-white/[0.06]">
          <div className="text-[10px] text-slate-500">30d Active Time</div>
          <div className="text-xs font-semibold text-emerald-300 mt-0.5">
            {displayMonthlyHours}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-[#0D1018] border border-white/[0.06]">
          <div className="text-[10px] text-slate-500">Avg / Day</div>
          <div className="text-xs font-semibold text-slate-100 mt-0.5">
            {displayAvgHours}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-[#0D1018] border border-white/[0.06]">
          <div className="text-[10px] text-slate-500">Usual Window</div>
          <div className="text-xs font-semibold text-indigo-300 mt-0.5 truncate">
            {displaySchedule}
          </div>
        </div>
      </div>

      {/* 7 x 24 Local Activity Heatmap */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">Usually Active Heatmap (Local Time · Last 30d)</span>
            <span
              title="Current local hour cell is highlighted with a cyan border"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-400/30 text-[9px] font-mono shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              {DAY_LABELS[currentDayIdx]} {String(currentHour).padStart(2, '0')}:00
            </span>
          </div>
          <span className="shrink-0">{summary.activeDaysLast30} active days logged</span>
        </div>

        <div className="space-y-1 overflow-x-auto">
          {DAY_LABELS.map((day, dIdx) => {
            const isToday = dIdx === currentDayIdx;
            return (
              <div key={day} className="flex items-center gap-1.5">
                <span
                  title={isToday ? 'Today (Current Day of Week)' : undefined}
                  className={`w-6 text-[9px] font-mono shrink-0 transition-colors ${
                    isToday ? 'text-sky-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {day}
                </span>
                <div
                  className="grid grid-cols-24 gap-0.5 flex-1 min-w-[240px]"
                  style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                >
                  {summary.heatmap[dIdx].map((mins, hIdx) => {
                    const isCurrent = isToday && hIdx === currentHour;
                    return (
                      <div
                        key={hIdx}
                        title={`${day} ${String(hIdx).padStart(2, '0')}:00 — ${Math.round(
                          mins
                        )} min tracked${
                          isCurrent ? ' (Current Time — You Are Here)' : ''
                        }`}
                        className={`h-2.5 rounded-[2px] border transition-all ${getCellClasses(
                          mins,
                          isCurrent
                        )}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pl-7 text-[9px] font-mono text-slate-600">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>
      </div>
    </div>
  );
};
