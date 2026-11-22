import type { AuditAction, EnforcementActionType, ReportStatus } from '@/types';

const wibDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const headerTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const headerDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function formatWibDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${wibDateTimeFormatter.format(date)} WIB`;
}

export function formatHeaderClock(now = new Date()): string {
  return `${headerTimeFormatter.format(now)} - ${headerDateFormatter.format(now)}`;
}

export function formatRelativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Baru saja';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export const REPORT_STATUS_META: Record<
  ReportStatus,
  { label: string; shortLabel: string; badgeClass: string; dotClass: string }
> = {
  NEED_ACTION: {
    label: 'Perlu Ditindak',
    shortLabel: 'Perlu Ditindak',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-600',
  },
  NEEDS_REVISION: {
    label: 'Perlu Revisi',
    shortLabel: 'Perlu Revisi',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  PENDING_VALIDATION: {
    label: 'Menunggu Validasi Dinas',
    shortLabel: 'Menunggu Validasi',
    badgeClass: 'bg-blue-50 text-primary border-accent',
    dotClass: 'bg-primary',
  },
  VALIDATED: {
    label: 'Tervalidasi',
    shortLabel: 'Tervalidasi',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-600',
  },
};

export const ENFORCEMENT_ACTION_LABELS: Record<EnforcementActionType, string> = {
  EDUCATION_WARNING: 'Edukasi & Himbauan',
  ADMINISTRATIVE_ACTION: 'Penertiban Administratif',
  RELOCATION_ASSISTANCE: 'Pendampingan Relokasi',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  REPORT_CREATED: 'Laporan Pelanggaran Dibuat',
  INCIDENT_ESCALATED: 'Eskalasi Insiden (Penambahan PKL)',
  MANUAL_EVIDENCE_UPDATED: 'Bukti Manual Diperbarui',
  ACTION_SUBMITTED: 'Hasil Penindakan Dikirim Satpol PP',
  REVISION_REQUESTED: 'Permintaan Revisi dari Dinas',
  REVISION_SUBMITTED: 'Revisi Bukti Dikirim Ulang',
  REPORT_VALIDATED: 'Laporan Divalidasi Dinas',
  RELOCATION_ASSIGNED: 'Lokasi Binaan Relokasi Ditetapkan',
};

export function formatSlaDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '-';
  const diffMin = Math.max(
    1,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000),
  );
  if (diffMin < 60) return `${diffMin} menit`;
  const hours = Math.floor(diffMin / 60);
  const rem = diffMin % 60;
  return rem === 0 ? `${hours} jam` : `${hours} jam ${rem} mnt`;
}
