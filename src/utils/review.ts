import { ModelRecord, TierDefinition } from '../types/models';

export const DEFAULT_REVIEW_SPREAD_DAYS = 7;

export interface ReviewStatus {
  daysSinceReview: number;
  cadenceDays: number;
  effectiveCadenceDays: number;
  spreadOffsetDays: number;
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

/**
 * Computes a deterministic pseudo-random day offset (0 to spreadDays - 1)
 * for an isolated model based on its ID and review anchor timestamp.
 * Guarantees zero flickering between renders and reboots.
 */
export function getModelReviewOffsetDays(
  modelId: string,
  anchorIso: string | undefined,
  spreadDays = DEFAULT_REVIEW_SPREAD_DAYS
): number {
  if (spreadDays <= 1) return 0;
  const seed = `${modelId}_${anchorIso || 'epoch'}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h % spreadDays);
}

/**
 * Assigns perfectly balanced stratified daily offsets (0 to spreadDays - 1)
 * across all models in each tier/playlist. For example, 42 models in a playlist
 * over a 7-day spread will result in exactly 6 models becoming due each day
 * once the base cadence arrives, randomly shuffled.
 */
export function computeStratifiedReviewOffsets(
  models: ModelRecord[],
  spreadDays = DEFAULT_REVIEW_SPREAD_DAYS
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (spreadDays <= 1 || models.length === 0) {
    for (const m of models) offsets.set(m.id, 0);
    return offsets;
  }

  const byTier = new Map<string, ModelRecord[]>();
  for (const m of models) {
    if (m.tierId === 'inbox') continue;
    const list = byTier.get(m.tierId) ?? [];
    list.push(m);
    byTier.set(m.tierId, list);
  }

  for (const [, tierModels] of byTier) {
    // Deterministically shuffle using hash of modelId + anchor
    const sorted = [...tierModels].sort((a, b) => {
      const anchorA = a.lastReviewedAt || a.updatedAt || a.createdAt;
      const anchorB = b.lastReviewedAt || b.updatedAt || b.createdAt;
      const hA = getModelReviewOffsetDays(a.id, anchorA, 1000003);
      const hB = getModelReviewOffsetDays(b.id, anchorB, 1000003);
      return hA - hB || a.id.localeCompare(b.id);
    });

    sorted.forEach((model, idx) => {
      offsets.set(model.id, idx % spreadDays);
    });
  }

  return offsets;
}

export function getModelReviewStatus(
  model: ModelRecord,
  tier: TierDefinition | undefined,
  defaultReviewCadenceDays: number,
  staleOfflineDays: number,
  nowMs = Date.now(),
  reviewSpreadDays = DEFAULT_REVIEW_SPREAD_DAYS,
  customOffsetDays?: number
): ReviewStatus {
  // Inbox items don't trigger periodic re-sort warnings (they're already awaiting initial sort)
  const cadenceDays =
    model.tierId === 'inbox'
      ? 0
      : tier?.reviewCadenceDays !== undefined
        ? tier.reviewCadenceDays
        : defaultReviewCadenceDays;

  const spreadDays =
    tier?.reviewSpreadDays !== undefined
      ? tier.reviewSpreadDays
      : reviewSpreadDays;

  const anchor = model.lastReviewedAt || model.updatedAt || model.createdAt;
  const daysSinceReview = getDaysSince(anchor, nowMs) ?? 0;

  const offsetDays =
    cadenceDays > 0 && spreadDays > 1
      ? customOffsetDays !== undefined
        ? customOffsetDays
        : getModelReviewOffsetDays(model.id, anchor, spreadDays)
      : 0;

  const effectiveCadenceDays = cadenceDays > 0 ? cadenceDays + offsetDays : 0;
  const isDueForReview = cadenceDays > 0 && daysSinceReview >= effectiveCadenceDays;

  const daysSinceSeenLive = getDaysSince(model.lastSeenLiveAt, nowMs);
  const isStaleOffline =
    staleOfflineDays > 0 &&
    daysSinceSeenLive !== null &&
    daysSinceSeenLive >= staleOfflineDays;

  return {
    daysSinceReview,
    cadenceDays,
    effectiveCadenceDays,
    spreadOffsetDays: offsetDays,
    isDueForReview,
    daysSinceSeenLive,
    isStaleOffline,
  };
}

export function createModelReviewStatusHelper(
  models: ModelRecord[],
  tiers: TierDefinition[],
  defaultReviewCadenceDays: number,
  staleOfflineDays: number,
  nowMs = Date.now(),
  reviewSpreadDays = DEFAULT_REVIEW_SPREAD_DAYS
) {
  const tierById = new Map<string, TierDefinition>();
  for (const t of tiers) tierById.set(t.id, t);
  const stratifiedOffsets = computeStratifiedReviewOffsets(models, reviewSpreadDays);

  return {
    getStatus: (model: ModelRecord): ReviewStatus => {
      const tier = tierById.get(model.tierId);
      const customOffset = stratifiedOffsets.get(model.id);
      return getModelReviewStatus(
        model,
        tier,
        defaultReviewCadenceDays,
        staleOfflineDays,
        nowMs,
        reviewSpreadDays,
        customOffset
      );
    },
    stratifiedOffsets,
  };
}
