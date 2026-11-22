import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { ListReportsQuery, ReportStatus } from '../interface/index.js';
import { signAuthToken } from '../middlewares/auth.js';
import errorHandler from '../middlewares/errorHandler.js';
import type {
  ActiveRelocationSiteRecord,
  ActiveZoneRecord,
  AuditLogRecord,
  CameraLookupRecord,
  ReportDetailRecord,
  ReportRecord,
  ReportRepositoryPort,
} from '../repository/report.repository.js';
import {
  findMatchingZoneId,
  findNearestRelocationSites,
  formatDistanceLabel,
  haversineDistanceMeters,
} from './geo.service.js';
import type { StorageServicePort } from './storage.service.js';
import { createPdfBeritaAcaraService } from './pdfBeritaAcara.service.js';
import { createReportService } from './report.service.js';
import { createReportController } from '../controller/report.controller.js';
import { createReportRouter } from '../routes/report.route.js';

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

const SATPOL_SMG_TOKEN = signAuthToken(
  {
    sub: 'u-satpol-smg',
    role: 'SATPOL_PP',
    regionId: 'reg-smg',
    city: 'Kota Semarang',
    email: 'satpol.semarang@patra.demo',
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

function makeTestHarness(opts: { cooldownSec?: number; nowMs?: number } = {}) {
  let currentTimeMs = opts.nowMs ?? new Date('2026-11-22T10:00:00.000Z').getTime();
  let uploadCounter = 0;
  let reportCounter = 0;
  let auditCounter = 0;

  const cameras: CameraLookupRecord[] = [
    {
      id: 'cam-jkp-1',
      regionId: 'reg-jkp',
      name: 'JKP POLRI UOB PLAZA C01',
      regionLabel: 'Jl. M.H. Thamrin, Kebon Melati, Jakarta Pusat',
      lat: -6.2005,
      lng: 106.8229,
      isActive: true,
    },
    {
      id: 'cam-jkp-outside',
      regionId: 'reg-jkp',
      name: 'JKP STASIUN GAMBIR',
      regionLabel: 'Gambir, Jakarta Pusat',
      lat: -6.1766,
      lng: 106.8305,
      isActive: true,
    },
    {
      id: 'cam-smg-1',
      regionId: 'reg-smg',
      name: 'SIMPANG LIMA UTARA',
      regionLabel: 'Simpang Lima, Kota Semarang',
      lat: -6.9901,
      lng: 110.4229,
      isActive: true,
    },
  ];

  const zones: Array<ActiveZoneRecord & { regionId: string }> = [
    {
      id: 'zone-thamrin',
      regionId: 'reg-jkp',
      points: [
        [106.821, -6.198],
        [106.825, -6.198],
        [106.825, -6.203],
        [106.821, -6.203],
      ],
    },
  ];

  const relocationSites: Array<ActiveRelocationSiteRecord & { regionId: string }> = [
    {
      id: 'site-far',
      regionId: 'reg-jkp',
      name: 'Pasar Baru',
      address: 'Jl. Pasar Baru',
      lat: -6.1652,
      lng: 106.8342,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
    },
    {
      id: 'site-near',
      regionId: 'reg-jkp',
      name: 'Thamrin City JP 37',
      address: 'Jl. Thamrin Boulevard',
      lat: -6.1944,
      lng: 106.8195,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik', 'Toilet'],
    },
    {
      id: 'site-mid',
      regionId: 'reg-jkp',
      name: 'Kebon Kacang Raya',
      address: 'Jl. Kebon Kacang',
      lat: -6.1912,
      lng: 106.8178,
      tradeCategories: ['Jajanan'],
      facilities: ['Parkir'],
    },
    {
      id: 'site-extra',
      regionId: 'reg-jkp',
      name: 'Kemayoran',
      address: 'Jl. Benyamin Sueb',
      lat: -6.155,
      lng: 106.855,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
    },
  ];

  const reports: ReportRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];
  const uploadedFiles: Array<{ folder: string; url: string }> = [];

  const storage: StorageServicePort = {
    async uploadEvidence(folder) {
      uploadCounter++;
      const url = `https://storage.patra.test/${folder}/evidence-${uploadCounter}.jpg`;
      uploadedFiles.push({ folder, url });
      return url;
    },
  };

    relocationSites.push({
      id: 'site-inactive',
      regionId: 'reg-jkp',
      name: 'Lokasi Arsip Lama',
      address: 'Jl. Lama',
      lat: -6.19,
      lng: 106.82,
      tradeCategories: ['Kuliner'],
      facilities: ['Listrik'],
    });
    const inactiveSiteIds = new Set<string>(['site-inactive']);

    const repo: ReportRepositoryPort = {
    async findCameraById(cameraId) {
      return cameras.find((c) => c.id === cameraId) ?? null;
    },
    async findActiveNeedActionByCamera(cameraId) {
      return (
        [...reports]
          .reverse()
          .find((r) => r.cameraId === cameraId && r.status === 'NEED_ACTION') ?? null
      );
    },
    async findLatestActionSubmittedAtByCamera(cameraId) {
      const matched = reports
        .filter((r) => r.cameraId === cameraId && r.actionSubmittedAt !== null)
        .sort(
          (a, b) =>
            b.actionSubmittedAt!.getTime() - a.actionSubmittedAt!.getTime(),
        );
      return matched[0]?.actionSubmittedAt ?? null;
    },
    async findActiveZonesByRegion(regionId) {
      return zones.filter((z) => z.regionId === regionId);
    },
    async findActiveRelocationSitesByRegion(regionId) {
      return relocationSites.filter(
        (s) => s.regionId === regionId && !inactiveSiteIds.has(s.id),
      );
    },
    async findRelocationSiteById(id) {
      const s = relocationSites.find((item) => item.id === id);
      if (!s) return null;
      return {
        ...s,
        isActive: !inactiveSiteIds.has(s.id),
      };
    },
    async createReportWithAuditLog(reportData, auditData) {
      const now = new Date(currentTimeMs);
      const rec: ReportRecord = {
        id: `rep-${++reportCounter}`,
        ...reportData,
        afterImageUrl: null,
        actionType: null,
        actualPklCount: null,
        educationNotes: null,
        actionByUserId: null,
        actionSubmittedAt: null,
        validatedByUserId: null,
        validatedAt: null,
        revisionReason: null,
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      reports.push(rec);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: rec.id,
        ...auditData,
        createdAt: now,
      });
      return rec;
    },
    async updateReportAndAppendAudit(reportId, reportUpdate, auditData) {
      const rec = reports.find((r) => r.id === reportId)!;
      rec.detectedCount = reportUpdate.detectedCount;
      rec.maxConfidence = reportUpdate.maxConfidence;
      rec.beforeImageUrl = reportUpdate.beforeImageUrl;
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId,
        ...auditData,
        createdAt: new Date(currentTimeMs),
      });
      return rec;
    },
    async findManyByRegion(regionId: string, query: ListReportsQuery) {
      const filtered = reports.filter((r) => {
        if (r.regionId !== regionId) return false;
        if (query.status && !query.status.includes(r.status)) return false;
        if (
          query.relocationRequested !== undefined &&
          r.relocationRequested !== query.relocationRequested
        ) {
          return false;
        }
        if (query.search) {
          const q = query.search.toLowerCase();
          if (
            !r.reportCode.toLowerCase().includes(q) &&
            !r.address.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      });
      const sorted = [...filtered].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const skip = (query.page - 1) * query.pageSize;
      return {
        reports: sorted.slice(skip, skip + query.pageSize),
        totalItems: sorted.length,
      };
    },
    async findDetailById(id: string): Promise<ReportDetailRecord | null> {
      const rec = reports.find((r) => r.id === id);
      if (!rec) return null;
      return {
        ...rec,
        cameraName: cameras.find((c) => c.id === rec.cameraId)?.name,
        zoneName: zones.find((z) => z.id === rec.zoneId)?.id ?? null,
        relocationSiteName: null,
        auditLogs: auditLogs.filter((l) => l.reportId === id),
      };
    },
    async guardedSubmitAction(id, expectedStatuses, updateData, auditData) {
      const rec = reports.find((r) => r.id === id);
      if (!rec || !expectedStatuses.includes(rec.status)) {
        return null;
      }
      rec.status = updateData.status;
      rec.afterImageUrl = updateData.afterImageUrl;
      rec.actionType = updateData.actionType;
      rec.actualPklCount = updateData.actualPklCount;
      rec.educationNotes = updateData.educationNotes;
      rec.relocationRequested = updateData.relocationRequested;
      rec.actionByUserId = updateData.actionByUserId;
      rec.actionSubmittedAt = updateData.actionSubmittedAt;
      rec.updatedAt = new Date(currentTimeMs);

      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: id,
        ...auditData,
        createdAt: new Date(currentTimeMs),
      });

      return this.findDetailById(id);
    },
    async guardedValidate(id, expectedStatus, updateData, auditData) {
      const rec = reports.find((r) => r.id === id);
      if (!rec || rec.status !== expectedStatus) {
        return null;
      }
      rec.status = updateData.status;
      if (updateData.validatedByUserId !== undefined) {
        rec.validatedByUserId = updateData.validatedByUserId;
      }
      if (updateData.validatedAt !== undefined) {
        rec.validatedAt = updateData.validatedAt;
      }
      if (updateData.revisionReason !== undefined) {
        rec.revisionReason = updateData.revisionReason;
      }
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: id,
        ...auditData,
        createdAt: new Date(currentTimeMs),
      });
      return this.findDetailById(id);
    },
    async guardedAssignRelocation(id, updateData, auditData) {
      const rec = reports.find((r) => r.id === id);
      if (
        !rec ||
        rec.status !== 'VALIDATED' ||
        !rec.relocationRequested ||
        rec.relocationSiteId !== null
      ) {
        return null;
      }
      rec.relocationSiteId = updateData.relocationSiteId;
      rec.relocationAssignedAt = updateData.relocationAssignedAt;
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: id,
        ...auditData,
        createdAt: new Date(currentTimeMs),
      });
      return this.findDetailById(id);
    },
    async findPdfContextById(id) {
      const detail = await this.findDetailById(id);
      if (!detail) return null;
      const site = detail.relocationSiteId
        ? await this.findRelocationSiteById(detail.relocationSiteId)
        : null;
      return {
        ...detail,
        region:
          detail.regionId === 'reg-jkp'
            ? {
                city: 'Kota Jakarta Pusat',
                satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Pusat',
                umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Pusat',
              }
            : {
                city: 'Kota Semarang',
                satpolAgencyName: 'Satpol PP Kota Semarang',
                umkmAgencyName: 'Dinas Koperasi dan Usaha Mikro Kota Semarang',
              },
        relocationSite: site,
        actionByUserName: 'Petugas Satpol PP',
        validatedByUserName: 'Admin Dinas UMKM',
      };
    },
  };

  const service = createReportService({
    repo,
    storage,
    cooldownSec: opts.cooldownSec ?? 30,
    now: () => new Date(currentTimeMs),
  });

  const pdfService = createPdfBeritaAcaraService({
    repo,
    now: () => new Date(currentTimeMs),
    // Simulasikan gagal unduh gambar agar fallback placeholder PDF ikut teruji cepat tanpa jaringan
    fetchImage: async () => ({ buffer: null, error: 'Batas waktu habis' }),
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/reports',
    createReportRouter({
      controller: createReportController(service, pdfService),
      jwtSecret: TEST_JWT_SECRET,
    }),
  );
  app.use(errorHandler);

  return {
    app,
    reports,
    auditLogs,
    uploadedFiles,
    advanceSeconds(sec: number) {
      currentTimeMs += sec * 1000;
    },
    setStatusDirect(reportId: string, status: ReportStatus, revisionReason?: string) {
      const r = reports.find((item) => item.id === reportId)!;
      r.status = status;
      if (revisionReason) r.revisionReason = revisionReason;
    },
  };
}

function makeSnapshotForm(payload: Record<string, unknown>, includeFile = true) {
  const form = new FormData();
  if (includeFile) {
    form.append('snapshot', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'snap.jpg');
  }
  form.append('payload', JSON.stringify(payload));
  return form;
}

function makeActionForm(payload: Record<string, unknown>, includeFile = true) {
  const form = new FormData();
  if (includeFile) {
    form.append('afterPhoto', new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' }), 'after.jpg');
  }
  form.append('payload', JSON.stringify(payload));
  return form;
}

test('geo.service computes Haversine nearest 3 sites (no quota) and Turf zone matching', () => {
  const dist = haversineDistanceMeters(-6.2005, 106.8229, -6.1944, 106.8195);
  assert.ok(dist > 600 && dist < 1000, `Unexpected distance: ${dist}`);
  assert.equal(formatDistanceLabel(750), '750 m');
  assert.equal(formatDistanceLabel(1450), '1,5 km');

  const nearest = findNearestRelocationSites(
    -6.2005,
    106.8229,
    [
      { id: 'far', name: 'Far', address: 'A', lat: -6.15, lng: 106.85, tradeCategories: ['A'], facilities: ['B'] },
      { id: 'near', name: 'Near', address: 'B', lat: -6.1944, lng: 106.8195, tradeCategories: ['A'], facilities: ['B'] },
      { id: 'mid', name: 'Mid', address: 'C', lat: -6.185, lng: 106.82, tradeCategories: ['A'], facilities: ['B'] },
      { id: 'mid2', name: 'Mid2', address: 'D', lat: -6.175, lng: 106.83, tradeCategories: ['A'], facilities: ['B'] },
    ],
    3,
  );
  assert.equal(nearest.length, 3);
  assert.deepEqual(
    nearest.map((s) => s.id),
    ['near', 'mid', 'mid2'],
  );
  assert.equal('quota' in nearest[0]!, false);

  const zones = [
    {
      id: 'zone-1',
      points: [
        [106.821, -6.198],
        [106.825, -6.198],
        [106.825, -6.203],
        [106.821, -6.203],
      ] as [number, number][],
    },
  ];
  assert.equal(findMatchingZoneId(-6.2005, 106.8229, zones), 'zone-1');
  assert.equal(findMatchingZoneId(-6.1766, 106.8305, zones), null);
});

test('POST /api/reports/auto-detect handles CREATED, MERGED_NOOP, MERGED_ESCALATED, MANUAL, cooldown, and errors', async () => {
  const harness = makeTestHarness({ cooldownSec: 30 });
  const server = harness.app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. Initial AUTO_AI -> 201 CREATED, matches zone-thamrin, 1 upload, 1 AuditLog
    const res1 = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 2,
        maxConfidence: 0.85,
        isSimulationMode: false,
      }),
    });
    assert.equal(res1.status, 201);
    const j1 = (await res1.json()) as any;
    assert.equal(j1.data.outcome, 'CREATED');
    assert.equal(j1.data.report.detectedCount, 2);
    assert.equal(harness.reports[0]!.zoneId, 'zone-thamrin');
    assert.equal(harness.uploadedFiles.length, 1);
    assert.equal(harness.auditLogs.length, 1);
    const firstImageUrl = j1.data.report.beforeImageUrl;

    // 2. Refresh / same or lower count (<= 2) -> MERGED_NOOP (0 extra uploads, 0 extra AuditLogs)
    const resNoop = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 2,
        maxConfidence: 0.91,
        isSimulationMode: false,
      }),
    });
    assert.equal(resNoop.status, 200);
    const jNoop = (await resNoop.json()) as any;
    assert.equal(jNoop.data.outcome, 'MERGED_NOOP');
    assert.equal(jNoop.data.merged, true);
    assert.equal(jNoop.data.escalated, false);
    assert.equal(harness.uploadedFiles.length, 1);
    assert.equal(harness.auditLogs.length, 1);

    // 3. Higher count (3 > 2) -> MERGED_ESCALATED + archives previousBeforeImageUrl in AuditLog
    const resEsc = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 3,
        maxConfidence: 0.93,
        isSimulationMode: false,
      }),
    });
    assert.equal(resEsc.status, 200);
    const jEsc = (await resEsc.json()) as any;
    assert.equal(jEsc.data.outcome, 'MERGED_ESCALATED');
    assert.equal(jEsc.data.report.detectedCount, 3);
    assert.equal(harness.uploadedFiles.length, 2);
    assert.equal(harness.auditLogs.length, 2);
    assert.equal(harness.auditLogs[1]!.action, 'INCIDENT_ESCALATED');
    assert.equal(harness.auditLogs[1]!.metadata?.previousBeforeImageUrl, firstImageUrl);
    const secondImageUrl = jEsc.data.report.beforeImageUrl;

    // 4. MANUAL capture while active report exists -> merges cleanly & writes MANUAL_EVIDENCE_UPDATED
    const resManual = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'MANUAL',
        currentActiveViolators: 3,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    assert.equal(resManual.status, 200);
    assert.equal(harness.auditLogs.length, 3);
    assert.equal(harness.auditLogs[2]!.action, 'MANUAL_EVIDENCE_UPDATED');
    assert.equal(harness.auditLogs[2]!.metadata?.previousBeforeImageUrl, secondImageUrl);

    // 5. Submit action -> closes NEED_ACTION incident & starts 30s camera cooldown
    const repId = harness.reports[0]!.id;
    const actRes = await fetch(`${baseUrl}/api/reports/${repId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes: 'Pedagang sudah diedukasi dan setuju pindah.',
        relocationRequested: true,
      }),
    });
    assert.equal(actRes.status, 200);

    // 6. AUTO_AI within 30s cooldown -> COOLDOWN_SUPPRESSED (0 extra upload)
    harness.advanceSeconds(10);
    const uploadsBeforeCooldown = harness.uploadedFiles.length;
    const resCooldown = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 1,
        maxConfidence: 0.88,
        isSimulationMode: false,
      }),
    });
    assert.equal(resCooldown.status, 200);
    const jCooldown = (await resCooldown.json()) as any;
    assert.equal(jCooldown.data.outcome, 'COOLDOWN_SUPPRESSED');
    assert.equal(jCooldown.data.suppressedByCooldown, true);
    assert.equal(harness.uploadedFiles.length, uploadsBeforeCooldown);

    // 7. MANUAL bypasses cooldown -> 201 CREATED
    const resManualBypass = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'MANUAL',
        currentActiveViolators: 1,
        maxConfidence: 0.88,
        isSimulationMode: false,
      }),
    });
    assert.equal(resManualBypass.status, 201);

    // 8. Failure cases: cross-city camera (403), missing snapshot (400), DINAS role (403)
    const crossCity = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-smg-1',
        source: 'AUTO_AI',
        currentActiveViolators: 1,
        maxConfidence: 0.8,
        isSimulationMode: false,
      }),
    });
    assert.equal(crossCity.status, 403);
    assert.equal(((await crossCity.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    const missingSnap = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm(
        {
          cameraId: 'cam-jkp-outside',
          source: 'AUTO_AI',
          currentActiveViolators: 1,
          maxConfidence: 0.8,
          isSimulationMode: false,
        },
        false,
      ),
    });
    assert.equal(missingSnap.status, 400);
    assert.equal(((await missingSnap.json()) as any).error.code, 'SNAPSHOT_REQUIRED');

    const dinasForbidden = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 1,
        maxConfidence: 0.8,
        isSimulationMode: false,
      }),
    });
    assert.equal(dinasForbidden.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test('GET /api/reports, GET /api/reports/:id, and POST /api/reports/:id/action enforce multi-status filter, nearest sites, revisions, and 409 conflicts', async () => {
  const harness = makeTestHarness();
  const server = harness.app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // Seed 2 reports via auto-detect
    const r1 = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 2,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    const rep1Id = ((await r1.json()) as any).data.report.id as string;

    const r2 = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-outside',
        source: 'MANUAL',
        currentActiveViolators: 1,
        maxConfidence: 0.85,
        isSimulationMode: true,
      }),
    });
    const rep2Id = ((await r2.json()) as any).data.report.id as string;
    harness.setStatusDirect(rep2Id, 'NEEDS_REVISION', 'Foto terlalu gelap');

    // 1. Multi-status filter (?status=NEED_ACTION,NEEDS_REVISION)
    const listRes = await fetch(
      `${baseUrl}/api/reports?status=NEED_ACTION,NEEDS_REVISION&page=1&pageSize=10`,
      { headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` } },
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as any;
    assert.equal(listJson.data.reports.length, 2);
    assert.equal(listJson.meta.pagination.totalItems, 2);

    // 2. Detail includes auditLogs & 3 nearestRelocationSites sorted ascending
    const detailRes = await fetch(`${baseUrl}/api/reports/${rep1Id}`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(detailRes.status, 200);
    const detailJson = (await detailRes.json()) as any;
    assert.equal(detailJson.data.report.nearestRelocationSites.length, 3);
    assert.equal(detailJson.data.report.nearestRelocationSites[0].id, 'site-near');
    assert.ok(detailJson.data.report.auditLogs.length >= 1);

    // 3. Cross-city detail -> 403 REGION_ACCESS_DENIED
    const crossDetail = await fetch(`${baseUrl}/api/reports/${rep1Id}`, {
      headers: { Authorization: `Bearer ${SATPOL_SMG_TOKEN}` },
    });
    assert.equal(crossDetail.status, 403);
    assert.equal(((await crossDetail.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    // 4. Failure: Missing afterPhoto -> 400 AFTER_PHOTO_REQUIRED
    const missingPhoto = await fetch(`${baseUrl}/api/reports/${rep1Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm(
        {
          actionType: 'EDUCATION_WARNING',
          actualPklCount: 2,
          educationNotes: 'Edukasi persuasif selesai.',
          relocationRequested: false,
        },
        false,
      ),
    });
    assert.equal(missingPhoto.status, 400);
    assert.equal(((await missingPhoto.json()) as any).error.code, 'AFTER_PHOTO_REQUIRED');

    // 5. Submit action on NEED_ACTION -> PENDING_VALIDATION + ACTION_SUBMITTED
    const okAction = await fetch(`${baseUrl}/api/reports/${rep1Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Pedagang bersedia pindah ke Thamrin City.',
        relocationRequested: true,
      }),
    });
    assert.equal(okAction.status, 200);
    const okActionJson = (await okAction.json()) as any;
    assert.equal(okActionJson.data.report.status, 'PENDING_VALIDATION');
    assert.equal(okActionJson.data.report.auditLogs.at(-1).action, 'ACTION_SUBMITTED');

    // 6. Duplicate/concurrent action submit -> 409 REPORT_STATUS_CONFLICT
    const dupAction = await fetch(`${baseUrl}/api/reports/${rep1Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'EDUCATION_WARNING',
        actualPklCount: 2,
        educationNotes: 'Percobaan kedua yang seharusnya ditolak.',
        relocationRequested: false,
      }),
    });
    assert.equal(dupAction.status, 409);
    assert.equal(((await dupAction.json()) as any).error.code, 'REPORT_STATUS_CONFLICT');

    // 7. Revision resubmit on NEEDS_REVISION -> preserves original actionSubmittedAt & logs REVISION_SUBMITTED
    const initialActionTime = new Date('2026-11-22T09:15:00.000Z');
    harness.reports.find((r) => r.id === rep2Id)!.actionSubmittedAt = initialActionTime;
    harness.advanceSeconds(120);
    const revAction = await fetch(`${baseUrl}/api/reports/${rep2Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'EDUCATION_WARNING',
        actualPklCount: 1,
        educationNotes: 'Foto ulang trotoar bersih telah diunggah.',
        relocationRequested: false,
      }),
    });
    assert.equal(revAction.status, 200);
    const revJson = (await revAction.json()) as any;
    assert.equal(revJson.data.report.status, 'PENDING_VALIDATION');
    assert.equal(revJson.data.report.actionSubmittedAt, initialActionTime.toISOString());
    assert.equal(revJson.data.report.auditLogs.at(-1).action, 'REVISION_SUBMITTED');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test('POST /api/reports/:id/validate, /relocation, and GET /:id/pdf enforce RBAC, region-lock, 409 guards, 1-click relocation, and 1-page A4 PDF', async () => {
  const harness = makeTestHarness();
  const server = harness.app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // Seed 2 laporan via auto-detect: repWithReloc (relocationRequested=true) & repNoReloc (false)
    const create1 = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 3,
        maxConfidence: 0.91,
        isSimulationMode: false,
      }),
    });
    const repWithRelocId = ((await create1.json()) as any).data.report.id as string;

    // Belum VALIDATED -> PDF harus mengembalikan 409 JSON (bukan PDF)
    const earlyPdf = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/pdf`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(earlyPdf.status, 409);
    assert.equal(((await earlyPdf.json()) as any).error.code, 'REPORT_NOT_VALIDATED');

    // Satpol PP submit action dengan relocationRequested=true
    harness.advanceSeconds(60);
    const act1 = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes: 'Pedagang telah diedukasi dan bersedia pindah ke Lokasi Binaan resmi.',
        relocationRequested: true,
      }),
    });
    assert.equal(act1.status, 200);

    // Laporan kedua tanpa pengajuan relokasi
    const create2 = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-outside',
        source: 'MANUAL',
        currentActiveViolators: 1,
        maxConfidence: 0.85,
        isSimulationMode: true,
      }),
    });
    const repNoRelocId = ((await create2.json()) as any).data.report.id as string;
    await fetch(`${baseUrl}/api/reports/${repNoRelocId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'EDUCATION_WARNING',
        actualPklCount: 1,
        educationNotes: 'Teguran persuasif selesai, area trotoar bersih.',
        relocationRequested: false,
      }),
    });

    // 1. Validate RBAC & Region-Lock
    const satpolValidate = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SATPOL_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(satpolValidate.status, 403);
    assert.equal(((await satpolValidate.json()) as any).error.code, 'FORBIDDEN_ROLE');

    const crossValidate = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_SMG_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(crossValidate.status, 403);
    assert.equal(((await crossValidate.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    // 2. REQUEST_REVISION alasan < 10 karakter -> 400 VALIDATION_ERROR
    const shortReason = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'REQUEST_REVISION', revisionReason: 'Kurang' }),
    });
    assert.equal(shortReason.status, 400);

    // 3. REQUEST_REVISION valid -> NEEDS_REVISION + AuditLog REVISION_REQUESTED menyimpan rejectedAfterImageUrl
    const reqRev = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'REQUEST_REVISION',
        revisionReason: 'Foto bukti After terlalu gelap, mohon ulangi pengambilan foto.',
      }),
    });
    assert.equal(reqRev.status, 200);
    const reqRevJson = (await reqRev.json()) as any;
    assert.equal(reqRevJson.data.report.status, 'NEEDS_REVISION');
    const revAudit = reqRevJson.data.report.auditLogs.at(-1);
    assert.equal(revAudit.action, 'REVISION_REQUESTED');
    assert.ok(revAudit.metadata.rejectedAfterImageUrl);

    // Relokasi sebelum VALIDATED -> 409 REPORT_STATUS_CONFLICT
    const earlyReloc = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-near' }),
    });
    assert.equal(earlyReloc.status, 409);

    // Satpol PP submit revisi -> PENDING_VALIDATION, lalu Dinas APPROVE -> VALIDATED & revisionReason=null
    harness.advanceSeconds(60);
    await fetch(`${baseUrl}/api/reports/${repWithRelocId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes: 'Foto ulang trotoar sudah terang dan bersih tanpa gerobak.',
        relocationRequested: true,
      }),
    });

    const approve1 = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(approve1.status, 200);
    const approve1Json = (await approve1.json()) as any;
    assert.equal(approve1Json.data.report.status, 'VALIDATED');
    assert.equal(approve1Json.data.report.revisionReason, null);
    assert.ok(approve1Json.data.report.validatedAt);
    assert.equal(approve1Json.data.report.auditLogs.at(-1).action, 'REPORT_VALIDATED');

    // Validasi ulang setelah VALIDATED -> 409 REPORT_STATUS_CONFLICT
    const dupValidate = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(dupValidate.status, 409);

    // 4. Approve repNoRelocId lalu uji relokasi ditolak (400 RELOCATION_NOT_REQUESTED)
    await fetch(`${baseUrl}/api/reports/${repNoRelocId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    const noReqReloc = await fetch(`${baseUrl}/api/reports/${repNoRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-near' }),
    });
    assert.equal(noReqReloc.status, 400);
    assert.equal(((await noReqReloc.json()) as any).error.code, 'RELOCATION_NOT_REQUESTED');

    // 5. Lokasi nonaktif/arsip ditolak (400 RELOCATION_SITE_INACTIVE)
    const inactiveSiteReloc = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-inactive' }),
    });
    assert.equal(inactiveSiteReloc.status, 400);
    assert.equal(((await inactiveSiteReloc.json()) as any).error.code, 'RELOCATION_SITE_INACTIVE');

    // 6. Penetapan relokasi 1-klik sukses -> 200 + AuditLog RELOCATION_ASSIGNED
    const okReloc = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-near' }),
    });
    assert.equal(okReloc.status, 200);
    const okRelocJson = (await okReloc.json()) as any;
    assert.equal(okRelocJson.data.report.relocationSiteId, 'site-near');
    assert.ok(okRelocJson.data.report.relocationAssignedAt);
    assert.equal(okRelocJson.data.report.auditLogs.at(-1).action, 'RELOCATION_ASSIGNED');

    // Penetapan ulang -> 409 RELOCATION_ALREADY_ASSIGNED
    const dupReloc = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-mid' }),
    });
    assert.equal(dupReloc.status, 409);
    assert.equal(((await dupReloc.json()) as any).error.code, 'RELOCATION_ALREADY_ASSIGNED');

    // 7. PDF Berita Acara 1 Halaman A4 (Dinas attachment, Satpol ?inline=1, lintas kota 403)
    const crossPdf = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/pdf`, {
      headers: { Authorization: `Bearer ${DINAS_SMG_TOKEN}` },
    });
    assert.equal(crossPdf.status, 403);

    const pdfAttachment = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/pdf`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(pdfAttachment.status, 200);
    assert.equal(pdfAttachment.headers.get('content-type'), 'application/pdf');
    assert.match(pdfAttachment.headers.get('content-disposition') ?? '', /^attachment; filename="Berita-Acara-PTR-/);
    const pdfBuf = Buffer.from(await pdfAttachment.arrayBuffer());
    const pdfText = pdfBuf.toString('latin1');
    assert.ok(pdfText.startsWith('%PDF-'));
    // Pastikan tepat 1 halaman A4
    const pageObjects = pdfText.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? [];
    assert.equal(pageObjects.length, 1);

    const pdfInline = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/pdf?inline=1`, {
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
    });
    assert.equal(pdfInline.status, 200);
    assert.match(pdfInline.headers.get('content-disposition') ?? '', /^inline; filename="Berita-Acara-PTR-/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
