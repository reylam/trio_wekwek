import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';

export interface RelocationSiteRecord {
  id: string;
  regionId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
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

    const row = await prisma.relocationSite.update({
      where: { id },
      data: updateData,
    });
    return mapPrismaRelocationSite(row);
  },

  async countReferencingReports(id: string): Promise<number> {
    const prisma = getPrisma();
    return prisma.violationReport.count({
      where: { relocationSiteId: id },
    });
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
