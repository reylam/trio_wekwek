import { lineString } from '@turf/helpers';
import lineIntersect from '@turf/line-intersect';
import type {
  CreateZoneInput,
  GeoLngLat,
  JwtUserPayload,
  RestrictedZoneDto,
  UpdateZoneInput,
} from '../interface/index.js';
import {
  assertDistrictAccess,
  assertRegionAccess,
  hasDistrictLock,
} from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import ZoneRepository, {
  type RestrictedZoneRecord,
  type ZoneRepositoryPort,
} from '../repository/zone.repository.js';

export function validateZonePolygon(points: GeoLngLat[]): GeoLngLat[] {
  if (!Array.isArray(points) || points.length < 3) {
    throw new AppError(
      400,
      'INVALID_POLYGON',
      'Poligon zona minimal memiliki 3 titik koordinat.',
    );
  }

  // Hapus titik duplikat berurutan dan titik penutup ganda di akhir agar menjadi ring terbuka bersih.
  const deduped: GeoLngLat[] = [];
  for (const pt of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) {
      deduped.push([pt[0], pt[1]]);
    }
  }
  if (deduped.length >= 2) {
    const first = deduped[0]!;
    const last = deduped[deduped.length - 1]!;
    if (first[0] === last[0] && first[1] === last[1]) {
      deduped.pop();
    }
  }

  const uniqueVertexKeys = new Set(deduped.map((pt) => `${pt[0]},${pt[1]}`));
  if (deduped.length < 3 || uniqueVertexKeys.size < 3) {
    throw new AppError(
      400,
      'INVALID_POLYGON',
      'Poligon zona minimal memiliki 3 titik koordinat unik.',
    );
  }

  const closedRing: GeoLngLat[] = [...deduped, deduped[0]!];
  const line = lineString(closedRing);
  const intersections = lineIntersect(line, line);
  const uniqueIntersections = new Set(
    intersections.features.map((f) => f.geometry.coordinates.join(',')),
  );

  // Perpotongan di luar titik simpul menandakan sisi poligon saling menyilang (self-intersecting).
  if (uniqueIntersections.size > deduped.length) {
    throw new AppError(
      400,
      'SELF_INTERSECTING_POLYGON',
      'Poligon zona terlarang tidak boleh saling berpotongan.',
    );
  }

  return deduped;
}

export function mapZoneToDto(record: RestrictedZoneRecord): RestrictedZoneDto {
  return {
    id: record.id,
    regionId: record.regionId,
    district: record.district ?? null,
    name: record.name,
    description: record.description,
    points: record.points,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createZoneService(repo: ZoneRepositoryPort = ZoneRepository) {
  return {
    async listByRegion(user: JwtUserPayload): Promise<RestrictedZoneDto[]> {
      const records = await repo.findManyByRegion(user.regionId);
      return records.map(mapZoneToDto);
    },

    async create(
      user: JwtUserPayload,
      input: CreateZoneInput,
    ): Promise<RestrictedZoneDto> {
      const cleanPoints = validateZonePolygon(input.points);
      let resolvedDistrict: string | null = input.district?.trim() || null;

      if (hasDistrictLock(user)) {
        if (resolvedDistrict) {
          assertDistrictAccess(user, resolvedDistrict, 'zona terlarang');
        } else {
          resolvedDistrict = user.assignedDistricts[0] ?? null;
        }
      }

      const created = await repo.create({
        regionId: user.regionId,
        district: resolvedDistrict,
        name: input.name.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        points: cleanPoints,
      });
      return mapZoneToDto(created);
    },

    async update(
      user: JwtUserPayload,
      id: string,
      input: UpdateZoneInput,
    ): Promise<RestrictedZoneDto> {
      const existing = await repo.findById(id);
      if (!existing) {
        throw new AppError(404, 'ZONE_NOT_FOUND', 'Zona terlarang tidak ditemukan.');
      }
      assertRegionAccess(user, existing.regionId);
      assertDistrictAccess(user, existing.district, 'zona terlarang');

      const updateData: {
        district?: string | null;
        name?: string;
        description?: string | null;
        points?: GeoLngLat[];
      } = {};
      if (input.district !== undefined) {
        const nextDistrict = input.district?.trim() || null;
        if (hasDistrictLock(user)) {
          assertDistrictAccess(user, nextDistrict, 'zona terlarang');
        }
        updateData.district = nextDistrict;
      }
      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }
      if (input.description !== undefined) {
        updateData.description = input.description?.trim()
          ? input.description.trim()
          : null;
      }
      if (input.points !== undefined) {
        updateData.points = validateZonePolygon(input.points);
      }

      const updated = await repo.update(id, updateData);
      return mapZoneToDto(updated);
    },

    async remove(
      user: JwtUserPayload,
      id: string,
    ): Promise<{ deletedId: string }> {
      const existing = await repo.findById(id);
      if (!existing) {
        throw new AppError(404, 'ZONE_NOT_FOUND', 'Zona terlarang tidak ditemukan.');
      }
      assertRegionAccess(user, existing.regionId);
      assertDistrictAccess(user, existing.district, 'zona terlarang');
      await repo.delete(id);
      return { deletedId: id };
    },
  };
}

export const ZoneService = createZoneService();
export default ZoneService;
