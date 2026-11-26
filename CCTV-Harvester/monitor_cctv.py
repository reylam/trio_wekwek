"""
CCTV-Harvester — Pemantau CCTV Publik, Pemisah Kualitas (Bagus vs Jelek),
dan Auto-Capture + Auto-Label Dataset PKL YOLO Menggunakan Gemini Vision.

Contoh penggunaan:
  # 1. Scan cepat 20 kamera (1 putaran)
  AI-Patra/.venv/Scripts/python.exe CCTV-Harvester/monitor_cctv.py --max-cameras 20

  # 2. Filter kota tertentu (mis. Semarang atau Jakarta)
  AI-Patra/.venv/Scripts/python.exe CCTV-Harvester/monitor_cctv.py --city Semarang --max-cameras 30

  # 3. Mode pantau terus-menerus (otomatis skip kamera jelek di putaran berikutnya)
  AI-Patra/.venv/Scripts/python.exe CCTV-Harvester/monitor_cctv.py --loop --interval-sec 180 --max-cameras 25
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from capture_roi_loop import select_round_cameras
from config import (
    CLASS_COLORS_BGR,
    DEFAULT_CATALOG_PATH,
    DEFAULT_OUTPUT_DIR,
    YOLO_CLASS_NAMES,
    get_gemini_api_key,
    get_gemini_model_chain,
)
from gemini_labeler import GeminiAnalysisResult, analyze_frame_with_gemini
from quality_filter import assess_frame_quality


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pantau CCTV, pisahkan CCTV bagus vs jelek, dan auto-label dataset PKL via Gemini."
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG_PATH,
        help="Path katalog JSON CCTV (default: AI-Patra/cctv_catalog/cctv_snapshot.json)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Folder output dataset & laporan (default: CCTV-Harvester/output)",
    )
    parser.add_argument(
        "--city",
        type=str,
        default="",
        help="Filter nama kota (substring, mis. 'Semarang', 'Jakarta', 'Bandung')",
    )
    parser.add_argument(
        "--max-cameras",
        type=int,
        default=25,
        help="Maksimal kamera yang diperiksa per putaran (default: 25)",
    )
    parser.add_argument(
        "--min-conf",
        type=float,
        default=0.45,
        help="Ambang confidence minimal deteksi Gemini agar disimpan (default: 0.45)",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=3500,
        help="Timeout baca stream HLS per kamera dalam milidetik (default: 3500)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Jumlah thread paralel saat mengambil frame HLS CCTV (default: 6)",
    )
    parser.add_argument(
        "--no-rotate",
        action="store_true",
        help="Matikan rotasi round-robin antar putaran",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="",
        help="Override model Gemini utama (default dari .env: gemini-3.5-flash-lite)",
    )
    parser.add_argument(
        "--single-class",
        action="store_true",
        help="Simpan semua PKL sebagai 1 kelas (0: PKL). Default: 6 kelas sesuai data.yaml PATRA.",
    )
    parser.add_argument(
        "--skip-known-bad",
        action="store_true",
        help="Lewati kamera yang sudah pernah ditandai jelek di camera_quality_report.json",
    )
    parser.add_argument(
        "--delay-sec",
        type=float,
        default=0.8,
        help="Jeda antar panggilan Gemini API dalam detik untuk menjaga rate limit (default: 0.8)",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Jalankan pemantauan berulang terus-menerus (Ctrl+C untuk berhenti)",
    )
    parser.add_argument(
        "--interval-sec",
        type=int,
        default=180,
        help="Jeda antar putaran saat --loop aktif dalam detik (default: 180)",
    )
    return parser.parse_args()


def slugify(text: str, max_len: int = 40) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return (clean or "cam")[:max_len]


def grab_hls_frame(url: str, timeout_ms: int) -> np.ndarray | None:
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        f"timeout;{timeout_ms * 1000}|stimeout;{timeout_ms * 1000}"
    )
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
    if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)

    if not cap.isOpened():
        cap.release()
        return None

    frame = None
    for _ in range(3):
        ok, f = cap.read()
        if ok and f is not None and f.size > 0:
            frame = f
    cap.release()
    return frame


def draw_yolo_preview(frame: np.ndarray, analysis: GeminiAnalysisResult) -> np.ndarray:
    """Gambar bounding box & label kelas pada salinan frame untuk inspeksi visual cepat."""
    vis = frame.copy()
    h, w = vis.shape[:2]
    for det in analysis.detections:
        x1 = max(0, int(round((det.cx - det.w / 2.0) * w)))
        y1 = max(0, int(round((det.cy - det.h / 2.0) * h)))
        x2 = min(w - 1, int(round((det.cx + det.w / 2.0) * w)))
        y2 = min(h - 1, int(round((det.cy + det.h / 2.0) * h)))
        color = CLASS_COLORS_BGR.get(det.class_id, (40, 40, 235))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        tag = f"{det.class_name} {det.confidence:.2f}"
        (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)
        top_y = max(th + 6, y1)
        cv2.rectangle(vis, (x1, top_y - th - 6), (x1 + tw + 6, top_y), color, -1)
        cv2.putText(
            vis,
            tag,
            (x1 + 3, top_y - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
    return vis


def ensure_output_dirs(out_dir: Path, single_class: bool) -> dict[str, Path]:
    paths = {
        "root": out_dir,
        "good_samples": out_dir / "cctv_bagus",
        "bad_low_res": out_dir / "cctv_jelek" / "low_res",
        "bad_dark": out_dir / "cctv_jelek" / "dark_or_blank",
        "bad_overexposed": out_dir / "cctv_jelek" / "overexposed",
        "bad_blurry": out_dir / "cctv_jelek" / "blurry",
        "bad_gemini": out_dir / "cctv_jelek" / "gemini_rejected",
        "pkl_images": out_dir / "dataset_pkl" / "images",
        "pkl_labels": out_dir / "dataset_pkl" / "labels",
        "pkl_previews": out_dir / "dataset_pkl" / "previews",
        "neg_images": out_dir / "dataset_negatif_bersih" / "images",
        "neg_labels": out_dir / "dataset_negatif_bersih" / "labels",
    }
    for p in paths.values():
        p.mkdir(parents=True, exist_ok=True)

    # Tulis data.yaml siap pakai untuk Ultralytics / Roboflow di folder dataset_pkl
    yaml_path = out_dir / "dataset_pkl" / "data.yaml"
    if single_class:
        names_block = "nc: 1\nnames:\n  0: PKL\n"
    else:
        lines = "\n".join(f"  {idx}: {name}" for idx, name in enumerate(YOLO_CLASS_NAMES))
        names_block = f"nc: {len(YOLO_CLASS_NAMES)}\nnames:\n{lines}\n"
    yaml_content = (
        "# Dataset PKL hasil auto-capture & auto-label Gemini (CCTV-Harvester)\n"
        "train: images\n"
        "val: images\n\n"
        + names_block
    )
    yaml_path.write_text(yaml_content, encoding="utf-8")
    return paths


def load_json_safe(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_cameras(catalog_path: Path, city_filter: str) -> list[dict[str, Any]]:
    if not catalog_path.exists():
        raise FileNotFoundError(f"Katalog CCTV tidak ditemukan: {catalog_path}")
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    cameras = raw.get("cameras", []) if isinstance(raw, dict) else raw

    city_priority = {
        "Kota Jakarta Pusat": 0,
        "Kota Semarang": 1,
        "Kota Bandung": 2,
        "Kota Yogyakarta": 3,
        "Kota Jakarta Selatan": 4,
        "Kota Jakarta Barat": 5,
        "Kota Jakarta Timur": 6,
    }

    q = city_filter.strip().lower()
    filtered = [
        c
        for c in cameras
        if isinstance(c, dict)
        and c.get("stream_type") == "hls"
        and c.get("stream_url")
        and (not q or q in str(c.get("city", "")).lower() or q in str(c.get("name", "")).lower())
    ]
    filtered.sort(key=lambda c: (city_priority.get(str(c.get("city", "")), 99), str(c.get("id", ""))))
    return filtered


def run_scan_round(
    args: argparse.Namespace,
    api_key: str,
    model_chain: list[str],
    dirs: dict[str, Path],
    cameras: list[dict[str, Any]],
    round_num: int,
) -> dict[str, int]:
    quality_report_path = dirs["root"] / "camera_quality_report.json"
    manifest_path = dirs["root"] / "manifest.json"

    quality_report: dict[str, Any] = load_json_safe(
        quality_report_path,
        {"updated_at": None, "round_cursor": 0, "summary": {}, "cctv_bagus": {}, "cctv_jelek": {}},
    )
    manifest: list[dict[str, Any]] = load_json_safe(manifest_path, [])

    known_bad: set[str] = set(quality_report.get("cctv_jelek", {}).keys())
    cursor = int(quality_report.get("round_cursor", 0) or 0)
    batch, next_cursor = select_round_cameras(
        cameras=cameras,
        max_cameras=args.max_cameras,
        start_cursor=cursor,
        skip_ids=known_bad if args.skip_known_bad else None,
        rotate=not args.no_rotate,
    )
    quality_report["round_cursor"] = next_cursor
    worker_count = max(1, min(16, int(args.workers)))

    stats = {
        "checked": 0,
        "offline": 0,
        "bad_opencv": 0,
        "bad_gemini": 0,
        "good_pkl": 0,
        "good_clean": 0,
        "gemini_errors": 0,
    }

    print(
        f"\n[Putaran #{round_num}] Prefetch paralel {len(batch)} kamera "
        f"(cursor={cursor}->{next_cursor}, workers={worker_count}, model={model_chain[0]})..."
    )

    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        frames = list(
            pool.map(lambda c: grab_hls_frame(str(c["stream_url"]), args.timeout_ms), batch)
        )

    for cam, frame in zip(batch, frames):
        cam_id = str(cam.get("id", "unknown"))
        cam_name = str(cam.get("name", cam_id))
        cam_city = str(cam.get("city", "-"))
        stream_url = str(cam["stream_url"])

        stats["checked"] += 1
        now_iso = datetime.now(timezone.utc).isoformat()
        ts_tag = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_stem = f"{slugify(cam_city, 14)}_{slugify(cam_id, 34)}_{ts_tag}"

        if frame is None:
            stats["offline"] += 1
            quality_report["cctv_jelek"][cam_id] = {
                "id": cam_id,
                "name": cam_name,
                "city": cam_city,
                "stream_url": stream_url,
                "stage": "capture",
                "category": "offline_or_timeout",
                "reason": "Stream HLS tidak dapat dibuka atau timeout",
                "checked_at": now_iso,
            }
            quality_report["cctv_bagus"].pop(cam_id, None)
            print(f"  [{stats['checked']:02d}] JELEK (offline)   | {cam_city} | {cam_name}")
            continue

        # Tahap 1: Pre-check kualitas OpenCV (hemat kuota Gemini)
        qres = assess_frame_quality(frame)
        if not qres.is_good:
            stats["bad_opencv"] += 1
            bad_folder_map = {
                "low_res": dirs["bad_low_res"],
                "dark_or_blank": dirs["bad_dark"],
                "overexposed": dirs["bad_overexposed"],
                "blurry": dirs["bad_blurry"],
            }
            target_dir = bad_folder_map.get(qres.category, dirs["bad_dark"])
            bad_img_path = target_dir / f"{base_stem}.jpg"
            cv2.imwrite(str(bad_img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 82])

            quality_report["cctv_jelek"][cam_id] = {
                "id": cam_id,
                "name": cam_name,
                "city": cam_city,
                "stream_url": stream_url,
                "stage": "opencv_quality",
                "category": qres.category,
                "reason": qres.reason,
                "metrics": qres.to_dict(),
                "sample_image": str(bad_img_path.relative_to(dirs["root"])),
                "checked_at": now_iso,
            }
            quality_report["cctv_bagus"].pop(cam_id, None)
            print(f"  [{stats['checked']:02d}] JELEK ({qres.category:10s}) | {cam_city} | {cam_name} -> {qres.reason}")
            continue

        # Tahap 2: Analisis visual & auto-label PKL via Gemini Vision
        try:
            analysis = analyze_frame_with_gemini(
                frame=frame,
                api_key=api_key,
                model_chain=model_chain,
                camera_meta=cam,
                min_conf=args.min_conf,
                single_class=args.single_class,
            )
        except Exception as exc:
            stats["gemini_errors"] += 1
            print(f"  [{stats['checked']:02d}] ERROR Gemini     | {cam_city} | {cam_name} -> {exc}")
            time.sleep(max(1.0, args.delay_sec))
            continue

        if analysis.camera_quality == "bad":
            stats["bad_gemini"] += 1
            bad_img_path = dirs["bad_gemini"] / f"{base_stem}.jpg"
            cv2.imwrite(str(bad_img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

            quality_report["cctv_jelek"][cam_id] = {
                "id": cam_id,
                "name": cam_name,
                "city": cam_city,
                "stream_url": stream_url,
                "stage": "gemini_quality",
                "category": "gemini_rejected",
                "reason": analysis.quality_reason,
                "scene_summary": analysis.scene_summary,
                "model_used": analysis.model_used,
                "metrics": qres.to_dict(),
                "sample_image": str(bad_img_path.relative_to(dirs["root"])),
                "checked_at": now_iso,
            }
            quality_report["cctv_bagus"].pop(cam_id, None)
            print(f"  [{stats['checked']:02d}] JELEK (gemini)    | {cam_city} | {cam_name} -> {analysis.quality_reason}")
            time.sleep(args.delay_sec)
            continue

        # Kamera dinyatakan BAGUS untuk dataset!
        good_sample_path = dirs["good_samples"] / f"{slugify(cam_city, 14)}_{slugify(cam_id, 36)}.jpg"
        cv2.imwrite(str(good_sample_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

        quality_report["cctv_bagus"][cam_id] = {
            "id": cam_id,
            "name": cam_name,
            "city": cam_city,
            "stream_url": stream_url,
            "resolution": f"{qres.width}x{qres.height}",
            "quality_reason": analysis.quality_reason,
            "scene_summary": analysis.scene_summary,
            "metrics": qres.to_dict(),
            "sample_image": str(good_sample_path.relative_to(dirs["root"])),
            "last_has_pkl": analysis.has_pkl,
            "last_pkl_count": len(analysis.detections),
            "model_used": analysis.model_used,
            "checked_at": now_iso,
        }
        quality_report["cctv_jelek"].pop(cam_id, None)

        if analysis.has_pkl and analysis.detections:
            stats["good_pkl"] += 1
            img_path = dirs["pkl_images"] / f"{base_stem}.jpg"
            lbl_path = dirs["pkl_labels"] / f"{base_stem}.txt"
            prev_path = dirs["pkl_previews"] / f"{base_stem}.jpg"

            cv2.imwrite(str(img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
            lbl_path.write_text(
                "\n".join(d.to_yolo_line() for d in analysis.detections) + "\n",
                encoding="utf-8",
            )
            preview = draw_yolo_preview(frame, analysis)
            cv2.imwrite(str(prev_path), preview, [cv2.IMWRITE_JPEG_QUALITY, 90])

            classes_found = ", ".join(
                f"{d.class_name}({d.confidence:.2f})" for d in analysis.detections
            )
            print(
                f"  [{stats['checked']:02d}] PKL TERDETEKSI   | {cam_city} | {cam_name} "
                f"-> {len(analysis.detections)} objek [{classes_found}]"
            )
            saved_bucket = "dataset_pkl"
            saved_image_rel = str(img_path.relative_to(dirs["root"]))
            saved_label_rel = str(lbl_path.relative_to(dirs["root"]))
        else:
            stats["good_clean"] += 1
            img_path = dirs["neg_images"] / f"{base_stem}.jpg"
            lbl_path = dirs["neg_labels"] / f"{base_stem}.txt"

            cv2.imwrite(str(img_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            lbl_path.write_text("", encoding="utf-8")

            print(
                f"  [{stats['checked']:02d}] BAGUS (0 PKL)    | {cam_city} | {cam_name} "
                f"-> {analysis.scene_summary[:65]}"
            )
            saved_bucket = "dataset_negatif_bersih"
            saved_image_rel = str(img_path.relative_to(dirs["root"]))
            saved_label_rel = str(lbl_path.relative_to(dirs["root"]))

        manifest.append(
            {
                "timestamp": now_iso,
                "bucket": saved_bucket,
                "camera_id": cam_id,
                "camera_name": cam_name,
                "city": cam_city,
                "resolution": f"{qres.width}x{qres.height}",
                "image": saved_image_rel,
                "label": saved_label_rel,
                "analysis": analysis.to_dict(),
            }
        )

        # Simpan progres bertahap setiap kamera bagus supaya aman jika dihentikan Ctrl+C
        quality_report["updated_at"] = now_iso
        quality_report["summary"] = {
            "total_cctv_bagus": len(quality_report["cctv_bagus"]),
            "total_cctv_jelek": len(quality_report["cctv_jelek"]),
            "total_manifest_captures": len(manifest),
        }
        save_json(quality_report_path, quality_report)
        save_json(manifest_path, manifest)

        time.sleep(args.delay_sec)

    # Pastikan laporan tetap tersimpan walau semua kamera offline/jelek
    quality_report["updated_at"] = datetime.now(timezone.utc).isoformat()
    quality_report["summary"] = {
        "total_cctv_bagus": len(quality_report["cctv_bagus"]),
        "total_cctv_jelek": len(quality_report["cctv_jelek"]),
        "total_manifest_captures": len(manifest),
    }
    save_json(quality_report_path, quality_report)
    save_json(manifest_path, manifest)

    print(
        f"[Ringkasan Putaran #{round_num}] Diperiksa={stats['checked']} | "
        f"PKL={stats['good_pkl']} | Bagus-Bersih={stats['good_clean']} | "
        f"Jelek(offline={stats['offline']}, opencv={stats['bad_opencv']}, gemini={stats['bad_gemini']}) | "
        f"ErrGemini={stats['gemini_errors']}"
    )
    print(f"  Output tersimpan di: {dirs['root']}")
    return stats


def main() -> int:
    args = parse_args()
    api_key = get_gemini_api_key()
    model_chain = get_gemini_model_chain(args.model or None)
    dirs = ensure_output_dirs(args.out_dir, single_class=args.single_class)
    cameras = load_cameras(args.catalog, args.city)

    if not cameras:
        print("Tidak ada kamera HLS yang cocok dengan filter.")
        return 1

    round_num = 1
    try:
        while True:
            run_scan_round(args, api_key, model_chain, dirs, cameras, round_num)
            if not args.loop:
                break
            round_num += 1
            print(f"\nMenunggu {args.interval_sec} detik sebelum putaran berikutnya (Ctrl+C untuk berhenti)...")
            time.sleep(args.interval_sec)
    except KeyboardInterrupt:
        print("\nDihentikan oleh pengguna. Seluruh hasil dan laporan sudah tersimpan aman.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
