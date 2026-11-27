import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  FileDown,
  Loader2,
  MapPin,
  Maximize2,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { DinasTopHeader } from '@/components/layout/DinasLayout';
import PhotoLightboxModal from '@/components/ui/PhotoLightboxModal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import { validateRevisionReason } from '@/lib/dinasHelpers';
import {
  AUDIT_ACTION_LABELS,
  ENFORCEMENT_ACTION_LABELS,
  formatSlaDuration,
  formatWibDateTime,
  REPORT_STATUS_META,
} from '@/lib/formatters';
import { dinasReportApi } from '@/services/dinasApi';
import { cn } from '@/lib/utils';

export default function ValidationSplitPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [pdfActionLoading, setPdfActionLoading] = useState<'download' | 'inline' | null>(
    null,
  );
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(
    null,
  );

  const reportQuery = useQuery({
    queryKey: ['dinas', 'reports', 'detail', reportId],
    queryFn: () => dinasReportApi.getById(reportId!),
    enabled: Boolean(reportId),
  });

  const report = reportQuery.data;

  // Otomatis pilih lokasi binaan terdekat #1 saat opsi tersedia
  useEffect(() => {
    if (!report) return;
    if (!selectedSiteId && report.nearestRelocationSites.length > 0) {
      setSelectedSiteId(report.nearestRelocationSites[0].id);
    }
  }, [report, selectedSiteId]);

  const invalidateAllDinas = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dinas'] });
    await queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const approveMutation = useMutation({
    mutationFn: () => dinasReportApi.validate(reportId!, { decision: 'APPROVE' }),
    onSuccess: async (updated) => {
      await invalidateAllDinas();
      pushToast({
        variant: 'success',
        title: `Laporan ${updated.reportCode} Disetujui`,
        description: updated.relocationRequested
          ? 'Anda dapat langsung menetapkan arahan Lokasi Binaan dan mengunduh PDF.'
          : 'Berita Acara PDF 1 halaman kini siap diunduh.',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Validasi Gagal',
        description:
          err instanceof ApiError
            ? err.message
            : 'Terjadi kesalahan saat menyetujui laporan.',
      });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: (reason: string) =>
      dinasReportApi.validate(reportId!, {
        decision: 'REQUEST_REVISION',
        revisionReason: reason,
      }),
    onSuccess: async (updated) => {
      setRevisionModalOpen(false);
      setRevisionReason('');
      setRevisionError(null);
      await invalidateAllDinas();
      pushToast({
        variant: 'warning',
        title: `Permintaan Revisi Dikirim (${updated.reportCode})`,
        description: 'Laporan dikembalikan ke antrean Satpol PP untuk perbaikan bukti.',
      });
    },
    onError: (err) => {
      setRevisionError(
        err instanceof ApiError
          ? err.message
          : 'Gagal mengirim permintaan revisi ke server.',
      );
    },
  });

  const relocationMutation = useMutation({
    mutationFn: () =>
      dinasReportApi.assignRelocation(reportId!, {
        relocationSiteId: selectedSiteId,
      }),
    onSuccess: async (updated) => {
      await invalidateAllDinas();
      pushToast({
        variant: 'success',
        title: 'Arahan Relokasi Ditetapkan',
        description: `${updated.relocationSiteName ?? 'Lokasi binaan'} telah tercantum di Berita Acara ${updated.reportCode}.`,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: 'Gagal Menetapkan Relokasi',
        description:
          err instanceof ApiError
            ? err.message
            : 'Gagal menyimpan penetapan lokasi binaan.',
      });
    },
  });

  const handleRevisionSubmit = () => {
    const check = validateRevisionReason(revisionReason);
    if (!check.valid) {
      setRevisionError(check.error ?? 'Alasan revisi tidak valid.');
      return;
    }
    setRevisionError(null);
    revisionMutation.mutate(check.trimmed);
  };

  const handlePdfAction = async (inline: boolean) => {
    if (!report) return;
    setPdfActionLoading(inline ? 'inline' : 'download');
    try {
      const result = await dinasReportApi.downloadPdf(report.id, report.reportCode, {
        inline,
      });
      pushToast({
        variant: 'success',
        title: inline ? 'Pratinjau Berita Acara Dibuka' : 'Berita Acara Diunduh',
        description: result.filename,
      });
    } catch (err) {
      pushToast({
        variant: 'error',
        title: 'Gagal Memproses PDF',
        description:
          err instanceof ApiError
            ? err.message
            : 'Tidak dapat mengunduh dokumen Berita Acara.',
      });
    } finally {
      setPdfActionLoading(null);
    }
  };

  if (reportQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DinasTopHeader />
        <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-semibold text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Memuat berkas perbandingan Before-After...</span>
          </div>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DinasTopHeader />
        <div className="rounded-3xl border border-red-200 bg-white p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">
            Laporan Tidak Ditemukan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {(reportQuery.error as Error | null)?.message ??
              'Laporan mungkin tidak berada dalam cakupan wilayah Anda.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dinas/validasi')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Daftar Validasi</span>
          </button>
        </div>
      </div>
    );
  }

  const statusMeta = REPORT_STATUS_META[report.status];
  const isBusy =
    approveMutation.isPending ||
    revisionMutation.isPending ||
    relocationMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <DinasTopHeader
        leftSlot={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dinas/validasi')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
              aria-label="Kembali ke daftar validasi"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-extrabold text-primary sm:text-2xl">
                  {report.reportCode}
                </h1>
                <span
                  className={cn(
                    'rounded-full border px-3 py-0.5 text-xs font-bold',
                    statusMeta.badgeClass,
                  )}
                >
                  {statusMeta.label}
                </span>
                {report.isSimulationMode && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    Mode Simulasi
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span>{report.address}</span>
              </p>
            </div>
          </div>
        }
      />

      {/* Split-View Before vs After (NO Face Blur) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* BEFORE */}
        <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-red-50/60 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Bukti Awal (Before - CCTV AI)
              </h2>
            </div>
            <span className="font-mono text-[11px] font-semibold text-red-700">
              {formatWibDateTime(report.createdAt)}
            </span>
          </div>

          <div className="p-5">
            <button
              type="button"
              onClick={() =>
                setLightboxImage({
                  url: report.beforeImageUrl,
                  title: `Bukti Awal (Before) • ${report.reportCode}`,
                })
              }
              aria-label={`Perbesar Foto Before ${report.reportCode}`}
              className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-video-frame text-left focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <img
                src={report.beforeImageUrl}
                alt={`Foto Before ${report.reportCode}`}
                className="aspect-video w-full object-contain transition duration-200 group-hover:scale-[1.01]"
              />
              <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-slate-950/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition group-hover:bg-primary">
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Perbesar</span>
              </span>
            </button>

            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-xs">
              <div>
                <dt className="text-slate-400">Kamera / Sumber</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {report.cameraName ?? report.cameraId} ({report.source})
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Zona Terlarang</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {report.zoneName ?? 'Luar poligon zona khusus'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Jumlah PKL Terdeteksi</dt>
                <dd className="mt-0.5 font-mono font-bold text-red-700">
                  {report.detectedCount} gerobak/lapak
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Kepercayaan Model AI</dt>
                <dd className="mt-0.5 font-mono font-semibold text-slate-800">
                  {Math.round(report.maxConfidence * 100)}%
                </dd>
              </div>
            </dl>
          </div>
        </article>

        {/* AFTER */}
        <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/60 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Bukti Penindakan (After - Satpol PP)
              </h2>
            </div>
            <span className="font-mono text-[11px] font-semibold text-emerald-700">
              {formatWibDateTime(report.actionSubmittedAt)}
            </span>
          </div>

          <div className="p-5">
            {report.afterImageUrl ? (
              <button
                type="button"
                onClick={() =>
                  setLightboxImage({
                    url: report.afterImageUrl!,
                    title: `Bukti Penindakan (After) • ${report.reportCode}`,
                  })
                }
                aria-label={`Perbesar Foto After ${report.reportCode}`}
                className="group relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-video-frame text-left focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <img
                  src={report.afterImageUrl}
                  alt={`Foto After ${report.reportCode}`}
                  className="aspect-video w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                />
                <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-slate-950/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition group-hover:bg-primary">
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Perbesar</span>
                </span>
              </button>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-canvas text-xs font-medium text-slate-500">
                Foto bukti After belum dikirim oleh Satpol PP.
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-xs">
              <div>
                <dt className="text-slate-400">Jenis Tindakan</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {report.actionType
                    ? ENFORCEMENT_ACTION_LABELS[report.actionType]
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Durasi Respons SLA</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-mono font-bold text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {formatSlaDuration(report.createdAt, report.actionSubmittedAt)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Jumlah Aktual di Lapangan</dt>
                <dd className="mt-0.5 font-mono font-bold text-slate-900">
                  {report.actualPklCount ?? '-'} PKL
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Permintaan Relokasi</dt>
                <dd className="mt-0.5 font-semibold">
                  {report.relocationRequested ? (
                    <span className="text-primary">Ya, butuh Lokasi Binaan</span>
                  ) : (
                    <span className="text-slate-500">Tidak diajukan</span>
                  )}
                </dd>
              </div>
              <div className="col-span-2 border-t border-slate-200/70 pt-2.5">
                <dt className="text-slate-400">Catatan Edukasi Lapangan</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-700">
                  {report.educationNotes ?? '-'}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      </section>

      {/* Workspace Keputusan & Penetapan Relokasi / Unduh PDF */}
      <section className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        {report.status === 'PENDING_VALIDATION' && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Keputusan Validasi Dinas UMKM
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Pastikan kesesuaian lokasi dan hasil penataan humanis antara foto Before dan
                foto After di atas sebelum menyetujui laporan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setRevisionModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                <span>Tolak / Minta Revisi</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => approveMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span>Setujui (Valid)</span>
              </button>
            </div>
          </div>
        )}

        {report.status === 'NEEDS_REVISION' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Menunggu Revisi Bukti dari Satpol PP
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Alasan revisi: <strong>{report.revisionReason ?? '-'}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {report.status === 'VALIDATED' && (
          <div className="space-y-6">
            {/* Berita Acara PDF Banner */}
            <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-[#E9F1FD]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-primary">
                  Laporan Telah Tervalidasi ({formatWibDateTime(report.validatedAt)})
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Dokumen Berita Acara & Arahan Relokasi 1 halaman siap dicetak atau
                  diunduh sebagai bukti resmi koordinasi lintas dinas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={pdfActionLoading !== null}
                  onClick={() => void handlePdfAction(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-white px-3.5 py-2.5 text-xs font-semibold text-primary transition hover:bg-canvas disabled:opacity-50"
                >
                  {pdfActionLoading === 'inline' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span>Pratinjau</span>
                </button>
                <button
                  type="button"
                  disabled={pdfActionLoading !== null}
                  onClick={() => void handlePdfAction(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {pdfActionLoading === 'download' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  <span>Unduh Berita Acara & Arahan Relokasi (PDF 1 Halaman)</span>
                </button>
              </div>
            </div>

            {/* Penetapan Lokasi Relokasi 1-Klik */}
            {report.relocationRequested && (
              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Penetapan Arahan Lokasi Binaan (1-Klik)
                  </h3>
                </div>

                {report.relocationSiteId ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                      Lokasi Binaan Ditetapkan
                    </p>
                    <p className="mt-1 text-base font-extrabold text-slate-900">
                      {report.relocationSiteName ?? report.relocationSiteId}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-600">
                      Ditetapkan pada {formatWibDateTime(report.relocationAssignedAt)}
                    </p>
                  </div>
                ) : report.nearestRelocationSites.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-canvas p-4 text-xs text-slate-600">
                    Belum ada data Lokasi Binaan aktif di wilayah ini.{' '}
                    <Link
                      to="/dinas/lokasi-binaan"
                      className="font-bold text-primary underline"
                    >
                      Tambahkan Lokasi Binaan sekarang
                    </Link>
                    .
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-500">
                      Pilih 1 dari 3 lokasi binaan terdekat (berdasarkan jarak Haversine)
                      untuk diterbitkan sebagai arahan relokasi pada Berita Acara:
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      {report.nearestRelocationSites.map((site) => {
                        const checked = selectedSiteId === site.id;
                        return (
                          <label
                            key={site.id}
                            className={cn(
                              'flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition',
                              checked
                                ? 'border-primary bg-[#E9F1FD]/60 ring-1 ring-primary'
                                : 'border-slate-200 bg-white hover:border-accent',
                            )}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <input
                                  type="radio"
                                  name="relocationSite"
                                  checked={checked}
                                  onChange={() => setSelectedSiteId(site.id)}
                                  className="mt-1 accent-primary"
                                />
                                <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary shadow-sm">
                                  {site.distanceLabel}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-bold text-slate-900">
                                {site.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">{site.address}</p>
                            </div>

                            <div className="mt-3 space-y-1.5 border-t border-slate-200/70 pt-2.5">
                              <div className="flex flex-wrap gap-1">
                                {site.tradeCategories.map((cat) => (
                                  <span
                                    key={cat}
                                    className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-primary"
                                  >
                                    {cat}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Fasilitas: {site.facilities.join(', ')}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={!selectedSiteId || relocationMutation.isPending}
                        onClick={() => relocationMutation.mutate()}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {relocationMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        <span>Tetapkan Lokasi Relokasi</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* AuditLog Timeline */}
      <section className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-slate-900">
          Jejak Akuntabilitas Laporan (Audit Log)
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Catatan kronologis permanen lintas instansi (SDG 16)
        </p>

        {report.auditLogs.length === 0 ? (
          <p className="mt-4 text-xs text-slate-400">Belum ada entri riwayat audit.</p>
        ) : (
          <ol className="mt-4 space-y-3 border-l-2 border-accent/60 pl-4">
            {report.auditLogs.map((log) => (
              <li key={log.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">
                    {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                  </p>
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatWibDateTime(log.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Oleh <strong>{log.actorName}</strong> ({log.actorRole})
                  {log.fromStatus
                    ? ` • ${log.fromStatus} -> ${log.toStatus}`
                    : ` • ${log.toStatus}`}
                </p>
                {log.note && (
                  <p className="mt-1 rounded-lg bg-canvas px-3 py-1.5 text-xs text-slate-700">
                    {log.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Modal Tolak / Minta Revisi */}
      {revisionModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Minta Revisi Bukti Penindakan
              </h2>
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Tutup modal revisi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Tuliskan catatan perbaikan yang spesifik (minimal 10 karakter) agar petugas
              Satpol PP dapat mengunggah ulang foto bukti <em>After</em> yang sesuai.
            </p>

            <textarea
              rows={4}
              value={revisionReason}
              onChange={(e) => {
                setRevisionReason(e.target.value);
                if (revisionError) setRevisionError(null);
              }}
              placeholder="Contoh: Foto After belum menunjukkan marka trotoar yang sama dengan foto Before..."
              className="mt-3 w-full rounded-xl border border-slate-200 bg-canvas/60 p-3 text-xs text-slate-800 outline-none focus:border-primary focus:bg-white"
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-red-600">{revisionError ?? ''}</span>
              <span className="font-mono text-slate-400">
                {revisionReason.trim().length}/1000
              </span>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={revisionMutation.isPending}
                onClick={handleRevisionSubmit}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revisionMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Kirim Permintaan Revisi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <PhotoLightboxModal
          url={lightboxImage.url}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
