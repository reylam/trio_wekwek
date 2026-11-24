import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Radio, Video, WifiOff } from 'lucide-react';
import {
  isThumbnailFailureFresh,
  resolveThumbnailGrabStrategy,
  setBoundedCacheEntry,
} from '@/lib/cameraThumbnailHelpers';
import type { CctvCameraDto } from '@/types';

// Cache snapshot thumbnail per camera.id selama sesi browser agar hemat bandwidth
const thumbnailCache = new Map<string, string>();
const failedCache = new Map<string, number>();

// Antrean konkurensi ringan (maks 2 koneksi HLS thumbnail bersamaan agar tidak membanjiri server Pemda)
const MAX_CONCURRENT_GRABS = 2;
let activeGrabs = 0;
const grabQueue: Array<() => void> = [];

function acquireGrabSlot(run: () => void) {
  if (activeGrabs < MAX_CONCURRENT_GRABS) {
    activeGrabs += 1;
    run();
  } else {
    grabQueue.push(run);
  }
}

function releaseGrabSlot() {
  activeGrabs = Math.max(0, activeGrabs - 1);
  const next = grabQueue.shift();
  if (next) {
    activeGrabs += 1;
    next();
  }
}

export default function CameraThumbnail({ camera }: { camera: CctvCameraDto }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [inView, setInView] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(
    () => camera.thumbnailUrl || thumbnailCache.get(camera.id) || null,
  );
  const [livePausedFallback, setLivePausedFallback] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>(() => {
    if (camera.thumbnailUrl || thumbnailCache.get(camera.id)) return 'ready';
    if (isThumbnailFailureFresh(failedCache, camera.id)) return 'offline';
    return 'idle';
  });

  // 1. Lazy-load hanya ketika kartu masuk viewport
  useEffect(() => {
    if (capturedUrl || status === 'offline') return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [capturedUrl, status]);

  // 2. Ambil 1 frame nyata dari live HLS stream -> render ke dataURL -> langsung hls.destroy()
  useEffect(() => {
    if (!inView || capturedUrl || isThumbnailFailureFresh(failedCache, camera.id)) return;

    const strategy = resolveThumbnailGrabStrategy(camera);
    if (!strategy.canGrab) {
      failedCache.set(camera.id, Date.now());
      setStatus('offline');
      return;
    }
    const { sourceUrl, startWithCors } = strategy;

    let cancelled = false;
    let slotAcquired = false;
    let hls: Hls | null = null;
    let timeoutId: number | null = null;
    let keepPausedVideo = false;

    const cleanupHlsOnly = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };

    const finishSlot = () => {
      if (slotAcquired) {
        slotAcquired = false;
        releaseGrabSlot();
      }
    };

    const markUnavailable = () => {
      cleanupHlsOnly();
      finishSlot();
      if (!cancelled) {
        failedCache.set(camera.id, Date.now());
        setStatus('offline');
      }
    };

    const startGrab = (withCors: boolean) => {
      if (cancelled) {
        finishSlot();
        return;
      }

      const video = videoRef.current;
      if (!video) {
        markUnavailable();
        return;
      }

      let attemptSettled = false;
      setStatus('loading');
      video.muted = true;
      video.playsInline = true;
      if (withCors) {
        video.crossOrigin = 'anonymous';
      } else {
        video.removeAttribute('crossorigin');
      }

      const clearVideoHandlers = () => {
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onerror = null;
      };

      const fallbackOrFail = () => {
        if (attemptSettled || cancelled) return;
        attemptSettled = true;
        clearVideoHandlers();
        if (withCors) {
          cleanupHlsOnly();
          startGrab(false);
        } else {
          markUnavailable();
        }
      };

      timeoutId = window.setTimeout(fallbackOrFail, 8000);

      const handleFrameReady = () => {
        if (attemptSettled || cancelled) return;
        if (!video.videoWidth || !video.videoHeight) return;
        attemptSettled = true;
        clearVideoHandlers();

        if (withCors) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 270;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
              setBoundedCacheEntry(thumbnailCache, camera.id, dataUrl);
              cleanupHlsOnly();
              video.pause();
              video.removeAttribute('src');
              video.load();
              finishSlot();
              setCapturedUrl(dataUrl);
              setStatus('ready');
              return;
            }
          } catch {
            // Tainted canvas: coba mode non-CORS paused frame agar gambar kamera tetap tampil
            cleanupHlsOnly();
            startGrab(false);
            return;
          }
        }

        // Mode paused-frame (CORS tidak mengizinkan toDataURL, tapi video frame tetap tampil!)
        keepPausedVideo = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        video.pause();
        hls?.stopLoad();
        finishSlot();
        setLivePausedFallback(true);
        setStatus('ready');
      };

      video.onloadeddata = handleFrameReady;
      video.oncanplay = handleFrameReady;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 3,
          maxMaxBufferLength: 5,
          manifestLoadingTimeOut: 7500,
          fragLoadingTimeOut: 7500,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            // Sebagian browser tetap memicu loadeddata meski autoplay dibatasi
          });
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fallbackOrFail();
          }
        });
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = sourceUrl;
        video.onerror = fallbackOrFail;
      } else {
        attemptSettled = true;
        clearVideoHandlers();
        markUnavailable();
      }
    };

    acquireGrabSlot(() => {
      if (cancelled) {
        releaseGrabSlot();
        return;
      }
      slotAcquired = true;
      startGrab(startWithCors);
    });

    return () => {
      cancelled = true;
      if (!keepPausedVideo) {
        cleanupHlsOnly();
      } else if (hls) {
        hls.destroy();
        hls = null;
      }
      finishSlot();
    };
  }, [inView, capturedUrl, camera.id, camera.playbackUrl, camera.streamUrl, camera.needsCorsProxy, camera.streamType]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#0B132B]">
      {/* Video tersembunyi / paused-frame untuk menangkap thumbnail nyata kamera */}
      {!capturedUrl && (
        <video
          ref={videoRef}
          muted
          playsInline
          className={
            livePausedFallback
              ? 'h-full w-full object-cover transition duration-300 group-hover:scale-105'
              : 'pointer-events-none absolute h-full w-full opacity-0'
          }
        />
      )}

      {/* Thumbnail gambar nyata hasil tangkapan kamera */}
      {capturedUrl && (
        <img
          src={capturedUrl}
          alt={camera.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      )}

      {/* Fallback visual saat loading / offline */}
      {!capturedUrl && !livePausedFallback && (
        <div className="relative flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#16233E] via-[#1E3359] to-[#0B132B] p-3 text-white">
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-blue-100/80">
            <span className="truncate">{camera.district ?? camera.city}</span>
            <span className="rounded bg-slate-900/70 px-1.5 py-0.5 text-[9px] uppercase text-accent">
              {camera.streamType}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center gap-1.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-accent ring-1 ring-white/20 backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-primary group-hover:text-white">
              {status === 'offline' ? (
                <WifiOff className="h-4 w-4 text-amber-300" />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </span>
            <span className="px-2 text-center text-[10px] font-medium text-blue-100/75">
              {status === 'offline'
                ? 'Pratinjau belum tersedia — klik Inspect'
                : status === 'loading'
                  ? 'Memuat pratinjau kamera...'
                  : 'Klik untuk Inspect'}
            </span>
          </div>

          <div className="flex items-center justify-between font-mono text-[10px] text-blue-100/70">
            <span className="truncate">{camera.attribution}</span>
            <span>{camera.roiPolygon ? 'ROI Trotoar' : 'Full-Frame'}</span>
          </div>
        </div>
      )}

      {/* Overlay badge ringan di atas gambar kamera nyata */}
      {(capturedUrl || livePausedFallback) && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-slate-950/70 via-slate-950/25 to-transparent px-3 py-2 font-mono text-[10px] text-white">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[9px] font-semibold text-emerald-200 backdrop-blur-sm">
              <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-400" />
              LIVE
            </span>
            <span className="rounded bg-slate-950/65 px-1.5 py-0.5 text-[9px] text-blue-100 backdrop-blur-sm">
              {camera.roiPolygon ? 'ROI Trotoar' : 'Full-Frame'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
