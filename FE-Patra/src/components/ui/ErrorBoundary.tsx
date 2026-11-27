import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import {
  clearChunkRecoveryReloadFlag,
  isChunkLoadError,
  triggerChunkRecoveryReload,
} from '@/lib/lazyWithRetry';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
  isChunkError: boolean;
}

/**
 * Penangkap error global agar kegagalan render mendadak (termasuk kegagalan muat
 * modul dinamis pasca deploy) tidak menimbulkan layar putih kosong.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    isChunkError: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const chunkError = isChunkLoadError(error);
    return {
      hasError: true,
      errorMessage: error.message || 'Terjadi gangguan tak terduga pada antarmuka.',
      isChunkError: chunkError,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PATRA ErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error)) {
      triggerChunkRecoveryReload();
    }
  }

  private handleForceReload = () => {
    clearChunkRecoveryReloadFlag();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-accent/60 bg-white p-7 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-extrabold text-primary">
            {this.state.isChunkError
              ? 'Pembaruan Aplikasi Tersedia'
              : 'Terjadi Kendala Saat Memuat Halaman'}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            {this.state.isChunkError
              ? 'Versi terbaru PATRA baru saja diterapkan sehingga sebagian berkas lama sudah terganti. Muat ulang halaman untuk melanjutkan dengan versi terbaru.'
              : 'Sistem memulihkan tampilan secara otomatis. Muat ulang halaman atau kembali ke Portal Publik PATRA.'}
          </p>
          {this.state.errorMessage && !this.state.isChunkError && (
            <p className="mt-3 break-words rounded-xl bg-canvas px-3 py-2 font-mono text-[11px] text-slate-500">
              {this.state.errorMessage}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={this.handleForceReload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/90"
            >
              <RotateCw className="h-4 w-4" />
              <span>Muat Ulang Halaman</span>
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Home className="h-4 w-4" />
              <span>Kembali ke Beranda</span>
            </a>
          </div>
        </div>
      </main>
    );
  }
}
