import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';
import type {
  AuditAction,
  EnforcementActionType,
  GeoLngLat,
  ListReportsQuery,
  PatrolTeamDto,
  RelocationAllocationDto,
  RelocationMatchStatus,
  ReportSource,
  ReportStatus,
} from '../interface/index.js';
import { aggregatePendingCapacity } from '../service/geo.service.js';

export interface CameraLookupRecord {
  id: string;
  regionId: string;
  name: string;
  regionLabel: string;
  district: string | null;
  lat: number;
  lng: number;
  isActive: boolean;
}

export interface ActiveZoneRecord {
  id: string;
  points: GeoLngLat[];
}

export interface ActiveRelocationSiteRecord {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
  maxCapacity: number;
  occupiedCapacity: number;
  pendingCapacity: number;
}

export interface AuditLogRecord {
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
  createdAt: Date;
}

export interface ReportRecord {
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
  actionSubmittedAt: Date | null;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  revisionReason: string | null;
  recommendedRelocationSiteId: string | null;
  relocationSiteId: string | null;
  relocationMatchStatus: RelocationMatchStatus | null;
  unaccommodatedPklCount: number;
  relocationCapacityCommitted: boolean;
  relocationAssignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportDetailRecord extends ReportRecord {
  cameraName?: string;
  cameraDistrict?: string | null;
  zoneName?: string | null;
  assignedTeam?: PatrolTeamDto | null;
  recommendedRelocationSiteName?: string | null;
  relocationSiteName?: string | null;
  relocationAllocations: RelocationAllocationDto[];
  auditLogs: AuditLogRecord[];
}

export interface ReportQueryScope {
  teamId?: string | null;
  allowedDistricts?: string[];
}

export interface CreateReportInputData {
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
  relocationRequested: boolean;
  recommendedRelocationSiteId?: string | null;
  relocationMatchStatus?: RelocationMatchStatus | null;
  unaccommodatedPklCount?: number;
}

export interface UpdateReportBeforeData {
  detectedCount: number;
  maxConfidence: number;
  beforeImageUrl: string;
}

export interface SubmitActionUpdateData {
  status: ReportStatus;
  afterImageUrl: string;
  actionType: EnforcementActionType;
  actualPklCount: number;
  educationNotes: string;
  relocationRequested: boolean;
  actionByUserId: string;
  actionSubmittedAt: Date;
}

export interface ValidateUpdateData {
  status: ReportStatus;
  validatedByUserId?: string;
  validatedAt?: Date;
  revisionReason?: string | null;
}

export interface AssignRelocationUpdateData {
  relocationSiteId: string;
  relocationAssignedAt: Date;
}

export interface RelocationSiteLookupRecord {
  id: string;
  regionId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
  maxCapacity: number;
  occupiedCapacity: number;
  isActive: boolean;
}

export interface ReportPdfContextRecord extends ReportDetailRecord {
  region: {
    city: string;
    satpolAgencyName: string;
    umkmAgencyName: string;
  };
  relocationSite: RelocationSiteLookupRecord | null;
  actionByUserName: string | null;
  validatedByUserName: string | null;
}

export interface CreateAuditLogInputData {
  actorId: string | null;
  actorRole: string;
  actorName: string;
  action: AuditAction;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  note: string | null;
  metadata: Record<string, unknown> | null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function mapPrismaReport(row: Prisma.ViolationReportGetPayload<object>): ReportRecord {
  return {
    id: row.id,
    reportCode: row.reportCode,
    regionId: row.regionId,
    cameraId: row.cameraId,
    zoneId: row.zoneId,
    assignedTeamId: row.assignedTeamId,
    source: row.source as ReportSource,
    status: row.status as ReportStatus,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    detectedCount: row.detectedCount,
    maxConfidence: row.maxConfidence,
    beforeImageUrl: row.beforeImageUrl,
    isSimulationMode: row.isSimulationMode,
    afterImageUrl: row.afterImageUrl,
    actionType: (row.actionType as EnforcementActionType | null) ?? null,
    actualPklCount: row.actualPklCount,
    educationNotes: row.educationNotes,
    relocationRequested: row.relocationRequested,
    actionByUserId: row.actionByUserId,
    actionSubmittedAt: row.actionSubmittedAt,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt,
    revisionReason: row.revisionReason,
    recommendedRelocationSiteId: row.recommendedRelocationSiteId,
    relocationSiteId: row.relocationSiteId,
    relocationMatchStatus:
      (row.relocationMatchStatus as RelocationMatchStatus | null) ?? null,
    unaccommodatedPklCount: row.unaccommodatedPklCount,
    relocationCapacityCommitted: row.relocationCapacityCommitted,
    relocationAssignedAt: row.relocationAssignedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPrismaAuditLog(row: Prisma.AuditLogGetPayload<object>): AuditLogRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    actorId: row.actorId,
    actorRole: row.actorRole,
    actorName: row.actorName,
    action: row.action as AuditAction,
    fromStatus: (row.fromStatus as ReportStatus | null) ?? null,
    toStatus: row.toStatus as ReportStatus,
    note: row.note,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
  };
}

const detailInclude = {
  camera: { select: { name: true, district: true } },
  zone: { select: { name: true } },
  assignedTeam: {
    select: { id: true, code: true, name: true, assignedDistricts: true },
  },
  recommendedRelocationSite: { select: { name: true } },
  relocationSite: { select: { name: true } },
  relocationAllocations: {
    include: { relocationSite: { select: { name: true } } },
    orderBy: { rankOrder: 'asc' as const },
  },
  auditLogs: { orderBy: { createdAt: 'asc' as const } },
};

type DetailPayload = Prisma.ViolationReportGetPayload<{
  include: typeof detailInclude;
}>;

function mapPrismaDetail(row: DetailPayload): ReportDetailRecord {
  return {
    ...mapPrismaReport(row),
    cameraName: row.camera?.name,
    cameraDistrict: row.camera?.district ?? null,
    zoneName: row.zone?.name ?? null,
    assignedTeam: row.assignedTeam
      ? {
          id: row.assignedTeam.id,
          code: row.assignedTeam.code,
          name: row.assignedTeam.name,
          assignedDistricts: toStringArray(row.assignedTeam.assignedDistricts),
        }
      : null,
    recommendedRelocationSiteName: row.recommendedRelocationSite?.name ?? null,
    relocationSiteName: row.relocationSite?.name ?? null,
    relocationAllocations: row.relocationAllocations.map((a) => ({
      id: a.id,
      relocationSiteId: a.relocationSiteId,
      relocationSiteName: a.relocationSite.name,
      allocatedCount: a.allocatedCount,
      rankOrder: a.rankOrder,
      isRecommended: a.isRecommended,
    })),
    auditLogs: row.auditLogs.map(mapPrismaAuditLog),
  };
}

function buildAuditCreateFields(data: CreateAuditLogInputData) {
  return {
    actorId: data.actorId,
    actorRole: data.actorRole,
    actorName: data.actorName,
    action: data.action,
    fromStatus: data.fromStatus,
    toStatus: data.toStatus,
    note: data.note,
    ...(data.metadata !== null
      ? { metadata: data.metadata as Prisma.InputJsonValue }
      : {}),
  };
}

function isRecordNotFoundError(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 'P2025';
}

/**
 * Guarded update + append AuditLog dalam SATU operasi Prisma (nested write = atomik).
 * - Filter status pada `where` menjamin transisi hanya terjadi bila status masih sesuai (EC-008).
 * - Bila status sudah berubah, Prisma melempar P2025 -> dikembalikan `null` -> service melempar 409.
 * - Tidak memakai interactive transaction (aman untuk Supabase PgBouncer pooler).
 */
async function guardedUpdateWithAudit(
  where: Prisma.ViolationReportWhereUniqueInput,
  data: Prisma.ViolationReportUncheckedUpdateInput,
  auditLogData: CreateAuditLogInputData,
): Promise<ReportDetailRecord | null> {
  const prisma = getPrisma();
  try {
    const row = await prisma.violationReport.update({
      where,
      data: {
        ...data,
        auditLogs: {
          create: buildAuditCreateFields(auditLogData),
        },
      },
      include: detailInclude,
    });
    return mapPrismaDetail(row);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

const relocationSiteLookupSelect = {
  id: true,
  regionId: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  tradeCategories: true,
  facilities: true,
  maxCapacity: true,
  occupiedCapacity: true,
  isActive: true,
} as const;

function mapRelocationSiteLookup(
  row: Prisma.RelocationSiteGetPayload<{ select: typeof relocationSiteLookupSelect }>,
): RelocationSiteLookupRecord {
  return {
    id: row.id,
    regionId: row.regionId,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    tradeCategories: toStringArray(row.tradeCategories),
    facilities: toStringArray(row.facilities),
    maxCapacity: row.maxCapacity,
    occupiedCapacity: row.occupiedCapacity,
    isActive: row.isActive,
  };
}

export const ReportRepository = {
  async findCameraById(cameraId: string): Promise<CameraLookupRecord | null> {
    const prisma = getPrisma();
    return prisma.cctvCamera.findUnique({
      where: { id: cameraId },
      select: {
        id: true,
        regionId: true,
        name: true,
        regionLabel: true,
        district: true,
        lat: true,
        lng: true,
        isActive: true,
      },
    });
  },

  async findActiveNeedActionByCamera(cameraId: string): Promise<ReportRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.violationReport.findFirst({
      where: { cameraId, status: 'NEED_ACTION' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? mapPrismaReport(row) : null;
  },

  async findLatestActionSubmittedAtByCamera(cameraId: string): Promise<Date | null> {
    const prisma = getPrisma();
    const row = await prisma.violationReport.findFirst({
      where: { cameraId, actionSubmittedAt: { not: null } },
      orderBy: { actionSubmittedAt: 'desc' },
      select: { actionSubmittedAt: true },
    });
    return row?.actionSubmittedAt ?? null;
  },

  async findActiveZonesByRegion(regionId: string): Promise<ActiveZoneRecord[]> {
    const prisma = getPrisma();
    const rows = await prisma.restrictedZone.findMany({
      where: { regionId, isActive: true },
      select: { id: true, points: true },
    });
    return rows.map((r) => ({
      id: r.id,
      points: r.points as unknown as GeoLngLat[],
    }));
  },

  async findActiveRelocationSitesByRegion(
    regionId: string,
  ): Promise<ActiveRelocationSiteRecord[]> {
    const prisma = getPrisma();
    const [rows, pendingRows] = await prisma.$transaction([
      prisma.relocationSite.findMany({
        where: { regionId, isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          lat: true,
          lng: true,
          tradeCategories: true,
          facilities: true,
          maxCapacity: true,
          occupiedCapacity: true,
        },
      }),
      prisma.reportRelocationAllocation.findMany({
        where: {
          report: {
            regionId,
            status: 'PENDING_VALIDATION',
            relocationRequested: true,
            relocationCapacityCommitted: false,
          },
        },
        select: {
          relocationSiteId: true,
          allocatedCount: true,
        },
      }),
    ]);

    const pendingMap = aggregatePendingCapacity(pendingRows);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      tradeCategories: toStringArray(r.tradeCategories),
      facilities: toStringArray(r.facilities),
      maxCapacity: r.maxCapacity,
      occupiedCapacity: r.occupiedCapacity,
      pendingCapacity: pendingMap.get(r.id) ?? 0,
    }));
  },

  async createReportWithAuditLog(
    reportData: CreateReportInputData,
    auditLogData: CreateAuditLogInputData,
  ): Promise<ReportRecord> {
    const prisma = getPrisma();
    const created = await prisma.violationReport.create({
      data: {
        ...reportData,
        auditLogs: {
          create: buildAuditCreateFields(auditLogData),
        },
      },
    });
    return mapPrismaReport(created);
  },

  async updateReportAndAppendAudit(
    reportId: string,
    reportUpdateData: UpdateReportBeforeData,
    auditLogData: CreateAuditLogInputData,
  ): Promise<ReportRecord> {
    const prisma = getPrisma();
    const [updated] = await prisma.$transaction([
      prisma.violationReport.update({
        where: { id: reportId },
        data: reportUpdateData,
      }),
      prisma.auditLog.create({
        data: {
          reportId,
          ...buildAuditCreateFields(auditLogData),
        },
      }),
    ]);
    return mapPrismaReport(updated);
  },

  async findManyByRegion(
    regionId: string,
    query: ListReportsQuery,
    scope?: ReportQueryScope,
  ): Promise<{ reports: ReportRecord[]; totalItems: number }> {
    const prisma = getPrisma();
    const andConditions: Prisma.ViolationReportWhereInput[] = [];

    if (scope?.allowedDistricts && scope.allowedDistricts.length > 0) {
      const districtConditions = scope.allowedDistricts.map((d) => ({
        district: { equals: d, mode: 'insensitive' as const },
      }));
      andConditions.push({
        OR: [
          ...(scope.teamId ? [{ assignedTeamId: scope.teamId }] : []),
          {
            assignedTeamId: null,
            camera: { OR: districtConditions },
          },
        ],
      });
    } else {
      if (query.teamId) {
        andConditions.push({ assignedTeamId: query.teamId });
      }
      if (query.district) {
        andConditions.push({
          camera: { district: { equals: query.district, mode: 'insensitive' } },
        });
      }
    }

    if (query.status && query.status.length > 0) {
      andConditions.push({ status: { in: query.status } });
    }
    if (query.relocationRequested !== undefined) {
      andConditions.push({ relocationRequested: query.relocationRequested });
    }
    if (query.search) {
      andConditions.push({
        OR: [
          { reportCode: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
          { camera: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.ViolationReportWhereInput = {
      regionId,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, totalItems] = await prisma.$transaction([
      prisma.violationReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      prisma.violationReport.count({ where }),
    ]);

    return {
      reports: rows.map(mapPrismaReport),
      totalItems,
    };
  },

  async findDetailById(id: string): Promise<ReportDetailRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.violationReport.findUnique({
      where: { id },
      include: detailInclude,
    });
    return row ? mapPrismaDetail(row) : null;
  },

  async guardedSubmitAction(
    id: string,
    expectedStatuses: ReportStatus[],
    updateData: SubmitActionUpdateData,
    auditLogData: CreateAuditLogInputData,
  ): Promise<ReportDetailRecord | null> {
    return guardedUpdateWithAudit(
      { id, status: { in: expectedStatuses } },
      updateData,
      auditLogData,
    );
  },

  async findRelocationSiteById(id: string): Promise<RelocationSiteLookupRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.relocationSite.findUnique({
      where: { id },
      select: relocationSiteLookupSelect,
    });
    return row ? mapRelocationSiteLookup(row) : null;
  },

  async guardedValidate(
    id: string,
    expectedStatus: ReportStatus,
    updateData: ValidateUpdateData,
    auditLogData: CreateAuditLogInputData,
  ): Promise<ReportDetailRecord | null> {
    return guardedUpdateWithAudit({ id, status: expectedStatus }, updateData, auditLogData);
  },

  async guardedAssignRelocation(
    id: string,
    updateData: AssignRelocationUpdateData,
    auditLogData: CreateAuditLogInputData,
  ): Promise<ReportDetailRecord | null> {
    return guardedUpdateWithAudit(
      {
        id,
        status: 'VALIDATED',
        relocationRequested: true,
        relocationSiteId: null,
      },
      {
        relocationSiteId: updateData.relocationSiteId,
        relocationAssignedAt: updateData.relocationAssignedAt,
      },
      auditLogData,
    );
  },

  async findPdfContextById(id: string): Promise<ReportPdfContextRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.violationReport.findUnique({
      where: { id },
      include: {
        ...detailInclude,
        region: {
          select: { city: true, satpolAgencyName: true, umkmAgencyName: true },
        },
        relocationSite: { select: relocationSiteLookupSelect },
        actionByUser: { select: { fullName: true } },
        validatedByUser: { select: { fullName: true } },
      },
    });
    if (!row) return null;
    return {
      ...mapPrismaDetail(row),
      region: row.region,
      relocationSite: row.relocationSite ? mapRelocationSiteLookup(row.relocationSite) : null,
      actionByUserName: row.actionByUser?.fullName ?? null,
      validatedByUserName: row.validatedByUser?.fullName ?? null,
    };
  },
};

export type ReportRepositoryPort = typeof ReportRepository;
export default ReportRepository;
