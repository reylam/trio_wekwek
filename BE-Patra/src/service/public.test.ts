import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { ReportStatus } from '../interface/index.js';
import errorHandler from '../middlewares/errorHandler.js';
import type {
  PublicAuditFeedRecord,
  PublicHotspotRecord,
  PublicRegionRecord,
  PublicRelocationSiteRecord,
  PublicReportMetricRecord,
  PublicRepositoryPort,
  PublicZoneRecord,
} from '../repository/public.repository.js';
import { createPublicService } from './public.service.js';
import { createPublicController } from '../controller/public.controller.js';
import { createPublicRouter } from '../routes/public.route.js';

const MOCK_REGIONS: PublicRegionRecord[] = [
  {
    id: 'reg-jkp',
    code: 'jkt-pusat',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    centerLat: -6.186486,
    centerLng: 106.834091,
    defaultZoom: 13,
  },
  {
    id: 'reg-smg',
    code: 'semarang',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    centerLat: -6.984049,
    centerLng: 110.409582,
    defaultZoom: 13,
  },
  {
    id: 'reg-empty',
    code: 'bandung',
    city: 'Kota Bandung',
    province: 'Jawa Barat',
    centerLat: -6.9175,
    centerLng: 107.6191,
    defaultZoom: 13,
  },
];

interface SeedMetricRow extends PublicReportMetricRecord {
  regionId: string;
}

const MOCK_METRICS: SeedMetricRow[] = [
  // Jakarta Pusat: 2 laporan bulan Nov 2026 + 1 laporan bulan Okt 2026
  {
    regionId: 'reg-jkp',
    status: 'VALIDATED',
    detectedCount: 2,
    actualPklCount: 3,
    relocationSiteId: 'site-jkp-1',
    createdAt: new Date('2026-11-20T02:00:00.000Z'),
    actionSubmittedAt: new Date('2026-11-20T02:30:00.000Z'), // 30m
  },
  {
    regionId: 'reg-jkp',
    status: 'NEED_ACTION',
    detectedCount: 1,
    actualPklCount: null,
    relocationSiteId: null,
    createdAt: new Date('2026-11-22T08:00:00.000Z'),
    actionSubmittedAt: null,
  },
  {
    regionId: 'reg-jkp',
    status: 'VALIDATED',
    detectedCount: 2,
    actualPklCount: 2,
    relocationSiteId: null,
    createdAt: new Date('2026-10-15T05:00:00.000Z'), // bulan lalu
    actionSubmittedAt: new Date('2026-10-15T06:00:00.000Z'), // 60m
  },
  // Semarang: 1 laporan bulan Nov 2026
  {
    regionId: 'reg-smg',
    status: 'PENDING_VALIDATION',
    detectedCount: 4,
    actualPklCount: 4,
    relocationSiteId: null,
    createdAt: new Date('2026-11-21T04:00:00.000Z'),
    actionSubmittedAt: new Date('2026-11-21T04:40:00.000Z'), // 40m
  },
];

const MOCK_ZONES: Array<PublicZoneRecord & { regionId: string }> = [
  {
    id: 'z-jkp-1',
    regionId: 'reg-jkp',
    name: 'Trotoar Thamrin',
    points: [
      [106.821, -6.198],
      [106.825, -6.198],
      [106.825, -6.203],
    ],
  },
  {
    id: 'z-smg-1',
    regionId: 'reg-smg',
    name: 'Simpang Lima',
    points: [
      [110.421, -6.988],
      [110.425, -6.988],
      [110.425, -6.992],
    ],
  },
];

const MOCK_HOTSPOTS: Array<PublicHotspotRecord & { regionId: string }> = [
  {
    regionId: 'reg-jkp',
    id: 'rep-1',
    reportCode: 'PTR-202611-JKP01',
    address: 'Jl. M.H. Thamrin, Jakarta Pusat',
    lat: -6.2005,
    lng: 106.8229,
    detectedCount: 2,
    status: 'VALIDATED',
    createdAt: new Date('2026-11-20T02:00:00.000Z'),
  },
  {
    regionId: 'reg-smg',
    id: 'rep-2',
    reportCode: 'PTR-202611-SMG01',
    address: 'Simpang Lima Utara, Semarang',
    lat: -6.9901,
    lng: 110.4229,
    detectedCount: 4,
    status: 'PENDING_VALIDATION',
    createdAt: new Date('2026-11-21T04:00:00.000Z'),
  },
];

const MOCK_SITES: Array<PublicRelocationSiteRecord & { regionId: string }> = [
  {
    regionId: 'reg-jkp',
    id: 'site-jkp-1',
    name: 'Lokasi Binaan JP 37 Thamrin City',
    address: 'Jl. Thamrin Boulevard',
    lat: -6.1944,
    lng: 106.8195,
    tradeCategories: ['Kuliner'],
    facilities: ['Listrik', 'Toilet'],
  },
];

const MOCK_FEED: Array<PublicAuditFeedRecord & { regionId: string }> = [
  {
    regionId: 'reg-jkp',
    id: 'rep-1',
    reportCode: 'PTR-202611-JKP01',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. M.H. Thamrin, Jakarta Pusat',
    status: 'VALIDATED' as ReportStatus,
    createdAt: new Date('2026-11-20T02:00:00.000Z'),
    actionSubmittedAt: new Date('2026-11-20T02:30:00.000Z'),
    validatedAt: new Date('2026-11-20T03:15:00.000Z'),
    relocationSiteName: 'Lokasi Binaan JP 37 Thamrin City',
  },
];

function createMockPublicRepo(): PublicRepositoryPort {
  return {
    async findAllRegions() {
      return MOCK_REGIONS;
    },
    async findRegionByCityOrCode(cityOrCode: string) {
      const q = cityOrCode.trim().toLowerCase();
      return (
        MOCK_REGIONS.find(
          (r) => r.city.toLowerCase() === q || r.code.toLowerCase() === q,
        ) ?? null
      );
    },
    async findReportMetrics(regionId?: string) {
      return regionId
        ? MOCK_METRICS.filter((m) => m.regionId === regionId)
        : MOCK_METRICS;
    },
    async findMapData(regionId?: string) {
      return {
        zones: regionId
          ? MOCK_ZONES.filter((z) => z.regionId === regionId)
          : MOCK_ZONES,
        hotspots: regionId
          ? MOCK_HOTSPOTS.filter((h) => h.regionId === regionId)
          : MOCK_HOTSPOTS,
        relocationSites: regionId
          ? MOCK_SITES.filter((s) => s.regionId === regionId)
          : MOCK_SITES,
      };
    },
    async findAuditFeed(limit: number, regionId?: string) {
      const list = regionId
        ? MOCK_FEED.filter((f) => f.regionId === regionId)
        : MOCK_FEED;
      return list.slice(0, limit);
    },
  };
}

async function withPublicServer(fn: (baseUrl: string) => Promise<void>) {
  const service = createPublicService({
    repo: createMockPublicRepo(),
    now: () => new Date('2026-11-23T04:00:00.000Z'),
  });
  const app = express();
  app.use(
    '/api/public',
    createPublicRouter({ controller: createPublicController(service) }),
  );
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('Public portal endpoints return KPIs, map without raw photos, and audit feed cleanly', async () => {
  await withPublicServer(async (baseUrl) => {
    // 1. GET /api/public/cities + Edge Cache header
    const citiesRes = await fetch(`${baseUrl}/api/public/cities`);
    assert.equal(citiesRes.status, 200);
    assert.equal(
      citiesRes.headers.get('cache-control'),
      's-maxage=900, stale-while-revalidate=60',
    );
    const citiesJson = (await citiesRes.json()) as any;
    assert.equal(citiesJson.data.cities.length, 3);

    // 2. GET /api/public/overview for Jakarta Pusat (only 2 reports in Nov 2026, 2/3 validated = 66.7%, avg SLA = (30+60)/2 = 45, 3 PKL relocated)
    const ovRes = await fetch(
      `${baseUrl}/api/public/overview?city=${encodeURIComponent('Kota Jakarta Pusat')}`,
    );
    assert.equal(ovRes.status, 200);
    const ovJson = (await ovRes.json()) as any;
    assert.equal(ovJson.data.city, 'Kota Jakarta Pusat');
    assert.deepEqual(ovJson.data.kpi, {
      totalViolationsThisMonth: 2,
      resolutionRatePercent: 66.7,
      avgResponseSlaMinutes: 45,
      totalPklDirectedToRelocation: 3,
    });

    // 3. GET /api/public/overview without city -> Semua Kota
    const ovAllRes = await fetch(`${baseUrl}/api/public/overview`);
    assert.equal(ovAllRes.status, 200);
    const ovAllJson = (await ovAllRes.json()) as any;
    assert.equal(ovAllJson.data.city, 'Semua Kota');
    assert.equal(ovAllJson.data.kpi.totalViolationsThisMonth, 3);

    // 4. GET /api/public/map -> strictly NO beforeImageUrl, afterImageUrl, quota, or capacity
    const mapRes = await fetch(
      `${baseUrl}/api/public/map?city=${encodeURIComponent('Kota Jakarta Pusat')}`,
    );
    assert.equal(mapRes.status, 200);
    const mapText = await mapRes.text();
    assert.equal(mapText.includes('beforeImageUrl'), false);
    assert.equal(mapText.includes('afterImageUrl'), false);
    assert.equal(mapText.includes('quota'), false);
    assert.equal(mapText.includes('capacity'), false);
    const mapJson = JSON.parse(mapText) as any;
    assert.equal(mapJson.data.zones.length, 1);
    assert.equal(mapJson.data.hotspots.length, 1);
    assert.equal(mapJson.data.relocationSites.length, 1);

    // 5. GET /api/public/audit-feed
    const feedRes = await fetch(
      `${baseUrl}/api/public/audit-feed?city=${encodeURIComponent('Kota Jakarta Pusat')}&limit=5`,
    );
    assert.equal(feedRes.status, 200);
    const feedText = await feedRes.text();
    assert.equal(feedText.includes('beforeImageUrl'), false);
    assert.equal(feedText.includes('afterImageUrl'), false);
    const feedJson = JSON.parse(feedText) as any;
    assert.equal(feedJson.data.items.length, 1);
    assert.equal(feedJson.data.items[0].responseSlaMinutes, 30);
    assert.equal(
      feedJson.data.items[0].relocationSiteName,
      'Lokasi Binaan JP 37 Thamrin City',
    );
  });
});

test('Public portal edge & failure cases: empty city, unknown city (404), and invalid limit (400)', async () => {
  await withPublicServer(async (baseUrl) => {
    // 1. Empty city (Kota Bandung) -> zero metrics without NaN
    const emptyRes = await fetch(`${baseUrl}/api/public/overview?city=bandung`);
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as any;
    assert.deepEqual(emptyJson.data.kpi, {
      totalViolationsThisMonth: 0,
      resolutionRatePercent: 0,
      avgResponseSlaMinutes: null,
      totalPklDirectedToRelocation: 0,
    });

    // 2. Unknown city -> 404 CITY_NOT_FOUND across overview, map, and audit-feed
    for (const path of [
      '/api/public/overview?city=Kota%20Fiktif',
      '/api/public/map?city=Kota%20Fiktif',
      '/api/public/audit-feed?city=Kota%20Fiktif',
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 404);
      assert.equal(((await res.json()) as any).error.code, 'CITY_NOT_FOUND');
    }

    // 3. Invalid limit bounds -> 400 VALIDATION_ERROR
    for (const badLimit of ['0', '100']) {
      const res = await fetch(`${baseUrl}/api/public/audit-feed?limit=${badLimit}`);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as any).error.code, 'VALIDATION_ERROR');
    }
  });
});
