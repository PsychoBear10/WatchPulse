import React from 'react';
import {
  Archive,
  Clock,
  Compass,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { desktopBridge } from '../../services/bridge';
import { useAppStore } from '../../store/useAppStore';
import { CustomLink } from '../../types/models';
import { buildModelUrls, normalizeExternalUrl } from '../../utils/sanitizer';

interface LinkPillGroupProps {
  username: string;
  originalLink?: string;
  customLinks?: CustomLink[];
  variant?: 'compact' | 'full';
  showOpenAll?: boolean;
}

export const LinkPillGroup: React.FC<LinkPillGroupProps> = ({
  username,
  originalLink,
  customLinks = [],
  variant = 'full',
  showOpenAll = false,
}) => {
  const { data } = useAppStore();
  const urls = buildModelUrls(username, data.settings.urlTemplates);
  const normalizedOriginal = originalLink ? normalizeExternalUrl(originalLink) : '';

  const openUrl = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    void desktopBridge.openExternal(url);
  };

  const openAllCore = (e: React.MouseEvent) => {
    e.stopPropagation();
    void desktopBridge.openExternal(urls.cbhours);
    void desktopBridge.openExternal(urls.cbexplorer);
    void desktopBridge.openExternal(urls.archivebate);
  };

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={(e) => openUrl(e, urls.cbhours)}
          title={`CBHours: ${urls.cbhours}`}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 hover:border-sky-400/40 transition-colors"
        >
          CBH
        </button>
        <button
          type="button"
          onClick={(e) => openUrl(e, urls.cbexplorer)}
          title={`CBExplorer: ${urls.cbexplorer}`}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-400/40 transition-colors"
        >
          CBE
        </button>
        <button
          type="button"
          onClick={(e) => openUrl(e, urls.archivebate)}
          title={`ArchiveBate: ${urls.archivebate}`}
          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-400/40 transition-colors"
        >
          AB
        </button>
        {normalizedOriginal && (
          <button
            type="button"
            onClick={(e) => openUrl(e, normalizedOriginal)}
            title={`Original Profile: ${normalizedOriginal}`}
            className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition-colors inline-flex items-center gap-0.5"
          >
            Orig
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        )}
        {showOpenAll && (
          <button
            type="button"
            onClick={openAllCore}
            title="Open CBHours, CBExplorer, and ArchiveBate in default browser"
            className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/30 text-slate-300 border border-white/10 hover:text-white hover:border-white/25 transition-colors"
          >
            Open 3
          </button>
        )}
        {customLinks.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={(e) => openUrl(e, normalizeExternalUrl(link.url))}
            title={link.url}
            className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/10 text-amber-200 border border-amber-500/25 hover:bg-amber-500/20 transition-colors inline-flex items-center gap-0.5"
          >
            {link.label}
            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(e) => openUrl(e, urls.cbhours)}
        title={urls.cbhours}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-300 border border-sky-500/25 hover:bg-sky-500/20 hover:border-sky-400/45 transition-all"
      >
        <Clock className="w-3.5 h-3.5" />
        CBHours
        <ExternalLink className="w-3 h-3 opacity-60" />
      </button>

      <button
        type="button"
        onClick={(e) => openUrl(e, urls.cbexplorer)}
        title={urls.cbexplorer}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-400/45 transition-all"
      >
        <Compass className="w-3.5 h-3.5" />
        CBExplorer
        <ExternalLink className="w-3 h-3 opacity-60" />
      </button>

      <button
        type="button"
        onClick={(e) => openUrl(e, urls.archivebate)}
        title={urls.archivebate}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/25 hover:bg-violet-500/20 hover:border-violet-400/45 transition-all"
      >
        <Archive className="w-3.5 h-3.5" />
        ArchiveBate
        <ExternalLink className="w-3 h-3 opacity-60" />
      </button>

      {normalizedOriginal && (
        <button
          type="button"
          onClick={(e) => openUrl(e, normalizedOriginal)}
          title={normalizedOriginal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-200 border border-white/15 hover:bg-white/[0.12] hover:border-white/25 transition-all"
        >
          <Globe className="w-3.5 h-3.5" />
          Original Link
          <ExternalLink className="w-3 h-3 opacity-60" />
        </button>
      )}

      {showOpenAll && (
        <button
          type="button"
          onClick={openAllCore}
          title="Open CBHours, CBExplorer, and ArchiveBate in default browser"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-black/30 border border-white/10 hover:text-white hover:border-white/25 transition-all"
        >
          Open All 3
        </button>
      )}

      {customLinks.map((link) => (
        <button
          key={link.id}
          type="button"
          onClick={(e) => openUrl(e, normalizeExternalUrl(link.url))}
          title={link.url}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-200 border border-amber-500/25 hover:bg-amber-500/20 transition-all"
        >
          {link.label}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </button>
      ))}
    </div>
  );
};
