"""
PATRA — Parity Verification Script: `best.pt` vs `best.onnx` (T1-08).

Memverifikasi bahwa inferensi `AI-Patra/model/best.onnx` (dengan preprocessing &
postprocessing yang identik dengan browser `onnxruntime-web`) menghasilkan deteksi
yang konsisten terhadap `AI-Patra/model/best.pt` pada gambar kamera `test/` yang
belum pernah dilihat saat training.

Acceptance Criteria (docs/task.md T1-08):
- Ukuran `best.onnx` <= 12 MB
- Rata-rata IoU deteksi `.onnx` vs `.pt` >= 0.50
- Mendukung auto-detect format output `[1, 300, 6]` (end2end) maupun `[1, 4+nc, 8400]` (NMS).

Contoh penggunaan:
  python verify_onnx.py
  python verify_onnx.py --num-images 15 --conf 0.25 --min-iou 0.50
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

AI_ROOT = Path(__file__).resolve().parent
DEFAULT_PT = AI_ROOT / "model" / "best.pt"
DEFAULT_ONNX = AI_ROOT / "model" / "best.onnx"
DEFAULT_TEST_DIR = AI_ROOT / "dataset" / "test" / "images"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify ONNX vs PyTorch parity for PATRA YOLO26n")
    parser.add_argument("--pt", type=Path, default=DEFAULT_PT, help="Path ke best.pt")
    parser.add_argument("--onnx", type=Path, default=DEFAULT_ONNX, help="Path ke best.onnx")
    parser.add_argument("--images", type=Path, default=DEFAULT_TEST_DIR, help="Folder gambar uji")
    parser.add_argument("--imgsz", type=int, default=640, help="Resolusi input ONNX (default: 640)")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold (default: 0.25)")
    parser.add_argument("--iou-nms", type=float, default=0.45, help="IoU threshold NMS (default: 0.45)")
    parser.add_argument("--min-iou", type=float, default=0.50, help="Ambang kelulusan parity IoU (default: 0.50)")
    parser.add_argument("--num-images", type=int, default=15, help="Jumlah maksimal gambar uji (default: 15)")
    return parser.parse_args()


def letterbox(img_bgr: np.ndarray, target_size: int = 640):
    """Resize dengan mempertahankan rasio aspek + padding abu-abu 114 (identik Ultralytics/FE)."""
    import cv2

    h, w = img_bgr.shape[:2]
    scale = min(target_size / h, target_size / w)
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


def box_iou(a: np.ndarray, b: np.ndarray) -> float:
    ix1 = max(float(a[0]), float(b[0]))
    iy1 = max(float(a[1]), float(b[1]))
    ix2 = min(float(a[2]), float(b[2]))
    iy2 = min(float(a[3]), float(b[3]))
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, float(a[2] - a[0])) * max(0.0, float(a[3] - a[1]))
    area_b = max(0.0, float(b[2] - b[0])) * max(0.0, float(b[3] - b[1]))
    return inter / max(1e-6, area_a + area_b - inter)


def nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float = 0.45) -> list[int]:
    if len(boxes) == 0:
        return []
    order = np.argsort(scores)[::-1]
    keep = []
    while len(order) > 0:
        i = int(order[0])
        keep.append(i)
        rest = []
        for j in order[1:]:
            if box_iou(boxes[i], boxes[int(j)]) < iou_thresh:
                rest.append(int(j))
        order = np.array(rest, dtype=np.int64)
    return keep


def parse_onnx_output(
    raw_out: np.ndarray,
    orig_w: int,
    orig_h: int,
    scale: float,
    pad_left: int,
    pad_top: int,
    conf_thresh: float,
    iou_nms: float,
) -> list[np.ndarray]:
    """Dual-format parser: [1, N, 6] end2end & [1, 4+nc, 8400] raw head."""
    arr = np.squeeze(raw_out, axis=0)
    boxes = []
    scores = []

    if arr.ndim == 2 and arr.shape[1] == 6:
        # Format End-to-End: [N, 6] -> x1, y1, x2, y2, score, cls
        for row in arr:
            score = float(row[4])
            if score < conf_thresh:
                continue
            x1 = (float(row[0]) - pad_left) / scale
            y1 = (float(row[1]) - pad_top) / scale
            x2 = (float(row[2]) - pad_left) / scale
            y2 = (float(row[3]) - pad_top) / scale
            boxes.append(
                [
                    max(0.0, min(orig_w, x1)),
                    max(0.0, min(orig_h, y1)),
                    max(0.0, min(orig_w, x2)),
                    max(0.0, min(orig_h, y2)),
                ]
            )
            scores.append(score)
        return [np.array(b, dtype=np.float32) for b in boxes]

    # Format Legacy/Raw: [4+nc, 8400] -> transpose ke [8400, 4+nc]
    if arr.ndim == 2 and arr.shape[0] < arr.shape[1]:
        arr = arr.T

    for row in arr:
        cls_scores = row[4:]
        score = float(np.max(cls_scores))
        if score < conf_thresh:
            continue
        cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
        x1 = (cx - bw / 2.0 - pad_left) / scale
        y1 = (cy - bh / 2.0 - pad_top) / scale
        x2 = (cx + bw / 2.0 - pad_left) / scale
        y2 = (cy + bh / 2.0 - pad_top) / scale
        boxes.append(
            [
                max(0.0, min(orig_w, x1)),
                max(0.0, min(orig_h, y1)),
                max(0.0, min(orig_w, x2)),
                max(0.0, min(orig_h, y2)),
            ]
        )
        scores.append(score)

    if not boxes:
        return []
    boxes_np = np.array(boxes, dtype=np.float32)
    scores_np = np.array(scores, dtype=np.float32)
    keep = nms(boxes_np, scores_np, iou_thresh=iou_nms)
    return [boxes_np[i] for i in keep]


def main() -> int:
    args = parse_args()
    if not args.pt.exists():
        print(f"[ERR] File PyTorch weights tidak ditemukan: {args.pt}")
        return 1
    if not args.onnx.exists():
        print(f"[ERR] File ONNX model tidak ditemukan: {args.onnx}")
        return 1

    try:
        import cv2
        import onnxruntime as ort
        from ultralytics import YOLO
    except ImportError as exc:
        print(
            f"[ERR] Dependency belum lengkap ({exc}).\n"
            "      Jalankan: pip install -r AI-Patra/requirements.txt -r AI-Patra/requirements-onnx.txt"
        )
        return 1

    size_mb = args.onnx.stat().st_size / 1e6
    img_paths = sorted(
        p for p in args.images.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS
    )[: args.num_images]
    if not img_paths:
        print(f"[ERR] Tidak ada gambar uji di: {args.images}")
        return 1

    pt_model = YOLO(str(args.pt))
    sess = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name

    matched_ious: list[float] = []
    latencies_ms: list[float] = []
    pt_total = 0
    onnx_total = 0
    output_shape_seen = None

    for img_path in img_paths:
        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue
        orig_h, orig_w = img_bgr.shape[:2]

        # 1. PyTorch inference
        pt_res = pt_model.predict(
            source=img_bgr, imgsz=args.imgsz, conf=args.conf, iou=args.iou_nms, verbose=False
        )[0]
        pt_boxes = (
            pt_res.boxes.xyxy.cpu().numpy()
            if pt_res.boxes is not None and len(pt_res.boxes) > 0
            else np.zeros((0, 4), dtype=np.float32)
        )
        pt_total += len(pt_boxes)

        # 2. ONNX Runtime inference
        padded, scale, pad_left, pad_top = letterbox(img_bgr, args.imgsz)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(rgb, (2, 0, 1))[None, ...]

        t0 = time.perf_counter()
        raw_out = sess.run(None, {input_name: blob})[0]
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)
        output_shape_seen = raw_out.shape

        onnx_boxes = parse_onnx_output(
            raw_out,
            orig_w=orig_w,
            orig_h=orig_h,
            scale=scale,
            pad_left=pad_left,
            pad_top=pad_top,
            conf_thresh=args.conf,
            iou_nms=args.iou_nms,
        )
        onnx_total += len(onnx_boxes)

        # 3. Greedy IoU matching per PyTorch box
        for pb in pt_boxes:
            best = max((box_iou(pb, ob) for ob in onnx_boxes), default=0.0)
            matched_ious.append(best)

    mean_iou = float(np.mean(matched_ious)) if matched_ious else 1.0
    avg_ms = float(np.mean(latencies_ms)) if latencies_ms else 0.0
    passed = size_mb <= 12.0 and mean_iou >= args.min_iou

    print("\n================ ONNX PARITY VERIFICATION ================")
    print(f"Images tested    : {len(img_paths)}")
    print(f"ONNX size        : {size_mb:.2f} MB (target <= 12.00 MB)")
    print(f"ONNX output shape: {output_shape_seen}")
    print(f"Detections count : PyTorch={pt_total} | ONNX={onnx_total}")
    print(f"Mean matched IoU : {mean_iou:.4f} (target >= {args.min_iou:.2f})")
    print(f"CPU latency avg  : {avg_ms:.1f} ms/frame (target 1 FPS <= 400 ms)")
    print(f"Verification     : {'PASSED' if passed else 'FAILED'}")
    print("==========================================================\n")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
