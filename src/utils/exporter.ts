import Papa from 'papaparse';
import {
  AppData,
  InboxConfig,
  ModelRecord,
  TierDefinition,
  UrlTemplates,
} from '../types/models';
import { buildModelUrls } from './sanitizer';

export function getTierLabel(
  tierId: string,
  tiers: TierDefinition[],
  inbox: InboxConfig
): string {
  if (tierId === 'inbox') return inbox.name;
  return tiers.find((t) => t.id === tierId)?.name ?? inbox.name;
}

function escapeCsvFormulaCell(value: string): string {
  if (!value) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function exportModelsToCsv(
  models: ModelRecord[],
  tiers: TierDefinition[],
  inbox: InboxConfig,
  urlTemplates?: Partial<UrlTemplates>
): string {
  const rows = models.map((model) => {
    const urls = buildModelUrls(model.username, urlTemplates);
    return {
      'Model Name': escapeCsvFormulaCell(model.displayName || model.username),
      Username: escapeCsvFormulaCell(model.username),
      Tier: escapeCsvFormulaCell(getTierLabel(model.tierId, tiers, inbox)),
      'CBExplorer Watchlist': model.cbexplorerAdded ? 'Added' : 'Not Added',
      'Original Link': escapeCsvFormulaCell(model.originalLink),
      'CBHours URL': urls.cbhours,
      'CBExplorer URL': urls.cbexplorer,
      'ArchiveBate URL': urls.archivebate,
      Tags: escapeCsvFormulaCell(model.tags.join('; ')),
      Notes: escapeCsvFormulaCell(model.notes),
      Thumbnail: escapeCsvFormulaCell(model.thumbnail),
      'Custom Links': escapeCsvFormulaCell(
        model.customLinks.map((l) => `${l.label}: ${l.url}`).join(' | ')
      ),
      'Created At': model.createdAt,
      'Updated At': model.updatedAt,
    };
  });

  return Papa.unparse(rows);
}

export function exportModelsToJson(
  appData: AppData,
  modelsSubset?: ModelRecord[]
): string {
  const payload: AppData = {
    ...appData,
    models: modelsSubset ?? appData.models,
  };
  return JSON.stringify(payload, null, 2);
}

export interface TextSummaryOptions {
  includeLinks: boolean;
  includeNotes: boolean;
  includeTags: boolean;
  includeEmptyTiers: boolean;
  includeCbexplorerStatus: boolean;
}

export function buildTextSummaryByTier(
  models: ModelRecord[],
  tiers: TierDefinition[],
  inbox: InboxConfig,
  options: TextSummaryOptions,
  urlTemplates?: Partial<UrlTemplates>
): string {
  const sortedTiers = [...tiers].sort((a, b) => a.order - b.order);
  const groups: Array<{ id: string; name: string }> = [
    ...sortedTiers.map((t) => ({ id: t.id, name: t.name })),
    { id: 'inbox', name: inbox.name },
  ];

  const lines: string[] = [];

  for (const group of groups) {
    const groupModels = models
      .filter((m) => m.tierId === group.id)
      .sort((a, b) => a.order - b.order);

    if (groupModels.length === 0 && !options.includeEmptyTiers) {
      continue;
    }

    lines.push(`=== ${group.name} (${groupModels.length}) ===`);

    if (groupModels.length === 0) {
      lines.push('  (none)');
      lines.push('');
      continue;
    }

    for (const model of groupModels) {
      const urls = buildModelUrls(model.username, urlTemplates);
      const displayLabel =
        model.displayName && model.displayName !== model.username
          ? `${model.displayName} (@${model.username})`
          : model.username;

      const statusTag = options.includeCbexplorerStatus
        ? model.cbexplorerAdded
          ? ' [CBExplorer: Added]'
          : ' [CBExplorer: Pending]'
        : '';

      lines.push(`• ${displayLabel}${statusTag}`);

      if (options.includeTags && model.tags.length > 0) {
        lines.push(`  Tags: ${model.tags.join(', ')}`);
      }
      if (options.includeNotes && model.notes.trim()) {
        lines.push(`  Notes: ${model.notes.trim().replace(/\r?\n/g, ' ')}`);
      }
      if (options.includeLinks) {
        lines.push(`  CBHours: ${urls.cbhours}`);
        lines.push(`  CBExplorer: ${urls.cbexplorer}`);
        lines.push(`  ArchiveBate: ${urls.archivebate}`);
        if (model.originalLink) {
          lines.push(`  Original: ${model.originalLink}`);
        }
        for (const extra of model.customLinks) {
          lines.push(`  ${extra.label}: ${extra.url}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
