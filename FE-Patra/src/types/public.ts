import type { GeoLngLat, ReportStatus } from './common';

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
