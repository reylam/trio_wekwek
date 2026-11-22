import type {
  CreateRelocationSiteInput,
  JwtUserPayload,
  RelocationSiteDto,
  UpdateRelocationSiteInput,
} from '../interface/index.js';
import { assertRegionAccess } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import RelocationSiteRepository, {
  type RelocationSiteRecord,
  type RelocationSiteRepositoryPort,
} from '../repository/relocationSite.repository.js';

function cleanStringList(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean);
}

export function mapRelocationSiteToDto(
  record: RelocationSiteRecord,
): RelocationSiteDto {
  return {
    id: record.id,
    regionId: record.regionId,
    name: record.name,
    address: record.address,
    lat: record.lat,
    lng: record.lng,
    tradeCategories: record.tradeCategories,
    facilities: record.facilities,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createRelocationSiteService(
  repo: RelocationSiteRepositoryPort = RelocationSiteRepository,
) {
  return {
    async listByRegion(user: JwtUserPayload): Promise<RelocationSiteDto[]> {
      const records = await repo.findActiveByRegion(user.regionId);
      return records.map(mapRelocationSiteToDto);
    },

    async create(
      user: JwtUserPayload,
      input: CreateRelocationSiteInput,
    ): Promise<RelocationSiteDto> {
      const created = await repo.create({
        regionId: user.regionId,
        name: input.name.trim(),
        address: input.address.trim(),
        lat: input.lat,
        lng: input.lng,
        tradeCategories: cleanStringList(input.tradeCategories),
        facilities: cleanStringList(input.facilities),
      });
      return mapRelocationSiteToDto(created);
    },

    async update(
      user: JwtUserPayload,
      id: string,
      input: UpdateRelocationSiteInput,
    ): Promise<RelocationSiteDto> {
      const existing = await repo.findById(id);
      if (!existing) {
        throw new AppError(
          404,
          'RELOCATION_SITE_NOT_FOUND',
          'Lokasi binaan tidak ditemukan.',
        );
      }
      assertRegionAccess(user, existing.regionId);

      if (!existing.isActive) {
        throw new AppError(
          409,
          'RELOCATION_SITE_ARCHIVED',
          'Lokasi binaan ini sudah diarsipkan dan tidak dapat diubah.',
        );
      }

      const updateData: {
        name?: string;
        address?: string;
        lat?: number;
        lng?: number;
        tradeCategories?: string[];
        facilities?: string[];
      } = {};

      if (input.name !== undefined) updateData.name = input.name.trim();
      if (input.address !== undefined) updateData.address = input.address.trim();
      if (input.lat !== undefined) updateData.lat = input.lat;
      if (input.lng !== undefined) updateData.lng = input.lng;
      if (input.tradeCategories !== undefined) {
        updateData.tradeCategories = cleanStringList(input.tradeCategories);
      }
      if (input.facilities !== undefined) {
        updateData.facilities = cleanStringList(input.facilities);
      }

      const updated = await repo.update(id, updateData);
      return mapRelocationSiteToDto(updated);
    },

    /**
     * BR-008: Jika lokasi binaan sudah direferensikan laporan, lakukan soft-archive (isActive = false)
     * agar arsip laporan & Berita Acara PDF tetap utuh. Jika belum, hard delete.
     */
    async remove(
      user: JwtUserPayload,
      id: string,
    ): Promise<{ deletedId: string; archived: boolean }> {
      const existing = await repo.findById(id);
      if (!existing) {
        throw new AppError(
          404,
          'RELOCATION_SITE_NOT_FOUND',
          'Lokasi binaan tidak ditemukan.',
        );
      }
      assertRegionAccess(user, existing.regionId);

      const refCount = await repo.countReferencingReports(id);
      if (refCount > 0 || !existing.isActive) {
        if (existing.isActive) {
          await repo.softArchive(id);
        }
        return { deletedId: id, archived: true };
      }

      await repo.hardDelete(id);
      return { deletedId: id, archived: false };
    },
  };
}

export const RelocationSiteService = createRelocationSiteService();
export default RelocationSiteService;
