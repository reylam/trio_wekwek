import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Camera,
  Check,
  Cpu,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { compressCanvasToJpegBlob } from '@/lib/imageCompress';
import { cctvApi } from '@/services/api';
import {
  getCameraTracker,
  type RawDetection,
} from '@/services/yolo/roiAndTracker';
import {
  ensureYoloSession,
  runYoloInference,
  type YoloBackend,
} from '@/services/yolo/yoloInference';
import type {
  CctvLiveTelemetry,
  CctvPlayerWithAIProps,
  CctvStreamStatus,
  NormalizedPolygon,
  TrackedObjectOverlay,
} from '@/types';
import { cn } from '@/lib/utils';

const DEFAULT_THRESHOLD_SEC = Number(
  import.meta.env.VITE_VIOLATION_THRESHOLD_SEC || 15,
);

export interface ExtendedCctvPlayerProps extends CctvPlayerWithAIProps {
  onViewOnMap?: () => void;
}

export default function CctvPlayerWithAI({
  camera,
  violationThresholdSec = DEFAULT_THRESHOLD_SEC,
  occlusionGraceSec = 45,
  hlsTimeoutMs = 8000,
  onViolationCaptured,
  onTelemetryChange,
  onViewOnMap,
}: ExtendedCctvPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamStatus, setStreamStatus] = useState<CctvStreamStatus>('INITIALIZING');
  const [corsRestricted, setCorsRestricted] = useState(false);
  const [offlineReason, setOfflineReason] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const [aiEnabled, setAiEnabled] = useState(true);
  const [showRoi, setShowRoi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [aiBackend, setAiBackend] = useState<YoloBackend | null>(null);

  // State ROI aktif (mendukung edit interaktif langsung di atas video CCTV)
  const [activeRoi, setActiveRoi] = useState<NormalizedPolygon | null>(
    camera.roiPolygon ?? null,
  );
  const [isEditingRoi, setIsEditingRoi] = useState(false);
  const [draftRoi, setDraftRoi] = useState<NormalizedPolygon>([]);
  const [isSavingRoi, setIsSavingRoi] = useState(false);

  const [telemetry, setTelemetry] = useState<CctvLiveTelemetry>({
    streamStatus: 'INITIALIZING',
    aiBackend: null,
    inferenceMs: null,
    inRoiCount: 0,
    maxDwellSeconds: 0,
    activeViolatorsCount: 0,
    tracks: [],
  });

  const aiEnabledRef = useRef(aiEnabled);
  const showRoiRef = useRef(showRoi);
  const activeRoiRef = useRef<NormalizedPolygon | null>(activeRoi);
  const isEditingRoiRef = useRef(isEditingRoi);
  const draftRoiRef = useRef<NormalizedPolygon>(draftRoi);
  const tracksRef = useRef<TrackedObjectOverlay[]>([]);
  const streamStatusRef = useRef<CctvStreamStatus>(streamStatus);
  const corsRestrictedRef = useRef(corsRestricted);
  const inferenceInFlightRef = useRef(false);
  const autoCaptureInFlightRef = useRef(false);
  const onViolationCapturedRef = useRef(onViolationCaptured);
  const onTelemetryChangeRef = useRef(onTelemetryChange);

  useEffect(() => {
    setActiveRoi(camera.roiPolygon ?? null);
    setIsEditingRoi(false);
    setDraftRoi([]);
    tracksRef.current = [];
  }, [camera.id, camera.roiPolygon]);

  useEffect(() => {
    aiEnabledRef.current = aiEnabled;
  }, [aiEnabled]);

  useEffect(() => {
    showRoiRef.current = showRoi;
  }, [showRoi]);

  useEffect(() => {
    activeRoiRef.current = activeRoi;
  }, [activeRoi]);

  useEffect(() => {
    isEditingRoiRef.current = isEditingRoi;
    draftRoiRef.current = draftRoi;
  }, [isEditingRoi, draftRoi]);

  useEffect(() => {
    streamStatusRef.current = streamStatus;
  }, [streamStatus]);

  useEffect(() => {
    corsRestrictedRef.current = corsRestricted;
  }, [corsRestricted]);

  useEffect(() => {
    onViolationCapturedRef.current = onViolationCaptured;
    onTelemetryChangeRef.current = onTelemetryChange;
  }, [onViolationCaptured, onTelemetryChange]);

  // Preload model ONNX (/models/best.onnx) saat komponen dibuka
  useEffect(() => {
    let active = true;
    setModelStatus('loading');
    ensureYoloSession()
      .then((loaded) => {
        if (!active) return;
        setAiBackend(loaded.backend);
        setModelStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setModelStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  // 1. Setup Live HLS Direct Playback (tanpa mode simulasi — fallback non-CORS jika server membatasi canvas)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let cancelled = false;
    let timeoutId: number | null = null;

    setStreamStatus('INITIALIZING');
    setCorsRestricted(false);
    setOfflineReason(null);

    const sourceUrl = camera.playbackUrl || camera.streamUrl;
    const isMixedContent =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      sourceUrl.startsWith('http://');

    if (!sourceUrl) {
      setStreamStatus('ERROR');
      setOfflineReason('URL stream kamera tidak tersedia.');
      return;
    }

    if (isMixedContent) {
      setStreamStatus('ERROR');
      setOfflineReason('Stream HTTP tidak dapat diputar langsung pada halaman HTTPS.');
      return;
    }

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };

    const markOffline = (reason: string) => {
      cleanup();
      if (!cancelled) {
        setStreamStatus('ERROR');
        setOfflineReason(reason);
      }
    };

    const connectStream = (withCors: boolean) => {
      if (cancelled) return;
      cleanup();

      let settled = false;
      video.muted = true;
      video.playsInline = true;
      if (withCors) {
        video.crossOrigin = 'anonymous';
      } else {
        video.removeAttribute('crossorigin');
      }

      timeoutId = window.setTimeout(() => {
        if (settled || cancelled) return;
        if (withCors) {
          connectStream(false);
        } else {
          markOffline('Stream CCTV tidak merespons (timeout). Server Pemda mungkin sedang offline.');
        }
      }, hlsTimeoutMs);

      if (Hls.isSupported() && camera.streamType === 'hls') {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: hlsTimeoutMs,
          fragLoadingTimeOut: hlsTimeoutMs,
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (settled || cancelled) return;
          settled = true;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          setCorsRestricted(!withCors);
          setStreamStatus('LIVE_HLS');
          video.play().catch(() => {
            // Biarkan status LIVE_HLS bila autoplay dibatasi browser
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return;
          if (withCors) {
            settled = true;
            connectStream(false);
          } else {
            markOffline('Gagal memuat stream HLS dari server CCTV Pemda.');
          }
        });

        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = sourceUrl;
        video.onloadedmetadata = () => {
          if (settled || cancelled) return;
          settled = true;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          setCorsRestricted(!withCors);
          setStreamStatus('LIVE_HLS');
          video.play().catch(() => undefined);
        };
        video.onerror = () => {
          if (withCors) {
            settled = true;
            connectStream(false);
          } else {
            markOffline('Stream kamera tidak dapat diputar oleh browser ini.');
          }
        };
      } else {
        markOffline('Browser tidak mendukung pemutaran HLS.');
      }
    };

    // Jika kamera diketahui butuh proxy CORS, langsung putar mode non-CORS agar video live tetap tampil
    connectStream(!camera.needsCorsProxy);

    return () => {
      cancelled = true;
      cleanup();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [
    camera.id,
    camera.playbackUrl,
    camera.streamUrl,
    camera.streamType,
    camera.needsCorsProxy,
    hlsTimeoutMs,
    retryNonce,
  ]);

  // 2. Overlay Canvas untuk ROI Trotoar (Poligon / Full-Frame / Mode Edit) + Bounding Box Deteksi AI
  const drawOverlay = useCallback((tracks: TrackedObjectOverlay[]) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const drawRoiLabel = (x: number, y: number, text: string, bgColor: string) => {
      ctx.save();
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(text).width;
      const lx = Math.max(12, Math.min(w - tw - 24, x));
      const ly = Math.max(24, Math.min(h - 12, y));
      ctx.fillStyle = bgColor;
      ctx.fillRect(lx, ly - 18, tw + 16, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, lx + 8, ly - 3);
      ctx.restore();
    };

    // A. Mode Edit ROI interaktif
    if (isEditingRoiRef.current) {
      const pts = draftRoiRef.current;
      if (pts.length > 0) {
        ctx.save();
        ctx.beginPath();
        pts.forEach(([nx, ny], idx) => {
          const px = nx * w;
          const py = ny * h;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (pts.length >= 3) {
          ctx.closePath();
          ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
          ctx.fill();
        }
        ctx.strokeStyle = '#F87171';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        pts.forEach(([nx, ny], idx) => {
          const px = nx * w;
          const py = ny * h;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#DC2626';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.fillText(String(idx + 1), px - 3, py + 3.5);
        });
        ctx.restore();
      }
      drawRoiLabel(
        18,
        h - 24,
        pts.length < 3
          ? `MODE EDIT ROI: Klik minimal 3 titik area trotoar (${pts.length}/3)`
          : `MODE EDIT ROI: ${pts.length} titik — klik "Simpan ROI" untuk menerapkan`,
        'rgba(185, 28, 28, 0.92)',
      );
    } else if (showRoiRef.current) {
      // B. Visual ROI Trotoar (poligon kustom / full-frame)
      const poly = activeRoiRef.current;
      if (poly && poly.length >= 3) {
        ctx.save();
        ctx.beginPath();
        poly.forEach(([nx, ny], idx) => {
          const x = nx * w;
          const y = ny * h;
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 7]);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const [nx, ny] of poly) {
          ctx.beginPath();
          ctx.arc(nx * w, ny * h, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#EF4444';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
        }
        ctx.restore();

        const topPt = poly.reduce((acc, p) => (p[1] < acc[1] ? p : acc), poly[0]!);
        drawRoiLabel(topPt[0] * w, topPt[1] * h - 6, 'ROI TROTOAR', 'rgba(220, 38, 38, 0.9)');
      } else {
        const pad = 18;
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
        ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
        ctx.restore();

        drawRoiLabel(
          pad + 8,
          h - pad - 10,
          'ROI TROTOAR • AREA PENUH (FULL-FRAME)',
          'rgba(185, 28, 28, 0.85)',
        );
      }
    }

    // C. Bounding Box deteksi PKL nyata dari YOLO ONNX
    if (aiEnabledRef.current) {
      for (const tr of tracks) {
        const x = tr.bboxNorm.x1 * w;
        const y = tr.bboxNorm.y1 * h;
        const bw = (tr.bboxNorm.x2 - tr.bboxNorm.x1) * w;
        const bh = (tr.bboxNorm.y2 - tr.bboxNorm.y1) * h;

        ctx.save();
        ctx.strokeStyle = tr.inRoi ? '#38BDF8' : '#94A3B8';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, bw, bh);

        ctx.beginPath();
        ctx.arc(x + bw / 2, y + bh, 4, 0, Math.PI * 2);
        ctx.fillStyle = tr.inRoi ? '#EF4444' : '#94A3B8';
        ctx.fill();

        const pct = Math.round(tr.confidence * 100);
        const dwellLabel = tr.inRoi && tr.dwellSeconds > 0 ? ` • ${tr.dwellSeconds}s` : '';
        const label = `${tr.className} ${pct}%${dwellLabel}`;
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        const textW = ctx.measureText(label).width;
        const badgeH = 24;
        const badgeY = Math.max(4, y - badgeH);

        ctx.fillStyle = tr.inRoi ? '#043FA5' : '#475569';
        ctx.fillRect(x, badgeY, textW + 16, badgeH);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, x + 8, badgeY + 16);
        ctx.restore();
      }
    }
  }, []);

  // Helper ambil snapshot frame live (terkompresi <= 1.5 MB JPEG)
  const captureSnapshotBlob = useCallback(async (): Promise<Blob> => {
    const temp = document.createElement('canvas');
    temp.width = 960;
    temp.height = 540;
    const ctx = temp.getContext('2d');
    if (!ctx) throw new Error('Canvas snapshot tidak tersedia.');

    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      throw new Error('Frame video kamera belum siap untuk ditangkap.');
    }

    try {
      ctx.drawImage(video, 0, 0, temp.width, temp.height);
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      throw new Error(
        'Server CCTV ini membatasi akses piksel lintas domain (CORS), sehingga tangkap layar otomatis dari browser tidak diizinkan.',
      );
    }

    if (overlayCanvasRef.current) {
      ctx.drawImage(overlayCanvasRef.current, 0, 0, temp.width, temp.height);
    }

    return compressCanvasToJpegBlob(temp);
  }, []);

  // 3. Loop Inferensi 1 FPS nyata via ONNX Runtime Web (/models/best.onnx)
  useEffect(() => {
    const tracker = getCameraTracker(camera.id);

    const runStep = async () => {
      if (inferenceInFlightRef.current) return;
      inferenceInFlightRef.current = true;

      try {
        if (!aiEnabledRef.current || streamStatusRef.current !== 'LIVE_HLS') {
          tracksRef.current = [];
          drawOverlay([]);
          const idleTelemetry: CctvLiveTelemetry = {
            streamStatus: streamStatusRef.current,
            aiBackend,
            inferenceMs: null,
            inRoiCount: 0,
            maxDwellSeconds: 0,
            activeViolatorsCount: 0,
            tracks: [],
          };
          setTelemetry(idleTelemetry);
          onTelemetryChangeRef.current?.(idleTelemetry);
          return;
        }

        let detections: RawDetection[] = [];
        let elapsedMs: number | null = null;
        let usedBackend: YoloBackend | null = aiBackend;

        const videoEl = videoRef.current;
        const canRunOnRealVideo =
          !corsRestrictedRef.current &&
          Boolean(
            videoEl &&
              videoEl.readyState >= 2 &&
              videoEl.videoWidth > 0 &&
              videoEl.videoHeight > 0,
          );

        if (canRunOnRealVideo && videoEl) {
          try {
            const out = await runYoloInference(videoEl, { confThresh: 0.25, iouNms: 0.45 });
            usedBackend = out.backend;
            setAiBackend(out.backend);
            setModelStatus('ready');

            if (out.tainted) {
              setCorsRestricted(true);
              detections = [];
              elapsedMs = null;
            } else {
              detections = out.detections;
              elapsedMs = out.inferenceMs;
            }
          } catch {
            detections = [];
            elapsedMs = null;
          }
        }

        const step = tracker.update(detections, activeRoiRef.current, {
          violationThresholdSec,
          occlusionGraceSec,
        });

        tracksRef.current = step.tracks;
        drawOverlay(step.tracks);

        const nextTelemetry: CctvLiveTelemetry = {
          streamStatus: streamStatusRef.current,
          aiBackend: usedBackend,
          inferenceMs: elapsedMs,
          inRoiCount: step.inRoiCount,
          maxDwellSeconds: step.maxDwellSeconds,
          activeViolatorsCount: step.activeViolatorsCount,
          tracks: step.tracks,
        };
        setTelemetry(nextTelemetry);
        onTelemetryChangeRef.current?.(nextTelemetry);

        // Auto-Capture 1x ketika objek nyata mencapai state REPORTED
        if (step.newlyReportedCount > 0 && !autoCaptureInFlightRef.current) {
          autoCaptureInFlightRef.current = true;
          try {
            const snapshotBlob = await captureSnapshotBlob();
            await onViolationCapturedRef.current({
              cameraId: camera.id,
              source: 'AUTO_AI',
              currentActiveViolators: Math.max(1, step.activeViolatorsCount),
              maxConfidence: step.maxConfidence || 0.85,
              isSimulationMode: false,
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
      } finally {
        inferenceInFlightRef.current = false;
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
    aiBackend,
    violationThresholdSec,
    occlusionGraceSec,
    drawOverlay,
    captureSnapshotBlob,
  ]);

  // Redraw overlay langsung ketika toggle visual AI/ROI atau draft titik ROI berubah
  useEffect(() => {
    drawOverlay(tracksRef.current);
  }, [aiEnabled, showRoi, activeRoi, isEditingRoi, draftRoi, drawOverlay]);

  // Sync status fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleOverlayClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isEditingRoi) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Number(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)).toFixed(4));
    const ny = Number(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)).toFixed(4));
    setDraftRoi((prev) => [...prev, [nx, ny]]);
  };

  const handleSaveRoi = async (polygon: NormalizedPolygon | null) => {
    setIsSavingRoi(true);
    try {
      await cctvApi.updateRoi(camera.id, polygon);
      setActiveRoi(polygon);
      setIsEditingRoi(false);
      setDraftRoi([]);
      setShowRoi(true);
    } finally {
      setIsSavingRoi(false);
    }
  };

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
    if (isCapturing || streamStatus !== 'LIVE_HLS') return;
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
        isSimulationMode: false,
        snapshotBlob,
        capturedAtIso: new Date().toISOString(),
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const hasRoi = Boolean(activeRoi && activeRoi.length >= 3);
  const canCapture = streamStatus === 'LIVE_HLS' && !corsRestricted;

  return (
    <div className="animate-patra-enter space-y-4">
      {/* Full-width 16:9 Live CCTV Video Frame */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl bg-video-frame shadow-lg ring-1 ring-primary/15"
      >
        <video
          ref={videoRef}
          className={cn(
            'h-full w-full object-fill transition-opacity duration-500',
            streamStatus === 'LIVE_HLS' ? 'opacity-100' : 'opacity-20',
          )}
          muted
          playsInline
        />

        {/* Subtle AI Vision Scanline Sweep Animation saat LIVE + AI aktif */}
        {streamStatus === 'LIVE_HLS' && aiEnabled && !corsRestricted && !isEditingRoi && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-patra-scan h-16 w-full bg-gradient-to-b from-transparent via-sky-400/15 to-transparent" />
          </div>
        )}

        {/* Transparent AI & ROI Canvas Overlay */}
        <canvas
          ref={overlayCanvasRef}
          width={960}
          height={540}
          onClick={handleOverlayClick}
          className={cn(
            'absolute inset-0 h-full w-full',
            isEditingRoi ? 'z-10 cursor-crosshair' : 'pointer-events-none',
          )}
        />

        {/* Loading Overlay saat menghubungkan stream */}
        {streamStatus === 'INITIALIZING' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/55 text-white backdrop-blur-[2px]">
            <div className="animate-patra-glow flex h-14 w-14 items-center justify-center rounded-full bg-primary/30 ring-1 ring-accent/50">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
            </div>
            <p className="mt-3 text-sm font-semibold tracking-tight">
              Menghubungkan Live CCTV {camera.city}...
            </p>
            <p className="mt-1 text-xs text-blue-100/75">{camera.name}</p>
          </div>
        )}

        {/* Offline / Error Overlay (tanpa mode simulasi palsu) */}
        {streamStatus === 'ERROR' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-[#0F1B36] via-[#0B132B] to-[#070C1C] px-6 text-center text-white">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-400/30">
              <WifiOff className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base font-bold text-white">
              Kamera CCTV Sedang Offline
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-300">
              {offlineReason ??
                'Feed langsung dari server Pemda belum merespons. Silakan coba muat ulang atau pilih kamera rekomendasi di bawah.'}
            </p>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow transition hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Coba Hubungkan Ulang</span>
            </button>
          </div>
        )}

        {/* Top-Left Stream & AI Model Status Pill */}
        <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2">
          {streamStatus === 'INITIALIZING' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Menghubungkan Live HLS...
            </span>
          )}
          {streamStatus === 'LIVE_HLS' && !corsRestricted && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/85 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
              LIVE HLS • {camera.city}
            </span>
          )}
          {streamStatus === 'LIVE_HLS' && corsRestricted && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/85 px-3 py-1 text-xs font-semibold text-amber-200 backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5 animate-pulse text-amber-400" />
              LIVE HLS (AI Terbatas CORS)
            </span>
          )}
          {streamStatus === 'ERROR' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/85 px-3 py-1 text-xs font-semibold text-red-200 backdrop-blur-sm">
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
              Kamera Offline
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 font-mono text-[11px] font-medium text-blue-100 backdrop-blur-sm">
            <Cpu className="h-3 w-3 text-accent" />
            {modelStatus === 'loading'
              ? 'Memuat best.onnx...'
              : modelStatus === 'ready'
                ? `YOLO ONNX (${(aiBackend ?? 'wasm').toUpperCase()})${telemetry.inferenceMs ? ` • ${telemetry.inferenceMs}ms` : ''}`
                : 'Model ONNX Error'}
          </span>
          <span className="rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-slate-200 backdrop-blur-sm">
            {hasRoi ? `ROI Trotoar (${activeRoi?.length} titik)` : 'Area Penuh (Full-Frame)'}
          </span>
        </div>

        {/* Top-Right ROI Drawing Controls saat Mode Edit ROI aktif */}
        {isEditingRoi && (
          <div className="animate-patra-enter absolute right-4 top-4 z-20 flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-950/85 p-2 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              disabled={draftRoi.length < 3 || isSavingRoi}
              onClick={() => void handleSaveRoi(draftRoi)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Simpan ROI
            </button>
            <button
              type="button"
              disabled={draftRoi.length === 0 || isSavingRoi}
              onClick={() => setDraftRoi((prev) => prev.slice(0, -1))}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo
            </button>
            {hasRoi && (
              <button
                type="button"
                disabled={isSavingRoi}
                onClick={() => void handleSaveRoi(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                Full-Frame
              </button>
            )}
            <button
              type="button"
              disabled={isSavingRoi}
              onClick={() => {
                setIsEditingRoi(false);
                setDraftRoi([]);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
              Batal
            </button>
          </div>
        )}

        {/* Bottom-Right Floating Controls */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-wrap items-center gap-2">
          {/* Edit ROI Trotoar Button */}
          <button
            type="button"
            onClick={() => {
              if (isEditingRoi) {
                setIsEditingRoi(false);
                setDraftRoi([]);
              } else {
                setShowRoi(true);
                setDraftRoi([]);
                setIsEditingRoi(true);
              }
            }}
            className={cn(
              'flex h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl px-3 shadow-md backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 active:translate-y-0',
              isEditingRoi
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-[#9EC1EB]/90 text-primary hover:bg-[#9EC1EB]',
            )}
          >
            <Pencil className="h-4 w-4" />
            <span className="mt-1 text-[11px] font-semibold leading-none">
              {isEditingRoi ? 'Editing...' : 'Atur ROI'}
            </span>
          </button>

          {/* AI Detection Toggle */}
          <button
            type="button"
            onClick={() => setAiEnabled((prev) => !prev)}
            className="flex flex-col items-center rounded-xl bg-[#9EC1EB]/90 px-3.5 py-2 text-primary shadow-md backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#9EC1EB] active:translate-y-0"
          >
            <span className="text-[11px] font-semibold leading-none">AI Detection</span>
            <span className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
                  aiEnabled ? 'bg-primary' : 'bg-white/90',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-200',
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

          {/* Show ROI Trotoar Toggle */}
          <button
            type="button"
            onClick={() => setShowRoi((prev) => !prev)}
            title={
              hasRoi
                ? 'Menyembunyikan/menampilkan garis visual ROI tanpa mematikan pengecekan zona'
                : 'Menampilkan batas area pantau Full-Frame (klik Atur ROI untuk menggambar poligon trotoar)'
            }
            className="flex flex-col items-center rounded-xl bg-[#9EC1EB]/90 px-3.5 py-2 text-primary shadow-md backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#9EC1EB] active:translate-y-0"
          >
            <span className="text-[11px] font-semibold leading-none">Show ROI Trotoar</span>
            <span className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
                  showRoi ? 'bg-primary' : 'bg-white/90',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full transition-transform duration-200',
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
            className="flex h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl bg-[#9EC1EB]/90 px-3 text-primary shadow-md backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#9EC1EB] active:translate-y-0"
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

      {/* 1 Clean Action Bar directly below video */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        {/* Left Real-Time Detection Status Pill */}
        <div
          className={cn(
            'flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-300',
            streamStatus === 'ERROR'
              ? 'border border-red-200 bg-red-50 text-red-800'
              : corsRestricted
                ? 'border border-amber-200 bg-amber-50 text-amber-800'
                : telemetry.inRoiCount > 0 && aiEnabled
                  ? 'animate-patra-glow bg-[#D8E7FA] text-primary'
                  : 'border border-emerald-200/80 bg-emerald-50 text-emerald-800',
          )}
        >
          {streamStatus === 'ERROR' ? (
            <>
              <WifiOff className="h-5 w-5 shrink-0 text-red-600" />
              <span>Kamera sedang offline — pilih kamera aktif lainnya pada rekomendasi di bawah.</span>
            </>
          ) : corsRestricted ? (
            <>
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <span>
                Live video aktif, tetapi server kamera ini membatasi akses piksel CORS untuk inferensi AI browser.
              </span>
            </>
          ) : telemetry.inRoiCount > 0 && aiEnabled ? (
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
                  : 'Deteksi AI Dijeda (Video Live Tetap Berjalan)'}
              </span>
            </>
          )}
        </div>

        {/* Right Primary Actions */}
        <div className="flex flex-wrap items-start gap-2.5">
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={isCapturing || !canCapture}
              onClick={() => void handleManualCapture()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0"
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
