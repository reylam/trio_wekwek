"""
PETRA / PATRA — Read-Only Training Set Annotation Audit (Prioritas 1).

Mengaudit `AI-Patra/dataset/train/` secara READ-ONLY (tidak mengubah file apa pun)
untuk menemukan secara visual & kuantitatif:
1. Foto non-CCTV / close-up / box raksasa (`area >= 12%`) termasuk `Panggul` & `idcctv*`.
2. Label `Payung` berukuran kecil (`area < 0.8%`) untuk memisahkan payung hujan pejalan kaki
   dari payung lapak PKL secara visual.
3. Perbandingan skala ukuran objek (`Near/Medium/Far/Tiny`) antara subset Roboflow asli (302)
   vs tambahan `idcctv*` (19) vs `valid/` dan `test/`.

Output disimpan di `AI-Patra/evaluation_results/train_audit/`.

Penggunaan:
  python AI-Patra/audit_train_annotations.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from audit_prediction_errors import make_context_crop, make_grid, size_bucket_4  # noqa: E402
from prepare_dataset import (  # noqa: E402
    CLASS_NAMES,
    DATASET_DIR,
    IMG_EXTS,
    convert_line_to_yolo_bbox,
    extract_camera_group,
)

OUT_DIR = AI_ROOT / "evaluation_results" / "train_audit"


def draw_full_with_boxes(img_bgr: np.ndarray, boxes: list[dict[str, Any]], title: str) -> np.ndarray:
    im = img_bgr.copy()
    h, w = im.shape[:2]
    scale = 340.0 / float(max(h, w))
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    im = cv2.resize(im, (nw, nh), interpolation=cv2.INTER_AREA)

    for b in boxes:
        x1 = int(round(b["bbox"][0] * scale))
        y1 = int(round(b["bbox"][1] * scale))
        x2 = int(round(b["bbox"][2] * scale))
        y2 = int(round(b["bbox"][3] * scale))
        col = (0, 220, 255) if b["area_ratio"] < 0.12 else (40, 40, 255)
        cv2.rectangle(im, (x1, y1), (x2, y2), col, 2)
        cv2.putText(
            im,
            f"{b['cls_name']} {b['area_ratio']*100:.1f}%",
            (x1, max(12, y1 - 2)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            col,
            1,
            cv2.LINE_AA,
        )

    tile = np.full((340 + 26, 340, 3), 22, dtype=np.uint8)
    ox = (340 - nw) // 2
    oy = 26 + (340 - nh) // 2
    tile[oy : oy + nh, ox : ox + nw] = im
    cv2.putText(tile, title[:48], (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (235, 235, 235), 1, cv2.LINE_AA)
    return tile


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img_dir = DATASET_DIR / "train" / "images"
    lbl_dir = DATASET_DIR / "train" / "labels"

    subset_stats: dict[str, Counter] = defaultdict(Counter)
    subset_areas: dict[str, list[float]] = defaultdict(list)
    large_or_noncctv_records: list[dict[str, Any]] = []
    small_payung_records: list[dict[str, Any]] = []

    large_tiles: list[np.ndarray] = []
    payung_tiles: list[np.ndarray] = []

    py_id = 0
    tr_id = 0

    img_paths = sorted(p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS)
    print(f"[1/3] Mengaudit {len(img_paths)} gambar pada `train/` (read-only)...")

    for img_path in img_paths:
        stem = img_path.stem
        cam = extract_camera_group(stem)
        is_idcctv = stem.startswith("idcctv")
        is_noncctv = cam.startswith("noncctv_") and not is_idcctv
        subset = "idcctv_added" if is_idcctv else ("noncctv_orig" if is_noncctv else "roboflow_cctv")

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue
        h, w = img_bgr.shape[:2]

        lbl_path = lbl_dir / f"{stem}.txt"
        boxes: list[dict[str, Any]] = []
        if lbl_path.exists():
            with open(lbl_path, "r", encoding="utf-8") as f:
                for line_idx, raw_ln in enumerate(f):
                    parsed = convert_line_to_yolo_bbox(raw_ln)
                    if parsed is None:
                        continue
                    cid, cx, cy, bw, bh = parsed
                    area_ratio = float(bw * bh)
                    x1 = max(0.0, (cx - bw / 2.0) * w)
                    y1 = max(0.0, (cy - bh / 2.0) * h)
                    x2 = min(float(w), (cx + bw / 2.0) * w)
                    y2 = min(float(h), (cy + bh / 2.0) * h)
                    cname = CLASS_NAMES.get(cid, f"cls_{cid}")
                    boxes.append(
                        {
                            "line_idx": line_idx,
                            "cls_id": cid,
                            "cls_name": cname,
                            "area_ratio": area_ratio,
                            "size_bucket": size_bucket_4(area_ratio),
                            "bbox": np.array([x1, y1, x2, y2], dtype=np.float32),
                        }
                    )
                    subset_stats[subset]["boxes"] += 1
                    subset_stats[subset][size_bucket_4(area_ratio)] += 1
                    subset_areas[subset].append(area_ratio)

        subset_stats[subset]["images"] += 1
        max_area = max((b["area_ratio"] for b in boxes), default=0.0)

        # 1. Kumpulkan semua non-CCTV, idcctv*, atau gambar dengan box >= 12% layar
        if is_noncctv or is_idcctv or max_area >= 0.12:
            tr_id += 1
            large_or_noncctv_records.append(
                {
                    "tr_id": tr_id,
                    "stem": stem,
                    "filename": img_path.name,
                    "subset": subset,
                    "resolution": f"{w}x{h}",
                    "num_boxes": len(boxes),
                    "max_area_pct": round(max_area * 100.0, 2),
                    "classes": dict(Counter(b["cls_name"] for b in boxes)),
                }
            )
            large_tiles.append(
                draw_full_with_boxes(
                    img_bgr,
                    boxes,
                    f"TR#{tr_id:02d} [{subset[:8]}] {stem[:18]} max={max_area*100:.1f}%",
                )
            )

        # 2. Kumpulkan seluruh label `Payung` berukuran kecil (<0.8% frame) untuk inspeksi payung hujan
        for b in boxes:
            if b["cls_name"] == "Payung" and b["area_ratio"] < 0.008:
                py_id += 1
                small_payung_records.append(
                    {
                        "py_id": py_id,
                        "stem": stem,
                        "line_idx": b["line_idx"],
                        "camera": cam,
                        "area_pct": round(b["area_ratio"] * 100.0, 3),
                        "bbox": [round(float(v), 1) for v in b["bbox"]],
                    }
                )
                short_cam = cam.split("_")[-2] if "_" in cam else cam
                tile = make_context_crop(
                    img_bgr,
                    b["bbox"],
                    (0, 220, 255),
                    [
                        f"PY#{py_id:03d} Payung {b['area_ratio']*100:.2f}% | L{b['line_idx']}",
                        f"{short_cam[:28]}",
                    ],
                    tile_size=220,
                )
                payung_tiles.append(tile)

    print(f"[2/3] Menyusun galeri: {len(large_tiles)} non-CCTV/large & {len(payung_tiles)} small Payung...")
    g_large = make_grid(large_tiles, cols=5)
    if g_large is not None:
        cv2.imwrite(str(OUT_DIR / "train_noncctv_and_large_gallery.jpg"), g_large, [cv2.IMWRITE_JPEG_QUALITY, 90])

    chunk = 40
    for idx in range(0, len(payung_tiles), chunk):
        g_py = make_grid(payung_tiles[idx : idx + chunk], cols=5)
        if g_py is not None:
            cv2.imwrite(
                str(OUT_DIR / f"train_small_payung_part{idx // chunk + 1}.jpg"),
                g_py,
                [cv2.IMWRITE_JPEG_QUALITY, 88],
            )

    summary_subsets = {}
    for sub, cnt in subset_stats.items():
        arr = np.array(subset_areas[sub], dtype=np.float64) if subset_areas[sub] else np.array([0.0])
        summary_subsets[sub] = {
            **dict(cnt),
            "median_area_pct": round(float(np.median(arr)) * 100.0, 3),
            "mean_area_pct": round(float(np.mean(arr)) * 100.0, 3),
        }

    report = {
        "train_images": len(img_paths),
        "subsets": summary_subsets,
        "noncctv_and_large_count": len(large_or_noncctv_records),
        "small_payung_count": len(small_payung_records),
        "noncctv_and_large": large_or_noncctv_records,
        "small_payung": small_payung_records,
    }
    with open(OUT_DIR / "train_audit_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    md = [
        "# Train Set Read-Only Annotation Audit (Prioritas 1)",
        "",
        "## Perbandingan Skala Objek per Subset di `train/`",
        "| Subset | Images | Boxes | Tiny (<0.25%) | Far (0.25-1%) | Medium (1-4%) | Near (>=4%) | Median Area% | Mean Area% |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for sub, st in summary_subsets.items():
        md.append(
            f"| `{sub}` | {st.get('images',0)} | {st.get('boxes',0)} | "
            f"{st.get('Tiny (<0.25%)',0)} | {st.get('Far (0.25-1%)',0)} | "
            f"{st.get('Medium (1-4%)',0)} | {st.get('Near (>=4%)',0)} | "
            f"{st['median_area_pct']:.3f}% | {st['mean_area_pct']:.3f}% |"
        )
    md.extend(
        [
            "",
            f"- Galeri non-CCTV / `idcctv*` / box >= 12%: `{len(large_or_noncctv_records)}` gambar (`train_noncctv_and_large_gallery.jpg`)",
            f"- Galeri `Payung` kecil (`<0.8%`): `{len(small_payung_records)}` box (`train_small_payung_part*.jpg`)",
            "",
            "## Daftar Gambar Non-CCTV / `idcctv*` / Box Besar (>=12%)",
            "| TR# | Subset | File | Res | Boxes | Max Area% | Classes |",
            "|---:|---|---|---|---:|---:|---|",
        ]
    )
    for r in large_or_noncctv_records:
        md.append(
            f"| TR#{r['tr_id']:02d} | `{r['subset']}` | `{r['filename']}` | {r['resolution']} | "
            f"{r['num_boxes']} | {r['max_area_pct']:.1f}% | {r['classes']} |"
        )

    with open(OUT_DIR / "train_audit_summary.md", "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")

    print(f"[3/3] Selesai! Lihat: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
