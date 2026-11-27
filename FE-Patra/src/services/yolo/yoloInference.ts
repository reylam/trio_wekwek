// Core Browser ONNX Runtime Web inference engine untuk PATRA (T1-06)
// - Lazy singleton session dengan fallback webgpu -> wasm & pengecekan magic bytes
// - Ukuran input otomatis: metadata sesi ONNX -> sidecar /models/best.json -> fallback 640x640.
//   Mendukung model rect 16:9 (mis. 544x960) yang memberi objek kecil 1.5x lebih besar
//   dibanding letterbox 640x640 untuk frame CCTV 16:9.
// - ROI-crop inference opsional: frame dipotong ke bounding box poligon ROI trotoar (+margin)
//   sebelum letterbox, sehingga PKL kecil tampil lebih besar tanpa menaikkan resolusi model.
// - Letterbox identik dengan AI-Patra/verify_onnx.py (padding abu-abu 114)
// - Dual-format postprocessing: [1, N, 6] (end2end NMS) & [1, 4+nc, anchors] (raw head + NMS)
// - Selalu memanggil tensor.dispose() agar 0 memory leak saat inferensi 1 FPS

import * as ort from 'onnxruntime-web/webgpu';
import mjsSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import wasmAsyncUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsAsyncUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import type { NormalizedPolygon } from '@/types';
import { getRoiBounds, type RawDetection } from './roiAndTracker';
import { applyNms, clamp01, parseYoloOutput } from './yoloPostprocess';

// Map seluruh varian asset WASM/MJS lewat Vite ?url (pola teruji dari Civision)
// agar dev server & production build tidak pernah mengembalikan index.html untuk .wasm
ort.env.wasm.wasmPaths = {
  'ort-wasm-simd-threaded.mjs': mjsSimdUrl,
  'ort-wasm-simd-threaded.wasm': wasmSimdUrl,
  'ort-wasm-simd-threaded.jsep.wasm': wasmJsepUrl,
  'ort-wasm-simd-threaded.jsep.mjs': mjsJsepUrl,
  'ort-wasm-simd-threaded.asyncify.wasm': wasmAsyncUrl,
  'ort-wasm-simd-threaded.asyncify.mjs': mjsAsyncUrl,
} as unknown as typeof ort.env.wasm.wasmPaths;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };

async function isWebGpuAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !(navigator as GpuNavigator).gpu) return false;
  try {
    const adapter = await (navigator as GpuNavigator).gpu!.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

const MODEL_URL = '/models/best.onnx';
const MODEL_META_URL = '/models/best.json';
const FALLBACK_INPUT_SIZE = 640;
const MODEL_STRIDE = 32;
const DEFAULT_CONF_THRESH = 0.45;
const DEFAULT_IOU_NMS = 0.45;
const DEFAULT_MAX_BOX_AREA = 0.15;
/** Margin ROI-crop relatif terhadap ukuran bounding box ROI */
const DEFAULT_ROI_MARGIN = 0.08;
/** Batas zoom ROI-crop vs full frame (model dilatih dengan scale aug 0.5..1.5) */
const DEFAULT_ROI_MAX_ZOOM = 1.6;
/** Crop yang menutupi >= 85% area frame tidak memberi manfaat -> pakai full frame */
const ROI_CROP_MIN_GAIN_AREA = 0.85;

export type YoloBackend = 'webgpu' | 'wasm';

export interface YoloInferenceOutput {
  detections: RawDetection[];
  inferenceMs: number;
  backend: YoloBackend;
  tainted: boolean;
  /** Area frame (ternormalisasi) yang benar-benar dimasukkan ke model */
  cropRectNorm: CropRectNorm;
}

export interface CropRectNorm {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface YoloInferenceOptions {
  confThresh?: number;
  iouNms?: number;
  maxBoxArea?: number;
  /** Poligon ROI aktif; bila diberikan & roiCrop aktif, inferensi hanya pada area ROI */
  roiPolygon?: NormalizedPolygon | null;
  /** Aktifkan ROI-crop inference (default true bila roiPolygon valid) */
  roiCrop?: boolean;
  roiMargin?: number;
  roiMaxZoom?: number;
}

interface LoadedSession {
  session: ort.InferenceSession;
  inputName: string;
  outputName: string;
  backend: YoloBackend;
  inputW: number;
  inputH: number;
}

let sessionInstance: LoadedSession | null = null;
let sessionPromise: Promise<LoadedSession> | null = null;
let sessionError: string | null = null;

// Reused buffers untuk menghindari alokasi memori berulang di loop 1 FPS
let letterboxCanvas: HTMLCanvasElement | null = null;
let letterboxCtx: CanvasRenderingContext2D | null = null;
let inputBuffer: Float32Array | null = null;

function getLetterboxCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!letterboxCanvas || letterboxCanvas.width !== width || letterboxCanvas.height !== height) {
    letterboxCanvas = document.createElement('canvas');
    letterboxCanvas.width = width;
    letterboxCanvas.height = height;
    letterboxCtx = letterboxCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!letterboxCtx) {
    throw new Error('Canvas 2D context tidak tersedia untuk preprocessing YOLO.');
  }
  return { canvas: letterboxCanvas, ctx: letterboxCtx };
}

function getInputBuffer(width: number, height: number): Float32Array {
  const size = 3 * width * height;
  if (!inputBuffer || inputBuffer.length !== size) {
    inputBuffer = new Float32Array(size);
  }
  return inputBuffer;
}

function isLikelyHtmlOrInvalidOnnx(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return true;
  // Cek apakah response sebenarnya HTML fallback (mis. <!DOCTYPE html> atau <html>)
  const head = String.fromCharCode(...bytes.slice(0, 16)).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<');
}

function isValidDim(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v % MODEL_STRIDE === 0;
}

/** Baca dimensi input statis [1, 3, H, W] dari metadata sesi (onnxruntime-web >= 1.22). */
function readInputDimsFromSession(session: ort.InferenceSession): { w: number; h: number } | null {
  const meta = (
    session as unknown as {
      inputMetadata?: ReadonlyArray<{ shape?: ReadonlyArray<number | string> }>;
    }
  ).inputMetadata;
  const shape = meta?.[0]?.shape;
  if (shape && shape.length === 4 && isValidDim(shape[2]) && isValidDim(shape[3])) {
    return { h: shape[2], w: shape[3] };
  }
  return null;
}

/** Sidecar ditulis AI-Patra/export_onnx.py. SPA fallback (index.html) otomatis diabaikan. */
async function fetchModelSidecarDims(): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(MODEL_META_URL, { cache: 'no-cache' });
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const json = (await res.json()) as { input?: { height?: unknown; width?: unknown } };
    const h = json.input?.height;
    const w = json.input?.width;
    return isValidDim(h) && isValidDim(w) ? { w, h } : null;
  } catch {
    return null;
  }
}

async function createSessionInternal(): Promise<LoadedSession> {
  const [res, sidecarDims] = await Promise.all([
    fetch(MODEL_URL, { cache: 'force-cache' }),
    fetchModelSidecarDims(),
  ]);
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

  const preferWebGpu = await isWebGpuAvailable();
  const backendsToTry: YoloBackend[] = preferWebGpu ? ['webgpu', 'wasm'] : ['wasm'];

  let lastError: unknown = null;
  for (const backend of backendsToTry) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
      });
      // Metadata sesi = sumber kebenaran (selalu cocok dengan model yang benar-benar dimuat);
      // sidecar dipakai bila runtime tidak mengekspos inputMetadata.
      const dims = readInputDimsFromSession(session) ??
        sidecarDims ?? { w: FALLBACK_INPUT_SIZE, h: FALLBACK_INPUT_SIZE };
      const loaded: LoadedSession = {
        session,
        inputName: session.inputNames[0] ?? 'images',
        outputName: session.outputNames[0] ?? 'output0',
        backend,
        inputW: dims.w,
        inputH: dims.h,
      };
      sessionInstance = loaded;
      sessionError = null;
      return loaded;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gagal menginisialisasi sesi inferensi ONNX Runtime Web.');
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
  inputSize: { width: number; height: number } | null;
} {
  return {
    ready: Boolean(sessionInstance),
    backend: sessionInstance?.backend ?? null,
    error: sessionError,
    inputSize: sessionInstance
      ? { width: sessionInstance.inputW, height: sessionInstance.inputH }
      : null,
  };
}

const FULL_FRAME: CropRectNorm = { x1: 0, y1: 0, x2: 1, y2: 1 };

/**
 * Hitung area crop (ternormalisasi frame) dari poligon ROI:
 * bbox ROI + margin, minimal 1/maxZoom ukuran frame (zoom dibatasi agar skala objek tetap
 * dalam rentang augmentasi training), lalu diperlebar ke rasio aspek input model agar
 * tidak ada piksel input yang terbuang untuk padding.
 */
export function computeRoiCropRect(
  roiPolygon: NormalizedPolygon | null | undefined,
  srcW: number,
  srcH: number,
  inputW: number,
  inputH: number,
  margin = DEFAULT_ROI_MARGIN,
  maxZoom = DEFAULT_ROI_MAX_ZOOM,
): CropRectNorm {
  const bounds = getRoiBounds(roiPolygon);
  if (!bounds || srcW <= 0 || srcH <= 0) return FULL_FRAME;

  // Kerja dalam piksel agar penyesuaian aspek benar
  let cx = ((bounds.x1 + bounds.x2) / 2) * srcW;
  let cy = ((bounds.y1 + bounds.y2) / 2) * srcH;
  let w = (bounds.x2 - bounds.x1) * srcW * (1 + 2 * margin);
  let h = (bounds.y2 - bounds.y1) * srcH * (1 + 2 * margin);

  const zoom = Math.max(1, maxZoom);
  w = Math.max(w, srcW / zoom);
  h = Math.max(h, srcH / zoom);

  const targetAspect = inputW / inputH;
  if (w / h < targetAspect) w = h * targetAspect;
  else h = w / targetAspect;

  w = Math.min(w, srcW);
  h = Math.min(h, srcH);
  cx = Math.min(Math.max(cx, w / 2), srcW - w / 2);
  cy = Math.min(Math.max(cy, h / 2), srcH - h / 2);

  const rect: CropRectNorm = {
    x1: clamp01((cx - w / 2) / srcW),
    y1: clamp01((cy - h / 2) / srcH),
    x2: clamp01((cx + w / 2) / srcW),
    y2: clamp01((cy + h / 2) / srcH),
  };
  const area = (rect.x2 - rect.x1) * (rect.y2 - rect.y1);
  return area >= ROI_CROP_MIN_GAIN_AREA ? FULL_FRAME : rect;
}

/**
 * Menjalankan inferensi YOLO ONNX (best.onnx) pada 1 frame video atau canvas.
 * Menangkap SecurityError (tainted canvas) secara aman tanpa crash.
 */
export async function runYoloInference(
  source: HTMLVideoElement | HTMLCanvasElement,
  options?: YoloInferenceOptions,
): Promise<YoloInferenceOutput> {
  const loaded = await ensureYoloSession();
  const t0 = performance.now();
  const { inputW, inputH } = loaded;

  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  if (!srcW || !srcH) {
    return {
      detections: [],
      inferenceMs: 0,
      backend: loaded.backend,
      tainted: false,
      cropRectNorm: FULL_FRAME,
    };
  }

  const useRoiCrop = (options?.roiCrop ?? true) && Boolean(options?.roiPolygon);
  const crop = useRoiCrop
    ? computeRoiCropRect(
        options?.roiPolygon,
        srcW,
        srcH,
        inputW,
        inputH,
        options?.roiMargin,
        options?.roiMaxZoom,
      )
    : FULL_FRAME;

  const cropX = Math.round(crop.x1 * srcW);
  const cropY = Math.round(crop.y1 * srcH);
  const cropW = Math.max(1, Math.round((crop.x2 - crop.x1) * srcW));
  const cropH = Math.max(1, Math.round((crop.y2 - crop.y1) * srcH));

  const { ctx } = getLetterboxCanvas(inputW, inputH);

  // Letterbox resize dengan padding abu-abu 114 (identik Ultralytics / verify_onnx.py)
  const scale = Math.min(inputW / cropW, inputH / cropH);
  const newW = Math.round(cropW * scale);
  const newH = Math.round(cropH * scale);
  const padX = Math.floor((inputW - newW) / 2);
  const padY = Math.floor((inputH - newH) / 2);

  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, inputW, inputH);

  let imageData: ImageData;
  try {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, padX, padY, newW, newH);
    imageData = ctx.getImageData(0, 0, inputW, inputH);
  } catch {
    return {
      detections: [],
      inferenceMs: Math.round(performance.now() - t0),
      backend: loaded.backend,
      tainted: true,
      cropRectNorm: crop,
    };
  }

  // Konversi RGBA -> RGB float32 NCHW ternormalisasi 0..1 ke buffer yang di-reuse
  const buffer = getInputBuffer(inputW, inputH);
  const rgba = imageData.data;
  const planeSize = inputW * inputH;
  for (let i = 0; i < planeSize; i++) {
    const p = i * 4;
    buffer[i] = rgba[p]! / 255;
    buffer[planeSize + i] = rgba[p + 1]! / 255;
    buffer[2 * planeSize + i] = rgba[p + 2]! / 255;
  }

  const inputTensor = new ort.Tensor('float32', buffer, [1, 3, inputH, inputW]);
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
        cropRectNorm: crop,
      };
    }

    const iouNms = options?.iouNms ?? DEFAULT_IOU_NMS;
    const parsed = parseYoloOutput(
      outTensor.data as Float32Array,
      outTensor.dims,
      srcW,
      srcH,
      scale,
      padX,
      padY,
      options?.confThresh ?? DEFAULT_CONF_THRESH,
      iouNms,
      { maxAreaNorm: options?.maxBoxArea ?? DEFAULT_MAX_BOX_AREA },
      { offX: cropX, offY: cropY },
    );
    // Box di tepi crop bisa terduplikasi ringan; NMS juga untuk output end2end (Format A)
    const detections = applyNms(parsed, iouNms);

    return {
      detections,
      inferenceMs: Math.max(1, Math.round(performance.now() - t0)),
      backend: loaded.backend,
      tainted: false,
      cropRectNorm: crop,
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
