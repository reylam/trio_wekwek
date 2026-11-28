import type {
  DinasAnalyticsData,
  DinasTeamPerformanceDto,
  JwtUserPayload,
} from '../interface/index.js';
import DinasRepository, {
  type DinasRepositoryPort,
} from '../repository/dinas.repository.js';
import { computeSiteCapacityMetrics } from './geo.service.js';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;

const pad2 = (n: number) => String(n).padStart(2, '0');

function toWibDateKey(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return `${wib.getUTCFullYear()}-${pad2(wib.getUTCMonth() + 1)}-${pad2(
    wib.getUTCDate(),
  )}`;
}

function toWibHour(date: Date): number {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return wib.getUTCHours();
}

export interface DinasServiceDeps {
  repo?: DinasRepositoryPort;
  now?: () => Date;
}

export function createDinasService(deps: DinasServiceDeps = {}) {
  const repo = deps.repo ?? DinasRepository;
  const getNow = deps.now ?? (() => new Date());

  return {
    async getAnalytics(user: JwtUserPayload): Promise<DinasAnalyticsData> {
      const { reports, relocationSites, patrolTeams } =
        await repo.getAnalyticsInputsByRegion(user.regionId);

      const totalIncomingReports = reports.length;
      let validatedCount = 0;
      let totalRelocationDirected = 0;
      let slaSumMinutes = 0;
      let slaCount = 0;
      let splitRelocationReportsCount = 0;
      let unaccommodatedPklTotal = 0;

      // Inisialisasi bucket 30 hari terakhir (WIB) urutan menaik
      const now = getNow();
      const dailyBuckets = new Map<string, number>();
      const orderedDays: string[] = [];
      for (let i = TREND_DAYS - 1; i >= 0; i--) {
        const key = toWibDateKey(new Date(now.getTime() - i * DAY_MS));
        orderedDays.push(key);
        dailyBuckets.set(key, 0);
      }

      // Inisialisasi bucket 24 jam (00:00..23:00 WIB)
      const hourCounts = new Array<number>(24).fill(0);

      // Agregasi ruas jalan & titik valid untuk planningMap
      const streetMap = new Map<
        string,
        { address: string; count: number; validatedCount: number }
      >();
      const validatedPoints: DinasAnalyticsData['planningMap']['validatedPoints'] =
        [];

      // Agregasi monitoring per PatrolTeam
      const teamAcc = new Map<
        string,
        {
          totalReports: number;
          needActionCount: number;
          pendingValidationCount: number;
          needsRevisionCount: number;
          validatedCount: number;
          slaSumMinutes: number;
          slaCount: number;
          revisionHitCount: number;
        }
      >();
      for (const t of patrolTeams) {
        teamAcc.set(t.id, {
          totalReports: 0,
          needActionCount: 0,
          pendingValidationCount: 0,
          needsRevisionCount: 0,
          validatedCount: 0,
          slaSumMinutes: 0,
          slaCount: 0,
          revisionHitCount: 0,
        });
      }

      for (const r of reports) {
        const isValidated = r.status === 'VALIDATED';
        if (isValidated) {
          validatedCount++;
          if (r.relocationSiteId !== null) {
            totalRelocationDirected++;
          }
          validatedPoints.push({
            id: r.id,
            lat: r.lat,
            lng: r.lng,
            address: r.address,
            weight: Math.max(1, r.actualPklCount ?? r.detectedCount),
          });
        }

        if (r.relocationMatchStatus === 'SPLIT_FALLBACK') {
          splitRelocationReportsCount++;
        }
        if (r.unaccommodatedPklCount > 0) {
          unaccommodatedPklTotal += r.unaccommodatedPklCount;
        }

        let reportSlaMin: number | null = null;
        if (r.actionSubmittedAt) {
          reportSlaMin = Math.max(
            0,
            (r.actionSubmittedAt.getTime() - r.createdAt.getTime()) / 60000,
          );
          slaSumMinutes += reportSlaMin;
          slaCount++;
        }

        if (r.assignedTeamId && teamAcc.has(r.assignedTeamId)) {
          const acc = teamAcc.get(r.assignedTeamId)!;
          acc.totalReports++;
          if (r.status === 'NEED_ACTION') acc.needActionCount++;
          else if (r.status === 'PENDING_VALIDATION') acc.pendingValidationCount++;
          else if (r.status === 'NEEDS_REVISION') acc.needsRevisionCount++;
          else if (r.status === 'VALIDATED') acc.validatedCount++;

          if (r.hasRevision ?? r.status === 'NEEDS_REVISION') {
            acc.revisionHitCount++;
          }
          if (reportSlaMin !== null) {
            acc.slaSumMinutes += reportSlaMin;
            acc.slaCount++;
          }
        }

        const dayKey = toWibDateKey(r.createdAt);
        if (dailyBuckets.has(dayKey)) {
          dailyBuckets.set(dayKey, (dailyBuckets.get(dayKey) ?? 0) + 1);
        }

        const hour = toWibHour(r.createdAt);
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;

        const cleanAddress = r.address.trim() || 'Lokasi tidak tercatat';
        const streetEntry = streetMap.get(cleanAddress) ?? {
          address: cleanAddress,
          count: 0,
          validatedCount: 0,
        };
        streetEntry.count++;
        if (isValidated) {
          streetEntry.validatedCount++;
        }
        streetMap.set(cleanAddress, streetEntry);
      }

      const validatedPercent =
        totalIncomingReports === 0
          ? 0
          : Math.round((validatedCount / totalIncomingReports) * 1000) / 10;

      const avgResponseSlaMinutes =
        slaCount === 0 ? null : Math.round(slaSumMinutes / slaCount);

      const dailyTrend = orderedDays.map((date) => ({
        date,
        count: dailyBuckets.get(date) ?? 0,
      }));

      const peakHoursWib = hourCounts.map((count, hour) => ({
        hour,
        label: `${pad2(hour)}:00`,
        count,
      }));

      const topHotspotStreets = [...streetMap.values()]
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          if (b.validatedCount !== a.validatedCount) {
            return b.validatedCount - a.validatedCount;
          }
          return a.address.localeCompare(b.address);
        })
        .slice(0, 5);

      let totalMaxCapacity = 0;
      let totalOccupiedCapacity = 0;
      let totalPendingCapacity = 0;
      let totalAvailableCapacity = 0;
      let nearFullSitesCount = 0;
      let fullSitesCount = 0;

      const mappedSites = relocationSites.map((s) => {
        const metrics = computeSiteCapacityMetrics(
          s.maxCapacity,
          s.occupiedCapacity,
          s.pendingCapacity,
        );
        totalMaxCapacity += metrics.maxCapacity;
        totalOccupiedCapacity += metrics.occupiedCapacity;
        totalPendingCapacity += metrics.pendingCapacity;
        totalAvailableCapacity += metrics.availableCapacity;
        if (metrics.capacityStatus === 'FULL') fullSitesCount++;
        else if (metrics.capacityStatus === 'NEAR_FULL') nearFullSitesCount++;

        return {
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          facilities: s.facilities,
          ...metrics,
        };
      });

      const teamPerformance: DinasTeamPerformanceDto[] = patrolTeams.map((t) => {
        const acc = teamAcc.get(t.id)!;
        return {
          teamId: t.id,
          teamCode: t.code,
          teamName: t.name,
          assignedDistricts: t.assignedDistricts,
          totalReports: acc.totalReports,
          needActionCount: acc.needActionCount,
          pendingValidationCount: acc.pendingValidationCount,
          needsRevisionCount: acc.needsRevisionCount,
          validatedCount: acc.validatedCount,
          avgResponseSlaMinutes:
            acc.slaCount === 0 ? null : Math.round(acc.slaSumMinutes / acc.slaCount),
          revisionRatePercent:
            acc.totalReports === 0
              ? 0
              : Math.round((acc.revisionHitCount / acc.totalReports) * 1000) / 10,
        };
      });

      return {
        kpi: {
          totalIncomingReports,
          validatedPercent,
          avgResponseSlaMinutes,
          totalRelocationDirected,
        },
        capacityOverview: {
          totalSites: mappedSites.length,
          totalMaxCapacity,
          totalOccupiedCapacity,
          totalPendingCapacity,
          totalAvailableCapacity,
          nearFullSitesCount,
          fullSitesCount,
          splitRelocationReportsCount,
          unaccommodatedPklTotal,
        },
        teamPerformance,
        dailyTrend,
        peakHoursWib,
        topHotspotStreets,
        // LOCKED DECISION: planningMap tidak pernah menyertakan pin kamera CCTV (`cameras`)
        planningMap: {
          validatedPoints,
          relocationSites: mappedSites,
        },
      };
    },
  };
}

export const DinasService = createDinasService();
export default DinasService;
