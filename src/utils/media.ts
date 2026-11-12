export function resolveMediaSrc(thumbnail: string): string {
  const trimmed = thumbnail.trim();
  if (!trimmed) return '';

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\//i.test(trimmed) ||
    /^local-media:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  if (/^file:\/\//i.test(trimmed)) {
    const withoutScheme = trimmed.replace(/^file:\/\//i, '');
    const decoded = decodeURIComponent(withoutScheme);
    const filePath = /^\/[a-zA-Z]:[\\/]/.test(decoded)
      ? decoded.slice(1)
      : decoded;
    return `local-media://local?path=${encodeURIComponent(filePath)}`;
  }

  // Local Windows or POSIX path (e.g. C:\Users\...\pic.jpg or /home/...)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')) {
    return `local-media://local?path=${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

export function getInitials(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9_ ]/g, ' ').trim();
  if (!cleaned) return 'MS';
  const parts = cleaned.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-indigo-500/35 via-violet-500/20 to-slate-900',
  'from-rose-500/35 via-pink-500/20 to-slate-900',
  'from-emerald-500/35 via-teal-500/20 to-slate-900',
  'from-amber-500/35 via-orange-500/20 to-slate-900',
  'from-sky-500/35 via-cyan-500/20 to-slate-900',
  'from-fuchsia-500/35 via-purple-500/20 to-slate-900',
];

export function getAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
