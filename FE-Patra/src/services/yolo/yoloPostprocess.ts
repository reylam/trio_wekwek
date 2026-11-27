import type { RawDetection } from './roiAndTracker';

export const MIN_BOX_DIM_NORM = 0.005;
export const MAX_BOX_AREA_NORM = 0.45;
export const MAX_BOX_DIM_NORM = 0.85;

export interface NormalizedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Offset crop (piksel frame) bila input model adalah potongan ROI dari frame.
 * Koordinat dipetakan: ((v - pad) / scale + off) / srcW, dengan srcW/srcH = ukuran frame PENUH.
 */
export interface CropOffset {
  offX: number;
  offY: number;
}

export interface BoxFilterOptions {
  minDimNorm?: number;
  maxAreaNorm?: number;
  maxDimNorm?: number;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Validasi ukuran bounding box ternormalisasi (0..1) agar noise terlalu kecil
 * maupun kotak raksasa "detect everything" di CCTV otomatis ditolak.
 */
export function isValidDetectionBox(
  bbox: NormalizedBox,
  options?: BoxFilterOptions,
): boolean {
  const { x1, y1, x2, y2 } = bbox;
  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return false;
  }

  const minDim = options?.minDimNorm ?? MIN_BOX_DIM_NORM;
  const maxArea = options?.maxAreaNorm ?? MAX_BOX_AREA_NORM;
  const maxDim = options?.maxDimNorm ?? MAX_BOX_DIM_NORM;

  const w = x2 - x1;
  const h = y2 - y1;
  if (w < minDim || h < minDim) return false;
  if (w > maxDim || h > maxDim) return false;
  if (w * h > maxArea) return false;

  return true;
}

export function boxIoU(a: NormalizedBox, b: NormalizedBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return inter / Math.max(1e-6, areaA + areaB - inter);
}

export function applyNms(detections: RawDetection[], iouThresh: number): RawDetection[] {
  if (detections.length <= 1) return detections;
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];

  for (const cand of sorted) {
    let suppressed = false;
    for (const prev of kept) {
      if (boxIoU(cand.bboxNorm, prev.bboxNorm) >= iouThresh) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) {
      kept.push(cand);
    }
  }
  return kept;
}

export function parseYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  srcW: number,
  srcH: number,
  scale: number,
  padX: number,
  padY: number,
  confThresh: number,
  iouNms: number,
  boxFilter?: BoxFilterOptions,
  cropOffset?: CropOffset,
): RawDetection[] {
  const offX = cropOffset?.offX ?? 0;
  const offY = cropOffset?.offY ?? 0;
  if (
    !Number.isFinite(offX) ||
    !Number.isFinite(offY) ||
    srcW <= 0 ||
    srcH <= 0 ||
    scale <= 0 ||
    !Number.isFinite(srcW) ||
    !Number.isFinite(srcH) ||
    !Number.isFinite(scale) ||
    !Number.isFinite(padX) ||
    !Number.isFinite(padY)
  ) {
    return [];
  }

  const rawDets: RawDetection[] = [];
  const d1 = dims[1] ?? 0;
  const d2 = dims[2] ?? 0;

  // Format A: End-to-End NMS built-in [1, N, 6] -> (x1, y1, x2, y2, score, cls)
  if (dims.length === 3 && d2 === 6) {
    for (let i = 0; i < d1; i++) {
      const off = i * 6;
      const score = data[off + 4];
      const rx1 = data[off];
      const ry1 = data[off + 1];
      const rx2 = data[off + 2];
      const ry2 = data[off + 3];
      if (
        score === undefined ||
        rx1 === undefined ||
        ry1 === undefined ||
        rx2 === undefined ||
        ry2 === undefined ||
        !Number.isFinite(score) ||
        !Number.isFinite(rx1) ||
        !Number.isFinite(ry1) ||
        !Number.isFinite(rx2) ||
        !Number.isFinite(ry2) ||
        score < confThresh
      ) {
        continue;
      }

      const bboxNorm: NormalizedBox = {
        x1: clamp01(((rx1 - padX) / scale + offX) / srcW),
        y1: clamp01(((ry1 - padY) / scale + offY) / srcH),
        x2: clamp01(((rx2 - padX) / scale + offX) / srcW),
        y2: clamp01(((ry2 - padY) / scale + offY) / srcH),
      };
      if (!isValidDetectionBox(bboxNorm, boxFilter)) continue;

      rawDets.push({
        className: 'PKL',
        confidence: Number(score.toFixed(3)),
        bboxNorm,
      });
    }
    return rawDets;
  }

  // Format B: Raw YOLO head [1, 4+nc, N] (atau [1, N, 4+nc]), minimal 5 atribut (4 bbox + >=1 kelas)
  if (dims.length === 3 && d1 > 0 && d2 > 0 && (d1 >= 5 || d2 >= 5)) {
    const channelsFirst = d2 < 5 ? true : d1 < 5 ? false : d1 < d2;
    const numAnchors = channelsFirst ? d2 : d1;
    const numAttrs = channelsFirst ? d1 : d2;
    const numClasses = numAttrs - 4;

    for (let i = 0; i < numAnchors; i++) {
      let maxScore = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = channelsFirst
          ? data[(4 + c) * numAnchors + i]
          : data[i * numAttrs + 4 + c];
        if (s !== undefined && Number.isFinite(s) && s > maxScore) {
          maxScore = s;
        }
      }
      if (!Number.isFinite(maxScore) || maxScore < confThresh) continue;

      const cx = channelsFirst ? data[i] : data[i * numAttrs];
      const cy = channelsFirst ? data[numAnchors + i] : data[i * numAttrs + 1];
      const bw = channelsFirst ? data[2 * numAnchors + i] : data[i * numAttrs + 2];
      const bh = channelsFirst ? data[3 * numAnchors + i] : data[i * numAttrs + 3];
      if (
        cx === undefined ||
        cy === undefined ||
        bw === undefined ||
        bh === undefined ||
        !Number.isFinite(cx) ||
        !Number.isFinite(cy) ||
        !Number.isFinite(bw) ||
        !Number.isFinite(bh)
      ) {
        continue;
      }

      const bboxNorm: NormalizedBox = {
        x1: clamp01(((cx - bw / 2 - padX) / scale + offX) / srcW),
        y1: clamp01(((cy - bh / 2 - padY) / scale + offY) / srcH),
        x2: clamp01(((cx + bw / 2 - padX) / scale + offX) / srcW),
        y2: clamp01(((cy + bh / 2 - padY) / scale + offY) / srcH),
      };
      if (!isValidDetectionBox(bboxNorm, boxFilter)) continue;

      rawDets.push({
        className: 'PKL',
        confidence: Number(maxScore.toFixed(3)),
        bboxNorm,
      });
    }

    return applyNms(rawDets, iouNms);
  }

  return rawDets;
}
