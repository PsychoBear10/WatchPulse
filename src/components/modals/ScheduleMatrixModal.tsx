import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CalendarClock,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  Moon,
  Radio,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import {
  computeWatchlistScheduleMatrix,
  ScheduleMatrixCell,
} from '../../utils/activityStats';
import { ModelAvatar } from '../common/ModelAvatar';

interface ScheduleMatrixModalProps {
  open: boolean;
  onClose: () => void;
  onSelectModel?: (modelId: string) => void;
}

type MetricMode = 'density' | 'volume';
type TimeFilter = 'all' | 'night' | 'morning' | 'afternoon' | 'prime';

const TIME_FILTER_CONFIGS: Record<
  TimeFilter,
  { label: string; icon: React.ReactNode; range: [number, number]; desc: string }
> = {
  all: {
    label: 'All 24 Hours',
    icon: <Clock className="w-3.5 h-3.5" />,
    range: [0, 23],
    desc: '00:00 – 24:00 (Full 7-Day Week)',
  },
  prime: {
    label: 'Prime Time',
    icon: <Sunset className="w-3.5 h-3.5 text-amber-400" />,
    range: [18, 23],
    desc: '18:00 – 24:00 (6 PM – Midnight)',
  },
  afternoon: {
    label: 'Afternoon',
    icon: <Sun className="w-3.5 h-3.5 text-yellow-400" />,
    range: [12, 17],
    desc: '12:00 – 18:00 (12 PM – 6 PM)',
  },
  morning: {
    label: 'Morning',
    icon: <Sunrise className="w-3.5 h-3.5 text-sky-400" />,
    range: [6, 11],
    desc: '06:00 – 12:00 (6 AM – 12 PM)',
  },
  night: {
    label: 'Late Night',
    icon: <Moon className="w-3.5 h-3.5 text-indigo-400" />,
    range: [0, 5],
    desc: '00:00 – 06:00 (Midnight – 6 AM)',
  },
};

function formatHour12(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export const ScheduleMatrixModal: React.FC<ScheduleMatrixModalProps> = ({
  open,
  onClose,
  onSelectModel,
}) => {
  const { data, liveRoomsByUsername } = useAppStore();
  const [selectedTierId, setSelectedTierId] = useState<string>('all');
  const [metricMode, setMetricMode] = useState<MetricMode>('density');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [inspectorSearch, setInspectorSearch] = useState<string>('');
  const [selectedCellCoord, setSelectedCellCoord] = useState<{
    dayIndex: number;
    hour: number;
  } | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep current clock ticking every 30s
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  // Compute schedule matrix
  const matrixResult = useMemo(() => {
    return computeWatchlistScheduleMatrix(data.models, {
      tierId: selectedTierId,
      now,
    });
  }, [data.models, selectedTierId, now]);

  // Default selected cell to peak hour on initial open
  useEffect(() => {
    if (!open) return;
    if (matrixResult.peakWindow && matrixResult.peakWindow.modelCount > 0) {
      setSelectedCellCoord({
        dayIndex: matrixResult.peakWindow.dayIndex,
        hour: matrixResult.peakWindow.startHour,
      });
    } else {
      const curDay = (now.getDay() + 6) % 7;
      setSelectedCellCoord({
        dayIndex: curDay,
        hour: now.getHours(),
      });
    }
  }, [open, selectedTierId]);

  // Keyboard navigation: Escape to close, Arrows to navigate cells, P for peak, T for today/now
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (matrixResult.peakWindow) {
          setSelectedCellCoord({
            dayIndex: matrixResult.peakWindow.dayIndex,
            hour: matrixResult.peakWindow.startHour,
          });
        }
      } else if (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const curDay = (now.getDay() + 6) % 7;
        setSelectedCellCoord({
          dayIndex: curDay,
          hour: now.getHours(),
        });
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        setSelectedCellCoord((prev) => {
          const curDay = prev ? prev.dayIndex : 0;
          const curH = prev ? prev.hour : 12;
          let nextDay = curDay;
          let nextH = curH;

          if (e.key === 'ArrowUp') {
            nextDay = (curDay + 6) % 7;
          } else if (e.key === 'ArrowDown') {
            nextDay = (curDay + 1) % 7;
          } else if (e.key === 'ArrowLeft') {
            nextH = (curH + 23) % 24;
          } else if (e.key === 'ArrowRight') {
            nextH = (curH + 1) % 24;
          }
          return { dayIndex: nextDay, hour: nextH };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, matrixResult.peakWindow, now]);

  if (!open) return null;

  const curDayIndex = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  const curHour = now.getHours();

  // Find currently selected cell
  const selectedCell: ScheduleMatrixCell | null = selectedCellCoord
    ? matrixResult.matrix[selectedCellCoord.dayIndex]?.[selectedCellCoord.hour] || null
    : null;

  const tierMap = new Map(data.tiers.map((t) => [t.id, t]));

  // Local time formatted string
  const localTimeFormatted = now.toLocaleTimeString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Filter visible hours based on timeFilter
  const [filterStartHour, filterEndHour] = TIME_FILTER_CONFIGS[timeFilter].range;
  const visibleHours = Array.from(
    { length: filterEndHour - filterStartHour + 1 },
    (_, i) => filterStartHour + i
  );

  // Jump helpers
  const handleJumpToPeak = () => {
    if (matrixResult.peakWindow) {
      setSelectedCellCoord({
        dayIndex: matrixResult.peakWindow.dayIndex,
        hour: matrixResult.peakWindow.startHour,
      });
      if (
        matrixResult.peakWindow.startHour < filterStartHour ||
        matrixResult.peakWindow.startHour > filterEndHour
      ) {
        setTimeFilter('all');
      }
    }
  };

  const handleJumpToNow = () => {
    setSelectedCellCoord({
      dayIndex: curDayIndex,
      hour: curHour,
    });
    if (curHour < filterStartHour || curHour > filterEndHour) {
      setTimeFilter('all');
    }
  };

  // Filtered inspector models
  const inspectorModels = (selectedCell?.models || []).filter((item) => {
    if (!inspectorSearch.trim()) return true;
    const q = inspectorSearch.toLowerCase();
    return (
      item.username.toLowerCase().includes(q) ||
      item.displayName.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1400px] h-[92vh] max-h-[920px] flex flex-col rounded-3xl liquid-glass border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Specular Ambient Header Glow (Luminous Cyan & Royal Azure Aura) */}
        <div className="absolute top-0 inset-x-[16.666%] h-36 bg-gradient-to-b from-cyan-400/30 via-sky-500/18 to-transparent blur-2xl pointer-events-none rounded-t-3xl z-0" />
        <div className="absolute top-0 left-1/3 right-1/3 h-24 bg-gradient-to-b from-blue-500/25 via-indigo-600/15 to-transparent blur-xl pointer-events-none rounded-t-3xl z-0" />

        {/* Modal Top Header */}
        <header className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-600/40 border border-indigo-400/50 flex items-center justify-center text-indigo-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] shrink-0">
              <CalendarClock className="w-5 h-5 text-indigo-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Watchlist Peak Hours Schedule Matrix
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/35">
                  30-Day Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Historical broadcast presence, concurrent model density &amp; optimal viewing windows
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Navigation Jump Chips */}
            <button
              type="button"
              onClick={handleJumpToPeak}
              title="Jump to Peak Streaming Window (Shortcut: P)"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-pill text-xs font-semibold text-amber-300 hover:text-white border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20 transition-all active:scale-95"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Peak Window</span>
            </button>

            <button
              type="button"
              onClick={handleJumpToNow}
              title="Jump to Current Hour / Today (Shortcut: T)"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-pill text-xs font-semibold text-emerald-300 hover:text-white border-emerald-500/30 hover:border-emerald-400/60 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all active:scale-95"
            >
              <Radio className="w-3 h-3 text-emerald-400" />
              <span>Jump to Now</span>
            </button>

            {/* Local Clock */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-pill text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono font-medium">{localTimeFormatted}</span>
              <span className="text-slate-500 text-[10px]">(Local)</span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="w-8 h-8 rounded-full liquid-pill flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Compact Glass KPI Strip (Space-Saving 4-in-1 ribbon) */}
        <div className="px-5 py-2.5 bg-black/35 border-b border-white/[0.08] grid grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0 text-xs">
          {/* KPI 1: Peak Window */}
          <div
            onClick={handleJumpToPeak}
            className="p-2.5 rounded-xl liquid-glass border border-white/[0.08] hover:border-amber-500/40 cursor-pointer transition-all group flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Peak Window</span>
              </div>
              <div className="text-sm font-bold text-white font-mono mt-0.5 truncate group-hover:text-amber-200 transition-colors">
                {matrixResult.peakWindow.modelCount > 0
                  ? matrixResult.peakWindow.label
                  : 'Accumulating'}
              </div>
              <div className="text-[10px] text-amber-400 font-medium">
                {matrixResult.peakWindow.modelCount} concurrent models ({matrixResult.peakWindow.totalHours}h)
              </div>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors font-mono hidden sm:inline">
              [P]
            </span>
          </div>

          {/* KPI 2: Live Right Now */}
          <div
            onClick={handleJumpToNow}
            className="p-2.5 rounded-xl liquid-glass border border-white/[0.08] hover:border-emerald-500/40 cursor-pointer transition-all group flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Expected Right Now</span>
              </div>
              <div className="text-sm font-bold text-white font-mono mt-0.5 group-hover:text-emerald-200 transition-colors">
                {matrixResult.currentSlot.activeModelCount} models
              </div>
              <div className="text-[10px] text-emerald-400 font-medium truncate">
                {curHour}:00 slot • {matrixResult.upcoming2Hours.expectedModelCount} more in next 2h
              </div>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors font-mono hidden sm:inline">
              [T]
            </span>
          </div>

          {/* KPI 3: Most Active Day */}
          <div className="p-2.5 rounded-xl liquid-glass border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-400" />
                <span>Busiest Day</span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5 truncate">
                {matrixResult.mostActiveDay.dayName}
              </div>
              <div className="text-[10px] text-sky-400 font-medium">
                {matrixResult.mostActiveDay.totalHours}h combined • {matrixResult.mostActiveDay.activeModelCount} models
              </div>
            </div>
          </div>

          {/* KPI 4: Watchlist Coverage */}
          <div className="p-2.5 rounded-xl liquid-glass border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1">
                <Users className="w-3 h-3 text-indigo-400" />
                <span>Watchlist Coverage</span>
              </div>
              <div className="text-sm font-bold text-white font-mono mt-0.5">
                {matrixResult.modelsWithScheduleData} / {matrixResult.totalModelsConsidered}{' '}
                <span className="text-xs text-indigo-300 font-normal">
                  (
                  {matrixResult.totalModelsConsidered > 0
                    ? Math.round(
                        (matrixResult.modelsWithScheduleData /
                          matrixResult.totalModelsConsidered) *
                          100
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {matrixResult.totalBroadcastHours30d}h logged over 30 days
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Metric Control Bar */}
        <div className="px-5 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-white/[0.01] shrink-0 text-xs">
          {/* Left: Playlist / Tier Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400 mr-1 flex items-center gap-1 font-medium text-[11px]">
              <Layers className="w-3 h-3 text-indigo-400" />
              Playlist:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTierId('all')}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                selectedTierId === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400/50'
                  : 'liquid-pill text-slate-400 hover:text-white'
              }`}
            >
              All Playlists ({data.models.filter((m) => !m.deletedAt).length})
            </button>
            {data.tiers.map((tier) => {
              const count = data.models.filter(
                (m) => m.tierId === tier.id && !m.deletedAt
              ).length;
              const isSelected = selectedTierId === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-white/20 text-white border border-white/30 shadow-sm'
                      : 'liquid-pill text-slate-400 hover:text-white'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: tier.color }}
                  />
                  <span>{tier.name}</span>
                  <span className="text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Right: Time Filter Segment & Metric Mode Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Time Period Filter */}
            <div className="flex items-center p-0.5 rounded-xl liquid-segmented text-xs">
              {(Object.keys(TIME_FILTER_CONFIGS) as TimeFilter[]).map((tfKey) => {
                const conf = TIME_FILTER_CONFIGS[tfKey];
                const active = timeFilter === tfKey;
                return (
                  <button
                    key={tfKey}
                    type="button"
                    onClick={() => setTimeFilter(tfKey)}
                    title={conf.desc}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? 'bg-indigo-500/30 text-indigo-200 font-semibold shadow-sm border border-indigo-400/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {conf.icon}
                    <span>{conf.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Metric Mode (Density vs Volume) */}
            <div className="flex items-center p-0.5 rounded-xl liquid-segmented text-xs">
              <button
                type="button"
                onClick={() => setMetricMode('density')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  metricMode === 'density'
                    ? 'bg-emerald-500/30 text-emerald-200 font-semibold shadow-sm border border-emerald-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3 h-3 text-emerald-400" />
                <span>Density</span>
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('volume')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  metricMode === 'volume'
                    ? 'bg-purple-500/30 text-purple-200 font-semibold shadow-sm border border-purple-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3 h-3 text-purple-400" />
                <span>Volume</span>
              </button>
            </div>
          </div>
        </div>

        {/* Master-Detail Split Body (Grid on Left, Inspector on Right) */}
        <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">
          {/* Main Area: Heatmap Grid & Legend */}
          <div className="flex-1 flex flex-col overflow-y-auto p-4 custom-scrollbar space-y-3">
            <div className="p-4 rounded-2xl liquid-glass border border-white/10 overflow-x-auto custom-scrollbar flex-1 flex flex-col justify-between">
              <div className="min-w-[720px] select-none space-y-1.5">
                {/* Hour Column Headers */}
                <div
                  className="grid gap-1 items-center pb-2 border-b border-white/10 text-[11px] font-mono text-slate-400"
                  style={{
                    gridTemplateColumns: `56px repeat(${visibleHours.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="text-left font-bold text-slate-500 uppercase tracking-wider pl-1 text-[10px]">
                    Day
                  </div>
                  {visibleHours.map((h) => {
                    const isCurrentHour = h === curHour;
                    return (
                      <div
                        key={h}
                        className={`text-center py-1 rounded-md transition-colors flex flex-col items-center leading-none ${
                          isCurrentHour
                            ? 'bg-indigo-500/25 text-indigo-200 font-bold border-b-2 border-indigo-400 ring-1 ring-indigo-400/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title={`${h < 10 ? `0${h}` : h}:00 (${formatHour12(h)})`}
                      >
                        <span className="text-[11px] font-bold">{h}</span>
                        <span className="text-[9px] text-slate-500 font-normal mt-0.5">
                          {h === 0 || h === 12 ? (h === 0 ? '12a' : '12p') : h < 12 ? `${h}a` : `${h - 12}p`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 7 Days Matrix Rows */}
                {matrixResult.matrix.map((row, d) => {
                  const isToday = d === curDayIndex;
                  return (
                    <div
                      key={d}
                      className={`grid gap-1 items-center py-1 rounded-xl transition-colors ${
                        isToday ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20' : 'hover:bg-white/[0.02]'
                      }`}
                      style={{
                        gridTemplateColumns: `56px repeat(${visibleHours.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {/* Day Label */}
                      <div className="flex items-center gap-1.5 pl-1.5">
                        <span
                          className={`text-xs font-bold tracking-tight ${
                            isToday ? 'text-indigo-300 font-black' : 'text-slate-300'
                          }`}
                        >
                          {row[0]?.dayShort}
                        </span>
                        {isToday && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                            title="Today"
                          />
                        )}
                      </div>

                      {/* Hour Cells */}
                      {visibleHours.map((h) => {
                        const cell = row[h];
                        const isSelected =
                          selectedCellCoord?.dayIndex === cell.dayIndex &&
                          selectedCellCoord?.hour === cell.hour;
                        const isNowSlot =
                          cell.dayIndex === curDayIndex && cell.hour === curHour;
                        const isPeakSlot =
                          matrixResult.peakWindow &&
                          cell.dayIndex === matrixResult.peakWindow.dayIndex &&
                          (cell.hour === matrixResult.peakWindow.startHour ||
                            cell.hour === matrixResult.peakWindow.endHour);

                        // Dynamic shading based on metric mode
                        let bgStyle = 'bg-white/[0.02] border-white/[0.04] text-slate-600';
                        let displayVal = '';

                        if (metricMode === 'density') {
                          const count = cell.activeModelCount;
                          if (count > 0) {
                            displayVal = String(count);
                            const ratio =
                              matrixResult.maxModelCount > 0
                                ? count / matrixResult.maxModelCount
                                : 0;
                            if (ratio >= 0.8) {
                              bgStyle =
                                'bg-gradient-to-br from-emerald-400 to-teal-400 border-white/60 text-slate-950 font-black shadow-[0_0_12px_rgba(52,211,153,0.45)]';
                            } else if (ratio >= 0.5) {
                              bgStyle =
                                'bg-teal-500/50 border-teal-300/60 text-teal-100 font-bold';
                            } else if (ratio >= 0.25) {
                              bgStyle =
                                'bg-indigo-600/40 border-indigo-400/40 text-indigo-100 font-semibold';
                            } else {
                              bgStyle =
                                'bg-indigo-950/60 border-indigo-500/25 text-indigo-100 font-medium';
                            }
                          }
                        } else {
                          const mins = cell.totalMinutes;
                          if (mins > 0) {
                            // In full 24-hour view, cell width is narrow (~28px).
                            // Showing decimal strings like "70.8h" causes severe text bleed/overlapping.
                            // Display clean rounded whole hours (e.g. "71", "35", "9") matching density mode width,
                            // while displaying the full "70.8h" in zoomed-in time segment views.
                            if (visibleHours.length > 12) {
                              displayVal =
                                cell.totalHours >= 1
                                  ? String(Math.round(cell.totalHours))
                                  : '<1';
                            } else {
                              displayVal =
                                cell.totalHours >= 1
                                  ? `${cell.totalHours}h`
                                  : `${mins}m`;
                            }
                            const ratio =
                              matrixResult.maxMinutes > 0
                                ? mins / matrixResult.maxMinutes
                                : 0;
                            if (ratio >= 0.8) {
                              bgStyle =
                                'bg-gradient-to-br from-purple-400 to-fuchsia-400 border-white/60 text-slate-950 font-black shadow-[0_0_12px_rgba(192,132,252,0.45)]';
                            } else if (ratio >= 0.5) {
                              bgStyle =
                                'bg-fuchsia-500/50 border-fuchsia-300/60 text-fuchsia-100 font-bold';
                            } else if (ratio >= 0.25) {
                              bgStyle =
                                'bg-purple-600/40 border-purple-400/40 text-purple-200 font-semibold';
                            } else {
                              bgStyle =
                                'bg-purple-950/60 border-purple-500/25 text-purple-300 font-medium';
                            }
                          }
                        }

                        return (
                          <button
                            key={cell.hour}
                            type="button"
                            onClick={() =>
                              setSelectedCellCoord({
                                dayIndex: cell.dayIndex,
                                hour: cell.hour,
                              })
                            }
                            title={`${cell.dayName} ${cell.timeWindowLabel} (${formatHour12(
                              cell.hour
                            )}): ${cell.activeModelCount} models, ${cell.totalHours}h volume`}
                            className={`h-9 sm:h-10 rounded-lg border flex items-center justify-center font-mono text-[11px] overflow-hidden min-w-0 transition-all relative group cursor-pointer ${bgStyle} ${
                              isSelected
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B0D14] scale-105 z-20 shadow-xl'
                                : 'hover:scale-105 hover:z-10'
                            }`}
                          >
                            <span className="select-none truncate px-0.5 leading-none max-w-full text-center">
                              {displayVal}
                            </span>

                            {/* Active Now Radar Beacon */}
                            {isNowSlot && (
                              <span
                                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0B0D14] animate-pulse"
                                title="Active Current Time Slot"
                              />
                            )}

                            {/* Peak Slot Flame Indicator */}
                            {isPeakSlot && !isNowSlot && (
                              <span
                                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white"
                                title="Peak Schedule Slot"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Heatmap Legend & Keyboard Helper */}
              <div className="pt-3 mt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Heatmap Intensity:</span>
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <span className="text-slate-500">Less</span>
                    <span className="w-4 h-4 rounded bg-white/[0.03] border border-white/10" />
                    <span
                      className={`w-4 h-4 rounded ${
                        metricMode === 'density' ? 'bg-indigo-950/70 border border-indigo-500/30' : 'bg-purple-950/70 border border-purple-500/30'
                      }`}
                    />
                    <span
                      className={`w-4 h-4 rounded ${
                        metricMode === 'density' ? 'bg-indigo-600/40 border border-indigo-400/40' : 'bg-purple-600/40 border border-purple-400/40'
                      }`}
                    />
                    <span
                      className={`w-4 h-4 rounded ${
                        metricMode === 'density' ? 'bg-teal-500/50 border border-teal-400/50' : 'bg-fuchsia-500/50 border border-fuchsia-400/50'
                      }`}
                    />
                    <span
                      className={`w-4 h-4 rounded ${
                        metricMode === 'density' ? 'bg-emerald-400' : 'bg-purple-400'
                      }`}
                    />
                    <span className="text-slate-300 font-semibold">Peak</span>
                  </div>
                  {metricMode === 'volume' && (
                    <span className="text-[10px] text-slate-500 hidden md:inline ml-1">
                      (Whole hours shown in 24h view; select slot for decimals)
                    </span>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
                  <span>
                    Use <span className="kbd-cap">↑</span> <span className="kbd-cap">↓</span> <span className="kbd-cap">←</span> <span className="kbd-cap">→</span> arrows to navigate cells
                  </span>
                  <span>•</span>
                  <span><span className="kbd-cap">P</span> Peak</span>
                  <span><span className="kbd-cap">T</span> Now</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Area: Dedicated Live Slot Inspector Drawer */}
          <aside className="w-full xl:w-[380px] border-t xl:border-t-0 xl:border-l border-white/10 bg-black/40 flex flex-col shrink-0 overflow-hidden">
            {selectedCell ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Inspector Header */}
                <div className="p-4 border-b border-white/10 space-y-2 shrink-0 bg-white/[0.01]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 font-bold text-xs flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{selectedCell.dayName}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-xl bg-white/[0.06] text-white font-mono font-semibold text-xs border border-white/10">
                        {selectedCell.timeWindowLabel}
                      </span>
                    </div>

                    {selectedCell.dayIndex === curDayIndex &&
                      selectedCell.hour === curHour && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                          <Radio className="w-3 h-3" />
                          ACTIVE NOW
                        </span>
                      )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-bold text-white">
                        {selectedCell.activeModelCount} active model(s)
                      </span>
                    </div>
                    <div className="font-mono text-emerald-400 font-medium">
                      {selectedCell.totalHours}h cumulative broadcast
                    </div>
                  </div>

                  {/* Inspector Search inside this Slot */}
                  {selectedCell.models.length > 4 && (
                    <div className="relative pt-1">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3.5 pointer-events-none" />
                      <input
                        type="text"
                        value={inspectorSearch}
                        onChange={(e) => setInspectorSearch(e.target.value)}
                        placeholder="Search models in this slot..."
                        className="studio-input text-xs pl-8 py-1.5 rounded-xl bg-black/40"
                      />
                    </div>
                  )}
                </div>

                {/* Inspector Model Cards List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar max-h-[40vh] sm:max-h-[48vh] xl:max-h-none">
                  {inspectorModels.length > 0 ? (
                    inspectorModels.map((item) => {
                      const isLive = Boolean(
                        liveRoomsByUsername[item.username.toLowerCase()]
                      );
                      const tier = tierMap.get(item.tierId);
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-2xl liquid-glass border border-white/10 flex items-center justify-between gap-3 hover:border-white/25 hover:bg-white/[0.04] transition-all group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ModelAvatar
                              username={item.username}
                              displayName={item.displayName}
                              thumbnail={item.thumbnail}
                              accentColor={tier?.color}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                  {item.displayName}
                                </span>
                                {isLive ? (
                                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[9px] font-black flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    LIVE
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    @{item.username}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                {tier && (
                                  <span
                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: `${tier.color}25`,
                                      color: tier.color,
                                    }}
                                  >
                                    {tier.name}
                                  </span>
                                )}
                                <span className="text-slate-400">•</span>
                                <span className="font-mono text-[10px] text-emerald-400 font-medium">
                                  {item.hours}h ({item.minutes}m)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Profile external link */}
                            <button
                              type="button"
                              onClick={() => {
                                void desktopBridge.openExternal(
                                  `https://chaturbate.com/${encodeURIComponent(item.username)}`
                                );
                              }}
                              title="Open Profile in Browser"
                              className="p-1.5 rounded-xl liquid-pill text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>

                            {/* Watch Live in Stage mode */}
                            {onSelectModel && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectModel(item.id);
                                  onClose();
                                }}
                                title="Open in Live Stage Mode"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-95 group-hover:bg-indigo-600"
                              >
                                <Tv className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Watch</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 px-4 text-center text-slate-500 space-y-2">
                      <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                      <div className="text-xs text-slate-400 font-medium">
                        No broadcast sessions recorded
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-[220px] mx-auto">
                        No models from your selected playlist broadcast on{' '}
                        <span className="text-slate-300 font-medium">
                          {selectedCell.dayName}
                        </span>{' '}
                        between{' '}
                        <span className="text-slate-300 font-mono">
                          {selectedCell.timeWindowLabel}
                        </span>
                        .
                      </p>
                      <button
                        type="button"
                        onClick={handleJumpToPeak}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all mt-2"
                      >
                        <Flame className="w-3 h-3 text-amber-400" />
                        <span>Jump to Peak Window</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                <CalendarClock className="w-10 h-10 text-slate-600" />
                <div className="text-xs font-semibold text-slate-400">
                  Select a slot to view models
                </div>
                <p className="text-[11px] text-slate-500 max-w-[220px]">
                  Click any cell in the 7×24 schedule matrix to inspect broadcast activity.
                </p>
              </div>
            )}
          </aside>
        </div>

        {/* Modal Footer */}
        <footer className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 bg-white/[0.01] shrink-0">
          <div className="flex items-center gap-2 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Calculated dynamically from 30 days of historical presence and session data.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
