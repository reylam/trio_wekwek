import type { GeoLngLat, PublicAuditFeedItemDto } from '@/types';

/**
 * Menormalkan parameter kota untuk query /api/public/*.
 * Nilai kosong, "all", atau "Semua Kota" dikembalikan sebagai undefined (lintas semua kota).
 */
export function normalizeCityParam(
  city: string | null | undefined,
): string | undefined {
  const trimmed = city?.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === 'all' || lower === 'semua kota') {
    return undefined;
  }
  return trimmed;
}

/**
 * Mengonversi array titik GeoJSON [lng, lat] menjadi tuple Leaflet [lat, lng].
 * Titik tidak valid diabaikan; poligon dengan < 3 titik valid mengembalikan [].
 */
export function toLeafletPolygonLatLngs(
  points: GeoLngLat[] | null | undefined,
): [number, number][] {
  if (!Array.isArray(points) || points.length < 3) return [];

  const valid: [number, number][] = [];
  for (const pt of points) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      continue;
    }
    valid.push([lat, lng]);
  }

  return valid.length >= 3 ? valid : [];
}

export type AuditStageState = 'done' | 'active' | 'revision' | 'pending';

export interface PublicAuditStageView {
  key: 'detect' | 'action' | 'validate';
  label: string;
  state: AuditStageState;
  timestamp: string | null;
}

/**
 * Menghasilkan 3 tahap akuntabilitas SDG 16 untuk kartu Public Audit Feed.
 */
export function buildPublicAuditStages(
  item: PublicAuditFeedItemDto,
): PublicAuditStageView[] {
  const hasAction = Boolean(item.actionSubmittedAt);
  const isValidated = item.status === 'VALIDATED';
  const isRevision = item.status === 'NEEDS_REVISION';

  let actionState: AuditStageState = 'active';
  if (isValidated || item.status === 'PENDING_VALIDATION') {
    actionState = 'done';
  } else if (isRevision) {
    actionState = 'active';
  }

  let validateState: AuditStageState = 'pending';
  if (isValidated) {
    validateState = 'done';
  } else if (isRevision) {
    validateState = 'revision';
  } else if (item.status === 'PENDING_VALIDATION') {
    validateState = 'active';
  }

  return [
    {
      key: 'detect',
      label: 'Deteksi AI',
      state: 'done',
      timestamp: item.detectedAt,
    },
    {
      key: 'action',
      label: hasAction ? 'Penindakan Satpol PP' : 'Menunggu Satpol PP',
      state: actionState,
      timestamp: item.actionSubmittedAt,
    },
    {
      key: 'validate',
      label: isRevision
        ? 'Perlu Revisi Bukti'
        : isValidated
          ? 'Tervalidasi Dinas'
          : 'Validasi Dinas UMKM',
      state: validateState,
      timestamp: item.validatedAt,
    },
  ];
}

const FORBIDDEN_PHOTO_KEYS = new Set(['beforeImageUrl', 'afterImageUrl']);

/**
 * Memeriksa secara rekursif apakah payload publik membocorkan URL foto mentah.
 */
export function containsPublicPhotoLeak(payload: unknown): boolean {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return false;
  }

  if (Array.isArray(payload)) {
    return payload.some((entry) => containsPublicPhotoLeak(entry));
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (FORBIDDEN_PHOTO_KEYS.has(key)) {
      return true;
    }
    if (containsPublicPhotoLeak(value)) {
      return true;
    }
  }
  return false;
}
