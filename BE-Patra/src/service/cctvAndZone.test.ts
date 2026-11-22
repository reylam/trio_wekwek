import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { CctvQueryParams, GeoLngLat, NormalizedPolygon } from '../interface/index.js';
import { signAuthToken } from '../middlewares/auth.js';
import errorHandler from '../middlewares/errorHandler.js';
import type { CctvCameraRecord, CctvRepositoryPort } from '../repository/cctv.repository.js';
import type { RestrictedZoneRecord, ZoneRepositoryPort } from '../repository/zone.repository.js';
import { createCctvService } from './cctv.service.js';
import { createCctvController } from '../controller/cctv.controller.js';
import { createCctvRouter } from '../routes/cctv.route.js';
import { createZoneService, validateZonePolygon } from './zone.service.js';
import { createZoneController } from '../controller/zone.controller.js';
import { createZoneRouter } from '../routes/zone.route.js';

const TEST_JWT_SECRET = 'patra-test-secret-minimum-32-characters-long';

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

function makeInitialCameras(): CctvCameraRecord[] {
  return [
    {
      id: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
      regionId: 'reg-jkp',
      name: 'JKP POLRI UOB PLAZA C01',
      city: 'Kota Jakarta Pusat',
      province: 'DKI Jakarta',
      island: 'Jawa',
      regionLabel: 'Kebon Melati, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
      district: 'Tanah Abang',
      subdistrict: 'Kebon Melati',
      facilityCategory: 'Pasar & Pusat Belanja',
      streamUrl: 'https://example.com/uob/index.m3u8',
      playbackUrl: 'https://example.com/uob/index.m3u8',
      streamType: 'hls',
      lat: -6.20051,
      lng: 106.82291,
      coordsExact: false,
      needsCorsProxy: false,
      attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
      sourcePortal: 'https://jakcctv.jakarta.go.id/publik',
      roiPolygon: [
        [0.1, 0.5],
        [0.9, 0.5],
        [0.9, 0.9],
      ],
      thumbnailUrl: null,
      fallbackVideoUrl: '/videos/demo-jakarta.mp4',
      isActive: true,
      syncedAt: new Date(),
      activeReportCount: 1,
    },
    {
      id: 'jkt_052_JKP_STASIUN_GAMBIR_C01',
      regionId: 'reg-jkp',
      name: 'JKP STASIUN GAMBIR SELATAN',
      city: 'Kota Jakarta Pusat',
      province: 'DKI Jakarta',
      island: 'Jawa',
      regionLabel: 'Gambir, Kota Jakarta Pusat, DKI Jakarta',
      district: 'Gambir',
      subdistrict: 'Gambir',
      facilityCategory: 'Transportasi Publik',
      streamUrl: 'https://example.com/gambir/index.m3u8',
      playbackUrl: 'https://example.com/gambir/index.m3u8',
      streamType: 'hls',
      lat: -6.17665,
      lng: 106.83058,
      coordsExact: false,
      needsCorsProxy: false,
      attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
      sourcePortal: 'https://jakcctv.jakarta.go.id/publik',
      roiPolygon: null,
      thumbnailUrl: null,
      fallbackVideoUrl: '/videos/demo-jakarta.mp4',
      isActive: true,
      syncedAt: new Date(),
      activeReportCount: 0,
    },
    {
      id: 'smg_001_SIMPANG_LIMA_UTARA',
      regionId: 'reg-smg',
      name: 'SIMPANG LIMA SISI UTARA',
      city: 'Kota Semarang',
      province: 'Jawa Tengah',
      island: 'Jawa',
      regionLabel: 'Semarang Tengah, Kota Semarang, Jawa Tengah',
      district: 'Semarang Tengah',
      subdistrict: 'Karangkidul',
      facilityCategory: 'Ruang Publik',
      streamUrl: 'https://example.com/smg/index.m3u8',
      playbackUrl: 'https://example.com/smg/index.m3u8',
      streamType: 'hls',
      lat: -6.99018,
      lng: 110.42292,
      coordsExact: true,
      needsCorsProxy: false,
      attribution: 'Diskominfo Kota Semarang (PantauSemar)',
      sourcePortal: 'https://pantausemar.semarangkota.go.id',
      roiPolygon: null,
      thumbnailUrl: null,
      fallbackVideoUrl: '/videos/demo-semarang.mp4',
      isActive: true,
      syncedAt: new Date(),
      activeReportCount: 0,
    },
  ];
}

function makeInitialZones(): RestrictedZoneRecord[] {
  const now = new Date();
  return [
    {
      id: 'zone-jkp-1',
      regionId: 'reg-jkp',
      name: 'Trotoar Thamrin',
      description: 'Area pedestrian utama',
      points: [
        [106.821, -6.198],
        [106.825, -6.198],
        [106.825, -6.203],
        [106.821, -6.203],
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'zone-smg-1',
      regionId: 'reg-smg',
      name: 'Pedestrian Simpang Lima',
      description: null,
      points: [
        [110.421, -6.988],
        [110.425, -6.988],
        [110.425, -6.992],
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function withCctvAndZoneServer(fn: (baseUrl: string) => Promise<void>) {
  const cameras = makeInitialCameras();
  const zones = makeInitialZones();
  let zoneCounter = 1;

  const cctvRepo: CctvRepositoryPort = {
    async findManyByRegion(regionId: string, filters: CctvQueryParams = {}) {
      return cameras.filter((c) => {
        if (!c.isActive || c.regionId !== regionId) return false;
        if (filters.district && (c.district || '').toLowerCase() !== filters.district.toLowerCase()) {
          return false;
        }
        if (
          filters.category &&
          (c.facilityCategory || '').toLowerCase() !== filters.category.toLowerCase()
        ) {
          return false;
        }
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const hay = [c.name, c.regionLabel, c.district, c.subdistrict, c.facilityCategory]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    },
    async findByIdWithActiveCount(id: string) {
      return cameras.find((c) => c.id === id) ?? null;
    },
    async updateRoiPolygon(id: string, roiPolygon: NormalizedPolygon | null) {
      const cam = cameras.find((c) => c.id === id)!;
      cam.roiPolygon = roiPolygon;
      return cam;
    },
  };

  const zoneRepo: ZoneRepositoryPort = {
    async findManyByRegion(regionId: string) {
      return zones.filter((z) => z.isActive && z.regionId === regionId);
    },
    async findById(id: string) {
      return zones.find((z) => z.id === id) ?? null;
    },
    async create(data) {
      const now = new Date();
      const rec: RestrictedZoneRecord = {
        id: `zone-new-${++zoneCounter}`,
        regionId: data.regionId,
        name: data.name,
        description: data.description,
        points: data.points,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      zones.push(rec);
      return rec;
    },
    async update(id, data) {
      const z = zones.find((item) => item.id === id)!;
      if (data.name !== undefined) z.name = data.name;
      if (data.description !== undefined) z.description = data.description;
      if (data.points !== undefined) z.points = data.points;
      z.updatedAt = new Date();
      return z;
    },
    async delete(id: string) {
      const idx = zones.findIndex((item) => item.id === id);
      if (idx >= 0) zones.splice(idx, 1);
    },
  };

  const app = express();
  app.use(express.json());

  const cctvRouter = createCctvRouter({
    controller: createCctvController(createCctvService(cctvRepo)),
    jwtSecret: TEST_JWT_SECRET,
  });
  const zoneRouter = createZoneRouter({
    controller: createZoneController(createZoneService(zoneRepo)),
    jwtSecret: TEST_JWT_SECRET,
  });

  app.use('/api/cctv', cctvRouter);
  app.use('/api/zones', zoneRouter);
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

test('CCTV endpoints enforce Edge Cache, region-lock, filters, RBAC, and ROI updates', async () => {
  await withCctvAndZoneServer(async (baseUrl) => {
    // 1. GET /api/cctv returns only Jakarta cameras + Edge Cache headers
    const listRes = await fetch(`${baseUrl}/api/cctv`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(listRes.status, 200);
    assert.equal(
      listRes.headers.get('cache-control'),
      's-maxage=900, stale-while-revalidate=60',
    );
    assert.equal(listRes.headers.get('vary'), 'Authorization');
    const listJson = (await listRes.json()) as any;
    assert.equal(listJson.data.cameras.length, 2);
    assert.equal(listJson.data.cameras[0].hasActiveReport, true);
    assert.equal(listJson.meta.city, 'Kota Jakarta Pusat');

    // 2. Search / district filter
    const filteredRes = await fetch(`${baseUrl}/api/cctv?district=Gambir&search=Stasiun`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(filteredRes.status, 200);
    const filteredJson = (await filteredRes.json()) as any;
    assert.equal(filteredJson.data.cameras.length, 1);
    assert.equal(filteredJson.data.cameras[0].id, 'jkt_052_JKP_STASIUN_GAMBIR_C01');

    // 3. Failure: DINAS_UMKM blocked from /api/cctv -> 403 FORBIDDEN_ROLE
    const dinasBlocked = await fetch(`${baseUrl}/api/cctv`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(dinasBlocked.status, 403);
    assert.equal(((await dinasBlocked.json()) as any).error.code, 'FORBIDDEN_ROLE');

    // 4. Failure: Cross-city GET /api/cctv/:id -> 403 REGION_ACCESS_DENIED
    const crossCity = await fetch(`${baseUrl}/api/cctv/smg_001_SIMPANG_LIMA_UTARA`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(crossCity.status, 403);
    assert.equal(((await crossCity.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    // 5. Failure: Unknown camera -> 404 CCTV_NOT_FOUND
    const notFound = await fetch(`${baseUrl}/api/cctv/unknown-cam-id`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(notFound.status, 404);
    assert.equal(((await notFound.json()) as any).error.code, 'CCTV_NOT_FOUND');

    // 6. PATCH /api/cctv/:id/roi valid normalized polygon & null fallback
    const patchRoi = await fetch(`${baseUrl}/api/cctv/jkt_052_JKP_STASIUN_GAMBIR_C01/roi`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roiPolygon: [
          [0.1, 0.4],
          [0.9, 0.4],
          [0.95, 0.95],
          [0.05, 0.95],
        ],
      }),
    });
    assert.equal(patchRoi.status, 200);
    assert.equal(((await patchRoi.json()) as any).data.camera.roiPolygon.length, 4);

    const clearRoi = await fetch(`${baseUrl}/api/cctv/jkt_052_JKP_STASIUN_GAMBIR_C01/roi`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roiPolygon: null }),
    });
    assert.equal(clearRoi.status, 200);
    assert.equal(((await clearRoi.json()) as any).data.camera.roiPolygon, null);

    // 7. Failure: Out-of-range ROI (> 1) -> 400 & cross-city ROI patch -> 403
    const badRoi = await fetch(`${baseUrl}/api/cctv/jkt_052_JKP_STASIUN_GAMBIR_C01/roi`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roiPolygon: [
          [0.1, 0.4],
          [1.5, 0.4],
          [0.5, 0.9],
        ],
      }),
    });
    assert.equal(badRoi.status, 400);
  });
});

test('Zone endpoints & Turf.js validation handle CRUD, bowtie polygons, RBAC, and region-lock', async () => {
  // Direct Turf validation edge cases
  assert.throws(
    () =>
      validateZonePolygon([
        [106.8, -6.2],
        [106.8, -6.2],
        [106.81, -6.2],
      ]),
    (err: any) => err?.code === 'INVALID_POLYGON',
  );

  await withCctvAndZoneServer(async (baseUrl) => {
    // 1. Both SATPOL_PP and DINAS_UMKM can list same-region zones
    const dinasList = await fetch(`${baseUrl}/api/zones`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(dinasList.status, 200);
    const dinasJson = (await dinasList.json()) as any;
    assert.equal(dinasJson.data.zones.length, 1);
    assert.equal(dinasJson.data.zones[0].id, 'zone-jkp-1');

    // 2. Failure: DINAS_UMKM cannot create zone -> 403 FORBIDDEN_ROLE
    const dinasCreate = await fetch(`${baseUrl}/api/zones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Zona Ditolak',
        points: [
          [106.82, -6.19],
          [106.83, -6.19],
          [106.83, -6.2],
        ],
      }),
    });
    assert.equal(dinasCreate.status, 403);
    assert.equal(((await dinasCreate.json()) as any).error.code, 'FORBIDDEN_ROLE');

    // 3. Failure: Bowtie self-intersecting polygon -> 400 SELF_INTERSECTING_POLYGON
    const bowtie: GeoLngLat[] = [
      [106.82, -6.19],
      [106.83, -6.2],
      [106.83, -6.19],
      [106.82, -6.2],
    ];
    const bowtieRes = await fetch(`${baseUrl}/api/zones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Zona Menyilang', points: bowtie }),
    });
    assert.equal(bowtieRes.status, 400);
    assert.equal(((await bowtieRes.json()) as any).error.code, 'SELF_INTERSECTING_POLYGON');

    // 4. Failure: < 3 points -> 400 VALIDATION_ERROR
    const tooFewRes = await fetch(`${baseUrl}/api/zones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Garis',
        points: [
          [106.82, -6.19],
          [106.83, -6.2],
        ],
      }),
    });
    assert.equal(tooFewRes.status, 400);
    assert.equal(((await tooFewRes.json()) as any).error.code, 'VALIDATION_ERROR');

    // 5. Normal create, update, and delete on same region
    const createRes = await fetch(`${baseUrl}/api/zones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Trotoar Tanah Abang',
        description: 'Zona baru',
        points: [
          [106.814, -6.188],
          [106.816, -6.188],
          [106.816, -6.19],
          [106.814, -6.188], // duplicate closing point stripped cleanly
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as any;
    assert.equal(createdJson.data.zone.points.length, 3);
    const newId = createdJson.data.zone.id;

    const patchRes = await fetch(`${baseUrl}/api/zones/${newId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Trotoar Tanah Abang Updated' }),
    });
    assert.equal(patchRes.status, 200);
    assert.equal(((await patchRes.json()) as any).data.zone.name, 'Trotoar Tanah Abang Updated');

    const delRes = await fetch(`${baseUrl}/api/zones/${newId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(delRes.status, 200);
    assert.equal(((await delRes.json()) as any).data.deletedId, newId);

    // 6. Failure: Cross-region update/delete -> 403 REGION_ACCESS_DENIED, unknown -> 404
    const crossUpdate = await fetch(`${baseUrl}/api/zones/zone-smg-1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Coba Ubah Semarang' }),
    });
    assert.equal(crossUpdate.status, 403);
    assert.equal(((await crossUpdate.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    const missingDel = await fetch(`${baseUrl}/api/zones/non-existent`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(missingDel.status, 404);
    assert.equal(((await missingDel.json()) as any).error.code, 'ZONE_NOT_FOUND');
  });
});
