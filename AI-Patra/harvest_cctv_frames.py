"""
PETRA / PATRA — Active-Learning Live CCTV Frame Harvester (Prioritas 2 & 3).

Mengambil 1 frame nyata per kamera HLS publik dari `AI-Patra/cctv_catalog/cctv_snapshot.json`
(memprioritaskan DKI Jakarta & kota besar Indonesia, dan MENOLAK seluruh kamera yang
lokasinya beririsan dengan kamera `valid/` atau `test/` agar 0% camera leakage).

Setiap frame langsung dijalankan melalui `AI-Patra/model/best_patra_highangle.onnx` lalu
disimpan ke folder STAGING (`AI-Patra/dataset/staging_harvest/`, BUKAN langsung ke `train/`):
- `flagged_fp_or_pkl/`: frame dengan deteksi `conf >= 0.20` (kandidat hard-negative FP pada
  mobil putih/motor/tong sampah/kanopi ATAU gerobak PKL nyata untuk dilabeli).
- `clean_negative/`   : frame lalu lintas padat dengan 0 deteksi (kandidat background negatif).
- `flagged_gallery.jpg` & `clean_gallery.jpg`: contact sheet bernomor untuk verifikasi visual
  sebelum ada 1 pun gambar yang dipromosikan ke `train/`.

Penggunaan:
  python AI-Patra/harvest_cctv_frames.py --target-frames 45
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from audit_prediction_errors import make_grid  # noqa: E402
from evaluate_models import decode_onnx_with_scores, detect_onnx_input_size  # noqa: E402
from prepare_dataset import DATASET_DIR, IMG_EXTS, extract_camera_group  # noqa: E402
from verify_onnx import letterbox  # noqa: E402

CATALOG_PATH = AI_ROOT / "cctv_catalog" / "cctv_snapshot.json"
DEFAULT_MODEL = AI_ROOT / "model" / "best_patra_highangle.onnx"
DEFAULT_STAGING = DATASET_DIR / "staging_harvest"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Harvest live CCTV frames for hard-negative & PKL active learning")
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_STAGING)
    parser.add_argument("--target-frames", type=int, default=45, help="Target jumlah frame live unik (default: 45)")
    parser.add_argument("--max-attempts", type=int, default=140, help="Batas maksimal kamera yang dicoba (default: 140)")
    parser.add_argument("--conf", type=float, default=0.20, help="Threshold flag aktif (default: 0.20)")
    parser.add_argument("--timeout-ms", type=int, default=5500, help="Timeout open/read HLS per kamera (ms)")
    return parser.parse_args()


def collect_protected_street_tokens(dataset_dir: Path) -> set[str]:
    """Kumpulkan kata kunci nama jalan/kamera pada `valid/` & `test/` agar 0% kebocoran lokasi."""
    stop = {
        "jl", "jpo", "c01", "c02", "c03", "c04", "cctv", "01", "02", "03", "04",
        "jkt", "jku", "jks", "jkp", "jkb", "dishub", "bpbd", "kesbangpol", "stasiun",
        "raya", "selatan", "utara", "barat", "timur", "pusat", "noncctv", "sep", "ii", "viii", "dr",
    }
    tokens: set[str] = set()
    for split in ("valid", "test"):
        img_dir = dataset_dir / split / "images"
        if not img_dir.exists():
            continue
        for p in img_dir.iterdir():
            if not p.is_file() or p.suffix.lower() not in IMG_EXTS:
                continue
            cam = extract_camera_group(p.stem).lower()
            for tok in re.split(r"[^a-z0-9]+", cam):
                if len(tok) >= 4 and not tok.isdigit() and tok not in stop:
                    tokens.add(tok)
    return tokens


def camera_conflicts_with_protected(cam: dict[str, Any], protected_tokens: set[str]) -> bool:
    text = f"{cam.get('id', '')} {cam.get('name', '')} {cam.get('region', '')}".lower()
    words = set(re.split(r"[^a-z0-9]+", text))
    return bool(words & protected_tokens)


def grab_single_hls_frame(url: str, timeout_ms: int) -> np.ndarray | None:
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"timeout;{timeout_ms * 1000}|stimeout;{timeout_ms * 1000}"
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
    if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)

    if not cap.isOpened():
        cap.release()
        return None

    frame = None
    # Baca hingga 3 frame agar mendapat keyframe yang bersih (bukan frame awal korup)
    for _ in range(3):
        ok, f = cap.read()
        if ok and f is not None and f.size > 0:
            frame = f
    cap.release()

    if frame is None:
        return None
    h, w = frame.shape[:2]
    if h < 240 or w < 320:
        return None
    # Tolak frame hitam/putih polos atau error screen statis
    if float(np.std(frame)) < 14.0:
        return None
    return frame


def render_tile(frame: np.ndarray, dets: list[dict[str, Any]], label: str) -> np.ndarray:
    im = frame.copy()
    for d in dets:
        x1, y1, x2, y2 = [int(round(v)) for v in d["bbox"]]
        cv2.rectangle(im, (x1, y1), (x2, y2), (40, 40, 255), 2)
        cv2.putText(
            im,
            f"PKL {d['score']:.2f}",
            (x1, max(16, y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (60, 60, 255),
            2,
            cv2.LINE_AA,
        )
    h, w = im.shape[:2]
    tw = 360
    th = int(round(h * (tw / float(w))))
    im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
    out = np.full((th + 26, tw, 3), 22, dtype=np.uint8)
    out[26:, :] = im
    cv2.putText(out, label[:48], (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (235, 235, 235), 1, cv2.LINE_AA)
    return out


def main() -> int:
    args = parse_args()
    if not args.catalog.exists():
        raise FileNotFoundError(f"Catalog tidak ditemukan: {args.catalog}")

    with open(args.catalog, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    cameras = catalog.get("cameras", [])
    protected = collect_protected_street_tokens(DATASET_DIR)

    # Prioritaskan Jakarta -> Bandung -> Semarang -> Yogyakarta -> kota lainnya
    city_priority = {
        "Kota Jakarta Pusat": 0,
        "Kota Jakarta Selatan": 1,
        "Kota Jakarta Barat": 2,
        "Kota Jakarta Timur": 3,
        "Kota Jakarta Utara": 4,
        "Kota Bandung": 5,
        "Kota Semarang": 6,
        "Kota Yogyakarta": 7,
    }
    eligible = [
        c for c in cameras
        if c.get("stream_type") == "hls"
        and c.get("stream_url")
        and not camera_conflicts_with_protected(c, protected)
    ]
    eligible.sort(key=lambda c: (city_priority.get(c.get("city", ""), 99), c.get("id", "")))

    flagged_dir = args.out_dir / "flagged_fp_or_pkl"
    clean_dir = args.out_dir / "clean_negative"
    for d in (args.out_dir, flagged_dir, clean_dir):
        d.mkdir(parents=True, exist_ok=True)

    sess = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    imgsz = detect_onnx_input_size(sess, 0)

    flagged_tiles: list[np.ndarray] = []
    clean_tiles: list[np.ndarray] = []
    manifest: list[dict[str, Any]] = []
    captured = 0
    attempts = 0
    flagged_n = 0
    clean_n = 0

    print(
        f"[1/3] Memulai panen frame CCTV live (target={args.target_frames}, kandidat aman={len(eligible)}, "
        f"protected tokens={len(protected)})..."
    )

    for cam in eligible:
        if captured >= args.target_frames or attempts >= args.max_attempts:
            break
        attempts += 1
        cam_id = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(cam.get("id", f"cam_{attempts}")))
        url = str(cam["stream_url"])

        frame = grab_single_hls_frame(url, args.timeout_ms)
        if frame is None:
            continue

        captured += 1
        orig_h, orig_w = frame.shape[:2]
        padded, scale, pad_left, pad_top = letterbox(frame, imgsz)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...])
        raw_out = sess.run(None, {inp.name: blob})[0]
        dets = decode_onnx_with_scores(
            raw_out, orig_w, orig_h, scale, pad_left, pad_top,
            conf_thresh=args.conf, iou_nms=0.45, max_det=50,
        )

        if dets:
            flagged_n += 1
            tag = f"FL#{flagged_n:02d}"
            fname = f"hv_{tag.replace('#', '')}_{cam_id[:36]}.jpg"
            save_path = flagged_dir / fname
            cv2.imwrite(str(save_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            flagged_tiles.append(
                render_tile(frame, dets, f"{tag} det={len(dets)} | {cam.get('city', '')[:12]} | {cam.get('name', '')[:16]}")
            )
            bucket = "flagged_fp_or_pkl"
        else:
            clean_n += 1
            tag = f"CL#{clean_n:02d}"
            fname = f"hv_{tag.replace('#', '')}_{cam_id[:36]}.jpg"
            save_path = clean_dir / fname
            cv2.imwrite(str(save_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            clean_tiles.append(
                render_tile(frame, [], f"{tag} 0-det | {cam.get('city', '')[:12]} | {cam.get('name', '')[:18]}")
            )
            bucket = "clean_negative"

        manifest.append(
            {
                "tag": tag,
                "bucket": bucket,
                "filename": fname,
                "camera_id": cam.get("id"),
                "camera_name": cam.get("name"),
                "city": cam.get("city"),
                "resolution": f"{orig_w}x{orig_h}",
                "num_dets": len(dets),
                "max_conf": round(max((d["score"] for d in dets), default=0.0), 3),
                "dets": [
                    {"score": round(d["score"], 3), "bbox": [round(float(v), 1) for v in d["bbox"]]}
                    for d in dets
                ],
            }
        )
        print(f"      [{captured:02d}/{args.target_frames}] {tag} ({bucket}) <- {cam.get('city')} | {cam.get('name')} (dets={len(dets)})")

    print("[2/3] Menyusun galeri visual staging untuk inspeksi manual...")
    g_flag = make_grid(flagged_tiles, cols=4)
    if g_flag is not None:
        cv2.imwrite(str(args.out_dir / "flagged_gallery.jpg"), g_flag, [cv2.IMWRITE_JPEG_QUALITY, 88])
    g_clean = make_grid(clean_tiles, cols=4)
    if g_clean is not None:
        cv2.imwrite(str(args.out_dir / "clean_gallery.jpg"), g_clean, [cv2.IMWRITE_JPEG_QUALITY, 88])

    with open(args.out_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "attempts": attempts,
                "captured": captured,
                "flagged_fp_or_pkl": flagged_n,
                "clean_negative": clean_n,
                "items": manifest,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(
        f"[3/3] Selesai! Captured={captured} dari {attempts} percobaan "
        f"(flagged={flagged_n}, clean_negative={clean_n}) -> {args.out_dir}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
