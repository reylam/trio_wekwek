import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';
import type { GeoLngLat, NearestRelocationSiteDto } from '../interface/index.js';

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
}

// STRICT OUT-OF-SCOPE: Hanya mengembalikan nama, alamat, jarak, kategori, dan fasilitas (TANPA kuota).
export function findNearestRelocationSites(
  lat: number,
  lng: number,
  sites: RelocationSiteGeoCandidate[],
  limit = 3,
): NearestRelocationSiteDto[] {
  return sites
    .map((site) => {
      const distanceMeters = haversineDistanceMeters(lat, lng, site.lat, site.lng);
      return {
        id: site.id,
        name: site.name,
        address: site.address,
        lat: site.lat,
        lng: site.lng,
        tradeCategories: site.tradeCategories,
        facilities: site.facilities,
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
