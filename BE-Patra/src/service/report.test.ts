import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type {
  ListReportsQuery,
  RelocationAllocationDto,
  ReportStatus,
} from '../interface/index.js';
import { signAuthToken } from '../middlewares/auth.js';
import errorHandler from '../middlewares/errorHandler.js';
import type {
  ActiveRelocationSiteRecord,
  ActiveZoneRecord,
  AuditLogRecord,
  CameraLookupRecord,
  CreateReportAllocationData,
  ReportDetailRecord,
  ReportRecord,
  ReportRepositoryPort,
} from '../repository/report.repository.js';
import {
  findMatchingZoneId,
  findNearestRelocationSites,
  formatDistanceLabel,
  haversineDistanceMeters,
  selectRecommendedRelocationPlan,
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

const SATPOL_TANAH_ABANG_TOKEN = signAuthToken(
  {
    sub: 'u-satpol-jkp-ta',
    role: 'SATPOL_PP',
    regionId: 'reg-jkp',
    city: 'Kota Jakarta Pusat',
    email: 'satpol.ta@patra.demo',
    fullName: 'Regu Tanah Abang',
    teamId: 'team-jkp-1',
    teamName: 'Tim Alpha — Kec. Tanah Abang',
    assignedDistricts: ['Tanah Abang'],
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
  let allocationCounter = 0;

  const cameras: CameraLookupRecord[] = [
    {
      id: 'cam-jkp-1',
      regionId: 'reg-jkp',
      name: 'JKP POLRI UOB PLAZA C01',
      regionLabel: 'Jl. M.H. Thamrin, Kebon Melati, Jakarta Pusat',
      district: 'Tanah Abang',
      lat: -6.2005,
      lng: 106.8229,
      isActive: true,
    },
    {
      id: 'cam-jkp-outside',
      regionId: 'reg-jkp',
      name: 'JKP STASIUN GAMBIR',
      regionLabel: 'Gambir, Jakarta Pusat',
      district: 'Gambir',
      lat: -6.1766,
      lng: 106.8305,
      isActive: true,
    },
    {
      id: 'cam-smg-1',
      regionId: 'reg-smg',
      name: 'SIMPANG LIMA UTARA',
      regionLabel: 'Simpang Lima, Kota Semarang',
      district: 'Semarang Tengah',
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
      maxCapacity: 25,
      occupiedCapacity: 5,
      pendingCapacity: 0,
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
      maxCapacity: 30,
      occupiedCapacity: 10,
      pendingCapacity: 2,
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
      maxCapacity: 20,
      occupiedCapacity: 4,
      pendingCapacity: 0,
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
      maxCapacity: 20,
      occupiedCapacity: 0,
      pendingCapacity: 0,
    },
  ];

  const reports: ReportRecord[] = [];
  const reportAllocations: Array<RelocationAllocationDto & { reportId: string }> = [];
  const auditLogs: AuditLogRecord[] = [];
  const uploadedFiles: Array<{ folder: string; url: string }> = [];
  const patrolTeams = [
    { id: 'team-jkp-1', regionId: 'reg-jkp', assignedDistricts: ['Tanah Abang'] },
    { id: 'team-jkp-2', regionId: 'reg-jkp', assignedDistricts: ['Gambir'] },
    { id: 'team-smg-1', regionId: 'reg-smg', assignedDistricts: ['Semarang Tengah'] },
  ];

  function replaceAllocationsForReport(
    reportId: string,
    allocations: CreateReportAllocationData[],
  ) {
    for (let i = reportAllocations.length - 1; i >= 0; i--) {
      if (reportAllocations[i]!.reportId === reportId) {
        reportAllocations.splice(i, 1);
      }
    }
    for (const a of allocations) {
      const site = relocationSites.find((s) => s.id === a.relocationSiteId);
      reportAllocations.push({
        id: `alloc-${++allocationCounter}`,
        reportId,
        relocationSiteId: a.relocationSiteId,
        relocationSiteName: site?.name ?? a.relocationSiteId,
        allocatedCount: a.allocatedCount,
        rankOrder: a.rankOrder,
        isRecommended: a.isRecommended,
      });
    }
  }

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
      maxCapacity: 10,
      occupiedCapacity: 0,
      pendingCapacity: 0,
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
    async findActiveRelocationSitesByRegion(regionId, excludeReportId) {
      const pendingBySite = new Map<string, number>();
      for (const alloc of reportAllocations) {
        if (excludeReportId && alloc.reportId === excludeReportId) continue;
        const rep = reports.find((r) => r.id === alloc.reportId);
        if (
          rep &&
          rep.regionId === regionId &&
          rep.status === 'PENDING_VALIDATION' &&
          rep.relocationRequested &&
          !rep.relocationCapacityCommitted
        ) {
          pendingBySite.set(
            alloc.relocationSiteId,
            (pendingBySite.get(alloc.relocationSiteId) ?? 0) + alloc.allocatedCount,
          );
        }
      }
      return relocationSites
        .filter((s) => s.regionId === regionId && !inactiveSiteIds.has(s.id))
        .map((s) => ({
          ...s,
          pendingCapacity: pendingBySite.get(s.id) ?? s.pendingCapacity ?? 0,
        }));
    },
    async findPatrolTeamIdByDistrict(regionId, district) {
      const target = district?.trim().toLowerCase();
      if (!target) return null;
      const found = patrolTeams.find(
        (t) =>
          t.regionId === regionId &&
          t.assignedDistricts.some((d) => d.trim().toLowerCase() === target),
      );
      return found?.id ?? null;
    },
    async findRelocationSiteById(id) {
      const s = relocationSites.find((item) => item.id === id);
      if (!s) return null;
      return {
        ...s,
        isActive: !inactiveSiteIds.has(s.id),
      };
    },
    async createReportWithAuditLog(reportData, auditData, allocations) {
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
        recommendedRelocationSiteId: reportData.recommendedRelocationSiteId ?? null,
        relocationSiteId: null,
        relocationMatchStatus: reportData.relocationMatchStatus ?? null,
        unaccommodatedPklCount: reportData.unaccommodatedPklCount ?? 0,
        relocationCapacityCommitted: false,
        relocationAssignedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      reports.push(rec);
      if (allocations && allocations.length > 0) {
        replaceAllocationsForReport(rec.id, allocations);
      }
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: rec.id,
        ...auditData,
        createdAt: now,
      });
      return rec;
    },
    async updateReportAndAppendAudit(reportId, reportUpdate, auditData, replaceAllocations) {
      const rec = reports.find((r) => r.id === reportId)!;
      rec.detectedCount = reportUpdate.detectedCount;
      rec.maxConfidence = reportUpdate.maxConfidence;
      rec.beforeImageUrl = reportUpdate.beforeImageUrl;
      if (reportUpdate.recommendedRelocationSiteId !== undefined) {
        rec.recommendedRelocationSiteId = reportUpdate.recommendedRelocationSiteId;
      }
      if (reportUpdate.relocationMatchStatus !== undefined) {
        rec.relocationMatchStatus = reportUpdate.relocationMatchStatus;
      }
      if (reportUpdate.unaccommodatedPklCount !== undefined) {
        rec.unaccommodatedPklCount = reportUpdate.unaccommodatedPklCount;
      }
      if (replaceAllocations !== undefined) {
        replaceAllocationsForReport(reportId, replaceAllocations);
      }
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId,
        ...auditData,
        createdAt: new Date(currentTimeMs),
      });
      return rec;
    },
    async findManyByRegion(regionId: string, query: ListReportsQuery, scope = {}) {
      const filtered = reports.filter((r) => {
        if (r.regionId !== regionId) return false;
        const camDistrict = cameras.find((c) => c.id === r.cameraId)?.district ?? null;
        if (scope.allowedDistricts && scope.allowedDistricts.length > 0) {
          const norm = (camDistrict || '').trim().toLowerCase();
          const matchedDistrict =
            Boolean(norm) &&
            scope.allowedDistricts.some((d) => d.trim().toLowerCase() === norm);
          const matchedTeam = Boolean(scope.teamId && r.assignedTeamId === scope.teamId);
          if (!matchedDistrict && !matchedTeam) return false;
        }
        if (query.teamId && r.assignedTeamId !== query.teamId) return false;
        if (
          query.district &&
          (camDistrict || '').trim().toLowerCase() !== query.district.trim().toLowerCase()
        ) {
          return false;
        }
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
      const cam = cameras.find((c) => c.id === rec.cameraId);
      const recSiteName = rec.recommendedRelocationSiteId
        ? relocationSites.find((s) => s.id === rec.recommendedRelocationSiteId)?.name ?? null
        : null;
      const relocSiteName = rec.relocationSiteId
        ? relocationSites.find((s) => s.id === rec.relocationSiteId)?.name ?? null
        : null;
      return {
        ...rec,
        cameraName: cam?.name,
        cameraDistrict: cam?.district ?? null,
        zoneName: zones.find((z) => z.id === rec.zoneId)?.id ?? null,
        assignedTeam: null,
        recommendedRelocationSiteName: recSiteName,
        relocationSiteName: relocSiteName,
        relocationAllocations: reportAllocations
          .filter((a) => a.reportId === id)
          .sort((a, b) => a.rankOrder - b.rankOrder)
          .map(({ reportId: _rid, ...rest }) => rest),
        auditLogs: auditLogs.filter((l) => l.reportId === id),
      };
    },
    async guardedSubmitAction(
      id,
      expectedStatuses,
      updateData,
      auditData,
      replaceAllocations,
    ) {
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
      if (updateData.recommendedRelocationSiteId !== undefined) {
        rec.recommendedRelocationSiteId = updateData.recommendedRelocationSiteId;
      }
      if (updateData.relocationMatchStatus !== undefined) {
        rec.relocationMatchStatus = updateData.relocationMatchStatus;
      }
      if (updateData.unaccommodatedPklCount !== undefined) {
        rec.unaccommodatedPklCount = updateData.unaccommodatedPklCount;
      }
      if (replaceAllocations !== undefined) {
        replaceAllocationsForReport(id, replaceAllocations);
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
    async guardedValidateWithRelocationCommit(params) {
      const rec = reports.find((r) => r.id === params.id);
      if (!rec || rec.status !== 'PENDING_VALIDATION' || rec.relocationCapacityCommitted) {
        return { ok: false, reason: 'CONFLICT' };
      }
      for (const alloc of params.allocations) {
        const site = relocationSites.find((s) => s.id === alloc.relocationSiteId);
        if (
          !site ||
          site.regionId !== params.regionId ||
          inactiveSiteIds.has(site.id) ||
          site.maxCapacity !== alloc.expectedMaxCapacity ||
          site.occupiedCapacity + alloc.allocatedCount > site.maxCapacity
        ) {
          return { ok: false, reason: 'CONFLICT' };
        }
      }
      for (const alloc of params.allocations) {
        const site = relocationSites.find((s) => s.id === alloc.relocationSiteId)!;
        site.occupiedCapacity += alloc.allocatedCount;
      }
      replaceAllocationsForReport(params.id, params.allocations);
      rec.status = 'VALIDATED';
      rec.validatedByUserId = params.validatedByUserId;
      rec.validatedAt = params.validatedAt;
      rec.revisionReason = null;
      rec.relocationSiteId = params.relocationSiteId;
      rec.relocationAssignedAt = params.validatedAt;
      rec.relocationMatchStatus = params.relocationMatchStatus;
      rec.unaccommodatedPklCount = params.unaccommodatedPklCount;
      rec.relocationCapacityCommitted = true;
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: params.id,
        ...params.auditLogData,
        createdAt: new Date(currentTimeMs),
      });
      const detail = await this.findDetailById(params.id);
      return detail ? { ok: true, detail } : { ok: false, reason: 'CONFLICT' };
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
    async guardedAssignRelocationWithCommit(params) {
      const rec = reports.find((r) => r.id === params.id);
      if (
        !rec ||
        rec.status !== 'VALIDATED' ||
        !rec.relocationRequested ||
        rec.relocationCapacityCommitted
      ) {
        return { ok: false, reason: 'CONFLICT' };
      }
      for (const alloc of params.allocations) {
        const site = relocationSites.find((s) => s.id === alloc.relocationSiteId);
        if (
          !site ||
          site.regionId !== params.regionId ||
          inactiveSiteIds.has(site.id) ||
          site.maxCapacity !== alloc.expectedMaxCapacity ||
          site.occupiedCapacity + alloc.allocatedCount > site.maxCapacity
        ) {
          return { ok: false, reason: 'CONFLICT' };
        }
      }
      for (const alloc of params.allocations) {
        const site = relocationSites.find((s) => s.id === alloc.relocationSiteId)!;
        site.occupiedCapacity += alloc.allocatedCount;
      }
      replaceAllocationsForReport(params.id, params.allocations);
      rec.relocationSiteId = params.relocationSiteId;
      rec.relocationAssignedAt = params.relocationAssignedAt;
      rec.relocationMatchStatus = params.relocationMatchStatus;
      rec.unaccommodatedPklCount = params.unaccommodatedPklCount;
      rec.relocationCapacityCommitted = true;
      rec.updatedAt = new Date(currentTimeMs);
      auditLogs.push({
        id: `aud-${++auditCounter}`,
        reportId: params.id,
        ...params.auditLogData,
        createdAt: new Date(currentTimeMs),
      });
      const detail = await this.findDetailById(params.id);
      return detail ? { ok: true, detail } : { ok: false, reason: 'CONFLICT' };
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
    reportAllocations,
    relocationSites,
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
    form.append(
      'snapshot',
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' }),
      'snap.jpg',
    );
  }
  form.append('payload', JSON.stringify(payload));
  return form;
}

function makeActionForm(payload: Record<string, unknown>, includeFile = true) {
  const form = new FormData();
  if (includeFile) {
    form.append(
      'afterPhoto',
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' }),
      'after.jpg',
    );
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
    assert.equal(approve1Json.data.report.relocationSiteId, 'site-near');
    assert.equal(approve1Json.data.report.relocationCapacityCommitted, true);
    assert.equal(
      harness.relocationSites.find((s) => s.id === 'site-near')?.occupiedCapacity,
      13,
    );
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

    // Laporan yang sudah commit saat APPROVE ditolak jika ditetapkan ulang -> 409 RELOCATION_ALREADY_ASSIGNED
    const alreadyCommittedReloc = await fetch(`${baseUrl}/api/reports/${repWithRelocId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-mid' }),
    });
    assert.equal(alreadyCommittedReloc.status, 409);
    assert.equal(((await alreadyCommittedReloc.json()) as any).error.code, 'RELOCATION_ALREADY_ASSIGNED');

    // 5-6. Skenario susulan (ALL_SITES_FULL saat validasi -> kapasitas ditambah -> POST /relocation susulan)
    const prevCaps = harness.relocationSites.map((s) => ({ id: s.id, occ: s.occupiedCapacity }));
    for (const s of harness.relocationSites) {
      s.occupiedCapacity = s.maxCapacity;
    }
    harness.advanceSeconds(60);
    const fullDetectRes = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'MANUAL',
        currentActiveViolators: 2,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    const followUpReportId = ((await fullDetectRes.json()) as any).data.report.id as string;
    await fetch(`${baseUrl}/api/reports/${followUpReportId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Menunggu pembukaan slot relokasi baru.',
        relocationRequested: true,
      }),
    });
    const followUpApproveRes = await fetch(`${baseUrl}/api/reports/${followUpReportId}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(followUpApproveRes.status, 200);
    const followUpApproveJson = (await followUpApproveRes.json()) as any;
    assert.equal(followUpApproveJson.data.report.relocationMatchStatus, 'ALL_SITES_FULL');
    assert.equal(followUpApproveJson.data.report.relocationCapacityCommitted, false);

    // Buka kembali kapasitas site untuk penetapan susulan
    for (const prev of prevCaps) {
      const target = harness.relocationSites.find((s) => s.id === prev.id);
      if (target) target.occupiedCapacity = prev.occ;
    }

    // 5. Lokasi nonaktif/arsip ditolak (400 RELOCATION_SITE_INACTIVE)
    const inactiveSiteReloc = await fetch(`${baseUrl}/api/reports/${followUpReportId}/relocation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relocationSiteId: 'site-inactive' }),
    });
    assert.equal(inactiveSiteReloc.status, 400);
    assert.equal(((await inactiveSiteReloc.json()) as any).error.code, 'RELOCATION_SITE_INACTIVE');

    // 6. Penetapan relokasi susulan sukses -> 200 + atomic increment + AuditLog RELOCATION_ASSIGNED
    const okReloc = await fetch(`${baseUrl}/api/reports/${followUpReportId}/relocation`, {
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
    assert.equal(okRelocJson.data.report.relocationCapacityCommitted, true);
    assert.ok(okRelocJson.data.report.relocationAssignedAt);
    assert.equal(okRelocJson.data.report.auditLogs.at(-1).action, 'RELOCATION_ASSIGNED');
    assert.equal(
      harness.relocationSites.find((s) => s.id === 'site-near')?.occupiedCapacity,
      15,
    );

    // Penetapan ulang -> 409 RELOCATION_ALREADY_ASSIGNED
    const dupReloc = await fetch(`${baseUrl}/api/reports/${followUpReportId}/relocation`, {
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

test('District hard-lock isolates reports per Satpol PP team and AuditLog actorName uses fullName (teamName) instead of email', async () => {
  const { app, auditLogs } = makeTestHarness();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // 1. Tim Tanah Abang tidak boleh membuat laporan dari kamera Gambir -> 403 DISTRICT_ACCESS_DENIED
    const deniedDetectRes = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-outside',
        source: 'MANUAL',
        currentActiveViolators: 2,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    assert.equal(deniedDetectRes.status, 403);
    assert.equal(((await deniedDetectRes.json()) as any).error.code, 'DISTRICT_ACCESS_DENIED');

    // 2. Tim Tanah Abang sukses membuat laporan di Tanah Abang -> AuditLog actorName = "Regu Tanah Abang (Tim Alpha — Kec. Tanah Abang)" (bukan email!)
    const taDetectRes = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'MANUAL',
        currentActiveViolators: 2,
        maxConfidence: 0.92,
        isSimulationMode: false,
      }),
    });
    assert.equal(taDetectRes.status, 201);
    const taReport = ((await taDetectRes.json()) as any).data.report;
    assert.equal(taReport.assignedTeamId, 'team-jkp-1');
    const createdAudit = auditLogs.find((l) => l.reportId === taReport.id);
    assert.ok(createdAudit);
    assert.equal(
      createdAudit.actorName,
      'Regu Tanah Abang (Tim Alpha — Kec. Tanah Abang)',
    );
    assert.equal(createdAudit.actorName.includes('@'), false);

    // 3. Buat laporan Gambir via token kota-penuh untuk menguji isolasi daftar, detail, action, dan PDF
    const gambirDetectRes = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-outside',
        source: 'MANUAL',
        currentActiveViolators: 1,
        maxConfidence: 0.85,
        isSimulationMode: false,
      }),
    });
    assert.equal(gambirDetectRes.status, 201);
    const gambirReportId = ((await gambirDetectRes.json()) as any).data.report.id as string;

    // Tim Tanah Abang hanya melihat 1 laporan Tanah Abang di daftar
    const taListRes = await fetch(`${baseUrl}/api/reports`, {
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
    });
    assert.equal(taListRes.status, 200);
    const taListJson = (await taListRes.json()) as any;
    assert.equal(taListJson.data.reports.length, 1);
    assert.equal(taListJson.data.reports[0].id, taReport.id);

    // Akses GET detail, POST action, dan GET PDF laporan Gambir ditolak -> 403 DISTRICT_ACCESS_DENIED
    const gambirDetailDenied = await fetch(`${baseUrl}/api/reports/${gambirReportId}`, {
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
    });
    assert.equal(gambirDetailDenied.status, 403);
    assert.equal(((await gambirDetailDenied.json()) as any).error.code, 'DISTRICT_ACCESS_DENIED');

    const gambirActionDenied = await fetch(`${baseUrl}/api/reports/${gambirReportId}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
      body: makeActionForm({
        actionType: 'EDUCATION_WARNING',
        actualPklCount: 1,
        educationNotes: 'Percobaan penindakan lintas kecamatan harus ditolak.',
        relocationRequested: false,
      }),
    });
    assert.equal(gambirActionDenied.status, 403);
    assert.equal(((await gambirActionDenied.json()) as any).error.code, 'DISTRICT_ACCESS_DENIED');

    const gambirPdfDenied = await fetch(`${baseUrl}/api/reports/${gambirReportId}/pdf`, {
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
    });
    assert.equal(gambirPdfDenied.status, 403);
    assert.equal(((await gambirPdfDenied.json()) as any).error.code, 'DISTRICT_ACCESS_DENIED');

    // 4. Penindakan pada laporan Tanah Abang mencatat actorName format baru pada AuditLog
    const taActionRes = await fetch(`${baseUrl}/api/reports/${taReport.id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_TANAH_ABANG_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Pedagang dibantu relokasi oleh Tim Alpha Tanah Abang.',
        relocationRequested: true,
      }),
    });
    assert.equal(taActionRes.status, 200);
    const taActionReport = ((await taActionRes.json()) as any).data.report;
    assert.equal(
      taActionReport.auditLogs.at(-1).actorName,
      'Regu Tanah Abang (Tim Alpha — Kec. Tanah Abang)',
    );
    assert.equal(taActionReport.auditLogs.at(-1).actorName.includes('@'), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test('selectRecommendedRelocationPlan enforces 4-tier waterfall, pendingCapacity deduction, and empty edge case', () => {
  const originLat = -6.2005;
  const originLng = 106.8229;
  const makeSite = (
    id: string,
    name: string,
    lat: number,
    lng: number,
    maxCapacity: number,
    occupiedCapacity: number,
    pendingCapacity = 0,
  ) => ({
    id,
    name,
    address: `Jl. ${name}`,
    lat,
    lng,
    tradeCategories: ['Kuliner'],
    facilities: ['Listrik'],
    maxCapacity,
    occupiedCapacity,
    pendingCapacity,
  });

  // Edge: empty sites
  const emptyPlan = selectRecommendedRelocationPlan(originLat, originLng, 3, []);
  assert.equal(emptyPlan.relocationMatchStatus, 'ALL_SITES_FULL');
  assert.equal(emptyPlan.unaccommodatedPklCount, 3);
  assert.equal(emptyPlan.allocations.length, 0);

  // Tier 1: NEAREST_AVAILABLE
  const t1 = selectRecommendedRelocationPlan(originLat, originLng, 2, [
    makeSite('s1', 'Terdekat', -6.199, 106.822, 10, 5, 1), // eff 4 >= 2
    makeSite('s2', 'Cadangan', -6.185, 106.835, 10, 0, 0),
  ]);
  assert.equal(t1.relocationMatchStatus, 'NEAREST_AVAILABLE');
  assert.equal(t1.recommendedRelocationSiteId, 's1');
  assert.deepEqual(
    t1.allocations.map((a) => [a.relocationSiteId, a.allocatedCount]),
    [['s1', 2]],
  );

  // Tier 2: FALLBACK_AVAILABLE (Opsi A whole group when nearest effective = 3 < 4)
  const t2 = selectRecommendedRelocationPlan(originLat, originLng, 4, [
    makeSite('s1', 'Terdekat', -6.199, 106.822, 10, 5, 2), // eff 3 < 4
    makeSite('s2', 'Alternatif', -6.185, 106.835, 10, 4, 0), // eff 6 >= 4
  ]);
  assert.equal(t2.relocationMatchStatus, 'FALLBACK_AVAILABLE');
  assert.equal(t2.recommendedRelocationSiteId, 's2');
  assert.equal(t2.skippedFullSites.length, 1);
  assert.equal(t2.skippedFullSites[0]?.id, 's1');
  assert.deepEqual(
    t2.allocations.map((a) => [a.relocationSiteId, a.allocatedCount]),
    [['s2', 4]],
  );

  // Tier 3: SPLIT_FALLBACK (3 PKL split -> 2 + 1 across two nearest sites)
  const t3 = selectRecommendedRelocationPlan(originLat, originLng, 3, [
    makeSite('s1', 'Lokasi 1', -6.199, 106.822, 10, 8, 0), // eff 2
    makeSite('s2', 'Lokasi Full Tengah', -6.195, 106.824, 5, 5, 0), // eff 0
    makeSite('s3', 'Lokasi 2', -6.185, 106.835, 10, 9, 0), // eff 1
  ]);
  assert.equal(t3.relocationMatchStatus, 'SPLIT_FALLBACK');
  assert.equal(t3.unaccommodatedPklCount, 0);
  assert.deepEqual(
    t3.allocations.map((a) => [a.relocationSiteId, a.allocatedCount, a.rankOrder]),
    [
      ['s1', 2, 1],
      ['s3', 1, 2],
    ],
  );
  assert.equal(t3.skippedFullSites[0]?.id, 's2');

  // Tier 4a: PARTIAL_UNACCOMMODATED
  const t4a = selectRecommendedRelocationPlan(originLat, originLng, 5, [
    makeSite('s1', 'Lokasi 1', -6.199, 106.822, 10, 8, 0), // eff 2
    makeSite('s2', 'Lokasi 2', -6.185, 106.835, 10, 9, 0), // eff 1
  ]);
  assert.equal(t4a.relocationMatchStatus, 'PARTIAL_UNACCOMMODATED');
  assert.equal(t4a.unaccommodatedPklCount, 2);
  assert.equal(t4a.allocations.length, 2);

  // Tier 4b: ALL_SITES_FULL
  const t4b = selectRecommendedRelocationPlan(originLat, originLng, 4, [
    makeSite('s1', 'Lokasi 1', -6.199, 106.822, 10, 10, 0),
    makeSite('s2', 'Lokasi 2', -6.185, 106.835, 5, 3, 2),
  ]);
  assert.equal(t4b.relocationMatchStatus, 'ALL_SITES_FULL');
  assert.equal(t4b.unaccommodatedPklCount, 4);
  assert.equal(t4b.allocations.length, 0);
});

test('Waterfall relocation, pendingCapacity collision avoidance, race 409 CAPACITY_EXCEEDED + replan, revision release, override, escalation, and split PDF', async () => {
  const harness = makeTestHarness();
  // Set kapasitas terkontrol: site-near (5 kosong), site-mid (10 kosong), site-far & site-extra penuh
  const siteNear = harness.relocationSites.find((s) => s.id === 'site-near')!;
  const siteMid = harness.relocationSites.find((s) => s.id === 'site-mid')!;
  const siteFar = harness.relocationSites.find((s) => s.id === 'site-far')!;
  const siteExtra = harness.relocationSites.find((s) => s.id === 'site-extra')!;
  siteNear.maxCapacity = 15;
  siteNear.occupiedCapacity = 10;
  siteNear.pendingCapacity = 0;
  siteMid.maxCapacity = 20;
  siteMid.occupiedCapacity = 10;
  siteMid.pendingCapacity = 0;
  siteFar.occupiedCapacity = siteFar.maxCapacity;
  siteExtra.occupiedCapacity = siteExtra.maxCapacity;

  const server = harness.app.listen(0);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    // Scenario A: Pending capacity mencegah bentrokan slot antara 2 laporan berurutan
    const r1Create = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'MANUAL',
        currentActiveViolators: 2,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    const r1Id = ((await r1Create.json()) as any).data.report.id as string;

    await fetch(`${baseUrl}/api/reports/${r1Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Laporan 1 meminta relokasi 2 PKL ke site-near.',
        relocationRequested: true,
      }),
    });

    // Report 2 butuh 4 PKL (sisa efektif site-near sekarang 5 - 2 = 3 < 4) -> otomatis FALLBACK_AVAILABLE ke site-mid
    const r2Create = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-outside',
        source: 'MANUAL',
        currentActiveViolators: 4,
        maxConfidence: 0.9,
        isSimulationMode: false,
      }),
    });
    const r2Json = (await r2Create.json()) as any;
    const r2Id = r2Json.data.report.id as string;
    assert.equal(r2Json.data.report.recommendedRelocationSiteId, 'site-mid');
    assert.equal(r2Json.data.report.relocationMatchStatus, 'FALLBACK_AVAILABLE');

    // Scenario C: REQUEST_REVISION melepas pending slot Report 1 seketika
    const r1Rev = await fetch(`${baseUrl}/api/reports/${r1Id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'REQUEST_REVISION',
        revisionReason: 'Mohon foto ulang area trotoar yang lebih jelas.',
      }),
    });
    assert.equal(r1Rev.status, 200);
    // Detail r2 setelah revisi r1 menunjukkan effectiveAvailableCapacity site-near kembali 5
    const r2DetailAfterRev = await fetch(`${baseUrl}/api/reports/${r2Id}`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    const r2DetailJson = (await r2DetailAfterRev.json()) as any;
    const nearDtoAfterRev = r2DetailJson.data.report.nearestRelocationSites.find(
      (s: any) => s.id === 'site-near',
    );
    assert.equal(nearDtoAfterRev.pendingCapacity, 0);
    assert.equal(nearDtoAfterRev.effectiveAvailableCapacity, 5);

    // Scenario B: Race condition 2 laporan PENDING_VALIDATION menunjuk site-near (kapasitas 5) -> 1 sukses, 1 ditolak 409 CAPACITY_EXCEEDED + replan
    harness.advanceSeconds(60);
    await fetch(`${baseUrl}/api/reports/${r1Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Foto ulang jelas untuk 2 PKL ke site-near.',
        relocationRequested: true,
        allocations: [{ relocationSiteId: 'site-near', allocatedCount: 2 }],
      }),
    });
    await fetch(`${baseUrl}/api/reports/${r2Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 4,
        educationNotes: 'Petugas memilih site-near manual untuk 4 PKL.',
        relocationRequested: true,
        allocations: [{ relocationSiteId: 'site-near', allocatedCount: 4 }],
      }),
    });

    // Validasi r1 lebih dulu -> sukses, site-near occupiedCapacity: 10 -> 12 (sisa 3)
    const approveR1 = await fetch(`${baseUrl}/api/reports/${r1Id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(approveR1.status, 200);
    assert.equal(siteNear.occupiedCapacity, 12);

    // Validasi r2 yang juga menunjuk site-near (butuh 4, sisa resmi 3) -> 409 CAPACITY_EXCEEDED + meta.replan!
    const collideR2 = await fetch(`${baseUrl}/api/reports/${r2Id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(collideR2.status, 409);
    const collideJson = (await collideR2.json()) as any;
    assert.equal(collideJson.error.code, 'CAPACITY_EXCEEDED');
    assert.equal(collideJson.error.meta.replan.recommendedRelocationSiteId, 'site-mid');
    assert.equal(collideJson.error.meta.replan.relocationMatchStatus, 'FALLBACK_AVAILABLE');
    assert.equal(siteNear.occupiedCapacity, 12); // tidak overbooked

    // Scenario D: Sudin overrideAllocations -> site-mid ter-commit, AuditLog = RELOCATION_OVERRIDDEN, site-near tetap 12
    const overrideR2 = await fetch(`${baseUrl}/api/reports/${r2Id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: 'APPROVE',
        overrideAllocations: [{ relocationSiteId: 'site-mid', allocatedCount: 4 }],
      }),
    });
    assert.equal(overrideR2.status, 200);
    const overrideJson = (await overrideR2.json()) as any;
    assert.equal(overrideJson.data.report.relocationSiteId, 'site-mid');
    assert.equal(overrideJson.data.report.auditLogs.at(-1).action, 'RELOCATION_OVERRIDDEN');
    assert.equal(siteMid.occupiedCapacity, 14);
    assert.equal(siteNear.occupiedCapacity, 12);

    // Scenario E & F: Escalation re-evaluasi waterfall -> SPLIT_FALLBACK (2 + 1) -> atomic multi-site commit + PDF 1 halaman
    // Set sisa slot: site-near = 2 (13/15), site-mid = 1 (19/20) -> 3 PKL harus SPLIT_FALLBACK (2 + 1)
    siteNear.occupiedCapacity = 13;
    siteMid.occupiedCapacity = 19;

    harness.advanceSeconds(60);
    const r3Initial = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 2,
        maxConfidence: 0.88,
        isSimulationMode: false,
      }),
    });
    const r3InitJson = (await r3Initial.json()) as any;
    const r3Id = r3InitJson.data.report.id as string;
    assert.equal(r3InitJson.data.report.recommendedRelocationSiteId, 'site-near');
    assert.equal(r3InitJson.data.report.relocationMatchStatus, 'NEAREST_AVAILABLE');

    // Eskalasi 2 -> 3 PKL -> melebihi sisa site-near (2), total kota = 3 -> berubah otomatis jadi SPLIT_FALLBACK!
    const r3Escalated = await fetch(`${baseUrl}/api/reports/auto-detect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeSnapshotForm({
        cameraId: 'cam-jkp-1',
        source: 'AUTO_AI',
        currentActiveViolators: 3,
        maxConfidence: 0.94,
        isSimulationMode: false,
      }),
    });
    assert.equal(r3Escalated.status, 200);
    const r3EscJson = (await r3Escalated.json()) as any;
    assert.equal(r3EscJson.data.outcome, 'MERGED_ESCALATED');
    assert.equal(r3EscJson.data.report.relocationMatchStatus, 'SPLIT_FALLBACK');

    // Action & Approve SPLIT_FALLBACK -> kedua lokasi bertambah atomik & PDF 1 halaman A4
    await fetch(`${baseUrl}/api/reports/${r3Id}/action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SATPOL_JKT_TOKEN}` },
      body: makeActionForm({
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes: 'Split darurat 2 PKL ke Thamrin City & 1 PKL ke Kebon Kacang.',
        relocationRequested: true,
      }),
    });
    const r3Approve = await fetch(`${baseUrl}/api/reports/${r3Id}/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DINAS_JKT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'APPROVE' }),
    });
    assert.equal(r3Approve.status, 200);
    const r3ApproveJson = (await r3Approve.json()) as any;
    assert.equal(r3ApproveJson.data.report.relocationMatchStatus, 'SPLIT_FALLBACK');
    assert.equal(r3ApproveJson.data.report.relocationAllocations.length, 2);
    assert.equal(siteNear.occupiedCapacity, 15);
    assert.equal(siteMid.occupiedCapacity, 20);

    const splitPdfRes = await fetch(`${baseUrl}/api/reports/${r3Id}/pdf`, {
      headers: { Authorization: `Bearer ${DINAS_JKT_TOKEN}` },
    });
    assert.equal(splitPdfRes.status, 200);
    const splitPdfText = Buffer.from(await splitPdfRes.arrayBuffer()).toString('latin1');
    const pageObjects = splitPdfText.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? [];
    assert.equal(pageObjects.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
