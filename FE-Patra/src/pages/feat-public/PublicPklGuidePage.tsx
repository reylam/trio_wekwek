import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileCheck2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RELOCATION_STEPS = [
  {
    step: '01',
    title: 'Pendataan Lapangan atau Pengajuan ke Dinas UMKM',
    description:
      'Pedagang dapat mendaftar saat sosialisasi persuasif Satpol PP di lapangan, atau mengajukan langsung ke Dinas Koperasi & UMKM / Sudin PPKUKM setempat.',
  },
  {
    step: '02',
    title: 'Pencocokan Kategori Usaha & Zona Hijau Terdekat',
    description:
      'Petugas Dinas UMKM mencocokkan jenis dagangan (kuliner, minuman, kerajinan, pakaian) dengan Lokasi Binaan terdekat yang memiliki fasilitas sesuai.',
  },
  {
    step: '03',
    title: 'Penempatan Resmi & Pembinaan Usaha',
    description:
      'Pedagang menerima arahan lokasi binaan beserta akses fasilitas (listrik, air bersih, area teduh) dan dapat berjualan secara legal tanpa khawatir penertiban.',
  },
] as const;

const CHECKLIST_ITEMS = [
  {
    id: 'ktp',
    label: 'Kartu Tanda Penduduk (KTP) aktif',
    detail: 'Digunakan untuk pencatatan identitas pelaku usaha mikro di wilayah kota.',
  },
  {
    id: 'nib',
    label: 'Nomor Induk Berusaha (NIB) atau Surat Keterangan Usaha',
    detail: 'Dapat dibuat gratis secara daring melalui OSS (oss.go.id) atau dibantu petugas Dinas UMKM.',
  },
  {
    id: 'kategori',
    label: 'Kesesuaian jenis dagangan dengan Zona Hijau tujuan',
    detail: 'Pastikan kategori usaha (misalnya kuliner, minuman, fashion) sesuai daftar di halaman Zona Hijau.',
  },
  {
    id: 'kebersihan',
    label: 'Komitmen kebersihan lapak & ketertiban jam operasional',
    detail: 'Menjaga saluran air, pengelolaan sampah mandiri, dan tidak menutup akses pejalan kaki.',
  },
] as const;

const FAQ_ITEMS = [
  {
    question: 'Apakah pendaftaran ke Zona Hijau (Lokasi Binaan) dipungut biaya?',
    answer:
      'Pendaftaran dan pendampingan relokasi melalui Dinas UMKM setempat tidak dipungut pungutan liar. Jika ada retribusi kebersihan atau utilitas (listrik/air), seluruhnya mengikuti Perda resmi daerah masing-masing dengan bukti setor resmi.',
  },
  {
    question: 'Mengapa tidak boleh berjualan di atas trotoar utama?',
    answer:
      'Trotoar merupakan fasilitas umum prioritas pejalan kaki, penyandang disabilitas, serta jalur evakuasi. Penataan dilakukan agar pejalan kaki aman dan pedagang tetap mendapat tempat berjualan yang layak di Zona Hijau.',
  },
  {
    question: 'Apakah foto atau identitas pedagang ditampilkan ke publik di PATRA?',
    answer:
      'Tidak. Portal publik PATRA tidak pernah menampilkan rekaman CCTV, foto mentah warga, maupun data pribadi pedagang. Publik hanya melihat angka statistik agregat dan peta Lokasi Binaan resmi.',
  },
  {
    question: 'Bagaimana cara melihat Zona Hijau terdekat dari lokasi saya?',
    answer:
      'Buka halaman Zona Hijau, pilih kota atau kabupaten Anda, lalu saring berdasarkan kategori dagangan atau fasilitas. Setiap lokasi dilengkapi tombol Rute yang terhubung langsung ke Google Maps.',
  },
] as const;

export default function PublicPklGuidePage() {
  const [checkedIds, setCheckedIds] = useState<string[]>(['ktp']);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const readinessPercent = Math.round(
    (checkedIds.length / CHECKLIST_ITEMS.length) * 100,
  );

  return (
    <>
      {/* Header */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            Informasi Pedagang & Warga
          </p>
          <h1 className="mt-1.5 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Panduan Relokasi & Berdagang Tertib di Zona Hijau
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            Penataan ruang publik di PATRA mengutamakan pendekatan persuasif dan
            pemberdayaan. Pelajari alur penempatan ke Lokasi Binaan resmi,
            persiapan berkas, dan hak pedagang mikro.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-7 sm:px-6 lg:px-8">
        {/* 3-Step Relocation Process */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-[#FAFBFD] px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-950">
              Alur Penempatan ke Lokasi Binaan Resmi
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Kolaborasi Satpol PP dan Dinas UMKM untuk solusi jangka panjang
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
            {RELOCATION_STEPS.map((item) => (
              <div key={item.step} className="p-5">
                <span className="font-mono text-xs font-bold text-primary">
                  TAHAP {item.step}
                </span>
                <h3 className="mt-2 text-sm font-bold text-slate-950">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Checklist + Rights & Obligations */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Interactive Readiness Checklist */}
          <div
            data-tour="public-pkl-checklist"
            className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-bold text-slate-950">
                    Daftar Periksa Persiapan Pedagang
                  </h2>
                  <p className="text-xs text-slate-500">
                    Centang poin yang sudah Anda siapkan sebelum mengajukan
                    relokasi
                  </p>
                </div>
              </div>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                {readinessPercent}% siap
              </span>
            </div>

            <div className="h-1 w-full bg-slate-100" aria-hidden="true">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${readinessPercent}%` }}
              />
            </div>

            <div className="divide-y divide-slate-100">
              {CHECKLIST_ITEMS.map((item) => {
                const checked = checkedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleCheck(item.id)}
                    aria-pressed={checked}
                    className="flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors hover:bg-slate-50/80"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        checked
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block text-xs font-bold',
                          checked
                            ? 'text-slate-500 line-through'
                            : 'text-slate-900',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                        {item.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rights & CTA Column */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                <h2 className="text-sm font-bold text-slate-950">
                  Prinsip Penataan Humanis
                </h2>
              </div>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
                <li className="flex gap-2">
                  <span className="font-mono font-semibold text-primary">01.</span>
                  <span>
                    Mengedepankan edukasi, teguran simpatik, dan pendampingan
                    pindah sebelum tindakan administratif.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono font-semibold text-primary">02.</span>
                  <span>
                    Setiap tindakan lapangan diverifikasi silang oleh Dinas UMKM
                    agar tetap proporsional dan akuntabel.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono font-semibold text-primary">03.</span>
                  <span>
                    Melindungi martabat dan privasi warga dengan tidak
                    mempublikasikan foto mentah ke publik.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-center gap-2 text-emerald-800">
                <MapPin className="h-4 w-4" />
                <h3 className="text-sm font-bold">
                  Cek Lokasi Binaan di Kota Anda
                </h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/80">
                Lihat 36 titik Zona Hijau resmi di 17 kota beserta daftar
                fasilitas listrik, air bersih, dan rute Google Maps.
              </p>
              <Link
                to="/zona-hijau"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
              >
                <span>Buka Direktori Zona Hijau</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ Accordion */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-[#FAFBFD] px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-950">
              Pertanyaan yang Sering Diajukan
            </h2>
          </div>

          <div className="divide-y divide-slate-100">
            {FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
                  >
                    <span className="text-xs font-bold text-slate-900 sm:text-sm">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                        isOpen && 'rotate-180 text-primary',
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs leading-relaxed text-slate-600">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
