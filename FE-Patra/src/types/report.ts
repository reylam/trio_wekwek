import type {
  AuditAction,
  EnforcementActionType,
  ReportSource,
  ReportStatus,
} from './common';
import type { NearestRelocationSiteDto } from './relocation';

export type AutoDetectOutcome =
  | 'CREATED'
  | 'MERGED_ESCALATED'
  | 'MERGED_NOOP'
  | 'COOLDOWN_SUPPRESSED';

export interface AutoDetectPayload {
  cameraId: string;
  source: ReportSource;
  currentActiveViolators: number;
  maxConfidence: number;
  isSimulationMode: boolean;
}

export interface AutoDetectResponseData {
  outcome: AutoDetectOutcome;
  merged: boolean;
  escalated: boolean;
  suppressedByCooldown: boolean;
  cooldownRemainingSec?: number;
  report?: {
    id: string;
    reportCode: string;
    cameraId: string;
    status: ReportStatus;
    detectedCount: number;
    beforeImageUrl: string;
    createdAt: string;
  };
}

export interface SubmitReportActionPayload {
  actionType: EnforcementActionType;
  actualPklCount: number;
  educationNotes: string;
  relocationRequested: boolean;
}

export type ValidateReportPayload =
  | { decision: 'APPROVE' }
  | { decision: 'REQUEST_REVISION'; revisionReason: string };

export interface AssignRelocationPayload {
  relocationSiteId: string;
}

export interface AuditLogDto {
  id: string;
  reportId: string;
  actorId: string | null;
  actorRole: string;
  actorName: string;
  action: AuditAction;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ViolationReportDto {
  id: string;
  reportCode: string;
  regionId: string;
  cameraId: string;
  zoneId: string | null;
  source: ReportSource;
  status: ReportStatus;
  address: string;
  lat: number;
  lng: number;
  detectedCount: number;
  maxConfidence: number;
  beforeImageUrl: string;
  isSimulationMode: boolean;
  afterImageUrl: string | null;
  actionType: EnforcementActionType | null;
  actualPklCount: number | null;
  educationNotes: string | null;
  relocationRequested: boolean;
  actionByUserId: string | null;
  actionSubmittedAt: string | null;
  validatedByUserId: string | null;
  validatedAt: string | null;
  revisionReason: string | null;
  relocationSiteId: string | null;
  relocationAssignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationReportDetailDto extends ViolationReportDto {
  cameraName?: string;
  zoneName?: string | null;
  relocationSiteName?: string | null;
  auditLogs: AuditLogDto[];
  nearestRelocationSites: NearestRelocationSiteDto[];
}
