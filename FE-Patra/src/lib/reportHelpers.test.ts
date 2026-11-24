import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoogleMapsRouteUrl,
  buildPaginationItems,
  computeDurationDisplay,
  computeReportCounts,
} from './reportHelpers.ts';

test('computeReportCounts menghitung total dan setiap status dengan tepat termasuk array kosong', () => {
  const counts = computeReportCounts([
    { status: 'NEED_ACTION' },
    { status: 'NEED_ACTION' },
    { status: 'PENDING_VALIDATION' },
    { status: 'NEEDS_REVISION' },
    { status: 'VALIDATED' },
  ]);
  assert.deepEqual(counts, {
    all: 5,
    NEED_ACTION: 2,
    PENDING_VALIDATION: 1,
    NEEDS_REVISION: 1,
    VALIDATED: 1,
  });

  assert.deepEqual(computeReportCounts([]), {
    all: 0,
    NEED_ACTION: 0,
    PENDING_VALIDATION: 0,
    NEEDS_REVISION: 0,
    VALIDATED: 0,
  });
});

test('computeDurationDisplay menghitung status On Track, Due Soon, Overdue, dan Resolved serta tanggal korup', () => {
  const baseMs = Date.parse('2026-11-24T10:00:00.000Z');

  assert.deepEqual(
    computeDurationDisplay(
      {
        status: 'NEED_ACTION',
        createdAt: new Date(baseMs - 25 * 60_000).toISOString(),
        actionSubmittedAt: null,
      },
      baseMs,
    ),
    { label: 'On Track 25m', tone: 'on_track' },
  );

  assert.deepEqual(
    computeDurationDisplay(
      {
        status: 'NEED_ACTION',
        createdAt: new Date(baseMs - 55 * 60_000).toISOString(),
        actionSubmittedAt: null,
      },
      baseMs,
    ),
    { label: 'Due Soon 55m', tone: 'due_soon' },
  );

  assert.deepEqual(
    computeDurationDisplay(
      {
        status: 'NEEDS_REVISION',
        createdAt: new Date(baseMs - 95 * 60_000).toISOString(),
        actionSubmittedAt: null,
      },
      baseMs,
    ),
    { label: 'Overdue 1h 35m', tone: 'overdue' },
  );

  assert.deepEqual(
    computeDurationDisplay(
      {
        status: 'VALIDATED',
        createdAt: new Date(baseMs - 40 * 60_000).toISOString(),
        actionSubmittedAt: new Date(baseMs - 10 * 60_000).toISOString(),
      },
      baseMs,
    ),
    { label: 'Resolved in 30m', tone: 'resolved' },
  );

  assert.deepEqual(
    computeDurationDisplay(
      {
        status: 'NEED_ACTION',
        createdAt: 'not-a-valid-date',
        actionSubmittedAt: null,
      },
      baseMs,
    ),
    { label: '-', tone: 'on_track' },
  );
});

test('buildGoogleMapsRouteUrl memvalidasi koordinat dan menolak nilai di luar rentang/NaN', () => {
  assert.equal(
    buildGoogleMapsRouteUrl(-6.1872, 106.8235),
    'https://www.google.com/maps/dir/?api=1&destination=-6.1872%2C106.8235',
  );
  assert.equal(buildGoogleMapsRouteUrl(999, 106.8235), null);
  assert.equal(buildGoogleMapsRouteUrl(Number.NaN, 106.8235), null);
});

test('buildPaginationItems menghasilkan daftar halaman ringkas untuk berbagai panjang halaman', () => {
  assert.deepEqual(buildPaginationItems(1, 0), []);
  assert.deepEqual(buildPaginationItems(1, 1), [1]);
  assert.deepEqual(buildPaginationItems(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(buildPaginationItems(1, 7), [1, 2, 3, 'ellipsis', 6, 7]);
  assert.deepEqual(buildPaginationItems(4, 7), [1, 'ellipsis', 3, 4, 5, 'ellipsis', 7]);
  assert.deepEqual(buildPaginationItems(7, 7), [1, 2, 'ellipsis', 5, 6, 7]);
});
