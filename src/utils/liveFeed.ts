import { LiveFeedConfig, LiveRoomInfo, ModelRecord } from '../types/models';
import { sanitizeUsername } from './sanitizer';

export interface DetectedLiveCandidate {
  hrefOrSlug: string;
  viewers?: number;
  subject?: string;
  show?: string;
}

export function buildFeedPageUrl(
  config: LiveFeedConfig,
  pageIndex = 0,
  pageSize = 500
): string {
  const offset = pageIndex * pageSize;
  const wmValue = config.affiliateWm.trim();
  let url = config.endpointTemplate.trim();
  url = url.replace(/\{wm\}/g, encodeURIComponent(wmValue));
  url = url.replace(/\{offset\}/g, String(offset));
  url = url.replace(/\{limit\}/g, String(pageSize));
  return url;
}

function asRecord(val: unknown): Record<string, unknown> | null {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : null;
}

function readString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function readNumber(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
      return Number.parseInt(val.trim(), 10);
    }
  }
  return 0;
}

function buildLiveThumbUrl(username: string): string {
  return `https://thumb.live.mmcdn.com/ri/${encodeURIComponent(username)}.jpg`;
}

export function extractCbexplorerListId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'cbexplorer.com' && !host.endsWith('.cbexplorer.com')) {
      return null;
    }
    const segs = parsed.pathname.split('/').filter(Boolean);
    if (segs[0]?.toLowerCase() !== 'lists' || !segs[1]) {
      return null;
    }
    if (segs[1].toLowerCase() === 'import') return null;
    const parts = segs[1].split('-').filter(Boolean);
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : parts[parts.length - 1];
  } catch {
    return null;
  }
}

export function extractRoomsFromPayload(
  payload: unknown,
  checkedAt = new Date().toISOString()
): { rooms: LiveRoomInfo[]; totalReported?: number } {
  const rooms: LiveRoomInfo[] = [];
  let totalReported: number | undefined;

  const obj = asRecord(payload);

  // Format 1: Compact columnar online index (e.g. cbexplorer_users_online_v3.json)
  const dataRec = obj ? asRecord(obj.data) : null;
  if (dataRec && Array.isArray(dataRec.h) && Array.isArray(dataRec.d)) {
    const headers = dataRec.h.map((h) => String(h));
    const tagDict = Array.isArray(dataRec.t) ? dataRec.t : [];
    const uIdx = headers.indexOf('username');
    const sIdx = headers.indexOf('current_show');
    const nIdx = headers.indexOf('num_users');
    const subjIdx = headers.indexOf('room_subject');
    const tagsIdx = headers.indexOf('tags');

    if (uIdx >= 0) {
      for (const row of dataRec.d) {
        if (!Array.isArray(row)) continue;
        const username = sanitizeUsername(String(row[uIdx] ?? ''));
        if (!username) continue;

        const rawShow =
          sIdx >= 0 && typeof row[sIdx] === 'string' ? row[sIdx].trim() : '';
        const currentShow = (rawShow || 'public').toLowerCase();
        const rawUsers = nIdx >= 0 ? row[nIdx] : 0;
        const numUsers =
          typeof rawUsers === 'number' && Number.isFinite(rawUsers)
            ? rawUsers
            : 0;
        const roomSubject =
          subjIdx >= 0 && typeof row[subjIdx] === 'string'
            ? row[subjIdx].trim()
            : '';
        const tags =
          tagsIdx >= 0 && Array.isArray(row[tagsIdx])
            ? row[tagsIdx]
                .map((idx) =>
                  typeof idx === 'number' && typeof tagDict[idx] === 'string'
                    ? tagDict[idx].trim()
                    : typeof idx === 'string'
                      ? idx.trim()
                      : ''
                )
                .filter(Boolean)
            : [];

        rooms.push({
          username,
          currentShow,
          numUsers,
          roomSubject,
          tags,
          isHd: false,
          imageUrl: buildLiveThumbUrl(username),
          iframeEmbed: '',
          lastCheckedAt: checkedAt,
        });
      }
      return { rooms, totalReported: rooms.length };
    }
  }

  // Format 2: Grouped status buckets map (e.g. cb_users_online_v3.json)
  if (
    obj &&
    !Array.isArray(obj.results) &&
    !Array.isArray(obj.rooms) &&
    !Array.isArray(obj.data)
  ) {
    const bucketKeys = ['public', 'private', 'away', 'hidden', 'ticket'];
    const hasBucket = bucketKeys.some((k) => Array.isArray(obj[k]));
    if (hasBucket) {
      for (const bucket of bucketKeys) {
        const list = obj[bucket];
        if (!Array.isArray(list)) continue;
        for (const rawUser of list) {
          if (typeof rawUser !== 'string') continue;
          const username = sanitizeUsername(rawUser);
          if (!username) continue;
          rooms.push({
            username,
            currentShow: bucket,
            numUsers: 0,
            roomSubject: '',
            tags: [],
            isHd: false,
            imageUrl: buildLiveThumbUrl(username),
            iframeEmbed: '',
            lastCheckedAt: checkedAt,
          });
        }
      }
      return { rooms, totalReported: rooms.length };
    }
  }

  // Format 3: Standard arrays or Chaturbate Affiliate / Statbate payloads
  let rawList: unknown[] = [];

  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (obj) {
    if (Array.isArray(obj.results)) {
      rawList = obj.results;
    } else if (Array.isArray(obj.rooms)) {
      rawList = obj.rooms;
    } else if (Array.isArray(obj.data)) {
      rawList = obj.data;
    }
    if (typeof obj.count === 'number' && Number.isFinite(obj.count)) {
      totalReported = obj.count;
    }
  }

  for (const item of rawList) {
    const rec = asRecord(item);
    if (!rec) continue;

    const rawUsername = readString(rec, ['username', 'user', 'slug', 'name']);
    const username = sanitizeUsername(rawUsername);
    if (!username) continue;

    const currentShow =
      readString(rec, ['current_show', 'room_status', 'status']) || 'public';
    const numUsers = readNumber(rec, ['num_users', 'spectators', 'viewers']);
    const roomSubject = readString(rec, ['room_subject', 'subject', 'room_title']);
    const imageUrl =
      readString(rec, [
        'image_url_360x270',
        'image_url',
        'preview_url',
        'thumbnail',
      ]) || buildLiveThumbUrl(username);
    const iframeEmbed = readString(rec, ['iframe_embed', 'embed_room_url']);
    const isHd = Boolean(rec.is_hd ?? rec.hd);
    const tags = Array.isArray(rec.tags)
      ? rec.tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    rooms.push({
      username,
      currentShow: currentShow.toLowerCase(),
      numUsers,
      roomSubject,
      tags,
      isHd,
      imageUrl,
      iframeEmbed,
      lastCheckedAt: checkedAt,
    });
  }

  return { rooms, totalReported };
}

/**
 * Matches scraped/visible page room candidates strictly against the user's saved watchlist models.
 */
export function matchDetectedCandidatesToWatchlist(
  candidates: DetectedLiveCandidate[],
  watchlistModels: ModelRecord[],
  checkedAt = new Date().toISOString()
): LiveRoomInfo[] {
  const known = new Set(watchlistModels.map((m) => m.username.toLowerCase()));
  const matched = new Map<string, LiveRoomInfo>();

  for (const cand of candidates) {
    const slug = sanitizeUsername(cand.hrefOrSlug);
    if (!slug || !known.has(slug)) continue;

    const existing = matched.get(slug);
    const viewers =
      typeof cand.viewers === 'number' && Number.isFinite(cand.viewers)
        ? Math.max(0, cand.viewers)
        : existing?.numUsers ?? 0;

    matched.set(slug, {
      username: slug,
      currentShow: (cand.show || existing?.currentShow || 'public').toLowerCase(),
      numUsers: viewers,
      roomSubject: cand.subject || existing?.roomSubject || '',
      tags: existing?.tags ?? [],
      isHd: existing?.isHd ?? false,
      imageUrl: existing?.imageUrl ?? '',
      iframeEmbed: existing?.iframeEmbed ?? '',
      lastCheckedAt: checkedAt,
    });
  }

  return Array.from(matched.values());
}
