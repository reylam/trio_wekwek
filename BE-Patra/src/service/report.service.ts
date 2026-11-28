import crypto from 'node:crypto';
import config from '../config/config.js';
import type {
  AssignRelocationInput,
  AuditLogDto,
  AutoDetectPayload,
  AutoDetectResponseData,
  JwtUserPayload,
  ListReportsQuery,
  RelocationMatchStatus,
  ReportStatus,
  SubmitReportActionInput,
  ValidateReportInput,
  ViolationReportDetailDto,
  ViolationReportDto,
} from '../interface/index.js';
import {
  assertDistrictAccess,
  assertRegionAccess,
  formatActorName,
  hasDistrictLock,
} from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import ReportRepository, {
  type ActiveRelocationSiteRecord,
  type AuditLogRecord,
  type CommitAllocationGuardItem,
  type CreateReportAllocationData,
  type ReportDetailRecord,
  type ReportRecord,
  type ReportRepositoryPort,
} from '../repository/report.repository.js';
import {
  findMatchingZoneId,
  findNearestRelocationSites,
  formatDistanceLabel,
  haversineDistanceMeters,
  selectRecommendedRelocationPlan,
  type RelocationPlanAllocation,
} from './geo.service.js';
import StorageService, { type StorageServicePort } from './storage.service.js';

const STATUS_CONFLICT_MESSAGE =
  'Status laporan sudah berubah atau sudah diproses petugas lain. Silakan muat ulang halaman.';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const wibMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
});

export function generateReportCode(now = new Date()): string {
  const ym = wibMonthFormatter.format(now).replace('-', '');
  const bytes = crypto.randomBytes(5);
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `PTR-${ym}-${suffix}`;
}

export function mapAuditLogToDto(log: AuditLogRecord): AuditLogDto {
  return {
    id: log.id,
    reportId: log.reportId,
    actorId: log.actorId,
    actorRole: log.actorRole,
    actorName: log.actorName,
    action: log.action,
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    note: log.note,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

export function mapReportToDto(record: ReportRecord): ViolationReportDto {
  return {
    id: record.id,
    reportCode: record.reportCode,
    regionId: record.regionId,
    cameraId: record.cameraId,
    zoneId: record.zoneId,
    assignedTeamId: record.assignedTeamId ?? null,
    source: record.source,
    status: record.status,
    address: record.address,
    lat: record.lat,
    lng: record.lng,
    detectedCount: record.detectedCount,
    maxConfidence: record.maxConfidence,
    beforeImageUrl: record.beforeImageUrl,
    isSimulationMode: record.isSimulationMode,
    afterImageUrl: record.afterImageUrl,
    actionType: record.actionType,
    actualPklCount: record.actualPklCount,
    educationNotes: record.educationNotes,
    relocationRequested: record.relocationRequested,
    actionByUserId: record.actionByUserId,
    actionSubmittedAt: record.actionSubmittedAt
      ? record.actionSubmittedAt.toISOString()
      : null,
    validatedByUserId: record.validatedByUserId,
    validatedAt: record.validatedAt ? record.validatedAt.toISOString() : null,
    revisionReason: record.revisionReason,
    recommendedRelocationSiteId: record.recommendedRelocationSiteId ?? null,
    relocationSiteId: record.relocationSiteId,
    relocationMatchStatus: record.relocationMatchStatus ?? null,
    unaccommodatedPklCount: record.unaccommodatedPklCount ?? 0,
    relocationCapacityCommitted: record.relocationCapacityCommitted ?? false,
    relocationAssignedAt: record.relocationAssignedAt
      ? record.relocationAssignedAt.toISOString()
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toAutoDetectSummary(record: ReportRecord): AutoDetectResponseData['report'] {
  return {
    id: record.id,
    reportCode: record.reportCode,
    cameraId: record.cameraId,
    assignedTeamId: record.assignedTeamId ?? null,
    status: record.status,
    detectedCount: record.detectedCount,
    beforeImageUrl: record.beforeImageUrl,
    recommendedRelocationSiteId: record.recommendedRelocationSiteId ?? null,
    relocationMatchStatus: record.relocationMatchStatus ?? null,
    unaccommodatedPklCount: record.unaccommodatedPklCount ?? 0,
    createdAt: record.createdAt.toISOString(),
  };
}

function toCreateAllocations(
  allocations: RelocationPlanAllocation[],
  isRecommended: boolean,
): CreateReportAllocationData[] {
  return allocations.map((a) => ({
    relocationSiteId: a.relocationSiteId,
    allocatedCount: a.allocatedCount,
    rankOrder: a.rankOrder,
    isRecommended,
  }));
}

export interface ReportServiceDeps {
  repo?: ReportRepositoryPort;
  storage?: StorageServicePort;
  cooldownSec?: number;
  now?: () => Date;
}

export function createReportService(deps: ReportServiceDeps = {}) {
  const repo = deps.repo ?? ReportRepository;
  const storage = deps.storage ?? StorageService;
  const cooldownSec = deps.cooldownSec ?? config.cameraCooldownSec;
  const getNow = deps.now ?? (() => new Date());

  async function validateAndBuildCommitGuards(opts: {
    reportId: string;
    regionId: string;
    reportLat: number;
    reportLng: number;
    requiredCount: number;
    rawAllocations: Array<{ relocationSiteId: string; allocatedCount: number }>;
    isRecommended: boolean;
  }): Promise<{
    guardAllocations: CommitAllocationGuardItem[];
    relocationSiteId: string;
    relocationMatchStatus: RelocationMatchStatus;
    unaccommodatedPklCount: number;
  }> {
    const seenIds = new Set<string>();
    for (const item of opts.rawAllocations) {
      if (seenIds.has(item.relocationSiteId)) {
        throw new AppError(
          400,
          'DUPLICATE_RELOCATION_SITE',
          'Lokasi binaan tidak boleh duplikat dalam satu daftar alokasi.',
        );
      }
      seenIds.add(item.relocationSiteId);
    }

    const lookedUpSites = await Promise.all(
      opts.rawAllocations.map((item) => repo.findRelocationSiteById(item.relocationSiteId)),
    );

    let hasCapacityShortage = false;
    const guardAllocations: CommitAllocationGuardItem[] = [];

    for (let i = 0; i < opts.rawAllocations.length; i++) {
      const alloc = opts.rawAllocations[i]!;
      const site = lookedUpSites[i];
      if (!site) {
        throw new AppError(404, 'RELOCATION_SITE_NOT_FOUND', 'Lokasi binaan tidak ditemukan.');
      }
      assertRegionAccess(
        // Cek regionId lokasi menggunakan scope laporan agar tetap 403 lintas kota
        {
          sub: '',
          role: 'DINAS_UMKM',
          regionId: opts.regionId,
          city: '',
          email: '',
          fullName: '',
          teamId: null,
          teamName: null,
          assignedDistricts: [],
        },
        site.regionId,
      );
      if (!site.isActive) {
        throw new AppError(
          400,
          'RELOCATION_SITE_INACTIVE',
          'Lokasi binaan ini sudah diarsipkan dan tidak dapat dipilih.',
        );
      }

      const availableOfficial = Math.max(0, site.maxCapacity - site.occupiedCapacity);
      if (availableOfficial < alloc.allocatedCount) {
        hasCapacityShortage = true;
      }

      guardAllocations.push({
        relocationSiteId: site.id,
        allocatedCount: alloc.allocatedCount,
        rankOrder: i + 1,
        isRecommended: opts.isRecommended,
        expectedMaxCapacity: site.maxCapacity,
      });
    }

    const activeSites = await repo.findActiveRelocationSitesByRegion(
      opts.regionId,
      opts.reportId,
    );

    if (hasCapacityShortage) {
      const replan = selectRecommendedRelocationPlan(
        opts.reportLat,
        opts.reportLng,
        opts.requiredCount,
        activeSites,
        { useOfficialAvailable: true },
      );
      throw new AppError(
        409,
        'CAPACITY_EXCEEDED',
        'Kapasitas lokasi binaan terpilih tidak mencukupi karena telah terisi laporan lain. Gunakan saran alokasi terbaru.',
        undefined,
        { replan },
      );
    }

    const totalAllocated = guardAllocations.reduce((sum, a) => sum + a.allocatedCount, 0);
    const unaccommodatedPklCount = Math.max(0, opts.requiredCount - totalAllocated);
    const sortedByDistance = [...activeSites].sort(
      (a, b) =>
        haversineDistanceMeters(opts.reportLat, opts.reportLng, a.lat, a.lng) -
          haversineDistanceMeters(opts.reportLat, opts.reportLng, b.lat, b.lng) ||
        a.name.localeCompare(b.name),
    );
    const nearestSiteId = sortedByDistance[0]?.id ?? null;

    let relocationMatchStatus: RelocationMatchStatus;
    if (unaccommodatedPklCount > 0) {
      relocationMatchStatus = 'PARTIAL_UNACCOMMODATED';
    } else if (guardAllocations.length > 1) {
      relocationMatchStatus = 'SPLIT_FALLBACK';
    } else if (guardAllocations[0]!.relocationSiteId === nearestSiteId) {
      relocationMatchStatus = 'NEAREST_AVAILABLE';
    } else {
      relocationMatchStatus = 'FALLBACK_AVAILABLE';
    }

    return {
      guardAllocations,
      relocationSiteId: guardAllocations[0]!.relocationSiteId,
      relocationMatchStatus,
      unaccommodatedPklCount,
    };
  }

  async function recomputeWaterfallForReport(
    camera: { regionId: string; lat: number; lng: number },
    violators: number,
    excludeReportId?: string,
  ) {
    const activeSites: ActiveRelocationSiteRecord[] =
      await repo.findActiveRelocationSitesByRegion(camera.regionId, excludeReportId);
    const plan = selectRecommendedRelocationPlan(
      camera.lat,
      camera.lng,
      violators,
      activeSites,
    );
    return {
      plan,
      replaceAllocations: toCreateAllocations(plan.allocations, true),
    };
  }

  return {
    async autoDetect(
      user: JwtUserPayload,
      payload: AutoDetectPayload,
      file?: Express.Multer.File,
    ): Promise<{ statusCode: 200 | 201; data: AutoDetectResponseData }> {
      const camera = await repo.findCameraById(payload.cameraId);
      if (!camera || !camera.isActive) {
        throw new AppError(404, 'CCTV_NOT_FOUND', 'Kamera CCTV tidak ditemukan.');
      }
      assertRegionAccess(user, camera.regionId);
      assertDistrictAccess(user, camera.district, 'kamera CCTV');

      const now = getNow();
      const active = await repo.findActiveNeedActionByCamera(camera.id);

      // BR-001 & BR-003: 1 laporan aktif (NEED_ACTION) per cameraId
      if (active) {
        if (payload.source === 'MANUAL') {
          if (!file) {
            throw new AppError(400, 'SNAPSHOT_REQUIRED', 'Foto snapshot bukti wajib disertakan.');
          }
          const newImageUrl = await storage.uploadEvidence('before', file);
          const newCount = Math.max(active.detectedCount, payload.currentActiveViolators);
          const newConf = Math.max(active.maxConfidence, payload.maxConfidence);

          let replanData: {
            recommendedRelocationSiteId?: string | null;
            relocationMatchStatus?: RelocationMatchStatus | null;
            unaccommodatedPklCount?: number;
          } = {};
          let replaceAllocations: CreateReportAllocationData[] | undefined;

          if (newCount > active.detectedCount) {
            const recomputed = await recomputeWaterfallForReport(camera, newCount, active.id);
            replanData = {
              recommendedRelocationSiteId: recomputed.plan.recommendedRelocationSiteId,
              relocationMatchStatus: recomputed.plan.relocationMatchStatus,
              unaccommodatedPklCount: recomputed.plan.unaccommodatedPklCount,
            };
            replaceAllocations = recomputed.replaceAllocations;
          }

          const updated = await repo.updateReportAndAppendAudit(
            active.id,
            {
              detectedCount: newCount,
              maxConfidence: newConf,
              beforeImageUrl: newImageUrl,
              ...replanData,
            },
            {
              actorId: user.sub,
              actorRole: 'SATPOL_PP',
              actorName: formatActorName(user),
              action: 'MANUAL_EVIDENCE_UPDATED',
              fromStatus: 'NEED_ACTION',
              toStatus: 'NEED_ACTION',
              note: `Bukti manual ditambahkan ke laporan aktif (${newCount} PKL).`,
              metadata: {
                previousBeforeImageUrl: active.beforeImageUrl,
                previousCount: active.detectedCount,
                newCount,
              },
            },
            replaceAllocations,
          );

          return {
            statusCode: 200,
            data: {
              outcome: 'MERGED_ESCALATED',
              merged: true,
              escalated: true,
              suppressedByCooldown: false,
              report: toAutoDetectSummary(updated),
            },
          };
        }

        // AUTO_AI: hanya upload snapshot & eskalasi jika jumlah pelanggar aktif bertambah
        if (payload.currentActiveViolators > active.detectedCount) {
          if (!file) {
            throw new AppError(400, 'SNAPSHOT_REQUIRED', 'Foto snapshot bukti wajib disertakan.');
          }
          const newImageUrl = await storage.uploadEvidence('before', file);
          const newConf = Math.max(active.maxConfidence, payload.maxConfidence);
          const recomputed = await recomputeWaterfallForReport(
            camera,
            payload.currentActiveViolators,
            active.id,
          );

          const updated = await repo.updateReportAndAppendAudit(
            active.id,
            {
              detectedCount: payload.currentActiveViolators,
              maxConfidence: newConf,
              beforeImageUrl: newImageUrl,
              recommendedRelocationSiteId: recomputed.plan.recommendedRelocationSiteId,
              relocationMatchStatus: recomputed.plan.relocationMatchStatus,
              unaccommodatedPklCount: recomputed.plan.unaccommodatedPklCount,
            },
            {
              actorId: null,
              actorRole: 'SYSTEM_AI',
              actorName: 'PATRA Vision AI (1 FPS)',
              action: 'INCIDENT_ESCALATED',
              fromStatus: 'NEED_ACTION',
              toStatus: 'NEED_ACTION',
              note: `Jumlah PKL aktif meningkat dari ${active.detectedCount} menjadi ${payload.currentActiveViolators}.`,
              metadata: {
                previousBeforeImageUrl: active.beforeImageUrl,
                previousCount: active.detectedCount,
                newCount: payload.currentActiveViolators,
              },
            },
            recomputed.replaceAllocations,
          );

          return {
            statusCode: 200,
            data: {
              outcome: 'MERGED_ESCALATED',
              merged: true,
              escalated: true,
              suppressedByCooldown: false,
              report: toAutoDetectSummary(updated),
            },
          };
        }

        // Peak Active Count tidak bertambah -> abaikan upload & AuditLog untuk cegah spam
        return {
          statusCode: 200,
          data: {
            outcome: 'MERGED_NOOP',
            merged: true,
            escalated: false,
            suppressedByCooldown: false,
            report: toAutoDetectSummary(active),
          },
        };
      }

      // BR-002: Cek cooldown kamera (khusus AUTO_AI; MANUAL melewati cooldown)
      if (payload.source === 'AUTO_AI' && cooldownSec > 0) {
        const lastActionAt = await repo.findLatestActionSubmittedAtByCamera(camera.id);
        if (lastActionAt) {
          const elapsedMs = now.getTime() - lastActionAt.getTime();
          const cooldownMs = cooldownSec * 1000;
          if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
            const cooldownRemainingSec = Math.max(
              1,
              Math.ceil((cooldownMs - elapsedMs) / 1000),
            );
            return {
              statusCode: 200,
              data: {
                outcome: 'COOLDOWN_SUPPRESSED',
                merged: false,
                escalated: false,
                suppressedByCooldown: true,
                cooldownRemainingSec,
              },
            };
          }
        }
      }

      if (!file) {
        throw new AppError(400, 'SNAPSHOT_REQUIRED', 'Foto snapshot bukti wajib disertakan.');
      }

      const [beforeImageUrl, zones, activeSites, fallbackTeamId] = await Promise.all([
        storage.uploadEvidence('before', file),
        repo.findActiveZonesByRegion(camera.regionId),
        repo.findActiveRelocationSitesByRegion(camera.regionId),
        user.teamId
          ? Promise.resolve<string | null>(null)
          : repo.findPatrolTeamIdByDistrict(camera.regionId, camera.district),
      ]);
      const zoneId = findMatchingZoneId(camera.lat, camera.lng, zones);
      const plan = selectRecommendedRelocationPlan(
        camera.lat,
        camera.lng,
        payload.currentActiveViolators,
        activeSites,
      );

      const created = await repo.createReportWithAuditLog(
        {
          reportCode: generateReportCode(now),
          regionId: camera.regionId,
          cameraId: camera.id,
          zoneId,
          assignedTeamId: user.teamId ?? fallbackTeamId ?? null,
          source: payload.source,
          status: 'NEED_ACTION',
          address: camera.regionLabel || camera.name,
          lat: camera.lat,
          lng: camera.lng,
          detectedCount: payload.currentActiveViolators,
          maxConfidence: payload.maxConfidence,
          beforeImageUrl,
          isSimulationMode: payload.isSimulationMode,
          relocationRequested: false,
          recommendedRelocationSiteId: plan.recommendedRelocationSiteId,
          relocationMatchStatus: plan.relocationMatchStatus,
          unaccommodatedPklCount: plan.unaccommodatedPklCount,
        },
        {
          actorId: payload.source === 'MANUAL' ? user.sub : null,
          actorRole: payload.source === 'MANUAL' ? 'SATPOL_PP' : 'SYSTEM_AI',
          actorName:
            payload.source === 'MANUAL'
              ? formatActorName(user)
              : 'PATRA Vision AI (1 FPS)',
          action: 'REPORT_CREATED',
          fromStatus: null,
          toStatus: 'NEED_ACTION',
          note:
            payload.source === 'MANUAL'
              ? `Tangkapan bukti manual oleh petugas pada ${camera.name}.`
              : `Terdeteksi ${payload.currentActiveViolators} PKL menetap pada ${camera.name}.`,
          metadata: {
            detectedCount: payload.currentActiveViolators,
            maxConfidence: payload.maxConfidence,
            isSimulationMode: payload.isSimulationMode,
          },
        },
        toCreateAllocations(plan.allocations, true),
      );

      return {
        statusCode: 201,
        data: {
          outcome: 'CREATED',
          merged: false,
          escalated: false,
          suppressedByCooldown: false,
          report: toAutoDetectSummary(created),
        },
      };
    },

    async listByRegion(
      user: JwtUserPayload,
      query: ListReportsQuery,
    ): Promise<{
      reports: ViolationReportDto[];
      pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    }> {
      const scope = hasDistrictLock(user)
        ? { teamId: user.teamId, allowedDistricts: user.assignedDistricts }
        : undefined;
      const { reports, totalItems } = await repo.findManyByRegion(
        user.regionId,
        query,
        scope,
      );
      return {
        reports: reports.map(mapReportToDto),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
        },
      };
    },

    async getDetailById(
      user: JwtUserPayload,
      id: string,
    ): Promise<ViolationReportDetailDto> {
      const detail = await repo.findDetailById(id);
      if (!detail) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      assertRegionAccess(user, detail.regionId);
      assertDistrictAccess(user, detail.cameraDistrict, 'laporan pelanggaran');

      const sites = await repo.findActiveRelocationSitesByRegion(detail.regionId, detail.id);
      return this.formatDetail(detail, sites);
    },

    async submitAction(
      user: JwtUserPayload,
      id: string,
      input: SubmitReportActionInput,
      file?: Express.Multer.File,
    ): Promise<ViolationReportDetailDto> {
      if (!file) {
        throw new AppError(
          400,
          'AFTER_PHOTO_REQUIRED',
          'Foto bukti After wajib diunggah.',
        );
      }

      const existing = await repo.findDetailById(id);
      if (!existing) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      assertRegionAccess(user, existing.regionId);
      assertDistrictAccess(user, existing.cameraDistrict, 'laporan pelanggaran');

      const allowedStatuses: ReportStatus[] = ['NEED_ACTION', 'NEEDS_REVISION'];
      if (!allowedStatuses.includes(existing.status)) {
        throw new AppError(
          409,
          'REPORT_STATUS_CONFLICT',
          'Laporan ini sudah ditindaklanjuti atau statusnya telah berubah. Silakan muat ulang halaman.',
        );
      }

      let recommendedRelocationSiteId: string | null =
        existing.recommendedRelocationSiteId ?? null;
      let relocationMatchStatus: RelocationMatchStatus | null = null;
      let unaccommodatedPklCount = 0;
      let replaceAllocations: CreateReportAllocationData[] = [];

      if (input.relocationRequested && input.actualPklCount > 0) {
        if (input.allocations?.length) {
          const checked = await validateAndBuildCommitGuards({
            reportId: existing.id,
            regionId: existing.regionId,
            reportLat: existing.lat,
            reportLng: existing.lng,
            requiredCount: input.actualPklCount,
            rawAllocations: input.allocations,
            isRecommended: false,
          });
          recommendedRelocationSiteId =
            existing.recommendedRelocationSiteId ?? checked.relocationSiteId;
          relocationMatchStatus = checked.relocationMatchStatus;
          unaccommodatedPklCount = checked.unaccommodatedPklCount;
          replaceAllocations = checked.guardAllocations.map(
            ({ expectedMaxCapacity: _expected, ...rest }) => rest,
          );
        } else {
          const activeSites = await repo.findActiveRelocationSitesByRegion(
            existing.regionId,
            existing.id,
          );
          const plan = selectRecommendedRelocationPlan(
            existing.lat,
            existing.lng,
            input.actualPklCount,
            activeSites,
          );
          recommendedRelocationSiteId = plan.recommendedRelocationSiteId;
          relocationMatchStatus = plan.relocationMatchStatus;
          unaccommodatedPklCount = plan.unaccommodatedPklCount;
          replaceAllocations = toCreateAllocations(plan.allocations, true);
        }
      }

      const afterImageUrl = await storage.uploadEvidence('after', file);
      const now = getNow();
      const isRevisionResubmit = existing.status === 'NEEDS_REVISION';

      // EC-007: Pertahankan actionSubmittedAt awal sebagai basis SLA respon pertama
      const actionSubmittedAt = existing.actionSubmittedAt ?? now;

      const updated = await repo.guardedSubmitAction(
        id,
        allowedStatuses,
        {
          status: 'PENDING_VALIDATION',
          afterImageUrl,
          actionType: input.actionType,
          actualPklCount: input.actualPklCount,
          educationNotes: input.educationNotes.trim(),
          relocationRequested: input.relocationRequested,
          actionByUserId: user.sub,
          actionSubmittedAt,
          recommendedRelocationSiteId,
          relocationMatchStatus,
          unaccommodatedPklCount,
        },
        {
          actorId: user.sub,
          actorRole: 'SATPOL_PP',
          actorName: formatActorName(user),
          action: isRevisionResubmit ? 'REVISION_SUBMITTED' : 'ACTION_SUBMITTED',
          fromStatus: existing.status,
          toStatus: 'PENDING_VALIDATION',
          note: input.educationNotes.trim(),
          metadata: {
            actionType: input.actionType,
            actualPklCount: input.actualPklCount,
            relocationRequested: input.relocationRequested,
            ...(isRevisionResubmit && existing.afterImageUrl
              ? { previousAfterImageUrl: existing.afterImageUrl }
              : {}),
          },
        },
        replaceAllocations,
      );

      if (!updated) {
        throw new AppError(
          409,
          'REPORT_STATUS_CONFLICT',
          'Laporan ini sudah ditindaklanjuti atau statusnya telah berubah. Silakan muat ulang halaman.',
        );
      }

      const sites = await repo.findActiveRelocationSitesByRegion(
        updated.regionId,
        updated.id,
      );
      return this.formatDetail(updated, sites);
    },

    /**
     * FEAT-UMK-02 / BR-006: Dinas UMKM memvalidasi (APPROVE) atau meminta revisi (REQUEST_REVISION).
     * Bila APPROVE dengan relokasi aktif & alokasi tersedia, kapasitas terisi (occupiedCapacity)
     * di-commit secara atomik dalam batch transaksi yang sama.
     */
    async validate(
      user: JwtUserPayload,
      id: string,
      input: ValidateReportInput,
    ): Promise<ViolationReportDetailDto> {
      const existing = await repo.findDetailById(id);
      if (!existing) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      assertRegionAccess(user, existing.regionId);

      if (existing.status !== 'PENDING_VALIDATION') {
        throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
      }

      const now = getNow();
      if (input.decision === 'REQUEST_REVISION') {
        const updated = await repo.guardedValidate(
          id,
          'PENDING_VALIDATION',
          {
            status: 'NEEDS_REVISION',
            revisionReason: input.revisionReason.trim(),
          },
          {
            actorId: user.sub,
            actorRole: 'DINAS_UMKM',
            actorName: formatActorName(user),
            action: 'REVISION_REQUESTED',
            fromStatus: 'PENDING_VALIDATION',
            toStatus: 'NEEDS_REVISION',
            note: input.revisionReason.trim(),
            metadata: {
              revisionReason: input.revisionReason.trim(),
              // EC-007: arsipkan foto After yang ditolak agar jejak revisi lengkap
              rejectedAfterImageUrl: existing.afterImageUrl,
            },
          },
        );
        if (!updated) {
          throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
        }
        const sites = await repo.findActiveRelocationSitesByRegion(updated.regionId, updated.id);
        return this.formatDetail(updated, sites);
      }

      const requiredCount = existing.actualPklCount ?? existing.detectedCount;
      const isOverridden = Boolean(input.overrideAllocations?.length);
      const rawAllocations = isOverridden
        ? input.overrideAllocations!
        : existing.relocationAllocations.map((a) => ({
            relocationSiteId: a.relocationSiteId,
            allocatedCount: a.allocatedCount,
          }));

      if (!existing.relocationRequested || requiredCount === 0 || rawAllocations.length === 0) {
        const updated = await repo.guardedValidate(
          id,
          'PENDING_VALIDATION',
          {
            status: 'VALIDATED',
            validatedByUserId: user.sub,
            validatedAt: now,
            revisionReason: null,
          },
          {
            actorId: user.sub,
            actorRole: 'DINAS_UMKM',
            actorName: formatActorName(user),
            action: 'REPORT_VALIDATED',
            fromStatus: 'PENDING_VALIDATION',
            toStatus: 'VALIDATED',
            note: 'Bukti penindakan diverifikasi valid oleh Dinas UMKM.',
            metadata: {
              afterImageUrl: existing.afterImageUrl,
              relocationRequested: existing.relocationRequested,
            },
          },
        );
        if (!updated) {
          throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
        }
        const sites = await repo.findActiveRelocationSitesByRegion(updated.regionId, updated.id);
        return this.formatDetail(updated, sites);
      }

      const built = await validateAndBuildCommitGuards({
        reportId: existing.id,
        regionId: existing.regionId,
        reportLat: existing.lat,
        reportLng: existing.lng,
        requiredCount,
        rawAllocations,
        isRecommended: !isOverridden,
      });

      const commitResult = await repo.guardedValidateWithRelocationCommit({
        id: existing.id,
        regionId: existing.regionId,
        validatedByUserId: user.sub,
        validatedAt: now,
        relocationSiteId: built.relocationSiteId,
        relocationMatchStatus: built.relocationMatchStatus,
        unaccommodatedPklCount: built.unaccommodatedPklCount,
        allocations: built.guardAllocations,
        auditLogData: {
          actorId: user.sub,
          actorRole: 'DINAS_UMKM',
          actorName: formatActorName(user),
          action: isOverridden ? 'RELOCATION_OVERRIDDEN' : 'REPORT_VALIDATED',
          fromStatus: 'PENDING_VALIDATION',
          toStatus: 'VALIDATED',
          note: isOverridden
            ? 'Bukti penindakan valid dan alokasi relokasi disesuaikan serta ditetapkan oleh Dinas UMKM.'
            : 'Bukti penindakan valid dan alokasi relokasi resmi ditetapkan ke Lokasi Binaan.',
          metadata: {
            afterImageUrl: existing.afterImageUrl,
            relocationRequested: existing.relocationRequested,
            isOverridden,
            finalAllocations: built.guardAllocations,
          },
        },
      });

      if (!commitResult.ok) {
        const latest = await repo.findDetailById(id);
        if (
          !latest ||
          latest.status !== 'PENDING_VALIDATION' ||
          latest.relocationCapacityCommitted
        ) {
          throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
        }
        const activeSites = await repo.findActiveRelocationSitesByRegion(
          latest.regionId,
          latest.id,
        );
        const replan = selectRecommendedRelocationPlan(
          latest.lat,
          latest.lng,
          requiredCount,
          activeSites,
          { useOfficialAvailable: true },
        );
        throw new AppError(
          409,
          'CAPACITY_EXCEEDED',
          'Kapasitas lokasi binaan terpilih tidak mencukupi karena telah terisi laporan lain. Gunakan saran alokasi terbaru.',
          undefined,
          { replan },
        );
      }

      const sites = await repo.findActiveRelocationSitesByRegion(
        commitResult.detail.regionId,
        commitResult.detail.id,
      );
      return this.formatDetail(commitResult.detail, sites);
    },

    /**
     * FEAT-UMK-02 / BR-006: Penetapan Lokasi Binaan susulan pada laporan VALIDATED
     * yang kapasitasnya belum ter-commit (mis. sebelumnya ALL_SITES_FULL / PARTIAL).
     */
    async assignRelocation(
      user: JwtUserPayload,
      id: string,
      input: AssignRelocationInput,
    ): Promise<ViolationReportDetailDto> {
      const existing = await repo.findDetailById(id);
      if (!existing) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      assertRegionAccess(user, existing.regionId);

      if (existing.status !== 'VALIDATED') {
        throw new AppError(
          409,
          'REPORT_STATUS_CONFLICT',
          'Arahan relokasi hanya dapat ditetapkan pada laporan yang sudah tervalidasi.',
        );
      }
      if (!existing.relocationRequested) {
        throw new AppError(
          400,
          'RELOCATION_NOT_REQUESTED',
          'Laporan ini tidak memiliki pengajuan relokasi dari Satpol PP.',
        );
      }
      if (existing.relocationCapacityCommitted || existing.relocationSiteId !== null) {
        throw new AppError(
          409,
          'RELOCATION_ALREADY_ASSIGNED',
          'Lokasi relokasi untuk laporan ini sudah ditetapkan sebelumnya.',
        );
      }

      const requiredCount = Math.max(1, existing.actualPklCount ?? existing.detectedCount);
      const rawAllocations = input.allocations?.length
        ? input.allocations
        : [{ relocationSiteId: input.relocationSiteId!, allocatedCount: requiredCount }];

      const built = await validateAndBuildCommitGuards({
        reportId: existing.id,
        regionId: existing.regionId,
        reportLat: existing.lat,
        reportLng: existing.lng,
        requiredCount,
        rawAllocations,
        isRecommended: false,
      });

      const primarySite = await repo.findRelocationSiteById(built.relocationSiteId);
      const distanceMeters = primarySite
        ? haversineDistanceMeters(existing.lat, existing.lng, primarySite.lat, primarySite.lng)
        : 0;

      const commitResult = await repo.guardedAssignRelocationWithCommit({
        id: existing.id,
        regionId: existing.regionId,
        relocationSiteId: built.relocationSiteId,
        relocationAssignedAt: getNow(),
        relocationMatchStatus: built.relocationMatchStatus,
        unaccommodatedPklCount: built.unaccommodatedPklCount,
        allocations: built.guardAllocations,
        auditLogData: {
          actorId: user.sub,
          actorRole: 'DINAS_UMKM',
          actorName: formatActorName(user),
          action: 'RELOCATION_ASSIGNED',
          fromStatus: 'VALIDATED',
          toStatus: 'VALIDATED',
          note: primarySite
            ? `PKL diarahkan ke ${primarySite.name} (${formatDistanceLabel(distanceMeters)}).`
            : 'Arahan relokasi ditetapkan oleh Dinas UMKM.',
          metadata: {
            relocationSiteId: built.relocationSiteId,
            relocationSiteName: primarySite?.name ?? null,
            distanceMeters,
            allocations: built.guardAllocations,
          },
        },
      });

      if (!commitResult.ok) {
        const latest = await repo.findDetailById(id);
        if (!latest || latest.status !== 'VALIDATED') {
          throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
        }
        if (latest.relocationCapacityCommitted || latest.relocationSiteId !== null) {
          throw new AppError(
            409,
            'RELOCATION_ALREADY_ASSIGNED',
            'Lokasi relokasi untuk laporan ini sudah ditetapkan sebelumnya.',
          );
        }
        const activeSites = await repo.findActiveRelocationSitesByRegion(
          latest.regionId,
          latest.id,
        );
        const replan = selectRecommendedRelocationPlan(
          latest.lat,
          latest.lng,
          requiredCount,
          activeSites,
          { useOfficialAvailable: true },
        );
        throw new AppError(
          409,
          'CAPACITY_EXCEEDED',
          'Kapasitas lokasi binaan terpilih tidak mencukupi karena telah terisi laporan lain. Gunakan saran alokasi terbaru.',
          undefined,
          { replan },
        );
      }

      const sites = await repo.findActiveRelocationSitesByRegion(
        commitResult.detail.regionId,
        commitResult.detail.id,
      );
      return this.formatDetail(commitResult.detail, sites);
    },

    formatDetail(
      detail: ReportDetailRecord,
      sites: Awaited<ReturnType<ReportRepositoryPort['findActiveRelocationSitesByRegion']>>,
    ): ViolationReportDetailDto {
      return {
        ...mapReportToDto(detail),
        cameraName: detail.cameraName,
        zoneName: detail.zoneName ?? null,
        assignedTeam: detail.assignedTeam ?? null,
        recommendedRelocationSiteName: detail.recommendedRelocationSiteName ?? null,
        relocationSiteName: detail.relocationSiteName ?? null,
        relocationAllocations: detail.relocationAllocations ?? [],
        auditLogs: detail.auditLogs.map(mapAuditLogToDto),
        nearestRelocationSites: findNearestRelocationSites(
          detail.lat,
          detail.lng,
          sites,
          3,
        ),
      };
    },
  };
}

export const ReportService = createReportService();
export default ReportService;
