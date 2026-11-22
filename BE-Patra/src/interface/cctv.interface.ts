import { z } from 'zod';
import {
  latitudeSchema,
  longitudeSchema,
  normalizedPolygonSchema,
  streamTypeSchema,
  type NormalizedPolygon,
  type StreamType,
} from './common.interface.js';

// Skema mentah output AI-Patra/cctv_catalog/indonesia_sources.py (Section 4.1 data_contract.md)
export const cctvCatalogRawItemSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  city: z.string().trim().min(1),
  province: z.string().trim().min(1),
  island: z.string().trim().min(1).default('Jawa'),
  region: z.string().trim().min(1),
  stream_url: z.string().trim().url(),
  stream_type: streamTypeSchema.default('hls'),
  lat: latitudeSchema,
  lng: longitudeSchema,
  coords_exact: z.boolean().default(false),
  needs_cors_proxy: z.boolean().default(false),
  attribution: z.string().trim().min(1),
  source_portal: z.string().trim().url(),
  district: z.string().trim().nullable().optional(),
  subdistrict: z.string().trim().nullable().optional(),
  facility_category: z.string().trim().nullable().optional(),
  playback_url: z.string().trim().url(),
  roi_polygon: normalizedPolygonSchema.nullable().optional(),
  fallback_video_url: z.string().trim().min(1).nullable().optional(),
  thumbnail_url: z.string().trim().url().nullable().optional(),
});

export type CctvCatalogRawItem = z.infer<typeof cctvCatalogRawItemSchema>;

export const cctvQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
});

export type CctvQueryParams = z.infer<typeof cctvQuerySchema>;

export const updateCctvRoiSchema = z.object({
  roiPolygon: normalizedPolygonSchema.nullable(),
});

export type UpdateCctvRoiInput = z.infer<typeof updateCctvRoiSchema>;

// Kontrak DTO kamera (Section 5 data_contract.md)
export interface CctvCameraDto {
  id: string;
  name: string;
  city: string;
  province: string;
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
  hasActiveReport?: boolean;
}
