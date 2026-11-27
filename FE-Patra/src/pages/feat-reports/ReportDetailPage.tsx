import {
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { reportApi } from '@/services/api';
import {
  SatpolConcernedOfficerSvg,
  SatpolHappyOfficerSvg,
  SatpolWaveOfficerSvg,
} from '@/components/reports/SatpolIllustrations';
import PhotoLightboxModal from '@/components/ui/PhotoLightboxModal';
import { useToast } from '@/components/ui/Toast';
import { compressImageToJpeg } from '@/lib/imageCompress';
import { ApiError } from '@/lib/apiClient';
import {
  AUDIT_ACTION_LABELS,
  ENFORCEMENT_ACTION_LABELS,
  formatWibDateTime,
  REPORT_STATUS_META,
} from '@/lib/formatters';
import { buildGoogleMapsRouteUrl } from '@/lib/reportHelpers';
import type { EnforcementActionType, ViolationReportDetailDto } from '@/types';
import { cn } from '@/lib/utils';

// KONTRAK DATA: EnforcementActionType wajib single-select dari 3 enum resmi BE-Patra
const ACTION_OPTIONS: Array<{ value: EnforcementActionType; label: string }> = [
  { value: 'EDUCATION_WARNING', label: 'Issue Warning (Edukasi)' },
  { value: 'RELOCATION_ASSISTANCE', label: 'Relocated Vendor' },
  { value: 'ADMINISTRATIVE_ACTION', label: 'Enforcement' },
];

type SubmissionView = 'form' | 'success' | 'error';

export default function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [actionType, setActionType] =
    useState<EnforcementActionType>('EDUCATION_WARNING');
  const [actualPklCount, setActualPklCount] = useState<string>('1');
  const [educationNotes, setEducationNotes] = useState('');
  const [relocationRequested, setRelocationRequested] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const [submissionView, setSubmissionView] = useState<SubmissionView>('form');
  const [lastSubmittedReport, setLastSubmittedReport] =
    useState<ViolationReportDetailDto | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const reportQuery = useQuery({
    queryKey: ['reports', 'detail', reportId],
    queryFn: () => reportApi.getById(reportId!),
    enabled: Boolean(reportId),
  });

  const report = reportQuery.data;

  // Prefill form dari data laporan (hanya saat report.id berubah agar input tidak tertimpa)
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
      setLastErrorMessage(null);
      setLastSubmittedReport(updated);
      setAfterFile(null);
      setSubmissionView('success');
      pushToast({
        variant: 'success',
        title: 'Hasil penindakan berhasil dikirim',
        description: 'Laporan kini menunggu validasi dari Dinas UMKM.',
      });
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal mengirim laporan tindak lanjut. Periksa koneksi Anda dan coba lagi.';
      setLastErrorMessage(msg);
      if (err instanceof ApiError && err.status === 409) {
        void reportQuery.refetch();
      }
      setSubmissionView('error');
    },
  });

  const processSelectedFile = async (raw: File | undefined) => {
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    await processSelectedFile(e.target.files?.[0]);
  };

  const handleDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    await processSelectedFile(e.dataTransfer.files?.[0]);
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

  // ============================================================================
  // TAMPILAN HASIL: SUBMISSION SUCCESS (Sesuai Sumbit Form (Berhasil).png)
  // ============================================================================
  if (submissionView === 'success' && lastSubmittedReport) {
    const evidenceUrl = lastSubmittedReport.afterImageUrl ?? afterPreviewUrl;
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#EEF4FC] px-4 py-8 lg:min-h-screen">
        <div className="relative flex w-full max-w-4xl items-end justify-center">
          <SatpolHappyOfficerSvg className="pointer-events-none z-10 -mr-16 hidden h-[340px] w-[280px] shrink-0 lg:block" />

          <div className="relative z-0 w-full max-w-xl rounded-3xl bg-white px-6 py-8 text-center shadow-[0_18px_48px_-14px_rgba(4,63,165,0.2)] sm:px-10">
            {/* Ikon Centang + Konfeti */}
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#DCE8F8]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow">
                <Check className="h-6 w-6 stroke-[3]" />
              </span>
              <span className="absolute -left-5 -top-2 h-2.5 w-2.5 rotate-12 rounded-sm bg-rose-500" />
              <span className="absolute -right-4 top-0 h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="absolute -right-7 top-6 h-2 w-3 -rotate-45 rounded-sm bg-primary" />
              <span className="absolute -left-6 top-6 h-2 w-2 rounded-full bg-amber-400" />
            </div>

            <h1 className="mt-5 text-lg font-extrabold text-primary sm:text-xl">
              Success! Your action report and evidence have been submitted.
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Please check the summary below to review
            </p>

            {/* Ringkasan Pengiriman */}
            <div className="mt-5 max-h-60 overflow-y-auto rounded-2xl bg-[#E9F1FD] p-5 text-left text-xs">
              <dl className="grid grid-cols-1 gap-y-2.5 sm:grid-cols-12 sm:gap-x-3">
                <dt className="text-slate-400 sm:col-span-5">Report ID &amp; Status</dt>
                <dd className="font-semibold text-primary sm:col-span-7">
                  {lastSubmittedReport.reportCode} •{' '}
                  {REPORT_STATUS_META[lastSubmittedReport.status].shortLabel}
                </dd>

                <dt className="text-slate-400 sm:col-span-5">Action Type</dt>
                <dd className="font-semibold text-primary sm:col-span-7">
                  {lastSubmittedReport.actionType
                    ? ENFORCEMENT_ACTION_LABELS[lastSubmittedReport.actionType]
                    : '-'}
                </dd>

                <dt className="text-slate-400 sm:col-span-5">Estimated Vendor Count</dt>
                <dd className="font-semibold text-primary sm:col-span-7">
                  {lastSubmittedReport.actualPklCount ?? 0} Vendors
                </dd>

                <dt className="text-slate-400 sm:col-span-5">Field Education Notes</dt>
                <dd className="leading-relaxed font-medium text-primary sm:col-span-7">
                  {lastSubmittedReport.educationNotes ?? '-'}
                </dd>

                <dt className="text-slate-400 sm:col-span-5">
                  MSME Agency Coordination
                </dt>
                <dd className="font-semibold text-primary sm:col-span-7">
                  {lastSubmittedReport.relocationRequested
                    ? 'Forwarded to Dinas UMKM'
                    : 'Not Required'}
                </dd>

                <dt className="text-slate-400 sm:col-span-5">Evidence</dt>
                <dd className="sm:col-span-7">
                  {evidenceUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          url: evidenceUrl,
                          title: `After Evidence • ${lastSubmittedReport.reportCode}`,
                        })
                      }
                      className="font-semibold text-primary underline underline-offset-2 hover:text-secondary"
                    >
                      Photo
                    </button>
                  ) : (
                    '-'
                  )}
                </dd>
              </dl>
            </div>

            <div className="mt-6 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/satpol/laporan')}
                className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-gradient-to-r from-[#043FA5] via-[#2B68C9] to-[#043FA5] px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-95"
              >
                Back to Reports &amp; Actions
              </button>
              <button
                type="button"
                onClick={() => setSubmissionView('form')}
                className="text-xs font-semibold text-primary hover:underline"
              >
                View Report Details
              </button>
            </div>
          </div>
        </div>

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

  // ============================================================================
  // TAMPILAN HASIL: SUBMISSION FAILED (Sesuai Sumbit Form (Gagal).png)
  // ============================================================================
  if (submissionView === 'error') {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-[#EEF4FC] px-4 py-6 sm:px-8 lg:min-h-screen">
        <button
          type="button"
          onClick={() => navigate('/satpol/laporan')}
          className="inline-flex items-center gap-2 rounded-full bg-[#C7DDF7] px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Reports and Actions</span>
        </button>

        <div className="mx-auto mt-10 flex max-w-4xl items-end justify-center">
          <div className="relative z-0 w-full max-w-lg rounded-3xl bg-white px-6 py-10 text-center shadow-[0_18px_48px_-14px_rgba(4,63,165,0.18)] sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#B91C1C] text-white">
                <X className="h-6 w-6 stroke-[3]" />
              </span>
            </div>

            <h1 className="mt-5 text-xl font-extrabold text-primary">
              Submission Failed
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Could not send your follow-up report. Your filled details and photo are{' '}
              <strong className="text-slate-700">still saved</strong>. Please check your
              connection and try again.
            </p>
            {lastErrorMessage && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
                {lastErrorMessage}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-full bg-[#B91C1C] px-7 py-2.5 text-xs font-bold text-white shadow transition hover:bg-red-800 disabled:opacity-60"
              >
                {submitMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmissionView('form')}
                className="rounded-full border border-slate-200 px-5 py-2.5 text-xs font-semibold text-primary hover:bg-canvas"
              >
                Review Form
              </button>
            </div>
          </div>

          <SatpolConcernedOfficerSvg className="pointer-events-none z-10 -ml-10 hidden h-[370px] w-[185px] shrink-0 lg:block" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // LOADING / ERROR STATE
  // ============================================================================
  if (reportQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="h-[520px] animate-pulse rounded-3xl bg-[#E9F1FD] lg:col-span-6" />
          <div className="h-[520px] animate-pulse rounded-3xl bg-white lg:col-span-6" />
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <button
          type="button"
          onClick={() => navigate('/satpol/laporan')}
          className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#DCE8F8] px-4 py-2 text-xs font-bold text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Reports &amp; Actions</span>
        </button>
        <div className="rounded-3xl border border-red-200 bg-white p-8 text-center text-sm text-red-700 shadow-sm">
          {reportQuery.error instanceof Error
            ? reportQuery.error.message
            : 'Laporan tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const canSubmitAction =
    report.status === 'NEED_ACTION' || report.status === 'NEEDS_REVISION';
  const isRevisionMode = report.status === 'NEEDS_REVISION';
  const pageTitle = isRevisionMode
    ? 'Revise Form'
    : canSubmitAction
      ? 'Follow-Up & Action Form'
      : 'Report Details';
  const routeUrl = buildGoogleMapsRouteUrl(report.lat, report.lng);
  const statusMeta = REPORT_STATUS_META[report.status];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-white lg:min-h-screen">
      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:min-h-screen lg:grid-cols-12">
        {/* LEFT PANEL (#EEF4FC — Before Evidence, Details, Audit Log, Relocation Sites) */}
        <section className="flex flex-col justify-between gap-5 bg-[#EEF4FC] p-4 sm:p-6 lg:col-span-6 lg:rounded-r-3xl lg:shadow-[6px_0_24px_-12px_rgba(4,63,165,0.16)]">
          <div className="space-y-4">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/satpol/laporan')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C7DDF7] text-primary transition hover:bg-primary hover:text-white"
                aria-label="Kembali ke Reports & Actions"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-extrabold tracking-tight text-primary sm:text-2xl">
                {pageTitle}
              </h1>
              {!canSubmitAction && (
                <span
                  className={cn(
                    'rounded-full border px-3.5 py-0.5 text-xs font-bold',
                    statusMeta.badgeClass,
                  )}
                >
                  {report.status === 'VALIDATED' ? 'Validated' : statusMeta.shortLabel}
                </span>
              )}
            </div>

            {/* Before Snapshot + Details Box */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-12">
              <div
                onClick={() =>
                  setLightboxImage({
                    url: report.beforeImageUrl,
                    title: `Before Evidence • ${report.reportCode}`,
                  })
                }
                className="relative cursor-pointer overflow-hidden rounded-2xl bg-video-frame shadow-sm sm:col-span-7"
                title="Klik untuk memperbesar foto Before (tanpa sensor wajah)"
              >
                {/* STRICT: NO face blur on internal government view */}
                <img
                  src={report.beforeImageUrl}
                  alt={`Bukti Before ${report.reportCode}`}
                  className="aspect-video h-full w-full object-cover"
                />
                <span className="absolute left-2.5 top-2.5 rounded border border-accent/60 bg-slate-900/75 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  PKL • {Math.round(report.maxConfidence * 100)}%
                </span>
              </div>

              <div className="flex flex-col justify-between rounded-2xl bg-[#DCE8F8] p-4 text-xs sm:col-span-5">
                <div>
                  <h2 className="text-base font-extrabold text-primary">Details</h2>
                  <dl className="mt-2 space-y-1 text-[11px] leading-snug text-primary/90">
                    <div>
                      <span className="font-semibold">Ticket ID:</span>{' '}
                      <span className="font-mono font-bold">{report.reportCode}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Timestamp:</span>{' '}
                      <span>{formatWibDateTime(report.createdAt)}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Address:</span>{' '}
                      <span>{report.address}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Coordinates:</span>{' '}
                      <span className="font-mono">
                        {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
                      </span>
                    </div>
                  </dl>
                </div>

                {routeUrl && (
                  <a
                    href={routeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-primary/90"
                  >
                    <span>Show Route to Event</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Immutable Audit Log Card */}
            <div className="rounded-2xl bg-[#DCE8F8] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-primary">
                  Immutable Audit Log
                </h2>
                <span className="font-mono text-[10px] font-semibold text-primary/70">
                  Append-Only • SDG 16
                </span>
              </div>
              <ol className="mt-3 max-h-44 space-y-2.5 overflow-y-auto border-l-2 border-primary/60 pl-4 pr-2">
                {report.auditLogs.map((log) => (
                  <li key={log.id} className="relative text-[11px] text-primary">
                    <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="leading-snug">
                      <span className="font-mono font-semibold">
                        {formatWibDateTime(log.createdAt)}:
                      </span>{' '}
                      <span className="font-bold">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>{' '}
                      - {log.actorName}
                    </p>
                    {log.note && (
                      <p className="mt-0.5 text-[10px] text-primary/80">{log.note}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* Relocation Sites & Guides Card (TANPA KUOTA) */}
            <div className="relative overflow-hidden rounded-2xl bg-[#DCE8F8] p-4 shadow-sm sm:pr-36">
              <h2 className="text-base font-extrabold text-primary">
                Relocation Sites &amp; Guides
              </h2>

              <p className="mt-2 text-xs font-bold underline underline-offset-2 text-primary">
                Nearest Designated Sites:
              </p>

              {report.nearestRelocationSites.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-primary/80">
                  Belum ada data Lokasi Binaan terdaftar di kota ini.
                </p>
              ) : (
                <div className="mt-1.5 space-y-1.5 text-[11px] text-primary">
                  {report.nearestRelocationSites.map((site, index) => {
                    const siteRoute = buildGoogleMapsRouteUrl(site.lat, site.lng);
                    return (
                      <div key={site.id}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-bold">Site {index + 1}:</span>
                          <span className="font-medium">{site.name}</span>
                          <span className="font-mono font-bold">
                            • ±{site.distanceLabel}
                          </span>
                          {siteRoute && (
                            <a
                              href={siteRoute}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-semibold underline underline-offset-2 hover:text-secondary"
                            >
                              Open Route
                            </a>
                          )}
                        </div>
                        {site.facilities.length > 0 && (
                          <p className="text-[10px] text-primary/75">
                            Fasilitas: {site.facilities.join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-xs font-bold underline underline-offset-2 text-primary">
                Persuasive Education:
              </p>
              <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] font-medium text-primary sm:grid-cols-2">
                <li>• Emphasize public safety</li>
                <li>• Greet politely &amp; listen first</li>
                <li>• Explain permit process</li>
                <li>• Share relocation options</li>
              </ul>

              <SatpolWaveOfficerSvg className="pointer-events-none bottom-0 right-1 hidden h-44 w-36 sm:absolute sm:block" />
            </div>
          </div>
        </section>

        {/* RIGHT PANEL (Putih — Form Follow-Up / Revise Form / Read-Only View Details) */}
        <section className="flex flex-col bg-white lg:col-span-6">
          {/* Revision Banner Penuh di Atas Kanan (Sesuai Revised Form.png) */}
          {isRevisionMode && (
            <div className="flex items-start gap-3 bg-[#C80000] px-5 py-3.5 text-white">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">
                Revision Required:{' '}
                {report.revisionReason ??
                  'Evidence photo is unclear. Please upload a brighter After photo and review your submitted details.'}
              </p>
            </div>
          )}

          <div className="flex flex-1 flex-col justify-center p-5 sm:p-8 lg:p-10">
            {canSubmitAction ? (
              <form onSubmit={handleSubmit} className="mx-auto w-full max-w-xl space-y-5">
                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                    {formError}
                  </div>
                )}

                {/* Drop Your Evidence (Single Compressed Image, Mobile Capture Ready) */}
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => void handleDrop(e)}
                  className={cn(
                    'flex min-h-[175px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-[#E3EEFB] px-5 py-6 text-center transition',
                    isDragging && 'bg-[#DCE8F8] ring-2 ring-primary/30',
                  )}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => void handleFileChange(e)}
                    className="sr-only"
                  />

                  {isCompressing ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Mengompresi foto bukti...</span>
                    </div>
                  ) : afterPreviewUrl ? (
                    <div className="w-full space-y-2.5">
                      <img
                        src={afterPreviewUrl}
                        alt="Preview Foto After"
                        className="mx-auto max-h-48 rounded-2xl object-cover shadow-sm"
                      />
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#043FA5] to-[#2B68C9] px-4 py-1.5 text-[11px] font-bold text-white shadow">
                        Replace Photo ({Math.round((afterFile?.size ?? 0) / 1024)} KB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-base font-extrabold text-primary">
                        Drop Your Evidence
                      </p>
                      <p className="mt-1 text-[11px] text-primary/70">
                        *Accepted formats: JPG, PNG (Auto-compressed ≤ 1.5 MB, max 4 MB)
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#043FA5] to-[#2B68C9] px-5 py-2 text-xs font-bold text-white shadow">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Photo</span>
                      </span>
                    </>
                  )}
                </label>

                {/* Action Type (Single-Select Sesuai Enum Kontrak BE-Patra) */}
                <div>
                  <label className="block text-base font-extrabold text-primary">
                    Action Type
                  </label>
                  <div className="mt-2.5 flex flex-wrap items-center gap-4">
                    {ACTION_OPTIONS.map((opt) => {
                      const selected = actionType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setActionType(opt.value)}
                          className="inline-flex items-center gap-2 text-xs font-medium text-primary"
                        >
                          <span
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
                              selected
                                ? 'border-primary bg-primary/15'
                                : 'border-accent bg-white',
                            )}
                          >
                            {selected && (
                              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                            )}
                          </span>
                          <span className={selected ? 'font-bold' : 'font-medium'}>
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Field Education Notes + Vendor Count + Relocation Checkbox */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  <div className="sm:col-span-7">
                    <label
                      htmlFor="educationNotes"
                      className="block text-base font-extrabold text-primary"
                    >
                      Field Education Notes
                    </label>
                    <textarea
                      id="educationNotes"
                      rows={5}
                      value={educationNotes}
                      onChange={(e) => setEducationNotes(e.target.value)}
                      placeholder="Type here..."
                      className="mt-2 w-full rounded-2xl border border-primary/50 bg-white px-4 py-3 text-xs leading-relaxed text-primary placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>

                  <div className="space-y-4 sm:col-span-5">
                    <div>
                      <label
                        htmlFor="actualPklCount"
                        className="block text-base font-extrabold text-primary"
                      >
                        Vendor Count
                      </label>
                      <input
                        id="actualPklCount"
                        type="number"
                        min={0}
                        max={200}
                        value={actualPklCount}
                        onChange={(e) => setActualPklCount(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3.5 py-2.5 font-mono text-sm font-bold text-primary focus:border-primary focus:bg-white focus:outline-none"
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs leading-snug text-primary">
                      <input
                        type="checkbox"
                        checked={relocationRequested}
                        onChange={(e) => setRelocationRequested(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-primary accent-primary"
                      />
                      <span>
                        Vendor <span className="underline">willing to move</span> to
                        nearest designated site (Forward to MSME Agency).
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitMutation.isPending || isCompressing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#043FA5] via-[#2B68C9] to-[#043FA5] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
                >
                  {submitMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>{isRevisionMode ? 'Resubmit Proof' : 'Submit Form'}</span>
                </button>
              </form>
            ) : (
              /* READ-ONLY VIEW DETAILS (Sesuai Reports & Actions - View Details.png) */
              <div className="mx-auto w-full max-w-xl space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-primary">
                    After Photo Evidence
                  </h2>
                  <div className="mt-2 overflow-hidden rounded-2xl border border-primary/50 bg-white">
                    {report.afterImageUrl ? (
                      <div
                        onClick={() =>
                          setLightboxImage({
                            url: report.afterImageUrl!,
                            title: `After Evidence • ${report.reportCode}`,
                          })
                        }
                        className="cursor-pointer bg-video-frame"
                      >
                        <img
                          src={report.afterImageUrl}
                          alt={`Bukti After ${report.reportCode}`}
                          className="max-h-56 w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center bg-canvas text-xs text-slate-400">
                        Belum ada foto After
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-primary">
                      <span>
                        Uploaded at {formatWibDateTime(report.actionSubmittedAt)}
                      </span>
                      {report.afterImageUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              url: report.afterImageUrl!,
                              title: `After Evidence • ${report.reportCode}`,
                            })
                          }
                          className="font-semibold underline underline-offset-2 hover:text-secondary"
                        >
                          Link Photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-extrabold text-primary">Action Type</h2>
                  <div className="mt-1.5 rounded-xl border border-primary/50 px-4 py-2.5 text-xs font-medium text-primary">
                    {report.actionType
                      ? ENFORCEMENT_ACTION_LABELS[report.actionType]
                      : '-'}
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-extrabold text-primary">Vendor Count</h2>
                  <div className="mt-1.5 rounded-xl border border-primary/50 px-4 py-2.5 text-xs font-medium text-primary">
                    {report.actualPklCount ?? '-'} Vendors
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-extrabold text-primary">
                    Field Education Notes
                  </h2>
                  <div className="mt-1.5 min-h-[96px] rounded-xl border border-primary/50 px-4 py-3 text-xs leading-relaxed text-primary">
                    {report.educationNotes ?? '-'}
                  </div>
                </div>

                <div className="flex items-start gap-2.5 pt-1 text-xs text-primary">
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      report.relocationRequested
                        ? 'border-primary bg-primary text-white'
                        : 'border-slate-300 bg-white',
                    )}
                  >
                    {report.relocationRequested && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <span>
                    Vendor <span className="underline">willing to move</span> to nearest
                    designated site (Forward to MSME Agency).
                  </span>
                </div>

                {report.relocationSiteName && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
                    Arahan Relokasi Ditetapkan: {report.relocationSiteName}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

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
