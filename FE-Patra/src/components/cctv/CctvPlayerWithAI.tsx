import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Camera,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Radio,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { compressCanvasToJpegBlob } from '@/lib/imageCompress';
import {
  getCameraTracker,
  type RawDetection,
} from '@/services/yolo/roiAndTracker';
import type {
  CctvLiveTelemetry,
  CctvPlayerWithAIProps,
  CctvStreamStatus,
  TrackedObjectOverlay,
} from '@/types';
import { cn } from '@/lib/utils';

const DEFAULT_THRESHOLD_SEC = Number(
  import.meta.env.VITE_VIOLATION_THRESHOLD_SEC || 15,
);

// Simulasi feed visual jalan high-angle apabila HLS offline & file MP4 lokal belum diunggah Dev 2
function drawSimulatedHighAngleFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tick: number,
  cameraName: string,
) {
  // Aspal jalan & bahu jalan
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#364152');
  skyGrad.addColorStop(1, '#525F75');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Median jalan kiri
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.28);
  ctx.lineTo(w * 0.56, 0);
  ctx.lineTo(w * 0.62, 0);
  ctx.lineTo(0, h * 0.42);
  ctx.closePath();
  ctx.fill();

  // Trotoar sisi kanan (area ROI)
  ctx.fillStyle = '#94A3B8';
  ctx.beginPath();
  ctx.moveTo(w * 0.64, h * 0.34);
  ctx.lineTo(w, h * 0.4);
  ctx.lineTo(w, h);
  ctx.lineTo(w * 0.54, h);
  ctx.closePath();
  ctx.fill();

  // Guiding block kuning trotoar
  ctx.fillStyle = '#EAB308';
  ctx.beginPath();
  ctx.moveTo(w * 0.72, h * 0.37);
  ctx.lineTo(w * 0.75, h * 0.375);
  ctx.lineTo(w * 0.71, h);
  ctx.lineTo(w * 0.67, h);
  ctx.closePath();
  ctx.fill();

  // Marka jalan putus-putus
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(w * 0.54, h * 0.25);
  ctx.lineTo(w * 0.32, h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Kendaraan melintas halus
  const carProgress = ((tick * 1.4) % 100) / 100;
  const carX = w * (0.56 - carProgress * 0.28);
  const carY = h * (0.22 + carProgress * 0.62);
  const carScale = 0.45 + carProgress * 0.9;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(carX - 24 * carScale, carY - 16 * carScale, 48 * carScale, 34 * carScale);
  ctx.fillStyle = '#043FA5';
  ctx.fillRect(carX - 24 * carScale, carY - 2 * carScale, 48 * carScale, 10 * carScale);

  // Gerobak PKL menetap di trotoar (untuk pengujian AI + ROI + Auto-Capture)
  const cartX = w * 0.72;
  const cartY = h * 0.39;
  const cartW = w * 0.11;
  const cartH = h * 0.19;
  // Tenda gerobak
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(cartX, cartY, cartW, cartH * 0.25);
  // Badan gerobak
  ctx.fillStyle = '#475569';
  ctx.fillRect(cartX + cartW * 0.1, cartY + cartH * 0.25, cartW * 0.8, cartH * 0.65);
  // Roda
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(cartX + cartW * 0.25, cartY + cartH * 0.92, 6, 0, Math.PI * 2);
  ctx.arc(cartX + cartW * 0.75, cartY + cartH * 0.92, 6, 0, Math.PI * 2);
  ctx.fill();

  // OSD Timestamp CCTV
  const nowStr = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
  });
  ctx.fillStyle = 'rgba(11, 19, 43, 0.55)';
  ctx.fillRect(14, 12, Math.min(w - 28, 360), 26);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillText(`${cameraName.slice(0, 28)}  •  ${nowStr} WIB`, 22, 30);
}

// Deteksi terstruktur untuk Mode Simulasi sementara sebelum best.onnx dimuat Dev 2
function getSimulatedDetections(tick: number): RawDetection[] {
  const jitter = Math.sin(tick * 0.7) * 0.004;
  return [
    {
      className: 'PKL',
      confidence: Number((0.84 + Math.abs(Math.sin(tick * 0.4)) * 0.06).toFixed(2)),
      bboxNorm: {
        x1: 0.705 + jitter,
        y1: 0.365,
        x2: 0.845 + jitter,
        y2: 0.605,
      },
    },
  ];
}

export interface ExtendedCctvPlayerProps extends CctvPlayerWithAIProps {
  onViewOnMap?: () => void;
}

export default function CctvPlayerWithAI({
  camera,
  violationThresholdSec = DEFAULT_THRESHOLD_SEC,
  occlusionGraceSec = 45,
  hlsTimeoutMs = 5000,
  onViolationCaptured,
  onTelemetryChange,
  onViewOnMap,
}: ExtendedCctvPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamStatus, setStreamStatus] = useState<CctvStreamStatus>('INITIALIZING');
  const [useCanvasSimulation, setUseCanvasSimulation] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showRoi, setShowRoi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [telemetry, setTelemetry] = useState<CctvLiveTelemetry>({
    streamStatus: 'INITIALIZING',
    aiBackend: 'wasm',
    inferenceMs: null,
    inRoiCount: 0,
    maxDwellSeconds: 0,
    activeViolatorsCount: 0,
    tracks: [],
  });

  const aiEnabledRef = useRef(aiEnabled);
  const showRoiRef = useRef(showRoi);
  const tracksRef = useRef<TrackedObjectOverlay[]>([]);
  const streamStatusRef = useRef<CctvStreamStatus>(streamStatus);
  const useCanvasSimRef = useRef(useCanvasSimulation);
  const autoCaptureInFlightRef = useRef(false);
  const onViolationCapturedRef = useRef(onViolationCaptured);
  const onTelemetryChangeRef = useRef(onTelemetryChange);

  useEffect(() => {
    aiEnabledRef.current = aiEnabled;
  }, [aiEnabled]);

  useEffect(() => {
    showRoiRef.current = showRoi;
  }, [showRoi]);

  useEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

  useEffect(() => {
    useCanvasSimRef.current = useCanvasSimulation;
  }, [useCanvasSimulation]);

  useEffect(() => {
    onViolationCapturedRef.current = onViolationCaptured;
    onTelemetryChangeRef.current = onTelemetryChange;
  }, [onViolationCaptured, onTelemetryChange]);

  // 1. Setup HLS Direct Playback + 5-second Auto-Fallback ke Video MP4 / Simulasi
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let settled = false;
    let timeoutId: number | null = null;

    setStreamStatus('INITIALIZING');
    setUseCanvasSimulation(false);

    const activateFallback = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (hls) {
        hls.destroy();
        hls = null;
      }

      const fallbackSrc =
        camera.fallbackVideoUrl ||
        (camera.city.toLowerCase().includes('semarang')
          ? '/videos/demo-semarang.mp4'
          : '/videos/demo-jakarta.mp4');

      setStreamStatus('SIMULATION_FALLBACK');
      video.src = fallbackSrc;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.onerror = () => {
        // Jika file MP4 lokal belum disediakan oleh Dev 2, aktifkan canvas simulasi high-angle
        setUseCanvasSimulation(true);
      };
      video.play().catch(() => {
        setUseCanvasSimulation(true);
      });
    };

    const sourceUrl = camera.playbackUrl || camera.streamUrl;
    const isMixedContent =
      window.location.protocol === 'https:' && sourceUrl.startsWith('http://');

    if (camera.needsCorsProxy || isMixedContent || !sourceUrl) {
      activateFallback();
      return () => {
        if (timeoutId) window.clearTimeout(timeoutId);
      };
    }

    timeoutId = window.setTimeout(() => {
      activateFallback();
    }, hlsTimeoutMs);

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    if (Hls.isSupported() && camera.streamType === 'hls') {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: hlsTimeoutMs,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        setStreamStatus('LIVE_HLS');
        video.play().catch(() => {
          // Autoplay diblokir browser; tetap biarkan status LIVE_HLS
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          activateFallback();
        }
      });

      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
      video.onloadedmetadata = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        setStreamStatus('LIVE_HLS');
        video.play().catch(() => undefined);
      };
      video.onerror = () => activateFallback();
    } else {
      activateFallback();
    }

    return () => {
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [camera.id, camera.playbackUrl, camera.streamUrl, camera.streamType, camera.needsCorsProxy, camera.fallbackVideoUrl, camera.city, hlsTimeoutMs]);

  // 2. Canvas render loop untuk Mode Simulasi (ketika MP4 belum tersedia) + Overlay ROI & BBox
  const drawOverlay = useCallback(
    (tracks: TrackedObjectOverlay[]) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Gambar Poligon ROI Trotoar (hanya visual — logika tetap berjalan walau showRoi=false)
      if (showRoiRef.current && camera.roiPolygon && camera.roiPolygon.length >= 3) {
        ctx.save();
        ctx.beginPath();
        camera.roiPolygon.forEach(([nx, ny], idx) => {
          const x = nx * w;
          const y = ny * h;
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.stroke();
        ctx.restore();
      }

      // Gambar Bounding Box deteksi PKL + confidence score (matching docs/pages AI Detection PNG)
      if (aiEnabledRef.current) {
        for (const tr of tracks) {
          const x = tr.bboxNorm.x1 * w;
          const y = tr.bboxNorm.y1 * h;
          const bw = (tr.bboxNorm.x2 - tr.bboxNorm.x1) * w;
          const bh = (tr.bboxNorm.y2 - tr.bboxNorm.y1) * h;

          ctx.save();
          ctx.strokeStyle = tr.inRoi ? '#9EC1EB' : '#94A3B8';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x, y, bw, bh);

          const pct = Math.round(tr.confidence * 100);
          const label = `${tr.className} • ${pct}%`;
          ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
          const textW = ctx.measureText(label).width;
          const badgeH = 24;
          const badgeY = Math.max(4, y - badgeH);

          ctx.fillStyle = tr.inRoi ? '#73A6E9' : '#64748B';
          ctx.fillRect(x, badgeY, textW + 16, badgeH);
          ctx.fillStyle = '#0B132B';
          ctx.fillText(label, x + 8, badgeY + 16);
          ctx.restore();
        }
      }
    },
    [camera.roiPolygon],
  );

  // Render canvas simulasi 12 FPS bila fallback MP4 tidak tersedia
  useEffect(() => {
    if (!useCanvasSimulation) return;
    let frame = 0;
    const interval = window.setInterval(() => {
      const simCanvas = simCanvasRef.current;
      if (!simCanvas) return;
      const ctx = simCanvas.getContext('2d');
      if (!ctx) return;
      frame += 1;
      drawSimulatedHighAngleFrame(ctx, simCanvas.width, simCanvas.height, frame, camera.name);
    }, 85);
    return () => window.clearInterval(interval);
  }, [useCanvasSimulation, camera.name]);

  // Helper ambil snapshot frame (terkompresi <= 1.5 MB JPEG) + deteksi Tainted Canvas (SecurityError)
  const captureSnapshotBlob = useCallback(async (): Promise<Blob> => {
    const temp = document.createElement('canvas');
    temp.width = 960;
    temp.height = 540;
    const ctx = temp.getContext('2d');
    if (!ctx) throw new Error('Canvas snapshot tidak tersedia.');

    if (useCanvasSimRef.current && simCanvasRef.current) {
      ctx.drawImage(simCanvasRef.current, 0, 0, temp.width, temp.height);
    } else if (videoRef.current && videoRef.current.readyState >= 2) {
      try {
        ctx.drawImage(videoRef.current, 0, 0, temp.width, temp.height);
        // Verifikasi akses piksel agar SecurityError (tainted canvas) tertangkap cepat
        ctx.getImageData(0, 0, 1, 1);
      } catch {
        // Fallback otomatis jika stream eksternal menyebabkan tainted canvas
        setStreamStatus('SIMULATION_FALLBACK');
        setUseCanvasSimulation(true);
        drawSimulatedHighAngleFrame(ctx, temp.width, temp.height, 12, camera.name);
      }
    } else {
      drawSimulatedHighAngleFrame(ctx, temp.width, temp.height, 12, camera.name);
    }

    // Gabungkan overlay bbox/ROI jika aktif agar bukti jelas bagi petugas
    if (overlayCanvasRef.current) {
      ctx.drawImage(overlayCanvasRef.current, 0, 0, temp.width, temp.height);
    }

    return compressCanvasToJpegBlob(temp);
  }, [camera.name]);

  // 3. Loop Inferensi 1 FPS (terisolasi per camera.id via Map<camera_id, CameraTracker>)
  useEffect(() => {
    let tick = 0;
    const tracker = getCameraTracker(camera.id);

    const runStep = async () => {
      tick += 1;

      if (!aiEnabledRef.current) {
        tracksRef.current = [];
        drawOverlay([]);
        const pausedTelemetry: CctvLiveTelemetry = {
          streamStatus: streamStatusRef.current,
          aiBackend: 'wasm',
          inferenceMs: null,
          inRoiCount: 0,
          maxDwellSeconds: 0,
          activeViolatorsCount: 0,
          tracks: [],
        };
        setTelemetry(pausedTelemetry);
        onTelemetryChangeRef.current?.(pausedTelemetry);
        return;
      }

      // Cek tainted canvas pada LIVE_HLS secara ringan
      if (
        streamStatusRef.current === 'LIVE_HLS' &&
        !useCanvasSimRef.current &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        try {
          const probe = document.createElement('canvas');
          probe.width = 4;
          probe.height = 4;
          const pctx = probe.getContext('2d');
          pctx?.drawImage(videoRef.current, 0, 0, 4, 4);
          pctx?.getImageData(0, 0, 1, 1);
        } catch {
          // SecurityError (CORS / Tainted Canvas) -> auto-fallback ke Mode Simulasi
          setStreamStatus('SIMULATION_FALLBACK');
          setUseCanvasSimulation(true);
        }
      }

      const t0 = performance.now();
      // Catatan integrasi Dev 2: ganti getSimulatedDetections(tick) dengan inferensi YOLO26n ONNX (best.onnx)
      const detections = getSimulatedDetections(tick);
      const step = tracker.update(detections, camera.roiPolygon, {
        violationThresholdSec,
        occlusionGraceSec,
      });
      const elapsedMs = Math.max(12, Math.round(performance.now() - t0));

      tracksRef.current = step.tracks;
      drawOverlay(step.tracks);

      const nextTelemetry: CctvLiveTelemetry = {
        streamStatus: streamStatusRef.current,
        aiBackend: 'wasm',
        inferenceMs: elapsedMs,
        inRoiCount: step.inRoiCount,
        maxDwellSeconds: step.maxDwellSeconds,
        activeViolatorsCount: step.activeViolatorsCount,
        tracks: step.tracks,
      };
      setTelemetry(nextTelemetry);
      onTelemetryChangeRef.current?.(nextTelemetry);

      // Auto-Capture 1x ketika objek mencapai state REPORTED
      if (step.newlyReportedCount > 0 && !autoCaptureInFlightRef.current) {
        autoCaptureInFlightRef.current = true;
        try {
          const snapshotBlob = await captureSnapshotBlob();
          await onViolationCapturedRef.current({
            cameraId: camera.id,
            source: 'AUTO_AI',
            currentActiveViolators: Math.max(1, step.activeViolatorsCount),
            maxConfidence: step.maxConfidence || 0.85,
            isSimulationMode: streamStatusRef.current !== 'LIVE_HLS',
            snapshotBlob,
            capturedAtIso: new Date().toISOString(),
          });
          tracker.markReportedAsSuppressed();
        } catch {
          // Biarkan tracker mencoba lagi / petugas tetap dapat manual capture
        } finally {
          autoCaptureInFlightRef.current = false;
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void runStep();
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    camera.id,
    camera.roiPolygon,
    violationThresholdSec,
    occlusionGraceSec,
    drawOverlay,
    captureSnapshotBlob,
  ]);

  // Redraw overlay langsung ketika toggle visual AI/ROI berubah
  useEffect(() => {
    drawOverlay(tracksRef.current);
  }, [aiEnabled, showRoi, drawOverlay]);

  // Sync status fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Abaikan jika browser membatasi fullscreen
    }
  };

  const handleManualCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const snapshotBlob = await captureSnapshotBlob();
      const maxConf =
        telemetry.tracks.reduce((acc, t) => Math.max(acc, t.confidence), 0) || 0.85;
      await onViolationCaptured({
        cameraId: camera.id,
        source: 'MANUAL',
        currentActiveViolators: Math.max(1, telemetry.inRoiCount || telemetry.activeViolatorsCount),
        maxConfidence: maxConf,
        isSimulationMode: streamStatus !== 'LIVE_HLS',
        snapshotBlob,
        capturedAtIso: new Date().toISOString(),
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const hasRoi = Boolean(camera.roiPolygon && camera.roiPolygon.length >= 3);

  return (
    <div className="space-y-4">
      {/* Full-width 16:9 Dark Video Frame — TANPA panel Live Alert kanan & TANPA ilustrasi menutupi video */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl bg-video-frame shadow-md"
      >
        <video
          ref={videoRef}
          className={cn(
            'h-full w-full object-cover',
            useCanvasSimulation && 'hidden',
          )}
          muted
          playsInline
          crossOrigin="anonymous"
        />

        {useCanvasSimulation && (
          <canvas
            ref={simCanvasRef}
            width={960}
            height={540}
            className="h-full w-full object-cover"
          />
        )}

        {/* Transparent AI & ROI Canvas Overlay */}
        <canvas
          ref={overlayCanvasRef}
          width={960}
          height={540}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Top-Left Stream Status Pill (Transparan: LIVE HLS vs Mode Simulasi) */}
        <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
          {streamStatus === 'INITIALIZING' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Menghubungkan Live HLS...
            </span>
          )}
          {streamStatus === 'LIVE_HLS' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
              LIVE HLS
            </span>
          )}
          {streamStatus === 'SIMULATION_FALLBACK' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/85 px-3 py-1 text-xs font-semibold text-amber-200 backdrop-blur-sm">
              <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              Live CCTV Offline — Mode Simulasi
            </span>
          )}
          {!hasRoi && (
            <span className="rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur-sm">
              Area Penuh (Full-Frame)
            </span>
          )}
        </div>

        {/* Bottom-Right Floating Controls (matching docs/pages Inspect & AI+ROI PNGs) */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-wrap items-center gap-2">
          {/* AI Detection Toggle */}
          <button
            type="button"
            onClick={() => setAiEnabled((prev) => !prev)}
            className="flex flex-col items-center rounded-xl bg-[#9EC1EB]/90 px-3.5 py-2 text-primary shadow-md backdrop-blur-sm transition hover:bg-[#9EC1EB]"
          >
            <span className="text-[11px] font-semibold leading-none">AI Detection</span>
            <span className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  aiEnabled ? 'bg-primary' : 'bg-white/90',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full transition-transform',
                    aiEnabled
                      ? 'translate-x-[18px] bg-white'
                      : 'translate-x-1 bg-slate-300',
                  )}
                />
              </span>
              <span className="w-6 text-left text-[11px] font-bold">
                {aiEnabled ? 'ON' : 'OFF'}
              </span>
            </span>
          </button>

          {/* Show ROI Trotoar Toggle (hanya visual, tidak mematikan logika ROI) */}
          <button
            type="button"
            onClick={() => setShowRoi((prev) => !prev)}
            title={
              hasRoi
                ? 'Menyembunyikan/menampilkan garis visual ROI tanpa mematikan pengecekan zona'
                : 'Kamera ini menggunakan mode Area Penuh (Full-Frame)'
            }
            className="flex flex-col items-center rounded-xl bg-[#9EC1EB]/90 px-3.5 py-2 text-primary shadow-md backdrop-blur-sm transition hover:bg-[#9EC1EB]"
          >
            <span className="text-[11px] font-semibold leading-none">Show ROI Trotoar</span>
            <span className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  showRoi ? 'bg-primary' : 'bg-white/90',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full transition-transform',
                    showRoi
                      ? 'translate-x-[18px] bg-white'
                      : 'translate-x-1 bg-slate-300',
                  )}
                />
              </span>
              <span className="w-6 text-left text-[11px] font-bold">
                {showRoi ? 'ON' : 'OFF'}
              </span>
            </span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl bg-[#9EC1EB]/90 px-3 text-primary shadow-md backdrop-blur-sm transition hover:bg-[#9EC1EB]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
            <span className="mt-1 text-[11px] font-semibold leading-none">
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </span>
          </button>
        </div>
      </div>

      {/* 1 Clean Action Bar directly below video (matching docs/pages PNGs) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        {/* Left Real-Time Detection Status Pill */}
        <div
          className={cn(
            'flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold',
            telemetry.inRoiCount > 0 && aiEnabled
              ? 'bg-[#D8E7FA] text-primary'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
          )}
        >
          {telemetry.inRoiCount > 0 && aiEnabled ? (
            <>
              <AlertTriangle className="h-5 w-5 shrink-0 fill-red-700 text-white" />
              <span className="leading-snug">
                {telemetry.inRoiCount} PKL Terdeteksi di Zona Terlarang{' '}
                <span className="font-mono">
                  • {telemetry.maxDwellSeconds}s / {violationThresholdSec}s
                </span>
              </span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              <span>
                {aiEnabled
                  ? 'Area Terpantau Aman • 0 PKL di ROI Trotoar'
                  : 'Deteksi AI Dijeda (Video Tetap Berjalan)'}
              </span>
            </>
          )}
        </div>

        {/* Right Primary Actions */}
        <div className="flex flex-wrap items-start gap-2.5">
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={isCapturing}
              onClick={() => void handleManualCapture()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isCapturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <span>Capture &amp; Report</span>
            </button>
            <span className="mt-1 text-[11px] font-medium text-primary/70">
              Auto-capture active ({violationThresholdSec}s)
            </span>
          </div>

          {onViewOnMap && (
            <button
              type="button"
              onClick={onViewOnMap}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              <MapIcon className="h-4 w-4" />
              <span>View on Map</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
