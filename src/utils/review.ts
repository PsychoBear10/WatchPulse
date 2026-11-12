import { ModelRecord, TierDefinition } from '../types/models';

export interface ReviewStatus {
  daysSinceReview: number;
  cadenceDays: number;
  isDueForReview: boolean;
  daysSinceSeenLive: number | null;
  isStaleOffline: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getDaysSince(isoTimestamp: string | undefined, nowMs = Date.now()): number | null {
  if (!isoTimestamp) return null;
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / MS_PER_DAY));
}

export function formatRelativeAge(isoTimestamp: string | undefined, nowMs = Date.now()): string {
  if (!isoTimestamp) return 'Never';
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return 'Unknown';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export function getModelReviewStatus(
  model: ModelRecord,
  tier: TierDefinition | undefined,
  defaultReviewCadenceDays: number,
  staleOfflineDays: number,
  nowMs = Date.now()
): ReviewStatus {
  // Inbox items don't trigger periodic re-sort warnings (they're already awaiting initial sort)
  const cadenceDays =
    model.tierId === 'inbox'
      ? 0
      : tier?.reviewCadenceDays !== undefined
        ? tier.reviewCadenceDays
        : defaultReviewCadenceDays;

  const anchor = model.lastReviewedAt || model.updatedAt || model.createdAt;
  const daysSinceReview = getDaysSince(anchor, nowMs) ?? 0;
  const isDueForReview = cadenceDays > 0 && daysSinceReview >= cadenceDays;

  const daysSinceSeenLive = getDaysSince(model.lastSeenLiveAt, nowMs);
  const isStaleOffline =
    staleOfflineDays > 0 &&
    daysSinceSeenLive !== null &&
    daysSinceSeenLive >= staleOfflineDays;

  return {
    daysSinceReview,
    cadenceDays,
    isDueForReview,
    daysSinceSeenLive,
    isStaleOffline,
  };
}
