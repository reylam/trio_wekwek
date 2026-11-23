import { apiFetch } from '@/lib/apiClient';
import { normalizeCityParam } from '@/lib/publicHelpers';
import { IS_BACKEND_ENABLED } from '@/services/api';
import type {
  PublicAuditFeedItemDto,
  PublicCityItem,
  PublicMapData,
  PublicOverviewData,
} from '@/types';

// ============================================================================
// OFFLINE MOCK FALLBACK (Hanya aktif bila VITE_USE_BACKEND !== 'true')
// KETAT PRIVASI: Dilarang keras menyimpan beforeImageUrl / afterImageUrl / kuota.
// ============================================================================

const MOCK_PUBLIC_CITIES: PublicCityItem[] = [
  {
    id: 'reg-jkp',
    code: 'jkt-pusat',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    centerLat: -6.1864,
    centerLng: 106.834,
    defaultZoom: 13,
  },
  {
    id: 'reg-smg',
    code: 'semarang',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    centerLat: -6.9896,
    centerLng: 110.4228,
    defaultZoom: 13,
  },
];

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

const MOCK_ZONES_BY_CITY: Record<string, PublicMapData['zones']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'pub-zone-jkt-1',
      name: 'Koridor Trotoar M.H. Thamrin – Sarinah',
      points: [
        [106.8224, -6.1886],
        [106.8244, -6.1886],
        [106.8244, -6.1858],
        [106.8224, -6.1858],
      ],
    },
    {
      id: 'pub-zone-jkt-2',
      name: 'Zona Tertib Pedestrian Pasar Baru',
      points: [
        [106.8331, -6.1684],
        [106.8355, -6.1684],
        [106.8355, -6.1661],
        [106.8331, -6.1661],
      ],
    },
  ],
  'Kota Semarang': [
    {
      id: 'pub-zone-smg-1',
      name: 'Zona Larangan PKL Simpang Lima – Pandanaran',
      points: [
        [110.4209, -6.9912],
        [110.4244, -6.9912],
        [110.4244, -6.9885],
        [110.4209, -6.9885],
      ],
    },
    {
      id: 'pub-zone-smg-2',
      name: 'Koridor Cagar Budaya Tugumuda – Pemuda',
      points: [
        [110.4081, -6.9856],
        [110.4112, -6.9856],
        [110.4112, -6.9831],
        [110.4081, -6.9831],
      ],
    },
  ],
};

const MOCK_HOTSPOTS_BY_CITY: Record<string, PublicMapData['hotspots']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'pub-hs-jkt-1',
      reportCode: 'PTR-202611-JKT01',
      address: 'Jl. M.H. Thamrin Trotoar Barat (Simpang Sarinah)',
      lat: -6.1872,
      lng: 106.8235,
      detectedCount: 3,
      status: 'PENDING_VALIDATION',
      createdAt: hoursAgoIso(2.2),
    },
    {
      id: 'pub-hs-jkt-2',
      reportCode: 'PTR-202611-JKT02',
      address: 'Jl. Pasar Baru Selatan Trotoar Pintu Air',
      lat: -6.1674,
      lng: 106.8342,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(17),
    },
    {
      id: 'pub-hs-jkt-3',
      reportCode: 'PTR-202611-JKT03',
      address: 'Jl. Kebon Sirih Barat (Depan Halte)',
      lat: -6.1821,
      lng: 106.8264,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(43),
    },
  ],
  'Kota Semarang': [
    {
      id: 'pub-hs-smg-1',
      reportCode: 'PTR-202611-SMG01',
      address: 'Jl. Pandanaran Trotoar Utara (Simpang Lima)',
      lat: -6.9896,
      lng: 110.4228,
      detectedCount: 4,
      status: 'PENDING_VALIDATION',
      createdAt: hoursAgoIso(1.4),
    },
    {
      id: 'pub-hs-smg-2',
      reportCode: 'PTR-202611-SMG02',
      address: 'Jl. Pemuda Simpang Tugumuda',
      lat: -6.9844,
      lng: 110.4094,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(13),
    },
    {
      id: 'pub-hs-smg-3',
      reportCode: 'PTR-202611-SMG03',
      address: 'Jl. Pahlawan Taman Indonesia Kaya',
      lat: -6.9935,
      lng: 110.4209,
      detectedCount: 3,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(37),
    },
  ],
};

const MOCK_SITES_BY_CITY: Record<string, PublicMapData['relocationSites']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'site-jkt-1',
      name: 'Lokbin JP 25 Pasar Baru',
      address: 'Jl. Pasar Baru Timur Dalam No. 12, Sawah Besar, Jakarta Pusat',
      lat: -6.1652,
      lng: 106.8358,
      tradeCategories: ['Kuliner', 'Minuman', 'Aksesoris'],
      facilities: ['Listrik PLN', 'Air Bersih', 'Toilet', 'Kanopi Permanen'],
    },
    {
      id: 'site-jkt-2',
      name: 'JP 42 Kuliner Sabang Binaan',
      address: 'Jl. H. Agus Salim Kav. 21, Menteng, Jakarta Pusat',
      lat: -6.1835,
      lng: 106.8246,
      tradeCategories: ['Kuliner Malam', 'Kopi & Jajanan'],
      facilities: ['Tenda Resmi', 'Air Bersih', 'Penerangan Jalan', 'Area Parkir'],
    },
  ],
  'Kota Semarang': [
    {
      id: 'site-smg-1',
      name: 'Selter PKL Taman Menteri Supeno (Taman KB)',
      address: 'Jl. Taman Menteri Supeno No. 1, Mugassari, Semarang Selatan',
      lat: -6.9927,
      lng: 110.4201,
      tradeCategories: ['Kuliner', 'Minuman', 'Cinderamata'],
      facilities: ['Listrik', 'Air Bersih', 'Area Duduk Teduh', 'Toilet Umum'],
    },
    {
      id: 'site-smg-2',
      name: 'Sentra Kuliner Binaan Basudewo',
      address: 'Jl. Basudewo Raya No. 14, Bulustalan, Semarang Selatan',
      lat: -6.9885,
      lng: 110.4024,
      tradeCategories: ['Kuliner', 'Gorengan & Kopi'],
      facilities: ['Tenda Seragam', 'Air Mengalir', 'Tempat Sampah Terpilah'],
    },
  ],
};

const MOCK_AUDIT_FEED: PublicAuditFeedItemDto[] = [
  {
    id: 'pub-hs-smg-1',
    reportCode: 'PTR-202611-SMG01',
    city: 'Kota Semarang',
    address: 'Jl. Pandanaran Trotoar Utara (Simpang Lima)',
    status: 'PENDING_VALIDATION',
    detectedAt: hoursAgoIso(1.4),
    actionSubmittedAt: hoursAgoIso(0.8),
    validatedAt: null,
    responseSlaMinutes: 36,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-jkt-1',
    reportCode: 'PTR-202611-JKT01',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. M.H. Thamrin Trotoar Barat (Simpang Sarinah)',
    status: 'PENDING_VALIDATION',
    detectedAt: hoursAgoIso(2.2),
    actionSubmittedAt: hoursAgoIso(1.5),
    validatedAt: null,
    responseSlaMinutes: 42,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-smg-2',
    reportCode: 'PTR-202611-SMG02',
    city: 'Kota Semarang',
    address: 'Jl. Pemuda Simpang Tugumuda',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(13),
    actionSubmittedAt: hoursAgoIso(12),
    validatedAt: hoursAgoIso(11),
    responseSlaMinutes: 60,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-jkt-2',
    reportCode: 'PTR-202611-JKT02',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. Pasar Baru Selatan Trotoar Pintu Air',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(17),
    actionSubmittedAt: hoursAgoIso(16),
    validatedAt: hoursAgoIso(14),
    responseSlaMinutes: 60,
    relocationSiteName: 'Lokbin JP 25 Pasar Baru',
  },
  {
    id: 'pub-hs-smg-3',
    reportCode: 'PTR-202611-SMG03',
    city: 'Kota Semarang',
    address: 'Jl. Pahlawan Taman Indonesia Kaya',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(37),
    actionSubmittedAt: hoursAgoIso(36),
    validatedAt: hoursAgoIso(34),
    responseSlaMinutes: 60,
    relocationSiteName: 'Selter PKL Taman Menteri Supeno (Taman KB)',
  },
  {
    id: 'pub-hs-jkt-3',
    reportCode: 'PTR-202611-JKT03',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. Kebon Sirih Barat (Depan Halte)',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(43),
    actionSubmittedAt: hoursAgoIso(42),
    validatedAt: hoursAgoIso(40),
    responseSlaMinutes: 60,
    relocationSiteName: 'JP 42 Kuliner Sabang Binaan',
  },
];

function findMockCity(cityParam?: string): PublicCityItem | null {
  const norm = normalizeCityParam(cityParam);
  if (!norm) return null;
  const lower = norm.toLowerCase();
  return (
    MOCK_PUBLIC_CITIES.find(
      (c) => c.city.toLowerCase() === lower || c.code.toLowerCase() === lower,
    ) ?? null
  );
}

// ============================================================================
// PUBLIC API CLIENT
// ============================================================================

export const publicApi = {
  async listCities(): Promise<PublicCityItem[]> {
    if (!IS_BACKEND_ENABLED) {
      return MOCK_PUBLIC_CITIES;
    }
    const res = await apiFetch<{ cities: PublicCityItem[] }>('/api/public/cities', {
      skipAuth: true,
    });
    return res.data.cities;
  },

  async getOverview(city?: string): Promise<PublicOverviewData> {
    const normalized = normalizeCityParam(city);
    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      const items = matched
        ? MOCK_AUDIT_FEED.filter((item) => item.city === matched.city)
        : MOCK_AUDIT_FEED;

      const totalViolationsThisMonth = items.length;
      const validated = items.filter((i) => i.status === 'VALIDATED');
      const resolutionRatePercent =
        items.length === 0
          ? 0
          : Math.round((validated.length / items.length) * 1000) / 10;

      const slas = items
        .map((i) => i.responseSlaMinutes)
        .filter((v): v is number => v !== null);
      const avgResponseSlaMinutes =
        slas.length === 0
          ? null
          : Math.round(slas.reduce((acc, v) => acc + v, 0) / slas.length);

      const relocatedCount = validated.filter((i) => i.relocationSiteName).length * 2 + 1;

      return {
        city: matched ? matched.city : 'Semua Kota',
        kpi: {
          totalViolationsThisMonth,
          resolutionRatePercent,
          avgResponseSlaMinutes,
          totalPklDirectedToRelocation: validated.length === 0 ? 0 : relocatedCount,
        },
      };
    }

    const suffix = normalized ? `?city=${encodeURIComponent(normalized)}` : '';
    const res = await apiFetch<PublicOverviewData>(`/api/public/overview${suffix}`, {
      skipAuth: true,
    });
    return res.data;
  },

  async getMap(city?: string): Promise<PublicMapData> {
    const normalized = normalizeCityParam(city);
    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      if (matched) {
        return {
          region: {
            city: matched.city,
            centerLat: matched.centerLat,
            centerLng: matched.centerLng,
            defaultZoom: matched.defaultZoom,
          },
          zones: MOCK_ZONES_BY_CITY[matched.city] ?? [],
          hotspots: MOCK_HOTSPOTS_BY_CITY[matched.city] ?? [],
          relocationSites: MOCK_SITES_BY_CITY[matched.city] ?? [],
        };
      }

      return {
        region: {
          city: 'Semua Kota',
          centerLat: -6.75,
          centerLng: 108.6,
          defaultZoom: 7,
        },
        zones: Object.values(MOCK_ZONES_BY_CITY).flat(),
        hotspots: Object.values(MOCK_HOTSPOTS_BY_CITY).flat(),
        relocationSites: Object.values(MOCK_SITES_BY_CITY).flat(),
      };
    }

    const suffix = normalized ? `?city=${encodeURIComponent(normalized)}` : '';
    const res = await apiFetch<PublicMapData>(`/api/public/map${suffix}`, {
      skipAuth: true,
    });
    return res.data;
  },

  async getAuditFeed(params?: {
    city?: string;
    limit?: number;
  }): Promise<{
    items: PublicAuditFeedItemDto[];
    meta: { city: string; limit: number; total: number };
  }> {
    const normalized = normalizeCityParam(params?.city);
    const limit = params?.limit ?? 20;

    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      const filtered = matched
        ? MOCK_AUDIT_FEED.filter((item) => item.city === matched.city)
        : MOCK_AUDIT_FEED;
      const items = filtered.slice(0, limit);
      return {
        items,
        meta: {
          city: matched ? matched.city : 'Semua Kota',
          limit,
          total: items.length,
        },
      };
    }

    const qs = new URLSearchParams();
    if (normalized) qs.set('city', normalized);
    qs.set('limit', String(limit));

    const res = await apiFetch<
      { items: PublicAuditFeedItemDto[] },
      { city: string; limit: number; total: number }
    >(`/api/public/audit-feed?${qs.toString()}`, { skipAuth: true });

    return {
      items: res.data.items,
      meta: res.meta ?? {
        city: normalized ?? 'Semua Kota',
        limit,
        total: res.data.items.length,
      },
    };
  },
};
