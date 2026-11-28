import { getPrisma } from '../config/prisma.js';
import type { GeoLngLat, ReportStatus } from '../interface/index.js';
import { aggregatePendingCapacity } from '../service/geo.service.js';

export interface PublicRegionRecord {
  id: string;
  code: string;
  city: string;
  province: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
}

export interface PublicReportMetricRecord {
  status: ReportStatus;
  detectedCount: number;
  actualPklCount: number | null;
  relocationSiteId: string | null;
  createdAt: Date;
  actionSubmittedAt: Date | null;
}

export interface PublicZoneRecord {
  id: string;
  name: string;
  points: GeoLngLat[];
}

// PRIVASI PUBLIK: Proyeksi ketat tanpa beforeImageUrl / afterImageUrl.
export interface PublicHotspotRecord {
  id: string;
  reportCode: string;
  address: string;
  lat: number;
  lng: number;
  detectedCount: number;
  status: ReportStatus;
  createdAt: Date;
}

export interface PublicRelocationSiteRecord {
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

export interface PublicAuditFeedRecord {
  id: string;
  reportCode: string;
  city: string;
  address: string;
  status: ReportStatus;
  createdAt: Date;
  actionSubmittedAt: Date | null;
  validatedAt: Date | null;
  relocationSiteName: string | null;
}

export const PublicRepository = {
  async findAllRegions(): Promise<PublicRegionRecord[]> {
    const prisma = getPrisma();
    return prisma.region.findMany({
      orderBy: { city: 'asc' },
      select: {
        id: true,
        code: true,
        city: true,
        province: true,
        centerLat: true,
        centerLng: true,
        defaultZoom: true,
      },
    });
  },

  async findRegionByCityOrCode(cityOrCode: string): Promise<PublicRegionRecord | null> {
    const prisma = getPrisma();
    const q = cityOrCode.trim();
    return prisma.region.findFirst({
      where: {
        OR: [
          { city: { equals: q, mode: 'insensitive' } },
          { code: { equals: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        code: true,
        city: true,
        province: true,
        centerLat: true,
        centerLng: true,
        defaultZoom: true,
      },
    });
  },

  async findReportMetrics(regionId?: string): Promise<PublicReportMetricRecord[]> {
    const prisma = getPrisma();
    const rows = await prisma.violationReport.findMany({
      where: regionId ? { regionId } : undefined,
      select: {
        status: true,
        detectedCount: true,
        actualPklCount: true,
        relocationSiteId: true,
        createdAt: true,
        actionSubmittedAt: true,
      },
    });

    return rows.map((r) => ({
      status: r.status as ReportStatus,
      detectedCount: r.detectedCount,
      actualPklCount: r.actualPklCount,
      relocationSiteId: r.relocationSiteId,
      createdAt: r.createdAt,
      actionSubmittedAt: r.actionSubmittedAt,
    }));
  },

  async findMapData(regionId?: string): Promise<{
    zones: PublicZoneRecord[];
    hotspots: PublicHotspotRecord[];
    relocationSites: PublicRelocationSiteRecord[];
  }> {
    const prisma = getPrisma();
    const regionFilter = regionId ? { regionId } : {};

    const [zonesRaw, hotspotsRaw, sitesRaw, pendingRows] = await prisma.$transaction([
      prisma.restrictedZone.findMany({
        where: { ...regionFilter, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          points: true,
        },
      }),
      // PRIVASI PUBLIK: DILARANG mengambil beforeImageUrl / afterImageUrl
      prisma.violationReport.findMany({
        where: regionId ? { regionId } : undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: {
          id: true,
          reportCode: true,
          address: true,
          lat: true,
          lng: true,
          detectedCount: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.relocationSite.findMany({
        where: { ...regionFilter, isActive: true },
        orderBy: { name: 'asc' },
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
            ...regionFilter,
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
      zones: zonesRaw.map((z) => ({
        id: z.id,
        name: z.name,
        points: z.points as unknown as GeoLngLat[],
      })),
      hotspots: hotspotsRaw.map((h) => ({
        id: h.id,
        reportCode: h.reportCode,
        address: h.address,
        lat: h.lat,
        lng: h.lng,
        detectedCount: h.detectedCount,
        status: h.status as ReportStatus,
        createdAt: h.createdAt,
      })),
      relocationSites: sitesRaw.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        tradeCategories: Array.isArray(s.tradeCategories)
          ? (s.tradeCategories as string[])
          : [],
        facilities: Array.isArray(s.facilities) ? (s.facilities as string[]) : [],
        maxCapacity: s.maxCapacity,
        occupiedCapacity: s.occupiedCapacity,
        pendingCapacity: pendingMap.get(s.id) ?? 0,
      })),
    };
  },

  async findAuditFeed(
    limit: number,
    regionId?: string,
  ): Promise<PublicAuditFeedRecord[]> {
    const prisma = getPrisma();
    const rows = await prisma.violationReport.findMany({
      where: regionId ? { regionId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        reportCode: true,
        address: true,
        status: true,
        createdAt: true,
        actionSubmittedAt: true,
        validatedAt: true,
        region: { select: { city: true } },
        relocationSite: { select: { name: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      reportCode: r.reportCode,
      city: r.region.city,
      address: r.address,
      status: r.status as ReportStatus,
      createdAt: r.createdAt,
      actionSubmittedAt: r.actionSubmittedAt,
      validatedAt: r.validatedAt,
      relocationSiteName: r.relocationSite?.name ?? null,
    }));
  },
};

export type PublicRepositoryPort = typeof PublicRepository;
export default PublicRepository;
