import { ModelUrls, UrlTemplates } from '../types/models';

const FALLBACK_TEMPLATES: UrlTemplates = {
  cbhours: 'https://www.cbhours.com/user/{username}.html',
  cbexplorer: 'https://cbexplorer.com/{username}',
  archivebate: 'https://archivebate.com/profile/{username}',
  livePreview:
    'https://chaturbate.com/embed/{username}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black',
};

const ROUTE_PREFIX_SEGMENTS = new Set([
  'user',
  'users',
  'profile',
  'profiles',
  'model',
  'models',
  'u',
  'p',
  'b',
  'room',
  'rooms',
  'cam',
  'cams',
  'broadcaster',
  'broadcasters',
  'performer',
  'performers',
  'embed',
  'fullvideo',
  'lists',
  'in',
]);

const DOMAIN_LIKE_REGEX =
  /^(?:(?:https?:\/\/|\/\/)(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#:]|$)|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/)/i;

export function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return DOMAIN_LIKE_REGEX.test(trimmed);
}

export function normalizeExternalUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (DOMAIN_LIKE_REGEX.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/**
 * Extracts and normalizes a clean model username from URLs, platform paths, @handles, or raw strings.
 */
export function sanitizeUsername(rawInput: string): string {
  let value = rawInput.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!value) return '';

  // Remove leading @ handle prefix if present
  value = value.replace(/^@+/, '').trim();

  // If it looks like a URL or domain/path, extract the username segment from URL path.
  // Require an explicit protocol (https?:// or //) or forward slash (/) to treat input as a domain URL.
  const hasExplicitProtocolOrSlash =
    /^https?:\/\//i.test(value) || /^\/\//.test(value) || value.includes('/');

  if (isLikelyUrl(value) && hasExplicitProtocolOrSlash) {
    const normalizedUrl = normalizeExternalUrl(value);
    try {
      const parsed = new URL(normalizedUrl);
      const queryRoom =
        parsed.searchParams.get('room') ||
        parsed.searchParams.get('b') ||
        parsed.searchParams.get('u') ||
        parsed.searchParams.get('user') ||
        parsed.searchParams.get('model');
      const segments = parsed.pathname
        .split('/')
        .map((seg) => decodeURIComponent(seg).trim())
        .filter(Boolean);

      if (
        segments.length === 1 &&
        ROUTE_PREFIX_SEGMENTS.has(segments[0].toLowerCase())
      ) {
        value = queryRoom ? queryRoom.trim() : '';
      } else if (segments.length > 0) {
        let index = 0;
        while (
          index < segments.length &&
          ROUTE_PREFIX_SEGMENTS.has(segments[index].toLowerCase())
        ) {
          index += 1;
        }
        value =
          index < segments.length
            ? segments[index]
            : queryRoom
              ? queryRoom.trim()
              : '';
      } else {
        value = queryRoom ? queryRoom.trim() : '';
      }
    } catch {
      // Fallback regex extraction if URL constructor rejects malformed strings
      value = value
        .replace(/^(?:https?:\/\/|\/\/)?[^/]+/i, '')
        .replace(/[?#].*$/, '');
    }
  } else if (value.includes('/')) {
    // Handle relative path fragments like "/user/seduza_hyun/" or "profile/seduza_hyun"
    const segments = value
      .replace(/[?#].*$/, '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    let index = 0;
    while (
      index < segments.length - 1 &&
      ROUTE_PREFIX_SEGMENTS.has(segments[index].toLowerCase())
    ) {
      index += 1;
    }
    value = segments[index] ?? '';
  }

  // Strip query strings, hash fragments, trailing extensions (.html, .htm, .php), and stray slashes
  value = value
    .replace(/[?#].*$/, '')
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/^[@/\\]+|[/\\]+$/g, '')
    .trim();

  // Replace internal whitespace with underscores and keep valid slug characters.
  // Preserve leading/trailing underscores and hyphens (e.g. "_bamby_baby_").
  value = value
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();

  return value;
}

function isValidHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function applyUsernameTemplate(template: string, encodedUsername: string): string {
  if (template.includes('{username}')) {
    return template.replace(/\{username\}/g, encodedUsername);
  }
  return `${template.replace(/\/+$/, '')}/${encodedUsername}`;
}

/**
 * Dynamically builds enriched tracker, watchlist, and archive URLs for a model username.
 */
export function buildModelUrls(
  username: string,
  templates?: Partial<UrlTemplates>
): ModelUrls {
  const clean = sanitizeUsername(username) || username.trim().toLowerCase();
  const encoded = encodeURIComponent(clean);

  const resolveSafe = (candidate: string | undefined, fallback: string) => {
    const raw = applyUsernameTemplate(candidate?.trim() || fallback, encoded);
    return isValidHttpUrl(raw) ? raw : applyUsernameTemplate(fallback, encoded);
  };

  return {
    cbhours: resolveSafe(templates?.cbhours, FALLBACK_TEMPLATES.cbhours),
    cbexplorer: resolveSafe(templates?.cbexplorer, FALLBACK_TEMPLATES.cbexplorer),
    archivebate: resolveSafe(templates?.archivebate, FALLBACK_TEMPLATES.archivebate),
  };
}

export function buildLivePreviewUrl(
  username: string,
  template?: string,
  videoOnly = true,
  muted = true
): string {
  const clean = sanitizeUsername(username) || username.trim().toLowerCase();
  const encoded = encodeURIComponent(clean);
  const candidate = applyUsernameTemplate(
    template?.trim() || FALLBACK_TEMPLATES.livePreview,
    encoded
  );
  const resolved = isValidHttpUrl(candidate)
    ? candidate
    : applyUsernameTemplate(FALLBACK_TEMPLATES.livePreview, encoded);

  try {
    const parsed = new URL(resolved);
    const host = parsed.hostname.toLowerCase();
    const isChaturbateEmbed =
      (host === 'chaturbate.com' || host.endsWith('.chaturbate.com')) &&
      parsed.pathname.toLowerCase().startsWith('/embed/');
    if (isChaturbateEmbed) {
      if (videoOnly) {
        parsed.searchParams.set('embed_video_only', '1');
        parsed.searchParams.set('hide_logo', '1');
      } else {
        parsed.searchParams.delete('embed_video_only');
      }
      if (muted) {
        parsed.searchParams.set('disable_sound', '1');
      } else {
        parsed.searchParams.delete('disable_sound');
      }
      return parsed.toString();
    }
  } catch {
    // keep raw URL when non-standard template is provided
  }

  return resolved;
}
