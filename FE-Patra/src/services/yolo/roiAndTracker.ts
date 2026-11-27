// Modul terisolasi untuk evaluasi Poligon ROI ternormalisasi (0..1) & Centroid/IoU Tracker State Machine
// Mengikuti .agent/rules/data_contract.md Section 5 & docs/requirement.md Section 4.3
//
// v5 — presisi live CCTV (tanpa mengubah kontrak TrackedObjectOverlay / TrackerLifecycleState):
// - Hysteresis confidence: track BARU hanya lahir dari deteksi >= birthConf (default 0.45);
//   deteksi lemah (>= confThresh inferensi, mis. 0.25) hanya boleh MEMPERPANJANG track yang ada.
// - Konfirmasi temporal: track baru tampil/dihitung setelah terdeteksi >= confirmHits dari
//   confirmWindow frame terakhir (default 3 dari 5 @1 FPS) -> FP sesaat (motor, payung lewat) hilang.
// - Filter stasioner: dwell hanya bertambah selama box tetap di tempat (IoU vs anchor >= stationaryIou).
//   PKL mangkal diam; kendaraan/gerobak yang sedang didorong me-reset dwell.

import type {
  NormalizedPolygon,
  TrackedObjectOverlay,
  TrackerLifecycleState,
} from '@/types';

export interface RawDetection {
  className: string;
  confidence: number;
  bboxNorm: { x1: number; y1: number; x2: number; y2: number };
}

type BBox = { x1: number; y1: number; x2: number; y2: number };

/**
 * Ray-casting point-in-polygon pada koordinat ternormalisasi 0..1.
 * Jika roiPolygon kosong/null atau < 3 titik -> otomatis FULL_FRAME (true).
 */
export function isBottomCenterInRoi(
  bbox: BBox,
  roiPolygon: NormalizedPolygon | null | undefined,
): boolean {
  if (!roiPolygon || roiPolygon.length < 3) {
    return true;
  }

  const px = (bbox.x1 + bbox.x2) / 2;
  const py = bbox.y2;

  let inside = false;
  for (let i = 0, j = roiPolygon.length - 1; i < roiPolygon.length; j = i++) {
    const [xi, yi] = roiPolygon[i]!;
    const [xj, yj] = roiPolygon[j]!;

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/** Bounding box ternormalisasi dari poligon ROI (null bila ROI tidak valid -> full frame). */
export function getRoiBounds(roiPolygon: NormalizedPolygon | null | undefined): BBox | null {
  if (!roiPolygon || roiPolygon.length < 3) return null;
  let x1 = 1;
  let y1 = 1;
  let x2 = 0;
  let y2 = 0;
  for (const [x, y] of roiPolygon) {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  }
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null;
  return {
    x1: Math.max(0, x1),
    y1: Math.max(0, y1),
    x2: Math.min(1, x2),
    y2: Math.min(1, y2),
  };
}

function computeIoU(a: BBox, b: BBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return inter / (areaA + areaB - inter || Number.EPSILON);
}

function centroidDistance(a: BBox, b: BBox): number {
  const ax = (a.x1 + a.x2) / 2;
  const ay = (a.y1 + a.y2) / 2;
  const bx = (b.x1 + b.x2) / 2;
  const by = (b.y1 + b.y2) / 2;
  return Math.hypot(ax - bx, ay - by);
}

interface InternalTrack {
  trackId: number;
  className: string;
  /** Confidence ter-smoothing (EMA) agar label tidak berkedip antar frame */
  confidence: number;
  bboxNorm: BBox;
  /** Posisi acuan saat objek mulai diam; dipakai filter stasioner */
  anchorBox: BBox;
  inRoi: boolean;
  state: TrackerLifecycleState;
  confirmed: boolean;
  /** Riwayat hit (true) / miss (false) untuk confirmWindow frame terakhir */
  hitHistory: boolean[];
  consecutiveMisses: number;
  firstInRoiMs: number | null;
  lastSeenInRoiMs: number | null;
  dwellSeconds: number;
}

export interface TrackerStepResult {
  tracks: TrackedObjectOverlay[];
  newlyReportedCount: number;
  activeViolatorsCount: number;
  inRoiCount: number;
  maxDwellSeconds: number;
  maxConfidence: number;
}

export interface TrackerUpdateOptions {
  nowMs?: number;
  violationThresholdSec: number;
  occlusionGraceSec: number;
  /** Confidence minimum untuk MEMBUAT track baru (default 0.45) */
  birthConf?: number;
  /** Jumlah hit minimum dalam confirmWindow agar track terkonfirmasi (default 3) */
  confirmHits?: number;
  /** Panjang jendela voting temporal dalam frame (default 5 @1 FPS) */
  confirmWindow?: number;
  /** IoU minimum box vs anchor agar dianggap masih diam (default 0.3) */
  stationaryIou?: number;
}

const DEFAULTS = {
  birthConf: 0.45,
  confirmHits: 3,
  confirmWindow: 5,
  stationaryIou: 0.3,
  confidenceEma: 0.5,
  /** Track belum terkonfirmasi dibuang setelah N miss berturut-turut */
  unconfirmedMaxMisses: 2,
  /** Track terkonfirmasi yang tidak pernah masuk ROI dibuang setelah N miss berturut-turut */
  outsideRoiMaxMisses: 3,
} as const;

export class CameraTracker {
  private nextTrackId = 1;
  private tracks = new Map<number, InternalTrack>();

  reset(): void {
    this.tracks.clear();
  }

  markReportedAsSuppressed(): void {
    for (const track of this.tracks.values()) {
      if (track.state === 'REPORTED') {
        track.state = 'SUPPRESSED';
      }
    }
  }

  update(
    detections: RawDetection[],
    roiPolygon: NormalizedPolygon | null | undefined,
    options: TrackerUpdateOptions,
  ): TrackerStepResult {
    const nowMs = options.nowMs ?? Date.now();
    const birthConf = options.birthConf ?? DEFAULTS.birthConf;
    const confirmWindow = Math.max(1, options.confirmWindow ?? DEFAULTS.confirmWindow);
    const confirmHits = Math.min(confirmWindow, Math.max(1, options.confirmHits ?? DEFAULTS.confirmHits));
    const stationaryIou = options.stationaryIou ?? DEFAULTS.stationaryIou;
    const matchedTrackIds = new Set<number>();

    // Greedy matching dari deteksi paling yakin agar deteksi kuat mendapat track terbaik
    const sortedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);

    for (const det of sortedDetections) {
      const inRoi = isBottomCenterInRoi(det.bboxNorm, roiPolygon);
      let bestTrack: InternalTrack | null = null;
      let bestScore = 0;

      for (const track of this.tracks.values()) {
        if (matchedTrackIds.has(track.trackId) || track.state === 'CLEARED') continue;
        const iou = computeIoU(track.bboxNorm, det.bboxNorm);
        const dist = centroidDistance(track.bboxNorm, det.bboxNorm);
        const score = iou > 0.15 ? 1 + iou : dist < 0.18 ? 1 - dist : 0;
        if (score > bestScore) {
          bestScore = score;
          bestTrack = track;
        }
      }

      if (bestTrack) {
        matchedTrackIds.add(bestTrack.trackId);
        bestTrack.bboxNorm = det.bboxNorm;
        bestTrack.confidence =
          DEFAULTS.confidenceEma * det.confidence + (1 - DEFAULTS.confidenceEma) * bestTrack.confidence;
        bestTrack.className = det.className;
        bestTrack.inRoi = inRoi;
        bestTrack.consecutiveMisses = 0;
        pushHit(bestTrack, true, confirmWindow);
        continue;
      }

      // Hysteresis: deteksi lemah tidak boleh melahirkan track baru
      if (det.confidence < birthConf) continue;

      const id = this.nextTrackId++;
      matchedTrackIds.add(id);
      this.tracks.set(id, {
        trackId: id,
        className: det.className,
        confidence: det.confidence,
        bboxNorm: det.bboxNorm,
        anchorBox: det.bboxNorm,
        inRoi,
        state: 'OBSERVING',
        confirmed: confirmHits <= 1,
        hitHistory: [true],
        consecutiveMisses: 0,
        firstInRoiMs: null,
        lastSeenInRoiMs: null,
        dwellSeconds: 0,
      });
    }

    const graceMs = options.occlusionGraceSec * 1000;
    for (const [id, track] of this.tracks.entries()) {
      const matched = matchedTrackIds.has(id);
      if (!matched) {
        track.consecutiveMisses += 1;
        pushHit(track, false, confirmWindow);
      }

      if (!track.confirmed && track.hitHistory.filter(Boolean).length >= confirmHits) {
        track.confirmed = true;
        track.anchorBox = track.bboxNorm;
      }

      if (!track.confirmed) {
        if (track.consecutiveMisses >= DEFAULTS.unconfirmedMaxMisses) {
          this.tracks.delete(id);
        }
        continue;
      }

      if (matched) {
        // Filter stasioner: objek berpindah -> anchor baru & dwell mulai dari nol
        // (track yang sudah REPORTED/SUPPRESSED tidak di-reset agar laporan tidak ganda).
        if (computeIoU(track.anchorBox, track.bboxNorm) < stationaryIou) {
          track.anchorBox = track.bboxNorm;
          if (track.state === 'OBSERVING') {
            track.firstInRoiMs = null;
            track.dwellSeconds = 0;
          }
        }

        if (track.inRoi) {
          if (track.firstInRoiMs === null) {
            track.firstInRoiMs = nowMs;
          }
          track.lastSeenInRoiMs = nowMs;
          track.dwellSeconds = Math.max(0, Math.floor((nowMs - track.firstInRoiMs) / 1000));
          if (track.state === 'OBSERVING' && track.dwellSeconds >= options.violationThresholdSec) {
            track.state = 'REPORTED';
          }
        }
      }

      // Occlusion grace period untuk track yang tidak terlihat di ROI pada frame ini
      const seenInRoiThisFrame = matched && track.inRoi;
      if (!seenInRoiThisFrame) {
        if (track.lastSeenInRoiMs === null) {
          if (track.consecutiveMisses >= DEFAULTS.outsideRoiMaxMisses) {
            this.tracks.delete(id);
          }
        } else if (nowMs - track.lastSeenInRoiMs >= graceMs) {
          track.state = 'CLEARED';
          this.tracks.delete(id);
        }
      }
    }

    let newlyReportedCount = 0;
    let activeViolatorsCount = 0;
    let inRoiCount = 0;
    let maxDwellSeconds = 0;
    let maxConfidence = 0;

    const overlays: TrackedObjectOverlay[] = [];
    for (const track of this.tracks.values()) {
      // Track belum terkonfirmasi tidak ditampilkan / dihitung (anti-flicker FP)
      if (!track.confirmed) continue;

      if (track.inRoi) {
        inRoiCount += 1;
        if (track.dwellSeconds > maxDwellSeconds) {
          maxDwellSeconds = track.dwellSeconds;
        }
      }
      if (track.state === 'REPORTED') {
        newlyReportedCount += 1;
      }
      if (track.state === 'REPORTED' || track.state === 'SUPPRESSED') {
        activeViolatorsCount += 1;
        if (track.confidence > maxConfidence) {
          maxConfidence = track.confidence;
        }
      }

      overlays.push({
        trackId: track.trackId,
        className: track.className,
        confidence: Number(track.confidence.toFixed(3)),
        bboxNorm: track.bboxNorm,
        inRoi: track.inRoi,
        state: track.state,
        dwellSeconds: track.dwellSeconds,
      });
    }

    return {
      tracks: overlays,
      newlyReportedCount,
      activeViolatorsCount,
      inRoiCount,
      maxDwellSeconds,
      maxConfidence,
    };
  }
}

function pushHit(track: InternalTrack, hit: boolean, window: number): void {
  track.hitHistory.push(hit);
  if (track.hitHistory.length > window) {
    track.hitHistory.splice(0, track.hitHistory.length - window);
  }
}

// Isolasi state tracker per camera_id (LOCKED DECISION)
const cameraTrackers = new Map<string, CameraTracker>();

export function getCameraTracker(cameraId: string): CameraTracker {
  let tracker = cameraTrackers.get(cameraId);
  if (!tracker) {
    tracker = new CameraTracker();
    cameraTrackers.set(cameraId, tracker);
  }
  return tracker;
}
