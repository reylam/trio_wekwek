import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cctvCatalogRawItemSchema,
  createRelocationSiteSchema,
  createZoneSchema,
} from '../interface/index.js';
import {
  parseCctvSnapshotItems,
  SEED_CAMERAS,
  SEED_REGIONS,
  SEED_RELOCATION_SITES,
  SEED_REPORTS,
  SEED_USERS,
  SEED_ZONES,
} from './seedData.js';

test('seed pilot data satisfies contract counts, schemas, and strict out-of-scope rules', () => {
  assert.equal(SEED_REGIONS.length, 2);
  assert.equal(SEED_USERS.length, 4);
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

  // Every relocation site passes schema and contains NO quota/capacity field
  for (const site of SEED_RELOCATION_SITES) {
    assert.equal(createRelocationSiteSchema.safeParse(site).success, true);
    assert.equal('quota' in site, false);
    assert.equal('capacity' in site, false);
  }

  // Reports cover all 4 lifecycle states in both cities and every report has AuditLog entries
  for (const region of SEED_REGIONS) {
    const cityReports = SEED_REPORTS.filter((r) => r.regionCode === region.code);
    const statuses = new Set(cityReports.map((r) => r.status));
    assert.deepEqual(
      statuses,
      new Set(['NEED_ACTION', 'PENDING_VALIDATION', 'NEEDS_REVISION', 'VALIDATED']),
    );
    for (const r of cityReports) {
      assert.ok(r.auditLogs.length >= 1, `Report ${r.reportCode} must have AuditLog`);
    }
  }
});

test('parseCctvSnapshotItems handles valid arrays, skips corrupt items, and rejects non-array input', () => {
  // Normal + partial corrupt edge case
  const mixed = [
    SEED_CAMERAS[0],
    { id: 'broken-cam', name: 'Missing fields' },
    { ...SEED_CAMERAS[1], roi_polygon: [[1.5, 0.5], [0.2, 0.2], [0.3, 0.3]] }, // invalid ROI > 1
  ];
  const res = parseCctvSnapshotItems(mixed);
  assert.equal(res.valid.length, 1);
  assert.equal(res.skippedCount, 2);

  // Non-array edge case
  const nonArray = parseCctvSnapshotItems({ invalid: true });
  assert.equal(nonArray.valid.length, 0);
  assert.equal(nonArray.skippedCount, 0);
});
