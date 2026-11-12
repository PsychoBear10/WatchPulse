import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FolderOpen,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import { CustomLink, ModelRecord } from '../../types/models';
import { buildModelUrls, normalizeExternalUrl, sanitizeUsername } from '../../utils/sanitizer';
import { ActivityHeatmap } from '../common/ActivityHeatmap';
import { CbexplorerToggle } from '../common/CbexplorerToggle';
import { LinkPillGroup } from '../common/LinkPillGroup';
import { ModalShell } from '../common/ModalShell';
import { ModelAvatar } from '../common/ModelAvatar';
import { TagInput } from '../common/TagInput';

interface ModelEditorModalProps {
  model: ModelRecord | null;
  onClose: () => void;
  onRequestDelete: (models: ModelRecord[]) => void;
}

export const ModelEditorModal: React.FC<ModelEditorModalProps> = ({
  model,
  onClose,
  onRequestDelete,
}) => {
  const { data, allKnownTags, updateModel, notify } = useAppStore();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [originalLink, setOriginalLink] = useState('');
  const [tierId, setTierId] = useState('inbox');
  const [cbexplorerAdded, setCbexplorerAdded] = useState(false);
  const [thumbnail, setThumbnail] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [monthlyHours, setMonthlyHours] = useState('');
  const [avgHoursPerDay, setAvgHoursPerDay] = useState('');
  const [usualSchedule, setUsualSchedule] = useState('');

  useEffect(() => {
    if (!model) return;
    setUsername(model.username);
    setDisplayName(model.displayName);
    setOriginalLink(model.originalLink);
    setTierId(model.tierId);
    setCbexplorerAdded(model.cbexplorerAdded);
    setThumbnail(model.thumbnail);
    setNotes(model.notes);
    setTags(model.tags);
    setCustomLinks(model.customLinks);
    setMonthlyHours(
      model.manualActivityStats?.monthlyHours !== undefined
        ? String(model.manualActivityStats.monthlyHours)
        : ''
    );
    setAvgHoursPerDay(
      model.manualActivityStats?.avgHoursPerDay !== undefined
        ? String(model.manualActivityStats.avgHoursPerDay)
        : ''
    );
    setUsualSchedule(model.manualActivityStats?.usualSchedule ?? '');
    setNewLinkLabel('');
    setNewLinkUrl('');
  }, [model]);

  const sortedTiers = useMemo(
    () => [...data.tiers].sort((a, b) => a.order - b.order),
    [data.tiers]
  );

  if (!model) return null;

  const cleanPreviewUsername = sanitizeUsername(username) || model.username;
  const generated = buildModelUrls(
    cleanPreviewUsername,
    data.settings.urlTemplates
  );

  const handleBrowseImage = async () => {
    const res = await desktopBridge.openImageFile();
    if (!res.canceled && res.mediaUrl) {
      setThumbnail(res.mediaUrl);
    }
  };

  const handleAddLink = () => {
    const clean = normalizeExternalUrl(newLinkUrl);
    if (!clean) return;
    setCustomLinks((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `lnk_${crypto.randomUUID().slice(0, 8)}`
            : `lnk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: newLinkLabel.trim() || 'Recording',
        url: clean,
      },
    ]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMonthly = Number.parseFloat(monthlyHours);
    const parsedDaily = Number.parseFloat(avgHoursPerDay);
    const hasManualStats =
      Number.isFinite(parsedMonthly) ||
      Number.isFinite(parsedDaily) ||
      usualSchedule.trim().length > 0;

    const result = updateModel(
      model.id,
      {
        username: cleanPreviewUsername,
        displayName: displayName.trim(),
        originalLink: originalLink.trim(),
        tierId,
        cbexplorerAdded,
        thumbnail: thumbnail.trim(),
        notes,
        tags,
        customLinks,
        manualActivityStats: hasManualStats
          ? {
              monthlyHours: Number.isFinite(parsedMonthly)
                ? Math.max(0, parsedMonthly)
                : undefined,
              avgHoursPerDay: Number.isFinite(parsedDaily)
                ? Math.max(0, parsedDaily)
                : undefined,
              usualSchedule: usualSchedule.trim() || undefined,
            }
          : undefined,
      },
      true
    );

    if (!result.ok) {
      notify(result.error || 'Could not save changes.', 'error');
      return;
    }

    notify(`Saved changes to ${cleanPreviewUsername}`, 'success');
    onClose();
  };

  const handleDelete = () => {
    const target = model;
    onClose();
    onRequestDelete([target]);
  };

  return (
    <ModalShell
      open={Boolean(model)}
      onClose={onClose}
      title={`Edit Model — ${model.displayName || model.username}`}
      subtitle={`@${cleanPreviewUsername}`}
      maxWidthClass="max-w-3xl"
      footer={
        <div className="w-full flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Model
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="model-editor-form"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Save Changes
            </button>
          </div>
        </div>
      }
    >
      <form id="model-editor-form" onSubmit={handleSave} className="space-y-5">
        {/* Top Profile Preview + Watchlist Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black/30 border border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <ModelAvatar
              username={cleanPreviewUsername}
              displayName={displayName}
              thumbnail={thumbnail}
              size="lg"
            />
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold text-white truncate">
                {displayName || cleanPreviewUsername}
              </div>
              <div className="text-xs font-mono text-indigo-300 truncate">
                @{cleanPreviewUsername}
              </div>
            </div>
          </div>

          <CbexplorerToggle
            checked={cbexplorerAdded}
            onToggle={() => setCbexplorerAdded((v) => !v)}
          />
        </div>

        {/* Core Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Clean Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="studio-input text-xs font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional friendly label"
              className="studio-input text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Tier Assignment
            </label>
            <select
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
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

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Original Profile Link
            </label>
            <input
              type="text"
              value={originalLink}
              onChange={(e) => setOriginalLink(e.target.value)}
              placeholder="https://chaturbate.com/..."
              className="studio-input text-xs"
            />
          </div>
        </div>

        {/* Thumbnail */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-slate-400">
            Profile Thumbnail (Image URL or Local File Path)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="https://... or C:\path\to\avatar.jpg"
              className="studio-input text-xs"
            />
            <button
              type="button"
              onClick={handleBrowseImage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 shrink-0"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Browse Image...
            </button>
            {thumbnail && (
              <button
                type="button"
                onClick={() => setThumbnail('')}
                className="px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white bg-white/[0.04] border border-white/10"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Enriched Links Preview */}
        <div className="p-3.5 rounded-xl bg-black/25 border border-white/[0.07] space-y-2">
          <div className="text-[11px] font-medium text-slate-400">
            Generated & Profile Links
          </div>
          <LinkPillGroup
            username={cleanPreviewUsername}
            originalLink={originalLink}
            customLinks={customLinks}
          />
          <div className="text-[10px] font-mono text-slate-500 pt-1 space-y-0.5">
            <div>CBHours: {generated.cbhours}</div>
            <div>CBExplorer: {generated.cbexplorer}</div>
            <div>ArchiveBate: {generated.archivebate}</div>
          </div>
        </div>

        {/* Activity Heatmap & Pinned Stats */}
        <div className="space-y-2.5">
          <ActivityHeatmap model={model} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Monthly Hours (optional override)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={monthlyHours}
                onChange={(e) => setMonthlyHours(e.target.value)}
                placeholder="From CBHours"
                className="studio-input text-xs py-1.5"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Avg Hours / Day (optional)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={avgHoursPerDay}
                onChange={(e) => setAvgHoursPerDay(e.target.value)}
                placeholder="e.g. 3.5"
                className="studio-input text-xs py-1.5"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1">
                Usual Schedule (optional)
              </label>
              <input
                type="text"
                value={usualSchedule}
                onChange={(e) => setUsualSchedule(e.target.value)}
                placeholder="e.g. 22:00–02:00"
                className="studio-input text-xs py-1.5"
              />
            </div>
          </div>
        </div>

        {/* Activity Notes */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Activity Notes (Streaming Hours, Quality, Preferences)
          </label>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Usual schedule, bitrate/audio quality, cam style..."
            className="studio-input text-xs leading-relaxed"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
            Niche Tags
          </label>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={allKnownTags}
          />
        </div>

        {/* Custom Recording Links */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Link2 className="w-3.5 h-3.5" />
            Custom Recording Links ({customLinks.length})
          </label>

          {customLinks.map((lnk, idx) => (
            <div key={lnk.id} className="grid grid-cols-12 gap-2 items-center">
              <input
                type="text"
                value={lnk.label}
                onChange={(e) =>
                  setCustomLinks((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, label: e.target.value } : item
                    )
                  )
                }
                placeholder="Label"
                className="col-span-4 studio-input text-xs py-1.5"
              />
              <input
                type="text"
                value={lnk.url}
                onChange={(e) =>
                  setCustomLinks((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, url: e.target.value } : item
                    )
                  )
                }
                placeholder="https://..."
                className="col-span-6 studio-input text-xs py-1.5"
              />
              <div className="col-span-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => void desktopBridge.openExternal(normalizeExternalUrl(lnk.url))}
                  title="Open link"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomLinks((prev) => prev.filter((item) => item.id !== lnk.id))
                  }
                  title="Delete link"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="Label (e.g. VOD Mirror)"
              className="w-40 studio-input text-xs py-1.5"
            />
            <input
              type="text"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 studio-input text-xs py-1.5"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!newLinkUrl.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
};
