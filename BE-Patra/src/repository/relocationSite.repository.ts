import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';
import { aggregatePendingCapacity } from '../service/geo.service.js';

export interface RelocationSiteRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function mapPrismaRelocationSite(
  row: Prisma.RelocationSiteGetPayload<object>,
): RelocationSiteRecord {
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const RelocationSiteRepository = {
  async findActiveByRegion(regionId: string): Promise<RelocationSiteRecord[]> {
    const prisma = getPrisma();
    const rows = await prisma.relocationSite.findMany({
      where: { regionId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPrismaRelocationSite);
  },

  async findPendingCapacityMapByRegion(regionId: string): Promise<Map<string, number>> {
    const prisma = getPrisma();
    const rows = await prisma.reportRelocationAllocation.findMany({
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
    });
    return aggregatePendingCapacity(rows);
  },

  async findById(id: string): Promise<RelocationSiteRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.relocationSite.findUnique({ where: { id } });
    return row ? mapPrismaRelocationSite(row) : null;
  },

  async create(data: {
    regionId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tradeCategories: string[];
    facilities: string[];
    maxCapacity: number;
    occupiedCapacity: number;
  }): Promise<RelocationSiteRecord> {
    const prisma = getPrisma();
    const row = await prisma.relocationSite.create({
      data: {
        regionId: data.regionId,
        name: data.name,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        tradeCategories: data.tradeCategories as unknown as Prisma.InputJsonValue,
        facilities: data.facilities as unknown as Prisma.InputJsonValue,
        maxCapacity: data.maxCapacity,
        occupiedCapacity: data.occupiedCapacity,
        isActive: true,
      },
    });
    return mapPrismaRelocationSite(row);
  },

  async update(
    id: string,
    data: {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      tradeCategories?: string[];
      facilities?: string[];
      maxCapacity?: number;
      occupiedCapacity?: number;
    },
  ): Promise<RelocationSiteRecord> {
    const prisma = getPrisma();
    const updateData: Prisma.RelocationSiteUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    if (data.tradeCategories !== undefined) {
      updateData.tradeCategories =
        data.tradeCategories as unknown as Prisma.InputJsonValue;
    }
    if (data.facilities !== undefined) {
      updateData.facilities = data.facilities as unknown as Prisma.InputJsonValue;
    }
    if (data.maxCapacity !== undefined) {
      updateData.maxCapacity = data.maxCapacity;
    }
    if (data.occupiedCapacity !== undefined) {
      updateData.occupiedCapacity = data.occupiedCapacity;
    }

    const row = await prisma.relocationSite.update({
      where: { id },
      data: updateData,
    });
    return mapPrismaRelocationSite(row);
  },

  async countReferencingReports(id: string): Promise<number> {
    const prisma = getPrisma();
    const [reportRefs, allocationRefs] = await prisma.$transaction([
      prisma.violationReport.count({
        where: {
          OR: [{ relocationSiteId: id }, { recommendedRelocationSiteId: id }],
        },
      }),
      prisma.reportRelocationAllocation.count({
        where: { relocationSiteId: id },
      }),
    ]);
    return reportRefs + allocationRefs;
  },

  async softArchive(id: string): Promise<RelocationSiteRecord> {
    const prisma = getPrisma();
    const row = await prisma.relocationSite.update({
      where: { id },
      data: { isActive: false },
    });
    return mapPrismaRelocationSite(row);
  },

  async hardDelete(id: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.relocationSite.delete({ where: { id } });
  },
};

export type RelocationSiteRepositoryPort = typeof RelocationSiteRepository;
export default RelocationSiteRepository;
