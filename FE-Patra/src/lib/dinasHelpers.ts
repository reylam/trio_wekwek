import type { CreateRelocationSiteInput } from '@/types';

/**
 * Meng-escape karakter HTML agar teks aman dirender di popup Leaflet.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Memvalidasi alasan penolakan/revisi laporan Dinas UMKM (>= 10 dan <= 1000 karakter).
 */
export function validateRevisionReason(reason: string): {
  valid: boolean;
  trimmed: string;
  error?: string;
} {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return {
      valid: false,
      trimmed,
      error: 'Alasan revisi wajib diisi minimal 10 karakter yang jelas.',
    };
  }
  if (trimmed.length > 1000) {
    return {
      valid: false,
      trimmed,
      error: 'Alasan revisi maksimal 1000 karakter.',
    };
  }
  return { valid: true, trimmed };
}

/**
 * Memecah string tag dipisahkan koma atau baris baru menjadi array unik yang rapi.
 */
export function parseCommaTags(raw: string): string[] {
  const parts = raw
    .split(/[,\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(part);
    }
  }
  return result;
}

export interface RelocationSiteFormDraft {
  name: string;
  address: string;
  lat: number | string;
  lng: number | string;
  tradeCategoriesRaw: string;
  facilitiesRaw: string;
}

/**
 * Memvalidasi input form Lokasi Binaan tanpa kolom kuota sesuai data_contract.md.
 */
export function validateRelocationSiteForm(input: RelocationSiteFormDraft): {
  valid: boolean;
  value?: CreateRelocationSiteInput;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const address = input.address.trim();

  if (name.length < 3) {
    errors.name = 'Nama lokasi binaan minimal 3 karakter.';
  } else if (name.length > 160) {
    errors.name = 'Nama lokasi binaan maksimal 160 karakter.';
  }

  if (address.length < 5) {
    errors.address = 'Alamat lengkap minimal 5 karakter.';
  } else if (address.length > 300) {
    errors.address = 'Alamat lengkap maksimal 300 karakter.';
  }

  const latStr = typeof input.lat === 'string' ? input.lat.trim() : String(input.lat);
  const lngStr = typeof input.lng === 'string' ? input.lng.trim() : String(input.lng);
  const lat = latStr === '' ? Number.NaN : Number(latStr);
  const lng = lngStr === '' ? Number.NaN : Number(lngStr);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.lat = 'Latitude harus berupa angka valid antara -90 hingga 90.';
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.lng = 'Longitude harus berupa angka valid antara -180 hingga 180.';
  }

  const tradeCategories = parseCommaTags(input.tradeCategoriesRaw);
  if (tradeCategories.length === 0) {
    errors.tradeCategories = 'Isi minimal 1 kategori dagangan (pisahkan dengan koma).';
  }

  const facilities = parseCommaTags(input.facilitiesRaw);
  if (facilities.length === 0) {
    errors.facilities = 'Isi minimal 1 fasilitas lokasi binaan (pisahkan dengan koma).';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      name,
      address,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      tradeCategories,
      facilities,
    },
    errors: {},
  };
}

/**
 * Mengambil nama berkas PDF yang aman dari header Content-Disposition.
 */
export function extractPdfFilename(
  contentDisposition: string | null,
  fallbackReportCode: string,
): string {
  const safeCode = fallbackReportCode.replace(/[^a-zA-Z0-9_-]/g, '') || 'LAPORAN';
  const fallback = `Berita-Acara-PATRA-${safeCode}.pdf`;
  if (!contentDisposition) return fallback;

  const quotedMatch = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(contentDisposition);
  if (!quotedMatch?.[1]) return fallback;

  const rawName = decodeURIComponentSafe(quotedMatch[1].trim());
  const basename = rawName.split(/[\\/]/).pop()?.trim() ?? '';
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return fallback;
  }
  return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Memformat metrik rata-rata SLA penanganan (menit) untuk kartu KPI Dinas UMKM.
 */
export function formatKpiSla(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '-';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} mnt`;
  const hours = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem === 0 ? `${hours} jam` : `${hours}j ${rem}m`;
}

/**
 * Menghitung radius circleMarker Leaflet berdasarkan bobot titik pelanggaran valid.
 */
export function computeHotspotRadius(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 9;
  const scaled = 9 + Math.sqrt(weight) * 4;
  return Math.min(24, Math.max(9, Math.round(scaled)));
}
