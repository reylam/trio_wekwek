import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  EyeOff,
  Loader2,
  MapPin,
  Shield,
} from 'lucide-react';
import { publicApi } from '@/services/publicApi';

const PRIVACY_MATRIX = [
  {
    item: 'Lokasi Zona Hijau (Selter Binaan Resmi)',
    publicAccess: 'Terbuka',
    detail: 'Nama selter, alamat, kategori dagangan, fasilitas, dan titik peta.',
    isPublic: true,
  },
  {
    item: 'Ringkasan KPI Agregat per Kota',
    publicAccess: 'Terbuka',
    detail: 'Total bulanan, persentase penyelesaian valid, rata-rata SLA, dan jumlah arahan relokasi.',
    isPublic: true,
  },
  {
    item: 'Stream CCTV & Koordinat Kamera Pemda',
    publicAccess: 'Internal Terkunci Wilayah',
    detail: 'Hanya dapat diakses petugas Satpol PP resmi sesuai wilayah tugasnya.',
    isPublic: false,
  },
  {
    item: 'Foto Bukti Lapangan (Before / After) & Catatan Kasus',
    publicAccess: 'Internal Lintas Instansi',
    detail: 'Hanya digunakan untuk verifikasi antara Satpol PP dan Dinas UMKM, tidak dipublikasikan.',
    isPublic: false,
  },
] as const;

export default function PublicAboutPage() {
  const citiesQuery = useQuery({
    queryKey: ['public', 'cities'],
    queryFn: () => publicApi.listCities(),
    staleTime: 10 * 60_000,
  });

  const cities = citiesQuery.data ?? [];

  return (
    <>
      {/* Header */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            Tentang Sistem & Tata Kelola Data
          </p>
          <h1 className="mt-1.5 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Mengenal PATRA & Standar Privasi Publik
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            PATRA (Pantauan Transparan Ruang Publik) dirancang untuk
            menjembatani ketertiban trotoar dan pemberdayaan ekonomi mikro secara
            terukur, terverifikasi lintas instansi, dan menghormati privasi
            warga.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-7 sm:px-6 lg:px-8">
        {/* Dual-Agency Architecture */}
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-[#EEF4FD] text-primary">
                <Shield className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Peran Satpol PP Daerah
                </h2>
                <p className="text-xs text-slate-500">
                  Pemantauan & penindakan persuasif berbasis wilayah
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              Satpol PP memantau koridor trotoar menggunakan CCTV kota secara
              terkunci per wilayah (region-locked), melaksanakan edukasi
              lapangan secara humanis, mengunggah bukti penataan, dan mengajukan
              kebutuhan relokasi pedagang ke Dinas UMKM.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Peran Dinas UMKM / Sudin PPKUKM
                </h2>
                <p className="text-xs text-slate-500">
                  Verifikasi silang & pengelolaan Zona Hijau Binaan
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              Dinas UMKM memverifikasi bukti penanganan lapangan untuk mencegah
              laporan sepihak, menerbitkan Berita Acara penataan, mengelola
              direktori Zona Hijau (Lokasi Binaan resmi), serta menganalisis
              kebutuhan selter baru berdasarkan tren kota.
            </p>
          </div>
        </section>

        {/* Data Privacy Matrix */}
        <section
          data-tour="public-privacy-matrix"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 bg-[#FAFBFD] px-5 py-4">
            <h2 className="text-sm font-bold text-slate-950">
              Batasan Keterbukaan & Privasi Data Publik
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Keseimbangan antara akuntabilitas kinerja pemerintah (SDG 16) dan
              perlindungan data pribadi warga
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {PRIVACY_MATRIX.map((row) => (
              <div
                key={row.item}
                className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{row.item}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{row.detail}</p>
                </div>
                <span
                  className={
                    row.isPublic
                      ? 'inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 sm:self-center'
                      : 'inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 sm:self-center'
                  }
                >
                  {row.isPublic ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {row.publicAccess}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Active Coverage Cities */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#FAFBFD] px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-950">
                Cakupan Wilayah Terdaftar ({cities.length} Kota / Kabupaten)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Pilih kota untuk langsung membuka daftar Zona Hijau di wilayah
                tersebut
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <span>Masuk Portal Petugas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {citiesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Memuat daftar wilayah...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((c) => (
                <Link
                  key={c.id}
                  to={`/zona-hijau?city=${encodeURIComponent(c.city)}`}
                  className="group flex items-center justify-between gap-3 bg-white px-5 py-3.5 transition-colors hover:bg-[#F2F6FD]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 group-hover:text-primary">
                        {c.city}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {c.province}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
