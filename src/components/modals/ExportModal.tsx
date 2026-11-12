import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileCode2,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import {
  buildTextSummaryByTier,
  exportModelsToCsv,
  exportModelsToJson,
} from '../../utils/exporter';
import { ModalShell } from '../common/ModalShell';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose }) => {
  const { data, notify } = useAppStore();

  const [tab, setTab] = useState<'summary' | 'csv' | 'json'>('summary');
  const [tierScope, setTierScope] = useState<string>('all');
  const [includeLinks, setIncludeLinks] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [includeCbStatus, setIncludeCbStatus] = useState(true);
  const [includeEmptyTiers, setIncludeEmptyTiers] = useState(false);
  const [copied, setCopied] = useState(false);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const scopedModels = useMemo(() => {
    if (tierScope === 'all') return data.models;
    return data.models.filter((m) => m.tierId === tierScope);
  }, [data.models, tierScope]);

  const summaryText = useMemo(
    () =>
      buildTextSummaryByTier(
        scopedModels,
        data.tiers,
        data.inbox,
        {
          includeLinks,
          includeNotes,
          includeTags,
          includeCbexplorerStatus: includeCbStatus,
          includeEmptyTiers: tierScope === 'all' ? includeEmptyTiers : false,
        },
        data.settings.urlTemplates
      ),
    [
      data.inbox,
      data.settings.urlTemplates,
      data.tiers,
      includeCbStatus,
      includeEmptyTiers,
      includeLinks,
      includeNotes,
      includeTags,
      scopedModels,
      tierScope,
    ]
  );

  const csvContent = useMemo(
    () =>
      exportModelsToCsv(
        scopedModels,
        data.tiers,
        data.inbox,
        data.settings.urlTemplates
      ),
    [data.inbox, data.settings.urlTemplates, data.tiers, scopedModels]
  );

  const jsonContent = useMemo(
    () =>
      exportModelsToJson(
        data,
        tierScope === 'all' ? undefined : scopedModels
      ),
    [data, scopedModels, tierScope]
  );

  const handleCopy = async (text: string, label: string) => {
    await desktopBridge.copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    notify(`Copied ${label} to clipboard.`, 'success');
  };

  const handleSaveFile = async (
    content: string,
    extension: 'csv' | 'json' | 'txt'
  ) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await desktopBridge.saveExportFile({
      defaultName: `watchpulse-export-${stamp}.${extension}`,
      content,
      extension,
    });
    if (res.error) {
      notify(`Export failed: ${res.error}`, 'error');
      return;
    }
    if (!res.canceled) {
      notify(`Saved export to ${res.filePath}`, 'success');
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Export & Share Studio"
      subtitle="Export enriched models to CSV, full JSON backup, or copy clean tier-grouped text summaries."
      maxWidthClass="max-w-4xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200"
        >
          Close
        </button>
      }
    >
      <div className="space-y-5">
        {/* Format Tabs + Scope */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTab('summary')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'summary'
                  ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Text Summary
            </button>
            <button
              type="button"
              onClick={() => setTab('csv')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'csv'
                  ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              CSV Spreadsheet
            </button>
            <button
              type="button"
              onClick={() => setTab('json')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'json'
                  ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              Formatted JSON
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Scope:</span>
            <select
              value={tierScope}
              onChange={(e) => setTierScope(e.target.value)}
              className="bg-[#0C0F16] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="all">All Models ({data.models.length})</option>
              <option value="inbox">
                {data.inbox.name} (
                {data.models.filter((m) => m.tierId === 'inbox').length})
              </option>
              {sortedTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({data.models.filter((m) => m.tierId === t.id).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {tab === 'summary' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 p-3 rounded-xl bg-black/30 border border-white/[0.07] text-xs text-slate-300">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLinks}
                  onChange={(e) => setIncludeLinks(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
                Include Links
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTags}
                  onChange={(e) => setIncludeTags(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
                Include Tags
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
                Include Notes
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCbStatus}
                  onChange={(e) => setIncludeCbStatus(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-indigo-500"
                />
                CBExplorer Status
              </label>
              {tierScope === 'all' && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeEmptyTiers}
                    onChange={(e) => setIncludeEmptyTiers(e.target.checked)}
                    className="rounded border-white/20 bg-black/40 text-indigo-500"
                  />
                  Show Empty Tiers
                </label>
              )}
            </div>

            <pre className="h-72 overflow-auto p-4 rounded-xl bg-[#0A0C12] border border-white/[0.08] text-xs font-mono text-slate-200 whitespace-pre-wrap">
              {summaryText || 'No models in selected scope.'}
            </pre>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleSaveFile(summaryText, 'txt')}
                disabled={!summaryText}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 disabled:opacity-40"
              >
                Save .TXT File...
              </button>
              <button
                type="button"
                onClick={() => handleCopy(summaryText, 'text summary')}
                disabled={!summaryText}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied!' : 'Copy Summary to Clipboard'}
              </button>
            </div>
          </div>
        )}

        {tab === 'csv' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Exports {scopedModels.length} model(s) with Model Name, Clean Username,
              Tier, CBExplorer Watchlist Status, Original Link, CBHours, CBExplorer,
              ArchiveBate, Tags, Notes, Thumbnail, and Custom Links.
            </p>
            <pre className="h-72 overflow-auto p-4 rounded-xl bg-[#0A0C12] border border-white/[0.08] text-[11px] font-mono text-slate-300">
              {csvContent || 'No models to export.'}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopy(csvContent, 'CSV')}
                disabled={!csvContent}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 disabled:opacity-40"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy CSV
              </button>
              <button
                type="button"
                onClick={() => handleSaveFile(csvContent, 'csv')}
                disabled={!csvContent}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Save CSV File...
              </button>
            </div>
          </div>
        )}

        {tab === 'json' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Full structured JSON containing your custom tiers, hotkeys, Inbox config,
              and enriched models (can also be restored from Settings).
            </p>
            <pre className="h-72 overflow-auto p-4 rounded-xl bg-[#0A0C12] border border-white/[0.08] text-[11px] font-mono text-slate-300">
              {jsonContent}
            </pre>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCopy(jsonContent, 'JSON')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => handleSaveFile(jsonContent, 'json')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Save JSON Backup...
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
