export const MODEL_STRIDE = 32;

export interface ModelSidecarMeta {
  dims: { w: number; h: number } | null;
  version: string | null;
}

export interface ModelFetchPlan {
  url: string;
  cache: RequestCache;
}

export function isValidModelDim(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v % MODEL_STRIDE === 0;
}

/**
 * Validasi token versi dari sidecar JSON agar aman disematkan sebagai query string `?v=`.
 */
export function sanitizeModelVersion(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return /^[a-zA-Z0-9._-]{4,64}$/.test(trimmed) ? trimmed : null;
}

export function parseModelSidecarMeta(payload: unknown): ModelSidecarMeta {
  if (!payload || typeof payload !== 'object') {
    return { dims: null, version: null };
  }
  const obj = payload as {
    input?: { height?: unknown; width?: unknown };
    version?: unknown;
  };
  const h = obj.input?.height;
  const w = obj.input?.width;
  const dims = isValidModelDim(h) && isValidModelDim(w) ? { w, h } : null;
  const version = sanitizeModelVersion(obj.version);
  return { dims, version };
}

/**
 * Jika sidecar memiliki `version`, gunakan `?v=<version>` + `force-cache` agar kunjungan ulang
 * 0 byte dari cache browser sambil langsung memutus cache lama `best.onnx`.
 */
export function resolveModelFetchPlan(baseUrl: string, version?: unknown): ModelFetchPlan {
  const safeVersion = sanitizeModelVersion(version);
  if (!safeVersion) {
    return { url: baseUrl, cache: 'no-cache' };
  }
  const separator = baseUrl.includes('?') ? '&' : '?';
  return {
    url: `${baseUrl}${separator}v=${safeVersion}`,
    cache: 'force-cache',
  };
}
