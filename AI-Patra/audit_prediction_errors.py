"""
PETRA / PATRA — Forensic Prediction Error Audit Script.

Menginvestigasi seluruh kesalahan prediksi `AI-Patra/model/best_patra_highangle.onnx`
pada dataset `test` (plus audit kualitas anotasi & distribusi kelas pada `train/valid/test`)
tanpa melakukan training ulang atau mengubah model.

Output terstruktur disimpan di `AI-Patra/evaluation_results/error_audit/`:
- `audit_data.json`      : Data kuantitatif lengkap per gambar, per FP, per FN, pre-NMS, & audit anotasi
- `auto_summary.md`      : Ringkasan angka mentah untuk inspeksi forensik
- `full_images/`         : Seluruh gambar test dengan overlay GT, TP, FP, FN, dan Low-Conf (0.10..0.25)
- `fp_gallery.jpg`       : Galeri bernomor seluruh False Positive (dengan konteks 2.2x) untuk verifikasi visual
- `fn_gallery_part*.jpg` : Galeri bernomor seluruh False Negative beserta max_conf & diagnosis penyebab
- `low_conf_gallery.jpg` : Galeri deteksi low-confidence (0.10..0.25): recoverable TP vs noise FP
- `gt_overlap_gallery.jpg`: Galeri kotak GT yang saling tumpang tindih (potensi konflik NMS / anotasi)

Penggunaan:
  python AI-Patra/audit_prediction_errors.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from evaluate_models import (  # noqa: E402
    decode_onnx_with_scores,
    detect_onnx_input_size,
    load_split_dataset,
)
from prepare_dataset import (  # noqa: E402
    CLASS_NAMES,
    DATASET_DIR,
    IMG_EXTS,
    SPLITS,
    convert_line_to_yolo_bbox,
    extract_camera_group,
)
from verify_onnx import box_iou, letterbox  # noqa: E402

DEFAULT_MODEL = AI_ROOT / "model" / "best_patra_highangle.onnx"
DEFAULT_OUT_DIR = AI_ROOT / "evaluation_results" / "error_audit"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Forensic Prediction Error Audit for PATRA ONNX")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="Path model ONNX yang diaudit")
    parser.add_argument("--split", type=str, choices=("train", "valid", "test"), default="test")
    parser.add_argument("--conf", type=float, default=0.25, help="Operating confidence threshold (default: 0.25)")
    parser.add_argument("--low-conf-min", type=float, default=0.10, help="Batas bawah low-confidence probe")
    parser.add_argument("--iou", type=float, default=0.50, help="IoU threshold matching (default: 0.50)")
    parser.add_argument("--iou-nms", type=float, default=0.45, help="IoU threshold NMS (default: 0.45)")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="Folder output audit")
    return parser.parse_args()


def size_bucket_4(area_ratio: float) -> str:
    if area_ratio < 0.0025:
        return "Tiny (<0.25%)"
    if area_ratio < 0.01:
        return "Far (0.25-1%)"
    if area_ratio < 0.04:
        return "Medium (1-4%)"
    return "Near (>=4%)"


def is_edge_box(bbox: np.ndarray, w: int, h: int, margin_ratio: float = 0.015) -> bool:
    mx = w * margin_ratio
    my = h * margin_ratio
    return bool(
        bbox[0] <= mx or bbox[1] <= my or bbox[2] >= (w - mx) or bbox[3] >= (h - my)
    )


def crop_brightness_v(img_bgr: np.ndarray, bbox: np.ndarray) -> float:
    h, w = img_bgr.shape[:2]
    x1 = max(0, int(math.floor(bbox[0])))
    y1 = max(0, int(math.floor(bbox[1])))
    x2 = min(w, int(math.ceil(bbox[2])))
    y2 = min(h, int(math.ceil(bbox[3])))
    if x2 <= x1 or y2 <= y1:
        return 0.0
    crop = img_bgr[y1:y2, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    return float(np.mean(hsv[:, :, 2]))


def extract_pre_nms_candidates(
    raw_out: np.ndarray,
    orig_w: int,
    orig_h: int,
    scale: float,
    pad_left: int,
    pad_top: int,
    conf_min: float = 0.05,
) -> list[dict[str, Any]]:
    """Ambil kandidat mentah SEBELUM NMS untuk mendeteksi objek yang terhapus oleh NMS."""
    arr = np.squeeze(raw_out, axis=0)
    if arr.ndim == 2 and arr.shape[1] == 6:
        mask = arr[:, 4] >= conf_min
        out = []
        for row in arr[mask]:
            b = np.array(
                [
                    max(0.0, min(float(orig_w), (float(row[0]) - pad_left) / scale)),
                    max(0.0, min(float(orig_h), (float(row[1]) - pad_top) / scale)),
                    max(0.0, min(float(orig_w), (float(row[2]) - pad_left) / scale)),
                    max(0.0, min(float(orig_h), (float(row[3]) - pad_top) / scale)),
                ],
                dtype=np.float32,
            )
            out.append({"bbox": b, "score": float(row[4])})
        return out

    if arr.ndim == 2 and arr.shape[0] < arr.shape[1]:
        arr = arr.T
    scores = np.max(arr[:, 4:], axis=1)
    mask = scores >= conf_min
    out = []
    for row, sc in zip(arr[mask], scores[mask]):
        cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
        b = np.array(
            [
                max(0.0, min(float(orig_w), (cx - bw / 2.0 - pad_left) / scale)),
                max(0.0, min(float(orig_h), (cy - bh / 2.0 - pad_top) / scale)),
                max(0.0, min(float(orig_w), (cx + bw / 2.0 - pad_left) / scale)),
                max(0.0, min(float(orig_h), (cy + bh / 2.0 - pad_top) / scale)),
            ],
            dtype=np.float32,
        )
        out.append({"bbox": b, "score": float(sc)})
    return out


def audit_dataset_annotations(dataset_dir: Path) -> dict[str, Any]:
    """Audit distribusi kelas, ukuran objek, konflik overlap GT-ke-GT, dan box tepi di seluruh split."""
    summary: dict[str, Any] = {"splits": {}, "test_gt_overlaps": []}

    for split in SPLITS:
        img_dir = dataset_dir / split / "images"
        lbl_dir = dataset_dir / split / "labels"
        if not img_dir.exists():
            continue

        class_counts = Counter()
        size_by_class: dict[str, list[float]] = defaultdict(list)
        aspect_outliers = 0
        edge_count = 0
        overlap_30 = 0
        overlap_45 = 0
        cross_class_overlap = Counter()
        total_boxes = 0
        bg_images = 0
        img_count = 0

        for img_path in sorted(p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS):
            img_count += 1
            lbl_path = lbl_dir / f"{img_path.stem}.txt"
            boxes_norm: list[tuple[int, np.ndarray, float]] = []
            if lbl_path.exists():
                with open(lbl_path, "r", encoding="utf-8") as f:
                    for ln in f:
                        parsed = convert_line_to_yolo_bbox(ln)
                        if parsed is None:
                            continue
                        cid, cx, cy, bw, bh = parsed
                        cname = CLASS_NAMES.get(cid, f"cls_{cid}")
                        area = bw * bh
                        class_counts[cname] += 1
                        size_by_class[cname].append(area)
                        total_boxes += 1
                        x1, y1, x2, y2 = cx - bw / 2.0, cy - bh / 2.0, cx + bw / 2.0, cy + bh / 2.0
                        if x1 <= 0.015 or y1 <= 0.015 or x2 >= 0.985 or y2 >= 0.985:
                            edge_count += 1
                        ar = max(bw, bh) / max(1e-6, min(bw, bh))
                        if ar > 5.0:
                            aspect_outliers += 1
                        boxes_norm.append((cid, np.array([x1, y1, x2, y2], dtype=np.float32), area))
            if not boxes_norm:
                bg_images += 1

            for i in range(len(boxes_norm)):
                for j in range(i + 1, len(boxes_norm)):
                    iou = box_iou(boxes_norm[i][1], boxes_norm[j][1])
                    if iou >= 0.30:
                        overlap_30 += 1
                        pair = tuple(sorted([
                            CLASS_NAMES.get(boxes_norm[i][0], str(boxes_norm[i][0])),
                            CLASS_NAMES.get(boxes_norm[j][0], str(boxes_norm[j][0])),
                        ]))
                        cross_class_overlap[f"{pair[0]} <-> {pair[1]}"] += 1
                        if split == "test":
                            summary["test_gt_overlaps"].append(
                                {
                                    "stem": img_path.stem,
                                    "camera": extract_camera_group(img_path.stem),
                                    "pair": f"{pair[0]} <-> {pair[1]}",
                                    "iou": round(iou, 3),
                                    "box_a": [round(float(v), 4) for v in boxes_norm[i][1]],
                                    "box_b": [round(float(v), 4) for v in boxes_norm[j][1]],
                                }
                            )
                    if iou >= 0.45:
                        overlap_45 += 1

        size_stats = {}
        for cname, areas in sorted(size_by_class.items()):
            arr_a = np.array(areas, dtype=np.float64)
            size_stats[cname] = {
                "count": len(areas),
                "pct_of_split": round(100.0 * len(areas) / max(1, total_boxes), 1),
                "median_area_pct": round(float(np.median(arr_a)) * 100.0, 3),
                "mean_area_pct": round(float(np.mean(arr_a)) * 100.0, 3),
                "pct_tiny": round(100.0 * float(np.mean(arr_a < 0.0025)), 1),
                "pct_far": round(100.0 * float(np.mean(arr_a < 0.01)), 1),
            }

        summary["splits"][split] = {
            "images": img_count,
            "background_images": bg_images,
            "total_boxes": total_boxes,
            "edge_boxes": edge_count,
            "aspect_outliers_gt5": aspect_outliers,
            "gt_overlap_pairs_iou30": overlap_30,
            "gt_overlap_pairs_iou45_nms_conflict": overlap_45,
            "cross_class_overlap_iou30": dict(cross_class_overlap.most_common()),
            "by_class": size_stats,
        }

    return summary


def make_context_crop(
    img_bgr: np.ndarray,
    box: np.ndarray,
    box_color: tuple[int, int, int],
    header_lines: list[str],
    extra_box: np.ndarray | None = None,
    extra_color: tuple[int, int, int] = (255, 220, 0),
    tile_size: int = 280,
) -> np.ndarray:
    """Buat crop dengan konteks 2.4x di sekitar bbox agar lingkungan (mobil/motor/trotoar) terlihat jelas."""
    h, w = img_bgr.shape[:2]
    bw = max(12.0, float(box[2] - box[0]))
    bh = max(12.0, float(box[3] - box[1]))
    cx = float(box[0] + box[2]) / 2.0
    cy = float(box[1] + box[3]) / 2.0

    # Minimal jendela konteks 110px agar objek kecil tetap terlihat lingkungannya
    side = max(110.0, max(bw, bh) * 2.5)
    x1 = int(max(0, round(cx - side / 2.0)))
    y1 = int(max(0, round(cy - side / 2.0)))
    x2 = int(min(w, round(cx + side / 2.0)))
    y2 = int(min(h, round(cy + side / 2.0)))

    crop = img_bgr[y1:y2, x1:x2].copy()
    ch, cw = crop.shape[:2]
    if ch <= 0 or cw <= 0:
        crop = np.zeros((tile_size, tile_size, 3), dtype=np.uint8)
        sx = sy = 1.0
    else:
        scale = tile_size / float(max(ch, cw))
        nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
        crop = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_LINEAR)
        sx, sy = nw / float(cw), nh / float(ch)

    # Pad ke kotak persegi tile_size x tile_size
    padded = np.full((tile_size, tile_size, 3), 24, dtype=np.uint8)
    ox = (tile_size - crop.shape[1]) // 2
    oy = (tile_size - crop.shape[0]) // 2
    padded[oy : oy + crop.shape[0], ox : ox + crop.shape[1]] = crop

    def _draw(b: np.ndarray, col: tuple[int, int, int], thick: int) -> None:
        rx1 = int(round((b[0] - x1) * sx)) + ox
        ry1 = int(round((b[1] - y1) * sy)) + oy
        rx2 = int(round((b[2] - x1) * sx)) + ox
        ry2 = int(round((b[3] - y1) * sy)) + oy
        cv2.rectangle(padded, (rx1, ry1), (rx2, ry2), col, thick)

    if extra_box is not None:
        _draw(extra_box, extra_color, 1)
    _draw(box, box_color, 2)

    bar_h = 18 * len(header_lines) + 8
    out = np.full((tile_size + bar_h, tile_size, 3), 20, dtype=np.uint8)
    out[bar_h:, :] = padded
    for idx, txt in enumerate(header_lines):
        cv2.putText(
            out,
            txt[:42],
            (6, 15 + idx * 17),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.40,
            (235, 235, 235),
            1,
            cv2.LINE_AA,
        )
    return out


def make_grid(tiles: list[np.ndarray], cols: int = 5) -> np.ndarray | None:
    if not tiles:
        return None
    th = max(t.shape[0] for t in tiles)
    tw = max(t.shape[1] for t in tiles)
    rows = math.ceil(len(tiles) / cols)
    grid = np.full((rows * th, cols * tw, 3), 12, dtype=np.uint8)
    for idx, t in enumerate(tiles):
        r, c = divmod(idx, cols)
        grid[r * th : r * th + t.shape[0], c * tw : c * tw + t.shape[1]] = t
    return grid


def draw_full_audit_image(
    img_bgr: np.ndarray,
    sample: dict[str, Any],
    tps: list[dict[str, Any]],
    fps: list[dict[str, Any]],
    fns: list[dict[str, Any]],
    low_confs: list[dict[str, Any]],
) -> np.ndarray:
    img = img_bgr.copy()
    # 1. Low-conf detections (magenta tipis)
    for lc in low_confs:
        x1, y1, x2, y2 = [int(round(v)) for v in lc["bbox"]]
        cv2.rectangle(img, (x1, y1), (x2, y2), (220, 80, 220), 1)
        cv2.putText(
            img,
            f"LC {lc['score']:.2f}",
            (x1, min(img.shape[0] - 4, y2 + 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.36,
            (240, 120, 240),
            1,
            cv2.LINE_AA,
        )

    # 2. Matched GT (cyan tipis)
    for r in tps:
        x1, y1, x2, y2 = [int(round(v)) for v in r["gt_bbox"]]
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 220, 0), 1)

    # 3. Missed GT / FN (kuning)
    for r in fns:
        x1, y1, x2, y2 = [int(round(v)) for v in r["gt_bbox"]]
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 220, 255), 2)
        cv2.putText(
            img,
            f"FN#{r['fn_id']} {r['cls_name']} m={r['max_conf_iou50']:.2f}",
            (x1, max(13, y1 - 3)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (0, 225, 255),
            1,
            cv2.LINE_AA,
        )

    # 4. TP (hijau)
    for r in tps:
        x1, y1, x2, y2 = [int(round(v)) for v in r["pred_bbox"]]
        cv2.rectangle(img, (x1, y1), (x2, y2), (50, 230, 50), 2)
        cv2.putText(
            img,
            f"TP {r['score']:.2f} ({r['iou']:.2f})",
            (x1, max(13, y1 - 3)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (70, 255, 70),
            1,
            cv2.LINE_AA,
        )

    # 5. FP (merah)
    for r in fps:
        x1, y1, x2, y2 = [int(round(v)) for v in r["pred_bbox"]]
        cv2.rectangle(img, (x1, y1), (x2, y2), (40, 40, 255), 2)
        cv2.putText(
            img,
            f"FP#{r['fp_id']} {r['score']:.2f} [{r['fp_type']}]",
            (x1, min(img.shape[0] - 4, y2 + 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (80, 80, 255),
            1,
            cv2.LINE_AA,
        )

    hud_h = 34
    out = np.full((img.shape[0] + hud_h, img.shape[1], 3), 24, dtype=np.uint8)
    out[hud_h:, :] = img
    hud = (
        f"{sample['meta']['camera_group']} | {sample['meta']['lighting']} | "
        f"TP:{len(tps)} FP:{len(fps)} FN:{len(fns)} LC:{len(low_confs)}"
    )
    cv2.putText(out, hud[:96], (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (235, 235, 235), 1, cv2.LINE_AA)
    return out


def main() -> int:
    args = parse_args()
    if not args.model.exists():
        raise FileNotFoundError(f"Model ONNX tidak ditemukan: {args.model}")

    out_dir: Path = args.out_dir
    full_dir = out_dir / "full_images"
    fp_crop_dir = out_dir / "fp_crops"
    fn_crop_dir = out_dir / "fn_crops"
    for d in (out_dir, full_dir, fp_crop_dir, fn_crop_dir):
        d.mkdir(parents=True, exist_ok=True)

    print(f"[1/5] Audit anotasi & distribusi kelas di seluruh split ({DATASET_DIR})...")
    annotation_audit = audit_dataset_annotations(DATASET_DIR)

    print(f"[2/5] Memuat split `{args.split}` & sesi ONNX `{args.model}`...")
    samples = load_split_dataset(DATASET_DIR, args.split)
    sess = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    imgsz = detect_onnx_input_size(sess, 0)
    out_shape = sess.get_outputs()[0].shape

    all_tps: list[dict[str, Any]] = []
    all_fps: list[dict[str, Any]] = []
    all_fns: list[dict[str, Any]] = []
    all_low_confs: list[dict[str, Any]] = []
    fp_tiles: list[np.ndarray] = []
    fn_tiles: list[np.ndarray] = []
    lc_tiles: list[np.ndarray] = []
    gt_ov_tiles: list[np.ndarray] = []

    fp_counter = 0
    fn_counter = 0
    per_image_summary: list[dict[str, Any]] = []

    print(f"[3/5] Menjalankan audit prediksi forensik pada {len(samples)} gambar `{args.split}`...")
    for sample in samples:
        img_bgr = cv2.imread(str(sample["img_path"]))
        orig_h, orig_w = img_bgr.shape[:2]

        padded, scale, pad_left, pad_top = letterbox(img_bgr, imgsz)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...])
        raw_out = sess.run(None, {inp.name: blob})[0]

        # 1) Kandidat post-NMS sampai conf=0.01 (untuk diagnosis FN & low-conf)
        post_nms_all = decode_onnx_with_scores(
            raw_out, orig_w, orig_h, scale, pad_left, pad_top,
            conf_thresh=0.01, iou_nms=args.iou_nms, max_det=300,
        )
        # 2) Kandidat pre-NMS sampai conf=0.10 (untuk mendeteksi NMS suppression)
        pre_nms_all = extract_pre_nms_candidates(
            raw_out, orig_w, orig_h, scale, pad_left, pad_top, conf_min=0.10,
        )

        op_preds = [p for p in post_nms_all if p["score"] >= args.conf]
        low_preds = [p for p in post_nms_all if args.low_conf_min <= p["score"] < args.conf]
        gt_list = sample["gt"]

        # Cek GT-ke-GT overlap pada gambar ini
        gt_max_peer_iou = [0.0] * len(gt_list)
        for i in range(len(gt_list)):
            for j in range(i + 1, len(gt_list)):
                ov = box_iou(gt_list[i]["bbox"], gt_list[j]["bbox"])
                if ov > gt_max_peer_iou[i]:
                    gt_max_peer_iou[i] = ov
                if ov > gt_max_peer_iou[j]:
                    gt_max_peer_iou[j] = ov
                if ov >= 0.30:
                    tile = make_context_crop(
                        img_bgr,
                        gt_list[i]["bbox"],
                        (0, 220, 255),
                        [
                            f"GT Overlap IoU={ov:.2f} | {sample['meta']['camera_group'][:18]}",
                            f"{gt_list[i]['cls_name']} <-> {gt_list[j]['cls_name']}",
                        ],
                        extra_box=gt_list[j]["bbox"],
                        extra_color=(255, 80, 255),
                    )
                    gt_ov_tiles.append(tile)

        # Matching greedy 1-to-1 pada operating threshold
        op_preds_sorted = sorted(op_preds, key=lambda d: d["score"], reverse=True)
        gt_matched = [False] * len(gt_list)
        img_tps: list[dict[str, Any]] = []
        img_fps: list[dict[str, Any]] = []

        for pred in op_preds_sorted:
            best_unmatched_iou = 0.0
            best_unmatched_idx = -1
            best_any_iou = 0.0
            best_any_idx = -1

            for gi, gt in enumerate(gt_list):
                iou = box_iou(pred["bbox"], gt["bbox"])
                if iou > best_any_iou:
                    best_any_iou = iou
                    best_any_idx = gi
                if not gt_matched[gi] and iou > best_unmatched_iou:
                    best_unmatched_iou = iou
                    best_unmatched_idx = gi

            if best_unmatched_idx >= 0 and best_unmatched_iou >= args.iou:
                gt_matched[best_unmatched_idx] = True
                gt_obj = gt_list[best_unmatched_idx]
                rec = {
                    "stem": sample["stem"],
                    "camera": sample["meta"]["camera_group"],
                    "score": round(pred["score"], 4),
                    "iou": round(best_unmatched_iou, 4),
                    "cls_name": gt_obj["cls_name"],
                    "size_bucket": size_bucket_4(gt_obj["area_ratio"]),
                    "pred_bbox": [round(float(v), 1) for v in pred["bbox"]],
                    "gt_bbox": [round(float(v), 1) for v in gt_obj["bbox"]],
                }
                img_tps.append(rec)
                all_tps.append(rec)
            else:
                fp_counter += 1
                if best_any_iou >= args.iou:
                    fp_type = "duplicate"
                elif best_any_iou >= 0.10:
                    fp_type = "incorrect_bbox"
                else:
                    fp_type = "background"

                area_ratio_vs_gt = None
                near_gt_cls = None
                near_gt_box = None
                if best_any_idx >= 0 and best_any_iou >= 0.10:
                    gt_obj = gt_list[best_any_idx]
                    near_gt_cls = gt_obj["cls_name"]
                    near_gt_box = gt_obj["bbox"]
                    area_ratio_vs_gt = round(
                        pred["area_ratio"] / max(1e-6, gt_obj["area_ratio"]), 2
                    )

                rec = {
                    "fp_id": fp_counter,
                    "stem": sample["stem"],
                    "filename": sample["filename"],
                    "camera": sample["meta"]["camera_group"],
                    "lighting": sample["meta"]["lighting"],
                    "score": round(pred["score"], 4),
                    "fp_type": fp_type,
                    "max_gt_iou": round(best_any_iou, 4),
                    "near_gt_cls": near_gt_cls,
                    "pred_to_gt_area_ratio": area_ratio_vs_gt,
                    "pred_area_pct": round(pred["area_ratio"] * 100.0, 3),
                    "size_bucket": size_bucket_4(pred["area_ratio"]),
                    "edge": is_edge_box(pred["bbox"], orig_w, orig_h),
                    "pred_bbox": [round(float(v), 1) for v in pred["bbox"]],
                }
                img_fps.append(rec)
                all_fps.append(rec)

                short_cam = sample["meta"]["camera_group"].split("_")[-2] if "_" in sample["meta"]["camera_group"] else sample["meta"]["camera_group"]
                crop_tile = make_context_crop(
                    img_bgr,
                    pred["bbox"],
                    (40, 40, 255),
                    [
                        f"FP#{fp_counter:02d} [{fp_type}] c={pred['score']:.2f} iou={best_any_iou:.2f}",
                        f"{short_cam[:24]} ({size_bucket_4(pred['area_ratio']).split()[0]})",
                    ],
                    extra_box=near_gt_box,
                    extra_color=(0, 220, 255),
                )
                cv2.imwrite(str(fp_crop_dir / f"FP_{fp_counter:02d}_{fp_type}_{sample['stem'][:30]}.jpg"), crop_tile)
                fp_tiles.append(crop_tile)

        # Audit setiap False Negative (FN)
        img_fns: list[dict[str, Any]] = []
        for gi, gt in enumerate(gt_list):
            if gt_matched[gi]:
                continue
            fn_counter += 1

            # Cari skor prediksi post-NMS terbaik untuk GT ini (IoU >= 0.50 & IoU >= 0.10)
            max_conf_50 = 0.0
            max_conf_10 = 0.0
            best_iou_any = 0.0
            for p in post_nms_all:
                ov = box_iou(p["bbox"], gt["bbox"])
                if ov > best_iou_any:
                    best_iou_any = ov
                if ov >= args.iou and p["score"] > max_conf_50:
                    max_conf_50 = p["score"]
                if ov >= 0.10 and p["score"] > max_conf_10:
                    max_conf_10 = p["score"]

            # Cek apakah pre-NMS anchor mendeteksi dengan conf >= 0.25 & IoU >= 0.50 lalu terhapus NMS
            pre_nms_max_50 = max(
                (p["score"] for p in pre_nms_all if box_iou(p["bbox"], gt["bbox"]) >= args.iou),
                default=0.0,
            )

            # Tentukan root cause mekanistik
            if pre_nms_max_50 >= args.conf and max_conf_50 < args.conf:
                cause = "nms_suppressed"
            elif max_conf_10 >= args.conf and max_conf_50 < args.conf:
                cause = "localization_miss"
            elif 0.05 <= max_conf_50 < args.conf:
                cause = "threshold_recoverable"
            else:
                cause = "true_model_miss"

            crop_v = crop_brightness_v(img_bgr, gt["bbox"])
            edge_flag = is_edge_box(gt["bbox"], orig_w, orig_h)
            low_light_flag = (crop_v < 75.0) or (sample["meta"]["lighting"] == "Night / Low-Light")
            occl_gt_overlap = gt_max_peer_iou[gi] >= 0.15

            rec = {
                "fn_id": fn_counter,
                "stem": sample["stem"],
                "filename": sample["filename"],
                "camera": sample["meta"]["camera_group"],
                "cls_name": gt["cls_name"],
                "area_pct": round(gt["area_ratio"] * 100.0, 3),
                "size_bucket": size_bucket_4(gt["area_ratio"]),
                "crop_brightness_v": round(crop_v, 1),
                "image_lighting": sample["meta"]["lighting"],
                "is_low_light": low_light_flag,
                "is_edge": edge_flag,
                "is_gt_overlap": occl_gt_overlap,
                "max_peer_gt_iou": round(gt_max_peer_iou[gi], 3),
                "max_conf_iou50": round(max_conf_50, 4),
                "max_conf_iou10": round(max_conf_10, 4),
                "pre_nms_max_conf_iou50": round(pre_nms_max_50, 4),
                "cause": cause,
                "gt_bbox": [round(float(v), 1) for v in gt["bbox"]],
            }
            img_fns.append(rec)
            all_fns.append(rec)

            short_cam = sample["meta"]["camera_group"].split("_")[-2] if "_" in sample["meta"]["camera_group"] else sample["meta"]["camera_group"]
            flags = []
            if edge_flag:
                flags.append("EDGE")
            if low_light_flag:
                flags.append("DARK")
            if occl_gt_overlap:
                flags.append("OVLP")
            flag_str = ",".join(flags) if flags else "-"
            fn_tile = make_context_crop(
                img_bgr,
                gt["bbox"],
                (0, 220, 255),
                [
                    f"FN#{fn_counter:02d} {gt['cls_name']} ({size_bucket_4(gt['area_ratio']).split()[0]}) [{flag_str}]",
                    f"{cause[:16]} c50={max_conf_50:.2f} | {short_cam[:14]}",
                ],
            )
            cv2.imwrite(str(fn_crop_dir / f"FN_{fn_counter:02d}_{gt['cls_name']}_{cause}.jpg"), fn_tile)
            fn_tiles.append(fn_tile)

        # Audit low-confidence detections (0.10 <= conf < 0.25)
        img_lows: list[dict[str, Any]] = []
        gt_matched_lc = list(gt_matched)
        for p in sorted(low_preds, key=lambda d: d["score"], reverse=True):
            best_unm_iou = 0.0
            best_unm_idx = -1
            for gi, gt in enumerate(gt_list):
                if gt_matched_lc[gi]:
                    continue
                ov = box_iou(p["bbox"], gt["bbox"])
                if ov > best_unm_iou:
                    best_unm_iou = ov
                    best_unm_idx = gi
            if best_unm_idx >= 0 and best_unm_iou >= args.iou:
                gt_matched_lc[best_unm_idx] = True
                lc_type = "recoverable_tp"
                matched_cls = gt_list[best_unm_idx]["cls_name"]
            else:
                lc_type = "low_conf_fp"
                matched_cls = None
            lc_rec = {
                "stem": sample["stem"],
                "camera": sample["meta"]["camera_group"],
                "score": round(p["score"], 4),
                "lc_type": lc_type,
                "matched_cls": matched_cls,
                "best_iou": round(best_unm_iou, 3),
                "bbox": [round(float(v), 1) for v in p["bbox"]],
            }
            img_lows.append(lc_rec)
            all_low_confs.append(lc_rec)

            if len(lc_tiles) < 30:
                col = (50, 230, 50) if lc_type == "recoverable_tp" else (220, 80, 220)
                lc_cam = sample["meta"]["camera_group"]
                lc_short = lc_cam.split("_")[-2] if "_" in lc_cam else lc_cam
                lc_tiles.append(
                    make_context_crop(
                        img_bgr,
                        p["bbox"],
                        col,
                        [
                            f"{lc_type} c={p['score']:.2f} iou={best_unm_iou:.2f}",
                            f"{matched_cls or 'bg'} | {lc_short[:18]}",
                        ],
                    )
                )

        # Simpan visualisasi gambar penuh
        vis_full = draw_full_audit_image(img_bgr, sample, img_tps, img_fps, img_fns, img_lows)
        cv2.imwrite(str(full_dir / f"{sample['stem']}.jpg"), vis_full, [cv2.IMWRITE_JPEG_QUALITY, 90])

        per_image_summary.append(
            {
                "stem": sample["stem"],
                "camera": sample["meta"]["camera_group"],
                "gt": len(gt_list),
                "tp": len(img_tps),
                "fp": len(img_fps),
                "fn": len(img_fns),
                "low_conf_total": len(img_lows),
                "low_conf_recoverable_tp": sum(1 for x in img_lows if x["lc_type"] == "recoverable_tp"),
            }
        )

    print("[4/5] Menyusun galeri visual (FP, FN, Low-Conf, GT-Overlap)...")
    fp_grid = make_grid(fp_tiles, cols=5)
    if fp_grid is not None:
        cv2.imwrite(str(out_dir / "fp_gallery.jpg"), fp_grid, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # Bagi FN gallery menjadi maksimal 35 tile per gambar agar tetap tajam saat dibaca
    chunk_size = 35
    for idx in range(0, len(fn_tiles), chunk_size):
        part = make_grid(fn_tiles[idx : idx + chunk_size], cols=5)
        if part is not None:
            cv2.imwrite(
                str(out_dir / f"fn_gallery_part{idx // chunk_size + 1}.jpg"),
                part,
                [cv2.IMWRITE_JPEG_QUALITY, 90],
            )

    lc_grid = make_grid(lc_tiles, cols=5)
    if lc_grid is not None:
        cv2.imwrite(str(out_dir / "low_conf_gallery.jpg"), lc_grid, [cv2.IMWRITE_JPEG_QUALITY, 90])

    ov_grid = make_grid(gt_ov_tiles[:25], cols=5)
    if ov_grid is not None:
        cv2.imwrite(str(out_dir / "gt_overlap_gallery.jpg"), ov_grid, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # Ringkasan agregat
    fp_type_counts = Counter(x["fp_type"] for x in all_fps)
    fn_cause_counts = Counter(x["cause"] for x in all_fns)
    fn_size_counts = Counter(x["size_bucket"] for x in all_fns)
    fn_cls_counts = Counter(x["cls_name"] for x in all_fns)
    lc_counts = Counter(x["lc_type"] for x in all_low_confs)

    fn_factors = {
        "Near (>=4%)": sum(1 for x in all_fns if x["size_bucket"] == "Near (>=4%)"),
        "Medium (1-4%)": sum(1 for x in all_fns if x["size_bucket"] == "Medium (1-4%)"),
        "Far (0.25-1%)": sum(1 for x in all_fns if x["size_bucket"] == "Far (0.25-1%)"),
        "Tiny (<0.25%)": sum(1 for x in all_fns if x["size_bucket"] == "Tiny (<0.25%)"),
        "Low-light (crop V<75 or Night)": sum(1 for x in all_fns if x["is_low_light"]),
        "Edge-of-frame": sum(1 for x in all_fns if x["is_edge"]),
        "GT-to-GT Overlap (IoU>=0.15)": sum(1 for x in all_fns if x["is_gt_overlap"]),
    }

    audit_payload = {
        "model": str(args.model),
        "output_shape": [int(x) if isinstance(x, int) else str(x) for x in out_shape],
        "split": args.split,
        "conf_thresh": args.conf,
        "iou_thresh": args.iou,
        "iou_nms": args.iou_nms,
        "totals": {
            "images": len(samples),
            "gt": sum(len(s["gt"]) for s in samples),
            "tp": len(all_tps),
            "fp": len(all_fps),
            "fn": len(all_fns),
            "fp_by_type": dict(fp_type_counts),
            "fn_by_cause": dict(fn_cause_counts),
            "fn_by_size": dict(fn_size_counts),
            "fn_by_subclass": dict(fn_cls_counts),
            "fn_factors": fn_factors,
            "low_conf_010_025": dict(lc_counts),
        },
        "annotation_audit": annotation_audit,
        "false_positives": all_fps,
        "false_negatives": all_fns,
        "low_confidence_detections": all_low_confs,
        "per_image": per_image_summary,
    }

    json_path = out_dir / "audit_data.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(audit_payload, f, indent=2, ensure_ascii=False)

    # Tulis ringkasan mentah
    md_lines = [
        f"# Raw Forensic Audit Data (`{args.split}` split, `conf={args.conf}`, `IoU={args.iou}`)",
        "",
        f"- Model: `{args.model}` | Output tensor: `{audit_payload['output_shape']}` (1 kelas `PKL`)",
        f"- Total: `{len(samples)}` gambar | `{audit_payload['totals']['gt']}` GT | `TP={len(all_tps)}` | `FP={len(all_fps)}` | `FN={len(all_fns)}`",
        f"- FP breakdown: `{dict(fp_type_counts)}`",
        f"- FN mekanistik: `{dict(fn_cause_counts)}`",
        f"- FN faktor kondisi: `{fn_factors}`",
        f"- Low-confidence (`{args.low_conf_min:.2f}..{args.conf:.2f}`): `{dict(lc_counts)}`",
        "",
        "## Daftar Lengkap False Positive (untuk klasifikasi visual dari `fp_gallery.jpg`)",
        "| FP# | Tipe | Conf | MaxGT IoU | Near GT | Pred/GT Area | Size | Edge | Camera |",
        "|---:|---|---:|---:|---|---:|---|---|---|",
    ]
    for fp in all_fps:
        md_lines.append(
            f"| FP#{fp['fp_id']:02d} | {fp['fp_type']} | {fp['score']:.2f} | {fp['max_gt_iou']:.2f} | "
            f"{fp['near_gt_cls'] or '-'} | {fp['pred_to_gt_area_ratio'] or '-'} | "
            f"{fp['size_bucket']} | {'Y' if fp['edge'] else 'N'} | {fp['camera']} |"
        )

    md_lines.extend(
        [
            "",
            "## Ringkasan Audit Anotasi Seluruh Split (`train/valid/test`)",
            "| Split | Img | Bg | Boxes | Edge | AR>5 | GT Overlap IoU>=0.30 | GT Overlap IoU>=0.45 (NMS conflict) |",
            "|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for sp, st in annotation_audit["splits"].items():
        md_lines.append(
            f"| `{sp}` | {st['images']} | {st['background_images']} | {st['total_boxes']} | "
            f"{st['edge_boxes']} | {st['aspect_outliers_gt5']} | "
            f"{st['gt_overlap_pairs_iou30']} | {st['gt_overlap_pairs_iou45_nms_conflict']} |"
        )

    summary_path = out_dir / "auto_summary.md"
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines) + "\n")

    print(f"[5/5] Audit forensik selesai! Output tersimpan di: {out_dir}")
    print(f"      TP={len(all_tps)} | FP={len(all_fps)} {dict(fp_type_counts)} | FN={len(all_fns)} {dict(fn_cause_counts)}")
    print(f"      Low-conf ({args.low_conf_min:.2f}-{args.conf:.2f}): {dict(lc_counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
