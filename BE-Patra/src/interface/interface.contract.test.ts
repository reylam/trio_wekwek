import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoDetectPayloadSchema,
  cctvCatalogRawItemSchema,
  createRelocationSiteSchema,
  createZoneSchema,
  demoLoginSchema,
  listReportsQuerySchema,
  loginSchema,
  submitReportActionSchema,
  updateCctvRoiSchema,
  updateProfilePhoneSchema,
  updateRelocationSiteSchema,
  updateZoneSchema,
  validateReportSchema,
} from './index.js';

test('auth schemas accept valid payloads and reject invalid email / empty demoKey', () => {
  const validLogin = loginSchema.safeParse({
    email: 'satpol.jakpus@patra.demo',
    password: 'secret-password',
  });
  assert.equal(validLogin.success, true);

  const badEmail = loginSchema.safeParse({ email: 'not-an-email', password: 'abc' });
  assert.equal(badEmail.success, false);

  const emptyDemoKey = demoLoginSchema.safeParse({ demoKey: '   ' });
  assert.equal(emptyDemoKey.success, false);

  assert.equal(updateProfilePhoneSchema.safeParse({ noTelp: '+62 812 3456 7890' }).success, true);
  assert.equal(updateProfilePhoneSchema.safeParse({ noTelp: '081234567890' }).success, true);
  assert.equal(updateProfilePhoneSchema.safeParse({ noTelp: '1234' }).success, false);
  assert.equal(updateProfilePhoneSchema.safeParse({ noTelp: '0812-abc-9999' }).success, false);
});

test('cctvCatalogRawItemSchema parses exact indonesia_sources.py object and rejects out-of-range ROI', () => {
  const validCam = cctvCatalogRawItemSchema.safeParse({
    id: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    name: 'JKP POLRI UOB PLAZA C01',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    region: 'Kebon Melati, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
    stream_url: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    stream_type: 'hls',
    lat: -6.210377,
    lng: 106.864629,
    coords_exact: false,
    needs_cors_proxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    source_portal: 'https://jakcctv.jakarta.go.id/publik',
    district: 'Tanah Abang',
    subdistrict: 'Kebon Melati',
    facility_category: 'Pasar & Pusat Belanja',
    playback_url: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    roi_polygon: [
      [0.08, 0.55],
      [0.92, 0.55],
      [0.98, 0.96],
      [0.02, 0.96],
    ],
    fallback_video_url: '/videos/demo-jakarta.mp4',
    thumbnail_url: null,
  });
  assert.equal(validCam.success, true);

  // Edge case 1: ROI coordinate > 1 (not normalized)
  const outOfRangeRoi = updateCctvRoiSchema.safeParse({
    roiPolygon: [
      [0.1, 0.2],
      [1.25, 0.5],
      [0.5, 0.8],
    ],
  });
  assert.equal(outOfRangeRoi.success, false);

  // Edge case 2: ROI polygon with < 3 points
  const tooFewRoiPoints = updateCctvRoiSchema.safeParse({
    roiPolygon: [
      [0.1, 0.2],
      [0.8, 0.8],
    ],
  });
  assert.equal(tooFewRoiPoints.success, false);

  // Normal null ROI (full-frame fallback)
  assert.equal(updateCctvRoiSchema.safeParse({ roiPolygon: null }).success, true);
});

test('zone & relocation schemas validate polygon points, coordinates, and disallow empty updates', () => {
  const validZone = createZoneSchema.safeParse({
    name: 'Trotoar Thamrin',
    points: [
      [106.821, -6.193],
      [106.825, -6.193],
      [106.825, -6.202],
    ],
  });
  assert.equal(validZone.success, true);

  // Failure 1: < 3 points
  assert.equal(
    createZoneSchema.safeParse({
      name: 'Invalid',
      points: [
        [106.821, -6.193],
        [106.825, -6.193],
      ],
    }).success,
    false,
  );

  // Failure 2: empty partial update
  assert.equal(updateZoneSchema.safeParse({}).success, false);

  const validSite = createRelocationSiteSchema.safeParse({
    name: 'Lokasi Binaan JP 37 Thamrin City',
    address: 'Jl. Thamrin Boulevard, Kebon Melati, Tanah Abang',
    lat: -6.1944,
    lng: 106.8195,
    tradeCategories: ['Kuliner', 'Minuman'],
    facilities: ['Listrik', 'Air Bersih'],
    maxCapacity: 25,
    occupiedCapacity: 10,
  });
  assert.equal(validSite.success, true);

  const defaultCapSite = createRelocationSiteSchema.safeParse({
    name: 'Lokasi Binaan Default Kapasitas',
    address: 'Jl. Kebon Kacang Raya No. 1',
    lat: -6.1912,
    lng: 106.8178,
    tradeCategories: ['Kuliner'],
    facilities: ['Parkir'],
  });
  assert.equal(defaultCapSite.success, true);
  if (defaultCapSite.success) {
    assert.equal(defaultCapSite.data.maxCapacity, 20);
    assert.equal(defaultCapSite.data.occupiedCapacity, 0);
  }

  // Failure 3: occupiedCapacity > maxCapacity and maxCapacity < 1
  assert.equal(
    createRelocationSiteSchema.safeParse({
      name: 'Over Capacity Site',
      address: 'Jl. Contoh 123',
      lat: -6.19,
      lng: 106.82,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
      maxCapacity: 10,
      occupiedCapacity: 12,
    }).success,
    false,
  );
  assert.equal(
    createRelocationSiteSchema.safeParse({
      name: 'Zero Capacity Site',
      address: 'Jl. Contoh 123',
      lat: -6.19,
      lng: 106.82,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
      maxCapacity: 0,
      occupiedCapacity: 0,
    }).success,
    false,
  );

  // Update relocation site capacity rules
  assert.equal(updateRelocationSiteSchema.safeParse({ maxCapacity: 30 }).success, true);
  assert.equal(updateRelocationSiteSchema.safeParse({}).success, false);
  assert.equal(
    updateRelocationSiteSchema.safeParse({ maxCapacity: 5, occupiedCapacity: 6 }).success,
    false,
  );

  // Zone district optional field
  assert.equal(
    createZoneSchema.safeParse({
      name: 'Zona Tanah Abang',
      district: 'Tanah Abang',
      points: [
        [106.81, -6.18],
        [106.82, -6.18],
        [106.82, -6.19],
      ],
    }).success,
    true,
  );

  // Failure 4: latitude out of range & empty facilities
  assert.equal(
    createRelocationSiteSchema.safeParse({
      name: 'Bad Site',
      address: 'Jl. Contoh 123',
      lat: -95,
      lng: 106.8,
      tradeCategories: ['Kuliner'],
      facilities: [],
    }).success,
    false,
  );
});

test('report schemas handle auto-detect, multi-status filtering, action submit, and revision reason rules', () => {
  const validDetect = autoDetectPayloadSchema.safeParse({
    cameraId: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    source: 'AUTO_AI',
    currentActiveViolators: 3,
    maxConfidence: 0.87,
    isSimulationMode: false,
  });
  assert.equal(validDetect.success, true);

  // Failure 1: currentActiveViolators = 0
  assert.equal(
    autoDetectPayloadSchema.safeParse({
      cameraId: 'cam-1',
      source: 'AUTO_AI',
      currentActiveViolators: 0,
      maxConfidence: 0.9,
      isSimulationMode: false,
    }).success,
    false,
  );

  // Multi-status comma-separated query + teamId/district filters
  const multiStatus = listReportsQuerySchema.safeParse({
    status: 'NEED_ACTION,NEEDS_REVISION',
    relocationRequested: 'true',
    teamId: 'team-jkp-1',
    district: 'Tanah Abang',
    page: '2',
    pageSize: '20',
  });
  assert.equal(multiStatus.success, true);
  if (multiStatus.success) {
    assert.deepEqual(multiStatus.data.status, ['NEED_ACTION', 'NEEDS_REVISION']);
    assert.equal(multiStatus.data.relocationRequested, true);
    assert.equal(multiStatus.data.teamId, 'team-jkp-1');
    assert.equal(multiStatus.data.district, 'Tanah Abang');
    assert.equal(multiStatus.data.page, 2);
  }

  // Failure 2: unknown status in comma list
  assert.equal(
    listReportsQuerySchema.safeParse({ status: 'NEED_ACTION,UNKNOWN_STATUS' }).success,
    false,
  );

  // Action submit valid (with and without allocations) & negative/zero failure
  assert.equal(
    submitReportActionSchema.safeParse({
      actionType: 'RELOCATION_ASSISTANCE',
      actualPklCount: 2,
      educationNotes: 'Pedagang diedukasi dan bersedia pindah.',
      relocationRequested: true,
      allocations: [{ relocationSiteId: 'site-1', allocatedCount: 2 }],
    }).success,
    true,
  );
  assert.equal(
    submitReportActionSchema.safeParse({
      actionType: 'RELOCATION_ASSISTANCE',
      actualPklCount: 2,
      educationNotes: 'Pedagang diedukasi dan bersedia pindah.',
      relocationRequested: true,
      allocations: [{ relocationSiteId: 'site-1', allocatedCount: 0 }],
    }).success,
    false,
  );
  assert.equal(
    submitReportActionSchema.safeParse({
      actionType: 'EDUCATION_WARNING',
      actualPklCount: -1,
      educationNotes: 'Catatan singkat',
      relocationRequested: false,
    }).success,
    false,
  );

  // Validate report: APPROVE (with optional overrideAllocations) succeeds, REQUEST_REVISION requires >= 10 chars reason
  assert.equal(validateReportSchema.safeParse({ decision: 'APPROVE' }).success, true);
  assert.equal(
    validateReportSchema.safeParse({
      decision: 'APPROVE',
      overrideAllocations: [{ relocationSiteId: 'site-2', allocatedCount: 3 }],
    }).success,
    true,
  );
  assert.equal(
    validateReportSchema.safeParse({
      decision: 'REQUEST_REVISION',
      revisionReason: 'Foto bukti After terlalu gelap dan belum terlihat bersih.',
    }).success,
    true,
  );
  assert.equal(
    validateReportSchema.safeParse({
      decision: 'REQUEST_REVISION',
      revisionReason: 'Kurang',
    }).success,
    false,
  );
});
