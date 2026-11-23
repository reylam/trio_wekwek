"""
PATRA / PETRA — Comprehensive ONNX Evaluation, Distance/Camera Analysis & Error Visualization.

Mencakup:
- Phase 2: Baseline evaluation di 10 confidence threshold (0.10..0.60), IoU=0.50 matching,
           TP/FP/FN, Precision, Recall, F1, true COCO mAP@50 & mAP@50-95 (berbasis ground-truth),
           inference latency, FPS, dan confusion analysis (per sub-kelas & tipe FP).
- Phase 3: Evaluasi berbasis ukuran visual objek (Near / Medium / Far + sub-slice Tiny),
           camera angle/type, image resolution, lighting condition (Day/Dusk/Night),
           image quality/sharpness (Laplacian variance), dan per camera source.
- Phase 4: Error analysis & penyimpanan visualisasi inference (GT, TP, FP, FN, confidence, IoU)
           serta contact sheet gambar error terburuk.
- Phase 6: Mendukung evaluasi multi-model (mis. Civision vs PATRA Original vs PATRA Fine-Tuned)
           pada dataset yang identik + visualisasi perbandingan side-by-side.

Menggunakan kembali utilitas `letterbox`, `box_iou`, `nms` dari `verify_onnx.py` dan
`extract_camera_group`, `convert_line_to_yolo_bbox`, `CLASS_NAMES` dari `prepare_dataset.py`.

Contoh penggunaan (jalankan dengan venv AI-Patra):
  python AI-Patra/evaluate_models.py --split valid --models patra_orig=AI-Patra/model/best_patra_highangle.onnx --run-name phase2_valid --save-visuals
  python AI-Patra/evaluate_models.py --split test  --models patra_orig=AI-Patra/model/best_patra_highangle.onnx --run-name phase2_test  --save-visuals
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from prepare_dataset import (  # noqa: E402
    CLASS_NAMES,
    DATASET_DIR,
    IMG_EXTS,
    convert_line_to_yolo_bbox,
    extract_camera_group,
)
from verify_onnx import box_iou, letterbox, nms  # noqa: E402

DEFAULT_THRESHOLDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
DEFAULT_OUT_ROOT = AI_ROOT / "evaluation_results"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate PATRA YOLO ONNX model(s) across thresholds, sizes, cameras, and errors."
    )
    parser.add_argument(
        "--preset",
        type=str,
        choices=("valid5", "test6_expA", "test6_expD", "test6_expB", "valid7_v2", "test7_v2", "valid_v3", "test_v3"),
        default="",
        help="Preset evaluasi singkat agar perintah CLI tidak terpotong di PowerShell.",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        default=[],
        help="Daftar model format `nama=path/ke/model.onnx` (bisa 1 atau lebih untuk perbandingan).",
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=DATASET_DIR,
        help="Root folder dataset (default: AI-Patra/dataset)",
    )
    parser.add_argument(
        "--split",
        type=str,
        choices=("train", "valid", "test"),
        default="test",
        help="Split dataset yang dievaluasi (gunakan `valid` untuk tuning, `test` untuk evaluasi final).",
    )
    parser.add_argument(
        "--thresholds",
        type=str,
        default=",".join(f"{t:.2f}" for t in DEFAULT_THRESHOLDS),
        help="Daftar confidence threshold dipisah koma (default: 0.10..0.60).",
    )
    parser.add_argument(
        "--iou",
        type=float,
        default=0.50,
        help="IoU threshold untuk matching TP/FP/FN (default: 0.50).",
    )
    parser.add_argument(
        "--iou-nms",
        type=float,
        default=0.45,
        help="IoU threshold NMS untuk raw ONNX output (default: 0.45).",
    )
    parser.add_argument(
        "--op-conf",
        type=float,
        default=0.25,
        help="Confidence threshold untuk breakdown Phase 3 & visualisasi Phase 4 (default: 0.25).",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=0,
        help="Override ukuran input ONNX (0 = auto-deteksi dari tensor input ONNX, fallback 640).",
    )
    parser.add_argument(
        "--provider",
        type=str,
        choices=("cpu", "cuda"),
        default="cpu",
        help="ONNX Runtime execution provider (default: cpu agar konsisten dengan benchmark awal).",
    )
    parser.add_argument(
        "--run-name",
        type=str,
        default="eval_run",
        help="Nama subfolder output di AI-Patra/evaluation_results/.",
    )
    parser.add_argument(
        "--save-visuals",
        action="store_true",
        help="Simpan visualisasi bounding box (GT, TP, FP, FN) dan contact sheet error.",
    )
    parser.add_argument(
        "--max-vis",
        type=int,
        default=12,
        help="Jumlah gambar maksimal pada folder worst_fn / worst_fp & contact sheet (default: 12).",
    )
    return parser.parse_args()


def parse_model_specs(specs: list[str]) -> list[tuple[str, Path]]:
    parsed: list[tuple[str, Path]] = []
    for raw in specs:
        if "=" in raw:
            name, path_str = raw.split("=", 1)
        else:
            p = Path(raw)
            name, path_str = p.stem, raw
        model_path = Path(path_str)
        if not model_path.exists():
            raise FileNotFoundError(f"Model ONNX tidak ditemukan: {model_path}")
        parsed.append((name.strip(), model_path))
    return parsed


def classify_size_bin(area_ratio: float) -> str:
    """Kelompok jarak visual berdasarkan proporsi luas objek terhadap frame."""
    if area_ratio < 0.01:
        return "Far (<1%)"
    if area_ratio < 0.04:
        return "Medium (1-4%)"
    return "Near (>=4%)"


def classify_camera_angle(cam_group: str) -> str:
    upper = cam_group.upper()
    if upper.startswith("JPO-") or "JPO" in upper:
        return "High-Angle JPO/Overpass"
    if upper.startswith("NONCCTV_"):
        return "Non-CCTV / Mixed"
    if upper.startswith("IDCCTV"):
        return "High-Angle JakCCTV/JPO"
    return "High-Angle Street CCTV"


def analyze_image_characteristics(img_bgr: np.ndarray, img_path: Path) -> dict[str, Any]:
    """Ekstrak resolusi, pencahayaan (day/dusk/night), dan ketajaman/kompresi (Laplacian var)."""
    h, w = img_bgr.shape[:2]
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    v_chan = hsv[:, :, 2]
    mean_v = float(np.mean(v_chan))
    dark_ratio = float(np.mean(v_chan < 50))

    if mean_v < 85.0 or dark_ratio > 0.45:
        lighting = "Night / Low-Light"
    elif mean_v < 120.0:
        lighting = "Dusk / Overcast"
    else:
        lighting = "Day / Bright"

    # Normalisasi ke 640 sisi terpanjang agar Laplacian variance adil antar-resolusi
    scale = 640.0 / max(h, w)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    if abs(scale - 1.0) > 1e-3:
        gray_norm = cv2.resize(
            gray, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        gray_norm = gray
    lap_var = float(cv2.Laplacian(gray_norm, cv2.CV_64F).var())

    if lap_var < 150.0:
        quality = "Low / Compressed-Blur"
    elif lap_var < 500.0:
        quality = "Medium Quality"
    else:
        quality = "Sharp / High Detail"

    if w == 640 and h == 640:
        res_bucket = "640x640 (Roboflow Stretch)"
    elif max(w, h) >= 1200:
        res_bucket = "720p+ HD"
    else:
        res_bucket = f"Other ({w}x{h})"

    kb_per_mp = (img_path.stat().st_size / 1024.0) / max(1e-6, (w * h) / 1e6)

    return {
        "width": w,
        "height": h,
        "resolution_bucket": res_bucket,
        "mean_brightness": round(mean_v, 1),
        "dark_ratio": round(dark_ratio, 3),
        "lighting": lighting,
        "laplacian_var": round(lap_var, 1),
        "quality": quality,
        "kb_per_mp": round(kb_per_mp, 1),
    }


def load_split_dataset(dataset_dir: Path, split: str) -> list[dict[str, Any]]:
    img_dir = dataset_dir / split / "images"
    lbl_dir = dataset_dir / split / "labels"
    if not img_dir.exists() or not lbl_dir.exists():
        raise FileNotFoundError(f"Split `{split}` tidak lengkap di {dataset_dir}")

    samples: list[dict[str, Any]] = []
    img_paths = sorted(p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS)
    if not img_paths:
        raise RuntimeError(f"Tidak ada gambar ditemukan di {img_dir}")

    missing_labels = []
    for img_path in img_paths:
        lbl_path = lbl_dir / f"{img_path.stem}.txt"
        if not lbl_path.exists():
            missing_labels.append(img_path.name)
            continue

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            raise RuntimeError(f"Gagal membaca gambar korup: {img_path}")
        h, w = img_bgr.shape[:2]

        gt_boxes: list[dict[str, Any]] = []
        with open(lbl_path, "r", encoding="utf-8") as f:
            for line in f:
                parsed = convert_line_to_yolo_bbox(line)
                if parsed is None:
                    continue
                cls_id, cx, cy, bw, bh = parsed
                x1 = max(0.0, (cx - bw / 2.0) * w)
                y1 = max(0.0, (cy - bh / 2.0) * h)
                x2 = min(float(w), (cx + bw / 2.0) * w)
                y2 = min(float(h), (cy + bh / 2.0) * h)
                area_ratio = float(bw * bh)
                gt_boxes.append(
                    {
                        "bbox": np.array([x1, y1, x2, y2], dtype=np.float32),
                        "cls_id": cls_id,
                        "cls_name": CLASS_NAMES.get(cls_id, f"cls_{cls_id}"),
                        "area_ratio": area_ratio,
                        "size_bin": classify_size_bin(area_ratio),
                        "is_tiny": area_ratio < 0.0025,
                    }
                )

        cam_group = extract_camera_group(img_path.stem)
        meta = analyze_image_characteristics(img_bgr, img_path)
        meta["camera_group"] = cam_group
        meta["camera_angle"] = classify_camera_angle(cam_group)

        samples.append(
            {
                "stem": img_path.stem,
                "filename": img_path.name,
                "img_path": img_path,
                "lbl_path": lbl_path,
                "gt": gt_boxes,
                "meta": meta,
            }
        )

    if missing_labels:
        raise FileNotFoundError(
            f"{len(missing_labels)} gambar tidak memiliki file label ground-truth! "
            f"Contoh: {missing_labels[:5]}"
        )
    return samples


def decode_onnx_with_scores(
    raw_out: np.ndarray,
    orig_w: int,
    orig_h: int,
    scale: float,
    pad_left: int,
    pad_top: int,
    conf_thresh: float = 0.001,
    iou_nms: float = 0.45,
    max_det: int = 300,
) -> list[dict[str, Any]]:
    """Decode output ONNX ([1, N, 6] end2end atau [1, 4+nc, 8400] raw head) beserta skor confidence."""
    arr = np.squeeze(raw_out, axis=0)
    boxes: list[list[float]] = []
    scores: list[float] = []

    if arr.ndim == 2 and arr.shape[1] == 6:
        # Format End-to-End NMS built-in: [N, 6] -> x1, y1, x2, y2, score, cls
        mask = arr[:, 4] >= conf_thresh
        for row in arr[mask]:
            x1 = max(0.0, min(float(orig_w), (float(row[0]) - pad_left) / scale))
            y1 = max(0.0, min(float(orig_h), (float(row[1]) - pad_top) / scale))
            x2 = max(0.0, min(float(orig_w), (float(row[2]) - pad_left) / scale))
            y2 = max(0.0, min(float(orig_h), (float(row[3]) - pad_top) / scale))
            if (x2 - x1) < 1.0 or (y2 - y1) < 1.0:
                continue
            boxes.append([x1, y1, x2, y2])
            scores.append(float(row[4]))

        order = np.argsort(scores)[::-1][:max_det]
        dets = []
        for idx in order:
            b = np.array(boxes[int(idx)], dtype=np.float32)
            area_ratio = float(((b[2] - b[0]) * (b[3] - b[1])) / max(1.0, orig_w * orig_h))
            dets.append(
                {
                    "bbox": b,
                    "score": float(scores[int(idx)]),
                    "area_ratio": area_ratio,
                    "size_bin": classify_size_bin(area_ratio),
                }
            )
        return dets

    # Format Raw Head: [4+nc, 8400] -> transpose ke [8400, 4+nc]
    if arr.ndim == 2 and arr.shape[0] < arr.shape[1]:
        arr = arr.T

    cls_scores = arr[:, 4:]
    max_scores = np.max(cls_scores, axis=1)
    keep_mask = max_scores >= conf_thresh
    filtered_rows = arr[keep_mask]
    filtered_scores = max_scores[keep_mask]

    if len(filtered_rows) == 0:
        return []

    # Batasi kandidat pre-NMS agar NMS tetap cepat pada threshold rendah (0.001)
    if len(filtered_scores) > 2000:
        top_idx = np.argsort(filtered_scores)[::-1][:2000]
        filtered_rows = filtered_rows[top_idx]
        filtered_scores = filtered_scores[top_idx]

    for row, sc in zip(filtered_rows, filtered_scores):
        cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
        x1 = max(0.0, min(float(orig_w), (cx - bw / 2.0 - pad_left) / scale))
        y1 = max(0.0, min(float(orig_h), (cy - bh / 2.0 - pad_top) / scale))
        x2 = max(0.0, min(float(orig_w), (cx + bw / 2.0 - pad_left) / scale))
        y2 = max(0.0, min(float(orig_h), (cy + bh / 2.0 - pad_top) / scale))
        if (x2 - x1) < 1.0 or (y2 - y1) < 1.0:
            continue
        boxes.append([x1, y1, x2, y2])
        scores.append(float(sc))

    if not boxes:
        return []

    boxes_np = np.array(boxes, dtype=np.float32)
    scores_np = np.array(scores, dtype=np.float32)
    keep = nms(boxes_np, scores_np, iou_thresh=iou_nms)[:max_det]

    dets = []
    for idx in keep:
        b = boxes_np[idx]
        area_ratio = float(((b[2] - b[0]) * (b[3] - b[1])) / max(1.0, orig_w * orig_h))
        dets.append(
            {
                "bbox": b,
                "score": float(scores_np[idx]),
                "area_ratio": area_ratio,
                "size_bin": classify_size_bin(area_ratio),
            }
        )
    return dets


def detect_onnx_input_size(session: ort.InferenceSession, override: int) -> int:
    if override > 0:
        return override
    inp_shape = session.get_inputs()[0].shape
    if len(inp_shape) >= 4 and isinstance(inp_shape[2], int) and inp_shape[2] > 0:
        return int(inp_shape[2])
    return 640


def run_model_inference_all(
    model_path: Path,
    samples: list[dict[str, Any]],
    imgsz_override: int,
    iou_nms: float,
    provider: str,
) -> dict[str, Any]:
    providers = (
        ["CUDAExecutionProvider", "CPUExecutionProvider"]
        if provider == "cuda"
        else ["CPUExecutionProvider"]
    )
    sess = ort.InferenceSession(str(model_path), providers=providers)
    active_providers = sess.get_providers()
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    imgsz = detect_onnx_input_size(sess, imgsz_override)

    # Warmup 3x agar benchmark latency bebas cold-start
    dummy = np.zeros((1, 3, imgsz, imgsz), dtype=np.float32)
    for _ in range(3):
        sess.run(None, {inp.name: dummy})

    preds_by_stem: dict[str, list[dict[str, Any]]] = {}
    infer_ms_list: list[float] = []
    e2e_ms_list: list[float] = []
    output_shape = None

    for sample in samples:
        img_bgr = cv2.imread(str(sample["img_path"]))
        orig_h, orig_w = img_bgr.shape[:2]

        t_e2e = time.perf_counter()
        padded, scale, pad_left, pad_top = letterbox(img_bgr, imgsz)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...])

        t_inf = time.perf_counter()
        raw_out = sess.run(None, {inp.name: blob})[0]
        infer_ms = (time.perf_counter() - t_inf) * 1000.0
        output_shape = list(raw_out.shape)

        dets = decode_onnx_with_scores(
            raw_out,
            orig_w=orig_w,
            orig_h=orig_h,
            scale=scale,
            pad_left=pad_left,
            pad_top=pad_top,
            conf_thresh=0.001,
            iou_nms=iou_nms,
            max_det=300,
        )
        e2e_ms = (time.perf_counter() - t_e2e) * 1000.0

        infer_ms_list.append(infer_ms)
        e2e_ms_list.append(e2e_ms)
        preds_by_stem[sample["stem"]] = dets

    mean_infer = float(np.mean(infer_ms_list))
    p95_infer = float(np.percentile(infer_ms_list, 95))
    mean_e2e = float(np.mean(e2e_ms_list))

    return {
        "model_path": str(model_path),
        "size_mb": round(model_path.stat().st_size / 1e6, 2),
        "imgsz": imgsz,
        "input_name": inp.name,
        "input_shape": [int(x) if isinstance(x, int) else str(x) for x in inp.shape],
        "output_name": out.name,
        "output_shape": output_shape,
        "providers": active_providers,
        "latency": {
            "infer_mean_ms": round(mean_infer, 2),
            "infer_p95_ms": round(p95_infer, 2),
            "infer_fps": round(1000.0 / max(1e-6, mean_infer), 2),
            "e2e_mean_ms": round(mean_e2e, 2),
            "e2e_fps": round(1000.0 / max(1e-6, mean_e2e), 2),
        },
        "preds_by_stem": preds_by_stem,
    }


def match_image_detections(
    gt_list: list[dict[str, Any]],
    pred_list: list[dict[str, Any]],
    iou_thresh: float,
) -> dict[str, Any]:
    """Greedy 1-to-1 matching berurutan berdasarkan skor prediksi tertinggi."""
    sorted_preds = sorted(pred_list, key=lambda d: d["score"], reverse=True)
    gt_matched = [False] * len(gt_list)

    tp_records: list[dict[str, Any]] = []
    fp_records: list[dict[str, Any]] = []

    for pred in sorted_preds:
        best_iou = 0.0
        best_gt_idx = -1
        max_any_iou = 0.0
        for g_idx, gt in enumerate(gt_list):
            iou = box_iou(pred["bbox"], gt["bbox"])
            if iou > max_any_iou:
                max_any_iou = iou
            if not gt_matched[g_idx] and iou > best_iou:
                best_iou = iou
                best_gt_idx = g_idx

        if best_gt_idx >= 0 and best_iou >= iou_thresh:
            gt_matched[best_gt_idx] = True
            tp_records.append(
                {
                    "pred": pred,
                    "gt_idx": best_gt_idx,
                    "gt": gt_list[best_gt_idx],
                    "iou": best_iou,
                }
            )
        else:
            if max_any_iou >= iou_thresh:
                fp_type = "duplicate_detection"
            elif max_any_iou >= 0.10:
                fp_type = "localization_error"
            else:
                fp_type = "background_fp"
            fp_records.append(
                {
                    "pred": pred,
                    "max_any_iou": max_any_iou,
                    "fp_type": fp_type,
                }
            )

    fn_records = [
        {"gt_idx": i, "gt": gt}
        for i, gt in enumerate(gt_list)
        if not gt_matched[i]
    ]
    return {"tp": tp_records, "fp": fp_records, "fn": fn_records}


def compute_prf(tp: int, fp: int, fn: int) -> dict[str, Any]:
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2.0 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
    }


def compute_coco_ap(
    samples: list[dict[str, Any]],
    preds_by_stem: dict[str, list[dict[str, Any]]],
    iou_thresh: float,
) -> float:
    """Hitung AP kelas-tunggal (PKL) menggunakan interpolasi 101-titik standar COCO."""
    total_gt = sum(len(s["gt"]) for s in samples)
    if total_gt == 0:
        return 0.0

    # Kumpulkan seluruh prediksi dari semua gambar beserta referensi stem
    all_preds: list[tuple[float, str, np.ndarray]] = []
    gt_map: dict[str, list[np.ndarray]] = {}
    matched_map: dict[str, list[bool]] = {}

    for s in samples:
        stem = s["stem"]
        gt_map[stem] = [g["bbox"] for g in s["gt"]]
        matched_map[stem] = [False] * len(s["gt"])
        for p in preds_by_stem[stem]:
            all_preds.append((p["score"], stem, p["bbox"]))

    if not all_preds:
        return 0.0

    all_preds.sort(key=lambda x: x[0], reverse=True)
    tp_flags = np.zeros(len(all_preds), dtype=np.float64)
    fp_flags = np.zeros(len(all_preds), dtype=np.float64)

    for idx, (_score, stem, pbox) in enumerate(all_preds):
        gt_boxes = gt_map[stem]
        best_iou = 0.0
        best_j = -1
        for j, gbox in enumerate(gt_boxes):
            if matched_map[stem][j]:
                continue
            iou = box_iou(pbox, gbox)
            if iou > best_iou:
                best_iou = iou
                best_j = j
        if best_j >= 0 and best_iou >= iou_thresh:
            matched_map[stem][best_j] = True
            tp_flags[idx] = 1.0
        else:
            fp_flags[idx] = 1.0

    cum_tp = np.cumsum(tp_flags)
    cum_fp = np.cumsum(fp_flags)
    recalls = cum_tp / float(total_gt)
    precisions = cum_tp / np.maximum(cum_tp + cum_fp, 1e-12)

    # Monotonic precision envelope (standar pycocotools 101-point AP)
    mpre = precisions.copy()
    for i in range(len(mpre) - 2, -1, -1):
        if mpre[i] < mpre[i + 1]:
            mpre[i] = mpre[i + 1]

    recall_grid = np.linspace(0.0, 1.0, 101)
    idx_hits = np.searchsorted(recalls, recall_grid, side="left")
    ap_vals = np.array(
        [float(mpre[i]) if i < len(mpre) else 0.0 for i in idx_hits],
        dtype=np.float64,
    )
    return float(np.mean(ap_vals))


def evaluate_model(
    model_name: str,
    model_path: Path,
    samples: list[dict[str, Any]],
    thresholds: list[float],
    iou_thresh: float,
    iou_nms: float,
    op_conf: float,
    imgsz_override: int,
    provider: str,
) -> dict[str, Any]:
    run_info = run_model_inference_all(
        model_path=model_path,
        samples=samples,
        imgsz_override=imgsz_override,
        iou_nms=iou_nms,
        provider=provider,
    )
    preds_by_stem = run_info["preds_by_stem"]

    # 1. True COCO mAP@50 & mAP@50-95
    iou_grid = [round(0.50 + 0.05 * i, 2) for i in range(10)]
    ap_by_iou = {
        f"{iou_val:.2f}": round(compute_coco_ap(samples, preds_by_stem, iou_val), 4)
        for iou_val in iou_grid
    }
    map50 = ap_by_iou["0.50"]
    map50_95 = round(float(np.mean(list(ap_by_iou.values()))), 4)

    # 2. Threshold sweep
    sweep_rows: list[dict[str, Any]] = []
    for thr in thresholds:
        tp_sum = fp_sum = fn_sum = 0
        matched_ious: list[float] = []
        for s in samples:
            filtered = [p for p in preds_by_stem[s["stem"]] if p["score"] >= thr]
            m = match_image_detections(s["gt"], filtered, iou_thresh)
            tp_sum += len(m["tp"])
            fp_sum += len(m["fp"])
            fn_sum += len(m["fn"])
            matched_ious.extend(r["iou"] for r in m["tp"])
        prf = compute_prf(tp_sum, fp_sum, fn_sum)
        prf["conf"] = round(thr, 2)
        prf["avg_tp_iou"] = round(float(np.mean(matched_ious)), 4) if matched_ious else 0.0
        sweep_rows.append(prf)

    best_f1_row = max(sweep_rows, key=lambda r: (r["f1"], r["precision"]))

    # 3. Detailed Breakdown pada operating threshold (`op_conf`)
    per_image_matches: dict[str, dict[str, Any]] = {}
    subcls_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"gt": 0, "tp": 0, "fn": 0, "ious": []}
    )
    size_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"gt": 0, "tp": 0, "fp": 0, "fn": 0, "ious": []}
    )
    tiny_stats = {"gt": 0, "tp": 0, "fn": 0}
    fp_type_counts = Counter()
    bg_image_fp = 0
    bg_image_count = 0

    group_keys = ("camera_angle", "resolution_bucket", "lighting", "quality", "camera_group")
    group_stats: dict[str, dict[str, dict[str, int]]] = {
        k: defaultdict(lambda: {"images": 0, "gt": 0, "tp": 0, "fp": 0, "fn": 0})
        for k in group_keys
    }

    for s in samples:
        filtered = [p for p in preds_by_stem[s["stem"]] if p["score"] >= op_conf]
        m = match_image_detections(s["gt"], filtered, iou_thresh)
        per_image_matches[s["stem"]] = m

        if len(s["gt"]) == 0:
            bg_image_count += 1
            bg_image_fp += len(m["fp"])

        for r in m["tp"]:
            g = r["gt"]
            subcls_stats[g["cls_name"]]["gt"] += 1
            subcls_stats[g["cls_name"]]["tp"] += 1
            subcls_stats[g["cls_name"]]["ious"].append(r["iou"])

            size_stats[g["size_bin"]]["gt"] += 1
            size_stats[g["size_bin"]]["tp"] += 1
            size_stats[g["size_bin"]]["ious"].append(r["iou"])
            if g["is_tiny"]:
                tiny_stats["gt"] += 1
                tiny_stats["tp"] += 1

        for r in m["fn"]:
            g = r["gt"]
            subcls_stats[g["cls_name"]]["gt"] += 1
            subcls_stats[g["cls_name"]]["fn"] += 1

            size_stats[g["size_bin"]]["gt"] += 1
            size_stats[g["size_bin"]]["fn"] += 1
            if g["is_tiny"]:
                tiny_stats["gt"] += 1
                tiny_stats["fn"] += 1

        for r in m["fp"]:
            fp_type_counts[r["fp_type"]] += 1
            size_stats[r["pred"]["size_bin"]]["fp"] += 1

        for gk in group_keys:
            gval = s["meta"][gk]
            st = group_stats[gk][gval]
            st["images"] += 1
            st["gt"] += len(s["gt"])
            st["tp"] += len(m["tp"])
            st["fp"] += len(m["fp"])
            st["fn"] += len(m["fn"])

    # Format sub-class confusion table
    subcls_summary = {}
    for cls_name in sorted(subcls_stats.keys()):
        st = subcls_stats[cls_name]
        rec = st["tp"] / st["gt"] if st["gt"] > 0 else 0.0
        subcls_summary[cls_name] = {
            "gt": st["gt"],
            "tp": st["tp"],
            "fn": st["fn"],
            "recall": round(rec, 4),
            "avg_iou": round(float(np.mean(st["ious"])), 4) if st["ious"] else 0.0,
        }

    # Format size/distance breakdown
    size_order = ["Near (>=4%)", "Medium (1-4%)", "Far (<1%)"]
    size_summary = {}
    for sb in size_order:
        st = size_stats[sb]
        prf = compute_prf(st["tp"], st["fp"], st["fn"])
        prf["gt"] = st["gt"]
        prf["avg_iou"] = round(float(np.mean(st["ious"])), 4) if st["ious"] else 0.0
        size_summary[sb] = prf
    size_summary["Sub-slice Tiny (<0.25%)"] = {
        "gt": tiny_stats["gt"],
        "tp": tiny_stats["tp"],
        "fn": tiny_stats["fn"],
        "recall": round(tiny_stats["tp"] / tiny_stats["gt"], 4) if tiny_stats["gt"] > 0 else 0.0,
    }

    # Format image-level group summaries
    formatted_groups: dict[str, dict[str, Any]] = {}
    for gk in group_keys:
        formatted_groups[gk] = {}
        for gval, st in sorted(group_stats[gk].items()):
            prf = compute_prf(st["tp"], st["fp"], st["fn"])
            prf["images"] = st["images"]
            prf["gt"] = st["gt"]
            formatted_groups[gk][gval] = prf

    return {
        "model_name": model_name,
        "model_path": run_info["model_path"],
        "size_mb": run_info["size_mb"],
        "imgsz": run_info["imgsz"],
        "input_shape": run_info["input_shape"],
        "output_shape": run_info["output_shape"],
        "providers": run_info["providers"],
        "latency": run_info["latency"],
        "map50": map50,
        "map50_95": map50_95,
        "ap_by_iou": ap_by_iou,
        "best_f1": best_f1_row,
        "threshold_sweep": sweep_rows,
        "op_conf": op_conf,
        "confusion_analysis": {
            "by_subclass": subcls_summary,
            "fp_types": dict(fp_type_counts),
            "background_images": bg_image_count,
            "fp_on_background_images": bg_image_fp,
        },
        "distance_size_eval": size_summary,
        "group_eval": formatted_groups,
        "_per_image_matches": per_image_matches,
    }


def draw_annotated_image(
    sample: dict[str, Any],
    match_res: dict[str, Any],
    title_prefix: str = "",
) -> np.ndarray:
    """Render visualisasi error analysis: TP (hijau), GT matched (biru muda), FN (kuning), FP (merah)."""
    img = cv2.imread(str(sample["img_path"]))
    if img is None:
        return np.zeros((640, 640, 3), dtype=np.uint8)

    # Skala gambar kecil agar label terbaca jelas
    h, w = img.shape[:2]
    if max(h, w) < 640:
        s = 640.0 / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_LINEAR)
    else:
        s = 1.0

    def _pt(box: np.ndarray) -> tuple[int, int, int, int]:
        return (
            int(round(box[0] * s)),
            int(round(box[1] * s)),
            int(round(box[2] * s)),
            int(round(box[3] * s)),
        )

    # 1. Matched GT (cyan tipis)
    for r in match_res["tp"]:
        x1, y1, x2, y2 = _pt(r["gt"]["bbox"])
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 220, 0), 1)

    # 2. Missed GT / FN (kuning tebal)
    for r in match_res["fn"]:
        g = r["gt"]
        x1, y1, x2, y2 = _pt(g["bbox"])
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 220, 255), 2)
        tag = f"FN:{g['cls_name']}"
        cv2.putText(
            img, tag, (x1, max(14, y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 220, 255), 1, cv2.LINE_AA,
        )

    # 3. TP prediction (hijau)
    for r in match_res["tp"]:
        x1, y1, x2, y2 = _pt(r["pred"]["bbox"])
        cv2.rectangle(img, (x1, y1), (x2, y2), (50, 220, 50), 2)
        tag = f"TP {r['pred']['score']:.2f} ({r['iou']:.2f})"
        cv2.putText(
            img, tag, (x1, max(14, y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (50, 255, 50), 1, cv2.LINE_AA,
        )

    # 4. FP prediction (merah)
    short_fp = {
        "background_fp": "bg",
        "localization_error": "loc",
        "duplicate_detection": "dup",
    }
    for r in match_res["fp"]:
        x1, y1, x2, y2 = _pt(r["pred"]["bbox"])
        cv2.rectangle(img, (x1, y1), (x2, y2), (40, 40, 255), 2)
        tag = f"FP {r['pred']['score']:.2f} [{short_fp.get(r['fp_type'], 'fp')}]"
        cv2.putText(
            img, tag, (x1, min(img.shape[0] - 4, y2 + 13)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (70, 70, 255), 1, cv2.LINE_AA,
        )

    # HUD header bar
    hud_h = 34
    canvas = np.zeros((img.shape[0] + hud_h, img.shape[1], 3), dtype=np.uint8)
    canvas[:hud_h, :] = (24, 24, 28)
    canvas[hud_h:, :] = img

    tp_n, fp_n, fn_n = len(match_res["tp"]), len(match_res["fp"]), len(match_res["fn"])
    meta = sample["meta"]
    hud_text = (
        f"{title_prefix}{meta['camera_group']} | {meta['lighting']} | "
        f"TP:{tp_n} FP:{fp_n} FN:{fn_n}"
    )
    cv2.putText(
        canvas, hud_text[:95], (8, 22),
        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (235, 235, 235), 1, cv2.LINE_AA,
    )
    return canvas


def build_contact_sheet(images: list[np.ndarray], cols: int = 3, tile_w: int = 440) -> np.ndarray | None:
    if not images:
        return None
    tiles = []
    for im in images:
        h, w = im.shape[:2]
        tile_h = int(round(h * (tile_w / max(1, w))))
        tiles.append(cv2.resize(im, (tile_w, tile_h), interpolation=cv2.INTER_AREA))
    max_h = max(t.shape[0] for t in tiles)
    rows = math.ceil(len(tiles) / cols)
    sheet = np.full((rows * max_h, cols * tile_w, 3), 18, dtype=np.uint8)
    for idx, t in enumerate(tiles):
        r, c = divmod(idx, cols)
        sheet[r * max_h : r * max_h + t.shape[0], c * tile_w : c * tile_w + t.shape[1]] = t
    return sheet


def save_visualizations(
    out_dir: Path,
    samples: list[dict[str, Any]],
    results: list[dict[str, Any]],
    max_vis: int,
) -> None:
    vis_root = out_dir / "visuals"
    vis_root.mkdir(parents=True, exist_ok=True)

    for res in results:
        mname = res["model_name"]
        m_dir = vis_root / mname
        all_dir = m_dir / "all"
        fn_dir = m_dir / "worst_fn"
        fp_dir = m_dir / "worst_fp"
        for d in (all_dir, fn_dir, fp_dir):
            d.mkdir(parents=True, exist_ok=True)

        matches = res["_per_image_matches"]
        rendered_cache: dict[str, np.ndarray] = {}
        error_rank: list[tuple[int, int, int, str]] = []

        for s in samples:
            stem = s["stem"]
            m = matches[stem]
            vis_img = draw_annotated_image(s, m, title_prefix=f"[{mname}] ")
            out_file = all_dir / f"{stem}.jpg"
            cv2.imwrite(str(out_file), vis_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            rendered_cache[stem] = vis_img
            error_rank.append((len(m["fn"]), len(m["fp"]), len(m["fn"]) + len(m["fp"]), stem))

        # Top worst FN & worst FP
        worst_fn = [x for x in sorted(error_rank, key=lambda x: (x[0], x[2]), reverse=True) if x[0] > 0][:max_vis]
        worst_fp = [x for x in sorted(error_rank, key=lambda x: (x[1], x[2]), reverse=True) if x[1] > 0][:max_vis]
        worst_all = [x for x in sorted(error_rank, key=lambda x: x[2], reverse=True) if x[2] > 0][:max_vis]

        for rank_i, (_, _, _, stem) in enumerate(worst_fn, 1):
            cv2.imwrite(str(fn_dir / f"{rank_i:02d}_{stem}.jpg"), rendered_cache[stem])
        for rank_i, (_, _, _, stem) in enumerate(worst_fp, 1):
            cv2.imwrite(str(fp_dir / f"{rank_i:02d}_{stem}.jpg"), rendered_cache[stem])

        sheet = build_contact_sheet([rendered_cache[x[3]] for x in worst_all], cols=3)
        if sheet is not None:
            cv2.imwrite(str(m_dir / "contact_sheet_errors.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])

    # Side-by-side comparison bila >= 2 model
    if len(results) >= 2:
        comp_dir = vis_root / "comparison"
        comp_dir.mkdir(parents=True, exist_ok=True)
        # Pilih sampel yang paling banyak objek GT atau paling kontras antar model
        ranked_samples = sorted(samples, key=lambda s: len(s["gt"]), reverse=True)[:max_vis]
        for idx, s in enumerate(ranked_samples, 1):
            panels = []
            for res in results:
                m = res["_per_image_matches"][s["stem"]]
                panel = draw_annotated_image(s, m, title_prefix=f"[{res['model_name']}] ")
                panels.append(panel)
            target_h = max(p.shape[0] for p in panels)
            resized_panels = []
            for p in panels:
                if p.shape[0] != target_h:
                    new_w = int(round(p.shape[1] * target_h / p.shape[0]))
                    p = cv2.resize(p, (new_w, target_h), interpolation=cv2.INTER_AREA)
                resized_panels.append(p)
            combined = np.hstack(resized_panels)
            cv2.imwrite(
                str(comp_dir / f"{idx:02d}_{s['stem']}.jpg"),
                combined,
                [cv2.IMWRITE_JPEG_QUALITY, 90],
            )


def render_markdown_report(
    split: str,
    samples: list[dict[str, Any]],
    results: list[dict[str, Any]],
    iou_thresh: float,
    op_conf: float,
) -> str:
    total_gt = sum(len(s["gt"]) for s in samples)
    cams = len({s["meta"]["camera_group"] for s in samples})
    lines: list[str] = [
        f"# PATRA ONNX Evaluation Report (`{split}` split)",
        "",
        f"- **Dataset split**: `{split}` ({len(samples)} gambar, {cams} kamera unik, {total_gt} objek GT PKL)",
        f"- **Matching IoU**: `{iou_thresh:.2f}` | **Operating Conf (Phase 3/4)**: `{op_conf:.2f}`",
        "",
        "## 1. Ringkasan Perbandingan Model",
        "",
        "| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |",
        "|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|",
    ]

    for r in results:
        op_row = min(r["threshold_sweep"], key=lambda x: abs(x["conf"] - op_conf))
        bf = r["best_f1"]
        lines.append(
            f"| `{r['model_name']}` | {r['size_mb']:.2f} | {r['imgsz']} | **{r['map50']:.4f}** | "
            f"**{r['map50_95']:.4f}** | {bf['f1']:.4f} (@{bf['conf']:.2f}) | "
            f"{op_row['precision']:.4f} | {op_row['recall']:.4f} | {op_row['f1']:.4f} | "
            f"{r['latency']['infer_mean_ms']:.1f} | {r['latency']['infer_fps']:.1f} |"
        )

    for r in results:
        lines.extend(
            [
                "",
                f"---",
                f"## Model: `{r['model_name']}` (`{r['model_path']}`)",
                "",
                f"- Input: `{r['input_shape']}` | Output: `{r['output_shape']}` | Provider: `{r['providers']}`",
                f"- Inference Latency: mean `{r['latency']['infer_mean_ms']:.2f} ms` (p95 `{r['latency']['infer_p95_ms']:.2f} ms`, `{r['latency']['infer_fps']:.1f} FPS`) | E2E: `{r['latency']['e2e_mean_ms']:.2f} ms` (`{r['latency']['e2e_fps']:.1f} FPS`)",
                f"- **True mAP@50**: `{r['map50']:.4f}` | **True mAP@50-95**: `{r['map50_95']:.4f}`",
                "",
                "### Phase 2 — Confidence Threshold Sweep (IoU=0.50)",
                "",
                "| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |",
                "|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for row in r["threshold_sweep"]:
            lines.append(
                f"| {row['conf']:.2f} | {row['tp']} | {row['fp']} | {row['fn']} | "
                f"{row['precision']:.4f} | {row['recall']:.4f} | {row['f1']:.4f} | {row['avg_tp_iou']:.4f} |"
            )

        ca = r["confusion_analysis"]
        lines.extend(
            [
                "",
                f"### Phase 2/4 — Confusion Analysis (@conf={op_conf:.2f})",
                "",
                "| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |",
                "|---|---:|---:|---:|---:|---:|",
            ]
        )
        for cname, st in ca["by_subclass"].items():
            lines.append(
                f"| {cname} | {st['gt']} | {st['tp']} | {st['fn']} | {st['recall']:.4f} | {st['avg_iou']:.4f} |"
            )
        lines.extend(
            [
                "",
                f"- **False Positive Breakdown**: {json.dumps(ca['fp_types'])}",
                f"- **Background-only images (0 GT)**: {ca['background_images']} gambar -> `{ca['fp_on_background_images']}` FP",
                "",
                f"### Phase 3 — Visual Distance / Object Size Evaluation (@conf={op_conf:.2f})",
                "",
                "| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |",
                "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for sb, st in r["distance_size_eval"].items():
            if "precision" in st:
                lines.append(
                    f"| {sb} | {st['gt']} | {st['tp']} | {st['fp']} | {st['fn']} | "
                    f"{st['precision']:.4f} | {st['recall']:.4f} | {st['f1']:.4f} | {st['avg_iou']:.4f} |"
                )
            else:
                lines.append(
                    f"| {sb} | {st['gt']} | {st['tp']} | - | {st['fn']} | - | {st['recall']:.4f} | - | - |"
                )

        group_titles = [
            ("lighting", "Lighting Condition"),
            ("quality", "Image Quality / Sharpness"),
            ("camera_angle", "Camera Angle / Perspective"),
            ("resolution_bucket", "Image Resolution"),
            ("camera_group", "Per Camera Source (diurutkan Recall terendah)"),
        ]
        for gk, title in group_titles:
            lines.extend(
                [
                    "",
                    f"### Phase 3 — {title} (@conf={op_conf:.2f})",
                    "",
                    "| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |",
                    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
                ]
            )
            items = list(r["group_eval"][gk].items())
            if gk == "camera_group":
                items.sort(key=lambda kv: (kv[1]["recall"], -kv[1]["fn"]))
            for gval, st in items:
                lines.append(
                    f"| {gval} | {st['images']} | {st['gt']} | {st['tp']} | {st['fp']} | {st['fn']} | "
                    f"{st['precision']:.4f} | {st['recall']:.4f} | {st['f1']:.4f} |"
                )

    return "\n".join(lines) + "\n"


def apply_preset(args: argparse.Namespace) -> None:
    if not args.preset:
        return
    m = AI_ROOT / "model"
    if args.preset == "valid5":
        args.split = "valid"
        args.op_conf = 0.25
        args.run_name = "phase5_valid_selection"
        args.models = [
            f"patra_orig={m / 'best_patra_highangle.onnx'}",
            f"expA_640={m / 'ft_expA_640_lowlr.onnx'}",
            f"expB_640={m / 'ft_expB_640_freeze_loc.onnx'}",
            f"expD_640={m / 'ft_expD_640_ultralow.onnx'}",
        ]
    elif args.preset == "valid7_v2":
        args.split = "valid"
        args.op_conf = 0.25
        args.run_name = "phase7_v2_valid"
        args.models = [
            f"patra_orig={m / 'best_patra_highangle.onnx'}",
            f"patra_v2_ft={m / 'patra_v2_curated_ft.onnx'}",
            f"patra_v2_base={m / 'patra_v2_curated_base.onnx'}",
        ]
    elif args.preset == "test7_v2":
        args.split = "test"
        args.op_conf = 0.25
        args.save_visuals = True
        args.run_name = "phase7_v2_test"
        args.models = [
            f"patra_orig={m / 'best_patra_highangle.onnx'}",
            f"patra_v2_ft={m / 'patra_v2_curated_ft.onnx'}",
            f"patra_v2_base={m / 'patra_v2_curated_base.onnx'}",
        ]
    elif args.preset == "valid_v3":
        args.dataset_dir = AI_ROOT / "dataset_v3_gerobak"
        args.split = "valid"
        args.op_conf = 0.30
        args.run_name = "phase_v3_gerobak_valid"
        cands = [
            ("patra_orig", m / "best_patra_highangle.onnx"),
            ("patra_v2_ft", m / "patra_v2_curated_ft.onnx"),
            ("patra_v3_ft", m / "patra_v3_gerobak_ft.onnx"),
            ("patra_v3_base", m / "patra_v3_gerobak_base.onnx"),
        ]
        args.models = [f"{name}={p}" for name, p in cands if p.exists()]
    elif args.preset == "test_v3":
        args.dataset_dir = AI_ROOT / "dataset_v3_gerobak"
        args.split = "test"
        args.op_conf = 0.30
        args.save_visuals = True
        args.run_name = "phase_v3_gerobak_test"
        cands = [
            ("patra_orig", m / "best_patra_highangle.onnx"),
            ("patra_v2_ft", m / "patra_v2_curated_ft.onnx"),
            ("patra_v3_ft", m / "patra_v3_gerobak_ft.onnx"),
            ("patra_v3_base", m / "patra_v3_gerobak_base.onnx"),
        ]
        args.models = [f"{name}={p}" for name, p in cands if p.exists()]
    elif args.preset in ("test6_expA", "test6_expD", "test6_expB"):
        ft_map = {
            "test6_expA": ("patra_ft_expA", m / "ft_expA_640_lowlr.onnx"),
            "test6_expD": ("patra_ft_expD", m / "ft_expD_640_ultralow.onnx"),
            "test6_expB": ("patra_ft_expB", m / "ft_expB_640_freeze_loc.onnx"),
        }
        ft_name, ft_path = ft_map[args.preset]
        args.split = "test"
        args.save_visuals = True
        args.run_name = f"phase6_{args.preset}"
        args.models = [
            f"civision={m / 'best_civision.onnx'}",
            f"patra_orig={m / 'best_patra_highangle.onnx'}",
            f"{ft_name}={ft_path}",
        ]


def main() -> int:
    args = parse_args()
    apply_preset(args)
    if not args.models:
        raise ValueError("Berikan --models atau --preset.")
    thresholds = [float(x.strip()) for x in args.thresholds.split(",") if x.strip()]
    model_specs = parse_model_specs(args.models)

    print(f"[1/4] Memuat dataset `{args.split}` dari {args.dataset_dir}...")
    samples = load_split_dataset(args.dataset_dir, args.split)
    total_gt = sum(len(s["gt"]) for s in samples)
    print(f"      -> {len(samples)} gambar, {total_gt} objek GT terverifikasi.")

    results: list[dict[str, Any]] = []
    for idx, (mname, mpath) in enumerate(model_specs, 1):
        print(f"[2/4] Evaluasi model ({idx}/{len(model_specs)}): {mname} -> {mpath}")
        res = evaluate_model(
            model_name=mname,
            model_path=mpath,
            samples=samples,
            thresholds=thresholds,
            iou_thresh=args.iou,
            iou_nms=args.iou_nms,
            op_conf=args.op_conf,
            imgsz_override=args.imgsz,
            provider=args.provider,
        )
        results.append(res)
        bf = res["best_f1"]
        print(
            f"      -> mAP@50={res['map50']:.4f} | mAP@50-95={res['map50_95']:.4f} | "
            f"Best F1={bf['f1']:.4f} (@{bf['conf']:.2f}) | "
            f"Latency={res['latency']['infer_mean_ms']:.1f}ms ({res['latency']['infer_fps']:.1f} FPS)"
        )

    out_dir = DEFAULT_OUT_ROOT / args.run_name
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.save_visuals:
        print(f"[3/4] Menyimpan visualisasi error analysis ke {out_dir / 'visuals'}...")
        save_visualizations(out_dir, samples, results, max_vis=args.max_vis)
    else:
        print("[3/4] Visualisasi dilewati (gunakan `--save-visuals` untuk menyimpan gambar).")

    # Simpan JSON (buang field internal `_per_image_matches` yg berisi numpy array)
    serializable = []
    for r in results:
        clean = {k: v for k, v in r.items() if not k.startswith("_")}
        serializable.append(clean)

    json_path = out_dir / "report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "split": args.split,
                "num_images": len(samples),
                "num_gt": total_gt,
                "iou_thresh": args.iou,
                "op_conf": args.op_conf,
                "models": serializable,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    md_text = render_markdown_report(args.split, samples, results, args.iou, args.op_conf)
    md_path = out_dir / "report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)

    print(f"[4/4] Laporan tersimpan:\n      - {md_path}\n      - {json_path}")
    print("\n================ RINGKASAN CEPAT ================")
    for r in results:
        print(f"\nModel: {r['model_name']} | mAP50={r['map50']:.4f} | mAP50-95={r['map50_95']:.4f} | {r['latency']['infer_mean_ms']:.1f} ms")
        print("Conf |  TP |  FP |  FN |   Prec |    Rec |     F1")
        for row in r["threshold_sweep"]:
            print(
                f"{row['conf']:4.2f} | {row['tp']:3d} | {row['fp']:3d} | {row['fn']:3d} | "
                f"{row['precision']:6.4f} | {row['recall']:6.4f} | {row['f1']:6.4f}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
