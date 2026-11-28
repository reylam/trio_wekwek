import type {
  CctvCameraDto,
  CctvQueryParams,
  JwtUserPayload,
  UpdateCctvRoiInput,
} from '../interface/index.js';
import {
  assertDistrictAccess,
  assertRegionAccess,
  hasDistrictLock,
} from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import CctvRepository, {
  type CctvCameraRecord,
  type CctvRepositoryPort,
} from '../repository/cctv.repository.js';

export function mapCameraToDto(record: CctvCameraRecord): CctvCameraDto {
  return {
    id: record.id,
    name: record.name,
    city: record.city,
    province: record.province,
    regionLabel: record.regionLabel,
    district: record.district,
    subdistrict: record.subdistrict,
    facilityCategory: record.facilityCategory,
    streamUrl: record.streamUrl,
    playbackUrl: record.playbackUrl,
    streamType: record.streamType,
    lat: record.lat,
    lng: record.lng,
    coordsExact: record.coordsExact,
    needsCorsProxy: record.needsCorsProxy,
    attribution: record.attribution,
    sourcePortal: record.sourcePortal,
    roiPolygon: record.roiPolygon,
    thumbnailUrl: record.thumbnailUrl,
    fallbackVideoUrl: record.fallbackVideoUrl,
    hasActiveReport: record.activeReportCount > 0,
  };
}

export function createCctvService(repo: CctvRepositoryPort = CctvRepository) {
  return {
    async listByRegion(
      user: JwtUserPayload,
      query: CctvQueryParams,
    ): Promise<{
      cameras: CctvCameraDto[];
      meta: { total: number; city: string };
    }> {
      const allowedDistricts = hasDistrictLock(user)
        ? user.assignedDistricts
        : undefined;
      const records = await repo.findManyByRegion(
        user.regionId,
        query,
        allowedDistricts,
      );
      const cameras = records.map(mapCameraToDto);
      return {
        cameras,
        meta: {
          total: cameras.length,
          city: user.city,
        },
      };
    },

    async getById(user: JwtUserPayload, id: string): Promise<CctvCameraDto> {
      const record = await repo.findByIdWithActiveCount(id);
      if (!record || !record.isActive) {
        throw new AppError(404, 'CCTV_NOT_FOUND', 'Kamera CCTV tidak ditemukan.');
      }
      assertRegionAccess(user, record.regionId);
      assertDistrictAccess(user, record.district, 'kamera CCTV');
      return mapCameraToDto(record);
    },

    async updateRoi(
      user: JwtUserPayload,
      id: string,
      input: UpdateCctvRoiInput,
    ): Promise<CctvCameraDto> {
      const record = await repo.findByIdWithActiveCount(id);
      if (!record || !record.isActive) {
        throw new AppError(404, 'CCTV_NOT_FOUND', 'Kamera CCTV tidak ditemukan.');
      }
      assertRegionAccess(user, record.regionId);
      assertDistrictAccess(user, record.district, 'kamera CCTV');
      const updated = await repo.updateRoiPolygon(id, input.roiPolygon);
      return mapCameraToDto(updated);
    },
  };
}

export const CctvService = createCctvService();
export default CctvService;
