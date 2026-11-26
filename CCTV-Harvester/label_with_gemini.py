"""
Tahap 2 — Batch Auto-Labeling via Gemini API (Delay 5 Detik) + JSON + Visualisasi + Export Roboflow.

Membaca seluruh gambar dari `CCTV-Harvester/output/raw_roi_captures/` (atau folder custom),
memberi label PKL memakai Gemini Vision dengan jeda 5 detik antar gambar agar aman dari rate limit,
lalu menghasilkan:
  1. `annotations_json/<stem>.json`  -> JSON lengkap hasil Gemini per gambar
  2. `visualizations/<stem>.jpg`     -> gambar visualisasi bounding box & label kelas
  3. `visualization_gallery.jpg`     -> galeri grid untuk review visual cepat
  4. `roboflow_export/`              -> SIAP UPLOAD KE ROBOFLOW dalam 2 format sekaligus:
       - Format YOLO (`images/` + `labels/` + `data.yaml`)
       - Format COCO JSON (`_annotations.coco.json`)

Contoh penggunaan:
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/label_with_gemini.py --delay-sec 5
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/label_with_gemini.py --input-dir CCTV-Harvester/output/raw_roi_captures --delay-sec 5 --include-empty
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from config import (
    CLASS_COLORS_BGR,
    DEFAULT_OUTPUT_DIR,
    YOLO_CLASS_NAMES,
    get_gemini_api_key,
    get_gemini_model_chain,
)
from gemini_labeler import GeminiAnalysisResult, analyze_frame_with_gemini

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch auto-label screenshot CCTV pakai Gemini (delay 5 detik) + visualisasi + export Roboflow."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / "raw_roi_captures",
        help="Folder berisi gambar screenshot CCTV (default: CCTV-Harvester/output/raw_roi_captures)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / "gemini_labeled",
        help="Folder output JSON, visualisasi, dan export Roboflow",
    )
    parser.add_argument(
        "--delay-sec",
        type=float,
        default=5.0,
        help="Jeda antar panggilan Gemini API dalam detik (default: 5.0 detik agar aman dari rate limit)",
    )
    parser.add_argument(
        "--min-conf",
        type=float,
        default=0.45,
        help="Confidence minimal agar bounding box disimpan (default: 0.45)",
    )
    parser.add_argument(
        "--max-images",
        type=int,
        default=0,
        help="Batasi jumlah gambar yang diproses pada sesi ini (0 = semua gambar)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="",
        help="Override model Gemini utama (default dari .env)",
    )
    parser.add_argument(
        "--single-class",
        action="store_true",
        help="Ekspor sebagai 1 kelas (0: PKL) alih-alih 6 kelas PATRA",
    )
    parser.add_argument(
        "--include-empty",
        action="store_true",
        help="Ikut sertakan gambar bagus 0-PKL (background negative) ke folder roboflow_export",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Label ulang gambar meskipun file JSON-nya sudah ada (default: resume otomatis)",
    )
    return parser.parse_args()


def draw_visualization(frame: np.ndarray, analysis: GeminiAnalysisResult, title: str) -> np.ndarray:
    vis = frame.copy()
    h, w = vis.shape[:2]

    for det in analysis.detections:
        x1 = max(0, int(round((det.cx - det.w / 2.0) * w)))
        y1 = max(0, int(round((det.cy - det.h / 2.0) * h)))
        x2 = min(w - 1, int(round((det.cx + det.w / 2.0) * w)))
        y2 = min(h - 1, int(round((det.cy + det.h / 2.0) * h)))
        color = CLASS_COLORS_BGR.get(det.class_id, (40, 40, 235))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"{det.class_name} {det.confidence:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        top_y = max(th + 8, y1)
        cv2.rectangle(vis, (x1, top_y - th - 8), (x1 + tw + 8, top_y), color, -1)
        cv2.putText(
            vis,
            label,
            (x1 + 4, top_y - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    # Banner status tipis di atas gambar visualisasi
    header_h = 30
    banner = np.full((header_h, w, 3), (20, 28, 42), dtype=np.uint8)
    status_txt = (
        f"{title[:48]} | {analysis.camera_quality.upper()} | PKL={len(analysis.detections)}"
    )
    cv2.putText(
        banner,
        status_txt,
        (8, 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (240, 244, 250),
        1,
        cv2.LINE_AA,
    )
    return np.vstack([banner, vis])


def make_contact_sheet(images: list[np.ndarray], cols: int = 3, tile_w: int = 440) -> np.ndarray | None:
    if not images:
        return None
    resized_tiles: list[np.ndarray] = []
    max_h = 0
    for im in images:
        h, w = im.shape[:2]
        th = max(1, int(round(h * (tile_w / float(w)))))
        t = cv2.resize(im, (tile_w, th), interpolation=cv2.INTER_AREA)
        resized_tiles.append(t)
        max_h = max(max_h, th)

    padded_tiles: list[np.ndarray] = []
    for t in resized_tiles:
        if t.shape[0] < max_h:
            pad = np.full((max_h - t.shape[0], tile_w, 3), 24, dtype=np.uint8)
            t = np.vstack([t, pad])
        padded_tiles.append(t)

    rows = (len(padded_tiles) + cols - 1) // cols
    while len(padded_tiles) < rows * cols:
        padded_tiles.append(np.full((max_h, tile_w, 3), 24, dtype=np.uint8))

    grid_rows = [
        np.hstack(padded_tiles[r * cols : (r + 1) * cols]) for r in range(rows)
    ]
    return np.vstack(grid_rows)


def build_roboflow_coco(
    records: list[dict[str, Any]],
    single_class: bool,
) -> dict[str, Any]:
    """Bangun struktur COCO JSON standar yang bisa langsung di-upload ke Roboflow."""
    class_list = ["PKL"] if single_class else list(YOLO_CLASS_NAMES)
    categories = [
        {"id": idx, "name": name, "supercategory": "pkl"}
        for idx, name in enumerate(class_list)
    ]
    coco_images: list[dict[str, Any]] = []
    coco_annotations: list[dict[str, Any]] = []
    ann_id = 1

    for img_id, rec in enumerate(records, start=1):
        w = int(rec["width"])
        h = int(rec["height"])
        coco_images.append(
            {
                "id": img_id,
                "file_name": rec["file_name"],
                "width": w,
                "height": h,
            }
        )
        for det in rec["detections"]:
            bw = float(det["w"]) * w
            bh = float(det["h"]) * h
            bx = max(0.0, float(det["cx"]) * w - bw / 2.0)
            by = max(0.0, float(det["cy"]) * h - bh / 2.0)
            coco_annotations.append(
                {
                    "id": ann_id,
                    "image_id": img_id,
                    "category_id": int(det["class_id"]),
                    "bbox": [round(bx, 2), round(by, 2), round(bw, 2), round(bh, 2)],
                    "area": round(bw * bh, 2),
                    "iscrowd": 0,
                }
            )
            ann_id += 1

    return {
        "info": {
            "description": "PATRA CCTV PKL Dataset (Auto-labeled via Gemini Vision)",
            "date_created": datetime.now(timezone.utc).isoformat(),
        },
        "categories": categories,
        "images": coco_images,
        "annotations": coco_annotations,
    }


def write_roboflow_data_yaml(export_dir: Path, single_class: bool) -> None:
    if single_class:
        names_block = "nc: 1\nnames:\n  0: PKL\n"
    else:
        lines = "\n".join(f"  {i}: {n}" for i, n in enumerate(YOLO_CLASS_NAMES))
        names_block = f"nc: {len(YOLO_CLASS_NAMES)}\nnames:\n{lines}\n"
    content = (
        "# Siap upload ke Roboflow (format YOLOv8 / YOLO26)\n"
        "train: images\n"
        "val: images\n\n"
        + names_block
    )
    (export_dir / "data.yaml").write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    if not args.input_dir.exists():
        print(f"Folder input tidak ditemukan: {args.input_dir}")
        return 1

    api_key = get_gemini_api_key()
    model_chain = get_gemini_model_chain(args.model or None)

    json_dir = args.out_dir / "annotations_json"
    vis_dir = args.out_dir / "visualizations"
    rf_dir = args.out_dir / "roboflow_export"
    rf_images_dir = rf_dir / "images"
    rf_labels_dir = rf_dir / "labels"
    for d in (json_dir, vis_dir, rf_images_dir, rf_labels_dir):
        d.mkdir(parents=True, exist_ok=True)
    write_roboflow_data_yaml(rf_dir, single_class=args.single_class)

    image_files = sorted(
        p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS
    )
    if args.max_images > 0:
        image_files = image_files[: args.max_images]

    if not image_files:
        print(f"Belum ada gambar di {args.input_dir}. Jalankan capture_roi_loop.py dulu.")
        return 0

    print(
        f"[Gemini Auto-Label] Total gambar={len(image_files)} | "
        f"delay={args.delay_sec}s | model={model_chain[0]}"
    )

    gallery_tiles: list[np.ndarray] = []
    roboflow_records: list[dict[str, Any]] = []
    processed_api = 0
    skipped_resume = 0
    pkl_images_count = 0
    bad_rejected_count = 0

    for idx, img_path in enumerate(image_files, start=1):
        frame = cv2.imread(str(img_path))
        if frame is None:
            continue
        h, w = frame.shape[:2]
        json_path = json_dir / f"{img_path.stem}.json"
        meta_path = img_path.with_suffix(".meta.json")
        cam_meta = (
            json.loads(meta_path.read_text(encoding="utf-8"))
            if meta_path.exists()
            else {"name": img_path.stem}
        )

        record: dict[str, Any]
        if json_path.exists() and not args.force:
            skipped_resume += 1
            record = json.loads(json_path.read_text(encoding="utf-8"))
            print(f"  [{idx:03d}/{len(image_files)}] RESUME  | {img_path.name} (PKL={len(record.get('detections', []))})")
        else:
            if processed_api > 0 and args.delay_sec > 0:
                time.sleep(args.delay_sec)

            try:
                analysis = analyze_frame_with_gemini(
                    frame=frame,
                    api_key=api_key,
                    model_chain=model_chain,
                    camera_meta=cam_meta,
                    min_conf=args.min_conf,
                    single_class=args.single_class,
                )
            except Exception as exc:
                print(f"  [{idx:03d}/{len(image_files)}] ERROR   | {img_path.name} -> {exc}")
                processed_api += 1
                continue

            processed_api += 1
            record = {
                "file_name": img_path.name,
                "source_path": str(img_path),
                "width": w,
                "height": h,
                "labeled_at": datetime.now(timezone.utc).isoformat(),
                "camera_meta": cam_meta,
                **analysis.to_dict(),
            }
            json_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")

            vis = draw_visualization(frame, analysis, img_path.stem)
            cv2.imwrite(str(vis_dir / f"{img_path.stem}.jpg"), vis, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if len(gallery_tiles) < 24:
                gallery_tiles.append(vis)

            print(
                f"  [{idx:03d}/{len(image_files)}] LABELED | {img_path.name} -> "
                f"quality={analysis.camera_quality}, PKL={len(analysis.detections)} ({analysis.model_used})"
            )

        # Kumpulkan gambar yang layak untuk Roboflow export
        if record.get("camera_quality") == "bad":
            bad_rejected_count += 1
            continue

        dets = record.get("detections", [])
        if dets or args.include_empty:
            if dets:
                pkl_images_count += 1
            dst_img = rf_images_dir / img_path.name
            shutil.copy2(img_path, dst_img)
            yolo_lines = [
                f"{int(d['class_id'])} {float(d['cx']):.6f} {float(d['cy']):.6f} {float(d['w']):.6f} {float(d['h']):.6f}"
                for d in dets
            ]
            (rf_labels_dir / f"{img_path.stem}.txt").write_text(
                ("\n".join(yolo_lines) + "\n") if yolo_lines else "",
                encoding="utf-8",
            )
            roboflow_records.append(record)

    # Tulis COCO JSON untuk Roboflow (siap drag-and-drop bersama gambar)
    coco = build_roboflow_coco(roboflow_records, single_class=args.single_class)
    (rf_dir / "_annotations.coco.json").write_text(
        json.dumps(coco, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    if gallery_tiles:
        sheet = make_contact_sheet(gallery_tiles, cols=3)
        if sheet is not None:
            cv2.imwrite(
                str(args.out_dir / "visualization_gallery.jpg"),
                sheet,
                [cv2.IMWRITE_JPEG_QUALITY, 88],
            )

    print(
        f"\n[Selesai] API calls={processed_api} | Resume={skipped_resume} | "
        f"Gambar PKL={pkl_images_count} | Ditolak(bad)={bad_rejected_count} | "
        f"Total diekspor ke Roboflow={len(roboflow_records)}"
    )
    print(f"  JSON per gambar : {json_dir}")
    print(f"  Visualisasi     : {vis_dir}")
    print(f"  Siap Roboflow   : {rf_dir} (YOLO images/+labels/+data.yaml & _annotations.coco.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
