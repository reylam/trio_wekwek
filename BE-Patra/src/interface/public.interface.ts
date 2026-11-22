import { z } from 'zod';
import type { GeoLngLat, ReportStatus } from './common.interface.js';

export const publicCityQuerySchema = z.object({
  city: z.string().trim().max(120).optional(),
});

export type PublicCityQuery = z.infer<typeof publicCityQuerySchema>;

export const publicAuditFeedQuerySchema = z.object({
  city: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PublicAuditFeedQuery = z.infer<typeof publicAuditFeedQuerySchema>;

export interface PublicCityItem {
  id: string;
  code: string;
  city: string;
  province: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
}

export interface PublicOverviewData {
  city: string;
  kpi: {
    totalViolationsThisMonth: number;
    resolutionRatePercent: number;
    avgResponseSlaMinutes: number | null;
    totalPklDirectedToRelocation: number;
  };
}

export interface PublicMapZoneDto {
  id: string;
  name: string;
  points: GeoLngLat[];
}

// PRIVASI PUBLIK (LOCKED DECISION): DILARANG menyertakan beforeImageUrl / afterImageUrl.
export interface PublicMapHotspotDto {
  id: string;
  reportCode: string;
  address: string;
  lat: number;
  lng: number;
  detectedCount: number;
  status: ReportStatus;
  createdAt: string;
}

export interface PublicMapRelocationSiteDto {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
}

export interface PublicMapData {
  region: {
    city: string;
    centerLat: number;
    centerLng: number;
    defaultZoom: number;
  };
  zones: PublicMapZoneDto[];
  hotspots: PublicMapHotspotDto[];
  relocationSites: PublicMapRelocationSiteDto[];
}

export interface PublicAuditFeedItemDto {
  id: string;
  reportCode: string;
  city: string;
  address: string;
  status: ReportStatus;
  detectedAt: string;
  actionSubmittedAt: string | null;
  validatedAt: string | null;
  responseSlaMinutes: number | null;
  relocationSiteName: string | null;
}
