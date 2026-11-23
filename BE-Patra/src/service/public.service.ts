import type {
  PublicAuditFeedItemDto,
  PublicAuditFeedQuery,
  PublicCityItem,
  PublicMapData,
  PublicOverviewData,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import PublicRepository, {
  type PublicRegionRecord,
  type PublicRepositoryPort,
} from '../repository/public.repository.js';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, '0');

function toWibYearMonth(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return `${wib.getUTCFullYear()}-${pad2(wib.getUTCMonth() + 1)}`;
}

async function resolveOptionalRegion(
  repo: PublicRepositoryPort,
  city?: string,
): Promise<PublicRegionRecord | null> {
  const normalized = city?.trim();
  if (
    !normalized ||
    normalized.toLowerCase() === 'all' ||
    normalized.toLowerCase() === 'semua kota'
  ) {
    return null;
  }

  const found = await repo.findRegionByCityOrCode(normalized);
  if (!found) {
    throw new AppError(
      404,
      'CITY_NOT_FOUND',
      'Kota tidak ditemukan dalam sistem PATRA.',
    );
  }
  return found;
}

export interface PublicServiceDeps {
  repo?: PublicRepositoryPort;
  now?: () => Date;
}

export function createPublicService(deps: PublicServiceDeps = {}) {
  const repo = deps.repo ?? PublicRepository;
  const getNow = deps.now ?? (() => new Date());

  return {
    async listCities(): Promise<PublicCityItem[]> {
      return repo.findAllRegions();
    },

    async getOverview(city?: string): Promise<PublicOverviewData> {
      const region = await resolveOptionalRegion(repo, city);
      const metrics = await repo.findReportMetrics(region?.id);
      const currentWibMonth = toWibYearMonth(getNow());

      let totalViolationsThisMonth = 0;
      let validatedCount = 0;
      let slaSumMinutes = 0;
      let slaCount = 0;
      let totalPklDirectedToRelocation = 0;

      for (const r of metrics) {
        if (toWibYearMonth(r.createdAt) === currentWibMonth) {
          totalViolationsThisMonth++;
        }

        if (r.status === 'VALIDATED') {
          validatedCount++;
          if (r.relocationSiteId !== null) {
            totalPklDirectedToRelocation += Math.max(
              1,
              r.actualPklCount ?? r.detectedCount,
            );
          }
        }

        if (r.actionSubmittedAt) {
          const slaMin = Math.max(
            0,
            (r.actionSubmittedAt.getTime() - r.createdAt.getTime()) / 60000,
          );
          slaSumMinutes += slaMin;
          slaCount++;
        }
      }

      const resolutionRatePercent =
        metrics.length === 0
          ? 0
          : Math.round((validatedCount / metrics.length) * 1000) / 10;

      const avgResponseSlaMinutes =
        slaCount === 0 ? null : Math.round(slaSumMinutes / slaCount);

      return {
        city: region ? region.city : 'Semua Kota',
        kpi: {
          totalViolationsThisMonth,
          resolutionRatePercent,
          avgResponseSlaMinutes,
          totalPklDirectedToRelocation,
        },
      };
    },

    async getMap(city?: string): Promise<PublicMapData> {
      const region = await resolveOptionalRegion(repo, city);
      const mapData = await repo.findMapData(region?.id);

      return {
        region: region
          ? {
              city: region.city,
              centerLat: region.centerLat,
              centerLng: region.centerLng,
              defaultZoom: region.defaultZoom,
            }
          : {
              city: 'Semua Kota',
              centerLat: -6.75,
              centerLng: 108.6,
              defaultZoom: 7,
            },
        zones: mapData.zones.map((z) => ({
          id: z.id,
          name: z.name,
          points: z.points,
        })),
        // PRIVASI PUBLIK: DILARANG menyertakan beforeImageUrl / afterImageUrl
        hotspots: mapData.hotspots.map((h) => ({
          id: h.id,
          reportCode: h.reportCode,
          address: h.address,
          lat: h.lat,
          lng: h.lng,
          detectedCount: h.detectedCount,
          status: h.status,
          createdAt: h.createdAt.toISOString(),
        })),
        relocationSites: mapData.relocationSites.map((s) => ({
          id: s.id,
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          tradeCategories: s.tradeCategories,
          facilities: s.facilities,
        })),
      };
    },

    async getAuditFeed(query: PublicAuditFeedQuery): Promise<{
      items: PublicAuditFeedItemDto[];
      meta: { city: string; limit: number; total: number };
    }> {
      const region = await resolveOptionalRegion(repo, query.city);
      const records = await repo.findAuditFeed(query.limit, region?.id);

      const items: PublicAuditFeedItemDto[] = records.map((r) => ({
        id: r.id,
        reportCode: r.reportCode,
        city: r.city,
        address: r.address,
        status: r.status,
        detectedAt: r.createdAt.toISOString(),
        actionSubmittedAt: r.actionSubmittedAt
          ? r.actionSubmittedAt.toISOString()
          : null,
        validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
        responseSlaMinutes: r.actionSubmittedAt
          ? Math.round(
              Math.max(
                0,
                (r.actionSubmittedAt.getTime() - r.createdAt.getTime()) / 60000,
              ),
            )
          : null,
        relocationSiteName: r.relocationSiteName,
      }));

      return {
        items,
        meta: {
          city: region ? region.city : 'Semua Kota',
          limit: query.limit,
          total: items.length,
        },
      };
    },
  };
}

export const PublicService = createPublicService();
export default PublicService;
