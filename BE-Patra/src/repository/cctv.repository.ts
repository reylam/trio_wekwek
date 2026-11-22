import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';
import type { CctvQueryParams, NormalizedPolygon, StreamType } from '../interface/index.js';

export interface CctvCameraRecord {
  id: string;
  regionId: string;
  name: string;
  city: string;
  province: string;
  island: string;
  regionLabel: string;
  district: string | null;
  subdistrict: string | null;
  facilityCategory: string | null;
  streamUrl: string;
  playbackUrl: string;
  streamType: StreamType;
  lat: number;
  lng: number;
  coordsExact: boolean;
  needsCorsProxy: boolean;
  attribution: string;
  sourcePortal: string;
  roiPolygon: NormalizedPolygon | null;
  thumbnailUrl: string | null;
  fallbackVideoUrl: string | null;
  isActive: boolean;
  syncedAt: Date;
  activeReportCount: number;
}

function mapPrismaCamera(
  row: Prisma.CctvCameraGetPayload<{
    include: { _count: { select: { reports: true } } };
  }>,
): CctvCameraRecord {
  return {
    id: row.id,
    regionId: row.regionId,
    name: row.name,
    city: row.city,
    province: row.province,
    island: row.island,
    regionLabel: row.regionLabel,
    district: row.district,
    subdistrict: row.subdistrict,
    facilityCategory: row.facilityCategory,
    streamUrl: row.streamUrl,
    playbackUrl: row.playbackUrl,
    streamType: row.streamType as StreamType,
    lat: row.lat,
    lng: row.lng,
    coordsExact: row.coordsExact,
    needsCorsProxy: row.needsCorsProxy,
    attribution: row.attribution,
    sourcePortal: row.sourcePortal,
    roiPolygon: (row.roiPolygon as NormalizedPolygon | null) ?? null,
    thumbnailUrl: row.thumbnailUrl,
    fallbackVideoUrl: row.fallbackVideoUrl,
    isActive: row.isActive,
    syncedAt: row.syncedAt,
    activeReportCount: row._count.reports,
  };
}

const activeReportCountInclude = {
  _count: {
    select: {
      reports: {
        where: { status: 'NEED_ACTION' as const },
      },
    },
  },
};

export const CctvRepository = {
  async findManyByRegion(
    regionId: string,
    filters: CctvQueryParams = {},
  ): Promise<CctvCameraRecord[]> {
    const prisma = getPrisma();
    const where: Prisma.CctvCameraWhereInput = {
      regionId,
      isActive: true,
    };

    if (filters.district) {
      where.district = { equals: filters.district, mode: 'insensitive' };
    }
    if (filters.category) {
      where.facilityCategory = { equals: filters.category, mode: 'insensitive' };
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { regionLabel: { contains: filters.search, mode: 'insensitive' } },
        { district: { contains: filters.search, mode: 'insensitive' } },
        { subdistrict: { contains: filters.search, mode: 'insensitive' } },
        { facilityCategory: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.cctvCamera.findMany({
      where,
      include: activeReportCountInclude,
      orderBy: { name: 'asc' },
    });

    return rows.map(mapPrismaCamera);
  },

  async findByIdWithActiveCount(id: string): Promise<CctvCameraRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.cctvCamera.findUnique({
      where: { id },
      include: activeReportCountInclude,
    });
    return row ? mapPrismaCamera(row) : null;
  },

  async updateRoiPolygon(
    id: string,
    roiPolygon: NormalizedPolygon | null,
  ): Promise<CctvCameraRecord> {
    const prisma = getPrisma();
    const row = await prisma.cctvCamera.update({
      where: { id },
      data: {
        roiPolygon:
          roiPolygon === null
            ? Prisma.JsonNull
            : (roiPolygon as unknown as Prisma.InputJsonValue),
      },
      include: activeReportCountInclude,
    });
    return mapPrismaCamera(row);
  },
};

export type CctvRepositoryPort = typeof CctvRepository;
export default CctvRepository;
