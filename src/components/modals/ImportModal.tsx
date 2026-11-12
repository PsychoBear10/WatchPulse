import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardPaste,
  FileSpreadsheet,
  Link2,
  Plus,
  RefreshCw,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { DuplicatePolicy, useAppStore } from '../../store/useAppStore';
import { parseImportInput } from '../../utils/csvImporter';
import { extractCbexplorerListId } from '../../utils/liveFeed';
import { buildModelUrls, sanitizeUsername } from '../../utils/sanitizer';
import { ModalShell } from '../common/ModalShell';
import { TagInput } from '../common/TagInput';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ open, onClose }) => {
  const {
    data,
    allKnownTags,
    addModelsFromImport,
    addSingleModel,
    restoreFromTrash,
    notify,
  } = useAppStore();

  const [tab, setTab] = useState<'bulk' | 'single'>('bulk');
  const [rawText, setRawText] = useState('');
  const [cbexListUrl, setCbexListUrl] = useState('');
  const [fetchingCbexList, setFetchingCbexList] = useState(false);
  const [fetchedListInfo, setFetchedListInfo] = useState<{
    name: string;
    count: number;
  } | null>(null);
  const [targetTierId, setTargetTierId] = useState('inbox');
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('skip');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Single-model form state
  const [singleInput, setSingleInput] = useState('');
  const [singleDisplayName, setSingleDisplayName] = useState('');
  const [singleOriginalLink, setSingleOriginalLink] = useState('');
  const [singleTierId, setSingleTierId] = useState('inbox');
  const [singleNotes, setSingleNotes] = useState('');
  const [singleTags, setSingleTags] = useState<string[]>([]);
  const [singleCbexplorer, setSingleCbexplorer] = useState(false);
  const [singleError, setSingleError] = useState('');
  const [trashedMatchId, setTrashedMatchId] = useState<string | null>(null);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  const parsed = useMemo(
    () => parseImportInput(rawText, data.models),
    [data.models, rawText]
  );

  const duplicateCount = parsed.candidates.filter((c) => c.isDuplicate).length;
  const freshCount = parsed.candidates.length - duplicateCount;

  const singleSanitized = sanitizeUsername(singleInput);
  const singleUrls = singleSanitized
    ? buildModelUrls(singleSanitized, data.settings.urlTemplates)
    : null;

  const handleOpenCsv = async () => {
    const res = await desktopBridge.openCsvFile();
    if (!res.canceled && res.content !== undefined) {
      setRawText(res.content);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await desktopBridge.readClipboardText();
      if (clip) {
        setRawText((prev) => (prev.trim() ? `${prev.trim()}\n${clip}` : clip));
      } else {
        notify('Clipboard is empty.', 'warning');
      }
    } catch {
      notify('Could not read clipboard automatically — paste with Ctrl+V.', 'warning');
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawText(text);
    } catch {
      notify('Could not read the dropped file.', 'error');
    }
  };

  const handleFetchCbexplorerList = async (overrideUrl?: string) => {
    const candidateUrl = (overrideUrl ?? cbexListUrl).trim();
    const listId = extractCbexplorerListId(candidateUrl);
    if (!listId) {
      notify(
        'Paste a valid CBExplorer list URL like https://cbexplorer.com/lists/ArchiveBate-LWER9b1ayk6BGTpTLThpIA',
        'warning'
      );
      return;
    }
    setFetchingCbexList(true);
    try {
      const res = await desktopBridge.fetchLiveJson(
        `https://api.cbexplorer.com/lists/${encodeURIComponent(listId)}`
      );
      const payload = res.data as
        | { name?: string; performers?: unknown[] }
        | undefined;
      if (!res.ok || !payload || !Array.isArray(payload.performers)) {
        notify(
          res.error || 'Could not load performers from that CBExplorer list URL.',
          'warning'
        );
        return;
      }
      const performers = payload.performers
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (performers.length === 0) {
        notify('That CBExplorer list has 0 models.', 'info');
        return;
      }
      const rows = [
        'Model Name,Original Link',
        ...performers.map((u) => `${u},https://chaturbate.com/${u}/`),
      ].join('\n');
      setRawText(rows);
      const listName = payload.name?.trim() || 'CBExplorer List';
      setFetchedListInfo({ name: listName, count: performers.length });
      const matchedTier = sortedTiers.find(
        (t) => t.name.trim().toLowerCase() === listName.toLowerCase()
      );
      if (matchedTier) {
        setTargetTierId(matchedTier.id);
      }
      notify(
        `Loaded ${performers.length} models from "${listName}". Review and click Import.`,
        'success'
      );
    } finally {
      setFetchingCbexList(false);
    }
  };

  const handleCommitBulk = () => {
    if (parsed.candidates.length === 0) return;
    const res = addModelsFromImport(
      parsed.candidates,
      targetTierId,
      duplicatePolicy
    );
    notify(
      `Imported ${res.added} new${res.updated ? `, updated ${res.updated}` : ''}${res.skipped ? `, skipped ${res.skipped}` : ''}.`,
      'success'
    );
    setRawText('');
    setCbexListUrl('');
    setFetchedListInfo(null);
    onClose();
  };

  const submitSingleModel = (keepOpen: boolean) => {
    setSingleError('');
    setTrashedMatchId(null);
    const result = addSingleModel({
      rawUsernameOrUrl: singleInput,
      displayName: singleDisplayName,
      originalLink: singleOriginalLink,
      tierId: singleTierId,
      notes: singleNotes,
      tags: singleTags,
      cbexplorerAdded: singleCbexplorer,
    });
    if (!result.ok) {
      setSingleError(result.error ?? 'Failed to add model.');
      if (result.trashedModelId) {
        setTrashedMatchId(result.trashedModelId);
      }
      return;
    }
    notify(`Added "${result.model?.username}" to workspace.`, 'success');
    setSingleInput('');
    setSingleDisplayName('');
    setSingleOriginalLink('');
    setSingleNotes('');
    setSingleTags([]);
    setSingleCbexplorer(false);
    if (!keepOpen) {
      onClose();
    }
  };

  const handleCommitSingle = (e: React.FormEvent) => {
    e.preventDefault();
    submitSingleModel(false);
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Import & Enrich Models"
      subtitle="Ingest CSVs, paste URLs or username lists, sanitize handles with regex, and auto-build enrichment links."
      maxWidthClass="max-w-4xl"
      footer={
        tab === 'bulk' ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommitBulk}
              disabled={parsed.candidates.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
            >
              Import {duplicatePolicy === 'skip' ? freshCount : parsed.candidates.length}{' '}
              Model(s)
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-black/40 border border-white/[0.08] w-fit">
          <button
            type="button"
            onClick={() => setTab('bulk')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'bulk'
                ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            CSV / Clipboard Import
          </button>
          <button
            type="button"
            onClick={() => setTab('single')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'single'
                ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Single Model
          </button>
        </div>

        {tab === 'bulk' ? (
          <div className="space-y-4">
            {/* Import Direct from CBExplorer Watchlist URL */}
            <div className="p-3 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/25 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200">
                  <Link2 className="w-3.5 h-3.5 text-indigo-300" />
                  Pull directly from a CBExplorer Watchlist Link
                </span>
                {fetchedListInfo && (
                  <span className="text-[11px] font-medium text-emerald-300">
                    Loaded &ldquo;{fetchedListInfo.name}&rdquo; ({fetchedListInfo.count})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cbexListUrl}
                  onChange={(e) => setCbexListUrl(e.target.value)}
                  placeholder="https://cbexplorer.com/lists/ArchiveBate-..."
                  className="studio-input text-xs font-mono flex-1"
                />
                <button
                  type="button"
                  onClick={() => void handleFetchCbexplorerList()}
                  disabled={fetchingCbexList || !cbexListUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-45 shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${fetchingCbexList ? 'animate-spin' : ''}`}
                  />
                  {fetchingCbexList ? 'Loading...' : 'Load List'}
                </button>
              </div>
            </div>

            {/* Action Buttons + Drag-and-Drop Zone */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 border border-white/10"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                  Load CSV / TXT File...
                </button>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 border border-white/10"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-indigo-300" />
                  Paste Clipboard
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRawText(
                      'Model Name,Original Link\nSeduza Hyun,https://chaturbate.com/seduza_hyun/\n@luna_vibe,\nhttps://www.cbhours.com/user/neon_kairo.html\nhttps://archivebate.com/profile/aria_solstice'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-indigo-200 bg-white/[0.03] border border-white/[0.07]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Insert Sample CSV
                </button>
              </div>

              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear Input
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleFileDrop}
              className={`rounded-xl border transition-colors ${
                isDraggingFile
                  ? 'border-indigo-400 bg-indigo-500/10'
                  : 'border-white/10 bg-[#0B0D14]'
              }`}
            >
              <textarea
                rows={6}
                value={rawText}
                onChange={(e) => {
                  const val = e.target.value;
                  const trimmed = val.trim();
                  if (!trimmed.includes('\n') && extractCbexplorerListId(trimmed)) {
                    setCbexListUrl(trimmed);
                    void handleFetchCbexplorerList(trimmed);
                    return;
                  }
                  setRawText(val);
                }}
                placeholder={
                  'Drop a .csv/.txt file here, or paste CSV rows / usernames / URLs...\n\nExamples:\nModel Name,Original Link\nseduza_hyun,https://chaturbate.com/seduza_hyun/\nhttps://www.cbhours.com/user/example_user.html\n@another_model'
                }
                className="w-full bg-transparent px-3.5 py-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none resize-y"
              />
            </div>

            {/* Import Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-black/30 border border-white/[0.07]">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Default Tier for Imported Models
                </label>
                <select
                  value={targetTierId}
                  onChange={(e) => setTargetTierId(e.target.value)}
                  className="w-full bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="inbox">{data.inbox.name} (Default)</option>
                  {sortedTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Duplicate Username Handling ({duplicateCount} detected)
                </label>
                <select
                  value={duplicatePolicy}
                  onChange={(e) =>
                    setDuplicatePolicy(e.target.value as DuplicatePolicy)
                  }
                  className="w-full bg-[#151924] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="skip">Skip existing models</option>
                  <option value="update">Merge links, notes & tags into existing</option>
                </select>
              </div>
            </div>

            {/* Warnings */}
            {parsed.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Parser Notices
                </div>
                {parsed.warnings.slice(0, 4).map((w, idx) => (
                  <div key={idx} className="text-[11px] text-amber-200/80">
                    • {w}
                  </div>
                ))}
              </div>
            )}

            {/* Live Regex Sanitizer Preview Table */}
            {parsed.candidates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Sanitizer & URL Preview ({parsed.candidates.length} parsed ·{' '}
                    <span className="text-emerald-400">{freshCount} new</span>
                    {duplicateCount > 0 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="text-amber-300">
                          {duplicateCount} existing
                        </span>
                      </>
                    )}
                    )
                  </span>
                </div>

                <div className="max-h-56 overflow-auto rounded-xl border border-white/[0.08] bg-[#0B0D14]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#121622] border-b border-white/[0.08] text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Sanitized Username</th>
                        <th className="px-3 py-2">Original Link</th>
                        <th className="px-3 py-2">Auto-Generated Links</th>
                        <th className="px-3 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {parsed.candidates.map((cand) => {
                        const gen = buildModelUrls(
                          cand.username,
                          data.settings.urlTemplates
                        );
                        return (
                          <tr key={cand.tempId} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2 font-mono font-semibold text-indigo-300">
                              {cand.username}
                              {cand.displayName && (
                                <div className="font-sans text-[10px] font-normal text-slate-400">
                                  {cand.displayName}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-400 truncate max-w-[200px]">
                              {cand.originalLink || '—'}
                            </td>
                            <td className="px-3 py-2 text-[10px] font-mono text-slate-500 truncate max-w-[240px]">
                              {gen.cbhours}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {cand.isDuplicate ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Exists
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  New
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCommitSingle} className="space-y-4">
            {singleError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2">
                <span>{singleError}</span>
                {trashedMatchId && (
                  <button
                    type="button"
                    onClick={() => {
                      restoreFromTrash([trashedMatchId]);
                      setSingleError('');
                      setTrashedMatchId(null);
                      setSingleInput('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 font-semibold"
                  >
                    Restore from Recycling Bin
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Username or Profile URL *
                </label>
                <input
                  type="text"
                  value={singleInput}
                  onChange={(e) => setSingleInput(e.target.value)}
                  placeholder="seduza_hyun or https://chaturbate.com/seduza_hyun/"
                  className="studio-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Display Name (optional)
                </label>
                <input
                  type="text"
                  value={singleDisplayName}
                  onChange={(e) => setSingleDisplayName(e.target.value)}
                  placeholder="Friendly name"
                  className="studio-input text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Original Link (optional)
                </label>
                <input
                  type="text"
                  value={singleOriginalLink}
                  onChange={(e) => setSingleOriginalLink(e.target.value)}
                  placeholder="https://chaturbate.com/..."
                  className="studio-input text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Initial Tier
                </label>
                <select
                  value={singleTierId}
                  onChange={(e) => setSingleTierId(e.target.value)}
                  className="w-full bg-[#0C0F16] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value="inbox">{data.inbox.name}</option>
                  {sortedTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {singleUrls && (
              <div className="p-3 rounded-xl bg-black/35 border border-white/[0.07] space-y-1 text-[11px] font-mono text-slate-400">
                <div className="text-indigo-300 font-semibold">
                  Clean Username: {singleSanitized}
                </div>
                <div>CBHours: {singleUrls.cbhours}</div>
                <div>CBExplorer: {singleUrls.cbexplorer}</div>
                <div>ArchiveBate: {singleUrls.archivebate}</div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Tags
              </label>
              <TagInput
                tags={singleTags}
                onChange={setSingleTags}
                suggestions={allKnownTags}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Activity Notes
              </label>
              <textarea
                rows={3}
                value={singleNotes}
                onChange={(e) => setSingleNotes(e.target.value)}
                placeholder="Streaming hours, quality, notes..."
                className="studio-input text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={singleCbexplorer}
                onChange={(e) => setSingleCbexplorer(e.target.checked)}
                className="rounded border-white/20 bg-black/40 text-emerald-500"
              />
              Already added to CBExplorer Watchlist
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitSingleModel(true)}
                disabled={!singleSanitized}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-slate-100 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Add &amp; Add Another
              </button>
              <button
                type="submit"
                disabled={!singleSanitized}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Add &amp; Close
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
};
