r"""
Tahap 2 — Batch Auto-Labeling via Gemini API + Visualisasi & Export ke `dataset_pkl/`.

Membaca seluruh gambar dari `CCTV-Harvester/output/raw_roi_captures/` (atau folder custom),
memberi label PKL memakai Gemini Vision dengan jeda antar gambar agar aman dari rate limit,
lalu menyimpan hasilnya langsung secara terpadu ke `CCTV-Harvester/output/dataset_pkl/` (tanpa duplikasi folder):
  - `dataset_pkl/images/<stem>.jpg`   -> hanya gambar yang terdeteksi PKL
  - `dataset_pkl/labels/<stem>.txt`   -> label format YOLO untuk gambar PKL tersebut
  - `dataset_pkl/previews/<stem>.jpg` -> visualisasi bounding box + label kelas (khusus gambar PKL)
  - `dataset_pkl/data.yaml`           -> konfigurasi kelas siap upload ke Roboflow / YOLO

Cache JSON untuk auto-resume disimpan terpisah di `CCTV-Harvester/output/.gemini_cache/` agar folder
`dataset_pkl/` tetap bersih saat di-upload ke Roboflow. Gambar bagus 0-PKL (jika `--include-empty`
diaktifkan) disimpan ke `CCTV-Harvester/output/dataset_negatif_bersih/` tanpa preview.

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
        description="Batch auto-label screenshot CCTV pakai Gemini + visualisasi & export terpadu ke dataset_pkl."
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
        default=DEFAULT_OUTPUT_DIR / "dataset_pkl",
        help="Folder output dataset PKL (images/, labels/, previews/, data.yaml)",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / ".gemini_cache",
        help="Folder cache JSON hasil Gemini untuk fitur auto-resume",
    )
    parser.add_argument(
        "--neg-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / "dataset_negatif_bersih",
        help="Folder opsional untuk gambar bagus 0-PKL bila --include-empty aktif",
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
        help="Ikut simpan gambar bagus 0-PKL (background negative) ke --neg-dir tanpa preview",
    )
    parser.add_argument(
        "--export-coco",
        action="store_true",
        help="Opsional: tulis juga file _annotations.coco.json di dalam --out-dir",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Label ulang gambar meskipun cache JSON-nya sudah ada (default: resume otomatis)",
    )
    return parser.parse_args()


def draw_visualization_from_record(frame: np.ndarray, record: dict[str, Any], title: str) -> np.ndarray:
    """Gambar bounding box, label kelas, dan banner status dari dictionary hasil Gemini."""
    vis = frame.copy()
    h, w = vis.shape[:2]
    detections = record.get("detections") or []

    for det in detections:
        cx = float(det["cx"])
        cy = float(det["cy"])
        bw = float(det["w"])
        bh = float(det["h"])
        class_id = int(det.get("class_id", 0))
        class_name = str(det.get("class_name") or f"class_{class_id}")
        confidence = float(det.get("confidence", 0.0))

        x1 = max(0, int(round((cx - bw / 2.0) * w)))
        y1 = max(0, int(round((cy - bh / 2.0) * h)))
        x2 = min(w - 1, int(round((cx + bw / 2.0) * w)))
        y2 = min(h - 1, int(round((cy + bh / 2.0) * h)))
        color = CLASS_COLORS_BGR.get(class_id, (40, 40, 235))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"{class_name} {confidence:.2f}"
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

    header_h = 30
    banner = np.full((header_h, w, 3), (20, 28, 42), dtype=np.uint8)
    quality = str(record.get("camera_quality") or "good").upper()
    status_txt = f"{title[:48]} | {quality} | PKL={len(detections)}"
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


def draw_visualization(frame: np.ndarray, analysis: GeminiAnalysisResult, title: str) -> np.ndarray:
    """Wrapper untuk menggambar visualisasi langsung dari GeminiAnalysisResult."""
    return draw_visualization_from_record(frame, analysis.to_dict(), title)


def export_labeled_record(
    img_path: Path,
    frame: np.ndarray,
    record: dict[str, Any],
    out_dir: Path,
    *,
    neg_dir: Path | None = None,
    include_empty: bool = False,
    overwrite_preview: bool = False,
) -> str:
    """Simpan hasil pelabelan ke `dataset_pkl` khusus frame PKL, atau ke `neg_dir` jika 0-PKL.

    Mengembalikan bucket hasil: `"bad"`, `"pkl"`, atau `"empty"`.
    """
    if record.get("camera_quality") == "bad":
        return "bad"

    dets = record.get("detections") or []
    if dets:
        images_dir = out_dir / "images"
        labels_dir = out_dir / "labels"
        previews_dir = out_dir / "previews"
        for d in (images_dir, labels_dir, previews_dir):
            d.mkdir(parents=True, exist_ok=True)

        dst_img = images_dir / img_path.name
        if img_path.resolve() != dst_img.resolve():
            shutil.copy2(img_path, dst_img)

        yolo_lines = [
            f"{int(d['class_id'])} {float(d['cx']):.6f} {float(d['cy']):.6f} {float(d['w']):.6f} {float(d['h']):.6f}"
            for d in dets
        ]
        (labels_dir / f"{img_path.stem}.txt").write_text(
            "\n".join(yolo_lines) + "\n",
            encoding="utf-8",
        )

        prev_path = previews_dir / f"{img_path.stem}.jpg"
        if overwrite_preview or not prev_path.exists():
            vis = draw_visualization_from_record(frame, record, img_path.stem)
            cv2.imwrite(str(prev_path), vis, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return "pkl"

    if include_empty and neg_dir is not None:
        neg_images_dir = neg_dir / "images"
        neg_labels_dir = neg_dir / "labels"
        for d in (neg_images_dir, neg_labels_dir):
            d.mkdir(parents=True, exist_ok=True)
        dst_neg = neg_images_dir / img_path.name
        if img_path.resolve() != dst_neg.resolve():
            shutil.copy2(img_path, dst_neg)
        (neg_labels_dir / f"{img_path.stem}.txt").write_text("", encoding="utf-8")

    return "empty"


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

    images_dir = args.out_dir / "images"
    labels_dir = args.out_dir / "labels"
    previews_dir = args.out_dir / "previews"
    for d in (args.cache_dir, images_dir, labels_dir, previews_dir):
        d.mkdir(parents=True, exist_ok=True)
    write_roboflow_data_yaml(args.out_dir, single_class=args.single_class)

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
        f"delay={args.delay_sec}s | model={model_chain[0]} -> {args.out_dir}"
    )

    roboflow_records: list[dict[str, Any]] = []
    processed_api = 0
    skipped_resume = 0
    pkl_images_count = 0
    empty_saved_count = 0
    bad_rejected_count = 0

    for idx, img_path in enumerate(image_files, start=1):
        frame = cv2.imread(str(img_path))
        if frame is None:
            continue
        h, w = frame.shape[:2]
        json_path = args.cache_dir / f"{img_path.stem}.json"
        meta_path = img_path.with_suffix(".meta.json")
        cam_meta = (
            json.loads(meta_path.read_text(encoding="utf-8"))
            if meta_path.exists()
            else {"name": img_path.stem}
        )

        record: dict[str, Any]
        is_fresh = False
        if json_path.exists() and not args.force:
            skipped_resume += 1
            record = json.loads(json_path.read_text(encoding="utf-8"))
            print(
                f"  [{idx:03d}/{len(image_files)}] RESUME  | {img_path.name} "
                f"(PKL={len(record.get('detections', []))})"
            )
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
            is_fresh = True
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

            print(
                f"  [{idx:03d}/{len(image_files)}] LABELED | {img_path.name} -> "
                f"quality={analysis.camera_quality}, PKL={len(analysis.detections)} ({analysis.model_used})"
            )

        bucket = export_labeled_record(
            img_path,
            frame,
            record,
            args.out_dir,
            neg_dir=args.neg_dir,
            include_empty=args.include_empty,
            overwrite_preview=is_fresh,
        )
        if bucket == "bad":
            bad_rejected_count += 1
        elif bucket == "pkl":
            pkl_images_count += 1
            roboflow_records.append(record)
        elif args.include_empty:
            empty_saved_count += 1

    if args.export_coco:
        coco = build_roboflow_coco(roboflow_records, single_class=args.single_class)
        (args.out_dir / "_annotations.coco.json").write_text(
            json.dumps(coco, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    print(
        f"\n[Selesai] API calls={processed_api} | Resume={skipped_resume} | "
        f"PKL={pkl_images_count} | Negatif={empty_saved_count} | Ditolak(bad)={bad_rejected_count}"
    )
    print(f"  Dataset PKL + Preview : {args.out_dir} (images/, labels/, previews/, data.yaml)")
    print(f"  Cache Resume JSON     : {args.cache_dir}")
    if args.include_empty:
        print(f"  Negatif Bersih (0-PKL): {args.neg_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
