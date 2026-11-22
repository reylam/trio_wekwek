import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  HeartHandshake,
  Loader2,
  MapPin,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { reportApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import { useToast } from '@/components/ui/Toast';
import { compressImageToJpeg } from '@/lib/imageCompress';
import { ApiError } from '@/lib/apiClient';
import {
  AUDIT_ACTION_LABELS,
  ENFORCEMENT_ACTION_LABELS,
  formatSlaDuration,
  formatWibDateTime,
  REPORT_STATUS_META,
} from '@/lib/formatters';
import type { EnforcementActionType } from '@/types';
import { cn } from '@/lib/utils';

const ACTION_OPTIONS: Array<{ value: EnforcementActionType; label: string; hint: string }> = [
  {
    value: 'EDUCATION_WARNING',
    label: 'Edukasi & Himbauan',
    hint: 'Pendekatan persuasif dan himbauan pemindahan mandiri.',
  },
  {
    value: 'RELOCATION_ASSISTANCE',
    label: 'Pendampingan Relokasi',
    hint: 'Mengarahkan pedagang menuju Lokasi Binaan resmi terdekat.',
  },
  {
    value: 'ADMINISTRATIVE_ACTION',
    label: 'Penertiban Administratif',
    hint: 'Pencatatan surat teguran/administrasi sesuai Perda.',
  },
];

export default function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string | null>(null);
  const [actionType, setActionType] = useState<EnforcementActionType>('EDUCATION_WARNING');
  const [actualPklCount, setActualPklCount] = useState<string>('1');
  const [educationNotes, setEducationNotes] = useState('');
  const [relocationRequested, setRelocationRequested] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const reportQuery = useQuery({
    queryKey: ['reports', 'detail', reportId],
    queryFn: () => reportApi.getById(reportId!),
    enabled: Boolean(reportId),
  });

  const report = reportQuery.data;

  // Prefill form dari data laporan
  useEffect(() => {
    if (!report) return;
    setActualPklCount(String(report.actualPklCount ?? report.detectedCount));
    if (report.actionType) setActionType(report.actionType);
    if (report.educationNotes) setEducationNotes(report.educationNotes);
    setRelocationRequested(report.relocationRequested);
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (afterPreviewUrl) URL.revokeObjectURL(afterPreviewUrl);
    };
  }, [afterPreviewUrl]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!reportId || !afterFile) {
        throw new Error('Foto bukti After wajib diunggah.');
      }
      const parsedCount = Number.parseInt(actualPklCount, 10);
      return reportApi.submitAction(
        reportId,
        {
          actionType,
          actualPklCount: Number.isNaN(parsedCount) ? 0 : Math.max(0, parsedCount),
          educationNotes: educationNotes.trim(),
          relocationRequested,
        },
        afterFile,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['reports', 'detail', reportId], updated);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['cctv'] });
      setFormError(null);
      setAfterFile(null);
      pushToast({
        variant: 'success',
        title: 'Hasil penindakan berhasil dikirim',
        description: 'Laporan kini menunggu validasi dari Dinas UMKM / Suku Dinas.',
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(err.message);
        void reportQuery.refetch();
      } else {
        setFormError(
          err instanceof Error
            ? err.message
            : 'Gagal mengunggah hasil penindakan. Input Anda tetap tersimpan — coba kirim lagi.',
        );
      }
    },
  });

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (!raw) return;
    setFormError(null);
    setIsCompressing(true);
    try {
      const compressed = await compressImageToJpeg(raw, {
        maxBytes: 1.5 * 1024 * 1024,
        filename: `after-${report?.reportCode ?? Date.now()}.jpg`,
      });
      if (compressed.size > 4 * 1024 * 1024) {
        setFormError('Ukuran foto setelah kompresi masih melebihi 4 MB.');
        return;
      }
      if (afterPreviewUrl) URL.revokeObjectURL(afterPreviewUrl);
      setAfterFile(compressed);
      setAfterPreviewUrl(URL.createObjectURL(compressed));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal memproses foto.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!afterFile) {
      setFormError('Mohon ambil atau pilih Foto Bukti After terlebih dahulu.');
      return;
    }
    if (educationNotes.trim().length < 5) {
      setFormError('Catatan edukasi/lapangan wajib diisi minimal 5 karakter.');
      return;
    }

    submitMutation.mutate();
  };

  const canSubmitAction =
    report?.status === 'NEED_ACTION' || report?.status === 'NEEDS_REVISION';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
      <SatpolTopHeader
        leftSlot={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/satpol/laporan')}
              className="inline-flex items-center gap-2 rounded-full bg-[#DCE8F8] px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Laporan</span>
            </button>
            {report && (
              <div>
                <h1 className="font-mono text-lg font-extrabold text-primary sm:text-xl">
                  {report.reportCode}
                </h1>
                <p className="text-xs text-slate-500">
                  {report.cameraName ?? report.cameraId}
                </p>
              </div>
            )}
          </div>
        }
      />

      {reportQuery.isLoading && (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {reportQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {reportQuery.error instanceof Error
            ? reportQuery.error.message
            : 'Laporan tidak ditemukan.'}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Revision Banner (FEAT-SPP-04) */}
          {report.status === 'NEEDS_REVISION' && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold">Laporan Memerlukan Revisi dari Dinas UMKM</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {report.revisionReason ??
                    'Mohon perbaiki dokumentasi foto After dan catatan edukasi sesuai standar verifikasi.'}
                </p>
              </div>
            </div>
          )}

          {/* Top Grid: Evidence Before & Relocation Assistant Card */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Before Photo + Metadata + Form */}
            <div className="space-y-6 lg:col-span-7">
              <section className="overflow-hidden rounded-2xl border border-accent/50 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-bold text-primary">
                      Bukti Foto Before (Tangkapan CCTV)
                    </h2>
                    <p className="font-mono text-[11px] text-slate-500">
                      {formatWibDateTime(report.createdAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      REPORT_STATUS_META[report.status].badgeClass,
                    )}
                  >
                    {REPORT_STATUS_META[report.status].label}
                  </span>
                </div>

                {/* STRICT: NO face blur on internal government view */}
                <div className="aspect-video w-full bg-video-frame">
                  <img
                    src={report.beforeImageUrl}
                    alt={`Bukti Before ${report.reportCode}`}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 p-5 text-xs sm:grid-cols-2">
                  <div>
                    <p className="font-semibold text-slate-400">Lokasi Kejadian</p>
                    <p className="mt-1 flex items-start gap-1.5 font-semibold text-slate-800">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{report.address}</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-400">Ringkasan Deteksi</p>
                    <p className="font-semibold text-slate-800">
                      {report.detectedCount} PKL terdeteksi • Confidence{' '}
                      {Math.round(report.maxConfidence * 100)}%
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
                      {report.isSimulationMode ? ' • Mode Simulasi' : ''}
                    </p>
                  </div>
                </div>
              </section>

              {/* Form Upload Hasil Akhir Penertiban (Wajib Mobile-Responsive 360px+) */}
              {canSubmitAction ? (
                <section className="rounded-2xl border border-primary/25 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Upload className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-bold text-primary">
                      Form Upload Hasil Akhir Penertiban (Foto After)
                    </h2>
                  </div>

                  {formError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                      {formError}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    {/* Mobile-Friendly Camera / File Upload */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        Foto Bukti After (Kondisi Trotoar Setelah Penertiban) *
                      </label>
                      <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-canvas/70 px-4 py-6 text-center transition hover:border-primary hover:bg-[#E9F1FD]">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => void handleFileChange(e)}
                          className="sr-only"
                        />
                        {isCompressing ? (
                          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Mengompresi foto...</span>
                          </div>
                        ) : afterPreviewUrl ? (
                          <div className="w-full space-y-2">
                            <img
                              src={afterPreviewUrl}
                              alt="Preview Foto After"
                              className="mx-auto max-h-52 rounded-xl object-cover shadow-sm"
                            />
                            <p className="text-[11px] font-semibold text-primary">
                              Ketuk untuk mengganti foto ({Math.round((afterFile?.size ?? 0) / 1024)} KB)
                            </p>
                          </div>
                        ) : (
                          <>
                            <Camera className="h-7 w-7 text-primary" />
                            <span className="mt-2 text-xs font-bold text-primary">
                              Ambil Foto dari Kamera / Pilih Galeri
                            </span>
                            <span className="mt-1 text-[11px] text-slate-500">
                              Otomatis dikompresi ≤ 1,5 MB (JPEG)
                            </span>
                          </>
                        )}
                      </label>
                    </div>

                    {/* Jenis Tindakan */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        Jenis Tindakan Lapangan *
                      </label>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {ACTION_OPTIONS.map((opt) => {
                          const selected = actionType === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setActionType(opt.value)}
                              className={cn(
                                'rounded-xl border p-3 text-left transition',
                                selected
                                  ? 'border-primary bg-[#E9F1FD] ring-1 ring-primary'
                                  : 'border-slate-200 bg-white hover:border-accent',
                              )}
                            >
                              <p className="text-xs font-bold text-primary">{opt.label}</p>
                              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                                {opt.hint}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Estimasi Jumlah PKL Aktual */}
                    <div>
                      <label
                        htmlFor="actualPklCount"
                        className="block text-xs font-bold text-slate-700"
                      >
                        Estimasi Jumlah PKL Aktual di Lapangan *
                      </label>
                      <input
                        id="actualPklCount"
                        type="number"
                        min={0}
                        max={200}
                        value={actualPklCount}
                        onChange={(e) => setActualPklCount(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:border-primary focus:outline-none sm:w-44"
                      />
                    </div>

                    {/* Catatan Edukasi */}
                    <div>
                      <label
                        htmlFor="educationNotes"
                        className="block text-xs font-bold text-slate-700"
                      >
                        Catatan Edukasi &amp; Kondisi Lapangan *
                      </label>
                      <textarea
                        id="educationNotes"
                        rows={3}
                        value={educationNotes}
                        onChange={(e) => setEducationNotes(e.target.value)}
                        placeholder="Tuliskan hasil komunikasi persuasif dengan pedagang dan kondisi akhir trotoar..."
                        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Checkbox Pengajuan Relokasi ke Dinas UMKM */}
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-accent bg-canvas p-3.5">
                      <input
                        type="checkbox"
                        checked={relocationRequested}
                        onChange={(e) => setRelocationRequested(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-semibold leading-snug text-primary">
                        PKL bersedia diarahkan ke Lokasi Binaan terdekat (Teruskan ke Dinas UMKM)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={submitMutation.isPending || isCompressing}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Mengirim Hasil Penindakan...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            {report.status === 'NEEDS_REVISION'
                              ? 'Kirim Ulang Revisi Penindakan'
                              : 'Kirim Hasil Penindakan'}
                          </span>
                        </>
                      )}
                    </button>
                  </form>
                </section>
              ) : (
                /* Read-Only After Summary when PENDING_VALIDATION / VALIDATED */
                <section className="rounded-2xl border border-accent/50 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-bold text-primary">
                      Hasil Penindakan Satpol PP (Foto After)
                    </h2>
                    <span className="font-mono text-[11px] font-semibold text-primary">
                      SLA: {formatSlaDuration(report.createdAt, report.actionSubmittedAt)}
                    </span>
                  </div>
                  {report.afterImageUrl && (
                    <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
                      <img
                        src={report.afterImageUrl}
                        alt={`Bukti After ${report.reportCode}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="mt-4 space-y-2 text-xs text-slate-700">
                    <p>
                      <strong>Jenis Tindakan:</strong>{' '}
                      {report.actionType
                        ? ENFORCEMENT_ACTION_LABELS[report.actionType]
                        : '-'}
                    </p>
                    <p>
                      <strong>Jumlah PKL Aktual:</strong> {report.actualPklCount ?? '-'}
                    </p>
                    <p>
                      <strong>Catatan Edukasi:</strong> {report.educationNotes ?? '-'}
                    </p>
                    {report.relocationSiteName && (
                      <p className="rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
                        Arahan Relokasi Ditetapkan: {report.relocationSiteName}
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column: Kartu Asisten Edukasi & Relokasi (TANPA KUOTA) + Immutable AuditLog */}
            <div className="space-y-6 lg:col-span-5">
              <section className="rounded-2xl border border-accent/60 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <HeartHandshake className="h-5 w-5" />
                  <h2 className="text-sm font-bold">Kartu Asisten Edukasi &amp; Relokasi</h2>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Sampaikan edukasi secara humanis dan tawarkan pilihan Lokasi Binaan resmi
                  terdekat berikut kepada pedagang:
                </p>

                <div className="mt-3 rounded-xl bg-canvas p-3 text-[11px] leading-relaxed text-primary">
                  <p className="font-bold">Panduan Edukasi Persuasif:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                    <li>Jelaskan hak pejalan kaki atas trotoar dengan bahasa yang santun.</li>
                    <li>Tunjukkan lokasi binaan terdekat &amp; fasilitas yang tersedia.</li>
                    <li>Jika bersedia, centang opsi pengajuan relokasi untuk Dinas UMKM.</li>
                  </ul>
                </div>

                <div className="mt-4 space-y-2.5">
                  <p className="text-xs font-bold text-slate-700">
                    Lokasi Binaan Resmi Terdekat ({report.nearestRelocationSites.length})
                  </p>
                  {report.nearestRelocationSites.length === 0 ? (
                    <p className="rounded-xl border border-slate-100 bg-canvas p-3 text-xs text-slate-500">
                      Belum ada data Lokasi Binaan terdaftar di kota ini.
                    </p>
                  ) : (
                    report.nearestRelocationSites.map((site) => (
                      <div
                        key={site.id}
                        className="rounded-xl border border-accent/50 bg-[#F7FAFF] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-bold text-primary">{site.name}</h3>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                            <Compass className="h-3 w-3" />
                            {site.distanceLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{site.address}</p>
                        {/* STRICT OUT-OF-SCOPE: HANYA kategori & fasilitas, DILARANG kuota */}
                        {site.facilities.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {site.facilities.map((fac) => (
                              <span
                                key={fac}
                                className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-accent/50"
                              >
                                {fac}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Immutable AuditLog Timeline (SDG 16) */}
              <section className="rounded-2xl border border-accent/50 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    <h2 className="text-sm font-bold">Audit Log Permanen (SDG 16)</h2>
                  </div>
                  <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                    Append-Only
                  </span>
                </div>

                <ol className="mt-4 space-y-4 border-l-2 border-accent/70 pl-4">
                  {report.auditLogs.map((log) => (
                    <li key={log.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />
                      <p className="text-xs font-bold text-slate-800">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{formatWibDateTime(log.createdAt)}</span>
                        <span>•</span>
                        <span className="font-sans font-semibold text-primary/80">
                          {log.actorName}
                        </span>
                      </p>
                      {log.note && (
                        <p className="mt-1 rounded-lg bg-canvas px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
                          {log.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
