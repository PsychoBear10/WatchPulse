import { ModelRecord } from '../types/models';

export interface ActivitySummary {
  tracked30DayHours: number;
  trackedAvgHoursPerDay: number;
  activeDaysLast30: number;
  heatmap: number[][]; // [dayOfWeek Mon=0..Sun=6][hour 0..23] in total minutes (last 30d)
  maxCellMinutes: number;
  peakWindowLabel: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function getHourBucketKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}T${pad2(date.getHours())}`;
}

export interface CbexplorerStreamSession {
  streamId?: number;
  startTime?: string;
  endTime?: string;
  avgViewers?: number;
  maxViewers?: number;
}

const RETENTION_DAYS = 90;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

function prunePresenceBuckets(
  existing: Record<string, number> | undefined,
  cutoffMs: number
): Record<string, number> {
  const next: Record<string, number> = {};
  if (!existing) return next;
  for (const [key, mins] of Object.entries(existing)) {
    const datePart = key.slice(0, 10);
    const parsedMs = Date.parse(`${datePart}T00:00:00`);
    if (Number.isFinite(parsedMs) && parsedMs >= cutoffMs && mins > 0) {
      next[key] = Math.min(60, mins);
    }
  }
  return next;
}

export function recordPresenceTick(
  existing: Record<string, number> | undefined,
  minutesToAdd: number,
  now = new Date()
): Record<string, number> {
  const bucket = getHourBucketKey(now);
  const cutoffMs = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const next = prunePresenceBuckets(existing, cutoffMs);

  const prevMins = next[bucket] ?? 0;
  next[bucket] = Math.min(60, Number((prevMins + minutesToAdd).toFixed(2)));
  return next;
}

/**
 * Merges CBExplorer historical broadcast sessions (`[startTime, endTime]` UTC ISO)
 * into local hourly presence buckets (YYYY-MM-DDTHH), taking per-hour max against
 * existing buckets so re-syncing never double-counts.
 */
export function buildPresenceHoursFromCbexplorerStreams(
  streams: CbexplorerStreamSession[],
  existing?: Record<string, number>,
  now = new Date()
): {
  presenceHours: Record<string, number>;
  streamsCount: number;
  latestStreamEndAt?: string;
} {
  const nowMs = now.getTime();
  const cutoffMs = nowMs - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const next = prunePresenceBuckets(existing, cutoffMs);
  const cbexBuckets: Record<string, number> = {};

  let streamsCount = 0;
  let latestEndMs = 0;

  for (const session of streams) {
    if (!session || typeof session.startTime !== 'string' || typeof session.endTime !== 'string') {
      continue;
    }
    const rawStartMs = Date.parse(session.startTime);
    const rawEndMs = Date.parse(session.endTime);
    if (!Number.isFinite(rawStartMs) || !Number.isFinite(rawEndMs) || rawEndMs <= rawStartMs) {
      continue;
    }

    const cappedEndMs = Math.min(rawEndMs, nowMs);
    if (cappedEndMs - rawStartMs > MAX_SESSION_MS) {
      continue;
    }

    streamsCount += 1;
    if (cappedEndMs > latestEndMs) {
      latestEndMs = cappedEndMs;
    }

    const effectiveStartMs = Math.max(rawStartMs, cutoffMs);
    if (cappedEndMs <= effectiveStartMs) {
      continue;
    }

    let cursorMs = effectiveStartMs;
    while (cursorMs < cappedEndMs) {
      const dt = new Date(cursorMs);
      const nextHourMs = new Date(
        dt.getFullYear(),
        dt.getMonth(),
        dt.getDate(),
        dt.getHours() + 1,
        0,
        0,
        0
      ).getTime();
      const segmentEndMs = Math.min(cappedEndMs, nextHourMs);
      const overlapMins = Math.max(0, (segmentEndMs - cursorMs) / 60000);
      if (overlapMins > 0) {
        const key = getHourBucketKey(dt);
        cbexBuckets[key] = Math.min(60, (cbexBuckets[key] ?? 0) + overlapMins);
      }
      cursorMs = nextHourMs;
    }
  }

  for (const [key, mins] of Object.entries(cbexBuckets)) {
    const rounded = Number(Math.min(60, mins).toFixed(2));
    if (rounded > 0) {
      next[key] = Math.max(next[key] ?? 0, rounded);
    }
  }

  return {
    presenceHours: next,
    streamsCount,
    latestStreamEndAt: latestEndMs > 0 ? new Date(latestEndMs).toISOString() : undefined,
  };
}

export interface UsuallyLiveNowMeta {
  isUsuallyLiveNow: boolean;
  confidencePct: number;
  scoreMinutes: number;
  windowMinutesAllDays: number;
  sameWeekdayMinutes: number;
  matchingDaysCount: number;
  recent14dDaysCount: number;
  activeDays30d: number;
  label: string;
}

/**
 * Shifts a local YYYY-MM-DDTHH bucket onto the slot date anchored at `curHour`
 * so overnight windows (e.g. 23:00 -> 00:00 -> 01:00) stay grouped on the same
 * session day and weekday.
 */
function getAlignedSlotDate(
  year: number,
  monthZeroBased: number,
  day: number,
  hour: number,
  curHour: number,
  prevHour: number,
  nextHour: number
): Date {
  const dt = new Date(year, monthZeroBased, day, 12, 0, 0, 0);
  if (hour === nextHour && nextHour < curHour) {
    dt.setDate(dt.getDate() - 1);
  } else if (hour === prevHour && prevHour > curHour) {
    dt.setDate(dt.getDate() + 1);
  }
  return dt;
}

function formatDateKey(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function getUsuallyLiveNowMeta(
  model: ModelRecord,
  now = new Date()
): UsuallyLiveNowMeta {
  const empty: UsuallyLiveNowMeta = {
    isUsuallyLiveNow: false,
    confidencePct: 0,
    scoreMinutes: 0,
    windowMinutesAllDays: 0,
    sameWeekdayMinutes: 0,
    matchingDaysCount: 0,
    recent14dDaysCount: 0,
    activeDays30d: 0,
    label: '',
  };
  if (!model.presenceHours) return empty;

  const curHour = now.getHours();
  const prevHour = (curHour + 23) % 24;
  const nextHour = (curHour + 1) % 24;
  const curWeekday = now.getDay();
  const todayKey = formatDateKey(now);
  const cutoffMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const nowMid = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0
  );

  // Aggregate total historical active days and same-weekday active days across all 24h
  const allDayTotals = new Map<string, { mins: number; weekday: number }>();
  const slotWindowByDate = new Map<
    string,
    {
      prev: number;
      cur: number;
      next: number;
      weekday: number;
      ageDays: number;
    }
  >();

  for (const [key, mins] of Object.entries(model.presenceHours)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
    if (!match || mins <= 0) continue;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const hour = Number.parseInt(match[4], 10);
    const bucketDt = new Date(year, month, day, hour, 0, 0, 0);
    if (bucketDt.getTime() < cutoffMs) continue;

    const rawDateKey = key.slice(0, 10);
    if (rawDateKey !== todayKey) {
      const prevEntry = allDayTotals.get(rawDateKey);
      if (prevEntry) {
        prevEntry.mins += mins;
      } else {
        allDayTotals.set(rawDateKey, {
          mins,
          weekday: bucketDt.getDay(),
        });
      }
    }

    if (hour !== prevHour && hour !== curHour && hour !== nextHour) continue;

    const slotMid = getAlignedSlotDate(
      year,
      month,
      day,
      hour,
      curHour,
      prevHour,
      nextHour
    );
    const slotKey = formatDateKey(slotMid);
    // Do not let today's ongoing live tick self-predict a schedule habit
    if (slotKey === todayKey) continue;

    const ageDays = Math.max(
      1,
      Math.round((nowMid.getTime() - slotMid.getTime()) / (24 * 60 * 60 * 1000))
    );
    if (ageDays > 30) continue;

    const slot = slotWindowByDate.get(slotKey) ?? {
      prev: 0,
      cur: 0,
      next: 0,
      weekday: slotMid.getDay(),
      ageDays,
    };
    if (hour === prevHour) slot.prev += mins;
    else if (hour === curHour) slot.cur += mins;
    else slot.next += mins;
    slotWindowByDate.set(slotKey, slot);
  }

  let activeDays30d = 0;
  let sameWeekdayActiveDays30d = 0;
  for (const dayStat of allDayTotals.values()) {
    if (dayStat.mins >= 15) {
      activeDays30d += 1;
      if (dayStat.weekday === curWeekday) {
        sameWeekdayActiveDays30d += 1;
      }
    }
  }

  if (activeDays30d < 2) {
    return { ...empty, activeDays30d };
  }

  let windowMinutesAllDays = 0;
  let sameWeekdayMinutes = 0;
  let matchingDaysCount = 0;
  let recent14dDaysCount = 0;
  let sameWeekdayMatches = 0;
  let sameWeekdayRecent14d = 0;
  const matchingWeekdays = new Set<number>();
  let weightedCurScore = 0;
  let weightedNextScore = 0;
  let weightedTotalScore = 0;

  for (const slot of slotWindowByDate.values()) {
    // Reject trailing wind-offs that only overlap prevHour without sustained curHour/nextHour activity
    const isRealMatch =
      slot.cur >= 20 ||
      slot.next >= 25 ||
      (slot.cur >= 12 && slot.next >= 15) ||
      (slot.cur >= 15 && slot.prev >= 25);

    if (!isRealMatch) continue;

    const curAndNext = slot.cur + slot.next * 0.85;
    windowMinutesAllDays += slot.cur + slot.next + slot.prev * 0.25;
    matchingDaysCount += 1;
    matchingWeekdays.add(slot.weekday);

    const isRecent14 = slot.ageDays <= 14;
    if (isRecent14) {
      recent14dDaysCount += 1;
    }

    const recencyWeight = slot.ageDays <= 7 ? 1.5 : isRecent14 ? 1.25 : 0.7;
    const isSameWeekday = slot.weekday === curWeekday;
    const weekdayWeight = isSameWeekday ? 1.35 : 1.0;

    weightedCurScore += slot.cur * recencyWeight * weekdayWeight;
    weightedNextScore += slot.next * 0.85 * recencyWeight * weekdayWeight;
    weightedTotalScore +=
      (curAndNext + Math.min(20, slot.prev) * 0.2) *
      recencyWeight *
      weekdayWeight;

    if (isSameWeekday) {
      sameWeekdayMinutes += slot.cur + slot.next;
      sameWeekdayMatches += 1;
      if (isRecent14) {
        sameWeekdayRecent14d += 1;
      }
    }
  }

  const activeDayHitRate = matchingDaysCount / Math.max(1, activeDays30d);
  const sameWeekdayHitRate =
    sameWeekdayMatches / Math.max(1, sameWeekdayActiveDays30d);

  // If this streamer is regularly active on today's weekday at OTHER hours and
  // never around now, or all matches occur on a single different weekday, do not mis-flag today.
  const clashesWithTodayWeekdayHistory =
    sameWeekdayActiveDays30d >= 2 && sameWeekdayMatches === 0;
  const lockedToOtherSingleWeekday =
    matchingWeekdays.size === 1 && !matchingWeekdays.has(curWeekday);

  // Dual high-precision criteria:
  // 1) Consistent general habit around this hour (multi-weekday + recent + meaningful share of active days)
  const fitsGeneralRoutine =
    !clashesWithTodayWeekdayHistory &&
    !lockedToOtherSingleWeekday &&
    matchingDaysCount >= 3 &&
    matchingWeekdays.size >= 2 &&
    (recent14dDaysCount >= 2 || sameWeekdayMatches >= 2) &&
    (activeDayHitRate >= 0.25 ||
      matchingDaysCount >= 6 ||
      recent14dDaysCount >= 4);

  // 2) Specific weekday routine (e.g. regularly live on Wednesdays around this hour)
  const fitsWeekdayRoutine =
    sameWeekdayRecent14d >= 1 &&
    sameWeekdayMinutes >= 60 &&
    (sameWeekdayMatches >= 3 ||
      (sameWeekdayMatches >= 2 && sameWeekdayHitRate >= 0.65));

  const isUsuallyLiveNow = fitsGeneralRoutine || fitsWeekdayRoutine;

  const rawConfidence = Math.round(
    Math.min(
      98,
      Math.max(
        isUsuallyLiveNow ? 38 : 0,
        activeDayHitRate * 48 +
          Math.min(1, recent14dDaysCount / 5) * 30 +
          Math.min(1, sameWeekdayMatches / 3) * 20
      )
    )
  );

  const scoreMinutes = Math.round(
    weightedTotalScore + (isUsuallyLiveNow ? rawConfidence * 1.5 : 0)
  );

  if (!isUsuallyLiveNow) {
    return {
      isUsuallyLiveNow: false,
      confidencePct: 0,
      scoreMinutes,
      windowMinutesAllDays: Math.round(windowMinutesAllDays),
      sameWeekdayMinutes: Math.round(sameWeekdayMinutes),
      matchingDaysCount,
      recent14dDaysCount,
      activeDays30d,
      label: '',
    };
  }

  const prefersNextHour = weightedNextScore > weightedCurScore * 1.35;
  const targetHourStr = pad2(prefersNextHour ? nextHour : curHour);
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const summarySuffix =
    fitsWeekdayRoutine &&
    (sameWeekdayMatches === matchingDaysCount || !fitsGeneralRoutine)
      ? ` (${sameWeekdayMatches}/${Math.max(sameWeekdayActiveDays30d, sameWeekdayMatches)} ${weekdayNames[curWeekday]}s)`
      : ` (${matchingDaysCount}/${activeDays30d} active days)`;

  const label = prefersNextHour
    ? `${rawConfidence}% match · Likely soon ~${targetHourStr}:00${summarySuffix}`
    : `${rawConfidence}% match · Usually live ~${targetHourStr}:00${summarySuffix}`;

  return {
    isUsuallyLiveNow: true,
    confidencePct: rawConfidence,
    scoreMinutes,
    windowMinutesAllDays: Math.round(windowMinutesAllDays),
    sameWeekdayMinutes: Math.round(sameWeekdayMinutes),
    matchingDaysCount,
    recent14dDaysCount,
    activeDays30d,
    label,
  };
}

export function computeActivitySummary(
  model: ModelRecord,
  now = new Date()
): ActivitySummary {
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  const hourTotals = Array.from({ length: 24 }, () => 0);
  const activeDates = new Set<string>();

  const cutoffMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  let totalMinutes = 0;

  if (model.presenceHours) {
    for (const [key, mins] of Object.entries(model.presenceHours)) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
      if (!match || mins <= 0) continue;

      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10) - 1;
      const day = Number.parseInt(match[3], 10);
      const hour = Number.parseInt(match[4], 10);
      if (hour < 0 || hour > 23) continue;

      const dt = new Date(year, month, day, hour, 0, 0, 0);
      if (dt.getTime() < cutoffMs) continue;

      const jsDay = dt.getDay(); // Sun=0..Sat=6
      const monIdx = (jsDay + 6) % 7; // Mon=0..Sun=6

      heatmap[monIdx][hour] += mins;
      hourTotals[hour] += mins;
      totalMinutes += mins;
      activeDates.add(key.slice(0, 10));
    }
  }

  let maxCellMinutes = 0;
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      if (heatmap[d][h] > maxCellMinutes) {
        maxCellMinutes = heatmap[d][h];
      }
    }
  }

  let peakWindowLabel = 'No tracked window yet';
  if (totalMinutes > 0) {
    let bestHour = 0;
    let bestVal = -1;
    for (let h = 0; h < 24; h += 1) {
      const windowSum = hourTotals[h] + hourTotals[(h + 1) % 24];
      if (windowSum > bestVal) {
        bestVal = windowSum;
        bestHour = h;
      }
    }
    const endHour = (bestHour + 2) % 24;
    peakWindowLabel = `${pad2(bestHour)}:00 – ${pad2(endHour)}:00`;
  }

  const tracked30DayHours = Number((totalMinutes / 60).toFixed(1));
  const trackedAvgHoursPerDay = Number((tracked30DayHours / 30).toFixed(2));

  return {
    tracked30DayHours,
    trackedAvgHoursPerDay,
    activeDaysLast30: activeDates.size,
    heatmap,
    maxCellMinutes,
    peakWindowLabel,
  };
}
