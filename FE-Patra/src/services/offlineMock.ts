// Data simulasi lokal yang mencerminkan BE-Patra/src/config/seedData.ts secara persis.
// HANYA digunakan saat user secara eksplisit mengaktifkan "Preview UI Offline" ketika BE-Patra belum menyala.

import type {
  AuthUserDto,
  AutoDetectPayload,
  AutoDetectResponseData,
  CctvCameraDto,
  CreateZoneInput,
  NearestRelocationSiteDto,
  NormalizedPolygon,
  RegionDto,
  ReportStatus,
  RestrictedZoneDto,
  SubmitReportActionPayload,
  UpdateZoneInput,
  ViolationReportDetailDto,
} from '@/types';

const REGIONS: Record<string, RegionDto> = {
  'jkt-pusat': {
    id: 'reg-jkp',
    code: 'jkt-pusat',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Pusat',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Pusat',
    centerLat: -6.1925,
    centerLng: 106.8185,
    defaultZoom: 13,
  },
  semarang: {
    id: 'reg-smg',
    code: 'semarang',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Semarang',
    umkmAgencyName: 'Dinas Koperasi dan Usaha Mikro Kota Semarang',
    centerLat: -6.984049,
    centerLng: 110.4175,
    defaultZoom: 13,
  },
  yogyakarta: {
    id: 'reg-yog',
    code: 'yogyakarta',
    city: 'Kota Yogyakarta',
    province: 'DI Yogyakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Yogyakarta',
    umkmAgencyName: 'Dinas Perdagangan & Koperasi UMKM Kota Yogyakarta',
    centerLat: -7.79963,
    centerLng: 110.37152,
    defaultZoom: 13,
  },
  pekanbaru: {
    id: 'reg-pku',
    code: 'pekanbaru',
    city: 'Kota Pekanbaru',
    province: 'Riau',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Pekanbaru',
    umkmAgencyName: 'Dinas Koperasi dan UMKM Kota Pekanbaru',
    centerLat: 0.5072,
    centerLng: 101.44767,
    defaultZoom: 13,
  },
  pekalongan: {
    id: 'reg-pkl',
    code: 'pekalongan',
    city: 'Kota Pekalongan',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Pekalongan',
    umkmAgencyName: 'Dindagkop UKM Kota Pekalongan',
    centerLat: -6.89521,
    centerLng: 109.67294,
    defaultZoom: 13,
  },
  cianjur: {
    id: 'reg-cjr',
    code: 'cianjur',
    city: 'Kabupaten Cianjur',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kabupaten Cianjur',
    umkmAgencyName: 'Diskumdagin Kabupaten Cianjur',
    centerLat: -6.79982,
    centerLng: 107.12414,
    defaultZoom: 12,
  },
  magelang: {
    id: 'reg-mgl',
    code: 'magelang',
    city: 'Kota Magelang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Magelang',
    umkmAgencyName: 'Disperindagkop UKM Kota Magelang',
    centerLat: -7.47156,
    centerLng: 110.21771,
    defaultZoom: 14,
  },
  'banda-aceh': {
    id: 'reg-bna',
    code: 'banda-aceh',
    city: 'Kota Banda Aceh',
    province: 'Aceh',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP dan WH Kota Banda Aceh',
    umkmAgencyName: 'Diskopukmdag Kota Banda Aceh',
    centerLat: 5.54904,
    centerLng: 95.31116,
    defaultZoom: 13,
  },
  bandung: {
    id: 'reg-bdg',
    code: 'bandung',
    city: 'Kota Bandung',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Bandung',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Bandung',
    centerLat: -6.9261,
    centerLng: 107.62107,
    defaultZoom: 13,
  },
  palembang: {
    id: 'reg-plg',
    code: 'palembang',
    city: 'Kota Palembang',
    province: 'Sumatera Selatan',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Palembang',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Palembang',
    centerLat: -2.98371,
    centerLng: 104.75023,
    defaultZoom: 13,
  },
  mataram: {
    id: 'reg-mtr',
    code: 'mataram',
    city: 'Kota Mataram',
    province: 'Nusa Tenggara Barat',
    island: 'Bali & Nusa Tenggara',
    satpolAgencyName: 'Satpol PP Kota Mataram',
    umkmAgencyName: 'Dinas Perindustrian, Koperasi & UKM Kota Mataram',
    centerLat: -8.5879,
    centerLng: 116.11257,
    defaultZoom: 13,
  },
  'jkt-selatan': {
    id: 'reg-jks',
    code: 'jkt-selatan',
    city: 'Kota Jakarta Selatan',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Selatan',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Selatan',
    centerLat: -6.235,
    centerLng: 106.82,
    defaultZoom: 13,
  },
  tasikmalaya: {
    id: 'reg-tsm',
    code: 'tasikmalaya',
    city: 'Kota Tasikmalaya',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Tasikmalaya',
    umkmAgencyName: 'Dinas KUMKM Perindag Kota Tasikmalaya',
    centerLat: -7.32638,
    centerLng: 108.22062,
    defaultZoom: 13,
  },
  bengkulu: {
    id: 'reg-bkl',
    code: 'bengkulu',
    city: 'Kota Bengkulu',
    province: 'Bengkulu',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Bengkulu',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Bengkulu',
    centerLat: -3.80604,
    centerLng: 102.28475,
    defaultZoom: 13,
  },
  padang: {
    id: 'reg-pdg',
    code: 'padang',
    city: 'Kota Padang',
    province: 'Sumatera Barat',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Padang',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Padang',
    centerLat: -0.92147,
    centerLng: 100.38818,
    defaultZoom: 13,
  },
  'jkt-barat': {
    id: 'reg-jkb',
    code: 'jkt-barat',
    city: 'Kota Jakarta Barat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Barat',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Barat',
    centerLat: -6.17799,
    centerLng: 106.79264,
    defaultZoom: 13,
  },
  'jkt-timur': {
    id: 'reg-jkt',
    code: 'jkt-timur',
    city: 'Kota Jakarta Timur',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Timur',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Timur',
    centerLat: -6.22951,
    centerLng: 106.90083,
    defaultZoom: 13,
  },
};

export const EXTRA_PUBLIC_CITY_ACCOUNTS: Array<{
  demoKey: string;
  city: string;
  province: string;
  cameraCount: number;
}> = [
  { demoKey: 'satpol-yogyakarta', city: 'Kota Yogyakarta', province: 'DI Yogyakarta', cameraCount: 87 },
  { demoKey: 'satpol-pekanbaru', city: 'Kota Pekanbaru', province: 'Riau', cameraCount: 86 },
  { demoKey: 'satpol-pekalongan', city: 'Kota Pekalongan', province: 'Jawa Tengah', cameraCount: 58 },
  { demoKey: 'satpol-cianjur', city: 'Kabupaten Cianjur', province: 'Jawa Barat', cameraCount: 56 },
  { demoKey: 'satpol-magelang', city: 'Kota Magelang', province: 'Jawa Tengah', cameraCount: 45 },
  { demoKey: 'satpol-banda-aceh', city: 'Kota Banda Aceh', province: 'Aceh', cameraCount: 39 },
  { demoKey: 'satpol-bandung', city: 'Kota Bandung', province: 'Jawa Barat', cameraCount: 35 },
  { demoKey: 'satpol-palembang', city: 'Kota Palembang', province: 'Sumatera Selatan', cameraCount: 30 },
  { demoKey: 'satpol-mataram', city: 'Kota Mataram', province: 'Nusa Tenggara Barat', cameraCount: 16 },
  { demoKey: 'satpol-jkt-selatan', city: 'Kota Jakarta Selatan', province: 'DKI Jakarta', cameraCount: 14 },
  { demoKey: 'satpol-tasikmalaya', city: 'Kota Tasikmalaya', province: 'Jawa Barat', cameraCount: 14 },
  { demoKey: 'satpol-bengkulu', city: 'Kota Bengkulu', province: 'Bengkulu', cameraCount: 7 },
  { demoKey: 'satpol-padang', city: 'Kota Padang', province: 'Sumatera Barat', cameraCount: 7 },
  { demoKey: 'satpol-jkt-barat', city: 'Kota Jakarta Barat', province: 'DKI Jakarta', cameraCount: 4 },
  { demoKey: 'satpol-jkt-timur', city: 'Kota Jakarta Timur', province: 'DKI Jakarta', cameraCount: 2 },
];

const DEMO_USERS: Record<string, AuthUserDto> = {
  'satpol-jkt-pusat': {
    id: 'u-satpol-jkp',
    email: 'satpol.jakpus@patra.demo',
    fullName: 'Petugas Satpol PP Jakarta Pusat',
    role: 'SATPOL_PP',
    isDemo: true,
    region: REGIONS['jkt-pusat']!,
  },
  'dinas-jkt-pusat': {
    id: 'u-dinas-jkp',
    email: 'sudin.jakpus@patra.demo',
    fullName: 'Admin Sudin PPKUKM Jakarta Pusat',
    role: 'DINAS_UMKM',
    isDemo: true,
    region: REGIONS['jkt-pusat']!,
  },
  'satpol-semarang': {
    id: 'u-satpol-smg',
    email: 'satpol.semarang@patra.demo',
    fullName: 'Petugas Satpol PP Kota Semarang',
    role: 'SATPOL_PP',
    isDemo: true,
    region: REGIONS.semarang!,
  },
  'dinas-semarang': {
    id: 'u-dinas-smg',
    email: 'dinas.semarang@patra.demo',
    fullName: 'Admin Dinas Koperasi & UKM Semarang',
    role: 'DINAS_UMKM',
    isDemo: true,
    region: REGIONS.semarang!,
  },
};

for (const item of EXTRA_PUBLIC_CITY_ACCOUNTS) {
  const code = item.demoKey.replace(/^satpol-/, '');
  const region = REGIONS[code];
  if (region) {
    DEMO_USERS[item.demoKey] = {
      id: `u-${item.demoKey}`,
      email: `satpol.${code}@patra.demo`,
      fullName: `Petugas ${region.satpolAgencyName}`,
      role: 'SATPOL_PP',
      isDemo: true,
      region,
    };
  }
}

const MOCK_CAMERAS: CctvCameraDto[] = [
  {
    id: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    name: 'JKP POLRI UOB PLAZA C01',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    regionLabel: 'Kebon Melati, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
    district: 'Tanah Abang',
    subdistrict: 'Kebon Melati',
    facilityCategory: 'Pasar & Pusat Belanja',
    streamUrl: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    playbackUrl: 'https://dki-jkt.balitower.co.id:7028/504866_JKP_POLRI_UOB-PLAZA-C01_CCTV-03/index.m3u8',
    streamType: 'hls',
    lat: -6.20051,
    lng: 106.82291,
    coordsExact: false,
    needsCorsProxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    sourcePortal: 'https://jakcctv.jakarta.go.id/publik',
    roiPolygon: [
      [0.58, 0.36],
      [0.92, 0.42],
      [0.96, 0.96],
      [0.54, 0.96],
    ],
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-jakarta.mp4',
    hasActiveReport: true,
  },
  {
    id: 'jkt_041_JKP_PASAR_TANAH_ABANG_C02',
    name: 'JKP PASAR TANAH ABANG BLOK A',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    regionLabel: 'Kampung Bali, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta',
    district: 'Tanah Abang',
    subdistrict: 'Kampung Bali',
    facilityCategory: 'Pasar & Pusat Belanja',
    streamUrl: 'https://dki-jkt.balitower.co.id:7028/504870_JKP_PASAR_TANAH_ABANG_C02/index.m3u8',
    playbackUrl: 'https://dki-jkt.balitower.co.id:7028/504870_JKP_PASAR_TANAH_ABANG_C02/index.m3u8',
    streamType: 'hls',
    lat: -6.18862,
    lng: 106.81478,
    coordsExact: false,
    needsCorsProxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    sourcePortal: 'https://jakcctv.jakarta.go.id/publik',
    roiPolygon: [
      [0.55, 0.4],
      [0.95, 0.44],
      [0.98, 0.95],
      [0.5, 0.95],
    ],
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-jakarta.mp4',
    hasActiveReport: false,
  },
  {
    id: 'jkt_052_JKP_STASIUN_GAMBIR_C01',
    name: 'JKP STASIUN GAMBIR SELATAN',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    regionLabel: 'Gambir, Gambir, Kota Jakarta Pusat, DKI Jakarta',
    district: 'Gambir',
    subdistrict: 'Gambir',
    facilityCategory: 'Transportasi Publik',
    streamUrl: 'https://dki-jkt.balitower.co.id:7028/504885_JKP_STASIUN_GAMBIR_C01/index.m3u8',
    playbackUrl: 'https://dki-jkt.balitower.co.id:7028/504885_JKP_STASIUN_GAMBIR_C01/index.m3u8',
    streamType: 'hls',
    lat: -6.17665,
    lng: 106.83058,
    coordsExact: false,
    needsCorsProxy: false,
    attribution: 'Diskominfotik DKI Jakarta (JakCCTV)',
    sourcePortal: 'https://jakcctv.jakarta.go.id/publik',
    roiPolygon: null,
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-jakarta.mp4',
    hasActiveReport: false,
  },
  {
    id: 'smg_001_SIMPANG_LIMA_UTARA',
    name: 'SIMPANG LIMA SISI UTARA',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    regionLabel: 'Pleburan, Semarang Selatan, Kota Semarang, Jawa Tengah',
    district: 'Semarang Tengah',
    subdistrict: 'Karangkidul',
    facilityCategory: 'Ruang Publik',
    streamUrl: 'https://pantausemar.semarangkota.go.id/live/simpang-lima-utara/index.m3u8',
    playbackUrl: 'https://pantausemar.semarangkota.go.id/live/simpang-lima-utara/index.m3u8',
    streamType: 'hls',
    lat: -6.99018,
    lng: 110.42292,
    coordsExact: true,
    needsCorsProxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    sourcePortal: 'https://pantausemar.semarangkota.go.id',
    roiPolygon: [
      [0.58, 0.38],
      [0.93, 0.42],
      [0.96, 0.94],
      [0.54, 0.94],
    ],
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-semarang.mp4',
    hasActiveReport: true,
  },
  {
    id: 'smg_008_PASAR_JOHAR_TIMUR',
    name: 'KORIDOR PASAR JOHAR TIMUR',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    regionLabel: 'Kauman, Semarang Tengah, Kota Semarang, Jawa Tengah',
    district: 'Semarang Tengah',
    subdistrict: 'Kauman',
    facilityCategory: 'Pasar & Pusat Belanja',
    streamUrl: 'https://pantausemar.semarangkota.go.id/live/pasar-johar-timur/index.m3u8',
    playbackUrl: 'https://pantausemar.semarangkota.go.id/live/pasar-johar-timur/index.m3u8',
    streamType: 'hls',
    lat: -6.97184,
    lng: 110.42515,
    coordsExact: true,
    needsCorsProxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    sourcePortal: 'https://pantausemar.semarangkota.go.id',
    roiPolygon: [
      [0.56, 0.42],
      [0.92, 0.46],
      [0.95, 0.95],
      [0.52, 0.95],
    ],
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-semarang.mp4',
    hasActiveReport: false,
  },
  {
    id: 'smg_014_KOTA_LAMA_LETJEN_SUPRAPTO',
    name: 'KOTA LAMA JL. LETJEN SUPRAPTO',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    regionLabel: 'Tanjung Mas, Semarang Utara, Kota Semarang, Jawa Tengah',
    district: 'Semarang Utara',
    subdistrict: 'Tanjung Mas',
    facilityCategory: 'Kawasan Wisata',
    streamUrl: 'https://pantausemar.semarangkota.go.id/live/kota-lama-suprapto/index.m3u8',
    playbackUrl: 'https://pantausemar.semarangkota.go.id/live/kota-lama-suprapto/index.m3u8',
    streamType: 'hls',
    lat: -6.96824,
    lng: 110.42758,
    coordsExact: true,
    needsCorsProxy: false,
    attribution: 'Diskominfo Kota Semarang (PantauSemar)',
    sourcePortal: 'https://pantausemar.semarangkota.go.id',
    roiPolygon: null,
    thumbnailUrl: null,
    fallbackVideoUrl: '/videos/demo-semarang.mp4',
    hasActiveReport: false,
  },
];

let mockZones: RestrictedZoneDto[] = [
  {
    id: 'zone-jkp-1',
    regionId: 'reg-jkp',
    name: 'Trotoar Koridor Thamrin - UOB Plaza',
    description: 'Zona larangan berjualan pada jalur pedestrian utama Jl. M.H. Thamrin.',
    points: [
      [106.821, -6.198],
      [106.825, -6.198],
      [106.825, -6.203],
      [106.821, -6.203],
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
  },
  {
    id: 'zone-jkp-2',
    regionId: 'reg-jkp',
    name: 'Bahu Jalan Pasar Tanah Abang Blok A',
    description: 'Area bebas hambatan lalu lintas sekitar Pasar Tanah Abang.',
    points: [
      [106.813, -6.186],
      [106.817, -6.186],
      [106.817, -6.191],
      [106.813, -6.191],
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 86400_000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000 * 4).toISOString(),
  },
  {
    id: 'zone-smg-1',
    regionId: 'reg-smg',
    name: 'Pedestrian Kawasan Simpang Lima',
    description: 'Trotoar lingkar luar Lapangan Pancasila Simpang Lima.',
    points: [
      [110.421, -6.988],
      [110.425, -6.988],
      [110.425, -6.992],
      [110.421, -6.992],
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000 * 5).toISOString(),
  },
  {
    id: 'zone-smg-2',
    regionId: 'reg-smg',
    name: 'Koridor Pasar Johar - Aloon-Aloon',
    description: 'Zona penataan trotoar & akses masuk Pasar Johar Semarang.',
    points: [
      [110.423, -6.97],
      [110.427, -6.97],
      [110.427, -6.974],
      [110.423, -6.974],
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 86400_000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000 * 4).toISOString(),
  },
];

const MOCK_SITES: Record<string, NearestRelocationSiteDto[]> = {
  'reg-jkp': [
    {
      id: 'site-jkp-1',
      name: 'Lokasi Binaan JP 37 Thamrin City',
      address: 'Jl. Thamrin Boulevard, Kebon Melati, Tanah Abang, Jakarta Pusat',
      lat: -6.1944,
      lng: 106.8195,
      tradeCategories: ['Kuliner', 'Minuman', 'Pakaian'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
      distanceMeters: 680,
      distanceLabel: '680 m',
    },
    {
      id: 'site-jkp-2',
      name: 'Sentra Binaan Kebon Kacang Raya',
      address: 'Jl. Kebon Kacang Raya, Tanah Abang, Jakarta Pusat',
      lat: -6.1912,
      lng: 106.8178,
      tradeCategories: ['Kuliner', 'Jajanan'],
      facilities: ['Listrik', 'Parkir', 'Kebersihan'],
      distanceMeters: 1180,
      distanceLabel: '1.2 km',
    },
    {
      id: 'site-jkp-3',
      name: 'Lokasi Binaan JP 28 Pasar Baru',
      address: 'Jl. Pasar Baru, Sawah Besar, Jakarta Pusat',
      lat: -6.1652,
      lng: 106.8342,
      tradeCategories: ['Kuliner', 'Kerajinan', 'Aksesori'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet'],
      distanceMeters: 4100,
      distanceLabel: '4.1 km',
    },
  ],
  'reg-smg': [
    {
      id: 'site-smg-1',
      name: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
      address: 'Jl. Ahmad Yani / Sisi Selatan Simpang Lima, Semarang',
      lat: -6.9905,
      lng: 110.4234,
      tradeCategories: ['Kuliner', 'Minuman'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
      distanceMeters: 120,
      distanceLabel: '120 m',
    },
    {
      id: 'site-smg-2',
      name: 'Selter PKL Taman Menteri Supeno',
      address: 'Jl. Menteri Supeno, Mugassari, Semarang Selatan',
      lat: -6.9936,
      lng: 110.4198,
      tradeCategories: ['Kuliner', 'Jajanan'],
      facilities: ['Listrik', 'Toilet', 'Lampu Penerangan'],
      distanceMeters: 520,
      distanceLabel: '520 m',
    },
    {
      id: 'site-smg-3',
      name: 'Selter PKL Kawasan Johar Baru',
      address: 'Jl. K.H. Agus Salim, Kauman, Semarang Tengah',
      lat: -6.9721,
      lng: 110.4258,
      tradeCategories: ['Kuliner', 'Sembako', 'Kerajinan'],
      facilities: ['Listrik', 'Area Teduh', 'Kebersihan'],
      distanceMeters: 2050,
      distanceLabel: '2.1 km',
    },
  ],
};

function makePlaceholderSvg(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="24" font-weight="600">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const BEFORE_PLACEHOLDER = makePlaceholderSvg('CCTV Before Evidence Snapshot', '#0B132B');
const AFTER_PLACEHOLDER = makePlaceholderSvg('Satpol PP After Enforcement Photo', '#043FA5');

let mockReports: ViolationReportDetailDto[] = [
  {
    id: 'rep-jkp-01',
    reportCode: 'PTR-202611-JKP01',
    regionId: 'reg-jkp',
    cameraId: 'jkt_035_JKP_POLRI_UOB_PLAZA_C01',
    cameraName: 'JKP POLRI UOB PLAZA C01',
    zoneId: 'zone-jkp-1',
    zoneName: 'Trotoar Koridor Thamrin - UOB Plaza',
    source: 'AUTO_AI',
    status: 'NEED_ACTION',
    address: 'Jl. M.H. Thamrin (UOB Plaza), Kebon Melati, Tanah Abang',
    lat: -6.20051,
    lng: 106.82291,
    detectedCount: 2,
    maxConfidence: 0.89,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: false,
    afterImageUrl: null,
    actionType: null,
    actualPklCount: null,
    educationNotes: null,
    relocationRequested: false,
    actionByUserId: null,
    actionSubmittedAt: null,
    validatedByUserId: null,
    validatedAt: null,
    revisionReason: null,
    relocationSiteId: null,
    relocationSiteName: null,
    relocationAssignedAt: null,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    auditLogs: [
      {
        id: 'log-jkp-1',
        reportId: 'rep-jkp-01',
        actorId: null,
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 gerobak PKL menetap di dalam ROI trotoar melewati ambang batas.',
        metadata: { detectedCount: 2, maxConfidence: 0.89 },
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-jkp']!,
  },
  {
    id: 'rep-jkp-02',
    reportCode: 'PTR-202611-JKP03',
    regionId: 'reg-jkp',
    cameraId: 'jkt_052_JKP_STASIUN_GAMBIR_C01',
    cameraName: 'JKP STASIUN GAMBIR SELATAN',
    zoneId: 'zone-jkp-1',
    zoneName: 'Trotoar Koridor Thamrin - UOB Plaza',
    source: 'MANUAL',
    status: 'NEEDS_REVISION',
    address: 'Jl. Medan Merdeka Timur (Stasiun Gambir Selatan), Gambir',
    lat: -6.17665,
    lng: 106.83058,
    detectedCount: 1,
    maxConfidence: 0.84,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: true,
    afterImageUrl: AFTER_PLACEHOLDER,
    actionType: 'EDUCATION_WARNING',
    actualPklCount: 1,
    educationNotes: 'Dilakukan himbauan lisan kepada pedagang minuman keliling.',
    relocationRequested: false,
    actionByUserId: 'u-satpol-jkp',
    actionSubmittedAt: new Date(Date.now() - 3600_000 * 17).toISOString(),
    validatedByUserId: 'u-dinas-jkp',
    validatedAt: null,
    revisionReason:
      'Foto bukti After belum memperlihatkan sudut trotoar yang sama dengan foto Before; mohon unggah ulang bukti yang lebih jelas.',
    relocationSiteId: null,
    relocationSiteName: null,
    relocationAssignedAt: null,
    createdAt: new Date(Date.now() - 3600_000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000 * 16).toISOString(),
    auditLogs: [
      {
        id: 'log-jkp-2a',
        reportId: 'rep-jkp-02',
        actorId: 'u-satpol-jkp',
        actorRole: 'SATPOL_PP',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Tangkapan bukti manual oleh petugas pemantau CCTV.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 18).toISOString(),
      },
      {
        id: 'log-jkp-2b',
        reportId: 'rep-jkp-02',
        actorId: 'u-satpol-jkp',
        actorRole: 'SATPOL_PP',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Bukti penindakan edukasi & himbauan telah diunggah.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 17).toISOString(),
      },
      {
        id: 'log-jkp-2c',
        reportId: 'rep-jkp-02',
        actorId: 'u-dinas-jkp',
        actorRole: 'DINAS_UMKM',
        actorName: 'Admin Sudin PPKUKM Jakarta Pusat',
        action: 'REVISION_REQUESTED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'NEEDS_REVISION',
        note: 'Foto bukti After belum memperlihatkan sudut trotoar yang sama dengan foto Before; mohon unggah ulang bukti yang lebih jelas.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 16).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-jkp']!,
  },
  {
    id: 'rep-jkp-03',
    reportCode: 'PTR-202611-JKP02',
    regionId: 'reg-jkp',
    cameraId: 'jkt_041_JKP_PASAR_TANAH_ABANG_C02',
    cameraName: 'JKP PASAR TANAH ABANG BLOK A',
    zoneId: 'zone-jkp-2',
    zoneName: 'Bahu Jalan Pasar Tanah Abang Blok A',
    source: 'AUTO_AI',
    status: 'PENDING_VALIDATION',
    address: 'Jl. K.H. Mas Mansyur (Pasar Tanah Abang Blok A), Tanah Abang',
    lat: -6.18862,
    lng: 106.81478,
    detectedCount: 3,
    maxConfidence: 0.91,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: false,
    afterImageUrl: AFTER_PLACEHOLDER,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 3,
    educationNotes:
      'Pedagang telah diberikan edukasi persuasif dan bersedia diarahkan ke Lokasi Binaan terdekat.',
    relocationRequested: true,
    actionByUserId: 'u-satpol-jkp',
    actionSubmittedAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
    validatedByUserId: null,
    validatedAt: null,
    revisionReason: null,
    relocationSiteId: null,
    relocationSiteName: null,
    relocationAssignedAt: null,
    createdAt: new Date(Date.now() - 3600_000 * 6).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
    auditLogs: [
      {
        id: 'log-jkp-3a',
        reportId: 'rep-jkp-03',
        actorId: null,
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Deteksi awal 3 PKL di bahu jalan Pasar Tanah Abang Blok A.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 6).toISOString(),
      },
      {
        id: 'log-jkp-3b',
        reportId: 'rep-jkp-03',
        actorId: 'u-satpol-jkp',
        actorRole: 'SATPOL_PP',
        actorName: 'Petugas Satpol PP Jakarta Pusat',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Penertiban persuasif selesai; pengajuan relokasi diteruskan ke Sudin PPKUKM.',
        metadata: { actualPklCount: 3, relocationRequested: true },
        createdAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-jkp']!,
  },
  {
    id: 'rep-smg-01',
    reportCode: 'PTR-202611-SMG01',
    regionId: 'reg-smg',
    cameraId: 'smg_337_SIMPANG_LIMA_1_360',
    cameraName: 'SIMPANG LIMA 1 360',
    zoneId: 'zone-smg-1',
    zoneName: 'Pedestrian Kawasan Simpang Lima',
    source: 'AUTO_AI',
    status: 'NEED_ACTION',
    address: 'Jl. Pandanaran / Simpang Lima, Semarang Tengah',
    lat: -6.98945,
    lng: 110.42248,
    detectedCount: 2,
    maxConfidence: 0.86,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: false,
    afterImageUrl: null,
    actionType: null,
    actualPklCount: null,
    educationNotes: null,
    relocationRequested: false,
    actionByUserId: null,
    actionSubmittedAt: null,
    validatedByUserId: null,
    validatedAt: null,
    revisionReason: null,
    relocationSiteId: null,
    relocationSiteName: null,
    relocationAssignedAt: null,
    createdAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
    auditLogs: [
      {
        id: 'log-smg-1',
        reportId: 'rep-smg-01',
        actorId: null,
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 2 gerobak PKL menetap di jalur pedestrian Simpang Lima Utara.',
        metadata: { detectedCount: 2, maxConfidence: 0.86 },
        createdAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-smg']!,
  },
  {
    id: 'rep-smg-02',
    reportCode: 'PTR-202611-SMG03',
    regionId: 'reg-smg',
    cameraId: 'smg_9103_METRO_JOHAR',
    cameraName: 'METRO JOHAR',
    zoneId: 'zone-smg-2',
    zoneName: 'Koridor Pasar Johar - Aloon-Aloon',
    source: 'MANUAL',
    status: 'NEEDS_REVISION',
    address: 'Koridor Metro Pasar Johar, Semarang Tengah',
    lat: -6.9711,
    lng: 110.42277,
    detectedCount: 1,
    maxConfidence: 0.82,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: true,
    afterImageUrl: AFTER_PLACEHOLDER,
    actionType: 'ADMINISTRATIVE_ACTION',
    actualPklCount: 1,
    educationNotes: 'Diberikan teguran tertulis dan sosialisasi kawasan cagar budaya.',
    relocationRequested: false,
    actionByUserId: 'u-satpol-smg',
    actionSubmittedAt: new Date(Date.now() - 3600_000 * 19).toISOString(),
    validatedByUserId: 'u-dinas-smg',
    validatedAt: null,
    revisionReason:
      'Catatan edukasi belum mencantumkan komitmen pemindahan gerobak; mohon lengkapi foto kondisi trotoar bersih.',
    relocationSiteId: null,
    relocationSiteName: null,
    relocationAssignedAt: null,
    createdAt: new Date(Date.now() - 3600_000 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000 * 18).toISOString(),
    auditLogs: [
      {
        id: 'log-smg-2a',
        reportId: 'rep-smg-02',
        actorId: 'u-satpol-smg',
        actorRole: 'SATPOL_PP',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Laporan manual petugas pada koridor wisata Kota Lama.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 20).toISOString(),
      },
      {
        id: 'log-smg-2b',
        reportId: 'rep-smg-02',
        actorId: 'u-dinas-smg',
        actorRole: 'DINAS_UMKM',
        actorName: 'Admin Dinas Koperasi & UKM Semarang',
        action: 'REVISION_REQUESTED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'NEEDS_REVISION',
        note: 'Catatan edukasi belum mencantumkan komitmen pemindahan gerobak; mohon lengkapi foto kondisi trotoar bersih.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 18).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-smg']!,
  },
  {
    id: 'rep-smg-03',
    reportCode: 'PTR-202611-SMG04',
    regionId: 'reg-smg',
    cameraId: 'smg_001_SIMPANG_LIMA_UTARA',
    cameraName: 'SIMPANG LIMA SISI UTARA',
    zoneId: 'zone-smg-1',
    zoneName: 'Pedestrian Kawasan Simpang Lima',
    source: 'AUTO_AI',
    status: 'VALIDATED',
    address: 'Jl. Pandanaran / Simpang Lima Sisi Utara, Semarang Tengah',
    lat: -6.99018,
    lng: 110.42292,
    detectedCount: 3,
    maxConfidence: 0.94,
    beforeImageUrl: BEFORE_PLACEHOLDER,
    isSimulationMode: false,
    afterImageUrl: AFTER_PLACEHOLDER,
    actionType: 'RELOCATION_ASSISTANCE',
    actualPklCount: 3,
    educationNotes:
      'Tiga pedagang kuliner diarahkan dan difasilitasi ke Sentra Kuliner PKL Simpang Lima.',
    relocationRequested: true,
    actionByUserId: 'u-satpol-smg',
    actionSubmittedAt: new Date(Date.now() - 3600_000 * 35).toISOString(),
    validatedByUserId: 'u-dinas-smg',
    validatedAt: new Date(Date.now() - 3600_000 * 34).toISOString(),
    revisionReason: null,
    relocationSiteId: 'site-smg-1',
    relocationSiteName: 'Sentra Kuliner PKL Simpang Lima (Pujasera)',
    relocationAssignedAt: new Date(Date.now() - 3600_000 * 34).toISOString(),
    createdAt: new Date(Date.now() - 3600_000 * 36).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000 * 34).toISOString(),
    auditLogs: [
      {
        id: 'log-smg-3a',
        reportId: 'rep-smg-03',
        actorId: null,
        actorRole: 'SYSTEM_AI',
        actorName: 'PATRA Vision AI (1 FPS)',
        action: 'REPORT_CREATED',
        fromStatus: null,
        toStatus: 'NEED_ACTION',
        note: 'Terdeteksi 3 gerobak PKL di area pedestrian Simpang Lima.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 36).toISOString(),
      },
      {
        id: 'log-smg-3b',
        reportId: 'rep-smg-03',
        actorId: 'u-satpol-smg',
        actorRole: 'SATPOL_PP',
        actorName: 'Petugas Satpol PP Kota Semarang',
        action: 'ACTION_SUBMITTED',
        fromStatus: 'NEED_ACTION',
        toStatus: 'PENDING_VALIDATION',
        note: 'Penindakan & pendampingan relokasi selesai dalam 30 menit.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 35).toISOString(),
      },
      {
        id: 'log-smg-3c',
        reportId: 'rep-smg-03',
        actorId: 'u-dinas-smg',
        actorRole: 'DINAS_UMKM',
        actorName: 'Admin Dinas Koperasi & UKM Semarang',
        action: 'REPORT_VALIDATED',
        fromStatus: 'PENDING_VALIDATION',
        toStatus: 'VALIDATED',
        note: 'Bukti lengkap dan valid.',
        metadata: null,
        createdAt: new Date(Date.now() - 3600_000 * 34).toISOString(),
      },
    ],
    nearestRelocationSites: MOCK_SITES['reg-smg']!,
  },
];

let catalogCameras: CctvCameraDto[] = [...MOCK_CAMERAS];
let catalogLoadPromise: Promise<void> | null = null;

async function loadPublicCatalogOnce(): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch('/data/cctv_catalog.json', { cache: 'default' });
    if (!res.ok) return;
    const json = (await res.json()) as { cameras?: CctvCameraDto[] } | CctvCameraDto[];
    const items = Array.isArray(json) ? json : Array.isArray(json?.cameras) ? json.cameras : [];
    if (items.length > 0) {
      catalogCameras = items;
    }
  } catch {
    // Tetap gunakan fallback MOCK_CAMERAS apabila file katalog lokal belum tersedia
  }
}

export const offlineMock = {
  async ensureCamerasLoaded(): Promise<void> {
    if (!catalogLoadPromise) {
      catalogLoadPromise = loadPublicCatalogOnce();
    }
    await catalogLoadPromise;
  },

  getUserByDemoKey(demoKey: string): AuthUserDto {
    return DEMO_USERS[demoKey] ?? DEMO_USERS['satpol-semarang']!;
  },

  loginByEmail(email: string): { token: string; user: AuthUserDto } {
    const normalized = email.trim().toLowerCase();
    const matched = Object.entries(DEMO_USERS).find(
      ([, u]) => u.email.toLowerCase() === normalized,
    );
    if (matched) {
      return { token: `mock:${matched[0]}`, user: matched[1] };
    }
    if (normalized.includes('jakarta') || normalized.includes('jakpus') || normalized.includes('jkt')) {
      const key = normalized.includes('dinas') || normalized.includes('sudin')
        ? 'dinas-jkt-pusat'
        : 'satpol-jkt-pusat';
      return { token: `mock:${key}`, user: DEMO_USERS[key]! };
    }
    const key =
      normalized.includes('dinas') || normalized.includes('umkm')
        ? 'dinas-semarang'
        : 'satpol-semarang';
    return { token: `mock:${key}`, user: DEMO_USERS[key]! };
  },

  listCameras(
    user: AuthUserDto,
    params?:
      | string
      | { search?: string; district?: string; facilityCategory?: string },
  ): CctvCameraDto[] {
    const filter = typeof params === 'string' ? { search: params } : (params ?? {});
    const q = filter.search?.trim().toLowerCase() ?? '';
    const dist = filter.district?.trim().toLowerCase() ?? '';
    const cat = filter.facilityCategory?.trim().toLowerCase() ?? '';
    const userCity = user.region.city.trim().toLowerCase();

    return catalogCameras
      .filter((c) => c.city.trim().toLowerCase() === userCity)
      .map((c) => ({
        ...c,
        hasActiveReport: mockReports.some(
          (r) =>
            r.cameraId === c.id &&
            (r.status === 'NEED_ACTION' || r.status === 'NEEDS_REVISION'),
        ),
      }))
      .filter((c) => {
        if (dist && (c.district ?? '').trim().toLowerCase() !== dist) return false;
        if (cat && (c.facilityCategory ?? '').trim().toLowerCase() !== cat) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.regionLabel.toLowerCase().includes(q) ||
          (c.district ?? '').toLowerCase().includes(q) ||
          (c.subdistrict ?? '').toLowerCase().includes(q) ||
          (c.facilityCategory ?? '').toLowerCase().includes(q)
        );
      });
  },

  getCameraById(user: AuthUserDto, id: string): CctvCameraDto | null {
    return this.listCameras(user).find((c) => c.id === id) ?? null;
  },

  updateCameraRoi(
    user: AuthUserDto,
    id: string,
    roiPolygon: NormalizedPolygon | null,
  ): CctvCameraDto {
    const cam = this.getCameraById(user, id);
    if (!cam) throw new Error('Kamera CCTV tidak ditemukan.');
    catalogCameras = catalogCameras.map((c) =>
      c.id === id ? { ...c, roiPolygon } : c,
    );
    return { ...cam, roiPolygon };
  },

  listZones(user: AuthUserDto): RestrictedZoneDto[] {
    return mockZones.filter((z) => z.regionId === user.region.id && z.isActive);
  },

  createZone(user: AuthUserDto, input: CreateZoneInput): RestrictedZoneDto {
    const now = new Date().toISOString();
    const zone: RestrictedZoneDto = {
      id: `zone-${Date.now()}`,
      regionId: user.region.id,
      name: input.name,
      description: input.description ?? null,
      points: input.points,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    mockZones = [zone, ...mockZones];
    return zone;
  },

  updateZone(user: AuthUserDto, id: string, input: UpdateZoneInput): RestrictedZoneDto {
    const target = mockZones.find((z) => z.id === id && z.regionId === user.region.id);
    if (!target) throw new Error('Zona tidak ditemukan.');
    const updated: RestrictedZoneDto = {
      ...target,
      name: input.name ?? target.name,
      description: input.description !== undefined ? input.description : target.description,
      points: input.points ?? target.points,
      updatedAt: new Date().toISOString(),
    };
    mockZones = mockZones.map((z) => (z.id === id ? updated : z));
    return updated;
  },

  removeZone(user: AuthUserDto, id: string): void {
    mockZones = mockZones.filter((z) => !(z.id === id && z.regionId === user.region.id));
  },

  listReports(
    user: AuthUserDto,
    filters?: { statuses?: ReportStatus[]; search?: string },
  ): ViolationReportDetailDto[] {
    const q = filters?.search?.trim().toLowerCase() ?? '';
    return mockReports.filter((r) => {
      if (r.regionId !== user.region.id) return false;
      if (filters?.statuses && filters.statuses.length > 0 && !filters.statuses.includes(r.status)) {
        return false;
      }
      if (
        q &&
        !r.reportCode.toLowerCase().includes(q) &&
        !r.address.toLowerCase().includes(q) &&
        !(r.cameraName ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  },

  getReportById(user: AuthUserDto, id: string): ViolationReportDetailDto | null {
    return mockReports.find((r) => r.id === id && r.regionId === user.region.id) ?? null;
  },

  autoDetect(
    user: AuthUserDto,
    payload: AutoDetectPayload,
    snapshotBlob: Blob,
  ): AutoDetectResponseData {
    const cam = this.getCameraById(user, payload.cameraId);
    if (!cam) throw new Error('Kamera tidak ditemukan.');
    const previewUrl = URL.createObjectURL(snapshotBlob);
    const active = mockReports.find(
      (r) => r.cameraId === cam.id && r.status === 'NEED_ACTION',
    );
    const now = new Date().toISOString();

    if (active) {
      if (payload.source === 'MANUAL' || payload.currentActiveViolators > active.detectedCount) {
        const newCount = Math.max(active.detectedCount, payload.currentActiveViolators);
        const prevUrl = active.beforeImageUrl;
        active.detectedCount = newCount;
        active.maxConfidence = Math.max(active.maxConfidence, payload.maxConfidence);
        active.beforeImageUrl = previewUrl;
        active.updatedAt = now;
        active.auditLogs.push({
          id: `log-${Date.now()}`,
          reportId: active.id,
          actorId: payload.source === 'MANUAL' ? user.id : null,
          actorRole: payload.source === 'MANUAL' ? 'SATPOL_PP' : 'SYSTEM_AI',
          actorName: payload.source === 'MANUAL' ? user.fullName : 'PATRA Vision AI (1 FPS)',
          action:
            payload.source === 'MANUAL' ? 'MANUAL_EVIDENCE_UPDATED' : 'INCIDENT_ESCALATED',
          fromStatus: 'NEED_ACTION',
          toStatus: 'NEED_ACTION',
          note: `Bukti diperbarui (${newCount} PKL aktif di dalam ROI).`,
          metadata: { previousBeforeImageUrl: prevUrl, newCount },
          createdAt: now,
        });
        return {
          outcome: 'MERGED_ESCALATED',
          merged: true,
          escalated: true,
          suppressedByCooldown: false,
          report: {
            id: active.id,
            reportCode: active.reportCode,
            cameraId: active.cameraId,
            status: active.status,
            detectedCount: active.detectedCount,
            beforeImageUrl: active.beforeImageUrl,
            createdAt: active.createdAt,
          },
        };
      }

      return {
        outcome: 'MERGED_NOOP',
        merged: true,
        escalated: false,
        suppressedByCooldown: false,
        report: {
          id: active.id,
          reportCode: active.reportCode,
          cameraId: active.cameraId,
          status: active.status,
          detectedCount: active.detectedCount,
          beforeImageUrl: active.beforeImageUrl,
          createdAt: active.createdAt,
        },
      };
    }

    const codeSuffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    const created: ViolationReportDetailDto = {
      id: `rep-${Date.now()}`,
      reportCode: `PTR-202611-${codeSuffix}`,
      regionId: user.region.id,
      cameraId: cam.id,
      cameraName: cam.name,
      zoneId: mockZones.find((z) => z.regionId === user.region.id)?.id ?? null,
      zoneName: mockZones.find((z) => z.regionId === user.region.id)?.name ?? null,
      source: payload.source,
      status: 'NEED_ACTION',
      address: cam.regionLabel || cam.name,
      lat: cam.lat,
      lng: cam.lng,
      detectedCount: payload.currentActiveViolators,
      maxConfidence: payload.maxConfidence,
      beforeImageUrl: previewUrl,
      isSimulationMode: payload.isSimulationMode,
      afterImageUrl: null,
      actionType: null,
      actualPklCount: null,
      educationNotes: null,
      relocationRequested: false,
      actionByUserId: null,
      actionSubmittedAt: null,
      validatedByUserId: null,
      validatedAt: null,
      revisionReason: null,
      relocationSiteId: null,
      relocationSiteName: null,
      relocationAssignedAt: null,
      createdAt: now,
      updatedAt: now,
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          reportId: `rep-${Date.now()}`,
          actorId: payload.source === 'MANUAL' ? user.id : null,
          actorRole: payload.source === 'MANUAL' ? 'SATPOL_PP' : 'SYSTEM_AI',
          actorName: payload.source === 'MANUAL' ? user.fullName : 'PATRA Vision AI (1 FPS)',
          action: 'REPORT_CREATED',
          fromStatus: null,
          toStatus: 'NEED_ACTION',
          note:
            payload.source === 'MANUAL'
              ? `Tangkapan bukti manual oleh petugas pada ${cam.name}.`
              : `Terdeteksi ${payload.currentActiveViolators} PKL menetap pada ${cam.name}.`,
          metadata: { detectedCount: payload.currentActiveViolators },
          createdAt: now,
        },
      ],
      nearestRelocationSites: MOCK_SITES[user.region.id] ?? [],
    };
    mockReports = [created, ...mockReports];

    return {
      outcome: 'CREATED',
      merged: false,
      escalated: false,
      suppressedByCooldown: false,
      report: {
        id: created.id,
        reportCode: created.reportCode,
        cameraId: created.cameraId,
        status: created.status,
        detectedCount: created.detectedCount,
        beforeImageUrl: created.beforeImageUrl,
        createdAt: created.createdAt,
      },
    };
  },

  submitAction(
    user: AuthUserDto,
    reportId: string,
    payload: SubmitReportActionPayload,
    afterFile: File,
  ): ViolationReportDetailDto {
    const target = this.getReportById(user, reportId);
    if (!target) throw new Error('Laporan tidak ditemukan.');
    const now = new Date().toISOString();
    const prevStatus = target.status;
    target.status = 'PENDING_VALIDATION';
    target.afterImageUrl = URL.createObjectURL(afterFile);
    target.actionType = payload.actionType;
    target.actualPklCount = payload.actualPklCount;
    target.educationNotes = payload.educationNotes;
    target.relocationRequested = payload.relocationRequested;
    target.actionByUserId = user.id;
    target.actionSubmittedAt = target.actionSubmittedAt ?? now;
    target.updatedAt = now;
    target.auditLogs.push({
      id: `log-${Date.now()}`,
      reportId: target.id,
      actorId: user.id,
      actorRole: 'SATPOL_PP',
      actorName: user.fullName,
      action: prevStatus === 'NEEDS_REVISION' ? 'REVISION_SUBMITTED' : 'ACTION_SUBMITTED',
      fromStatus: prevStatus,
      toStatus: 'PENDING_VALIDATION',
      note: payload.educationNotes,
      metadata: {
        actionType: payload.actionType,
        actualPklCount: payload.actualPklCount,
        relocationRequested: payload.relocationRequested,
      },
      createdAt: now,
    });
    return { ...target, auditLogs: [...target.auditLogs] };
  },
};
