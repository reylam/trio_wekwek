import { Prisma } from '../../generated/prisma/client.js';
import { getPrisma } from '../config/prisma.js';
import type { GeoLngLat } from '../interface/index.js';

export interface RestrictedZoneRecord {
  id: string;
  regionId: string;
  name: string;
  description: string | null;
  points: GeoLngLat[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaZone(
  row: Prisma.RestrictedZoneGetPayload<object>,
): RestrictedZoneRecord {
  return {
    id: row.id,
    regionId: row.regionId,
    name: row.name,
    description: row.description,
    points: row.points as unknown as GeoLngLat[],
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const ZoneRepository = {
  async findManyByRegion(regionId: string): Promise<RestrictedZoneRecord[]> {
    const prisma = getPrisma();
    const rows = await prisma.restrictedZone.findMany({
      where: { regionId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPrismaZone);
  },

  async findById(id: string): Promise<RestrictedZoneRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.restrictedZone.findUnique({ where: { id } });
    return row ? mapPrismaZone(row) : null;
  },

  async create(data: {
    regionId: string;
    name: string;
    description: string | null;
    points: GeoLngLat[];
  }): Promise<RestrictedZoneRecord> {
    const prisma = getPrisma();
    const row = await prisma.restrictedZone.create({
      data: {
        regionId: data.regionId,
        name: data.name,
        description: data.description,
        points: data.points as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
    });
    return mapPrismaZone(row);
  },

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      points?: GeoLngLat[];
    },
  ): Promise<RestrictedZoneRecord> {
    const prisma = getPrisma();
    const updateData: Prisma.RestrictedZoneUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.points !== undefined) {
      updateData.points = data.points as unknown as Prisma.InputJsonValue;
    }

    const row = await prisma.restrictedZone.update({
      where: { id },
      data: updateData,
    });
    return mapPrismaZone(row);
  },

  async delete(id: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.restrictedZone.delete({ where: { id } });
  },
};

export type ZoneRepositoryPort = typeof ZoneRepository;
export default ZoneRepository;
