import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  actionLabel?: string;
  actionTo?: string;
  durationMs?: number;
}

interface ToastRecord extends ToastInput {
  id: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const record: ToastRecord = {
        ...input,
        id,
        variant: input.variant ?? 'info',
      };
      setToasts((prev) => [...prev.slice(-3), record]);
      const duration = input.durationMs ?? 6000;
      if (duration > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, duration);
      }
    },
    [],
  );

  const value = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 right-5 z-[1000] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_14px_34px_-10px_rgba(4,63,165,0.28)] transition-all',
              toast.variant === 'success' && 'border-primary/25',
              toast.variant === 'error' && 'border-red-200',
              toast.variant === 'warning' && 'border-amber-200',
              toast.variant === 'info' && 'border-accent/60',
            )}
          >
            <div className="mt-0.5 shrink-0">
              {toast.variant === 'success' && (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
              {toast.variant === 'error' && (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              {toast.variant === 'warning' && (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              {toast.variant === 'info' && <Info className="h-5 w-5 text-primary" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary leading-snug">
                {toast.title}
              </p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  {toast.description}
                </p>
              )}
              {toast.actionLabel && toast.actionTo && (
                <Link
                  to={toast.actionTo}
                  onClick={() => dismissToast(toast.id)}
                  className="mt-1.5 inline-block text-xs font-semibold text-secondary underline underline-offset-2 hover:text-primary"
                >
                  {toast.actionLabel}
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast harus digunakan di dalam ToastProvider.');
  }
  return ctx;
}
