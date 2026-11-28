import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';
import type {
  CapacityStatus,
  GeoLngLat,
  NearestRelocationSiteDto,
  RelocationMatchStatus,
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
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface RelocationPlanAllocation {
  relocationSiteId: string;
  relocationSiteName: string;
  allocatedCount: number;
  rankOrder: number;
  distanceMeters: number;
  distanceLabel: string;
}

export interface SkippedRelocationSite {
  id: string;
  name: string;
  distanceMeters: number;
  effectiveAvailableCapacity: number;
}

export interface RelocationRecommendationPlan {
  recommendedRelocationSiteId: string | null;
  relocationMatchStatus: RelocationMatchStatus;
  unaccommodatedPklCount: number;
  allocations: RelocationPlanAllocation[];
  skippedFullSites: SkippedRelocationSite[];
}

/**
 * Algoritma Waterfall 4-Tingkat untuk menentukan rekomendasi lokasi relokasi PKL:
 * 1) NEAREST_AVAILABLE: lokasi terdekat cukup menampung seluruh rombongan.
 * 2) FALLBACK_AVAILABLE: pindah utuh ke lokasi terdekat berikutnya yang cukup menampung.
 * 3) SPLIT_FALLBACK: pecah ke beberapa lokasi terdekat bila total sisa kapasitas cukup.
 * 4) PARTIAL_UNACCOMMODATED / ALL_SITES_FULL: alokasi semaksimal mungkin + catat sisa tak tertampung.
 */
export function selectRecommendedRelocationPlan(
  lat: number,
  lng: number,
  requiredCount: number,
  sites: RelocationSiteGeoCandidate[],
  options?: { useOfficialAvailable?: boolean },
): RelocationRecommendationPlan {
  const need = Math.max(0, Math.trunc(requiredCount));
  if (sites.length === 0) {
    return {
      recommendedRelocationSiteId: null,
      relocationMatchStatus: 'ALL_SITES_FULL',
      unaccommodatedPklCount: need,
      allocations: [],
      skippedFullSites: [],
    };
  }

  const sorted = sites
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
        distanceMeters,
        distanceLabel: formatDistanceLabel(distanceMeters),
        availableCapacity: metrics.availableCapacity,
        effectiveAvailableCapacity: metrics.effectiveAvailableCapacity,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name));

  const cap = (s: (typeof sorted)[number]) =>
    options?.useOfficialAvailable ? s.availableCapacity : s.effectiveAvailableCapacity;

  const toSkipped = (s: (typeof sorted)[number]): SkippedRelocationSite => ({
    id: s.id,
    name: s.name,
    distanceMeters: s.distanceMeters,
    effectiveAvailableCapacity: cap(s),
  });

  if (need === 0) {
    const first = sorted[0]!;
    return {
      recommendedRelocationSiteId: first.id,
      relocationMatchStatus: cap(first) > 0 ? 'NEAREST_AVAILABLE' : 'ALL_SITES_FULL',
      unaccommodatedPklCount: 0,
      allocations: [],
      skippedFullSites: [],
    };
  }

  // Tingkat 1: Lokasi terdekat cukup menampung seluruh PKL
  const nearest = sorted[0]!;
  if (cap(nearest) >= need) {
    return {
      recommendedRelocationSiteId: nearest.id,
      relocationMatchStatus: 'NEAREST_AVAILABLE',
      unaccommodatedPklCount: 0,
      allocations: [
        {
          relocationSiteId: nearest.id,
          relocationSiteName: nearest.name,
          allocatedCount: need,
          rankOrder: 1,
          distanceMeters: nearest.distanceMeters,
          distanceLabel: nearest.distanceLabel,
        },
      ],
      skippedFullSites: [],
    };
  }

  // Tingkat 2: Cari alternatif terdekat berikutnya yang mampu menampung 1 rombongan utuh
  const fallbackIdx = sorted.findIndex((s, idx) => idx >= 1 && cap(s) >= need);
  if (fallbackIdx >= 1) {
    const chosen = sorted[fallbackIdx]!;
    return {
      recommendedRelocationSiteId: chosen.id,
      relocationMatchStatus: 'FALLBACK_AVAILABLE',
      unaccommodatedPklCount: 0,
      allocations: [
        {
          relocationSiteId: chosen.id,
          relocationSiteName: chosen.name,
          allocatedCount: need,
          rankOrder: 1,
          distanceMeters: chosen.distanceMeters,
          distanceLabel: chosen.distanceLabel,
        },
      ],
      skippedFullSites: sorted.slice(0, fallbackIdx).map(toSkipped),
    };
  }

  // Hitung kapasitas gabungan seluruh lokasi aktif
  const totalCap = sorted.reduce((acc, s) => acc + cap(s), 0);

  if (totalCap === 0) {
    return {
      recommendedRelocationSiteId: null,
      relocationMatchStatus: 'ALL_SITES_FULL',
      unaccommodatedPklCount: need,
      allocations: [],
      skippedFullSites: sorted.map(toSkipped),
    };
  }

  // Tingkat 3 (totalCap >= need -> SPLIT_FALLBACK) & Tingkat 4 (totalCap < need -> PARTIAL_UNACCOMMODATED)
  const allocations: RelocationPlanAllocation[] = [];
  let remaining = need;
  let lastAllocatedIdx = -1;

  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    const site = sorted[i]!;
    const siteCap = cap(site);
    if (siteCap <= 0) continue;
    const take = Math.min(remaining, siteCap);
    allocations.push({
      relocationSiteId: site.id,
      relocationSiteName: site.name,
      allocatedCount: take,
      rankOrder: allocations.length + 1,
      distanceMeters: site.distanceMeters,
      distanceLabel: site.distanceLabel,
    });
    remaining -= take;
    lastAllocatedIdx = i;
  }

  const isSplitFull = remaining === 0;
  const skippedFullSites = isSplitFull
    ? sorted
        .slice(0, Math.max(0, lastAllocatedIdx))
        .filter((s) => cap(s) === 0)
        .map(toSkipped)
    : sorted.filter((s) => cap(s) === 0).map(toSkipped);

  return {
    recommendedRelocationSiteId: allocations[0]?.relocationSiteId ?? null,
    relocationMatchStatus: isSplitFull ? 'SPLIT_FALLBACK' : 'PARTIAL_UNACCOMMODATED',
    unaccommodatedPklCount: remaining,
    allocations,
    skippedFullSites,
  };
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
