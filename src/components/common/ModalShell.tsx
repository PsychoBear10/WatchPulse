import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  heightClass?: string;
  disableEscapeClose?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-3xl',
  heightClass = 'max-h-[88vh]',
  disableEscapeClose = false,
  children,
  footer,
}) => {
  useEffect(() => {
    if (!open || disableEscapeClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [disableEscapeClose, open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto py-4 sm:py-6 bg-black/65 backdrop-blur-md transition-all"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} ${heightClass} flex flex-col liquid-glass-card rounded-2xl shadow-elevation overflow-hidden animate-card-enter relative my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Specular Ambient Header Glow (Luminous Cyan & Royal Azure Glow) */}
        <div className="absolute top-0 inset-x-[16.666%] h-32 bg-gradient-to-b from-cyan-400/28 via-blue-500/18 to-transparent blur-xl pointer-events-none rounded-t-2xl z-0" />

        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/[0.08] liquid-glass-header relative z-10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar relative z-10">{children}</div>

        {footer && (
          <div className="px-6 py-3.5 border-t border-white/[0.08] liquid-glass-header flex items-center justify-end gap-2.5 relative z-10 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
