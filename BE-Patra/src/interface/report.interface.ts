import { z } from 'zod';
import {
  enforcementActionTypeSchema,
  REPORT_STATUSES,
  reportSourceSchema,
  type AuditAction,
  type EnforcementActionType,
  type PatrolTeamDto,
  type RelocationMatchStatus,
  type ReportSource,
  type ReportStatus,
} from './common.interface.js';
import type { NearestRelocationSiteDto } from './relocation.interface.js';

export type AutoDetectOutcome =
  | 'CREATED'
  | 'MERGED_ESCALATED'
  | 'MERGED_NOOP'
  | 'COOLDOWN_SUPPRESSED';

export const autoDetectPayloadSchema = z.object({
  cameraId: z.string().trim().min(1, 'cameraId wajib diisi.'),
  source: reportSourceSchema.default('AUTO_AI'),
  currentActiveViolators: z
    .number()
    .int('currentActiveViolators harus bilangan bulat.')
    .min(1, 'currentActiveViolators minimal 1.'),
  maxConfidence: z.number().min(0).max(1),
  isSimulationMode: z.boolean().default(false),
});

export type AutoDetectPayload = z.infer<typeof autoDetectPayloadSchema>;

const validStatusSet = new Set<string>(REPORT_STATUSES);

export const listReportsQuerySchema = z.object({
  // Mendukung 1 status atau beberapa status dipisahkan koma (mis. "NEED_ACTION,NEEDS_REVISION")
  status: z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx): ReportStatus[] | undefined => {
      if (!raw) return undefined;
      const parsed = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length === 0) return undefined;
      for (const item of parsed) {
        if (!validStatusSet.has(item)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Status laporan tidak valid: "${item}".`,
          });
          return z.NEVER;
        }
      }
      return parsed as ReportStatus[];
    }),
  relocationRequested: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  teamId: z.string().trim().min(1).max(120).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const relocationAllocationInputSchema = z.object({
  relocationSiteId: z.string().trim().min(1, 'relocationSiteId wajib diisi.'),
  allocatedCount: z
    .number()
    .int('Jumlah PKL alokasi harus bilangan bulat.')
    .min(1, 'Jumlah PKL alokasi minimal 1.')
    .max(5000),
});

export type RelocationAllocationInput = z.infer<typeof relocationAllocationInputSchema>;

export const submitReportActionSchema = z.object({
  actionType: enforcementActionTypeSchema,
  actualPklCount: z
    .number()
    .int('Estimasi jumlah PKL aktual harus bilangan bulat.')
    .min(0, 'Estimasi jumlah PKL aktual minimal 0.'),
  educationNotes: z
    .string()
    .trim()
    .min(5, 'Catatan edukasi minimal 5 karakter.')
    .max(1000),
  relocationRequested: z.boolean().default(false),
  allocations: z.array(relocationAllocationInputSchema).min(1).optional(),
});

export type SubmitReportActionInput = z.infer<typeof submitReportActionSchema>;

export const validateReportSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVE'),
    overrideAllocations: z.array(relocationAllocationInputSchema).min(1).optional(),
  }),
  z.object({
    decision: z.literal('REQUEST_REVISION'),
    revisionReason: z
      .string()
      .trim()
      .min(10, 'Alasan revisi wajib diisi minimal 10 karakter.')
      .max(1000),
  }),
]);

export type ValidateReportInput = z.infer<typeof validateReportSchema>;

export const assignRelocationSchema = z
  .object({
    relocationSiteId: z.string().trim().min(1, 'relocationSiteId wajib diisi.').optional(),
    allocations: z.array(relocationAllocationInputSchema).min(1).optional(),
  })
  .refine(
    (data) => Boolean(data.relocationSiteId) || Boolean(data.allocations?.length),
    {
      message: 'Minimal relocationSiteId atau allocations wajib diisi.',
    },
  );

export type AssignRelocationInput = z.infer<typeof assignRelocationSchema>;

export interface RelocationAllocationDto {
  id: string;
  relocationSiteId: string;
  relocationSiteName: string;
  allocatedCount: number;
  rankOrder: number;
  isRecommended: boolean;
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
  assignedTeamId: string | null;
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
  recommendedRelocationSiteId: string | null;
  relocationSiteId: string | null;
  relocationMatchStatus: RelocationMatchStatus | null;
  unaccommodatedPklCount: number;
  relocationCapacityCommitted: boolean;
  relocationAssignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationReportDetailDto extends ViolationReportDto {
  cameraName?: string;
  zoneName?: string | null;
  assignedTeam?: PatrolTeamDto | null;
  recommendedRelocationSiteName?: string | null;
  relocationSiteName?: string | null;
  relocationAllocations: RelocationAllocationDto[];
  auditLogs: AuditLogDto[];
  nearestRelocationSites: NearestRelocationSiteDto[];
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
    assignedTeamId: string | null;
    status: ReportStatus;
    detectedCount: number;
    beforeImageUrl: string;
    recommendedRelocationSiteId: string | null;
    relocationMatchStatus: RelocationMatchStatus | null;
    unaccommodatedPklCount: number;
    createdAt: string;
  };
}
