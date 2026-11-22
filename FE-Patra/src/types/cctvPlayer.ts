// Kontrak Integrasi Frontend <-> AI (<CctvPlayerWithAI />)
// Single Source of Truth: .agent/rules/data_contract.md Section 5

export type NormalizedPoint = [number, number]; // [x, y] dalam rentang 0..1
export type NormalizedPolygon = NormalizedPoint[];

export type TrackerLifecycleState =
  | 'OBSERVING'
  | 'REPORTED'
  | 'SUPPRESSED'
  | 'CLEARED';

export type CctvStreamStatus =
  | 'INITIALIZING'
  | 'LIVE_HLS'
  | 'SIMULATION_FALLBACK'
  | 'ERROR';

export interface CctvCameraDto {
  id: string;
  name: string;
  city: string;
  province: string;
  regionLabel: string;
  district: string | null;
  subdistrict: string | null;
  facilityCategory: string | null;
  streamUrl: string;
  playbackUrl: string;
  streamType: 'hls' | 'mjpeg' | 'mp4';
  lat: number;
  lng: number;
  coordsExact: boolean;
  needsCorsProxy: boolean;
  attribution: string;
  sourcePortal: string;
  roiPolygon: NormalizedPolygon | null;
  thumbnailUrl: string | null;
  fallbackVideoUrl: string | null;
  hasActiveReport?: boolean;
}

export interface TrackedObjectOverlay {
  trackId: number;
  className: string; // "PKL" / "gerobak"
  confidence: number;
  /** Koordinat bbox ternormalisasi 0..1 */
  bboxNorm: { x1: number; y1: number; x2: number; y2: number };
  inRoi: boolean;
  state: TrackerLifecycleState;
  dwellSeconds: number;
}

export interface ViolationCapturePayload {
  cameraId: string;
  source: 'AUTO_AI' | 'MANUAL';
  /** Jumlah total PKL berstatus REPORTED/SUPPRESSED aktif bersamaan di ROI */
  currentActiveViolators: number;
  maxConfidence: number;
  isSimulationMode: boolean;
  /** Snapshot JPEG terkompresi (<= 1.5 MB) siap dikirim via FormData */
  snapshotBlob: Blob;
  capturedAtIso: string;
}

export interface CctvLiveTelemetry {
  streamStatus: CctvStreamStatus;
  aiBackend: 'webgpu' | 'wasm' | null;
  inferenceMs: number | null;
  inRoiCount: number;
  maxDwellSeconds: number;
  activeViolatorsCount: number;
  tracks: TrackedObjectOverlay[];
}

export interface CctvPlayerWithAIProps {
  camera: CctvCameraDto;
  /** Default: 15 (mode demo) atau 300 (operasional) dari VITE_VIOLATION_THRESHOLD_SEC */
  violationThresholdSec?: number;
  /** Default: 45 detik (rentang 30-60s) */
  occlusionGraceSec?: number;
  /** Default: 5000 ms */
  hlsTimeoutMs?: number;
  /** Callback tunggal ke parent (Dev 1) untuk memanggil POST /api/reports/auto-detect + tampilkan Toast */
  onViolationCaptured: (payload: ViolationCapturePayload) => Promise<{
    outcome:
      | 'CREATED'
      | 'MERGED_ESCALATED'
      | 'MERGED_NOOP'
      | 'COOLDOWN_SUPPRESSED';
    reportId?: string;
    reportCode?: string;
  }>;
  /** Opsional: melaporkan telemetri live ke bar status bawah video */
  onTelemetryChange?: (telemetry: CctvLiveTelemetry) => void;
}
