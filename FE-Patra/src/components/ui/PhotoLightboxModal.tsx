import { useEffect } from 'react';
import { ExternalLink, X } from 'lucide-react';

export interface PhotoLightboxModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

function isSafePhotoHref(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    (trimmed.startsWith('/') && !trimmed.startsWith('//'))
  );
}

/**
 * Modal pratinjau foto ukuran penuh (`object-contain`) dengan tombol Escape & tautan buka asli.
 */
export default function PhotoLightboxModal({ url, title, onClose }: PhotoLightboxModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const canOpenOriginal = isSafePhotoHref(url);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <p className="min-w-0 truncate font-mono text-xs font-bold text-primary">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            {canOpenOriginal && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:border-primary/40 hover:bg-[#EEF4FD]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Buka Asli</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup lightbox foto"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center bg-video-frame p-2">
          <img src={url} alt={title} className="max-h-[82vh] w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
