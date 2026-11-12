import { LiveRoomInfo, ModelRecord, TierDefinition } from '../types/models';

export interface MonitorSortableItem {
  model: ModelRecord;
  live?: LiveRoomInfo;
  usuallyNowScore?: number;
}

export interface MonitorSortOptions {
  prioritizeUsuallyNowScore?: boolean;
}

export function isPublicShowStatus(show?: string): boolean {
  const s = (show || '').toLowerCase();
  return (
    s !== 'private' &&
    s !== 'away' &&
    s !== 'hidden' &&
    s !== 'ticket' &&
    s !== 'group'
  );
}

export function buildTierOrderMap(tiers: TierDefinition[]): Map<string, number> {
  return new Map(tiers.map((t) => [t.id, t.order]));
}

/**
 * Shared Watchlist Grid & Watch Wall comparator:
 * 1. Online visibility bucket (Public Live > Non-public Live > Offline)
 * 2. Playlist tier priority ascending (Priority 1 -> Priority 2 -> ... -> Inbox)
 * 3. Optional schedule match score descending (when "Usually Now" filter is active)
 * 4. Viewer count descending within the same tier
 * 5. Saved manual model order ascending
 */
export function compareMonitorTierPriority(
  a: MonitorSortableItem,
  b: MonitorSortableItem,
  tierOrderById: Map<string, number>,
  options: MonitorSortOptions = {}
): number {
  const aPub = a.live ? (isPublicShowStatus(a.live.currentShow) ? 2 : 1) : 0;
  const bPub = b.live ? (isPublicShowStatus(b.live.currentShow) ? 2 : 1) : 0;
  if (bPub !== aPub) return bPub - aPub;

  const ta =
    a.model.tierId !== null ? (tierOrderById.get(a.model.tierId) ?? 999) : 999;
  const tb =
    b.model.tierId !== null ? (tierOrderById.get(b.model.tierId) ?? 999) : 999;
  if (ta !== tb) return ta - tb;

  if (options.prioritizeUsuallyNowScore) {
    const sa = a.usuallyNowScore ?? 0;
    const sb = b.usuallyNowScore ?? 0;
    if (sb !== sa) return sb - sa;
  }

  const va = a.live?.numUsers ?? 0;
  const vb = b.live?.numUsers ?? 0;
  if (vb !== va) return vb - va;

  return a.model.order - b.model.order;
}
