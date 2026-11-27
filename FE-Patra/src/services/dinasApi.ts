import {
  ApiError,
  apiFetch,
  getApiBaseUrl,
  getOfflinePreviewDemoKey,
  getStoredToken,
} from '@/lib/apiClient';
import { escapeHtml, extractPdfFilename } from '@/lib/dinasHelpers';
import {
  ENFORCEMENT_ACTION_LABELS,
  formatSlaDuration,
  formatWibDateTime,
} from '@/lib/formatters';
import { IS_BACKEND_ENABLED, type ReportListPagination } from '@/services/api';
import type {
  AssignRelocationPayload,
  CreateRelocationSiteInput,
  DinasAnalyticsData,
  NearestRelocationSiteDto,
  RelocationSiteDto,
  ReportStatus,
  UpdateRelocationSiteInput,
  ValidateReportPayload,
  ViolationReportDetailDto,
  ViolationReportDto,
} from '@/types';

// ============================================================================
// OFFLINE MOCK FALLBACK (Hanya aktif bila VITE_USE_BACKEND !== 'true')
// Dikelola terpisah dari offlineMock.ts agar tidak bentrok dengan modul Satpol.
// ============================================================================

type MockCityKey = 'jkt-pusat' | 'semarang';

function resolveMockCityKey(): MockCityKey {
  const demoKey = getOfflinePreviewDemoKey();
  const token = getStoredToken();
  const raw = demoKey ?? (token?.startsWith('mock:') ? token.slice('mock:'.length) : '');
  return raw.includes('jkt') ? 'jkt-pusat' : 'semarang';
}

function makeMockSvgPhoto(
  title: string,
  subtitle: string,
  badge: string,
  accentHex: string,
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0B132B"/>
        <stop offset="100%" stop-color="#1E293B"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)"/>
    <rect x="44" y="44" width="712" height="362" rx="18" fill="none" stroke="${accentHex}" stroke-width="3" stroke-dasharray="10 8" opacity="0.85"/>
    <rect x="64" y="64" width="180" height="34" rx="17" fill="${accentHex}"/>
    <text x="154" y="86" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="700">${escapeHtml(badge)}</text>
    <text x="400" y="215" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="24" font-weight="700">${escapeHtml(title)}</text>
    <text x="400" y="252" text-anchor="middle" fill="#CBD5E1" font-family="sans-serif" font-size="15">${escapeHtml(subtitle)}</text>
    <text x="400" y="348" text-anchor="middle" fill="#94A3B8" font-family="monospace" font-size="13">PATRA • Dokumentasi Tanpa Sensor Wajah (Internal Instansi)</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistanceLabel(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const km = Math.round((meters / 1000) * 10) / 10;
  return `${km} km`;
}

function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

interface MockRegionState {
  regionId: string;
  agencyName: string;
  cityName: string;
  sites: RelocationSiteDto[];
  reports: ViolationReportDetailDto[];
}

const mockStore: Record<MockCityKey, MockRegionState> = {
  'jkt-pusat': {
    regionId: 'reg-jkt-pusat',
    agencyName: 'Suku Dinas PPKUKM Jakarta Pusat',
    cityName: 'Jakarta Pusat',
    sites: [
      {
        id: 'site-jkt-1',
        regionId: 'reg-jkt-pusat',
        name: 'Lokbin JP 25 Pasar Baru',
        address: 'Jl. Pasar Baru Timur Dalam No. 12, Sawah Besar, Jakarta Pusat',
        lat: -6.1652,
        lng: 106.8358,
        tradeCategories: ['Kuliner', 'Minuman', 'Aksesoris'],
        facilities: ['Listrik PLN', 'Air Bersih', 'Toilet', 'Kanopi Permanen'],
        isActive: true,
        createdAt: isoHoursAgo(720),
        updatedAt: isoHoursAgo(120),
      },
      {
        id: 'site-jkt-2',
        regionId: 'reg-jkt-pusat',
        name: 'JP 42 Kuliner Sabang Binaan',
        address: 'Jl. H. Agus Salim Kav. 21, Menteng, Jakarta Pusat',
        lat: -6.1835,
        lng: 106.8246,
        tradeCategories: ['Kuliner Malam', 'Kopi & Jajanan'],
        facilities: ['Tenda Resmi', 'Air Bersih', 'Penerangan Jalan', 'Area Parkir'],
        isActive: true,
        createdAt: isoHoursAgo(600),
        updatedAt: isoHoursAgo(80),
      },
      {
        id: 'site-jkt-3',
        regionId: 'reg-jkt-pusat',
        name: 'Loksem JP 08 Tanah Abang Blok G',
        address: 'Jl. Kebon Jati No. 8, Tanah Abang, Jakarta Pusat',
        lat: -6.1879,
        lng: 106.8147,
        tradeCategories: ['Sandang', 'Kuliner', 'Kelontong'],
        facilities: ['Mushola', 'Toilet', 'Keamanan 24 Jam', 'Listrik'],
        isActive: true,
        createdAt: isoHoursAgo(500),
        updatedAt: isoHoursAgo(40),
      },
    ],
    reports: [
      {
        id: 'rep-dinas-jkt-1',
        reportCode: 'PTR-202611-JKT01',
        regionId: 'reg-jkt-pusat',
        cameraId: 'cam-jkt-1',
        zoneId: 'zone-jkt-1',
        source: 'AUTO_AI',
        status: 'PENDING_VALIDATION',
        address: 'Jl. M.H. Thamrin Trotoar Barat (Simpang Sarinah)',
        lat: -6.1872,
        lng: 106.8235,
        detectedCount: 3,
        maxConfidence: 0.89,
        beforeImageUrl: makeMockSvgPhoto(
          'Trotoar Simpang Sarinah (Before)',
          '3 PKL terdeteksi di dalam ROI zona merah',
          'BEFORE • CCTV AI',
          '#DC2626',
        ),
        isSimulationMode: false,
        afterImageUrl: makeMockSvgPhoto(
          'Trotoar Simpang Sarinah (After)',
          'Pedagang dipindah persuasif ke area tunggu relokasi',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes:
          'Pendataan 3 pedagang minuman & jajanan kaki lima di trotoar Sarinah. Pedagang bersedia diarahkan ke lokasi binaan terdekat.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-jkt',
        actionSubmittedAt: isoHoursAgo(1.5),
        validatedByUserId: null,
        validatedAt: null,
        revisionReason: null,
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: isoHoursAgo(2.2),
        updatedAt: isoHoursAgo(1.5),
        cameraName: 'CCTV Simpang Sarinah Timur',
        zoneName: 'Koridor Pedestrian Thamrin-Sarinah',
        relocationSiteName: null,
        auditLogs: [
          {
            id: 'log-jkt-1',
            reportId: 'rep-dinas-jkt-1',
            actorId: null,
            actorRole: 'SYSTEM_AI',
            actorName: 'PATRA Edge AI',
            action: 'REPORT_CREATED',
            fromStatus: null,
            toStatus: 'NEED_ACTION',
            note: 'Deteksi otomatis 3 gerobak PKL di ROI trotoar > ambang durasi.',
            metadata: null,
            createdAt: isoHoursAgo(2.2),
          },
          {
            id: 'log-jkt-2',
            reportId: 'rep-dinas-jkt-1',
            actorId: 'usr-satpol-jkt',
            actorRole: 'SATPOL_PP',
            actorName: 'Petugas Satpol PP Jakarta Pusat',
            action: 'ACTION_SUBMITTED',
            fromStatus: 'NEED_ACTION',
            toStatus: 'PENDING_VALIDATION',
            note: 'Pendampingan persuasif selesai, mengajukan relokasi Dinas PPKUKM.',
            metadata: null,
            createdAt: isoHoursAgo(1.5),
          },
        ],
        nearestRelocationSites: [],
      },
      {
        id: 'rep-dinas-jkt-2',
        reportCode: 'PTR-202611-JKT02',
        regionId: 'reg-jkt-pusat',
        cameraId: 'cam-jkt-2',
        zoneId: 'zone-jkt-2',
        source: 'MANUAL',
        status: 'VALIDATED',
        address: 'Jl. Pasar Baru Selatan Trotoar Pintu Air',
        lat: -6.1674,
        lng: 106.8342,
        detectedCount: 2,
        maxConfidence: 0.85,
        beforeImageUrl: makeMockSvgPhoto(
          'Jl. Pasar Baru Selatan (Before)',
          '2 gerobak kuliner menutup akses pejalan kaki',
          'BEFORE • CAPTURE',
          '#DC2626',
        ),
        isSimulationMode: true,
        afterImageUrl: makeMockSvgPhoto(
          'Jl. Pasar Baru Selatan (After)',
          'Trotoar bersih dan lapak siap dipindahkan ke Lokbin JP 25',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Edukasi Perda Ketertiban Umum dan pengajuan penempatan di Lokbin JP 25.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-jkt',
        actionSubmittedAt: isoHoursAgo(16),
        validatedByUserId: 'usr-dinas-jkt',
        validatedAt: isoHoursAgo(14),
        revisionReason: null,
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: isoHoursAgo(17),
        updatedAt: isoHoursAgo(14),
        cameraName: 'CCTV Simpang Pasar Baru',
        zoneName: 'Zona Bebas PKL Pasar Baru',
        relocationSiteName: null,
        auditLogs: [
          {
            id: 'log-jkt-3',
            reportId: 'rep-dinas-jkt-2',
            actorId: 'usr-satpol-jkt',
            actorRole: 'SATPOL_PP',
            actorName: 'Petugas Satpol PP Jakarta Pusat',
            action: 'REPORT_CREATED',
            fromStatus: null,
            toStatus: 'NEED_ACTION',
            note: 'Tangkapan manual saat patroli CCTV.',
            metadata: null,
            createdAt: isoHoursAgo(17),
          },
          {
            id: 'log-jkt-4',
            reportId: 'rep-dinas-jkt-2',
            actorId: 'usr-satpol-jkt',
            actorRole: 'SATPOL_PP',
            actorName: 'Petugas Satpol PP Jakarta Pusat',
            action: 'ACTION_SUBMITTED',
            fromStatus: 'NEED_ACTION',
            toStatus: 'PENDING_VALIDATION',
            note: 'Foto After terunggah dengan pengajuan relokasi.',
            metadata: null,
            createdAt: isoHoursAgo(16),
          },
          {
            id: 'log-jkt-5',
            reportId: 'rep-dinas-jkt-2',
            actorId: 'usr-dinas-jkt',
            actorRole: 'DINAS_UMKM',
            actorName: 'Suku Dinas PPKUKM Jakarta Pusat',
            action: 'REPORT_VALIDATED',
            fromStatus: 'PENDING_VALIDATION',
            toStatus: 'VALIDATED',
            note: 'Bukti Before-After sesuai prosedur humanis.',
            metadata: null,
            createdAt: isoHoursAgo(14),
          },
        ],
        nearestRelocationSites: [],
      },
      {
        id: 'rep-dinas-jkt-3',
        reportCode: 'PTR-202611-JKT03',
        regionId: 'reg-jkt-pusat',
        cameraId: 'cam-jkt-3',
        zoneId: null,
        source: 'AUTO_AI',
        status: 'VALIDATED',
        address: 'Jl. Kebon Sirih Barat (Depan Halte)',
        lat: -6.1821,
        lng: 106.8264,
        detectedCount: 2,
        maxConfidence: 0.81,
        beforeImageUrl: makeMockSvgPhoto(
          'Jl. Kebon Sirih Barat (Before)',
          '2 PKL berjualan di jalur halte',
          'BEFORE • CCTV AI',
          '#DC2626',
        ),
        isSimulationMode: false,
        afterImageUrl: makeMockSvgPhoto(
          'Jl. Kebon Sirih Barat (After)',
          'Area halte steril, PKL diarahkan ke JP 42 Sabang',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Penataan persuasif berjalan kondusif.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-jkt',
        actionSubmittedAt: isoHoursAgo(42),
        validatedByUserId: 'usr-dinas-jkt',
        validatedAt: isoHoursAgo(40),
        revisionReason: null,
        relocationSiteId: 'site-jkt-2',
        relocationAssignedAt: isoHoursAgo(39.5),
        createdAt: isoHoursAgo(43),
        updatedAt: isoHoursAgo(39.5),
        cameraName: 'CCTV Simpang Kebon Sirih',
        zoneName: null,
        relocationSiteName: 'JP 42 Kuliner Sabang Binaan',
        auditLogs: [],
        nearestRelocationSites: [],
      },
    ],
  },
  semarang: {
    regionId: 'reg-semarang',
    agencyName: 'Dinas Koperasi & UKM Kota Semarang',
    cityName: 'Kota Semarang',
    sites: [
      {
        id: 'site-smg-1',
        regionId: 'reg-semarang',
        name: 'Selter PKL Taman Menteri Supeno (Taman KB)',
        address: 'Jl. Taman Menteri Supeno No. 1, Mugassari, Semarang Selatan',
        lat: -6.9927,
        lng: 110.4201,
        tradeCategories: ['Kuliner', 'Minuman', 'Cinderamata'],
        facilities: ['Listrik', 'Air Bersih', 'Area Duduk Teduh', 'Toilet Umum'],
        isActive: true,
        createdAt: isoHoursAgo(720),
        updatedAt: isoHoursAgo(100),
      },
      {
        id: 'site-smg-2',
        regionId: 'reg-semarang',
        name: 'Sentra Kuliner Binaan Basudewo',
        address: 'Jl. Basudewo Raya No. 14, Bulustalan, Semarang Selatan',
        lat: -6.9885,
        lng: 110.4024,
        tradeCategories: ['Kuliner', 'Gorengan & Kopi'],
        facilities: ['Tenda Seragam', 'Air Mengalir', 'Tempat Sampah Terpilah'],
        isActive: true,
        createdAt: isoHoursAgo(650),
        updatedAt: isoHoursAgo(90),
      },
      {
        id: 'site-smg-3',
        regionId: 'reg-semarang',
        name: 'Selter PKL Kokrosono Kanalsari',
        address: 'Jl. Kokrosono Kav. 5, Pindrikan Lor, Semarang Tengah',
        lat: -6.9742,
        lng: 110.4086,
        tradeCategories: ['Kuliner', 'Aksesoris', 'Jajanan Pasar'],
        facilities: ['Kanopi', 'Lampu Penerangan', 'Akses Parkir Motor'],
        isActive: true,
        createdAt: isoHoursAgo(540),
        updatedAt: isoHoursAgo(50),
      },
    ],
    reports: [
      {
        id: 'rep-dinas-smg-1',
        reportCode: 'PTR-202611-SMG01',
        regionId: 'reg-semarang',
        cameraId: 'cam-smg-1',
        zoneId: 'zone-smg-1',
        source: 'AUTO_AI',
        status: 'PENDING_VALIDATION',
        address: 'Jl. Pandanaran Trotoar Utara (Simpang Lima)',
        lat: -6.9896,
        lng: 110.4228,
        detectedCount: 4,
        maxConfidence: 0.91,
        beforeImageUrl: makeMockSvgPhoto(
          'Koridor Pandanaran Simpang Lima (Before)',
          '4 gerobak PKL terdeteksi AI di trotoar zona terlarang',
          'BEFORE • CCTV AI',
          '#DC2626',
        ),
        isSimulationMode: true,
        afterImageUrl: makeMockSvgPhoto(
          'Koridor Pandanaran Simpang Lima (After)',
          'Trotoar kembali leluasa, pedagang didampingi untuk relokasi',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 4,
        educationNotes:
          'Pendekatan humanis kepada 4 pelaku usaha kuliner di trotoar Pandanaran. Memohon penetapan Selter Binaan terdekat dari Dinas Koperasi & UKM.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-smg',
        actionSubmittedAt: isoHoursAgo(0.8),
        validatedByUserId: null,
        validatedAt: null,
        revisionReason: null,
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: isoHoursAgo(1.4),
        updatedAt: isoHoursAgo(0.8),
        cameraName: 'CCTV Simpang Lima Pandanaran',
        zoneName: 'Zona Larangan PKL Simpang Lima',
        relocationSiteName: null,
        auditLogs: [
          {
            id: 'log-smg-1',
            reportId: 'rep-dinas-smg-1',
            actorId: null,
            actorRole: 'SYSTEM_AI',
            actorName: 'PATRA Edge AI',
            action: 'REPORT_CREATED',
            fromStatus: null,
            toStatus: 'NEED_ACTION',
            note: 'Deteksi otomatis 4 gerobak PKL dalam poligon ROI Pandanaran.',
            metadata: null,
            createdAt: isoHoursAgo(1.4),
          },
          {
            id: 'log-smg-2',
            reportId: 'rep-dinas-smg-1',
            actorId: 'usr-satpol-smg',
            actorRole: 'SATPOL_PP',
            actorName: 'Petugas Satpol PP Semarang',
            action: 'ACTION_SUBMITTED',
            fromStatus: 'NEED_ACTION',
            toStatus: 'PENDING_VALIDATION',
            note: 'Penataan persuasif selesai dan foto After dikirim.',
            metadata: null,
            createdAt: isoHoursAgo(0.8),
          },
        ],
        nearestRelocationSites: [],
      },
      {
        id: 'rep-dinas-smg-2',
        reportCode: 'PTR-202611-SMG02',
        regionId: 'reg-semarang',
        cameraId: 'cam-smg-2',
        zoneId: 'zone-smg-2',
        source: 'AUTO_AI',
        status: 'VALIDATED',
        address: 'Jl. Pemuda Simpang Tugumuda',
        lat: -6.9844,
        lng: 110.4094,
        detectedCount: 2,
        maxConfidence: 0.87,
        beforeImageUrl: makeMockSvgPhoto(
          'Simpang Tugumuda Semarang (Before)',
          '2 pedagang kaki lima di bahu pedestrian',
          'BEFORE • CCTV AI',
          '#DC2626',
        ),
        isSimulationMode: false,
        afterImageUrl: makeMockSvgPhoto(
          'Simpang Tugumuda Semarang (After)',
          'Pedestrian tertata bersih setelah edukasi',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 2,
        educationNotes: 'Pedagang menyetujui arahan relokasi ke sentra binaan.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-smg',
        actionSubmittedAt: isoHoursAgo(12),
        validatedByUserId: 'usr-dinas-smg',
        validatedAt: isoHoursAgo(11),
        revisionReason: null,
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: isoHoursAgo(13),
        updatedAt: isoHoursAgo(11),
        cameraName: 'CCTV Bundaran Tugumuda',
        zoneName: 'Koridor Cagar Budaya Tugumuda',
        relocationSiteName: null,
        auditLogs: [
          {
            id: 'log-smg-3',
            reportId: 'rep-dinas-smg-2',
            actorId: null,
            actorRole: 'SYSTEM_AI',
            actorName: 'PATRA Edge AI',
            action: 'REPORT_CREATED',
            fromStatus: null,
            toStatus: 'NEED_ACTION',
            note: 'Deteksi otomatis 2 PKL di pedestrian Tugumuda.',
            metadata: null,
            createdAt: isoHoursAgo(13),
          },
          {
            id: 'log-smg-4',
            reportId: 'rep-dinas-smg-2',
            actorId: 'usr-satpol-smg',
            actorRole: 'SATPOL_PP',
            actorName: 'Petugas Satpol PP Semarang',
            action: 'ACTION_SUBMITTED',
            fromStatus: 'NEED_ACTION',
            toStatus: 'PENDING_VALIDATION',
            note: 'Foto After terunggah, menunggu validasi.',
            metadata: null,
            createdAt: isoHoursAgo(12),
          },
          {
            id: 'log-smg-5',
            reportId: 'rep-dinas-smg-2',
            actorId: 'usr-dinas-smg',
            actorRole: 'DINAS_UMKM',
            actorName: 'Dinas Koperasi & UKM Kota Semarang',
            action: 'REPORT_VALIDATED',
            fromStatus: 'PENDING_VALIDATION',
            toStatus: 'VALIDATED',
            note: 'Laporan disetujui, siap ditetapkan lokasi binaan.',
            metadata: null,
            createdAt: isoHoursAgo(11),
          },
        ],
        nearestRelocationSites: [],
      },
      {
        id: 'rep-dinas-smg-3',
        reportCode: 'PTR-202611-SMG03',
        regionId: 'reg-semarang',
        cameraId: 'cam-smg-3',
        zoneId: null,
        source: 'MANUAL',
        status: 'VALIDATED',
        address: 'Jl. Pahlawan Taman Indonesia Kaya',
        lat: -6.9935,
        lng: 110.4209,
        detectedCount: 3,
        maxConfidence: 0.84,
        beforeImageUrl: makeMockSvgPhoto(
          'Jl. Pahlawan Semarang (Before)',
          '3 PKL di jalur pejalan kaki Jl. Pahlawan',
          'BEFORE • CAPTURE',
          '#DC2626',
        ),
        isSimulationMode: false,
        afterImageUrl: makeMockSvgPhoto(
          'Jl. Pahlawan Semarang (After)',
          'Pedagang dipindah rapi ke Selter Taman Menteri Supeno',
          'AFTER • SATPOL PP',
          '#059669',
        ),
        actionType: 'RELOCATION_ASSISTANCE',
        actualPklCount: 3,
        educationNotes: 'Pendampingan bersama pengurus paguyuban UMKM.',
        relocationRequested: true,
        actionByUserId: 'usr-satpol-smg',
        actionSubmittedAt: isoHoursAgo(36),
        validatedByUserId: 'usr-dinas-smg',
        validatedAt: isoHoursAgo(34),
        revisionReason: null,
        relocationSiteId: 'site-smg-1',
        relocationAssignedAt: isoHoursAgo(33.5),
        createdAt: isoHoursAgo(37),
        updatedAt: isoHoursAgo(33.5),
        cameraName: 'CCTV Simpang Jl. Pahlawan',
        zoneName: null,
        relocationSiteName: 'Selter PKL Taman Menteri Supeno (Taman KB)',
        auditLogs: [],
        nearestRelocationSites: [],
      },
      {
        id: 'rep-dinas-smg-4',
        reportCode: 'PTR-202611-SMG04',
        regionId: 'reg-semarang',
        cameraId: 'cam-smg-4',
        zoneId: 'zone-smg-1',
        source: 'AUTO_AI',
        status: 'NEEDS_REVISION',
        address: 'Jl. Gajahmada Simpang Kampung Kali',
        lat: -6.9822,
        lng: 110.4184,
        detectedCount: 2,
        maxConfidence: 0.79,
        beforeImageUrl: makeMockSvgPhoto(
          'Jl. Gajahmada Semarang (Before)',
          '2 PKL terdeteksi di trotoar sisi timur',
          'BEFORE • CCTV AI',
          '#DC2626',
        ),
        isSimulationMode: false,
        afterImageUrl: makeMockSvgPhoto(
          'Jl. Gajahmada Semarang (After - Perlu Ulang)',
          'Sudut foto terlalu jauh dari lokasi awal',
          'AFTER • REVISI',
          '#D97706',
        ),
        actionType: 'EDUCATION_WARNING',
        actualPklCount: 2,
        educationNotes: 'Edukasi lisan diberikan di lokasi.',
        relocationRequested: false,
        actionByUserId: 'usr-satpol-smg',
        actionSubmittedAt: isoHoursAgo(24),
        validatedByUserId: 'usr-dinas-smg',
        validatedAt: isoHoursAgo(22),
        revisionReason:
          'Foto After belum memperlihatkan marka trotoar yang sama dengan foto Before.',
        relocationSiteId: null,
        relocationAssignedAt: null,
        createdAt: isoHoursAgo(25),
        updatedAt: isoHoursAgo(22),
        cameraName: 'CCTV Jl. Gajahmada',
        zoneName: 'Zona Larangan PKL Gajahmada',
        relocationSiteName: null,
        auditLogs: [],
        nearestRelocationSites: [],
      },
    ],
  },
};

function computeNearestSites(
  sites: RelocationSiteDto[],
  lat: number,
  lng: number,
): NearestRelocationSiteDto[] {
  return sites
    .filter((s) => s.isActive)
    .map((site) => {
      const distanceMeters = haversineMeters(lat, lng, site.lat, site.lng);
      return {
        id: site.id,
        name: site.name,
        address: site.address,
        lat: site.lat,
        lng: site.lng,
        tradeCategories: site.tradeCategories,
        facilities: site.facilities,
        distanceMeters,
        distanceLabel: formatDistanceLabel(distanceMeters),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 3);
}

function hydrateMockReportDetail(
  state: MockRegionState,
  report: ViolationReportDetailDto,
): ViolationReportDetailDto {
  const assignedSite = report.relocationSiteId
    ? state.sites.find((s) => s.id === report.relocationSiteId) ?? null
    : null;
  return {
    ...report,
    relocationSiteName: assignedSite?.name ?? report.relocationSiteName ?? null,
    nearestRelocationSites: computeNearestSites(state.sites, report.lat, report.lng),
  };
}

function buildMockAnalytics(state: MockRegionState): DinasAnalyticsData {
  const totalIncomingReports = state.reports.length;
  const validatedReports = state.reports.filter((r) => r.status === 'VALIDATED');
  const validatedPercent =
    totalIncomingReports > 0
      ? Math.round((validatedReports.length / totalIncomingReports) * 100)
      : 0;

  const slaSamples = state.reports
    .filter((r) => r.actionSubmittedAt)
    .map((r) =>
      Math.max(
        1,
        Math.round(
          (new Date(r.actionSubmittedAt!).getTime() - new Date(r.createdAt).getTime()) /
            60000,
        ),
      ),
    );
  const avgResponseSlaMinutes =
    slaSamples.length > 0
      ? Math.round(slaSamples.reduce((acc, v) => acc + v, 0) / slaSamples.length)
      : null;

  const totalRelocationDirected = state.reports.filter(
    (r) => r.relocationSiteId !== null,
  ).length;

  const now = new Date();
  const dailyTrend: DinasAnalyticsData['dailyTrend'] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const isoDay = `${yyyy}-${mm}-${dd}`;
    const liveMatch = state.reports.filter((r) => r.createdAt.slice(0, 10) === isoDay).length;
    const baseline = i === 0 ? liveMatch : (i % 7 === 1 || i % 5 === 0 ? 1 : 0);
    dailyTrend.push({ date: isoDay, count: Math.max(liveMatch, baseline) });
  }

  const peakHoursWib: DinasAnalyticsData['peakHoursWib'] = Array.from(
    { length: 24 },
    (_, hour) => {
      const label = `${String(hour).padStart(2, '0')}:00`;
      const base = hour >= 16 && hour <= 20 ? 2 : hour >= 8 && hour <= 11 ? 1 : 0;
      return { hour, label, count: base };
    },
  );

  const streetMap = new Map<string, { count: number; validatedCount: number }>();
  for (const rep of state.reports) {
    const prev = streetMap.get(rep.address) ?? { count: 0, validatedCount: 0 };
    prev.count += 1;
    if (rep.status === 'VALIDATED') prev.validatedCount += 1;
    streetMap.set(rep.address, prev);
  }
  const topHotspotStreets = Array.from(streetMap.entries())
    .map(([address, stats]) => ({ address, ...stats }))
    .sort((a, b) => b.count - a.count)
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
    planningMap: {
      validatedPoints: validatedReports.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        address: r.address,
        weight: Math.max(1, r.actualPklCount ?? r.detectedCount),
      })),
      relocationSites: state.sites
        .filter((s) => s.isActive)
        .map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          facilities: s.facilities,
        })),
    },
  };
}

function openMockPrintableBeritaAcara(
  state: MockRegionState,
  report: ViolationReportDetailDto,
): void {
  const siteName =
    report.relocationSiteName ??
    (report.relocationSiteId
      ? state.sites.find((s) => s.id === report.relocationSiteId)?.name
      : null);

  const html = `<!doctype html>
  <html lang="id">
    <head>
      <meta charset="utf-8" />
      <title>Berita Acara PATRA - ${escapeHtml(report.reportCode)}</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #0f172a; margin: 32px; }
        .header { background: #043FA5; color: #fff; padding: 18px 24px; border-radius: 12px; display:flex; justify-content:space-between; align-items:center; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
        .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; }
        img { width: 100%; border-radius: 8px; max-height: 220px; object-fit: cover; }
        .meta { margin-top: 16px; font-size: 13px; line-height: 1.6; }
        .btn { margin-top: 20px; padding: 10px 18px; background: #043FA5; color: #fff; border: 0; border-radius: 8px; cursor: pointer; font-weight: 700; }
        @media print { .btn { display: none; } body { margin: 12px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div style="font-size:12px;opacity:.85;">PEMERINTAH ${escapeHtml(state.cityName.toUpperCase())}</div>
          <div style="font-size:18px;font-weight:800;">${escapeHtml(state.agencyName)}</div>
        </div>
        <div style="text-align:right;font-family:monospace;">${escapeHtml(report.reportCode)}</div>
      </div>
      <div class="meta">
        <strong>Alamat Pelanggaran:</strong> ${escapeHtml(report.address)}<br/>
        <strong>Jenis Tindakan Satpol PP:</strong> ${escapeHtml(
          report.actionType ? ENFORCEMENT_ACTION_LABELS[report.actionType] : '-',
        )}<br/>
        <strong>SLA Penanganan:</strong> ${escapeHtml(
          formatSlaDuration(report.createdAt, report.actionSubmittedAt),
        )}<br/>
        <strong>Divalidasi Pada:</strong> ${escapeHtml(formatWibDateTime(report.validatedAt))}<br/>
        <strong>Arahan Lokasi Relokasi:</strong> ${escapeHtml(
          siteName ?? (report.relocationRequested ? 'Menunggu penetapan lokasi binaan' : 'Tidak diperlukan'),
        )}
      </div>
      <div class="grid">
        <div class="card">
          <strong>Bukti Awal (Before)</strong>
          <p style="font-size:12px;color:#475569;">${escapeHtml(formatWibDateTime(report.createdAt))}</p>
          <img src="${report.beforeImageUrl}" alt="Before" />
        </div>
        <div class="card">
          <strong>Bukti Penindakan (After)</strong>
          <p style="font-size:12px;color:#475569;">${escapeHtml(formatWibDateTime(report.actionSubmittedAt))}</p>
          ${report.afterImageUrl ? `<img src="${report.afterImageUrl}" alt="After" />` : '<p>Belum ada foto After</p>'}
        </div>
      </div>
      <button class="btn" onclick="window.print()">Cetak / Simpan sebagai PDF (A4)</button>
    </body>
  </html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ============================================================================
// PUBLIC API CLIENTS FOR PORTAL DINAS UMKM (T2-06)
// ============================================================================

export const dinasAnalyticsApi = {
  async getAnalytics(): Promise<DinasAnalyticsData> {
    if (!IS_BACKEND_ENABLED) {
      return buildMockAnalytics(mockStore[resolveMockCityKey()]);
    }
    const res = await apiFetch<DinasAnalyticsData>('/api/dinas/analytics');
    return res.data;
  },
};

export const dinasReportApi = {
  async list(params?: {
    statuses?: ReportStatus[];
    relocationRequested?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ reports: ViolationReportDto[]; pagination: ReportListPagination }> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      let filtered = [...state.reports];

      if (params?.statuses && params.statuses.length > 0) {
        filtered = filtered.filter((r) => params.statuses!.includes(r.status));
      }
      if (params?.relocationRequested !== undefined) {
        filtered = filtered.filter(
          (r) => r.relocationRequested === params.relocationRequested,
        );
      }
      if (params?.search?.trim()) {
        const q = params.search.trim().toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.reportCode.toLowerCase().includes(q) ||
            r.address.toLowerCase().includes(q),
        );
      }

      const pageSize = params?.pageSize ?? 12;
      const page = Math.max(1, params?.page ?? 1);
      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

      return {
        reports: paged,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: totalItems === 0 ? 0 : totalPages,
        },
      };
    }

    const qs = new URLSearchParams();
    if (params?.statuses && params.statuses.length > 0) {
      qs.set('status', params.statuses.join(','));
    }
    if (params?.relocationRequested !== undefined) {
      qs.set('relocationRequested', String(params.relocationRequested));
    }
    if (params?.search?.trim()) {
      qs.set('search', params.search.trim());
    }
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const res = await apiFetch<
      { reports: ViolationReportDto[] },
      { pagination: ReportListPagination }
    >(`/api/reports${suffix}`);

    return {
      reports: res.data.reports,
      pagination: res.meta?.pagination ?? {
        page: 1,
        pageSize: 20,
        totalItems: res.data.reports.length,
        totalPages: res.data.reports.length > 0 ? 1 : 0,
      },
    };
  },

  async getById(id: string): Promise<ViolationReportDetailDto> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const found = state.reports.find((r) => r.id === id);
      if (!found) {
        throw new ApiError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      return hydrateMockReportDetail(state, found);
    }

    const res = await apiFetch<{ report: ViolationReportDetailDto }>(
      `/api/reports/${encodeURIComponent(id)}`,
    );
    return res.data.report;
  },

  async validate(
    id: string,
    payload: ValidateReportPayload,
  ): Promise<ViolationReportDetailDto> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const idx = state.reports.findIndex((r) => r.id === id);
      if (idx === -1) {
        throw new ApiError(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan.');
      }
      const existing = state.reports[idx];
      if (existing.status !== 'PENDING_VALIDATION') {
        throw new ApiError(
          409,
          'INVALID_REPORT_STATE',
          'Status laporan sudah berubah sebelum validasi dikirim.',
        );
      }

      const nowIso = new Date().toISOString();
      const nextStatus: ReportStatus =
        payload.decision === 'APPROVE' ? 'VALIDATED' : 'NEEDS_REVISION';

      const updated: ViolationReportDetailDto = {
        ...existing,
        status: nextStatus,
        validatedByUserId: `usr-dinas-${resolveMockCityKey()}`,
        validatedAt: nowIso,
        revisionReason:
          payload.decision === 'REQUEST_REVISION' ? payload.revisionReason.trim() : null,
        updatedAt: nowIso,
        auditLogs: [
          ...existing.auditLogs,
          {
            id: `log-${Date.now()}`,
            reportId: existing.id,
            actorId: `usr-dinas-${resolveMockCityKey()}`,
            actorRole: 'DINAS_UMKM',
            actorName: state.agencyName,
            action: payload.decision === 'APPROVE' ? 'REPORT_VALIDATED' : 'REVISION_REQUESTED',
            fromStatus: existing.status,
            toStatus: nextStatus,
            note:
              payload.decision === 'APPROVE'
                ? 'Laporan disetujui oleh Dinas UMKM.'
                : `Diminta revisi: ${payload.revisionReason.trim()}`,
            metadata: null,
            createdAt: nowIso,
          },
        ],
      };

      state.reports[idx] = updated;
      return hydrateMockReportDetail(state, updated);
    }

    const res = await apiFetch<{ report: ViolationReportDetailDto }>(
      `/api/reports/${encodeURIComponent(id)}/validate`,
      {
        method: 'POST',
        body: payload,
      },
    );
    return res.data.report;
  },

  async assignRelocation(
    id: string,
    payload: AssignRelocationPayload,
  ): Promise<ViolationReportDetailDto> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const idx = state.reports.findIndex((r) => r.id === id);
      if (idx === -1) {
        throw new ApiError(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan.');
      }
      const existing = state.reports[idx];
      if (existing.status !== 'VALIDATED') {
        throw new ApiError(
          409,
          'INVALID_REPORT_STATE',
          'Relokasi hanya dapat ditetapkan pada laporan berstatus VALIDATED.',
        );
      }
      const site = state.sites.find((s) => s.id === payload.relocationSiteId && s.isActive);
      if (!site) {
        throw new ApiError(404, 'RELOCATION_SITE_NOT_FOUND', 'Lokasi binaan tidak ditemukan.');
      }

      const nowIso = new Date().toISOString();
      const updated: ViolationReportDetailDto = {
        ...existing,
        relocationSiteId: site.id,
        relocationSiteName: site.name,
        relocationAssignedAt: nowIso,
        updatedAt: nowIso,
        auditLogs: [
          ...existing.auditLogs,
          {
            id: `log-${Date.now()}`,
            reportId: existing.id,
            actorId: `usr-dinas-${resolveMockCityKey()}`,
            actorRole: 'DINAS_UMKM',
            actorName: state.agencyName,
            action: 'RELOCATION_ASSIGNED',
            fromStatus: existing.status,
            toStatus: existing.status,
            note: `Arahan relokasi ditetapkan ke ${site.name}.`,
            metadata: { relocationSiteId: site.id },
            createdAt: nowIso,
          },
        ],
      };
      state.reports[idx] = updated;
      return hydrateMockReportDetail(state, updated);
    }

    const res = await apiFetch<{ report: ViolationReportDetailDto }>(
      `/api/reports/${encodeURIComponent(id)}/relocation`,
      {
        method: 'POST',
        body: payload,
      },
    );
    return res.data.report;
  },

  async downloadPdf(
    id: string,
    reportCode: string,
    options?: { inline?: boolean },
  ): Promise<{ filename: string }> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const found = state.reports.find((r) => r.id === id);
      if (!found) {
        throw new ApiError(404, 'REPORT_NOT_FOUND', 'Laporan tidak ditemukan.');
      }
      openMockPrintableBeritaAcara(state, hydrateMockReportDetail(state, found));
      return {
        filename: `Berita-Acara-PATRA-${reportCode}.html`,
      };
    }

    const token = getStoredToken();
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const query = options?.inline ? '?inline=1' : '';
    const url = `${getApiBaseUrl()}/api/reports/${encodeURIComponent(id)}/pdf${query}`;

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Gagal mengunduh Berita Acara PDF. Periksa koneksi ke BE-Patra.',
        undefined,
        true,
      );
    }

    if (!response.ok) {
      let message = 'Gagal membuat Berita Acara PDF.';
      let code = `HTTP_${response.status}`;
      try {
        const errJson = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        if (errJson?.error?.message) message = errJson.error.message;
        if (errJson?.error?.code) code = errJson.error.code;
      } catch {
        // Response bukan JSON
      }
      throw new ApiError(response.status, code, message);
    }

    const filename = extractPdfFilename(
      response.headers.get('content-disposition'),
      reportCode,
    );
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (options?.inline) {
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } else {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
    }

    return { filename };
  },
};

export const relocationSiteApi = {
  async list(): Promise<RelocationSiteDto[]> {
    if (!IS_BACKEND_ENABLED) {
      return mockStore[resolveMockCityKey()].sites.filter((s) => s.isActive);
    }
    const res = await apiFetch<{ relocationSites: RelocationSiteDto[] }>(
      '/api/relocation-sites',
    );
    return res.data.relocationSites;
  },

  async create(input: CreateRelocationSiteInput): Promise<RelocationSiteDto> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const nowIso = new Date().toISOString();
      const created: RelocationSiteDto = {
        id: `site-mock-${Date.now()}`,
        regionId: state.regionId,
        name: input.name.trim(),
        address: input.address.trim(),
        lat: input.lat,
        lng: input.lng,
        tradeCategories: input.tradeCategories,
        facilities: input.facilities,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.sites.unshift(created);
      return created;
    }

    const res = await apiFetch<{ relocationSite: RelocationSiteDto }>(
      '/api/relocation-sites',
      {
        method: 'POST',
        body: input,
      },
    );
    return res.data.relocationSite;
  },

  async update(
    id: string,
    input: UpdateRelocationSiteInput,
  ): Promise<RelocationSiteDto> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const idx = state.sites.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new ApiError(404, 'RELOCATION_SITE_NOT_FOUND', 'Lokasi binaan tidak ditemukan.');
      }
      const updated: RelocationSiteDto = {
        ...state.sites[idx],
        ...input,
        updatedAt: new Date().toISOString(),
      };
      state.sites[idx] = updated;
      return updated;
    }

    const res = await apiFetch<{ relocationSite: RelocationSiteDto }>(
      `/api/relocation-sites/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
    return res.data.relocationSite;
  },

  async remove(id: string): Promise<{ deletedId: string; archived: boolean }> {
    if (!IS_BACKEND_ENABLED) {
      const state = mockStore[resolveMockCityKey()];
      const idx = state.sites.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new ApiError(404, 'RELOCATION_SITE_NOT_FOUND', 'Lokasi binaan tidak ditemukan.');
      }
      const isReferenced = state.reports.some((r) => r.relocationSiteId === id);
      if (isReferenced) {
        state.sites[idx] = { ...state.sites[idx], isActive: false };
        return { deletedId: id, archived: true };
      }
      state.sites.splice(idx, 1);
      return { deletedId: id, archived: false };
    }

    const res = await apiFetch<{ deletedId: string; archived: boolean }>(
      `/api/relocation-sites/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return res.data;
  },
};
