import {
  cctvCatalogRawItemSchema,
  type AuditAction,
  type CctvCatalogRawItem,
  type EnforcementActionType,
  type GeoLngLat,
  type ReportSource,
  type ReportStatus,
  type UserRole,
} from '../interface/index.js';

export interface SeedRegionDef {
  code: string;
  city: string;
  province: string;
  island: string;
  satpolAgencyName: string;
  umkmAgencyName: string;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
}

export interface SeedUserDef {
  regionCode: string;
  email: string;
  fullName: string;
  role: UserRole;
  isDemo: boolean;
  demoKey: string;
}

export interface SeedZoneDef {
  regionCode: string;
  name: string;
  description: string;
  points: GeoLngLat[];
}

export interface SeedRelocationSiteDef {
  regionCode: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
}

export interface SeedAuditLogDef {
  actorRole: 'SYSTEM_AI' | 'SATPOL_PP' | 'DINAS_UMKM';
  actorDemoKey?: string;
  actorName: string;
  action: AuditAction;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  note: string;
  metadata?: Record<string, unknown>;
  offsetMinutesFromCreated: number;
}

export interface SeedReportDef {
  reportCode: string;
  regionCode: string;
  cameraId: string;
  zoneName: string;
  source: ReportSource;
  status: ReportStatus;
  address: string;
  lat: number;
  lng: number;
  detectedCount: number;
  maxConfidence: number;
  beforeImageUrl: string;
  isSimulationMode: boolean;
  afterImageUrl?: string;
  actionType?: EnforcementActionType;
  actualPklCount?: number;
  educationNotes?: string;
  relocationRequested: boolean;
  actionByDemoKey?: string;
  actionOffsetMinutes?: number;
  validatedByDemoKey?: string;
  validatedOffsetMinutes?: number;
  revisionReason?: string;
  relocationSiteName?: string;
  relocationOffsetMinutes?: number;
  createdHoursAgo: number;
  auditLogs: SeedAuditLogDef[];
}

// Section 6.1 .agent/rules/data_contract.md
export const SEED_REGIONS: SeedRegionDef[] = [
  {
    code: 'jkt-pusat',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Pusat',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Pusat',
    centerLat: -6.186486,
    centerLng: 106.834091,
    defaultZoom: 13,
  },
  {
    code: 'semarang',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Semarang',
    umkmAgencyName: 'Dinas Koperasi dan Usaha Mikro Kota Semarang',
    centerLat: -6.984049,
    centerLng: 110.409582,
    defaultZoom: 13,
  },
];

// Section 6.2 .agent/rules/data_contract.md
export const SEED_USERS: SeedUserDef[] = [
  {
    regionCode: 'jkt-pusat',
    email: 'satpol.jakpus@patra.demo',
    fullName: 'Petugas Satpol PP Jakarta Pusat',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-jkt-pusat',
  },
  {
    regionCode: 'jkt-pusat',
    email: 'sudin.jakpus@patra.demo',
    fullName: 'Admin Sudin PPKUKM Jakarta Pusat',
    role: 'DINAS_UMKM',
    isDemo: true,
    demoKey: 'dinas-jkt-pusat',
  },
  {
    regionCode: 'semarang',
    email: 'satpol.semarang@patra.demo',
    fullName: 'Petugas Satpol PP Kota Semarang',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-semarang',
  },
  {
    regionCode: 'semarang',
    email: 'dinas.semarang@patra.demo',
    fullName: 'Admin Dinas Koperasi & UKM Semarang',
    role: 'DINAS_UMKM',
    isDemo: true,
    demoKey: 'dinas-semarang',
  },
];

// Section 6.3 .agent/rules/data_contract.md (6 kamera pilot: 3 Jakarta Pusat + 3 Semarang)
export const SEED_CAMERAS: CctvCatalogRawItem[] = [
  {
    id: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    name: 'JKP POLRI UOB PLAZA C01',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    region: 'Kebon Melati, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
    stream_url: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    playback_url: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    stream_type: 'hls',
    lat: -6.20051,
    lng: 106.82291,
    coords_exact: false,
    needs_cors_proxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    source_portal: 'https://jakcctv.jakarta.go.id/publik',
    district: 'Tanah Abang',
    subdistrict: 'Kebon Melati',
    facility_category: 'Pasar & Pusat Belanja',
    roi_polygon: [
      [0.08, 0.55],
      [0.92, 0.55],
      [0.98, 0.96],
      [0.02, 0.96],
    ],
    fallback_video_url: '/videos/demo-jakarta.mp4',
    thumbnail_url: null,
  },
  {
    id: 'jkt_041_JKP_PASAR_TANAH_ABANG_C02',
    name: 'JKP PASAR TANAH ABANG BLOK A',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    region: 'Kampung Bali, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
    stream_url: 'https://dki-jkt.balitower.co.id:7028/504870_JKP_PASAR_TANAH_ABANG_C02/index.m3u8',
    playback_url: 'https://dki-jkt.balitower.co.id:7028/504870_JKP_PASAR_TANAH_ABANG_C02/index.m3u8',
    stream_type: 'hls',
    lat: -6.18862,
    lng: 106.81478,
    coords_exact: false,
    needs_cors_proxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    source_portal: 'https://jakcctv.jakarta.go.id/publik',
    district: 'Tanah Abang',
    subdistrict: 'Kampung Bali',
    facility_category: 'Pasar & Pusat Belanja',
    roi_polygon: [
      [0.05, 0.5],
      [0.95, 0.5],
      [0.98, 0.95],
      [0.02, 0.95],
    ],
    fallback_video_url: '/videos/demo-jakarta.mp4',
    thumbnail_url: null,
  },
  {
    id: 'jkt_052_JKP_STASIUN_GAMBIR_C01',
    name: 'JKP STASIUN GAMBIR SELATAN',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    region: 'Gambir, Gambir, Kota Jakarta Pusat, DKI Jakarta',
    stream_url: 'https://dki-jkt.balitower.co.id:7028/504885_JKP_STASIUN_GAMBIR_C01/index.m3u8',
    playback_url: 'https://dki-jkt.balitower.co.id:7028/504885_JKP_STASIUN_GAMBIR_C01/index.m3u8',
    stream_type: 'hls',
    lat: -6.17665,
    lng: 106.83058,
    coords_exact: false,
    needs_cors_proxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    source_portal: 'https://jakcctv.jakarta.go.id/publik',
    district: 'Gambir',
    subdistrict: 'Gambir',
    facility_category: 'Transportasi Publik',
    roi_polygon: null,
    fallback_video_url: '/videos/demo-jakarta.mp4',
    thumbnail_url: null,
  },
  {
    id: 'smg_001_SIMPANG_LIMA_UTARA',
    name: 'SIMPANG LIMA SISI UTARA',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    region: 'Pleburan, Semarang Selatan, Kota Semarang, Jawa Tengah',
    stream_url: 'https://pantausemar.semarangkota.go.id/live/simpang-lima-utara/index.m3u8',
    playback_url: 'https://pantausemar.semarangkota.go.id/live/simpang-lima-utara/index.m3u8',
    stream_type: 'hls',
    lat: -6.99018,
    lng: 110.42292,
    coords_exact: true,
    needs_cors_proxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    source_portal: 'https://pantausemar.semarangkota.go.id',
    district: 'Semarang Tengah',
    subdistrict: 'Karangkidul',
    facility_category: 'Ruang Publik',
    roi_polygon: [
      [0.1, 0.52],
      [0.9, 0.52],
      [0.96, 0.94],
      [0.04, 0.94],
    ],
    fallback_video_url: '/videos/demo-semarang.mp4',
    thumbnail_url: null,
  },
  {
    id: 'smg_008_PASAR_JOHAR_TIMUR',
    name: 'KORIDOR PASAR JOHAR TIMUR',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    region: 'Kauman, Semarang Tengah, Kota Semarang, Jawa Tengah',
    stream_url: 'https://pantausemar.semarangkota.go.id/live/pasar-johar-timur/index.m3u8',
    playback_url: 'https://pantausemar.semarangkota.go.id/live/pasar-johar-timur/index.m3u8',
    stream_type: 'hls',
    lat: -6.97184,
    lng: 110.42515,
    coords_exact: true,
    needs_cors_proxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    source_portal: 'https://pantausemar.semarangkota.go.id',
    district: 'Semarang Tengah',
    subdistrict: 'Kauman',
    facility_category: 'Pasar & Pusat Belanja',
    roi_polygon: [
      [0.08, 0.48],
      [0.92, 0.48],
      [0.95, 0.95],
      [0.05, 0.95],
    ],
    fallback_video_url: '/videos/demo-semarang.mp4',
    thumbnail_url: null,
  },
  {
    id: 'smg_014_KOTA_LAMA_LETJEN_SUPRAPTO',
    name: 'KOTA LAMA JL. LETJEN SUPRAPTO',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    region: 'Tanjung Mas, Semarang Utara, Kota Semarang, Jawa Tengah',
    stream_url: 'https://pantausemar.semarangkota.go.id/live/kota-lama-suprapto/index.m3u8',
    playback_url: 'https://pantausemar.semarangkota.go.id/live/kota-lama-suprapto/index.m3u8',
    stream_type: 'hls',
    lat: -6.96824,
    lng: 110.42758,
    coords_exact: true,
    needs_cors_proxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    source_portal: 'https://pantausemar.semarangkota.go.id',
    district: 'Semarang Utara',
    subdistrict: 'Tanjung Mas',
    facility_category: 'Kawasan Wisata',
    roi_polygon: null,
    fallback_video_url: '/videos/demo-semarang.mp4',
    thumbnail_url: null,
  },
];

// Section 6.5 — 2 RestrictedZone per kota (4 total)
export const SEED_ZONES: SeedZoneDef[] = [
  {
    regionCode: 'jkt-pusat',
    name: 'Trotoar Koridor Thamrin - UOB Plaza',
    description: 'Zona larangan berjualan pada jalur pedestrian utama Jl. M.H. Thamrin.',
    points: [
      [106.821, -6.198],
      [106.825, -6.198],
      [106.825, -6.203],
      [106.821, -6.203],
    ],
  },
  {
    regionCode: 'jkt-pusat',
    name: 'Bahu Jalan Pasar Tanah Abang Blok A',
    description: 'Area bebas hambatan lalu lintas sekitar Pasar Tanah Abang.',
    points: [
      [106.813, -6.186],
      [106.817, -6.186],
      [106.817, -6.191],
      [106.813, -6.191],
    ],
  },
  {
    regionCode: 'semarang',
    name: 'Pedestrian Kawasan Simpang Lima',
    description: 'Trotoar lingkar luar Lapangan Pancasila Simpang Lima.',
    points: [
      [110.421, -6.988],
      [110.425, -6.988],
      [110.425, -6.992],
      [110.421, -6.992],
    ],
  },
  {
    regionCode: 'semarang',
    name: 'Koridor Pasar Johar - Aloon-Aloon',
    description: 'Zona penataan trotoar & akses masuk Pasar Johar Semarang.',
    points: [
      [110.423, -6.970],
      [110.427, -6.970],
      [110.427, -6.974],
      [110.423, -6.974],
    ],
  },
];

// Section 6.4 — 3 RelocationSite per kota (6 total, TANPA KUOTA)
export const SEED_RELOCATION_SITES: SeedRelocationSiteDef[] = [
  {
    regionCode: 'jkt-pusat',
    name: 'Lokasi Binaan JP 37 Thamrin City',
    address: 'Jl. Thamrin Boulevard, Kebon Melati, Tanah Abang, Jakarta Pusat',
    lat: -6.1944,
    lng: 106.8195,
    tradeCategories: ['Kuliner', 'Minuman', 'Pakaian'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'jkt-pusat',
    name: 'Sentra Binaan Kebon Kacang Raya',
    address: 'Jl. Kebon Kacang Raya, Tanah Abang, Jakarta Pusat',
    lat: -6.1912,
    lng: 106.8178,
    tradeCategories: ['Kuliner', 'Jajanan'],
    facilities: ['Listrik', 'Parkir', 'Kebersihan'],
  },
  {
    regionCode: 'jkt-pusat',
    name: 'Lokasi Binaan JP 28 Pasar Baru',
    address: 'Jl. Pasar Baru, Sawah Besar, Jakarta Pusat',
    lat: -6.1652,
    lng: 106.8342,
    tradeCategories: ['Kuliner', 'Kerajinan', 'Aksesori'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet'],
  },
  {
    regionCode: 'semarang',
    name: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    address: 'Jl. Ahmad Yani / Sisi Selatan Simpang Lima, Semarang',
    lat: -6.9905,
    lng: 110.4234,
    tradeCategories: ['Kuliner', 'Minuman'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
  },
  {
    regionCode: 'semarang',
    name: 'Selter PKL Kawasan Johar Baru',
    address: 'Jl. K.H. Agus Salim, Kauman, Semarang Tengah',
    lat: -6.9721,
    lng: 110.4258,
    tradeCategories: ['Kuliner', 'Sembako', 'Kerajinan'],
    facilities: ['Listrik', 'Area Teduh', 'Kebersihan'],
  },
  {
    regionCode: 'semarang',
    name: 'Selter PKL Taman Menteri Supeno',
    address: 'Jl. Menteri Supeno, Mugassari, Semarang Selatan',
    lat: -6.9936,
    lng: 110.4198,
    tradeCategories: ['Kuliner', 'Jajanan'],
    facilities: ['Listrik', 'Toilet', 'Lampu Penerangan'],
  },
];

// Placeholder bukti visual publik aman (diganti otomatis saat upload foto aktual di demo)
const DEMO_BEFORE_IMG = 'https://placehold.co/800x450/0B132B/FFFFFF?text=CCTV+Before+Snapshot';
const DEMO_AFTER_IMG = 'https://placehold.co/800x450/043FA5/FFFFFF?text=Satpol+PP+After+Evidence';

// Section 6.5 — 4 ViolationReport per kota (8 total: NEED_ACTION, PENDING_VALIDATION, NEEDS_REVISION, VALIDATED)
export const SEED_REPORTS: SeedReportDef[] = [
  // === KOTA JAKARTA PUSAT ===
  {
    reportCode: 'PTR-202611-JKP01',
    regionCode: 'jkt-pusat',
    cameraId: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    zoneName: 'Trotoar Koridor Thamrin - UOB Plaza',
    source: 'AUTO_AI',
    status: 'NEED_ACTION',
    address: 'Jl. M.H. Thamrin (UOB Plaza), Kebon Melati, Tanah Abang',
    lat: -6.20051,
    lng: 106.82291,
    detectedCount: 2,
    maxConfidence: 0.89,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    relocationRequested: false,
    createdHoursAgo: 1,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 gerobak PKL menetap di dalam ROI trotoar melewati ambang batas.',
        metadata: { detectedCount: 2, maxConfidence: 0.89 },
        offsetMinutesFromCreated: 0,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-JKP02',
    regionCode: 'jkt-pusat',
    cameraId: 'jkt_041_JKP_PASAR_TANAH_ABANG_C02',
    zoneName: 'Bahu Jalan Pasar Tanah Abang Blok A',
    source: 'AUTO_AI',
    status: 'PENDING_VALIDATION',
    address: 'Jl. K.H. Mas Mansyur (Pasar Tanah Abang Blok A), Tanah Abang',
    lat: -6.18862,
    lng: 106.81478,
    detectedCount: 3,
    maxConfidence: 0.91,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 3,
    educationNotes: 'Pedagang telah diberikan edukasi persuasif dan bersedia diarahkan ke Lokasi Binaan terdekat.',
    relocationRequested: true,
    actionByDemoKey: 'satpol-jkt-pusat',
    actionOffsetMinutes: 35,
    createdHoursAgo: 6,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Deteksi awal 3 PKL di bahu jalan Pasar Tanah Abang Blok A.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkt-pusat',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Penertiban persuasif selesai; pengajuan relokasi diteruskan ke Sudin PPKUKM.',
        metadata: { actualPklCount: 3, relocationRequested: true },
        offsetMinutesFromCreated: 35,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-JKP03',
    regionCode: 'jkt-pusat',
    cameraId: 'jkt_052_JKP_STASIUN_GAMBIR_C01',
    zoneName: 'Trotoar Koridor Thamrin - UOB Plaza',
    source: 'MANUAL',
    status: 'NEEDS_REVISION',
    address: 'Jl. Medan Merdeka Timur (Stasiun Gambir Selatan), Gambir',
    lat: -6.17665,
    lng: 106.83058,
    detectedCount: 1,
    maxConfidence: 0.84,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: true,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'EDUCATION_WARNING',
    actualPklCount: 1,
    educationNotes: 'Dilakukan himbauan lisan kepada pedagang minuman keliling.',
    relocationRequested: false,
    actionByDemoKey: 'satpol-jkt-pusat',
    actionOffsetMinutes: 48,
    validatedByDemoKey: 'dinas-jkt-pusat',
    revisionReason: 'Foto bukti After belum memperlihatkan sudut trotoar yang sama dengan foto Before; mohon unggah ulang bukti yang lebih jelas.',
    createdHoursAgo: 18,
    auditLogs: [
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkt-pusat',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Tangkapan bukti manual oleh petugas pemantau CCTV.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkt-pusat',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Bukti penindakan edukasi & himbauan telah diunggah.',
        offsetMinutesFromCreated: 48,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-jkt-pusat',
        actorName: 'Admin Sudin PPKUKM Jakarta Pusat',
        action: 'REVISION_REQUESTED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'NEEDS_REVISION',
        note: 'Foto bukti After belum memperlihatkan sudut trotoar yang sama dengan foto Before; mohon unggah ulang bukti yang lebih jelas.',
        offsetMinutesFromCreated: 95,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-JKP04',
    regionCode: 'jkt-pusat',
    cameraId: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    zoneName: 'Trotoar Koridor Thamrin - UOB Plaza',
    source: 'AUTO_AI',
    status: 'VALIDATED',
    address: 'Jl. M.H. Thamrin (UOB Plaza), Kebon Melati, Tanah Abang',
    lat: -6.20051,
    lng: 106.82291,
    detectedCount: 2,
    maxConfidence: 0.93,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 2,
    educationNotes: 'Dua pedagang kuliner telah didampingi menuju Lokasi Binaan JP 37 Thamrin City.',
    relocationRequested: true,
    actionByDemoKey: 'satpol-jkt-pusat',
    actionOffsetMinutes: 28,
    validatedByDemoKey: 'dinas-jkt-pusat',
    validatedOffsetMinutes: 72,
    relocationSiteName: 'Lokasi Binaan JP 37 Thamrin City',
    relocationOffsetMinutes: 75,
    createdHoursAgo: 48,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 PKL menetap di ROI trotoar Jl. M.H. Thamrin.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkt-pusat',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Penertiban persuasif selesai dalam 28 menit; diajukan relokasi ke lokasi binaan.',
        offsetMinutesFromCreated: 28,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-jkt-pusat',
        actorName: 'Admin Sudin PPKUKM Jakarta Pusat',
        action: 'REPORT_VALIDATED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'VALIDATED',
        note: 'Bukti Before-After sesuai prosedur dan tervalidasi.',
        offsetMinutesFromCreated: 72,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-jkt-pusat',
        actorName: 'Admin Sudin PPKUKM Jakarta Pusat',
        action: 'RELOCATION_ASSIGNED',
        fromStatus: 'VALIDATED',
        toStatus: 'VALIDATED',
        note: 'Arahan relokasi ditetapkan ke Lokasi Binaan JP 37 Thamrin City.',
        metadata: { relocationSiteName: 'Lokasi Binaan JP 37 Thamrin City' },
        offsetMinutesFromCreated: 75,
      },
    ],
  },

  // === KOTA SEMARANG ===
  {
    reportCode: 'PTR-202611-SMG01',
    regionCode: 'semarang',
    cameraId: 'smg_001_SIMPANG_LIMA_UTARA',
    zoneName: 'Pedestrian Kawasan Simpang Lima',
    source: 'AUTO_AI',
    status: 'NEED_ACTION',
    address: 'Jl. Pandanaran / Simpang Lima Sisi Utara, Semarang Tengah',
    lat: -6.99018,
    lng: 110.42292,
    detectedCount: 2,
    maxConfidence: 0.86,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    relocationRequested: false,
    createdHoursAgo: 2,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 gerobak PKL menetap di jalur pedestrian Simpang Lima Utara.',
        offsetMinutesFromCreated: 0,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-SMG02',
    regionCode: 'semarang',
    cameraId: 'smg_008_PASAR_JOHAR_TIMUR',
    zoneName: 'Koridor Pasar Johar - Aloon-Aloon',
    source: 'AUTO_AI',
    status: 'PENDING_VALIDATION',
    address: 'Koridor Pasar Johar Timur, Kauman, Semarang Tengah',
    lat: -6.97184,
    lng: 110.42515,
    detectedCount: 4,
    maxConfidence: 0.90,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 4,
    educationNotes: 'Keempat pedagang diedukasi dan bersedia pindah ke Selter PKL Kawasan Johar Baru.',
    relocationRequested: true,
    actionByDemoKey: 'satpol-semarang',
    actionOffsetMinutes: 40,
    createdHoursAgo: 8,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 4 PKL menempati trotoar akses masuk Pasar Johar Timur.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-semarang',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Area telah ditertibkan secara humanis; diajukan arahan relokasi ke Dinas Koperasi & UKM.',
        offsetMinutesFromCreated: 40,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-SMG03',
    regionCode: 'semarang',
    cameraId: 'smg_014_KOTA_LAMA_LETJEN_SUPRAPTO',
    zoneName: 'Koridor Pasar Johar - Aloon-Aloon',
    source: 'MANUAL',
    status: 'NEEDS_REVISION',
    address: 'Jl. Letjen Suprapto (Kawasan Kota Lama), Semarang Utara',
    lat: -6.96824,
    lng: 110.42758,
    detectedCount: 1,
    maxConfidence: 0.82,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: true,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'ADMINISTRATIVE_ACTION',
    actualPklCount: 1,
    educationNotes: 'Diberikan teguran tertulis dan sosialisasi kawasan cagar budaya.',
    relocationRequested: false,
    actionByDemoKey: 'satpol-semarang',
    actionOffsetMinutes: 55,
    validatedByDemoKey: 'dinas-semarang',
    revisionReason: 'Catatan edukasi belum mencantumkan komitmen pemindahan gerobak; mohon lengkapi foto kondisi trotoar bersih.',
    createdHoursAgo: 20,
    auditLogs: [
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-semarang',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Laporan manual petugas pada koridor wisata Kota Lama.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-semarang',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Penertiban administratif selesai dilaksanakan.',
        offsetMinutesFromCreated: 55,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-semarang',
        actorName: 'Admin Dinas Koperasi & UKM Semarang',
        action: 'REVISION_REQUESTED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'NEEDS_REVISION',
        note: 'Catatan edukasi belum mencantumkan komitmen pemindahan gerobak; mohon lengkapi foto kondisi trotoar bersih.',
        offsetMinutesFromCreated: 110,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-SMG04',
    regionCode: 'semarang',
    cameraId: 'smg_001_SIMPANG_LIMA_UTARA',
    zoneName: 'Pedestrian Kawasan Simpang Lima',
    source: 'AUTO_AI',
    status: 'VALIDATED',
    address: 'Jl. Pandanaran / Simpang Lima Sisi Utara, Semarang Tengah',
    lat: -6.99018,
    lng: 110.42292,
    detectedCount: 3,
    maxConfidence: 0.94,
    beforeImageUrl: DEMO_BEFORE_IMG,
    isSimulationMode: false,
    afterImageUrl: DEMO_AFTER_IMG,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 3,
    educationNotes: 'Tiga pedagang kuliner diarahkan dan difasilitasi ke Sentra Kuliner PKL Simpang Lima.',
    relocationRequested: true,
    actionByDemoKey: 'satpol-semarang',
    actionOffsetMinutes: 30,
    validatedByDemoKey: 'dinas-semarang',
    validatedOffsetMinutes: 65,
    relocationSiteName: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    relocationOffsetMinutes: 68,
    createdHoursAgo: 36,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 3 gerobak PKL di area pedestrian Simpang Lima.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-semarang',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Pendampingan relokasi selesai dalam 30 menit.',
        offsetMinutesFromCreated: 30,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-semarang',
        actorName: 'Admin Dinas Koperasi & UKM Semarang',
        action: 'REPORT_VALIDATED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'VALIDATED',
        note: 'Bukti foto Before-After lengkap dan disetujui.',
        offsetMinutesFromCreated: 65,
      },
      {
        actorRole: 'DINAS_UMKM',
        actorDemoKey: 'dinas-semarang',
        actorName: 'Admin Dinas Koperasi & UKM Semarang',
        action: 'RELOCATION_ASSIGNED',
        fromStatus: 'VALIDATED',
        toStatus: 'VALIDATED',
        note: 'Arahan relokasi ditetapkan ke Sentra Kuliner PKL Simpang Lima (Pujasera).',
        metadata: { relocationSiteName: 'Sentra Kuliner PKL Simpang Lima (Pujasera)' },
        offsetMinutesFromCreated: 68,
      },
    ],
  },
];

/**
 * Mem-parse array JSON mentah hasil `AI-Patra/cctv_catalog/cctv_snapshot.json`.
 * Baris tidak valid dilewati dengan aman dan dilaporkan agar proses sync tidak crash total.
 */
export function parseCctvSnapshotItems(rawList: unknown): {
  valid: CctvCatalogRawItem[];
  skippedCount: number;
} {
  if (!Array.isArray(rawList)) {
    return { valid: [], skippedCount: 0 };
  }
  const valid: CctvCatalogRawItem[] = [];
  let skippedCount = 0;

  for (const item of rawList) {
    const parsed = cctvCatalogRawItemSchema.safeParse(item);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      skippedCount++;
    }
  }
  return { valid, skippedCount };
}
