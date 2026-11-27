import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Compass,
  ExternalLink,
  MapPin,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cctvApi, reportApi } from '@/services/api';
import { SatpolTopHeader } from '@/components/layout/SatpolLayout';
import WalkthroughTriggerButton from '@/components/walkthrough/WalkthroughTriggerButton';
import CctvPlayerWithAI from '@/components/cctv/CctvPlayerWithAI';
import CameraThumbnail from '@/components/cctv/CameraThumbnail';
import { useToast } from '@/components/ui/Toast';
import {
  getSavedCctvListViewState,
  getUnavailableCameraIdsSnapshot,
  resolveCctvReturnPath,
  subscribeUnavailableCameras,
} from '@/lib/cameraThumbnailHelpers';
import { formatHeaderClock } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import loginBgUrl from '@/assets/images/Login BG.png';
import type { CctvCameraDto, CctvLiveTelemetry, ViolationCapturePayload } from '@/types';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

export default function CctvLivePage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const backToCamerasPath = useMemo(() => {
    const state = location.state as { returnTo?: unknown } | null;
    return resolveCctvReturnPath(state?.returnTo, getSavedCctvListViewState(user?.region.id));
  }, [location.state, user?.region.id]);

  const [telemetry, setTelemetry] = useState<CctvLiveTelemetry | null>(null);
  const [clockText, setClockText] = useState(() => formatHeaderClock());
  const [scrollProgress, setScrollProgress] = useState(0);
  const relatedScrollRef = useRef<HTMLDivElement | null>(null);
  const [savedReportBanner, setSavedReportBanner] = useState<{
    reportId?: string;
    reportCode?: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setClockText(formatHeaderClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Gulir halus ke atas & reset banner setiap berpindah kamera
  useEffect(() => {
    setSavedReportBanner(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [cameraId]);

  const cameraQuery = useQuery({
    queryKey: ['cctv', 'detail', user?.region.id, cameraId],
    queryFn: () => cctvApi.getById(cameraId!),
    enabled: Boolean(cameraId && user),
  });

  // Ambil daftar kamera sekota (Region-Locked) untuk Rekomendasi CCTV di bawah preview
  const cityCamerasQuery = useQuery({
    queryKey: ['cctv', 'list', user?.region.id],
    queryFn: () => cctvApi.list(),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
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

  const unavailableCameraIds = useSyncExternalStore(
    subscribeUnavailableCameras,
    getUnavailableCameraIdsSnapshot,
  );

  // Rekomendasi CCTV sekota (prioritas: pelanggaran aktif -> kecamatan sama & jarak terdekat -> kategori sama)
  const recommendedCameras = useMemo<
    Array<{ cam: CctvCameraDto; distanceKm: number; reason: string }>
  >(() => {
    if (!camera) return [];
    const peers = (cityCamerasQuery.data?.cameras ?? []).filter(
      (c) =>
        c.id !== camera.id &&
        !unavailableCameraIds.has(c.id) &&
        c.city.trim().toLowerCase() === camera.city.trim().toLowerCase(),
    );

    return peers
      .map((peer) => {
        const dist = haversineKm(camera.lat, camera.lng, peer.lat, peer.lng);
        const sameDistrict =
          Boolean(camera.district && peer.district) &&
          camera.district!.toLowerCase() === peer.district!.toLowerCase();
        const sameCategory =
          Boolean(camera.facilityCategory && peer.facilityCategory) &&
          camera.facilityCategory!.toLowerCase() === peer.facilityCategory!.toLowerCase();

        let score = dist;
        if (peer.hasActiveReport) score -= 20;
        if (sameDistrict) score -= 3;
        if (peer.roiPolygon) score -= 1.5;
        if (sameCategory) score -= 0.75;

        const reason = peer.hasActiveReport
          ? 'Pelanggaran Aktif'
          : sameDistrict
            ? `Sekecamatan • ${formatDistanceLabel(dist)}`
            : `Terdekat • ${formatDistanceLabel(dist)}`;

        return { cam: peer, distanceKm: dist, reason, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map(({ cam, distanceKm, reason }) => ({ cam, distanceKm, reason }));
  }, [camera, cityCamerasQuery.data?.cameras, unavailableCameraIds]);

  const totalCityCameras = useMemo(
    () =>
      (cityCamerasQuery.data?.cameras ?? []).filter((c) => !unavailableCameraIds.has(c.id)).length,
    [cityCamerasQuery.data?.cameras, unavailableCameraIds],
  );

  const handleRelatedScroll = () => {
    const el = relatedScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setScrollProgress(maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-white md:bg-transparent">
      {/* Seamless Mobile Page Background (Sky Gradient + Skyline & Traffic Lights from Login BG.png) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#FFFFFF_0%,#FFFFFF_45%,#E4EFFC_68%,#B5D2F4_100%)] md:hidden"
      >
        <div
          className="absolute inset-x-0 bottom-0 h-[210px] bg-no-repeat opacity-90"
          style={{
            backgroundImage: `url("${loginBgUrl}")`,
            backgroundSize: '108% auto',
            backgroundPosition: 'center top',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-44 pt-4 sm:px-8 sm:py-6 md:pb-8">
        {/* Mobile Dedicated Detail Header (matches CCTV Monitoring (Satpol PP) Inspect - Mobile.png) */}
        <div className="flex items-center justify-between gap-2.5 pb-4 lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(backToCamerasPath)}
            aria-label="Back to Cameras"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F8] text-primary transition hover:bg-primary hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight text-primary">
              {camera?.name ?? 'Live CCTV'}
            </h1>
            <p className="truncate font-mono text-[11px] font-medium text-primary/75">
              {clockText}
            </p>
          </div>
        </div>

        <WalkthroughTriggerButton tourId="satpol-live" label="Tur Kamera AI" />
      </div>

      {/* Desktop Top Header */}
      <div className="hidden lg:block">
        <SatpolTopHeader
          leftSlot={
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(backToCamerasPath)}
                className="inline-flex items-center gap-2 rounded-full bg-[#DCE8F8] px-4 py-2 text-xs font-bold text-primary transition duration-200 hover:-translate-x-0.5 hover:bg-primary hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Cameras</span>
              </button>
              {camera && (
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-extrabold text-primary sm:text-xl">
                      {camera.name}
                    </h1>
                    <span className="rounded-full bg-[#E9F1FD] px-2.5 py-0.5 text-[11px] font-bold text-primary">
                      {camera.city}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{camera.regionLabel}</p>
                </div>
              )}
            </div>
          }
        />
      </div>

      {cameraQuery.isLoading && (
        <div className="space-y-4">
          <div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-slate-200" />
        </div>
      )}

      {cameraQuery.isError && (
        <div className="animate-patra-enter rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h2 className="mt-3 text-base font-bold text-red-800">
            Kamera tidak dapat diakses
          </h2>
          <p className="mt-1 text-xs text-red-700">
            {cameraQuery.error instanceof Error
              ? cameraQuery.error.message
              : 'Kamera tidak ditemukan atau berada di luar wilayah tugas kota Anda.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(backToCamerasPath)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Kembali ke Daftar Kamera {user?.region.city}
          </button>
        </div>
      )}

      {camera && (
        <div className="flex flex-col gap-5 sm:gap-6">
          {savedReportBanner && (
            <div className="animate-patra-enter flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-white px-4 py-3 shadow-sm">
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

          <div data-tour="satpol-live-player" className="order-1 rounded-2xl">
            <CctvPlayerWithAI
              camera={camera}
              onViolationCaptured={handleViolationCaptured}
              onTelemetryChange={setTelemetry}
              onViewOnMap={() =>
                navigate(`/satpol/peta?cameraId=${encodeURIComponent(camera.id)}`)
              }
            />
          </div>

          {/* Metadata & Sumber Kamera (after Related Cameras on mobile, right below player on desktop) */}
          <div
            data-tour="satpol-live-telemetry"
            className="animate-patra-enter order-3 grid grid-cols-1 gap-3 rounded-2xl border border-accent/45 bg-white/90 p-3.5 text-xs shadow-sm backdrop-blur-sm sm:grid-cols-3 sm:bg-white sm:p-4 sm:backdrop-blur-none md:order-2"
          >
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
              <p className="mt-0.5 text-[11px] text-slate-500">
                {camera.district ? `Kec. ${camera.district}, ` : ''}
                {camera.city}
                {!camera.coordsExact ? ' (perkiraan titik)' : ''}
              </p>
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

          {/* Rekomendasi CCTV Lainnya di Kota yang Sama (Region-Locked) */}
          {recommendedCameras.length > 0 && (
            <section
              data-tour="satpol-live-recommend"
              className="animate-patra-enter order-2 rounded-2xl pt-1 sm:pt-2 md:order-3"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <span className="hidden h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-extrabold text-primary sm:text-base">
                      Related Cameras
                    </h2>
                    <p className="hidden text-xs text-slate-500 sm:block">
                      Kamera terdekat &amp; prioritas pantauan di wilayah hukum Satpol PP {camera.city}
                    </p>
                  </div>
                </div>

                <Link
                  to={backToCamerasPath}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-[#EEF4FD] px-3 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary hover:text-white sm:px-4 sm:py-1.5 sm:text-xs"
                >
                  <span>Lihat Semua ({totalCityCameras})</span>
                </Link>
              </div>

              {/* Mobile Horizontal Carousel (matching CCTV Monitoring (Satpol PP) Inspect - Mobile.png) */}
              <div className="md:hidden">
                <div
                  ref={relatedScrollRef}
                  onScroll={handleRelatedScroll}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {recommendedCameras.map(({ cam }, idx) => {
                    const isHighlighted = idx === 0 || cam.hasActiveReport;
                    const badgeText = cam.hasActiveReport
                      ? 'Active Violation'
                      : cam.district || cam.city;
                    return (
                      <article
                        key={cam.id}
                        onClick={() =>
                          navigate(`/satpol/cctv/${encodeURIComponent(cam.id)}`, {
                            state: { returnTo: backToCamerasPath },
                          })
                        }
                        className={cn(
                          'group min-w-[190px] max-w-[205px] shrink-0 cursor-pointer snap-start rounded-2xl border bg-white/95 p-3.5 shadow-sm backdrop-blur-sm transition',
                          isHighlighted
                            ? 'border-primary/60'
                            : 'border-slate-200/90 hover:border-primary/40',
                        )}
                      >
                        <div>
                          <span
                            className={cn(
                              'inline-block max-w-full truncate rounded-md px-2.5 py-1 text-[11px] font-bold',
                              cam.hasActiveReport
                                ? 'bg-red-100 text-red-700'
                                : isHighlighted
                                  ? 'bg-[#D8E7FA] text-primary'
                                  : 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {badgeText}
                          </span>
                        </div>

                        <h3 className="mt-2.5 truncate text-xs font-extrabold text-primary">
                          {cam.name}
                        </h3>

                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="truncate text-[10.5px] text-slate-500">
                            {cam.facilityCategory ?? 'Koridor Publik'}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/satpol/cctv/${encodeURIComponent(cam.id)}`, {
                                state: { returnTo: backToCamerasPath },
                              });
                            }}
                            className={cn(
                              'shrink-0 rounded-md px-3 py-1 text-[10px] font-bold text-white transition',
                              isHighlighted
                                ? 'bg-primary hover:bg-primary/90'
                                : 'bg-slate-400 group-hover:bg-primary',
                            )}
                          >
                            View
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Synced Scrollbar Progress Indicator */}
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full w-1/3 rounded-full bg-primary transition-transform duration-150"
                    style={{ transform: `translateX(${scrollProgress * 200}%)` }}
                  />
                </div>
              </div>

              {/* Desktop 3-Column Grid */}
              <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
                {recommendedCameras.map(({ cam, reason }, idx) => (
                  <article
                    key={cam.id}
                    onClick={() =>
                      navigate(`/satpol/cctv/${encodeURIComponent(cam.id)}`, {
                        state: { returnTo: backToCamerasPath },
                      })
                    }
                    style={{ animationDelay: `${idx * 60}ms` }}
                    className="animate-patra-enter group cursor-pointer overflow-hidden rounded-2xl border border-accent/50 bg-[#E6EFFC] shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/55 hover:shadow-lg"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-video-frame">
                      <CameraThumbnail camera={cam} />
                      {cam.hasActiveReport && (
                        <span className="absolute bottom-0 right-0 rounded-tl-xl bg-[#B91C1C] px-2.5 py-1 text-[10px] font-bold text-white shadow">
                          Active Violation
                        </span>
                      )}
                    </div>

                    <div className="px-3.5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-bold text-primary transition group-hover:text-[#00266D]">
                          {cam.name}
                        </h3>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Compass className="h-3 w-3 text-secondary" />
                          {reason}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-primary/70">
                        {cam.facilityCategory ?? 'Koridor Publik'}
                        {cam.district ? ` • Kec. ${cam.district}` : ''}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
