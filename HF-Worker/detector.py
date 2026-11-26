"""ONNX Runtime CPU detector hemat memori + filter poligon ROI untuk HF-Worker 24/7."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort
import requests

WORKER_ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL_URL = "https://portal-patra.vercel.app/models/best.onnx"


@dataclass
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    class_id: int

    @property
    def bottom_center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, self.y2)


def ensure_model_file(model_path: Path, model_url: str) -> Path:
    """Cari model lokal (HF-Worker/model/best.onnx atau AI-Patra/model/best.onnx), atau unduh dari MODEL_URL."""
    if model_path.exists() and model_path.stat().st_size > 100_000:
        return model_path

    local_monorepo_model = WORKER_ROOT.parent / "AI-Patra" / "model" / "best.onnx"
    if local_monorepo_model.exists() and local_monorepo_model.stat().st_size > 100_000:
        return local_monorepo_model

    if not model_url:
        raise FileNotFoundError(
            f"Model ONNX tidak ditemukan di {model_path} dan MODEL_URL kosong."
        )

    model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = model_path.with_suffix(".onnx.tmp")
    print(f"[detector] Mengunduh model ONNX dari {model_url} -> {model_path}...")
    resp = requests.get(model_url, stream=True, timeout=60)
    resp.raise_for_status()
    with open(tmp_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 256):
            if chunk:
                f.write(chunk)

    head = tmp_path.read_bytes()[:16].lstrip().lower()
    if head.startswith(b"<!doctype") or head.startswith(b"<html") or tmp_path.stat().st_size < 100_000:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(f"Unduhan dari {model_url} bukan binary ONNX yang valid.")

    tmp_path.replace(model_path)
    print(f"[detector] Model siap ({model_path.stat().st_size / (1024 * 1024):.2f} MB).")
    return model_path


def letterbox(img_bgr: np.ndarray, target_size: int = 640) -> tuple[np.ndarray, float, int, int]:
    h, w = img_bgr.shape[:2]
    scale = min(target_size / float(h), target_size / float(w))
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    pad_w = (target_size - new_w) / 2.0
    pad_h = (target_size - new_h) / 2.0

    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(pad_h - 0.1)), int(round(pad_h + 0.1))
    left, right = int(round(pad_w - 0.1)), int(round(pad_w + 0.1))
    padded = cv2.copyMakeBorder(
        resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114)
    )
    return padded, scale, left, top


def box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return inter / max(1e-6, area_a + area_b - inter)


def decode_onnx_output(
    raw_out: np.ndarray,
    orig_w: int,
    orig_h: int,
    scale: float,
    pad_left: int,
    pad_top: int,
    conf_thresh: float = 0.30,
    iou_nms: float = 0.45,
) -> list[Detection]:
    """Mendukung format end2end [1, N, 6] maupun raw head [1, 4+nc, 8400]."""
    arr = np.squeeze(raw_out, axis=0)
    candidates: list[Detection] = []

    if arr.ndim == 2 and arr.shape[1] == 6:
        for row in arr:
            score = float(row[4])
            if score < conf_thresh:
                continue
            x1 = max(0.0, min(float(orig_w), (float(row[0]) - pad_left) / scale))
            y1 = max(0.0, min(float(orig_h), (float(row[1]) - pad_top) / scale))
            x2 = max(0.0, min(float(orig_w), (float(row[2]) - pad_left) / scale))
            y2 = max(0.0, min(float(orig_h), (float(row[3]) - pad_top) / scale))
            if x2 <= x1 or y2 <= y1:
                continue
            candidates.append(Detection(x1, y1, x2, y2, score, int(round(float(row[5])))))
        return candidates

    if arr.ndim == 2 and arr.shape[0] < arr.shape[1]:
        arr = arr.T

    for row in arr:
        cls_scores = row[4:]
        if cls_scores.size == 0:
            continue
        cls_id = int(np.argmax(cls_scores))
        score = float(cls_scores[cls_id])
        if score < conf_thresh:
            continue
        cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
        x1 = max(0.0, min(float(orig_w), ((cx - bw / 2.0) - pad_left) / scale))
        y1 = max(0.0, min(float(orig_h), ((cy - bh / 2.0) - pad_top) / scale))
        x2 = max(0.0, min(float(orig_w), ((cx + bw / 2.0) - pad_left) / scale))
        y2 = max(0.0, min(float(orig_h), ((cy + bh / 2.0) - pad_top) / scale))
        if x2 <= x1 or y2 <= y1:
            continue
        candidates.append(Detection(x1, y1, x2, y2, score, cls_id))

    # NMS klasik
    candidates.sort(key=lambda d: d.score, reverse=True)
    kept: list[Detection] = []
    for det in candidates:
        if all(
            box_iou((det.x1, det.y1, det.x2, det.y2), (k.x1, k.y1, k.x2, k.y2)) < iou_nms
            for k in kept
        ):
            kept.append(det)
    return kept


def point_in_polygon(px: float, py: float, polygon: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon untuk koordinat ternormalisasi 0..1."""
    inside = False
    n = len(polygon)
    if n < 3:
        return True
    j = n - 1
    for i in range(n):
        xi, yi = float(polygon[i][0]), float(polygon[i][1])
        xj, yj = float(polygon[j][0]), float(polygon[j][1])
        intersect = ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / max(1e-9, (yj - yi)) + xi
        )
        if intersect:
            inside = not inside
        j = i
    return inside


def filter_detections_by_roi(
    detections: list[Detection],
    orig_w: int,
    orig_h: int,
    roi_polygon: Any,
) -> list[Detection]:
    """Pertahankan deteksi yang titik dasar-tengahnya (bottom-center) berada di dalam ROI trotoar."""
    if not isinstance(roi_polygon, list) or len(roi_polygon) < 3:
        return detections
    matched: list[Detection] = []
    for det in detections:
        bc_x, bc_y = det.bottom_center
        nx = bc_x / max(1.0, float(orig_w))
        ny = bc_y / max(1.0, float(orig_h))
        if point_in_polygon(nx, ny, roi_polygon):
            matched.append(det)
    return matched


def render_evidence_jpeg(
    frame_bgr: np.ndarray,
    detections: list[Detection],
    roi_polygon: Any = None,
    max_width: int = 960,
    quality: int = 84,
) -> bytes:
    """Gambar kotak deteksi & ROI pada snapshot Before lalu encode JPEG ringan untuk Supabase Storage."""
    vis = frame_bgr.copy()
    h, w = vis.shape[:2]

    if isinstance(roi_polygon, list) and len(roi_polygon) >= 3:
        pts = np.array(
            [[int(round(float(p[0]) * w)), int(round(float(p[1]) * h))] for p in roi_polygon],
            dtype=np.int32,
        )
        cv2.polylines(vis, [pts], isClosed=True, color=(235, 166, 115), thickness=2)

    for det in detections:
        x1, y1, x2, y2 = int(round(det.x1)), int(round(det.y1)), int(round(det.x2)), int(round(det.y2))
        cv2.rectangle(vis, (x1, y1), (x2, y2), (38, 38, 220), 2)
        cv2.putText(
            vis,
            f"PKL {det.score:.2f}",
            (x1, max(16, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (38, 38, 220),
            2,
            cv2.LINE_AA,
        )

    if w > max_width:
        scale = max_width / float(w)
        vis = cv2.resize(vis, (max_width, max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)

    ok, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Gagal encode JPEG snapshot bukti.")
    return buf.tobytes()


class OnnxPklDetector:
    """Wrapper ONNX Runtime CPU hemat memori (reuse session tunggal untuk loop 24/7)."""

    def __init__(
        self,
        model_path: str | Path = "model/best.onnx",
        model_url: str = DEFAULT_MODEL_URL,
        conf_thresh: float = 0.30,
        iou_nms: float = 0.45,
    ) -> None:
        resolved = ensure_model_file(Path(model_path), model_url)
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("ORT_INTRA_THREADS", "2"))
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.session = ort.InferenceSession(
            str(resolved),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        shape = inp.shape
        self.imgsz = int(shape[2]) if len(shape) >= 4 and isinstance(shape[2], int) else 640
        self.conf_thresh = conf_thresh
        self.iou_nms = iou_nms

    def detect(self, frame_bgr: np.ndarray, roi_polygon: Any = None) -> list[Detection]:
        orig_h, orig_w = frame_bgr.shape[:2]
        padded, scale, pad_left, pad_top = letterbox(frame_bgr, self.imgsz)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...])
        raw_out = self.session.run(None, {self.input_name: blob})[0]
        dets = decode_onnx_output(
            raw_out,
            orig_w=orig_w,
            orig_h=orig_h,
            scale=scale,
            pad_left=pad_left,
            pad_top=pad_top,
            conf_thresh=self.conf_thresh,
            iou_nms=self.iou_nms,
        )
        return filter_detections_by_roi(dets, orig_w, orig_h, roi_polygon)
