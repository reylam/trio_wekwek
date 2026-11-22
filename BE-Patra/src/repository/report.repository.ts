import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';
import type {
  AuditAction,
  EnforcementActionType,
  GeoLngLat,
  ListReportsQuery,
  ReportSource,
  ReportStatus,
} from '../interface/index.js';

export interface CameraLookupRecord {
  id: string;
  regionId: string;
  name: string;
  regionLabel: string;
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
  relocationSiteId: string | null;
  relocationAssignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportDetailRecord extends ReportRecord {
  cameraName?: string;
  zoneName?: string | null;
  relocationSiteName?: string | null;
  auditLogs: AuditLogRecord[];
}

export interface CreateReportInputData {
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
  relocationRequested: boolean;
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

function mapPrismaReport(row: Prisma.ViolationReportGetPayload<object>): ReportRecord {
  return {
    id: row.id,
    reportCode: row.reportCode,
    regionId: row.regionId,
    cameraId: row.cameraId,
    zoneId: row.zoneId,
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
    relocationSiteId: row.relocationSiteId,
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
  camera: { select: { name: true } },
  zone: { select: { name: true } },
  relocationSite: { select: { name: true } },
  auditLogs: { orderBy: { createdAt: 'asc' as const } },
};

type DetailPayload = Prisma.ViolationReportGetPayload<{
  include: typeof detailInclude;
}>;

function mapPrismaDetail(row: DetailPayload): ReportDetailRecord {
  return {
    ...mapPrismaReport(row),
    cameraName: row.camera?.name,
    zoneName: row.zone?.name ?? null,
    relocationSiteName: row.relocationSite?.name ?? null,
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
    const rows = await prisma.relocationSite.findMany({
      where: { regionId, isActive: true },
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        tradeCategories: true,
        facilities: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      tradeCategories: Array.isArray(r.tradeCategories)
        ? (r.tradeCategories as string[])
        : [],
      facilities: Array.isArray(r.facilities) ? (r.facilities as string[]) : [],
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
  ): Promise<{ reports: ReportRecord[]; totalItems: number }> {
    const prisma = getPrisma();
    const where: Prisma.ViolationReportWhereInput = { regionId };

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status };
    }
    if (query.relocationRequested !== undefined) {
      where.relocationRequested = query.relocationRequested;
    }
    if (query.search) {
      where.OR = [
        { reportCode: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
        { camera: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

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
    const prisma = getPrisma();
    const res = await prisma.violationReport.updateMany({
      where: {
        id,
        status: { in: expectedStatuses },
      },
      data: updateData,
    });

    if (res.count === 0) {
      return null;
    }

    const [, detail] = await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          reportId: id,
          ...buildAuditCreateFields(auditLogData),
        },
      }),
      prisma.violationReport.findUnique({
        where: { id },
        include: detailInclude,
      }),
    ]);

    return detail ? mapPrismaDetail(detail) : null;
  },
};

export type ReportRepositoryPort = typeof ReportRepository;
export default ReportRepository;
