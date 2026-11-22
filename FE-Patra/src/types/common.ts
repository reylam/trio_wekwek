export const USER_ROLES = ['SATPOL_PP', 'DINAS_UMKM'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STREAM_TYPES = ['hls', 'mjpeg', 'mp4'] as const;
export type StreamType = (typeof STREAM_TYPES)[number];

export const REPORT_SOURCES = ['AUTO_AI', 'MANUAL'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const REPORT_STATUSES = [
  'NEED_ACTION',
  'PENDING_VALIDATION',
  'NEEDS_REVISION',
  'VALIDATED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ENFORCEMENT_ACTION_TYPES = [
  'EDUCATION_WARNING',
  'ADMINISTRATIVE_ACTION',
  'RELOCATION_ASSISTANCE',
] as const;
export type EnforcementActionType = (typeof ENFORCEMENT_ACTION_TYPES)[number];

export const AUDIT_ACTIONS = [
  'REPORT_CREATED',
  'INCIDENT_ESCALATED',
  'MANUAL_EVIDENCE_UPDATED',
  'ACTION_SUBMITTED',
  'REVISION_REQUESTED',
  'REVISION_SUBMITTED',
  'REPORT_VALIDATED',
  'RELOCATION_ASSIGNED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type GeoLngLat = [number, number];

export interface ApiSuccessResponse<T, M = Record<string, unknown>> {
  ok: true;
  data: T;
  meta?: M;
}

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export interface RegionDto {
  id: string;
  code: string;
  city: string;
  province: string;
  island?: string;
  satpolAgencyName: string;
  umkmAgencyName: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
}
