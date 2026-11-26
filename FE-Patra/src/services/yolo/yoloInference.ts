// Core Browser ONNX Runtime Web inference engine untuk PATRA (T1-06)
// - Lazy singleton session dengan fallback webgpu -> wasm & pengecekan magic bytes
// - Reuse canvas 640x640 & Float32Array (letterbox identik dengan AI-Patra/verify_onnx.py)
// - Dual-format postprocessing: [1, N, 6] (end2end NMS) & [1, 4+nc, 8400] (raw head + NMS)
// - Selalu memanggil tensor.dispose() agar 0 memory leak saat inferensi 1 FPS

import * as ort from 'onnxruntime-web/webgpu';
import mjsSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmSimdUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsJsepUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import wasmAsyncUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsAsyncUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import type { RawDetection } from './roiAndTracker';
import { parseYoloOutput } from './yoloPostprocess';

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

  const preferWebGpu = await isWebGpuAvailable();
  const backendsToTry: YoloBackend[] = preferWebGpu ? ['webgpu', 'wasm'] : ['wasm'];

  let lastError: unknown = null;
  for (const backend of backendsToTry) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
      });
      const loaded: LoadedSession = {
        session,
        inputName: session.inputNames[0] ?? 'images',
        outputName: session.outputNames[0] ?? 'output0',
        backend,
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
} {
  return {
    ready: Boolean(sessionInstance),
    backend: sessionInstance?.backend ?? null,
    error: sessionError,
  };
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
