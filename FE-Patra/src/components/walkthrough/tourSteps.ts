export type TourId = 'public' | 'satpol' | 'satpol-live' | 'dinas';

export type PopoverPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface WalkthroughStep {
  id: string;
  /** Selector `data-tour="..."` pada elemen target */
  target: string;
  /** Rute yang otomatis dibuka sebelum menyorot target (opsional) */
  route?: string;
  /** Label kategori ringkas monospace di pojok atas kartu */
  category: string;
  title: string;
  description: string;
  placement?: PopoverPlacement;
  /** Padding ekstra sekitar spotlight cutout (px) */
  padding?: number;
}

export interface TourDefinition {
  id: TourId;
  label: string;
  steps: WalkthroughStep[];
}

export const WALKTHROUGH_TOURS: Record<TourId, TourDefinition> = {
  public: {
    id: 'public',
    label: 'Tur Portal Publik',
    steps: [
      {
        id: 'pub-filter',
        target: 'public-city-filter',
        route: '/',
        category: 'WILAYAH',
        title: 'Filter Transparansi per Kabupaten / Kota',
        description:
          'Pilih wilayah tertentu atau tampilkan seluruh kota pilot untuk menyaring KPI, peta ruang publik, dan linimasa penanganan secara real-time.',
        placement: 'bottom',
        padding: 10,
      },
      {
        id: 'pub-demo',
        target: 'public-demo-panel',
        route: '/',
        category: 'AKSES CEPAT',
        title: 'Uji Portal Instansi 1-Klik',
        description:
          'Masuk langsung sebagai petugas Satpol PP atau Dinas UMKM untuk mencoba alur pemantauan CCTV AI, penindakan persuasif, hingga validasi relokasi.',
        placement: 'left',
        padding: 8,
      },
      {
        id: 'pub-kpi',
        target: 'public-kpi',
        route: '/',
        category: 'KPI PUBLIK',
        title: 'Ringkasan Kinerja & Privasi Terjaga',
        description:
          'Menampilkan volume insiden bulanan, persentase penyelesaian valid, SLA penanganan, dan PKL yang diarahkan ke Lokasi Binaan tanpa mengekspos foto mentah warga.',
        placement: 'bottom',
        padding: 10,
      },
      {
        id: 'pub-map',
        target: 'public-map',
        route: '/',
        category: 'PETA TERBUKA',
        title: 'Peta Transparansi Ruang Publik',
        description:
          'Nyalakan atau matikan layer Zona Larangan, Titik Penanganan, dan Lokasi Binaan resmi untuk melihat sebaran penataan koridor secara spasial.',
        placement: 'top',
        padding: 8,
      },
      {
        id: 'pub-feed',
        target: 'public-audit-feed',
        route: '/',
        category: 'AKUNTABILITAS',
        title: 'Linimasa Audit Lintas Instansi',
        description:
          'Setiap laporan tercatat terbuka dari tahap Deteksi, Penindakan Satpol PP, hingga Validasi Dinas UMKM agar akuntabilitas ruang publik dapat dipantau bersama.',
        placement: 'left',
        padding: 8,
      },
    ],
  },

  satpol: {
    id: 'satpol',
    label: 'Tur Portal Satpol PP',
    steps: [
      {
        id: 'sp-nav',
        target: 'satpol-nav',
        category: 'NAVIGASI INTI',
        title: '3 Modul Operasional Terkunci Wilayah',
        description:
          'Portal Satpol PP fokus pada 3 alur utama: pemantauan CCTV AI, peta zona terlarang, serta laporan penindakan yang otomatis terkunci pada kota tugas Anda.',
        placement: 'right',
        padding: 6,
      },
      {
        id: 'sp-toolbar',
        target: 'satpol-cctv-toolbar',
        route: '/satpol/cctv',
        category: 'CCTV MONITORING',
        title: 'Pencarian & Filter Kecamatan',
        description:
          'Temukan kamera CCTV publik berdasarkan nama ruas jalan atau filter kecamatan. Jumlah kamera aktif diperbarui dinamis sesuai wilayah hukum Anda.',
        placement: 'bottom',
        padding: 10,
      },
      {
        id: 'sp-grid',
        target: 'satpol-cctv-grid',
        route: '/satpol/cctv',
        category: 'LIVE THUMBNAIL',
        title: 'Pratinjau Kamera & Deteksi Pelanggaran',
        description:
          'Kartu kamera memuat pratinjau stream secara lazy-load. Klik kartu atau tombol Inspect untuk membuka pemantauan AI 1 FPS beserta editor ROI trotoar.',
        placement: 'top',
        padding: 8,
      },
      {
        id: 'sp-map',
        target: 'satpol-map-controls',
        route: '/satpol/peta',
        category: 'REGIONAL MAP',
        title: 'Peta Wilayah & Pengelolaan Zona Terlarang',
        description:
          'Cari ruas jalan, atur visibilitas layer CCTV, poligon zona larangan, dan pelanggaran aktif, atau gambar zona terlarang baru langsung di peta.',
        placement: 'bottom',
        padding: 8,
      },
      {
        id: 'sp-reports',
        target: 'satpol-reports-filters',
        route: '/satpol/laporan',
        category: 'REPORTS & ACTIONS',
        title: 'Antrean Penindakan & Bukti Lapangan',
        description:
          'Saring laporan yang perlu ditindak atau direvisi, lalu buka detail laporan untuk mengunggah foto After dan mengajukan relokasi ke Dinas UMKM.',
        placement: 'bottom',
        padding: 10,
      },
      {
        id: 'sp-bell',
        target: 'satpol-header-bell',
        category: 'NOTIFIKASI',
        title: 'Peringatan Cepat Laporan Aktif',
        description:
          'Ikon lonceng menandai laporan berstatus Perlu Ditindak atau Perlu Revisi di wilayah Anda sehingga petugas dapat langsung membuka detailnya dari halaman mana pun.',
        placement: 'bottom',
        padding: 8,
      },
    ],
  },

  'satpol-live': {
    id: 'satpol-live',
    label: 'Tur Inspeksi CCTV AI',
    steps: [
      {
        id: 'sl-player',
        target: 'satpol-live-player',
        category: 'AI VISION 1 FPS',
        title: 'Stream HLS Live, Deteksi PKL & ROI Trotoar',
        description:
          'Inferensi YOLO ONNX berjalan langsung di browser (WebGPU/WASM). Anda dapat menggambar poligon ROI trotoar kustom atau langsung merekam bukti pelanggaran.',
        placement: 'bottom',
        padding: 8,
      },
      {
        id: 'sl-telemetry',
        target: 'satpol-live-telemetry',
        category: 'TELEMETRI',
        title: 'Atribusi Sumber, Koordinat & Latensi AI',
        description:
          'Memantau sumber resmi CCTV Pemda, titik koordinat lokasi, runtime inferensi aktif, serta status apakah kamera memakai poligon ROI atau mode area penuh.',
        placement: 'top',
        padding: 8,
      },
      {
        id: 'sl-recommend',
        target: 'satpol-live-recommend',
        category: 'REKOMENDASI SEKOTA',
        title: 'Perpindahan Cepat ke Kamera Terdekat',
        description:
          'Menampilkan prioritas kamera lain di kota yang sama berdasarkan pelanggaran aktif, kesamaan kecamatan, dan jarak terdekat untuk patroli beruntun.',
        placement: 'top',
        padding: 8,
      },
    ],
  },

  dinas: {
    id: 'dinas',
    label: 'Tur Portal Dinas UMKM',
    steps: [
      {
        id: 'dn-nav',
        target: 'dinas-nav',
        category: 'NAVIGASI DINAS',
        title: '3 Modul Pengawasan & Pembinaan UMKM',
        description:
          'Kelola analitik penataan ruang, validasi laporan penindakan Satpol PP (lengkap dengan badge antrean), serta direktori Lokasi Binaan wilayah Anda.',
        placement: 'right',
        padding: 6,
      },
      {
        id: 'dn-kpi',
        target: 'dinas-kpi',
        route: '/dinas/dashboard',
        category: 'KPI STRATEGIS',
        title: '4 Indikator Kinerja Penataan Kota',
        description:
          'Ringkasan total laporan masuk, tingkat validasi lintas instansi, rata-rata SLA respons lapangan, serta jumlah arahan relokasi yang telah diterbitkan.',
        placement: 'bottom',
        padding: 10,
      },
      {
        id: 'dn-charts',
        target: 'dinas-charts',
        route: '/dinas/dashboard',
        category: 'ANALITIK TREN',
        title: 'Tren 30 Hari & Distribusi Jam Rawan (WIB)',
        description:
          'Identifikasi lonjakan harian dan jam puncak kemunculan PKL untuk menentukan jadwal patroli persuasif serta jam operasional lokasi binaan.',
        placement: 'top',
        padding: 8,
      },
      {
        id: 'dn-planning',
        target: 'dinas-planning-map',
        route: '/dinas/dashboard',
        category: 'EVALUASI SPASIAL',
        title: 'Top 5 Ruas Rawan & Peta Penataan Relokasi',
        description:
          'Bandingkan ruas jalan dengan kepadatan pelanggaran tertinggi terhadap sebaran Lokasi Binaan resmi untuk merencanakan kapasitas selter baru.',
        placement: 'top',
        padding: 8,
      },
      {
        id: 'dn-validation',
        target: 'dinas-validation-panel',
        route: '/dinas/validasi',
        category: 'VALIDASI LAPORAN',
        title: 'Antrean Verifikasi Before vs After',
        description:
          'Tinjau laporan masuk dan pengajuan relokasi, setujui atau minta revisi dengan alasan terstruktur, lalu terbitkan Berita Acara PDF 1 halaman.',
        placement: 'bottom',
        padding: 8,
      },
      {
        id: 'dn-sites',
        target: 'dinas-sites-map',
        route: '/dinas/lokasi-binaan',
        category: 'LOKASI BINAAN',
        title: 'Peta & Direktori Selter Resmi UMKM',
        description:
          'Tambahkan atau perbarui titik Lokasi Binaan menggunakan peta click-to-pin beserta fasilitas dan kategori dagangan yang didukung.',
        placement: 'bottom',
        padding: 8,
      },
      {
        id: 'dn-bell',
        target: 'dinas-header-bell',
        category: 'NOTIFIKASI',
        title: 'Antrean Validasi Real-Time',
        description:
          'Pantau laporan terbaru yang menunggu verifikasi Dinas UMKM langsung dari header tanpa perlu meninggalkan halaman kerja Anda.',
        placement: 'bottom',
        padding: 8,
      },
    ],
  },
};
