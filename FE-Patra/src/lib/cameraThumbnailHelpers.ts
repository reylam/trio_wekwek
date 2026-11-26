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

/**
 * Resolves how `CameraThumbnail` should connect to a camera stream, allowing
 * `needsCorsProxy` cameras to start in non-CORS paused-frame mode instead of skipping.
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
  const sourceUrl = (camera.playbackUrl || camera.streamUrl || '').trim();
  if (!sourceUrl) {
    return { canGrab: false, reason: 'NO_SOURCE' };
  }
  if (camera.streamType !== 'hls') {
    return { canGrab: false, reason: 'UNSUPPORTED_STREAM' };
  }
  if (pageProtocol === 'https:' && sourceUrl.startsWith('http://')) {
    return { canGrab: false, reason: 'MIXED_CONTENT' };
  }
  return {
    canGrab: true,
    startWithCors: !camera.needsCorsProxy,
    sourceUrl,
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
