import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cctvCatalogRawItemSchema,
  createRelocationSiteSchema,
  createZoneSchema,
} from '../interface/index.js';
import {
  EXTRA_PUBLIC_RELOCATION_SITES,
  parseCctvSnapshotItems,
  SEED_CAMERAS,
  SEED_PATROL_TEAMS,
  SEED_REGIONS,
  SEED_RELOCATION_SITES,
  SEED_REPORTS,
  SEED_USERS,
  SEED_ZONES,
} from './seedData.js';

test('seed pilot data satisfies contract counts, schemas, team scopes, and site capacity rules', () => {
  assert.equal(SEED_REGIONS.length, 2);
  assert.equal(SEED_PATROL_TEAMS.length, 4);
  assert.equal(SEED_USERS.length, 6);
  assert.equal(SEED_CAMERAS.length, 6);
  assert.equal(SEED_ZONES.length, 4);
  assert.equal(SEED_RELOCATION_SITES.length, 6);
  assert.equal(SEED_REPORTS.length, 8);

  // Every camera passes exact indonesia_sources.py Zod contract
  for (const cam of SEED_CAMERAS) {
    const parsed = cctvCatalogRawItemSchema.safeParse(cam);
    assert.equal(parsed.success, true, `Camera ${cam.id} failed schema validation`);
  }

  // Every zone passes polygon validation
  for (const zone of SEED_ZONES) {
    assert.equal(createZoneSchema.safeParse(zone).success, true);
  }

  // Every relocation site (pilot + 15 extra public cities) passes schema with valid capacities and NO quota field
  assert.equal(EXTRA_PUBLIC_RELOCATION_SITES.length, 30);
  for (const site of [...SEED_RELOCATION_SITES, ...EXTRA_PUBLIC_RELOCATION_SITES]) {
    assert.equal(createRelocationSiteSchema.safeParse(site).success, true);
    assert.equal('quota' in site, false);
    assert.ok(site.maxCapacity >= 1, `Site ${site.name} must have maxCapacity >= 1`);
    assert.ok(
      site.occupiedCapacity >= 0 && site.occupiedCapacity <= site.maxCapacity,
      `Site ${site.name} occupiedCapacity out of bounds`,
    );
  }

  // Each pilot city has at least 1 FULL relocation site to exercise waterfall fallback
  for (const region of SEED_REGIONS) {
    const citySites = SEED_RELOCATION_SITES.filter((s) => s.regionCode === region.code);
    assert.ok(
      citySites.some((s) => s.occupiedCapacity >= s.maxCapacity),
      `Pilot city ${region.code} must have at least 1 FULL relocation site`,
    );
  }

  // Reports cover all 4 lifecycle states in both cities and every report has AuditLog entries without email actorName
  for (const region of SEED_REGIONS) {
    const cityReports = SEED_REPORTS.filter((r) => r.regionCode === region.code);
    const statuses = new Set(cityReports.map((r) => r.status));
    assert.deepEqual(
      statuses,
      new Set(['NEED_ACTION', 'PENDING_VALIDATION', 'NEEDS_REVISION', 'VALIDATED']),
    );
    for (const r of cityReports) {
      assert.ok(r.auditLogs.length >= 1, `Report ${r.reportCode} must have AuditLog`);
      for (const log of r.auditLogs) {
        assert.equal(log.actorName.includes('@'), false, `AuditLog actorName must not be email`);
      }
    }
  }
});

test('parseCctvSnapshotItems handles valid arrays, normalizes Semarang null districts, skips corrupt items, and rejects non-array input', () => {
  // Normal + Semarang district=null override + partial corrupt edge case
  const mixed = [
    SEED_CAMERAS[0],
    {
      ...SEED_CAMERAS[3],
      id: 'smg_8857_ARAH_PANDANARAN',
      district: null,
    },
    {
      ...SEED_CAMERAS[3],
      id: 'smg_8872_Bundaran_Madukoro',
      district: null,
    },
    { id: 'broken-cam', name: 'Missing fields' },
    { ...SEED_CAMERAS[1], roi_polygon: [[1.5, 0.5], [0.2, 0.2], [0.3, 0.3]] }, // invalid ROI > 1
  ];
  const res = parseCctvSnapshotItems(mixed);
  assert.equal(res.valid.length, 3);
  assert.equal(res.skippedCount, 2);
  assert.equal(res.valid[1]?.district, 'Semarang Selatan');
  assert.equal(res.valid[2]?.district, 'Semarang Barat');

  // Non-array edge case
  const nonArray = parseCctvSnapshotItems({ invalid: true });
  assert.equal(nonArray.valid.length, 0);
  assert.equal(nonArray.skippedCount, 0);
});
