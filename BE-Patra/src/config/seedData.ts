import {
  cctvCatalogRawItemSchema,
  type AuditAction,
  type CctvCatalogRawItem,
  type EnforcementActionType,
  type GeoLngLat,
  type RelocationMatchStatus,
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

export interface SeedPatrolTeamDef {
  regionCode: string;
  code: string;
  name: string;
  assignedDistricts: string[];
}

export interface SeedUserDef {
  regionCode: string;
  teamCode: string | null;
  email: string;
  fullName: string;
  role: UserRole;
  isDemo: boolean;
  demoKey: string;
}

export interface SeedZoneDef {
  regionCode: string;
  district: string | null;
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
  maxCapacity: number;
  occupiedCapacity: number;
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
  assignedTeamCode?: string;
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
  recommendedSiteName?: string;
  relocationSiteName?: string;
  relocationMatchStatus?: RelocationMatchStatus;
  relocationCapacityCommitted?: boolean;
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

// Section 6.2 .agent/rules/data_contract.md — PatrolTeam & User Multi-Tim Kecamatan
export const SEED_PATROL_TEAMS: SeedPatrolTeamDef[] = [
  {
    regionCode: 'jkt-pusat',
    code: 'jkp-tanah-abang',
    name: 'Tim Alpha — Kec. Tanah Abang',
    assignedDistricts: ['Tanah Abang'],
  },
  {
    regionCode: 'jkt-pusat',
    code: 'jkp-menteng-gambir',
    name: 'Tim Bravo — Kec. Menteng & Gambir',
    assignedDistricts: ['Menteng', 'Gambir'],
  },
  {
    regionCode: 'semarang',
    code: 'smg-tengah',
    name: 'Tim Tengah — Kec. Semarang Tengah',
    assignedDistricts: ['Semarang Tengah'],
  },
  {
    regionCode: 'semarang',
    code: 'smg-selatan-barat',
    name: 'Tim Selatan & Barat — Koridor Kota',
    assignedDistricts: [
      'Semarang Selatan',
      'Semarang Barat',
      'Candisari',
      'Gajah Mungkur',
      'Banyumanik',
      'Semarang Utara',
      'Semarang Timur',
      'Pedurungan',
      'Ngaliyan',
      'Tugu',
    ],
  },
];

export const SEED_USERS: SeedUserDef[] = [
  {
    regionCode: 'jkt-pusat',
    teamCode: 'jkp-tanah-abang',
    email: 'satpol.tanahabang@patra.demo',
    fullName: 'Regu Patroli Alpha (Tanah Abang)',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-jkp-tanah-abang',
  },
  {
    regionCode: 'jkt-pusat',
    teamCode: 'jkp-menteng-gambir',
    email: 'satpol.mentenggambir@patra.demo',
    fullName: 'Regu Patroli Bravo (Menteng & Gambir)',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-jkp-menteng-gambir',
  },
  {
    regionCode: 'jkt-pusat',
    teamCode: null,
    email: 'sudin.jakpus@patra.demo',
    fullName: 'Admin Sudin PPKUKM Jakarta Pusat',
    role: 'DINAS_UMKM',
    isDemo: true,
    demoKey: 'dinas-jkt-pusat',
  },
  {
    regionCode: 'semarang',
    teamCode: 'smg-tengah',
    email: 'satpol.smgtengah@patra.demo',
    fullName: 'Regu Patroli Tengah (Semarang Tengah)',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-smg-tengah',
  },
  {
    regionCode: 'semarang',
    teamCode: 'smg-selatan-barat',
    email: 'satpol.smgselbar@patra.demo',
    fullName: 'Regu Patroli Selatan & Barat Semarang',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-smg-selatan-barat',
  },
  {
    regionCode: 'semarang',
    teamCode: null,
    email: 'dinas.semarang@patra.demo',
    fullName: 'Admin Dinas Koperasi & UKM Semarang',
    role: 'DINAS_UMKM',
    isDemo: true,
    demoKey: 'dinas-semarang',
  },
];

// Normalisasi 8 kamera Kota Semarang pada cctv_snapshot.json yang bernilai district=null
export const SEMARANG_NULL_DISTRICT_OVERRIDES: Record<string, string> = {
  smg_8857_ARAH_PANDANARAN: 'Semarang Selatan',
  smg_7645_ARAH_TUGU_TUNAS: 'Semarang Selatan',
  smg_8872_Bundaran_Madukoro: 'Semarang Barat',
  smg_8713_PAHLAWAN_180: 'Semarang Selatan',
  smg_7642_PAHLAWAN_PTZ_2: 'Semarang Selatan',
  smg_8871_SIMPANG_WAGISAN_TAMAN_KASMAR: 'Semarang Selatan',
  smg_8868_SRIWIJAYA_01: 'Semarang Selatan',
  smg_8869_SRIWIJAYA_02: 'Semarang Selatan',
};

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

// Section 6.5 — 2 RestrictedZone per kota (4 total, dengan district untuk hard-lock kecamatan)
export const SEED_ZONES: SeedZoneDef[] = [
  {
    regionCode: 'jkt-pusat',
    district: 'Tanah Abang',
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
    district: 'Tanah Abang',
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
    district: 'Semarang Tengah',
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
    district: 'Semarang Tengah',
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

// Section 6.4 — 3 RelocationSite per kota pilot (dengan kapasitas demo termasuk 1 FULL per kota)
export const SEED_RELOCATION_SITES: SeedRelocationSiteDef[] = [
  {
    regionCode: 'jkt-pusat',
    name: 'Lokasi Binaan JP 37 Thamrin City',
    address: 'Jl. Thamrin Boulevard, Kebon Melati, Tanah Abang, Jakarta Pusat',
    lat: -6.1944,
    lng: 106.8195,
    tradeCategories: ['Kuliner', 'Minuman', 'Pakaian'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    maxCapacity: 25,
    occupiedCapacity: 25,
  },
  {
    regionCode: 'jkt-pusat',
    name: 'Sentra Binaan Kebon Kacang Raya',
    address: 'Jl. Kebon Kacang Raya, Tanah Abang, Jakarta Pusat',
    lat: -6.1912,
    lng: 106.8178,
    tradeCategories: ['Kuliner', 'Jajanan'],
    facilities: ['Listrik', 'Parkir', 'Kebersihan'],
    maxCapacity: 30,
    occupiedCapacity: 22,
  },
  {
    regionCode: 'jkt-pusat',
    name: 'Lokasi Binaan JP 28 Pasar Baru',
    address: 'Jl. Pasar Baru, Sawah Besar, Jakarta Pusat',
    lat: -6.1652,
    lng: 106.8342,
    tradeCategories: ['Kuliner', 'Kerajinan', 'Aksesori'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet'],
    maxCapacity: 40,
    occupiedCapacity: 15,
  },
  {
    regionCode: 'semarang',
    name: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    address: 'Jl. Ahmad Yani / Sisi Selatan Simpang Lima, Semarang',
    lat: -6.9905,
    lng: 110.4234,
    tradeCategories: ['Kuliner', 'Minuman'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
    maxCapacity: 30,
    occupiedCapacity: 30,
  },
  {
    regionCode: 'semarang',
    name: 'Selter PKL Kawasan Johar Baru',
    address: 'Jl. K.H. Agus Salim, Kauman, Semarang Tengah',
    lat: -6.9721,
    lng: 110.4258,
    tradeCategories: ['Kuliner', 'Sembako', 'Kerajinan'],
    facilities: ['Listrik', 'Area Teduh', 'Kebersihan'],
    maxCapacity: 35,
    occupiedCapacity: 28,
  },
  {
    regionCode: 'semarang',
    name: 'Selter PKL Taman Menteri Supeno',
    address: 'Jl. Menteri Supeno, Mugassari, Semarang Selatan',
    lat: -6.9936,
    lng: 110.4198,
    tradeCategories: ['Kuliner', 'Jajanan'],
    facilities: ['Listrik', 'Toilet', 'Lampu Penerangan'],
    maxCapacity: 25,
    occupiedCapacity: 10,
  },
];

// 30 Lokasi Binaan (Zona Hijau UMKM) untuk 15 kota publik tambahan (2 per kota, dengan kapasitas default)
const EXTRA_PUBLIC_RELOCATION_SITES_RAW: Array<
  Omit<SeedRelocationSiteDef, 'maxCapacity' | 'occupiedCapacity'>
> = [
  // Kota Yogyakarta
  {
    regionCode: 'yogyakarta',
    name: 'Teras Malioboro 1 (Zona Binaan PKL)',
    address: 'Jl. Margo Mulyo No. 16, Ngupasan, Gondomanan, Kota Yogyakarta',
    lat: -7.79935,
    lng: 110.36545,
    tradeCategories: ['Kuliner', 'Batik & Fashion', 'Cinderamata'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'yogyakarta',
    name: 'Teras Malioboro 2 & Sentra Kuliner Beskalan',
    address: 'Jl. Malioboro No. 56, Suryatmajan, Danurejan, Kota Yogyakarta',
    lat: -7.7931,
    lng: 110.3658,
    tradeCategories: ['Kuliner', 'Kerajinan', 'Minuman'],
    facilities: ['Listrik', 'Lampu Penerangan', 'Toilet', 'Kebersihan'],
  },
  // Kota Pekanbaru
  {
    regionCode: 'pekanbaru',
    name: 'Sentra Kuliner Binaan Cut Nyak Dien',
    address: 'Jl. Cut Nyak Dien, Jadirejo, Sukajadi, Kota Pekanbaru',
    lat: 0.5142,
    lng: 101.4461,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
    facilities: ['Listrik', 'Parkir', 'Lampu Penerangan', 'Kebersihan'],
  },
  {
    regionCode: 'pekanbaru',
    name: 'Zona Binaan UMKM RTH Kaca Mayang',
    address: 'Jl. Jenderal Sudirman, Kota Tinggi, Pekanbaru Kota',
    lat: 0.5186,
    lng: 101.4488,
    tradeCategories: ['Kuliner', 'Kopi & Minuman', 'Aksesori'],
    facilities: ['Area Teduh', 'Toilet', 'Air Bersih', 'Tempat Sampah'],
  },
  // Kota Pekalongan
  {
    regionCode: 'pekalongan',
    name: 'Selter PKL Binaan Alun-Alun Pekalongan',
    address: 'Jl. Wahid Hasyim, Kauman, Pekalongan Timur, Kota Pekalongan',
    lat: -6.8898,
    lng: 109.6746,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan Tradisional'],
    facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Toilet'],
  },
  {
    regionCode: 'pekalongan',
    name: 'Sentra Kuliner & Batik Binaan Jetayu',
    address: 'Jl. Jetayu No. 4, Panjang Wetan, Pekalongan Utara, Kota Pekalongan',
    lat: -6.8815,
    lng: 109.6752,
    tradeCategories: ['Batik & Kerajinan', 'Kuliner', 'Minuman'],
    facilities: ['Area Teduh', 'Parkir', 'Listrik', 'Kebersihan'],
  },
  // Kabupaten Cianjur
  {
    regionCode: 'cianjur',
    name: 'Sentra Binaan UMKM Taman Prawatasari',
    address: 'Jl. Surya Kencana No. 1, Sawah Gede, Kabupaten Cianjur',
    lat: -6.8261,
    lng: 107.1368,
    tradeCategories: ['Kuliner', 'Jajanan', 'Oleh-Oleh'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Parkir'],
  },
  {
    regionCode: 'cianjur',
    name: 'Zona Hijau PKL Alun-Alun Cianjur',
    address: 'Jl. Siti Jenab, Pamoyanan, Kabupaten Cianjur',
    lat: -6.8224,
    lng: 107.1394,
    tradeCategories: ['Kuliner', 'Minuman', 'Aksesori'],
    facilities: ['Area Teduh', 'Lampu Penerangan', 'Kebersihan'],
  },
  // Kota Magelang
  {
    regionCode: 'magelang',
    name: 'Sentra Kuliner Binaan Tuin Van Java',
    address: 'Jl. Alun-Alun Timur, Kemirirejo, Magelang Tengah, Kota Magelang',
    lat: -7.4765,
    lng: 110.2179,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Duduk'],
  },
  {
    regionCode: 'magelang',
    name: 'Selter PKL Binaan Taman Badaan',
    address: 'Jl. Pahlawan No. 24, Potrobangsan, Magelang Utara, Kota Magelang',
    lat: -7.4662,
    lng: 110.2185,
    tradeCategories: ['Kuliner', 'Jajanan', 'Mainan & Aksesori'],
    facilities: ['Listrik', 'Area Teduh', 'Parkir', 'Kebersihan'],
  },
  // Kota Banda Aceh
  {
    regionCode: 'banda-aceh',
    name: 'Sentra Kuliner Binaan Rex Peunayong',
    address: 'Jl. Khairil Anwar, Peunayong, Kuta Alam, Kota Banda Aceh',
    lat: 5.5579,
    lng: 95.3204,
    tradeCategories: ['Kuliner Malam', 'Kopi Aceh', 'Minuman'],
    facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Toilet'],
  },
  {
    regionCode: 'banda-aceh',
    name: 'Zona Binaan UMKM Taman Bustanussalatin',
    address: 'Jl. Sultan Alaiddin Mahmudsyah, Baiturrahman, Kota Banda Aceh',
    lat: 5.5515,
    lng: 95.3156,
    tradeCategories: ['Kuliner', 'Cinderamata', 'Minuman'],
    facilities: ['Area Teduh', 'Toilet', 'Parkir', 'Kebersihan'],
  },
  // Kota Bandung
  {
    regionCode: 'bandung',
    name: 'Teras Cihampelas (Zona Binaan PKL)',
    address: 'Jl. Cihampelas, Cipaganti, Coblong, Kota Bandung',
    lat: -6.8938,
    lng: 107.6052,
    tradeCategories: ['Pakaian', 'Kuliner', 'Cinderamata'],
    facilities: ['Listrik', 'Toilet', 'Area Teduh', 'Jalur Pejalan Kaki'],
  },
  {
    regionCode: 'bandung',
    name: 'Selter Binaan Alun-Alun & Dalem Kaum',
    address: 'Jl. Dalem Kaum, Balonggede, Regol, Kota Bandung',
    lat: -6.92185,
    lng: 107.6071,
    tradeCategories: ['Kuliner', 'Aksesori', 'Jajanan'],
    facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Kebersihan'],
  },
  // Kota Palembang
  {
    regionCode: 'palembang',
    name: 'Sentra Kuliner Binaan Kambang Iwak',
    address: 'Jl. Tasik, Talang Semut, Bukit Kecil, Kota Palembang',
    lat: -2.9896,
    lng: 104.7458,
    tradeCategories: ['Kuliner', 'Pempek & Jajanan', 'Minuman'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
  },
  {
    regionCode: 'palembang',
    name: 'Zona Hijau UMKM Pelataran Benteng Kuto Besak',
    address: 'Jl. Sultan Mahmud Badaruddin II, Ilir Barat I, Kota Palembang',
    lat: -2.9909,
    lng: 104.7604,
    tradeCategories: ['Kuliner', 'Kerajinan Songket', 'Minuman'],
    facilities: ['Lampu Penerangan', 'Toilet', 'Area Duduk', 'Kebersihan'],
  },
  // Kota Mataram
  {
    regionCode: 'mataram',
    name: 'Sentra Binaan PKL Taman Sangkareang',
    address: 'Jl. Pejanggik, Mataram Barat, Selaparang, Kota Mataram',
    lat: -8.5831,
    lng: 116.1072,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'mataram',
    name: 'Zona Kuliner Binaan Udayana Mataram',
    address: 'Jl. Udayana, Monjok Barat, Selaparang, Kota Mataram',
    lat: -8.5764,
    lng: 116.1008,
    tradeCategories: ['Kuliner Malam', 'Kopi & Minuman', 'Aksesori'],
    facilities: ['Listrik', 'Lampu Penerangan', 'Parkir', 'Kebersihan'],
  },
  // Kota Jakarta Selatan
  {
    regionCode: 'jkt-selatan',
    name: 'Lokasi Binaan JS 29 Barito & Taman Ayodia',
    address: 'Jl. Lamandau III, Kramat Pela, Kebayoran Baru, Jakarta Selatan',
    lat: -6.2452,
    lng: 106.7944,
    tradeCategories: ['Kuliner', 'Minuman', 'Tanaman & Aksesori'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'jkt-selatan',
    name: 'Sentra Binaan JS 14 Tebet Eco Park',
    address: 'Jl. Tebet Timur Raya, Tebet, Jakarta Selatan',
    lat: -6.2378,
    lng: 106.8531,
    tradeCategories: ['Kuliner', 'Jajanan', 'Kopi & Minuman'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
  },
  // Kota Tasikmalaya
  {
    regionCode: 'tasikmalaya',
    name: 'Sentra Kuliner Binaan Dadaha',
    address: 'Jl. Lingkar Dadaha, Nagarawangi, Cihideung, Kota Tasikmalaya',
    lat: -7.3346,
    lng: 108.2158,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
    facilities: ['Listrik', 'Parkir', 'Toilet', 'Lampu Penerangan'],
  },
  {
    regionCode: 'tasikmalaya',
    name: 'Selter PKL Binaan Taman Kota Tasikmalaya',
    address: 'Jl. KH. Z. Mustofa, Yudanagara, Cihideung, Kota Tasikmalaya',
    lat: -7.3274,
    lng: 108.2209,
    tradeCategories: ['Kuliner', 'Kerajinan Bordir', 'Aksesori'],
    facilities: ['Listrik', 'Air Bersih', 'Area Teduh', 'Kebersihan'],
  },
  // Kota Bengkulu
  {
    regionCode: 'bengkulu',
    name: 'Zona Hijau UMKM Pantai Panjang (Sport Center)',
    address: 'Jl. Pariwisata Pantai Panjang, Lempuing, Ratu Agung, Kota Bengkulu',
    lat: -3.8104,
    lng: 102.2632,
    tradeCategories: ['Kuliner', 'Minuman Kelapa', 'Cinderamata'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
  },
  {
    regionCode: 'bengkulu',
    name: 'Sentra Kuliner Binaan Simpang Lima Ratu Samban',
    address: 'Jl. S. Parman, Padang Jati, Ratu Samban, Kota Bengkulu',
    lat: -3.7968,
    lng: 102.2656,
    tradeCategories: ['Kuliner', 'Jajanan', 'Minuman'],
    facilities: ['Listrik', 'Lampu Penerangan', 'Kebersihan'],
  },
  // Kota Padang
  {
    regionCode: 'padang',
    name: 'Selter PKL Binaan Pantai Padang (Cimpago)',
    address: 'Jl. Samudera, Purus, Padang Barat, Kota Padang',
    lat: -0.9301,
    lng: 100.3512,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan Pantai'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'padang',
    name: 'Sentra Kuliner Binaan RTH Imam Bonjol',
    address: 'Jl. Imam Bonjol, Belakang Pondok, Padang Selatan, Kota Padang',
    lat: -0.9554,
    lng: 100.3608,
    tradeCategories: ['Kuliner', 'Minuman', 'Pakaian'],
    facilities: ['Listrik', 'Parkir', 'Lampu Penerangan', 'Kebersihan'],
  },
  // Kota Jakarta Barat
  {
    regionCode: 'jkt-barat',
    name: 'Lokasi Binaan JB 19 Kota Intan (Kota Tua)',
    address: 'Jl. Cengkeh No. 16, Pinangsia, Taman Sari, Jakarta Barat',
    lat: -6.1331,
    lng: 106.8124,
    tradeCategories: ['Kuliner', 'Cinderamata', 'Pakaian'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
  },
  {
    regionCode: 'jkt-barat',
    name: 'Sentra Binaan JB 34 Tanjung Duren',
    address: 'Jl. Tanjung Duren Raya, Grogol Petamburan, Jakarta Barat',
    lat: -6.1765,
    lng: 106.7848,
    tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
    facilities: ['Listrik', 'Area Teduh', 'Toilet', 'Kebersihan'],
  },
  // Kota Jakarta Timur
  {
    regionCode: 'jkt-timur',
    name: 'Lokasi Binaan JT 24 Rawamangun',
    address: 'Jl. Balai Pustaka Timur, Rawamangun, Pulo Gadung, Jakarta Timur',
    lat: -6.1972,
    lng: 106.8856,
    tradeCategories: ['Kuliner', 'Minuman', 'Aksesori'],
    facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
  },
  {
    regionCode: 'jkt-timur',
    name: 'Sentra Binaan JT 18 Kanal Banjir Timur',
    address: 'Jl. Kolonel Sugiono, Duren Sawit, Jakarta Timur',
    lat: -6.2314,
    lng: 106.9125,
    tradeCategories: ['Kuliner', 'Jajanan', 'Pakaian'],
    facilities: ['Listrik', 'Lampu Penerangan', 'Parkir', 'Kebersihan'],
  },
];

export const EXTRA_PUBLIC_RELOCATION_SITES: SeedRelocationSiteDef[] =
  EXTRA_PUBLIC_RELOCATION_SITES_RAW.map((site) => ({
    ...site,
    maxCapacity: 30,
    occupiedCapacity: 10,
  }));

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
    assignedTeamCode: 'jkp-tanah-abang',
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
    recommendedSiteName: 'Sentra Binaan Kebon Kacang Raya',
    relocationMatchStatus: 'FALLBACK_AVAILABLE',
    createdHoursAgo: 1,
    auditLogs: [
      {
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 gerobak PKL menetap di dalam ROI trotoar melewati ambang batas.',
        metadata: {
          detectedCount: 2,
          maxConfidence: 0.89,
          recommendedSiteName: 'Sentra Binaan Kebon Kacang Raya',
        },
        offsetMinutesFromCreated: 0,
      },
    ],
  },
  {
    reportCode: 'PTR-202611-JKP02',
    regionCode: 'jkt-pusat',
    cameraId: 'jkt_041_JKP_PASAR_TANAH_ABANG_C02',
    zoneName: 'Bahu Jalan Pasar Tanah Abang Blok A',
    assignedTeamCode: 'jkp-tanah-abang',
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
    educationNotes: 'Pedagang telah diberikan edukasi persuasif dan bersedia diarahkan ke Sentra Binaan Kebon Kacang Raya.',
    relocationRequested: true,
    actionByDemoKey: 'satpol-jkp-tanah-abang',
    actionOffsetMinutes: 35,
    recommendedSiteName: 'Sentra Binaan Kebon Kacang Raya',
    relocationMatchStatus: 'FALLBACK_AVAILABLE',
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
        actorDemoKey: 'satpol-jkp-tanah-abang',
        actorName: 'Regu Patroli Alpha (Tanah Abang) (Tim Alpha — Kec. Tanah Abang)',
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
    assignedTeamCode: 'jkp-menteng-gambir',
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
    actionByDemoKey: 'satpol-jkp-menteng-gambir',
    actionOffsetMinutes: 48,
    validatedByDemoKey: 'dinas-jkt-pusat',
    revisionReason: 'Foto bukti After belum memperlihatkan sudut trotoar yang sama dengan foto Before; mohon unggah ulang bukti yang lebih jelas.',
    createdHoursAgo: 18,
    auditLogs: [
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkp-menteng-gambir',
        actorName: 'Regu Patroli Bravo (Menteng & Gambir) (Tim Bravo — Kec. Menteng & Gambir)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Tangkapan bukti manual oleh petugas pemantau CCTV.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-jkp-menteng-gambir',
        actorName: 'Regu Patroli Bravo (Menteng & Gambir) (Tim Bravo — Kec. Menteng & Gambir)',
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
    assignedTeamCode: 'jkp-tanah-abang',
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
    actionByDemoKey: 'satpol-jkp-tanah-abang',
    actionOffsetMinutes: 28,
    validatedByDemoKey: 'dinas-jkt-pusat',
    validatedOffsetMinutes: 72,
    recommendedSiteName: 'Lokasi Binaan JP 37 Thamrin City',
    relocationSiteName: 'Lokasi Binaan JP 37 Thamrin City',
    relocationMatchStatus: 'NEAREST_AVAILABLE',
    relocationCapacityCommitted: true,
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
        actorDemoKey: 'satpol-jkp-tanah-abang',
        actorName: 'Regu Patroli Alpha (Tanah Abang) (Tim Alpha — Kec. Tanah Abang)',
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
    assignedTeamCode: 'smg-tengah',
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
    recommendedSiteName: 'Selter PKL Taman Menteri Supeno',
    relocationMatchStatus: 'FALLBACK_AVAILABLE',
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
    assignedTeamCode: 'smg-tengah',
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
    actionByDemoKey: 'satpol-smg-tengah',
    actionOffsetMinutes: 40,
    recommendedSiteName: 'Selter PKL Kawasan Johar Baru',
    relocationMatchStatus: 'NEAREST_AVAILABLE',
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
        actorDemoKey: 'satpol-smg-tengah',
        actorName: 'Regu Patroli Tengah (Semarang Tengah) (Tim Tengah — Kec. Semarang Tengah)',
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
    assignedTeamCode: 'smg-selatan-barat',
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
    actionByDemoKey: 'satpol-smg-selatan-barat',
    actionOffsetMinutes: 55,
    validatedByDemoKey: 'dinas-semarang',
    revisionReason: 'Catatan edukasi belum mencantumkan komitmen pemindahan gerobak; mohon lengkapi foto kondisi trotoar bersih.',
    createdHoursAgo: 20,
    auditLogs: [
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-smg-selatan-barat',
        actorName: 'Regu Patroli Selatan & Barat Semarang (Tim Selatan & Barat — Koridor Kota)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Laporan manual petugas pada koridor wisata Kota Lama.',
        offsetMinutesFromCreated: 0,
      },
      {
        actorRole: 'SATPOL_PP',
        actorDemoKey: 'satpol-smg-selatan-barat',
        actorName: 'Regu Patroli Selatan & Barat Semarang (Tim Selatan & Barat — Koridor Kota)',
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
    assignedTeamCode: 'smg-tengah',
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
    actionByDemoKey: 'satpol-smg-tengah',
    actionOffsetMinutes: 30,
    validatedByDemoKey: 'dinas-semarang',
    validatedOffsetMinutes: 65,
    recommendedSiteName: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    relocationSiteName: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    relocationMatchStatus: 'NEAREST_AVAILABLE',
    relocationCapacityCommitted: true,
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
        actorDemoKey: 'satpol-smg-tengah',
        actorName: 'Regu Patroli Tengah (Semarang Tengah) (Tim Tengah — Kec. Semarang Tengah)',
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
 * Sekaligus menerapkan normalisasi district untuk 8 kamera Semarang yang bernilai null.
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
      const cam = parsed.data;
      const normalizedDistrict =
        cam.district && cam.district.trim().length > 0
          ? cam.district.trim()
          : (SEMARANG_NULL_DISTRICT_OVERRIDES[cam.id] ?? cam.district ?? null);
      valid.push({
        ...cam,
        district: normalizedDistrict,
      });
    } else {
      skippedCount++;
    }
  }
  return { valid, skippedCount };
}
