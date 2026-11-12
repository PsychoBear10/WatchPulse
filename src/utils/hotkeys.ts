export const RESERVED_DECK_KEYS = new Set([' ', 'SPACE', 'Z', 'BACKSPACE', 'ESCAPE']);

export function normalizeHotkey(key: string): string {
  const cleaned = key.trim().toUpperCase();
  if (!cleaned) return '';
  if (cleaned === ' ') return '';
  return cleaned.slice(0, 1);
}

export function isReservedDeckKey(hotkey: string): boolean {
  const upper = hotkey.trim().toUpperCase();
  return RESERVED_DECK_KEYS.has(upper);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
}
