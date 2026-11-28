import crypto from 'node:crypto';
import config from '../config/config.js';
import type {
  AssignRelocationInput,
  AuditLogDto,
  AutoDetectPayload,
  AutoDetectResponseData,
  JwtUserPayload,
  ListReportsQuery,
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
  type AuditLogRecord,
  type ReportDetailRecord,
  type ReportRecord,
  type ReportRepositoryPort,
} from '../repository/report.repository.js';
import {
  findMatchingZoneId,
  findNearestRelocationSites,
  formatDistanceLabel,
  haversineDistanceMeters,
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

          const updated = await repo.updateReportAndAppendAudit(
            active.id,
            {
              detectedCount: newCount,
              maxConfidence: newConf,
              beforeImageUrl: newImageUrl,
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

          const updated = await repo.updateReportAndAppendAudit(
            active.id,
            {
              detectedCount: payload.currentActiveViolators,
              maxConfidence: newConf,
              beforeImageUrl: newImageUrl,
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

      const [beforeImageUrl, zones] = await Promise.all([
        storage.uploadEvidence('before', file),
        repo.findActiveZonesByRegion(camera.regionId),
      ]);
      const zoneId = findMatchingZoneId(camera.lat, camera.lng, zones);

      const created = await repo.createReportWithAuditLog(
        {
          reportCode: generateReportCode(now),
          regionId: camera.regionId,
          cameraId: camera.id,
          zoneId,
          assignedTeamId: user.teamId ?? null,
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

      const sites = await repo.findActiveRelocationSitesByRegion(detail.regionId);
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
      );

      if (!updated) {
        throw new AppError(
          409,
          'REPORT_STATUS_CONFLICT',
          'Laporan ini sudah ditindaklanjuti atau statusnya telah berubah. Silakan muat ulang halaman.',
        );
      }

      const sites = await repo.findActiveRelocationSitesByRegion(updated.regionId);
      return this.formatDetail(updated, sites);
    },

    /**
     * FEAT-UMK-02 / BR-006: Dinas UMKM memvalidasi (APPROVE) atau meminta revisi (REQUEST_REVISION).
     * Hanya laporan PENDING_VALIDATION pada kota akun yang dapat diproses (guarded -> 409).
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
      const updated =
        input.decision === 'APPROVE'
          ? await repo.guardedValidate(
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
            )
          : await repo.guardedValidate(
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

      const sites = await repo.findActiveRelocationSitesByRegion(updated.regionId);
      return this.formatDetail(updated, sites);
    },

    /**
     * FEAT-UMK-02 / BR-006: Penetapan Lokasi Binaan 1-Klik (tanpa kuota).
     * Syarat: laporan VALIDATED, relocationRequested = true, belum ditetapkan, lokasi aktif di kota yang sama.
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
      if (existing.relocationSiteId) {
        throw new AppError(
          409,
          'RELOCATION_ALREADY_ASSIGNED',
          'Lokasi relokasi untuk laporan ini sudah ditetapkan sebelumnya.',
        );
      }

      const siteId = input.relocationSiteId ?? input.allocations?.[0]?.relocationSiteId ?? '';
      const site = await repo.findRelocationSiteById(siteId);
      if (!site) {
        throw new AppError(404, 'RELOCATION_SITE_NOT_FOUND', 'Lokasi binaan tidak ditemukan.');
      }
      assertRegionAccess(user, site.regionId);
      if (!site.isActive) {
        throw new AppError(
          400,
          'RELOCATION_SITE_INACTIVE',
          'Lokasi binaan ini sudah diarsipkan dan tidak dapat dipilih.',
        );
      }

      const distanceMeters = haversineDistanceMeters(
        existing.lat,
        existing.lng,
        site.lat,
        site.lng,
      );

      const updated = await repo.guardedAssignRelocation(
        id,
        { relocationSiteId: site.id, relocationAssignedAt: getNow() },
        {
          actorId: user.sub,
          actorRole: 'DINAS_UMKM',
          actorName: formatActorName(user),
          action: 'RELOCATION_ASSIGNED',
          fromStatus: 'VALIDATED',
          toStatus: 'VALIDATED',
          note: `PKL diarahkan ke ${site.name} (${formatDistanceLabel(distanceMeters)}).`,
          metadata: {
            relocationSiteId: site.id,
            relocationSiteName: site.name,
            distanceMeters,
          },
        },
      );

      if (!updated) {
        throw new AppError(409, 'REPORT_STATUS_CONFLICT', STATUS_CONFLICT_MESSAGE);
      }

      const sites = await repo.findActiveRelocationSitesByRegion(updated.regionId);
      return this.formatDetail(updated, sites);
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
