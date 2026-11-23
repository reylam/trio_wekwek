import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicAuditStages,
  containsPublicPhotoLeak,
  normalizeCityParam,
  toLeafletPolygonLatLngs,
} from './publicHelpers.ts';

test('normalizeCityParam menormalkan nama kota valid dan mengubah nilai kosong/all menjadi undefined', () => {
  assert.equal(normalizeCityParam('  Kota Semarang  '), 'Kota Semarang');
  assert.equal(normalizeCityParam(''), undefined);
  assert.equal(normalizeCityParam('   '), undefined);
  assert.equal(normalizeCityParam('all'), undefined);
  assert.equal(normalizeCityParam('Semua Kota'), undefined);
  assert.equal(normalizeCityParam(null), undefined);
});

test('toLeafletPolygonLatLngs membalik [lng, lat] menjadi [lat, lng] dan menyaring titik korup', () => {
  const valid = toLeafletPolygonLatLngs([
    [110.42, -6.99],
    [110.425, -6.991],
    [110.422, -6.995],
  ]);
  assert.deepEqual(valid, [
    [-6.99, 110.42],
    [-6.991, 110.425],
    [-6.995, 110.422],
  ]);

  // Koordinat di luar rentang atau < 3 titik valid ditolak dengan aman
  const corrupted = toLeafletPolygonLatLngs([
    [110.42, -6.99],
    [999, -6.99],
    [110.422, Number.NaN],
    [110.423, -6.994],
  ]);
  assert.deepEqual(corrupted, []);
});

test('buildPublicAuditStages menghasilkan status 3 tahap SDG 16 untuk seluruh ReportStatus', () => {
  const validatedStages = buildPublicAuditStages({
    id: 'rep-1',
    reportCode: 'PTR-202611-001',
    city: 'Kota Semarang',
    address: 'Jl. Pandanaran',
    status: 'VALIDATED',
    detectedAt: '2026-11-23T02:00:00.000Z',
    actionSubmittedAt: '2026-11-23T02:20:00.000Z',
    validatedAt: '2026-11-23T02:45:00.000Z',
    responseSlaMinutes: 20,
    relocationSiteName: 'Selter Taman KB',
  });
  assert.deepEqual(
    validatedStages.map((s) => s.state),
    ['done', 'done', 'done'],
  );

  const pendingValidationStages = buildPublicAuditStages({
    id: 'rep-2',
    reportCode: 'PTR-202611-002',
    city: 'Kota Semarang',
    address: 'Jl. Pemuda',
    status: 'PENDING_VALIDATION',
    detectedAt: '2026-11-23T02:00:00.000Z',
    actionSubmittedAt: '2026-11-23T02:15:00.000Z',
    validatedAt: null,
    responseSlaMinutes: 15,
    relocationSiteName: null,
  });
  assert.deepEqual(
    pendingValidationStages.map((s) => s.state),
    ['done', 'done', 'active'],
  );

  const revisionStages = buildPublicAuditStages({
    id: 'rep-3',
    reportCode: 'PTR-202611-003',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. M.H. Thamrin',
    status: 'NEEDS_REVISION',
    detectedAt: '2026-11-23T02:00:00.000Z',
    actionSubmittedAt: '2026-11-23T02:30:00.000Z',
    validatedAt: null,
    responseSlaMinutes: 30,
    relocationSiteName: null,
  });
  assert.deepEqual(
    revisionStages.map((s) => s.state),
    ['done', 'active', 'revision'],
  );

  const needActionStages = buildPublicAuditStages({
    id: 'rep-4',
    reportCode: 'PTR-202611-004',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. Kebon Sirih',
    status: 'NEED_ACTION',
    detectedAt: '2026-11-23T02:00:00.000Z',
    actionSubmittedAt: null,
    validatedAt: null,
    responseSlaMinutes: null,
    relocationSiteName: null,
  });
  assert.deepEqual(
    needActionStages.map((s) => s.state),
    ['done', 'active', 'pending'],
  );
});

test('containsPublicPhotoLeak mendeteksi kebocoran URL foto pada struktur bersarang', () => {
  const safePayload = {
    hotspots: [{ id: 'h1', reportCode: 'PTR-1', address: 'Jl. Sudirman' }],
    items: [{ id: 'a1', status: 'VALIDATED' }],
  };
  assert.equal(containsPublicPhotoLeak(safePayload), false);

  const leakyBefore = {
    hotspots: [{ id: 'h1', beforeImageUrl: 'https://supabase.co/raw.jpg' }],
  };
  assert.equal(containsPublicPhotoLeak(leakyBefore), true);

  const leakyAfter = {
    nested: [{ afterImageUrl: 'https://supabase.co/after.jpg' }],
  };
  assert.equal(containsPublicPhotoLeak(leakyAfter), true);
});
