r"""
Tahap 1 — Automation Screenshot CCTV + Crop ROI Setiap 5 Menit.

Mengambil screenshot dari kamera CCTV di katalog secara berkala (default 300 detik / 5 menit),
memisahkan CCTV bagus vs jelek (quality_filter.py), lalu menyimpan gambar hasil crop ROI
(siap dilabeli oleh `label_with_gemini.py` dengan jeda 5 detik).

Contoh penggunaan:
  # 1x putaran (uji cepat 15 kamera)
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --once --max-cameras 15

  # Jalan otomatis tiap 5 menit (300 detik), khusus kota Semarang
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --city Semarang --interval-sec 300 --max-cameras 25

  # Custom ROI kotak (x1,y1,x2,y2 skala 0..1) jika ingin fokus bagian bawah/trotoar
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --roi 0.05,0.45,0.95,0.98 --interval-sec 300

Frame budget (default AKTIF): maks 5 frame per kamera, jeda >= 120 menit antar frame kamera yang sama,
kamera dengan frame paling sedikit diprioritaskan -> dataset menyebar ke ratusan kamera berbeda.
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --max-cameras 40 --skip-known-bad
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --max-frames-per-camera 3 --min-gap-min 180
  .\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --max-frames-per-camera 0   # perilaku lama (tanpa batas)
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

from config import DEFAULT_CATALOG_PATH, DEFAULT_STATE_DIR
from frame_budget import add_budget_args, budget_from_args
from quality_filter import assess_frame_quality


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Automation screenshot CCTV + crop ROI setiap 5 menit (simpan staging ke .state/)."
    )
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG_PATH)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_STATE_DIR,
        help="Folder staging screenshot & state internal (default: CCTV-Harvester/.state)",
    )
    parser.add_argument("--city", type=str, default="", help="Filter nama kota/kamera (substring)")
    parser.add_argument(
        "--max-cameras",
        type=int,
        default=30,
        help="Maksimal kamera yang di-screenshot per putaran (default: 30)",
    )
    parser.add_argument(
        "--interval-sec",
        type=int,
        default=300,
        help="Interval antar putaran screenshot dalam detik (default: 300 = 5 menit)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Jalankan 1 putaran saja lalu berhenti (default: loop otomatis tiap 5 menit)",
    )
    parser.add_argument(
        "--roi-mode",
        choices=["crop", "mask", "full"],
        default="crop",
        help="crop = potong ke area ROI; mask = gelapkan luar poligon ROI; full = gambar utuh (default: crop)",
    )
    parser.add_argument(
        "--roi",
        type=str,
        default="",
        help="Override kotak ROI manual x1,y1,x2,y2 (skala 0..1), mis. '0.05,0.45,0.95,0.98'",
    )
    parser.add_argument(
        "--default-bottom-roi",
        action="store_true",
        help="Jika kamera belum punya roi_polygon di katalog, crop otomatis area trotoar/jalan bawah (y=0.35..1.0)",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=3500,
        help="Timeout buka/baca HLS per kamera (ms, default: 3500)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Jumlah thread paralel saat mengambil stream HLS (default: 6)",
    )
    parser.add_argument(
        "--skip-known-bad",
        action="store_true",
        help="Lewati kamera yang sudah pernah masuk daftar cctv_jelek",
    )
    parser.add_argument(
        "--no-rotate",
        action="store_true",
        help="Selalu mulai dari kamera urutan pertama (matikan rotasi round-robin)",
    )
    add_budget_args(parser)
    return parser.parse_args()


def slugify(text: str, max_len: int = 38) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return (clean or "cam")[:max_len]


def parse_manual_roi(raw: str) -> list[list[float]] | None:
    if not raw.strip():
        return None
    parts = [float(p.strip()) for p in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("--roi harus berisi 4 angka: x1,y1,x2,y2 (rentang 0..1)")
    x1, y1, x2, y2 = [max(0.0, min(1.0, v)) for v in parts]
    if x2 <= x1 or y2 <= y1:
        raise ValueError("--roi tidak valid: pastikan x2 > x1 dan y2 > y1")
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def apply_roi_to_frame(
    frame: np.ndarray,
    roi_polygon: list[list[float]] | None,
    mode: str = "crop",
    margin_ratio: float = 0.03,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Terapkan ROI polygon ternormalisasi (0..1) pada frame CCTV."""
    h, w = frame.shape[:2]
    if mode == "full" or not roi_polygon or len(roi_polygon) < 3:
        return frame, {
            "mode": "full",
            "applied": False,
            "crop_box_px": [0, 0, w, h],
            "orig_size": [w, h],
        }

    pts_px = np.array(
        [[int(round(max(0.0, min(1.0, float(p[0]))) * w)), int(round(max(0.0, min(1.0, float(p[1]))) * h))] for p in roi_polygon],
        dtype=np.int32,
    )

    if mode == "mask":
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [pts_px], 255)
        masked = cv2.bitwise_and(frame, frame, mask=mask)
        return masked, {
            "mode": "mask",
            "applied": True,
            "polygon_norm": roi_polygon,
            "crop_box_px": [0, 0, w, h],
            "orig_size": [w, h],
        }

    # Mode "crop": potong frame ke bounding box poligon ROI + margin aman
    xs = pts_px[:, 0]
    ys = pts_px[:, 1]
    pad_x = int(round(w * margin_ratio))
    pad_y = int(round(h * margin_ratio))
    x1 = max(0, int(xs.min()) - pad_x)
    y1 = max(0, int(ys.min()) - pad_y)
    x2 = min(w, int(xs.max()) + pad_x)
    y2 = min(h, int(ys.max()) + pad_y)

    # Hindari crop terlalu kecil/korup
    if (x2 - x1) < 160 or (y2 - y1) < 120:
        return frame, {
            "mode": "full_fallback_tiny_roi",
            "applied": False,
            "crop_box_px": [0, 0, w, h],
            "orig_size": [w, h],
        }

    cropped = frame[y1:y2, x1:x2].copy()
    return cropped, {
        "mode": "crop",
        "applied": True,
        "polygon_norm": roi_polygon,
        "crop_box_px": [x1, y1, x2, y2],
        "crop_size": [x2 - x1, y2 - y1],
        "orig_size": [w, h],
    }


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
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    cameras = raw.get("cameras", []) if isinstance(raw, dict) else raw
    q = city_filter.strip().lower()
    city_priority = {
        "Kota Jakarta Pusat": 0,
        "Kota Semarang": 1,
        "Kota Bandung": 2,
        "Kota Yogyakarta": 3,
    }
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


def select_round_cameras(
    cameras: list[dict[str, Any]],
    max_cameras: int,
    start_cursor: int = 0,
    skip_ids: set[str] | None = None,
    rotate: bool = True,
) -> tuple[list[dict[str, Any]], int]:
    """Pilih batch kamera untuk putaran saat ini dengan rotasi round-robin agar seluruh katalog terjangkau."""
    if max_cameras <= 0 or not cameras:
        return [], 0

    skip = skip_ids or set()
    eligible = [c for c in cameras if str(c.get("id", "")) not in skip]
    if not eligible:
        return [], 0

    total = len(eligible)
    limit = min(max_cameras, total)
    if not rotate:
        return eligible[:limit], 0

    start = start_cursor % total
    selected = [eligible[(start + i) % total] for i in range(limit)]
    next_cursor = (start + limit) % total
    return selected, next_cursor


def main() -> int:
    args = parse_args()
    manual_roi = parse_manual_roi(args.roi) if args.roi else None
    cameras = load_cameras(args.catalog, args.city)
    if not cameras:
        print("Tidak ada kamera HLS yang cocok dengan filter.")
        return 1

    raw_roi_dir = args.out_dir / "raw_roi_captures"
    raw_roi_dir.mkdir(parents=True, exist_ok=True)

    quality_report_path = args.out_dir / "camera_quality_report.json"
    budget = budget_from_args(args, args.out_dir, cameras)

    round_num = 1
    try:
        while True:
            report = load_json_safe(
                quality_report_path,
                {"updated_at": None, "round_cursor": 0, "summary": {}, "cctv_bagus": {}, "cctv_jelek": {}},
            )
            known_bad = set(report.get("cctv_jelek", {}).keys())
            skip_ids = known_bad if args.skip_known_bad else None
            cursor = int(report.get("round_cursor", 0) or 0)
            if budget.enabled:
                # Prioritas kamera dengan frame paling sedikit; kamera penuh / dalam jeda dilewati
                batch, bstat = budget.pick(cameras, args.max_cameras, skip_ids=skip_ids)
                next_cursor = cursor
                print(
                    f"[Budget] siap={bstat['ok']} | penuh={bstat['full']} | jeda-antar-frame={bstat['gap']} | "
                    f"jeda-retry={bstat['retry']} | menyerah={bstat['gave_up']} | dilewati-jelek={bstat['skipped_bad']}"
                )
                if not batch:
                    if not budget.has_future_work(cameras, skip_ids):
                        print("[Budget] Semua kamera sudah penuh / tidak menghasilkan frame. Panen selesai.")
                        break
                    if args.once:
                        print("[Budget] Tidak ada kamera yang siap saat ini (semua dalam jeda).")
                        break
                    print(f"[Budget] Semua kamera dalam jeda, menunggu {args.interval_sec} detik...")
                    time.sleep(args.interval_sec)
                    continue
            else:
                batch, next_cursor = select_round_cameras(
                    cameras=cameras,
                    max_cameras=args.max_cameras,
                    start_cursor=cursor,
                    skip_ids=skip_ids,
                    rotate=not args.no_rotate,
                )
            report["round_cursor"] = next_cursor

            checked = len(batch)
            saved_good = 0
            bad_count = 0
            offline_count = 0
            worker_count = max(1, min(16, int(args.workers)))

            print(
                f"\n[Capture ROI Putaran #{round_num}] Batch={checked} kamera (cursor={cursor}->{next_cursor}, "
                f"workers={worker_count}) | roi_mode={args.roi_mode} | interval={args.interval_sec}s"
            )

            with ThreadPoolExecutor(max_workers=worker_count) as pool:
                frames = list(
                    pool.map(lambda c: grab_hls_frame(str(c["stream_url"]), args.timeout_ms), batch)
                )

            for idx, (cam, frame) in enumerate(zip(batch, frames), start=1):
                cam_id = str(cam.get("id", "cam"))
                cam_name = str(cam.get("name", cam_id))
                cam_city = str(cam.get("city", "-"))
                now_iso = datetime.now(timezone.utc).isoformat()
                ts_tag = datetime.now().strftime("%Y%m%d_%H%M%S")
                stem = f"{slugify(cam_city, 14)}_{slugify(cam_id, 34)}_{ts_tag}"

                if frame is None:
                    offline_count += 1
                    report["cctv_jelek"][cam_id] = {
                        "id": cam_id,
                        "name": cam_name,
                        "city": cam_city,
                        "category": "offline_or_timeout",
                        "reason": "Stream HLS offline atau timeout",
                        "checked_at": now_iso,
                    }
                    print(f"  [{idx:02d}] OFFLINE | {cam_city} | {cam_name}")
                    budget.record_attempt(cam_id, None)
                    continue

                # Cek kualitas frame asli sebelum crop (tanpa simpan sampel gambar jelek ke disk)
                qres = assess_frame_quality(frame)
                if not qres.is_good:
                    bad_count += 1
                    report["cctv_jelek"][cam_id] = {
                        "id": cam_id,
                        "name": cam_name,
                        "city": cam_city,
                        "category": qres.category,
                        "reason": qres.reason,
                        "metrics": qres.to_dict(),
                        "checked_at": now_iso,
                    }
                    print(f"  [{idx:02d}] JELEK   | {cam_city} | {cam_name} ({qres.category})")
                    budget.record_attempt(cam_id, None)
                    continue

                # Tentukan poligon ROI: override manual -> roi_polygon katalog -> opsional default area bawah
                roi_poly = manual_roi or cam.get("roi_polygon")
                if not roi_poly and args.default_bottom_roi:
                    roi_poly = [[0.0, 0.35], [1.0, 0.35], [1.0, 1.0], [0.0, 1.0]]

                processed, roi_info = apply_roi_to_frame(frame, roi_poly, mode=args.roi_mode)
                img_path = raw_roi_dir / f"{stem}.jpg"
                meta_path = raw_roi_dir / f"{stem}.meta.json"

                cv2.imwrite(str(img_path), processed, [cv2.IMWRITE_JPEG_QUALITY, 93])
                save_json(
                    meta_path,
                    {
                        "captured_at": now_iso,
                        "camera_id": cam_id,
                        "camera_name": cam_name,
                        "city": cam_city,
                        "facility_category": cam.get("facility_category"),
                        "roi": roi_info,
                        "quality": qres.to_dict(),
                    },
                )

                report["cctv_bagus"][cam_id] = {
                    "id": cam_id,
                    "name": cam_name,
                    "city": cam_city,
                    "resolution": f"{qres.width}x{qres.height}",
                    "roi_applied": roi_info["applied"],
                    "last_capture": str(img_path.relative_to(args.out_dir)),
                    "checked_at": now_iso,
                }
                report["cctv_jelek"].pop(cam_id, None)
                saved_good += 1
                budget.record_attempt(cam_id, stem)
                roi_tag = f"ROI:{roi_info['mode']}"
                frame_tag = (
                    f", frame {budget.frames_of(cam_id)}/{budget.max_frames}" if budget.enabled else ""
                )
                print(
                    f"  [{idx:02d}] SIMPAN  | {cam_city} | {cam_name} "
                    f"[{roi_tag}, {processed.shape[1]}x{processed.shape[0]}{frame_tag}]"
                )

            report["updated_at"] = datetime.now(timezone.utc).isoformat()
            report["summary"] = {
                "total_cctv_bagus": len(report["cctv_bagus"]),
                "total_cctv_jelek": len(report["cctv_jelek"]),
            }
            save_json(quality_report_path, report)
            if budget.enabled:
                budget.save()

            print(
                f"[Selesai Putaran #{round_num}] Diperiksa={checked} | Tersimpan={saved_good} | "
                f"Jelek={bad_count} | Offline={offline_count} -> {raw_roi_dir}"
            )
            if budget.enabled:
                print("  " + budget.summary_line(cameras))

            if args.once:
                break
            round_num += 1
            print(f"Menunggu {args.interval_sec} detik (5 menit) sebelum putaran berikutnya... (Ctrl+C untuk berhenti)")
            time.sleep(args.interval_sec)
    except KeyboardInterrupt:
        if budget.enabled:
            budget.save()
        print("\nDihentikan oleh pengguna. Semua screenshot ROI aman tersimpan.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
