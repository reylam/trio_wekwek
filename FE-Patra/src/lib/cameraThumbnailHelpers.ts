export const FAILED_CACHE_TTL_MS = 60_000;
export const MAX_THUMBNAIL_CACHE_ENTRIES = 60;

// Reactive session-level set of camera IDs confirmed offline / 404 so UI grids hide them automatically.
let unavailableCameraIds = new Set<string>();
const unavailableListeners = new Set<() => void>();

function notifyUnavailableListeners(): void {
  for (const listener of unavailableListeners) {
    listener();
  }
}

export function isFatalHttpStatus(code?: number): boolean {
  return typeof code === 'number' && Number.isFinite(code) && code >= 400;
}

export function markCameraUnavailable(cameraId: string): void {
  const id = cameraId.trim();
  if (!id || unavailableCameraIds.has(id)) return;
  const next = new Set(unavailableCameraIds);
  next.add(id);
  unavailableCameraIds = next;
  notifyUnavailableListeners();
}

export function clearUnavailableCameras(): void {
  if (unavailableCameraIds.size === 0) return;
  unavailableCameraIds = new Set<string>();
  notifyUnavailableListeners();
}

export function getUnavailableCameraIdsSnapshot(): ReadonlySet<string> {
  return unavailableCameraIds;
}

export function subscribeUnavailableCameras(listener: () => void): () => void {
  unavailableListeners.add(listener);
  return () => {
    unavailableListeners.delete(listener);
  };
}

export type ThumbnailGrabStrategy =
  | {
      canGrab: true;
      startWithCors: boolean;
      sourceUrl: string;
    }
  | {
      canGrab: false;
      reason: 'NO_SOURCE' | 'UNSUPPORTED_STREAM' | 'MIXED_CONTENT';
    };

/**
 * Inserts or refreshes a bounded cache entry and evicts oldest keys beyond `maxEntries`.
 */
export function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries = MAX_THUMBNAIL_CACHE_ENTRIES,
): void {
  const limit = Math.max(1, Math.floor(maxEntries));
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

/**
 * Returns true if a failed thumbnail attempt is still within its cooldown TTL;
 * evicts expired or corrupted timestamps so the thumbnail can retry automatically.
 */
export function isThumbnailFailureFresh(
  failedCache: Map<string, number>,
  cameraId: string,
  nowMs = Date.now(),
  ttlMs = FAILED_CACHE_TTL_MS,
): boolean {
  const failedAt = failedCache.get(cameraId);
  if (failedAt === undefined) return false;
  if (
    !Number.isFinite(failedAt) ||
    failedAt <= 0 ||
    !Number.isFinite(nowMs) ||
    nowMs < failedAt ||
    nowMs - failedAt >= ttlMs
  ) {
    failedCache.delete(cameraId);
    return false;
  }
  return true;
}

const SAME_ORIGIN_HLS_PROXIES: ReadonlyArray<{
  host: string;
  prefix: string;
}> = [
  {
    host: 'restreamer.magelangkota.go.id',
    prefix: '/hls-proxy/magelang-restreamer',
  },
];

// Host yang terverifikasi mengirim `Access-Control-Allow-Origin: *` penuh (m3u8 + segmen .ts)
const VERIFIED_CORS_ALLOWED_HOSTS = new Set<string>([
  'dev.cctv.magelangkota.go.id',
]);

export interface ResolvedHlsUrl {
  url: string;
  proxied: boolean;
  corsSafeHost: boolean;
}

/**
 * Mengubah URL stream HLS dari host Pemda yang memblokir CORS (mis. restreamer Magelang)
 * ke rute same-origin proxy (`/hls-proxy/...`) agar `hls.js` dan kanvas YOLO AI berjalan mulus.
 */
export function resolveHlsPlaybackUrl(rawUrl: string): ResolvedHlsUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: '', proxied: false, corsSafeHost: false };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    for (const entry of SAME_ORIGIN_HLS_PROXIES) {
      if (host === entry.host) {
        return {
          url: `${entry.prefix}${parsed.pathname}${parsed.search}`,
          proxied: true,
          corsSafeHost: true,
        };
      }
    }

    if (VERIFIED_CORS_ALLOWED_HOSTS.has(host)) {
      return {
        url: trimmed,
        proxied: false,
        corsSafeHost: true,
      };
    }
  } catch {
    // URL relatif atau tidak valid — kembalikan apa adanya
  }

  return {
    url: trimmed,
    proxied: trimmed.startsWith('/hls-proxy/'),
    corsSafeHost: trimmed.startsWith('/hls-proxy/'),
  };
}

/**
 * Resolves how `CameraThumbnail` should connect to a camera stream, allowing
 * `needsCorsProxy` cameras to start in non-CORS paused-frame mode instead of skipping,
 * and routing CORS-blocked Magelang restreamer feeds through the same-origin HLS proxy.
 */
export function resolveThumbnailGrabStrategy(
  camera: {
    playbackUrl?: string;
    streamUrl: string;
    streamType: string;
    needsCorsProxy?: boolean;
  },
  pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:',
): ThumbnailGrabStrategy {
  const rawSourceUrl = (camera.playbackUrl || camera.streamUrl || '').trim();
  if (!rawSourceUrl) {
    return { canGrab: false, reason: 'NO_SOURCE' };
  }
  if (camera.streamType !== 'hls') {
    return { canGrab: false, reason: 'UNSUPPORTED_STREAM' };
  }

  const resolved = resolveHlsPlaybackUrl(rawSourceUrl);
  if (!resolved.proxied && pageProtocol === 'https:' && resolved.url.startsWith('http://')) {
    return { canGrab: false, reason: 'MIXED_CONTENT' };
  }

  return {
    canGrab: true,
    startWithCors: resolved.proxied || resolved.corsSafeHost || !camera.needsCorsProxy,
    sourceUrl: resolved.url,
  };
}

export interface PaginatedSlice<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Slices a list deterministically for client-side pagination with safe bounds.
 */
export function paginateList<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): PaginatedSlice<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 1;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const rawPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const currentPage = Math.min(totalPages, Math.max(1, rawPage));
  const offset = (currentPage - 1) * safePageSize;
  const slice = items.slice(offset, offset + safePageSize);

  return {
    items: slice,
    currentPage,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : offset + 1,
    endIndex: offset + slice.length,
  };
}

export interface CctvListViewState {
  regionId: string;
  page: number;
  searchQuery: string;
  selectedDistrict: string;
  scrollY: number;
}

export interface ParsedCctvListParams {
  hasParams: boolean;
  page: number;
  searchQuery: string;
  selectedDistrict: string;
}

let savedCctvListState: CctvListViewState | null = null;

/**
 * Menormalkan nomor halaman daftar CCTV menjadi bilangan bulat >= 1.
 */
export function sanitizeCctvPage(raw: unknown): number {
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(num) || num < 1) {
    return 1;
  }
  return Math.floor(num);
}

export function parseCctvListSearchParams(params: URLSearchParams): ParsedCctvListParams {
  const hasParams = params.has('page') || params.has('q') || params.has('district');
  return {
    hasParams,
    page: sanitizeCctvPage(params.get('page')),
    searchQuery: params.get('q') ?? '',
    selectedDistrict: params.get('district') ?? '',
  };
}

export function buildCctvListSearchParams(state: {
  page: number;
  searchQuery: string;
  selectedDistrict: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  const safePage = sanitizeCctvPage(state.page);
  if (safePage > 1) {
    params.set('page', String(safePage));
  }
  const q = state.searchQuery.trim();
  if (q) {
    params.set('q', q);
  }
  const district = state.selectedDistrict.trim();
  if (district) {
    params.set('district', district);
  }
  return params;
}

export function buildCctvListUrl(state: {
  page: number;
  searchQuery: string;
  selectedDistrict: string;
}): string {
  const qs = buildCctvListSearchParams(state).toString();
  return qs ? `/satpol/cctv?${qs}` : '/satpol/cctv';
}

export function saveCctvListViewState(state: CctvListViewState): void {
  savedCctvListState = {
    regionId: state.regionId,
    page: sanitizeCctvPage(state.page),
    searchQuery: state.searchQuery,
    selectedDistrict: state.selectedDistrict,
    scrollY: Number.isFinite(state.scrollY) && state.scrollY > 0 ? Math.round(state.scrollY) : 0,
  };
}

export function getSavedCctvListViewState(regionId?: string | null): CctvListViewState | null {
  if (!savedCctvListState) return null;
  if (regionId && savedCctvListState.regionId !== regionId) {
    return null;
  }
  return { ...savedCctvListState };
}

export function consumeSavedCctvScrollY(regionId?: string | null): number | null {
  if (!savedCctvListState) return null;
  if (regionId && savedCctvListState.regionId !== regionId) {
    return null;
  }
  if (savedCctvListState.scrollY <= 0) {
    return null;
  }
  const y = savedCctvListState.scrollY;
  savedCctvListState = { ...savedCctvListState, scrollY: 0 };
  return y;
}

export function clearSavedCctvListViewState(): void {
  savedCctvListState = null;
}

const SAFE_CCTV_LIST_PATH_RE = /^\/satpol\/cctv(\?[^#]*)?$/;

/**
 * Memvalidasi path kembali ke daftar CCTV agar tidak menerima URL eksternal / route lain.
 */
export function resolveCctvReturnPath(
  candidateReturnTo: unknown,
  savedState?: CctvListViewState | null,
): string {
  if (typeof candidateReturnTo === 'string' && SAFE_CCTV_LIST_PATH_RE.test(candidateReturnTo)) {
    return candidateReturnTo;
  }
  if (savedState) {
    return buildCctvListUrl(savedState);
  }
  return '/satpol/cctv';
}
