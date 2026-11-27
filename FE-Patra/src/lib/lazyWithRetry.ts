import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_STORAGE_KEY = 'patra_chunk_reload_at';
const RELOAD_GUARD_WINDOW_MS = 15_000;

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /loading chunk [\w-]+ failed/i,
  /loading css chunk [\w-]+ failed/i,
  /unable to preload css/i,
  /chunkloaderror/i,
];

/**
 * Mendeteksi error kegagalan memuat chunk/modul dinamis (biasanya terjadi saat
 * deploy baru mengganti hash berkas di `/assets/` sementara tab masih memakai index lama).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error);

  const combined = `${name} ${message}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
}

export interface ChunkReloadOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
  reload?: () => void;
  guardWindowMs?: number;
}

function getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Memicu reload halaman maksimal 1 kali dalam rentang waktu guard agar browser
 * mengambil `index.html` & daftar hash chunk terbaru tanpa risiko infinite reload loop.
 */
export function triggerChunkRecoveryReload(options: ChunkReloadOptions = {}): boolean {
  const storage = options.storage !== undefined ? options.storage : getDefaultStorage();
  const nowMs = (options.now ?? Date.now)();
  const guardWindowMs = options.guardWindowMs ?? RELOAD_GUARD_WINDOW_MS;

  try {
    const lastRaw = storage?.getItem(RELOAD_STORAGE_KEY);
    if (lastRaw) {
      const lastTs = Number(lastRaw);
      if (Number.isFinite(lastTs) && nowMs >= lastTs && nowMs - lastTs < guardWindowMs) {
        return false;
      }
    }
    storage?.setItem(RELOAD_STORAGE_KEY, String(nowMs));
  } catch {
    // Tetap coba reload jika sessionStorage diblokir mode privasi
  }

  if (options.reload) {
    options.reload();
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
  return true;
}

export function clearChunkRecoveryReloadFlag(
  storage: Pick<Storage, 'removeItem'> | null = getDefaultStorage(),
): void {
  try {
    storage?.removeItem(RELOAD_STORAGE_KEY);
  } catch {
    // Abaikan jika storage tidak tersedia
  }
}

export interface LazyRetryOptions extends ChunkReloadOptions {
  retryDelayMs?: number;
  maxRetries?: number;
}

/**
 * Pembungkus `React.lazy` tahan banting untuk seluruh halaman/komponen dinamis:
 * 1. Mencoba ulang import saat gangguan jaringan sesaat.
 * 2. Jika gagal karena stale chunk pasca-deploy, otomatis me-reload halaman 1x.
 * 3. Jika tetap gagal (mis. offline), meneruskan error ke ErrorBoundary.
 */
export async function importWithRetry<T>(
  importer: () => Promise<T>,
  options: LazyRetryOptions = {},
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? 1);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 350);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const mod = await importer();
      return mod;
    } catch (err) {
      lastError = err;
      if (!isChunkLoadError(err)) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  const reloaded = triggerChunkRecoveryReload(options);
  if (reloaded) {
    // Tahan promise sementara browser memuat ulang halaman agar ErrorBoundary tidak berkedip
    return new Promise<T>(() => {});
  }

  throw lastError;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options?: LazyRetryOptions,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(importer, options));
}
