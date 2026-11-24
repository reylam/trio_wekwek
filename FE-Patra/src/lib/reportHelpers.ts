import type { ReportStatus, ViolationReportDto } from '@/types';

export interface ReportStatusCounts {
  all: number;
  NEED_ACTION: number;
  PENDING_VALIDATION: number;
  NEEDS_REVISION: number;
  VALIDATED: number;
}

/**
 * Menghitung ringkasan jumlah laporan per status dalam 1 kali iterasi.
 */
export function computeReportCounts(
  reports: ReadonlyArray<Pick<ViolationReportDto, 'status'>>,
): ReportStatusCounts {
  const counts: ReportStatusCounts = {
    all: reports.length,
    NEED_ACTION: 0,
    PENDING_VALIDATION: 0,
    NEEDS_REVISION: 0,
    VALIDATED: 0,
  };

  for (const rep of reports) {
    if (rep.status in counts) {
      counts[rep.status as ReportStatus] += 1;
    }
  }

  return counts;
}

export function formatCompactMinutes(minutes: number): string {
  const safeMin = Math.max(1, Math.round(minutes));
  if (safeMin < 60) return `${safeMin}m`;
  const hours = Math.floor(safeMin / 60);
  const rem = safeMin % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export type DurationTone = 'overdue' | 'due_soon' | 'on_track' | 'resolved';

/**
 * Menghasilkan label durasi/SLA untuk kolom Duration di Reports & Actions.
 */
export function computeDurationDisplay(
  report: Pick<ViolationReportDto, 'status' | 'createdAt' | 'actionSubmittedAt'>,
  nowMs = Date.now(),
): { label: string; tone: DurationTone } {
  const createdMs = new Date(report.createdAt).getTime();
  if (Number.isNaN(createdMs)) {
    return { label: '-', tone: 'on_track' };
  }

  if (report.status === 'VALIDATED' || report.status === 'PENDING_VALIDATION') {
    const endMs = report.actionSubmittedAt
      ? new Date(report.actionSubmittedAt).getTime()
      : nowMs;
    const validEndMs = Number.isNaN(endMs) ? nowMs : endMs;
    const diffMin = Math.max(1, Math.round((validEndMs - createdMs) / 60_000));
    const dur = formatCompactMinutes(diffMin);
    return {
      label: report.status === 'VALIDATED' ? `Resolved in ${dur}` : `Handled in ${dur}`,
      tone: 'resolved',
    };
  }

  const elapsedMin = Math.max(1, Math.round((nowMs - createdMs) / 60_000));
  const dur = formatCompactMinutes(elapsedMin);

  if (elapsedMin <= 45) {
    return { label: `On Track ${dur}`, tone: 'on_track' };
  }
  if (elapsedMin <= 60) {
    return { label: `Due Soon ${dur}`, tone: 'due_soon' };
  }
  return { label: `Overdue ${dur}`, tone: 'overdue' };
}

/**
 * Membangun URL rute Google Maps yang aman untuk koordinat valid.
 */
export function buildGoogleMapsRouteUrl(lat: number, lng: number): string | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

/**
 * Menghasilkan item pagination ringkas (contoh: [1, 2, 'ellipsis', 6, 7]).
 */
export function buildPaginationItems(
  currentPage: number,
  totalPages: number,
): Array<number | 'ellipsis'> {
  if (!Number.isFinite(totalPages) || totalPages <= 1) {
    return totalPages === 1 ? [1] : [];
  }

  const total = Math.floor(totalPages);
  const current = Math.max(1, Math.min(total, Math.floor(currentPage)));

  if (total <= 5) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }

  const items: Array<number | 'ellipsis'> = [1];

  if (current <= 3) {
    items.push(2, 3, 'ellipsis', total - 1, total);
    return items;
  }

  if (current >= total - 2) {
    items.push(2, 'ellipsis', total - 2, total - 1, total);
    return items;
  }

  items.push('ellipsis', current - 1, current, current + 1, 'ellipsis', total);
  return items;
}
