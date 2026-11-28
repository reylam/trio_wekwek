import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { signAuthToken } from '../middlewares/auth.js';
import errorHandler from '../middlewares/errorHandler.js';
import type {
  DinasAnalyticsReportRow,
  DinasAnalyticsSiteRow,
  DinasRepositoryPort,
} from '../repository/dinas.repository.js';
import type {
  RelocationSiteRecord,
  RelocationSiteRepositoryPort,
} from '../repository/relocationSite.repository.js';
import { createDinasService } from './dinas.service.js';
import { createDinasController } from '../controller/dinas.controller.js';
import { createDinasRouter } from '../routes/dinas.route.js';
import { createRelocationSiteService } from './relocationSite.service.js';
import { createRelocationSiteController } from '../controller/relocationSite.controller.js';
import { createRelocationSiteRouter } from '../routes/relocationSite.route.js';

const TEST_JWT_SECRET = 'patra-test-secret-minimum-32-characters-long';

const DINAS_JKT_TOKEN = signAuthToken(
  {
    sub: 'u-dinas-jkp',
    role: 'DINAS_UMKM',
    regionId: 'reg-jkp',
    city: 'Kota Jakarta Pusat',
    email: 'sudin.jakpus@patra.demo',
  },
  TEST_JWT_SECRET,
);

const SATPOL_JKT_TOKEN = signAuthToken(
  {
    sub: 'u-satpol-jkp',
    role: 'SATPOL_PP',
    regionId: 'reg-jkp',
    city: 'Kota Jakarta Pusat',
    email: 'satpol.jakpus@patra.demo',
  },
  TEST_JWT_SECRET,
);

const DINAS_SMG_TOKEN = signAuthToken(
  {
    sub: 'u-dinas-smg',
    role: 'DINAS_UMKM',
    regionId: 'reg-smg',
    city: 'Kota Semarang',
    email: 'dinas.semarang@patra.demo',
  },
  TEST_JWT_SECRET,
);

function makeRelocationHarness() {
  let seq = 0;
  const now = new Date('2026-11-22T08:00:00.000Z');
  const sites: RelocationSiteRecord[] = [
    {
      id: 'site-jkp-ref',
      regionId: 'reg-jkp',
      name: 'Lokasi Binaan Thamrin City',
      address: 'Jl. Thamrin Boulevard, Tanah Abang',
      lat: -6.1944,
      lng: 106.8195,
      tradeCategories: ['Kuliner', 'Minuman'],
      facilities: ['Listrik', 'Air Bersih'],
      maxCapacity: 25,
      occupiedCapacity: 10,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'site-jkp-unref',
      regionId: 'reg-jkp',
      name: 'Sentra Kebon Kacang',
      address: 'Jl. Kebon Kacang Raya, Tanah Abang',
      lat: -6.1912,
      lng: 106.8178,
      tradeCategories: ['Kuliner'],
      facilities: ['Parkir'],
      maxCapacity: 15,
      occupiedCapacity: 15,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'site-smg-1',
      regionId: 'reg-smg',
      name: 'Sentra Simpang Lima',
      address: 'Jl. Pahlawan, Semarang Tengah',
      lat: -6.9905,
      lng: 110.4234,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
      maxCapacity: 20,
      occupiedCapacity: 5,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const referencedSiteIds = new Set<string>(['site-jkp-ref']);

  const repo: RelocationSiteRepositoryPort = {
    async findActiveByRegion(regionId) {
      return sites.filter((s) => s.regionId === regionId && s.isActive);
    },
    async findPendingCapacityMapByRegion(regionId) {
      if (regionId === 'reg-jkp') {
        return new Map([['site-jkp-ref', 2]]);
      }
      return new Map();
    },
    async findById(id) {
      return sites.find((s) => s.id === id) ?? null;
    },
    async create(data) {
      const rec: RelocationSiteRecord = {
        id: `site-new-${++seq}`,
        regionId: data.regionId,
        name: data.name,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        tradeCategories: data.tradeCategories,
        facilities: data.facilities,
        maxCapacity: data.maxCapacity,
        occupiedCapacity: data.occupiedCapacity,
        isActive: true,
        createdAt: new Date(now.getTime() + seq * 1000),
        updatedAt: new Date(now.getTime() + seq * 1000),
      };
      sites.push(rec);
      return rec;
    },
    async update(id, data) {
      const rec = sites.find((s) => s.id === id)!;
      if (data.name !== undefined) rec.name = data.name;
      if (data.address !== undefined) rec.address = data.address;
      if (data.lat !== undefined) rec.lat = data.lat;
      if (data.lng !== undefined) rec.lng = data.lng;
      if (data.tradeCategories !== undefined) {
        rec.tradeCategories = data.tradeCategories;
      }
      if (data.facilities !== undefined) rec.facilities = data.facilities;
      if (data.maxCapacity !== undefined) rec.maxCapacity = data.maxCapacity;
      if (data.occupiedCapacity !== undefined) rec.occupiedCapacity = data.occupiedCapacity;
      rec.updatedAt = new Date(now.getTime() + 5000);
      return rec;
    },
    async countReferencingReports(id) {
      return referencedSiteIds.has(id) ? 1 : 0;
    },
    async softArchive(id) {
      const rec = sites.find((s) => s.id === id)!;
      rec.isActive = false;
      rec.updatedAt = new Date(now.getTime() + 6000);
      return rec;
    },
    async hardDelete(id) {
      const idx = sites.findIndex((s) => s.id === id);
      if (idx >= 0) sites.splice(idx, 1);
    },
  };

  const service = createRelocationSiteService(repo);
  const app = express();
  app.use(express.json());
  app.use(
    '/api/relocation-sites',
    createRelocationSiteRouter({
      controller: createRelocationSiteController(service),
      jwtSecret: TEST_JWT_SECRET,
    }),
  );
  app.use(errorHandler);

  return { app, sites };
}

test('CRUD /api/relocation-sites enforces RBAC, region-lock, no-quota, and soft-archive BR-008', async () => {
  const { app, sites } = makeRelocationHarness();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. SATPOL_PP boleh GET lokasi binaan di kotanya saja (2 lokasi jkp, bukan smg)
    const satpolList = await fetch(`${baseUrl}/api/relocation-sites`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(satpolList.status, 200);
    const satpolJson = (await satpolList.json()) as any;
    assert.equal(satpolJson.data.relocationSites.length, 2);
    assert.equal('quota' in satpolJson.data.relocationSites[0], false);
    const refSite = satpolJson.data.relocationSites.find((s: any) => s.id === 'site-jkp-ref');
    const unrefSite = satpolJson.data.relocationSites.find((s: any) => s.id === 'site-jkp-unref');
    assert.equal(refSite.maxCapacity, 25);
    assert.equal(refSite.occupiedCapacity, 10);
    assert.equal(refSite.pendingCapacity, 2);
    assert.equal(refSite.availableCapacity, 15);
    assert.equal(refSite.effectiveAvailableCapacity, 13);
    assert.equal(refSite.capacityStatus, 'AVAILABLE');
    assert.equal(unrefSite.capacityStatus, 'FULL');
    assert.equal(unrefSite.availableCapacity, 0);

    // 2. SATPOL_PP ditolak saat POST/PATCH/DELETE (403 FORBIDDEN_ROLE)
    const satpolCreate = await fetch(`${baseUrl}/api/relocation-sites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tes Satpol',
        address: 'Jl. Tes Satpol 123',
        lat: -6.19,
        lng: 106.82,
        tradeCategories: ['Kuliner'],
        facilities: ['Listrik'],
      }),
    });
    assert.equal(satpolCreate.status, 403);
    assert.equal(((await satpolCreate.json()) as any).error.code, 'FORBIDDEN_ROLE');

    // 3. DINAS_UMKM berhasil CREATE lokasi binaan (regionId ter-inject dari token)
    const createdRes = await fetch(`${baseUrl}/api/relocation-sites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Lokasi Binaan JP 28 Pasar Baru',
        address: 'Jl. Pasar Baru Raya, Sawah Besar',
        lat: -6.1652,
        lng: 106.8342,
        tradeCategories: ['Kuliner', 'Kerajinan'],
        facilities: ['Listrik', 'Toilet'],
        maxCapacity: 30,
        occupiedCapacity: 5,
      }),
    });
    assert.equal(createdRes.status, 201);
    const createdJson = (await createdRes.json()) as any;
    const newId = createdJson.data.relocationSite.id as string;
    assert.equal(createdJson.data.relocationSite.regionId, 'reg-jkp');
    assert.equal(createdJson.data.relocationSite.maxCapacity, 30);
    assert.equal(createdJson.data.relocationSite.occupiedCapacity, 5);
    assert.equal(createdJson.data.relocationSite.availableCapacity, 25);
    assert.equal('quota' in createdJson.data.relocationSite, false);

    // 3b. Menurunkan maxCapacity < occupiedCapacity -> 400 INVALID_CAPACITY_RANGE
    const badCapPatch = await fetch(`${baseUrl}/api/relocation-sites/${newId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ maxCapacity: 3 }),
    });
    assert.equal(badCapPatch.status, 400);
    assert.equal(((await badCapPatch.json()) as any).error.code, 'INVALID_CAPACITY_RANGE');

    // 4. PATCH & DELETE lintas kota -> 403 REGION_ACCESS_DENIED
    const crossPatch = await fetch(`${baseUrl}/api/relocation-sites/${newId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${DINAS_SMG_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Ubah Lintas Kota' }),
    });
    assert.equal(crossPatch.status, 403);
    assert.equal(((await crossPatch.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    // 5. PATCH oleh DINAS_UMKM kota sama -> 200 OK
    const okPatch = await fetch(`${baseUrl}/api/relocation-sites/${newId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'JP 28 Pasar Baru Terpadu' }),
    });
    assert.equal(okPatch.status, 200);
    assert.equal(
      ((await okPatch.json()) as any).data.relocationSite.name,
      'JP 28 Pasar Baru Terpadu',
    );

    // 6. DELETE lokasi belum direferensikan laporan -> hard delete (archived: false)
    const hardDel = await fetch(`${baseUrl}/api/relocation-sites/site-jkp-unref`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(hardDel.status, 200);
    assert.deepEqual(((await hardDel.json()) as any).data, {
      deletedId: 'site-jkp-unref',
      archived: false,
    });
    assert.equal(sites.some((s) => s.id === 'site-jkp-unref'), false);

    // 7. DELETE lokasi yang sudah direferensikan laporan -> soft-archive (archived: true, record tetap ada)
    const softDel = await fetch(`${baseUrl}/api/relocation-sites/site-jkp-ref`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(softDel.status, 200);
    assert.deepEqual(((await softDel.json()) as any).data, {
      deletedId: 'site-jkp-ref',
      archived: true,
    });
    const archivedRecord = sites.find((s) => s.id === 'site-jkp-ref');
    assert.ok(archivedRecord);
    assert.equal(archivedRecord.isActive, false);

    // 8. Soft-archived site tidak muncul lagi di GET list aktif, dan tidak bisa di-PATCH (409)
    const afterList = await fetch(`${baseUrl}/api/relocation-sites`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    const afterJson = (await afterList.json()) as any;
    assert.equal(afterJson.data.relocationSites.length, 1);
    assert.equal(afterJson.data.relocationSites[0].id, newId);

    const patchArchived = await fetch(
      `${baseUrl}/api/relocation-sites/site-jkp-ref`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Edit Arsip' }),
      },
    );
    assert.equal(patchArchived.status, 409);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

test('GET /api/dinas/analytics computes KPIs, WIB 30d trend, 24 peak hours, top 5 streets, and planningMap without cameras', async () => {
  // Waktu patokan: 2026-11-22T20:00:00Z = 2026-11-23 03:00 WIB
  const fixedNow = new Date('2026-11-22T20:00:00.000Z');

  const reportsByRegion: Record<string, DinasAnalyticsReportRow[]> = {
    'reg-jkp': [
      {
        id: 'rep-1',
        status: 'VALIDATED',
        address: 'Jl. M.H. Thamrin',
        lat: -6.2005,
        lng: 106.8229,
        detectedCount: 2,
        actualPklCount: 3,
        assignedTeamId: 'team-jkp-1',
        // created 2026-11-22T18:00:00Z -> 2026-11-23 01:00 WIB (+45 menit SLA)
        createdAt: new Date('2026-11-22T18:00:00.000Z'),
        actionSubmittedAt: new Date('2026-11-22T18:45:00.000Z'),
        relocationSiteId: 'site-1',
        relocationMatchStatus: 'NEAREST_AVAILABLE',
        unaccommodatedPklCount: 0,
        hasRevision: false,
      },
      {
        id: 'rep-2',
        status: 'VALIDATED',
        address: 'Jl. M.H. Thamrin',
        lat: -6.2006,
        lng: 106.823,
        detectedCount: 1,
        actualPklCount: null,
        assignedTeamId: 'team-jkp-1',
        // created 2026-11-21T10:00:00Z -> 2026-11-21 17:00 WIB (+15 menit SLA)
        createdAt: new Date('2026-11-21T10:00:00.000Z'),
        actionSubmittedAt: new Date('2026-11-21T10:15:00.000Z'),
        relocationSiteId: null,
        relocationMatchStatus: null,
        unaccommodatedPklCount: 0,
        hasRevision: true,
      },
      {
        id: 'rep-3',
        status: 'PENDING_VALIDATION',
        address: 'Jl. Kebon Sirih',
        lat: -6.183,
        lng: 106.83,
        detectedCount: 4,
        actualPklCount: 4,
        assignedTeamId: 'team-jkp-2',
        // created 2026-11-21T10:30:00Z -> 2026-11-21 17:30 WIB (+30 menit SLA)
        createdAt: new Date('2026-11-21T10:30:00.000Z'),
        actionSubmittedAt: new Date('2026-11-21T11:00:00.000Z'),
        relocationSiteId: null,
        relocationMatchStatus: 'SPLIT_FALLBACK',
        unaccommodatedPklCount: 1,
        hasRevision: false,
      },
      {
        id: 'rep-4',
        status: 'NEED_ACTION',
        address: 'Jl. Pasar Tanah Abang',
        lat: -6.188,
        lng: 106.814,
        detectedCount: 2,
        actualPklCount: null,
        assignedTeamId: 'team-jkp-1',
        createdAt: new Date('2026-11-20T01:00:00.000Z'), // 08:00 WIB
        actionSubmittedAt: null,
        relocationSiteId: null,
        relocationMatchStatus: null,
        unaccommodatedPklCount: 0,
        hasRevision: false,
      },
      {
        id: 'rep-5',
        status: 'NEEDS_REVISION',
        address: 'Jl. Medan Merdeka Selatan',
        lat: -6.18,
        lng: 106.828,
        detectedCount: 1,
        actualPklCount: 1,
        assignedTeamId: 'team-jkp-2',
        createdAt: new Date('2026-11-19T01:00:00.000Z'), // 08:00 WIB
        actionSubmittedAt: new Date('2026-11-19T01:30:00.000Z'), // +30m
        relocationSiteId: null,
        relocationMatchStatus: null,
        unaccommodatedPklCount: 0,
        hasRevision: true,
      },
      {
        id: 'rep-6',
        status: 'NEED_ACTION',
        address: 'Jl. Sabang',
        lat: -6.185,
        lng: 106.824,
        detectedCount: 1,
        actualPklCount: null,
        assignedTeamId: 'team-jkp-2',
        createdAt: new Date('2026-11-18T02:00:00.000Z'), // 09:00 WIB
        actionSubmittedAt: null,
        relocationSiteId: null,
        relocationMatchStatus: null,
        unaccommodatedPklCount: 0,
        hasRevision: false,
      },
      {
        id: 'rep-7',
        status: 'NEED_ACTION',
        address: 'Jl. Cikini Raya',
        lat: -6.192,
        lng: 106.84,
        detectedCount: 1,
        actualPklCount: null,
        assignedTeamId: null,
        createdAt: new Date('2026-11-17T02:00:00.000Z'), // 09:00 WIB
        actionSubmittedAt: null,
        relocationSiteId: null,
        relocationMatchStatus: null,
        unaccommodatedPklCount: 0,
        hasRevision: false,
      },
    ],
    'reg-smg': [
      {
        id: 'rep-smg-only',
        status: 'VALIDATED',
        address: 'Jl. Pandanaran Semarang',
        lat: -6.99,
        lng: 110.42,
        detectedCount: 5,
        actualPklCount: 5,
        assignedTeamId: null,
        createdAt: new Date('2026-11-22T01:00:00.000Z'),
        actionSubmittedAt: new Date('2026-11-22T01:20:00.000Z'),
        relocationSiteId: 'site-smg',
        relocationMatchStatus: 'NEAREST_AVAILABLE',
        unaccommodatedPklCount: 0,
        hasRevision: false,
      },
    ],
  };

  const sitesByRegion: Record<string, DinasAnalyticsSiteRow[]> = {
    'reg-jkp': [
      {
        id: 'site-1',
        name: 'Thamrin City JP 37',
        lat: -6.1944,
        lng: 106.8195,
        address: 'Jl. Thamrin Boulevard',
        facilities: ['Listrik', 'Toilet'],
        maxCapacity: 25,
        occupiedCapacity: 20,
        pendingCapacity: 2,
      },
    ],
    'reg-smg': [
      {
        id: 'site-smg',
        name: 'Sentra Simpang Lima',
        lat: -6.99,
        lng: 110.423,
        address: 'Simpang Lima',
        facilities: ['Listrik'],
        maxCapacity: 20,
        occupiedCapacity: 5,
        pendingCapacity: 0,
      },
    ],
  };

  const patrolTeamsByRegion = {
    'reg-jkp': [
      {
        id: 'team-jkp-1',
        code: 'jkp-tim-1-tanah-abang',
        name: 'Tim 1 Jakarta Pusat — Tanah Abang',
        assignedDistricts: ['Tanah Abang', 'Menteng'],
      },
      {
        id: 'team-jkp-2',
        code: 'jkp-tim-2-gambir',
        name: 'Tim 2 Jakarta Pusat — Gambir',
        assignedDistricts: ['Gambir', 'Sawah Besar'],
      },
    ],
  };

  const repo: DinasRepositoryPort = {
    async getAnalyticsInputsByRegion(regionId) {
      return {
        reports: reportsByRegion[regionId] ?? [],
        relocationSites: sitesByRegion[regionId] ?? [],
        patrolTeams: patrolTeamsByRegion[regionId as keyof typeof patrolTeamsByRegion] ?? [],
      };
    },
  };

  const service = createDinasService({ repo, now: () => fixedNow });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/dinas',
    createDinasRouter({
      controller: createDinasController(service),
      jwtSecret: TEST_JWT_SECRET,
    }),
  );
  app.use(errorHandler);

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. SATPOL_PP ditolak (403 FORBIDDEN_ROLE)
    const satpolRes = await fetch(`${baseUrl}/api/dinas/analytics`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(satpolRes.status, 403);

    // 2. DINAS_UMKM Jakarta Pusat -> region-locked & perhitungan tepat
    const res = await fetch(`${baseUrl}/api/dinas/analytics`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const d = body.data;

    // 2 dari 7 laporan VALIDATED = 28.6%, rata-rata SLA (45+15+30+30)/4 = 30 menit
    assert.deepEqual(d.kpi, {
      totalIncomingReports: 7,
      validatedPercent: 28.6,
      avgResponseSlaMinutes: 30,
      totalRelocationDirected: 1,
    });

    // Tren 30 hari WIB berakhir di 2026-11-23 (karena 2026-11-22T20:00Z = 2026-11-23 03:00 WIB)
    assert.equal(d.dailyTrend.length, 30);
    assert.equal(d.dailyTrend.at(-1).date, '2026-11-23');
    // rep-1 dibuat 18:00Z = 01:00 WIB tgl 23
    assert.equal(d.dailyTrend.at(-1).count, 1);

    // 24 jam WIB (00:00 .. 23:00)
    assert.equal(d.peakHoursWib.length, 24);
    assert.equal(d.peakHoursWib[1].label, '01:00');
    assert.equal(d.peakHoursWib[1].count, 1); // rep-1 (18:00Z -> 01:00 WIB)
    assert.equal(d.peakHoursWib[17].label, '17:00');
    assert.equal(d.peakHoursWib[17].count, 2); // rep-2 & rep-3 (10:00Z & 10:30Z -> 17:00 WIB)

    // Top 5 jalan (maks 5 dari 6 jalan unik; Thamrin #1)
    assert.equal(d.topHotspotStreets.length, 5);
    assert.deepEqual(d.topHotspotStreets[0], {
      address: 'Jl. M.H. Thamrin',
      count: 2,
      validatedCount: 2,
    });

    // PlanningMap: hanya titik VALIDATED, lokasi binaan aktif kota sendiri, TANPA pin CCTV!
    assert.equal('cameras' in d.planningMap, false);
    assert.equal(d.planningMap.validatedPoints.length, 2);
    assert.equal(d.planningMap.validatedPoints[0].weight, 3);
    assert.equal(d.planningMap.relocationSites.length, 1);
    assert.equal(d.planningMap.relocationSites[0].name, 'Thamrin City JP 37');
    assert.equal(d.planningMap.relocationSites[0].capacityStatus, 'NEAR_FULL');
    assert.equal('quota' in d.planningMap.relocationSites[0], false);

    // Capacity overview & team performance breakdown
    assert.deepEqual(d.capacityOverview, {
      totalSites: 1,
      totalMaxCapacity: 25,
      totalOccupiedCapacity: 20,
      totalPendingCapacity: 2,
      totalAvailableCapacity: 5,
      nearFullSitesCount: 1,
      fullSitesCount: 0,
      splitRelocationReportsCount: 1,
      unaccommodatedPklTotal: 1,
    });
    assert.equal(d.teamPerformance.length, 2);
    const team1 = d.teamPerformance.find((t: any) => t.teamId === 'team-jkp-1');
    const team2 = d.teamPerformance.find((t: any) => t.teamId === 'team-jkp-2');
    assert.equal(team1.totalReports, 3);
    assert.equal(team1.validatedCount, 2);
    assert.equal(team1.avgResponseSlaMinutes, 30);
    assert.equal(team1.revisionRatePercent, 33.3);
    assert.equal(team2.totalReports, 3);
    assert.equal(team2.needsRevisionCount, 1);
    assert.equal(team2.revisionRatePercent, 33.3);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
