import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ExternalLink, MapPin, ShieldAlert } from 'lucide-react';
import { cctvApi, reportApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import CctvPlayerWithAI from '@/components/cctv/CctvPlayerWithAI';
import { useToast } from '@/components/ui/Toast';
import type { CctvLiveTelemetry, ViolationCapturePayload } from '@/types';

export default function CctvLivePage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [telemetry, setTelemetry] = useState<CctvLiveTelemetry | null>(null);
  const [savedReportBanner, setSavedReportBanner] = useState<{
    reportId?: string;
    reportCode?: string;
    message: string;
  } | null>(null);

  const cameraQuery = useQuery({
    queryKey: ['cctv', 'detail', cameraId],
    queryFn: () => cctvApi.getById(cameraId!),
    enabled: Boolean(cameraId),
  });

  const handleViolationCaptured = useCallback(
    async (payload: ViolationCapturePayload) => {
      const res = await reportApi.autoDetect(
        {
          cameraId: payload.cameraId,
          source: payload.source,
          currentActiveViolators: payload.currentActiveViolators,
          maxConfidence: payload.maxConfidence,
          isSimulationMode: payload.isSimulationMode,
        },
        payload.snapshotBlob,
      );

      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['cctv'] });

      if (res.outcome === 'CREATED') {
        const msg =
          payload.source === 'MANUAL'
            ? 'Report saved to Reports & Actions!'
            : 'Auto-capture tersimpan ke Reports & Actions!';
        setSavedReportBanner({
          reportId: res.report?.id,
          reportCode: res.report?.reportCode,
          message: msg,
        });
        pushToast({
          variant: 'success',
          title: msg,
          description: res.report?.reportCode
            ? `Kode laporan: ${res.report.reportCode} (${res.report.detectedCount} PKL).`
            : undefined,
          actionLabel: 'View Report',
          actionTo: res.report?.id ? `/satpol/laporan/${res.report.id}` : '/satpol/laporan',
        });
      } else if (res.outcome === 'MERGED_ESCALATED') {
        setSavedReportBanner({
          reportId: res.report?.id,
          reportCode: res.report?.reportCode,
          message: 'Bukti & jumlah PKL pada laporan aktif diperbarui!',
        });
        pushToast({
          variant: 'info',
          title: 'Laporan aktif diperbarui (Incident Merging)',
          description: `Jumlah puncak PKL aktif menjadi ${res.report?.detectedCount ?? payload.currentActiveViolators}. Bukti sebelumnya tetap tersimpan di AuditLog.`,
          actionLabel: 'View Report',
          actionTo: res.report?.id ? `/satpol/laporan/${res.report.id}` : '/satpol/laporan',
        });
      } else if (res.outcome === 'MERGED_NOOP') {
        pushToast({
          variant: 'info',
          title: 'Laporan aktif sudah tercatat untuk kamera ini',
          description: 'Tidak ada duplikasi laporan baru dibuat.',
          actionLabel: 'View Report',
          actionTo: res.report?.id ? `/satpol/laporan/${res.report.id}` : '/satpol/laporan',
        });
      } else if (res.outcome === 'COOLDOWN_SUPPRESSED') {
        pushToast({
          variant: 'warning',
          title: 'Kamera dalam masa jeda pasca penindakan',
          description: `Cooldown aktif (${res.cooldownRemainingSec ?? 30} detik tersisa). Gunakan Capture & Report manual jika diperlukan.`,
        });
      }

      return {
        outcome: res.outcome,
        reportId: res.report?.id,
        reportCode: res.report?.reportCode,
      };
    },
    [pushToast, queryClient],
  );

  const camera = cameraQuery.data;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
      <SatpolTopHeader
        leftSlot={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/satpol/cctv')}
              className="inline-flex items-center gap-2 rounded-full bg-[#DCE8F8] px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Cameras</span>
            </button>
            {camera && (
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold text-primary sm:text-xl">
                  {camera.name}
                </h1>
                <p className="truncate text-xs text-slate-500">{camera.regionLabel}</p>
              </div>
            )}
          </div>
        }
      />

      {cameraQuery.isLoading && (
        <div className="space-y-4">
          <div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-slate-200" />
        </div>
      )}

      {cameraQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h2 className="mt-3 text-base font-bold text-red-800">
            Kamera tidak dapat diakses
          </h2>
          <p className="mt-1 text-xs text-red-700">
            {cameraQuery.error instanceof Error
              ? cameraQuery.error.message
              : 'Kamera tidak ditemukan atau berada di luar wilayah tugas Anda.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/satpol/cctv')}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Kembali ke Daftar Kamera
          </button>
        </div>
      )}

      {camera && (
        <div className="space-y-5">
          {savedReportBanner && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-primary">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>
                  {savedReportBanner.message}{' '}
                  {savedReportBanner.reportCode && (
                    <span className="font-mono text-xs text-slate-600">
                      ({savedReportBanner.reportCode})
                    </span>
                  )}
                </span>
              </div>
              <Link
                to={
                  savedReportBanner.reportId
                    ? `/satpol/laporan/${savedReportBanner.reportId}`
                    : '/satpol/laporan'
                }
                className="text-xs font-bold text-secondary underline underline-offset-2 hover:text-primary"
              >
                View Report →
              </Link>
            </div>
          )}

          <CctvPlayerWithAI
            camera={camera}
            onViolationCaptured={handleViolationCaptured}
            onTelemetryChange={setTelemetry}
            onViewOnMap={() =>
              navigate(`/satpol/peta?cameraId=${encodeURIComponent(camera.id)}`)
            }
          />

          {/* Metadata & Sumber Kamera (Ringkas & Transparan) */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-accent/45 bg-white p-4 text-xs sm:grid-cols-3">
            <div>
              <p className="font-semibold text-slate-400">Sumber &amp; Atribusi</p>
              <p className="mt-1 font-semibold text-slate-800">{camera.attribution}</p>
              {camera.sourcePortal && (
                <a
                  href={camera.sourcePortal}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-secondary hover:text-primary"
                >
                  <span>Portal Publik Pemda</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div>
              <p className="font-semibold text-slate-400">Koordinat &amp; Wilayah</p>
              <p className="mt-1 inline-flex items-center gap-1 font-mono text-slate-800">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {camera.lat.toFixed(5)}, {camera.lng.toFixed(5)}
              </p>
              {!camera.coordsExact && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Perkiraan titik lokasi kamera
                </p>
              )}
            </div>

            <div>
              <p className="font-semibold text-slate-400">Telemetri Inferensi (1 FPS)</p>
              <p className="mt-1 font-mono text-slate-800">
                Runtime: {(telemetry?.aiBackend ?? 'wasm').toUpperCase()} •{' '}
                {telemetry?.inferenceMs ? `${telemetry.inferenceMs} ms` : 'Standby'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {camera.roiPolygon
                  ? `ROI Trotoar aktif (${camera.roiPolygon.length} titik)`
                  : 'Mode Area Penuh (Full-Frame)'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
