import { z } from 'zod';

export const USER_ROLES = ['SATPOL_PP', 'DINAS_UMKM'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const STREAM_TYPES = ['hls', 'mjpeg', 'mp4'] as const;
export type StreamType = (typeof STREAM_TYPES)[number];
export const streamTypeSchema = z.enum(STREAM_TYPES);

export const REPORT_SOURCES = ['AUTO_AI', 'MANUAL'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];
export const reportSourceSchema = z.enum(REPORT_SOURCES);

export const REPORT_STATUSES = [
  'NEED_ACTION',
  'PENDING_VALIDATION',
  'NEEDS_REVISION',
  'VALIDATED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const reportStatusSchema = z.enum(REPORT_STATUSES);

export const ENFORCEMENT_ACTION_TYPES = [
  'EDUCATION_WARNING',
  'ADMINISTRATIVE_ACTION',
  'RELOCATION_ASSISTANCE',
] as const;
export type EnforcementActionType = (typeof ENFORCEMENT_ACTION_TYPES)[number];
export const enforcementActionTypeSchema = z.enum(ENFORCEMENT_ACTION_TYPES);

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
export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export type NormalizedPoint = [number, number];
export type NormalizedPolygon = NormalizedPoint[];

export const normalizedPointSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export const normalizedPolygonSchema = z
  .array(normalizedPointSchema)
  .min(3, 'Poligon ROI minimal memiliki 3 titik ternormalisasi (0..1).');

export type GeoLngLat = [number, number];
export const geoLngLatSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export const geoPolygonPointsSchema = z
  .array(geoLngLatSchema)
  .min(3, 'Poligon zona minimal memiliki 3 titik koordinat [lng, lat].');

export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

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
