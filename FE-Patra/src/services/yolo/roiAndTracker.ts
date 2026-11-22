// Modul terisolasi untuk evaluasi Poligon ROI ternormalisasi (0..1) & Centroid/IoU Tracker State Machine
// Mengikuti .agent/rules/data_contract.md Section 5 & docs/requirement.md Section 4.3

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

/**
 * Ray-casting point-in-polygon pada koordinat ternormalisasi 0..1.
 * Jika roiPolygon kosong/null atau < 3 titik -> otomatis FULL_FRAME (true).
 */
export function isBottomCenterInRoi(
  bbox: { x1: number; y1: number; x2: number; y2: number },
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

function computeIoU(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): number {
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

function centroidDistance(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): number {
  const ax = (a.x1 + a.x2) / 2;
  const ay = (a.y1 + a.y2) / 2;
  const bx = (b.x1 + b.x2) / 2;
  const by = (b.y1 + b.y2) / 2;
  return Math.hypot(ax - bx, ay - by);
}

interface InternalTrack {
  trackId: number;
  className: string;
  confidence: number;
  bboxNorm: { x1: number; y1: number; x2: number; y2: number };
  inRoi: boolean;
  state: TrackerLifecycleState;
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
    options: {
      nowMs?: number;
      violationThresholdSec: number;
      occlusionGraceSec: number;
    },
  ): TrackerStepResult {
    const nowMs = options.nowMs ?? Date.now();
    const matchedTrackIds = new Set<number>();

    for (const det of detections) {
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
        bestTrack.confidence = det.confidence;
        bestTrack.className = det.className;
        bestTrack.inRoi = inRoi;

        if (inRoi) {
          if (bestTrack.firstInRoiMs === null) {
            bestTrack.firstInRoiMs = nowMs;
          }
          bestTrack.lastSeenInRoiMs = nowMs;
          bestTrack.dwellSeconds = Math.max(
            0,
            Math.floor((nowMs - bestTrack.firstInRoiMs) / 1000),
          );
          if (
            bestTrack.state === 'OBSERVING' &&
            bestTrack.dwellSeconds >= options.violationThresholdSec
          ) {
            bestTrack.state = 'REPORTED';
          }
        }
      } else {
        const id = this.nextTrackId++;
        matchedTrackIds.add(id);
        this.tracks.set(id, {
          trackId: id,
          className: det.className,
          confidence: det.confidence,
          bboxNorm: det.bboxNorm,
          inRoi,
          state: 'OBSERVING',
          firstInRoiMs: inRoi ? nowMs : null,
          lastSeenInRoiMs: inRoi ? nowMs : null,
          dwellSeconds: 0,
        });
      }
    }

    // Evaluasi occlusion grace period untuk track yang tidak terlihat di ROI pada frame ini
    const graceMs = options.occlusionGraceSec * 1000;
    for (const [id, track] of this.tracks.entries()) {
      const seenInRoiThisFrame = matchedTrackIds.has(id) && track.inRoi;
      if (!seenInRoiThisFrame) {
        if (track.lastSeenInRoiMs === null) {
          if (!matchedTrackIds.has(id)) {
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
        confidence: track.confidence,
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
