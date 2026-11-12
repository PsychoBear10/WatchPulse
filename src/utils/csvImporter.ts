import Papa from 'papaparse';
import { ImportCandidate, ModelRecord } from '../types/models';
import { isLikelyUrl, normalizeExternalUrl, sanitizeUsername } from './sanitizer';

export interface ImportParseResult {
  candidates: ImportCandidate[];
  warnings: string[];
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NAME_HEADERS = new Set([
  'modelname',
  'model',
  'username',
  'user',
  'handle',
  'name',
  'performer',
  'account',
]);

const LINK_HEADERS = new Set([
  'originallink',
  'originalurl',
  'link',
  'url',
  'profilelink',
  'profileurl',
  'source',
  'sourcelink',
]);

const TIER_HEADERS = new Set(['tier', 'tiername', 'priority', 'category', 'level']);
const NOTES_HEADERS = new Set(['notes', 'note', 'activitynotes', 'comments']);
const TAGS_HEADERS = new Set(['tags', 'tag', 'niches', 'labels']);
const THUMB_HEADERS = new Set(['thumbnail', 'image', 'avatar', 'thumb', 'imageurl']);
const CBEXP_HEADERS = new Set([
  'cbexploreradded',
  'cbexplorerwatchlist',
  'cbexplorer',
  'watchlisted',
]);

function parseBooleanCell(val: string | undefined): boolean {
  if (!val) return false;
  const norm = val.trim().toLowerCase();
  return norm === 'true' || norm === 'yes' || norm === '1' || norm === 'added' || norm === 'y';
}

function parseTagsCell(val: string | undefined): string[] {
  if (!val) return [];
  return val
    .split(/[;|,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseImportInput(
  rawText: string,
  existingModels: ModelRecord[] = []
): ImportParseResult {
  const warnings: string[] = [];
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { candidates: [], warnings };
  }

  const existingByUsername = new Map<string, ModelRecord>();
  for (const m of existingModels) {
    existingByUsername.set(m.username.toLowerCase(), m);
  }

  const parsed = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|'],
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 3)) {
      warnings.push(`Row ${(err.row ?? 0) + 1}: ${err.message}`);
    }
  }

  const rows = parsed.data
    .map((row) => row.map((cell) => (typeof cell === 'string' ? cell.trim() : '')))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length === 0) {
    return { candidates: [], warnings };
  }

  // Detect if the first row is a header row
  const firstRowNormalized = rows[0].map(normalizeHeader);
  const nameColIdx = firstRowNormalized.findIndex((h) => NAME_HEADERS.has(h));
  const linkColIdx = firstRowNormalized.findIndex((h) => LINK_HEADERS.has(h));
  const tierColIdx = firstRowNormalized.findIndex((h) => TIER_HEADERS.has(h));
  const notesColIdx = firstRowNormalized.findIndex((h) => NOTES_HEADERS.has(h));
  const tagsColIdx = firstRowNormalized.findIndex((h) => TAGS_HEADERS.has(h));
  const thumbColIdx = firstRowNormalized.findIndex((h) => THUMB_HEADERS.has(h));
  const cbexpColIdx = firstRowNormalized.findIndex((h) => CBEXP_HEADERS.has(h));

  const hasHeader =
    rows.length > 1 &&
    (nameColIdx !== -1 ||
      linkColIdx !== -1 ||
      tierColIdx !== -1 ||
      notesColIdx !== -1);

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const seenInBatch = new Set<string>();
  const candidates: ImportCandidate[] = [];

  const pushCandidate = (
    rawName: string,
    rawLink: string,
    rowIndex: number,
    row: string[]
  ) => {
    const originalLink =
      rawLink && isLikelyUrl(rawLink)
        ? normalizeExternalUrl(rawLink)
        : rawName && isLikelyUrl(rawName)
          ? normalizeExternalUrl(rawName)
          : '';

    const usernameFromLink = originalLink ? sanitizeUsername(originalLink) : '';
    const usernameFromName = rawName ? sanitizeUsername(rawName) : '';
    const username = usernameFromLink || usernameFromName;

    if (!username) {
      warnings.push(
        `Skipped row ${rowIndex + (hasHeader ? 2 : 1)}: could not isolate username.`
      );
      return;
    }

    if (seenInBatch.has(username)) {
      warnings.push(`Skipped duplicate in import batch: "${username}"`);
      return;
    }
    seenInBatch.add(username);

    const cleanDisplayName =
      rawName &&
      !isLikelyUrl(rawName) &&
      sanitizeUsername(rawName) !== rawName.trim()
        ? rawName.replace(/^@+/, '').trim()
        : '';

    const existing = existingByUsername.get(username);

    candidates.push({
      tempId: `imp_${rowIndex}_${username}`,
      rawInput: [rawName, rawLink].filter(Boolean).join(' | '),
      username,
      displayName: cleanDisplayName,
      originalLink,
      tierHint:
        hasHeader && tierColIdx !== -1 ? row[tierColIdx] ?? '' : undefined,
      notes:
        hasHeader && notesColIdx !== -1 ? row[notesColIdx] ?? '' : undefined,
      tags: hasHeader && tagsColIdx !== -1 ? parseTagsCell(row[tagsColIdx]) : [],
      cbexplorerAdded:
        hasHeader && cbexpColIdx !== -1
          ? parseBooleanCell(row[cbexpColIdx])
          : false,
      thumbnail:
        hasHeader && thumbColIdx !== -1 ? row[thumbColIdx] ?? '' : undefined,
      isDuplicate: Boolean(existing),
      existingModelId: existing?.id,
    });
  };

  dataRows.forEach((row, index) => {
    if (hasHeader) {
      let rawName = nameColIdx !== -1 ? row[nameColIdx] ?? '' : '';
      const rawLink = linkColIdx !== -1 ? row[linkColIdx] ?? '' : '';
      if (!rawName && !rawLink) {
        rawName = row[0] ?? '';
      }
      pushCandidate(rawName, rawLink, index, row);
      return;
    }

    if (row.length === 1) {
      const cell = row[0] ?? '';
      if (isLikelyUrl(cell)) {
        pushCandidate('', cell, index, row);
      } else {
        pushCandidate(cell, '', index, row);
      }
      return;
    }

    const nonEmptyCells = row.filter((c) => c.length > 0);
    const hasAnyUrl = nonEmptyCells.some((c) => isLikelyUrl(c));
    const allCompactHandles =
      nonEmptyCells.length >= 2 &&
      !hasAnyUrl &&
      nonEmptyCells.every((c) => !/\s/.test(c));

    if (allCompactHandles) {
      for (const cell of nonEmptyCells) {
        pushCandidate(cell, '', index, [cell]);
      }
      return;
    }

    const col0 = row[0] ?? '';
    const col1 = row[1] ?? '';
    if (isLikelyUrl(col0) && !isLikelyUrl(col1)) {
      pushCandidate(col1, col0, index, row);
    } else {
      pushCandidate(col0, isLikelyUrl(col1) ? col1 : '', index, row);
    }
  });

  return { candidates, warnings };
}
