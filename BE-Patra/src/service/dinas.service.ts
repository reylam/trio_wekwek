import type { DinasAnalyticsData, JwtUserPayload } from '../interface/index.js';
import DinasRepository, {
  type DinasRepositoryPort,
} from '../repository/dinas.repository.js';

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
      const { reports, relocationSites } =
        await repo.getAnalyticsInputsByRegion(user.regionId);

      const totalIncomingReports = reports.length;
      let validatedCount = 0;
      let totalRelocationDirected = 0;
      let slaSumMinutes = 0;
      let slaCount = 0;

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

        if (r.actionSubmittedAt) {
          const slaMinutes = Math.max(
            0,
            (r.actionSubmittedAt.getTime() - r.createdAt.getTime()) / 60000,
          );
          slaSumMinutes += slaMinutes;
          slaCount++;
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

      return {
        kpi: {
          totalIncomingReports,
          validatedPercent,
          avgResponseSlaMinutes,
          totalRelocationDirected,
        },
        dailyTrend,
        peakHoursWib,
        topHotspotStreets,
        // LOCKED DECISION: planningMap tidak pernah menyertakan pin kamera CCTV (`cameras`)
        planningMap: {
          validatedPoints,
          relocationSites: relocationSites.map((s) => ({
            id: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            address: s.address,
            facilities: s.facilities,
          })),
        },
      };
    },
  };
}

export const DinasService = createDinasService();
export default DinasService;
