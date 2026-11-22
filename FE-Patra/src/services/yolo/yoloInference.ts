// Core Browser ONNX Runtime Web inference engine untuk PATRA (T1-06)
// - Lazy singleton session dengan fallback webgpu -> wasm & pengecekan magic bytes
// - Reuse canvas 640x640 & Float32Array (letterbox identik dengan AI-Patra/verify_onnx.py)
// - Dual-format postprocessing: [1, N, 6] (end2end NMS) & [1, 4+nc, 8400] (raw head + NMS)
// - Selalu memanggil tensor.dispose() agar 0 memory leak saat inferensi 1 FPS

import * as ort from 'onnxruntime-web';
import wasmSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjsSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import type { RawDetection } from './roiAndTracker';

const MODEL_URL = '/models/best.onnx';
const INPUT_SIZE = 640;
const DEFAULT_CONF_THRESH = 0.25;
const DEFAULT_IOU_NMS = 0.45;

export type YoloBackend = 'webgpu' | 'wasm';

export interface YoloInferenceOutput {
  detections: RawDetection[];
  inferenceMs: number;
  backend: YoloBackend;
  tainted: boolean;
}

interface LoadedSession {
  session: ort.InferenceSession;
  inputName: string;
  outputName: string;
  backend: YoloBackend;
}

let sessionInstance: LoadedSession | null = null;
let sessionPromise: Promise<LoadedSession> | null = null;
let sessionError: string | null = null;

// Reused buffers untuk menghindari alokasi memori berulang di loop 1 FPS
let letterboxCanvas: HTMLCanvasElement | null = null;
let letterboxCtx: CanvasRenderingContext2D | null = null;
const inputBuffer = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

function getLetterboxCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!letterboxCanvas) {
    letterboxCanvas = document.createElement('canvas');
    letterboxCanvas.width = INPUT_SIZE;
    letterboxCanvas.height = INPUT_SIZE;
    letterboxCtx = letterboxCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!letterboxCtx) {
    throw new Error('Canvas 2D context tidak tersedia untuk preprocessing YOLO.');
  }
  return { canvas: letterboxCanvas, ctx: letterboxCtx };
}

function isLikelyHtmlOrInvalidOnnx(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return true;
  // Cek apakah response sebenarnya HTML fallback (mis. <!DOCTYPE html> atau <html>)
  const head = String.fromCharCode(...bytes.slice(0, 16)).trim().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')) {
    return true;
  }
  return false;
}

async function createSessionInternal(): Promise<LoadedSession> {
  const res = await fetch(MODEL_URL, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Model ONNX tidak ditemukan di ${MODEL_URL} (HTTP ${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (isLikelyHtmlOrInvalidOnnx(bytes)) {
    throw new Error(
      `File ${MODEL_URL} tidak valid (bukan binary ONNX — pastikan best.onnx tersedia di public/models/).`,
    );
  }

  // Konfigurasi WASM single-thread agar aman tanpa header COOP/COEP (tidak memblokir HLS lintas domain)
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

  if (hasWebGpu) {
    try {
      ort.env.wasm.wasmPaths = {
        wasm: wasmJsepUrl,
        mjs: mjsJsepUrl,
      };
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      const loaded: LoadedSession = {
        session,
        inputName: session.inputNames[0] ?? 'images',
        outputName: session.outputNames[0] ?? 'output0',
        backend: 'webgpu',
      };
      sessionInstance = loaded;
      sessionError = null;
      return loaded;
    } catch {
      // Fallback otomatis ke WASM bila WebGPU tidak didukung driver/model opset
    }
  }

  ort.env.wasm.wasmPaths = {
    wasm: wasmSimdUrl,
    mjs: mjsSimdUrl,
  };
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const loaded: LoadedSession = {
    session,
    inputName: session.inputNames[0] ?? 'images',
    outputName: session.outputNames[0] ?? 'output0',
    backend: 'wasm',
  };
  sessionInstance = loaded;
  sessionError = null;
  return loaded;
}

export function ensureYoloSession(): Promise<LoadedSession> {
  if (sessionInstance) return Promise.resolve(sessionInstance);
  if (!sessionPromise) {
    sessionPromise = createSessionInternal().catch((err) => {
      sessionError = err instanceof Error ? err.message : 'Gagal memuat model ONNX.';
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export function getYoloSessionState(): {
  ready: boolean;
  backend: YoloBackend | null;
  error: string | null;
} {
  return {
    ready: Boolean(sessionInstance),
    backend: sessionInstance?.backend ?? null,
    error: sessionError,
  };
}

function boxIoU(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): number {
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

function applyNms(detections: RawDetection[], iouThresh: number): RawDetection[] {
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function parseYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  srcW: number,
  srcH: number,
  scale: number,
  padX: number,
  padY: number,
  confThresh: number,
  iouNms: number,
): RawDetection[] {
  const rawDets: RawDetection[] = [];
  const d1 = dims[1] ?? 0;
  const d2 = dims[2] ?? 0;

  // Format A: End-to-End NMS built-in [1, N, 6] -> (x1, y1, x2, y2, score, cls)
  if (dims.length === 3 && d2 === 6) {
    for (let i = 0; i < d1; i++) {
      const off = i * 6;
      const score = data[off + 4] ?? 0;
      if (score < confThresh) continue;

      const x1 = clamp01(((data[off] ?? 0) - padX) / scale / srcW);
      const y1 = clamp01(((data[off + 1] ?? 0) - padY) / scale / srcH);
      const x2 = clamp01(((data[off + 2] ?? 0) - padX) / scale / srcW);
      const y2 = clamp01(((data[off + 3] ?? 0) - padY) / scale / srcH);
      if (x2 - x1 < 0.005 || y2 - y1 < 0.005) continue;

      rawDets.push({
        className: 'PKL',
        confidence: Number(score.toFixed(3)),
        bboxNorm: { x1, y1, x2, y2 },
      });
    }
    return rawDets;
  }

  // Format B: Raw YOLO head [1, 4+nc, 8400] (atau [1, 8400, 4+nc])
  if (dims.length === 3 && d1 > 0 && d2 > 0) {
    const channelsFirst = d1 < d2;
    const numAnchors = channelsFirst ? d2 : d1;
    const numAttrs = channelsFirst ? d1 : d2;
    const numClasses = Math.max(1, numAttrs - 4);

    for (let i = 0; i < numAnchors; i++) {
      let maxScore = 0;
      for (let c = 0; c < numClasses; c++) {
        const s = channelsFirst
          ? (data[(4 + c) * numAnchors + i] ?? 0)
          : (data[i * numAttrs + 4 + c] ?? 0);
        if (s > maxScore) maxScore = s;
      }
      if (maxScore < confThresh) continue;

      const cx = channelsFirst ? (data[i] ?? 0) : (data[i * numAttrs] ?? 0);
      const cy = channelsFirst ? (data[numAnchors + i] ?? 0) : (data[i * numAttrs + 1] ?? 0);
      const bw = channelsFirst ? (data[2 * numAnchors + i] ?? 0) : (data[i * numAttrs + 2] ?? 0);
      const bh = channelsFirst ? (data[3 * numAnchors + i] ?? 0) : (data[i * numAttrs + 3] ?? 0);

      const x1 = clamp01((cx - bw / 2 - padX) / scale / srcW);
      const y1 = clamp01((cy - bh / 2 - padY) / scale / srcH);
      const x2 = clamp01((cx + bw / 2 - padX) / scale / srcW);
      const y2 = clamp01((cy + bh / 2 - padY) / scale / srcH);
      if (x2 - x1 < 0.005 || y2 - y1 < 0.005) continue;

      rawDets.push({
        className: 'PKL',
        confidence: Number(maxScore.toFixed(3)),
        bboxNorm: { x1, y1, x2, y2 },
      });
    }

    return applyNms(rawDets, iouNms);
  }

  return rawDets;
}

/**
 * Menjalankan inferensi YOLO ONNX (best.onnx) pada 1 frame video atau canvas.
 * Menangkap SecurityError (tainted canvas) secara aman tanpa crash.
 */
export async function runYoloInference(
  source: HTMLVideoElement | HTMLCanvasElement,
  options?: { confThresh?: number; iouNms?: number },
): Promise<YoloInferenceOutput> {
  const loaded = await ensureYoloSession();
  const t0 = performance.now();

  const srcW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  if (!srcW || !srcH) {
    return {
      detections: [],
      inferenceMs: 0,
      backend: loaded.backend,
      tainted: false,
    };
  }

  const { ctx } = getLetterboxCanvas();

  // Letterbox resize dengan padding abu-abu 114 (identik Ultralytics / verify_onnx.py)
  const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

  let imageData: ImageData;
  try {
    ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);
    imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  } catch {
    return {
      detections: [],
      inferenceMs: Math.round(performance.now() - t0),
      backend: loaded.backend,
      tainted: true,
    };
  }

  // Konversi RGBA -> RGB float32 NCHW ternormalisasi 0..1 ke buffer yang di-reuse
  const rgba = imageData.data;
  const planeSize = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < planeSize; i++) {
    const p = i * 4;
    inputBuffer[i] = rgba[p]! / 255;
    inputBuffer[planeSize + i] = rgba[p + 1]! / 255;
    inputBuffer[2 * planeSize + i] = rgba[p + 2]! / 255;
  }

  const inputTensor = new ort.Tensor('float32', inputBuffer, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  let outputs: ort.InferenceSession.OnnxValueMapType | null = null;

  try {
    outputs = await loaded.session.run({ [loaded.inputName]: inputTensor });
    const outTensor = outputs[loaded.outputName] ?? Object.values(outputs)[0];
    if (!outTensor) {
      return {
        detections: [],
        inferenceMs: Math.round(performance.now() - t0),
        backend: loaded.backend,
        tainted: false,
      };
    }

    const outData = outTensor.data as Float32Array;
    const detections = parseYoloOutput(
      outData,
      outTensor.dims,
      srcW,
      srcH,
      scale,
      padX,
      padY,
      options?.confThresh ?? DEFAULT_CONF_THRESH,
      options?.iouNms ?? DEFAULT_IOU_NMS,
    );

    return {
      detections,
      inferenceMs: Math.max(1, Math.round(performance.now() - t0)),
      backend: loaded.backend,
      tainted: false,
    };
  } finally {
    inputTensor.dispose?.();
    if (outputs) {
      for (const tensor of Object.values(outputs)) {
        tensor.dispose?.();
      }
    }
  }
}
