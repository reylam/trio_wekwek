import { getPrisma } from '../config/prisma.js';
import type {
  PatrolTeamDto,
  RelocationMatchStatus,
  ReportStatus,
} from '../interface/index.js';
import { aggregatePendingCapacity } from '../service/geo.service.js';

export interface DinasAnalyticsReportRow {
  id: string;
  status: ReportStatus;
  address: string;
  lat: number;
  lng: number;
  detectedCount: number;
  actualPklCount: number | null;
  actionSubmittedAt: Date | null;
  relocationSiteId: string | null;
  assignedTeamId: string | null;
  relocationMatchStatus: RelocationMatchStatus | null;
  unaccommodatedPklCount: number;
  hasRevision?: boolean;
  createdAt: Date;
}

export interface DinasAnalyticsSiteRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  facilities: string[];
  maxCapacity: number;
  occupiedCapacity: number;
  pendingCapacity: number;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

export const DinasRepository = {
  /**
   * Mengambil seluruh laporan, lokasi binaan, tim patroli & alokasi pending untuk 1 region
   * menggunakan batch array $transaction([...]) (aman untuk PgBouncer pooler, tanpa pin CCTV).
   */
  async getAnalyticsInputsByRegion(regionId: string): Promise<{
    reports: DinasAnalyticsReportRow[];
    relocationSites: DinasAnalyticsSiteRow[];
    patrolTeams: PatrolTeamDto[];
  }> {
    const prisma = getPrisma();
    const [reportRows, siteRows, teamRows, pendingRows] = await prisma.$transaction([
      prisma.violationReport.findMany({
        where: { regionId },
        select: {
          id: true,
          status: true,
          address: true,
          lat: true,
          lng: true,
          detectedCount: true,
          actualPklCount: true,
          actionSubmittedAt: true,
          relocationSiteId: true,
          assignedTeamId: true,
          relocationMatchStatus: true,
          unaccommodatedPklCount: true,
          createdAt: true,
          auditLogs: {
            where: { action: 'REVISION_REQUESTED' },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.relocationSite.findMany({
        where: { regionId, isActive: true },
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          address: true,
          facilities: true,
          maxCapacity: true,
          occupiedCapacity: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.patrolTeam.findMany({
        where: { regionId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          assignedDistricts: true,
        },
        orderBy: { code: 'asc' },
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

    return {
      reports: reportRows.map((r) => ({
        id: r.id,
        status: r.status as ReportStatus,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        detectedCount: r.detectedCount,
        actualPklCount: r.actualPklCount,
        actionSubmittedAt: r.actionSubmittedAt,
        relocationSiteId: r.relocationSiteId,
        assignedTeamId: r.assignedTeamId,
        relocationMatchStatus:
          (r.relocationMatchStatus as RelocationMatchStatus | null) ?? null,
        unaccommodatedPklCount: r.unaccommodatedPklCount,
        hasRevision: r.status === 'NEEDS_REVISION' || r.auditLogs.length > 0,
        createdAt: r.createdAt,
      })),
      relocationSites: siteRows.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        address: s.address,
        facilities: toStringArray(s.facilities),
        maxCapacity: s.maxCapacity,
        occupiedCapacity: s.occupiedCapacity,
        pendingCapacity: pendingMap.get(s.id) ?? 0,
      })),
      patrolTeams: teamRows.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        assignedDistricts: toStringArray(t.assignedDistricts),
      })),
    };
  },
};

export type DinasRepositoryPort = typeof DinasRepository;
export default DinasRepository;
