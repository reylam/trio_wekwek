import { getPrisma } from '../config/prisma.js';
import type { ReportStatus } from '../interface/index.js';

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
  createdAt: Date;
}

export interface DinasAnalyticsSiteRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  facilities: string[];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

export const DinasRepository = {
  /**
   * Mengambil seluruh laporan & lokasi binaan aktif untuk 1 region menggunakan
   * batch array $transaction([...]) (aman untuk PgBouncer pooler, tanpa pin CCTV).
   */
  async getAnalyticsInputsByRegion(regionId: string): Promise<{
    reports: DinasAnalyticsReportRow[];
    relocationSites: DinasAnalyticsSiteRow[];
  }> {
    const prisma = getPrisma();
    const [reportRows, siteRows] = await prisma.$transaction([
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
          createdAt: true,
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
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

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
        createdAt: r.createdAt,
      })),
      relocationSites: siteRows.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        address: s.address,
        facilities: toStringArray(s.facilities),
      })),
    };
  },
};

export type DinasRepositoryPort = typeof DinasRepository;
export default DinasRepository;
