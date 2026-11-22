// Kontrak Dashboard Analitik Dinas UMKM (Section 3.3F data_contract.md)
// LOCKED DECISION: planningMap TIDAK PERNAH menyertakan array cameras (pin CCTV).
export interface DinasAnalyticsData {
  kpi: {
    totalIncomingReports: number;
    validatedPercent: number;
    avgResponseSlaMinutes: number | null;
    totalRelocationDirected: number;
  };
  dailyTrend: Array<{
    date: string;
    count: number;
  }>;
  peakHoursWib: Array<{
    hour: number;
    label: string;
    count: number;
  }>;
  topHotspotStreets: Array<{
    address: string;
    count: number;
    validatedCount: number;
  }>;
  planningMap: {
    validatedPoints: Array<{
      id: string;
      lat: number;
      lng: number;
      address: string;
      weight: number;
    }>;
    relocationSites: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      address: string;
      facilities: string[];
    }>;
  };
}
