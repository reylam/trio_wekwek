import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';
import type {
  CapacityStatus,
  GeoLngLat,
  NearestRelocationSiteDto,
  SiteCapacityMetrics,
} from '../interface/index.js';

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const kmRounded = Math.round((meters / 1000) * 10) / 10;
  return `${kmRounded.toFixed(1).replace('.', ',')} km`;
}

export interface RelocationSiteGeoCandidate {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
  maxCapacity?: number;
  occupiedCapacity?: number;
  pendingCapacity?: number;
}

export function aggregatePendingCapacity(
  rows: Array<{ relocationSiteId: string; allocatedCount: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.allocatedCount <= 0) continue;
    map.set(
      row.relocationSiteId,
      (map.get(row.relocationSiteId) ?? 0) + row.allocatedCount,
    );
  }
  return map;
}

export function computeSiteCapacityMetrics(
  maxCapacity: number,
  occupiedCapacity: number,
  pendingCapacity = 0,
): SiteCapacityMetrics {
  const safeMax = Math.max(1, Math.trunc(maxCapacity));
  const safeOcc = Math.max(0, Math.trunc(occupiedCapacity));
  const safePending = Math.max(0, Math.trunc(pendingCapacity));
  const availableCapacity = Math.max(0, safeMax - safeOcc);
  const effectiveAvailableCapacity = Math.max(0, safeMax - safeOcc - safePending);
  const occupancyPercent = Math.min(100, Math.round((safeOcc / safeMax) * 100));
  const capacityStatus: CapacityStatus =
    availableCapacity === 0
      ? 'FULL'
      : occupancyPercent >= 80
        ? 'NEAR_FULL'
        : 'AVAILABLE';

  return {
    maxCapacity: safeMax,
    occupiedCapacity: safeOcc,
    pendingCapacity: safePending,
    availableCapacity,
    effectiveAvailableCapacity,
    occupancyPercent,
    capacityStatus,
  };
}

export function findNearestRelocationSites(
  lat: number,
  lng: number,
  sites: RelocationSiteGeoCandidate[],
  limit = 3,
): NearestRelocationSiteDto[] {
  return sites
    .map((site) => {
      const distanceMeters = haversineDistanceMeters(lat, lng, site.lat, site.lng);
      const metrics = computeSiteCapacityMetrics(
        site.maxCapacity ?? 20,
        site.occupiedCapacity ?? 0,
        site.pendingCapacity ?? 0,
      );
      return {
        id: site.id,
        name: site.name,
        address: site.address,
        lat: site.lat,
        lng: site.lng,
        tradeCategories: site.tradeCategories,
        facilities: site.facilities,
        ...metrics,
        distanceMeters,
        distanceLabel: formatDistanceLabel(distanceMeters),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

function toClosedRing(points: GeoLngLat[]): GeoLngLat[] {
  if (points.length === 0) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    return points;
  }
  return [...points, first];
}

export function findMatchingZoneId(
  lat: number,
  lng: number,
  zones: Array<{ id: string; points: GeoLngLat[] }>,
): string | null {
  const pt = turfPoint([lng, lat]);
  for (const zone of zones) {
    if (!Array.isArray(zone.points) || zone.points.length < 3) continue;
    try {
      const poly = turfPolygon([toClosedRing(zone.points)]);
      if (booleanPointInPolygon(pt, poly)) {
        return zone.id;
      }
    } catch {
      // Lewati zona jika geometri tersimpan tidak valid
    }
  }
  return null;
}
