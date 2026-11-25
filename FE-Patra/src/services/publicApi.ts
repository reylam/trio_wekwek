import { apiFetch } from '@/lib/apiClient';
import { normalizeCityParam } from '@/lib/publicHelpers';
import { IS_BACKEND_ENABLED } from '@/services/api';
import type {
  PublicAuditFeedItemDto,
  PublicCityItem,
  PublicMapData,
  PublicOverviewData,
} from '@/types';

// ============================================================================
// OFFLINE MOCK FALLBACK (Hanya aktif bila VITE_USE_BACKEND !== 'true')
// KETAT PRIVASI: Dilarang keras menyimpan beforeImageUrl / afterImageUrl / kuota.
// ============================================================================

const MOCK_PUBLIC_CITIES: PublicCityItem[] = [
  {
    id: 'reg-jkp',
    code: 'jkt-pusat',
    city: 'Kota Jakarta Pusat',
    province: 'DKI Jakarta',
    centerLat: -6.1864,
    centerLng: 106.834,
    defaultZoom: 13,
  },
  {
    id: 'reg-smg',
    code: 'semarang',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    centerLat: -6.9896,
    centerLng: 110.4228,
    defaultZoom: 13,
  },
  {
    id: 'reg-yog',
    code: 'yogyakarta',
    city: 'Kota Yogyakarta',
    province: 'DI Yogyakarta',
    centerLat: -7.79963,
    centerLng: 110.37152,
    defaultZoom: 13,
  },
  {
    id: 'reg-pku',
    code: 'pekanbaru',
    city: 'Kota Pekanbaru',
    province: 'Riau',
    centerLat: 0.5072,
    centerLng: 101.44767,
    defaultZoom: 13,
  },
  {
    id: 'reg-pkl',
    code: 'pekalongan',
    city: 'Kota Pekalongan',
    province: 'Jawa Tengah',
    centerLat: -6.89521,
    centerLng: 109.67294,
    defaultZoom: 13,
  },
  {
    id: 'reg-cjr',
    code: 'cianjur',
    city: 'Kabupaten Cianjur',
    province: 'Jawa Barat',
    centerLat: -6.79982,
    centerLng: 107.12414,
    defaultZoom: 12,
  },
  {
    id: 'reg-mgl',
    code: 'magelang',
    city: 'Kota Magelang',
    province: 'Jawa Tengah',
    centerLat: -7.47156,
    centerLng: 110.21771,
    defaultZoom: 14,
  },
  {
    id: 'reg-bna',
    code: 'banda-aceh',
    city: 'Kota Banda Aceh',
    province: 'Aceh',
    centerLat: 5.54904,
    centerLng: 95.31116,
    defaultZoom: 13,
  },
  {
    id: 'reg-bdg',
    code: 'bandung',
    city: 'Kota Bandung',
    province: 'Jawa Barat',
    centerLat: -6.9261,
    centerLng: 107.62107,
    defaultZoom: 13,
  },
  {
    id: 'reg-plg',
    code: 'palembang',
    city: 'Kota Palembang',
    province: 'Sumatera Selatan',
    centerLat: -2.98371,
    centerLng: 104.75023,
    defaultZoom: 13,
  },
  {
    id: 'reg-mtr',
    code: 'mataram',
    city: 'Kota Mataram',
    province: 'Nusa Tenggara Barat',
    centerLat: -8.5879,
    centerLng: 116.11257,
    defaultZoom: 13,
  },
  {
    id: 'reg-jks',
    code: 'jkt-selatan',
    city: 'Kota Jakarta Selatan',
    province: 'DKI Jakarta',
    centerLat: -6.235,
    centerLng: 106.82,
    defaultZoom: 13,
  },
  {
    id: 'reg-tsm',
    code: 'tasikmalaya',
    city: 'Kota Tasikmalaya',
    province: 'Jawa Barat',
    centerLat: -7.32638,
    centerLng: 108.22062,
    defaultZoom: 13,
  },
  {
    id: 'reg-bkl',
    code: 'bengkulu',
    city: 'Kota Bengkulu',
    province: 'Bengkulu',
    centerLat: -3.80604,
    centerLng: 102.28475,
    defaultZoom: 13,
  },
  {
    id: 'reg-pdg',
    code: 'padang',
    city: 'Kota Padang',
    province: 'Sumatera Barat',
    centerLat: -0.92147,
    centerLng: 100.38818,
    defaultZoom: 13,
  },
  {
    id: 'reg-jkb',
    code: 'jkt-barat',
    city: 'Kota Jakarta Barat',
    province: 'DKI Jakarta',
    centerLat: -6.17799,
    centerLng: 106.79264,
    defaultZoom: 13,
  },
  {
    id: 'reg-jkt',
    code: 'jkt-timur',
    city: 'Kota Jakarta Timur',
    province: 'DKI Jakarta',
    centerLat: -6.22951,
    centerLng: 106.90083,
    defaultZoom: 13,
  },
];

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

const MOCK_ZONES_BY_CITY: Record<string, PublicMapData['zones']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'pub-zone-jkt-1',
      name: 'Koridor Trotoar M.H. Thamrin – Sarinah',
      points: [
        [106.8224, -6.1886],
        [106.8244, -6.1886],
        [106.8244, -6.1858],
        [106.8224, -6.1858],
      ],
    },
    {
      id: 'pub-zone-jkt-2',
      name: 'Zona Tertib Pedestrian Pasar Baru',
      points: [
        [106.8331, -6.1684],
        [106.8355, -6.1684],
        [106.8355, -6.1661],
        [106.8331, -6.1661],
      ],
    },
  ],
  'Kota Semarang': [
    {
      id: 'pub-zone-smg-1',
      name: 'Zona Larangan PKL Simpang Lima – Pandanaran',
      points: [
        [110.4209, -6.9912],
        [110.4244, -6.9912],
        [110.4244, -6.9885],
        [110.4209, -6.9885],
      ],
    },
    {
      id: 'pub-zone-smg-2',
      name: 'Koridor Cagar Budaya Tugumuda – Pemuda',
      points: [
        [110.4081, -6.9856],
        [110.4112, -6.9856],
        [110.4112, -6.9831],
        [110.4081, -6.9831],
      ],
    },
  ],
};

const MOCK_HOTSPOTS_BY_CITY: Record<string, PublicMapData['hotspots']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'pub-hs-jkt-1',
      reportCode: 'PTR-202611-JKT01',
      address: 'Jl. M.H. Thamrin Trotoar Barat (Simpang Sarinah)',
      lat: -6.1872,
      lng: 106.8235,
      detectedCount: 3,
      status: 'PENDING_VALIDATION',
      createdAt: hoursAgoIso(2.2),
    },
    {
      id: 'pub-hs-jkt-2',
      reportCode: 'PTR-202611-JKT02',
      address: 'Jl. Pasar Baru Selatan Trotoar Pintu Air',
      lat: -6.1674,
      lng: 106.8342,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(17),
    },
    {
      id: 'pub-hs-jkt-3',
      reportCode: 'PTR-202611-JKT03',
      address: 'Jl. Kebon Sirih Barat (Depan Halte)',
      lat: -6.1821,
      lng: 106.8264,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(43),
    },
  ],
  'Kota Semarang': [
    {
      id: 'pub-hs-smg-1',
      reportCode: 'PTR-202611-SMG01',
      address: 'Jl. Pandanaran Trotoar Utara (Simpang Lima)',
      lat: -6.9896,
      lng: 110.4228,
      detectedCount: 4,
      status: 'PENDING_VALIDATION',
      createdAt: hoursAgoIso(1.4),
    },
    {
      id: 'pub-hs-smg-2',
      reportCode: 'PTR-202611-SMG02',
      address: 'Jl. Pemuda Simpang Tugumuda',
      lat: -6.9844,
      lng: 110.4094,
      detectedCount: 2,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(13),
    },
    {
      id: 'pub-hs-smg-3',
      reportCode: 'PTR-202611-SMG03',
      address: 'Jl. Pahlawan Taman Indonesia Kaya',
      lat: -6.9935,
      lng: 110.4209,
      detectedCount: 3,
      status: 'VALIDATED',
      createdAt: hoursAgoIso(37),
    },
  ],
};

const MOCK_SITES_BY_CITY: Record<string, PublicMapData['relocationSites']> = {
  'Kota Jakarta Pusat': [
    {
      id: 'site-jkt-1',
      name: 'Lokbin JP 25 Pasar Baru',
      address: 'Jl. Pasar Baru Timur Dalam No. 12, Sawah Besar, Jakarta Pusat',
      lat: -6.1652,
      lng: 106.8358,
      tradeCategories: ['Kuliner', 'Minuman', 'Aksesoris'],
      facilities: ['Listrik PLN', 'Air Bersih', 'Toilet', 'Kanopi Permanen'],
    },
    {
      id: 'site-jkt-2',
      name: 'JP 42 Kuliner Sabang Binaan',
      address: 'Jl. H. Agus Salim Kav. 21, Menteng, Jakarta Pusat',
      lat: -6.1835,
      lng: 106.8246,
      tradeCategories: ['Kuliner Malam', 'Kopi & Jajanan'],
      facilities: ['Tenda Resmi', 'Air Bersih', 'Penerangan Jalan', 'Area Parkir'],
    },
  ],
  'Kota Semarang': [
    {
      id: 'site-smg-1',
      name: 'Selter PKL Taman Menteri Supeno (Taman KB)',
      address: 'Jl. Taman Menteri Supeno No. 1, Mugassari, Semarang Selatan',
      lat: -6.9927,
      lng: 110.4201,
      tradeCategories: ['Kuliner', 'Minuman', 'Cinderamata'],
      facilities: ['Listrik', 'Air Bersih', 'Area Duduk Teduh', 'Toilet Umum'],
    },
    {
      id: 'site-smg-2',
      name: 'Sentra Kuliner Binaan Basudewo',
      address: 'Jl. Basudewo Raya No. 14, Bulustalan, Semarang Selatan',
      lat: -6.9885,
      lng: 110.4024,
      tradeCategories: ['Kuliner', 'Gorengan & Kopi'],
      facilities: ['Tenda Seragam', 'Air Mengalir', 'Tempat Sampah Terpilah'],
    },
  ],
  'Kota Yogyakarta': [
    {
      id: 'site-yog-1',
      name: 'Teras Malioboro 1 (Zona Binaan PKL)',
      address: 'Jl. Margo Mulyo No. 16, Ngupasan, Gondomanan, Kota Yogyakarta',
      lat: -7.79935,
      lng: 110.36545,
      tradeCategories: ['Kuliner', 'Batik & Fashion', 'Cinderamata'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    },
    {
      id: 'site-yog-2',
      name: 'Teras Malioboro 2 & Sentra Kuliner Beskalan',
      address: 'Jl. Malioboro No. 56, Suryatmajan, Danurejan, Kota Yogyakarta',
      lat: -7.7931,
      lng: 110.3658,
      tradeCategories: ['Kuliner', 'Kerajinan', 'Minuman'],
      facilities: ['Listrik', 'Lampu Penerangan', 'Toilet', 'Kebersihan'],
    },
  ],
  'Kota Pekanbaru': [
    {
      id: 'site-pku-1',
      name: 'Sentra Kuliner Binaan Cut Nyak Dien',
      address: 'Jl. Cut Nyak Dien, Jadirejo, Sukajadi, Kota Pekanbaru',
      lat: 0.5142,
      lng: 101.4461,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
      facilities: ['Listrik', 'Parkir', 'Lampu Penerangan', 'Kebersihan'],
    },
    {
      id: 'site-pku-2',
      name: 'Zona Binaan UMKM RTH Kaca Mayang',
      address: 'Jl. Jenderal Sudirman, Kota Tinggi, Pekanbaru Kota',
      lat: 0.5186,
      lng: 101.4488,
      tradeCategories: ['Kuliner', 'Kopi & Minuman', 'Aksesori'],
      facilities: ['Area Teduh', 'Toilet', 'Air Bersih', 'Tempat Sampah'],
    },
  ],
  'Kota Pekalongan': [
    {
      id: 'site-pkl-1',
      name: 'Selter PKL Binaan Alun-Alun Pekalongan',
      address: 'Jl. Wahid Hasyim, Kauman, Pekalongan Timur, Kota Pekalongan',
      lat: -6.8898,
      lng: 109.6746,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan Tradisional'],
      facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Toilet'],
    },
    {
      id: 'site-pkl-2',
      name: 'Sentra Kuliner & Batik Binaan Jetayu',
      address: 'Jl. Jetayu No. 4, Panjang Wetan, Pekalongan Utara, Kota Pekalongan',
      lat: -6.8815,
      lng: 109.6752,
      tradeCategories: ['Batik & Kerajinan', 'Kuliner', 'Minuman'],
      facilities: ['Area Teduh', 'Parkir', 'Listrik', 'Kebersihan'],
    },
  ],
  'Kabupaten Cianjur': [
    {
      id: 'site-cjr-1',
      name: 'Sentra Binaan UMKM Taman Prawatasari',
      address: 'Jl. Surya Kencana No. 1, Sawah Gede, Kabupaten Cianjur',
      lat: -6.8261,
      lng: 107.1368,
      tradeCategories: ['Kuliner', 'Jajanan', 'Oleh-Oleh'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Parkir'],
    },
    {
      id: 'site-cjr-2',
      name: 'Zona Hijau PKL Alun-Alun Cianjur',
      address: 'Jl. Siti Jenab, Pamoyanan, Kabupaten Cianjur',
      lat: -6.8224,
      lng: 107.1394,
      tradeCategories: ['Kuliner', 'Minuman', 'Aksesori'],
      facilities: ['Area Teduh', 'Lampu Penerangan', 'Kebersihan'],
    },
  ],
  'Kota Magelang': [
    {
      id: 'site-mgl-1',
      name: 'Sentra Kuliner Binaan Tuin Van Java',
      address: 'Jl. Alun-Alun Timur, Kemirirejo, Magelang Tengah, Kota Magelang',
      lat: -7.4765,
      lng: 110.2179,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Duduk'],
    },
    {
      id: 'site-mgl-2',
      name: 'Selter PKL Binaan Taman Badaan',
      address: 'Jl. Pahlawan No. 24, Potrobangsan, Magelang Utara, Kota Magelang',
      lat: -7.4662,
      lng: 110.2185,
      tradeCategories: ['Kuliner', 'Jajanan', 'Mainan & Aksesori'],
      facilities: ['Listrik', 'Area Teduh', 'Parkir', 'Kebersihan'],
    },
  ],
  'Kota Banda Aceh': [
    {
      id: 'site-bna-1',
      name: 'Sentra Kuliner Binaan Rex Peunayong',
      address: 'Jl. Khairil Anwar, Peunayong, Kuta Alam, Kota Banda Aceh',
      lat: 5.5579,
      lng: 95.3204,
      tradeCategories: ['Kuliner Malam', 'Kopi Aceh', 'Minuman'],
      facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Toilet'],
    },
    {
      id: 'site-bna-2',
      name: 'Zona Binaan UMKM Taman Bustanussalatin',
      address: 'Jl. Sultan Alaiddin Mahmudsyah, Baiturrahman, Kota Banda Aceh',
      lat: 5.5515,
      lng: 95.3156,
      tradeCategories: ['Kuliner', 'Cinderamata', 'Minuman'],
      facilities: ['Area Teduh', 'Toilet', 'Parkir', 'Kebersihan'],
    },
  ],
  'Kota Bandung': [
    {
      id: 'site-bdg-1',
      name: 'Teras Cihampelas (Zona Binaan PKL)',
      address: 'Jl. Cihampelas, Cipaganti, Coblong, Kota Bandung',
      lat: -6.8938,
      lng: 107.6052,
      tradeCategories: ['Pakaian', 'Kuliner', 'Cinderamata'],
      facilities: ['Listrik', 'Toilet', 'Area Teduh', 'Jalur Pejalan Kaki'],
    },
    {
      id: 'site-bdg-2',
      name: 'Selter Binaan Alun-Alun & Dalem Kaum',
      address: 'Jl. Dalem Kaum, Balonggede, Regol, Kota Bandung',
      lat: -6.92185,
      lng: 107.6071,
      tradeCategories: ['Kuliner', 'Aksesori', 'Jajanan'],
      facilities: ['Listrik', 'Air Bersih', 'Lampu Penerangan', 'Kebersihan'],
    },
  ],
  'Kota Palembang': [
    {
      id: 'site-plg-1',
      name: 'Sentra Kuliner Binaan Kambang Iwak',
      address: 'Jl. Tasik, Talang Semut, Bukit Kecil, Kota Palembang',
      lat: -2.9896,
      lng: 104.7458,
      tradeCategories: ['Kuliner', 'Pempek & Jajanan', 'Minuman'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
    },
    {
      id: 'site-plg-2',
      name: 'Zona Hijau UMKM Pelataran Benteng Kuto Besak',
      address: 'Jl. Sultan Mahmud Badaruddin II, Ilir Barat I, Kota Palembang',
      lat: -2.9909,
      lng: 104.7604,
      tradeCategories: ['Kuliner', 'Kerajinan Songket', 'Minuman'],
      facilities: ['Lampu Penerangan', 'Toilet', 'Area Duduk', 'Kebersihan'],
    },
  ],
  'Kota Mataram': [
    {
      id: 'site-mtr-1',
      name: 'Sentra Binaan PKL Taman Sangkareang',
      address: 'Jl. Pejanggik, Mataram Barat, Selaparang, Kota Mataram',
      lat: -8.5831,
      lng: 116.1072,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    },
    {
      id: 'site-mtr-2',
      name: 'Zona Kuliner Binaan Udayana Mataram',
      address: 'Jl. Udayana, Monjok Barat, Selaparang, Kota Mataram',
      lat: -8.5764,
      lng: 116.1008,
      tradeCategories: ['Kuliner Malam', 'Kopi & Minuman', 'Aksesori'],
      facilities: ['Listrik', 'Lampu Penerangan', 'Parkir', 'Kebersihan'],
    },
  ],
  'Kota Jakarta Selatan': [
    {
      id: 'site-jks-1',
      name: 'Lokasi Binaan JS 29 Barito & Taman Ayodia',
      address: 'Jl. Lamandau III, Kramat Pela, Kebayoran Baru, Jakarta Selatan',
      lat: -6.2452,
      lng: 106.7944,
      tradeCategories: ['Kuliner', 'Minuman', 'Tanaman & Aksesori'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    },
    {
      id: 'site-jks-2',
      name: 'Sentra Binaan JS 14 Tebet Eco Park',
      address: 'Jl. Tebet Timur Raya, Tebet, Jakarta Selatan',
      lat: -6.2378,
      lng: 106.8531,
      tradeCategories: ['Kuliner', 'Jajanan', 'Kopi & Minuman'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
    },
  ],
  'Kota Tasikmalaya': [
    {
      id: 'site-tsm-1',
      name: 'Sentra Kuliner Binaan Dadaha',
      address: 'Jl. Lingkar Dadaha, Nagarawangi, Cihideung, Kota Tasikmalaya',
      lat: -7.3346,
      lng: 108.2158,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
      facilities: ['Listrik', 'Parkir', 'Toilet', 'Lampu Penerangan'],
    },
    {
      id: 'site-tsm-2',
      name: 'Selter PKL Binaan Taman Kota Tasikmalaya',
      address: 'Jl. KH. Z. Mustofa, Yudanagara, Cihideung, Kota Tasikmalaya',
      lat: -7.3274,
      lng: 108.2209,
      tradeCategories: ['Kuliner', 'Kerajinan Bordir', 'Aksesori'],
      facilities: ['Listrik', 'Air Bersih', 'Area Teduh', 'Kebersihan'],
    },
  ],
  'Kota Bengkulu': [
    {
      id: 'site-bkl-1',
      name: 'Zona Hijau UMKM Pantai Panjang (Sport Center)',
      address: 'Jl. Pariwisata Pantai Panjang, Lempuing, Ratu Agung, Kota Bengkulu',
      lat: -3.8104,
      lng: 102.2632,
      tradeCategories: ['Kuliner', 'Minuman Kelapa', 'Cinderamata'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
    },
    {
      id: 'site-bkl-2',
      name: 'Sentra Kuliner Binaan Simpang Lima Ratu Samban',
      address: 'Jl. S. Parman, Padang Jati, Ratu Samban, Kota Bengkulu',
      lat: -3.7968,
      lng: 102.2656,
      tradeCategories: ['Kuliner', 'Jajanan', 'Minuman'],
      facilities: ['Listrik', 'Lampu Penerangan', 'Kebersihan'],
    },
  ],
  'Kota Padang': [
    {
      id: 'site-pdg-1',
      name: 'Selter PKL Binaan Pantai Padang (Cimpago)',
      address: 'Jl. Samudera, Purus, Padang Barat, Kota Padang',
      lat: -0.9301,
      lng: 100.3512,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan Pantai'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    },
    {
      id: 'site-pdg-2',
      name: 'Sentra Kuliner Binaan RTH Imam Bonjol',
      address: 'Jl. Imam Bonjol, Belakang Pondok, Padang Selatan, Kota Padang',
      lat: -0.9554,
      lng: 100.3608,
      tradeCategories: ['Kuliner', 'Minuman', 'Pakaian'],
      facilities: ['Listrik', 'Parkir', 'Lampu Penerangan', 'Kebersihan'],
    },
  ],
  'Kota Jakarta Barat': [
    {
      id: 'site-jkb-1',
      name: 'Lokasi Binaan JB 19 Kota Intan (Kota Tua)',
      address: 'Jl. Cengkeh No. 16, Pinangsia, Taman Sari, Jakarta Barat',
      lat: -6.1331,
      lng: 106.8124,
      tradeCategories: ['Kuliner', 'Cinderamata', 'Pakaian'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Parkir'],
    },
    {
      id: 'site-jkb-2',
      name: 'Sentra Binaan JB 34 Tanjung Duren',
      address: 'Jl. Tanjung Duren Raya, Grogol Petamburan, Jakarta Barat',
      lat: -6.1765,
      lng: 106.7848,
      tradeCategories: ['Kuliner', 'Minuman', 'Jajanan'],
      facilities: ['Listrik', 'Area Teduh', 'Toilet', 'Kebersihan'],
    },
  ],
  'Kota Jakarta Timur': [
    {
      id: 'site-jkt-1',
      name: 'Lokasi Binaan JT 24 Rawamangun',
      address: 'Jl. Balai Pustaka Timur, Rawamangun, Pulo Gadung, Jakarta Timur',
      lat: -6.1972,
      lng: 106.8856,
      tradeCategories: ['Kuliner', 'Minuman', 'Aksesori'],
      facilities: ['Listrik', 'Air Bersih', 'Toilet', 'Area Teduh'],
    },
    {
      id: 'site-jkt-2',
      name: 'Sentra Binaan JT 18 Kanal Banjir Timur',
      address: 'Jl. Kolonel Sugiono, Duren Sawit, Jakarta Timur',
      lat: -6.2314,
      lng: 106.9125,
      tradeCategories: ['Kuliner', 'Jajanan', 'Pakaian'],
      facilities: ['Listrik', 'Lampu Penerangan', 'Parkir', 'Kebersihan'],
    },
  ],
};

const MOCK_AUDIT_FEED: PublicAuditFeedItemDto[] = [
  {
    id: 'pub-hs-smg-1',
    reportCode: 'PTR-202611-SMG01',
    city: 'Kota Semarang',
    address: 'Jl. Pandanaran Trotoar Utara (Simpang Lima)',
    status: 'PENDING_VALIDATION',
    detectedAt: hoursAgoIso(1.4),
    actionSubmittedAt: hoursAgoIso(0.8),
    validatedAt: null,
    responseSlaMinutes: 36,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-jkt-1',
    reportCode: 'PTR-202611-JKT01',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. M.H. Thamrin Trotoar Barat (Simpang Sarinah)',
    status: 'PENDING_VALIDATION',
    detectedAt: hoursAgoIso(2.2),
    actionSubmittedAt: hoursAgoIso(1.5),
    validatedAt: null,
    responseSlaMinutes: 42,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-smg-2',
    reportCode: 'PTR-202611-SMG02',
    city: 'Kota Semarang',
    address: 'Jl. Pemuda Simpang Tugumuda',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(13),
    actionSubmittedAt: hoursAgoIso(12),
    validatedAt: hoursAgoIso(11),
    responseSlaMinutes: 60,
    relocationSiteName: null,
  },
  {
    id: 'pub-hs-jkt-2',
    reportCode: 'PTR-202611-JKT02',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. Pasar Baru Selatan Trotoar Pintu Air',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(17),
    actionSubmittedAt: hoursAgoIso(16),
    validatedAt: hoursAgoIso(14),
    responseSlaMinutes: 60,
    relocationSiteName: 'Lokbin JP 25 Pasar Baru',
  },
  {
    id: 'pub-hs-smg-3',
    reportCode: 'PTR-202611-SMG03',
    city: 'Kota Semarang',
    address: 'Jl. Pahlawan Taman Indonesia Kaya',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(37),
    actionSubmittedAt: hoursAgoIso(36),
    validatedAt: hoursAgoIso(34),
    responseSlaMinutes: 60,
    relocationSiteName: 'Selter PKL Taman Menteri Supeno (Taman KB)',
  },
  {
    id: 'pub-hs-jkt-3',
    reportCode: 'PTR-202611-JKT03',
    city: 'Kota Jakarta Pusat',
    address: 'Jl. Kebon Sirih Barat (Depan Halte)',
    status: 'VALIDATED',
    detectedAt: hoursAgoIso(43),
    actionSubmittedAt: hoursAgoIso(42),
    validatedAt: hoursAgoIso(40),
    responseSlaMinutes: 60,
    relocationSiteName: 'JP 42 Kuliner Sabang Binaan',
  },
];

function findMockCity(cityParam?: string): PublicCityItem | null {
  const norm = normalizeCityParam(cityParam);
  if (!norm) return null;
  const lower = norm.toLowerCase();
  return (
    MOCK_PUBLIC_CITIES.find(
      (c) => c.city.toLowerCase() === lower || c.code.toLowerCase() === lower,
    ) ?? null
  );
}

// ============================================================================
// PUBLIC API CLIENT
// ============================================================================

export const publicApi = {
  async listCities(): Promise<PublicCityItem[]> {
    if (!IS_BACKEND_ENABLED) {
      return MOCK_PUBLIC_CITIES;
    }
    const res = await apiFetch<{ cities: PublicCityItem[] }>('/api/public/cities', {
      skipAuth: true,
    });
    return res.data.cities;
  },

  async getOverview(city?: string): Promise<PublicOverviewData> {
    const normalized = normalizeCityParam(city);
    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      const items = matched
        ? MOCK_AUDIT_FEED.filter((item) => item.city === matched.city)
        : MOCK_AUDIT_FEED;

      const totalViolationsThisMonth = items.length;
      const validated = items.filter((i) => i.status === 'VALIDATED');
      const resolutionRatePercent =
        items.length === 0
          ? 0
          : Math.round((validated.length / items.length) * 1000) / 10;

      const slas = items
        .map((i) => i.responseSlaMinutes)
        .filter((v): v is number => v !== null);
      const avgResponseSlaMinutes =
        slas.length === 0
          ? null
          : Math.round(slas.reduce((acc, v) => acc + v, 0) / slas.length);

      const relocatedCount = validated.filter((i) => i.relocationSiteName).length * 2 + 1;

      return {
        city: matched ? matched.city : 'Semua Kota',
        kpi: {
          totalViolationsThisMonth,
          resolutionRatePercent,
          avgResponseSlaMinutes,
          totalPklDirectedToRelocation: validated.length === 0 ? 0 : relocatedCount,
        },
      };
    }

    const suffix = normalized ? `?city=${encodeURIComponent(normalized)}` : '';
    const res = await apiFetch<PublicOverviewData>(`/api/public/overview${suffix}`, {
      skipAuth: true,
    });
    return res.data;
  },

  async getMap(city?: string): Promise<PublicMapData> {
    const normalized = normalizeCityParam(city);
    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      if (matched) {
        return {
          region: {
            city: matched.city,
            centerLat: matched.centerLat,
            centerLng: matched.centerLng,
            defaultZoom: matched.defaultZoom,
          },
          zones: MOCK_ZONES_BY_CITY[matched.city] ?? [],
          hotspots: MOCK_HOTSPOTS_BY_CITY[matched.city] ?? [],
          relocationSites: MOCK_SITES_BY_CITY[matched.city] ?? [],
        };
      }

      return {
        region: {
          city: 'Semua Kota',
          centerLat: -6.75,
          centerLng: 108.6,
          defaultZoom: 7,
        },
        zones: Object.values(MOCK_ZONES_BY_CITY).flat(),
        hotspots: Object.values(MOCK_HOTSPOTS_BY_CITY).flat(),
        relocationSites: Object.values(MOCK_SITES_BY_CITY).flat(),
      };
    }

    const suffix = normalized ? `?city=${encodeURIComponent(normalized)}` : '';
    const res = await apiFetch<PublicMapData>(`/api/public/map${suffix}`, {
      skipAuth: true,
    });
    return res.data;
  },

  async getAuditFeed(params?: {
    city?: string;
    limit?: number;
  }): Promise<{
    items: PublicAuditFeedItemDto[];
    meta: { city: string; limit: number; total: number };
  }> {
    const normalized = normalizeCityParam(params?.city);
    const limit = params?.limit ?? 20;

    if (!IS_BACKEND_ENABLED) {
      const matched = findMockCity(normalized);
      const filtered = matched
        ? MOCK_AUDIT_FEED.filter((item) => item.city === matched.city)
        : MOCK_AUDIT_FEED;
      const items = filtered.slice(0, limit);
      return {
        items,
        meta: {
          city: matched ? matched.city : 'Semua Kota',
          limit,
          total: items.length,
        },
      };
    }

    const qs = new URLSearchParams();
    if (normalized) qs.set('city', normalized);
    qs.set('limit', String(limit));

    const res = await apiFetch<
      { items: PublicAuditFeedItemDto[] },
      { city: string; limit: number; total: number }
    >(`/api/public/audit-feed?${qs.toString()}`, { skipAuth: true });

    return {
      items: res.data.items,
      meta: res.meta ?? {
        city: normalized ?? 'Semua Kota',
        limit,
        total: res.data.items.length,
      },
    };
  },
};
