"""Audit seluruh gambar & label YOLO di AI-Patra/dataset/* dan CCTV-Harvester/output/dataset_pkl via Gemini Vision."""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
sys.path.insert(0, str(REPO_ROOT / "CCTV-Harvester"))

from config import CLASS_COLORS_BGR, YOLO_CLASS_NAMES, get_gemini_api_key, get_gemini_model_chain  # noqa: E402
from gemini_rate import gemini_post, max_rpm, retry_after_sec  # noqa: E402  (< 15 RPM bersama)

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_CACHE_PATH = AI_ROOT / ".audit_cache" / "audit_results.jsonl"

AUDIT_PROMPT = """Kamu adalah auditor ahli dataset computer vision CCTV high-angle untuk deteksi Pedagang Kaki Lima (PKL) di Indonesia.

Gambar ini sudah digambari kotak anotasi berlabel nomor `#0`, `#1`, dst (jika ada).
Daftar anotasi pada gambar ini:
{box_list}

Tugasmu:
1. Nilai apakah gambar ini valid sebagai gambar CCTV sudut tinggi/jalan umum (`is_valid_cctv`):
   - `camera_angle`:
     - "high_angle_cctv": kamera CCTV/pengawas jalan raya/trotoar dari sudut tinggi atau agak tinggi (termasuk CCTV Dishub/JakCCTV/kota).
     - "street_level_or_web": foto berita/kamera HP sudut rendah setinggi mata manusia, bukan CCTV high-angle.
     - "closeup_non_cctv": foto close-up 1 objek memenuhi layar (bukan CCTV).
     - "corrupt_or_unusable": gambar rusak/gelap total/buram parah/tidak relevan.
   - `is_valid_cctv` = true HANYA jika `camera_angle == "high_angle_cctv"` dan `image_quality == "good"`.
2. Untuk SETIAP kotak bernomor `#idx` pada daftar di atas, evaluasi dengan KETAT:
   - "valid": benar-benar objek PKL (pedagang kaki lima) sesuai kelasnya dan kotaknya cukup tepat.
   - "false_positive": BUKAN PKL! Contoh false positive umum: pejalan kaki biasa membawa payung hujan, sepeda motor/mobil biasa, tong sampah, kanopi/atap permanen toko/halte, tiang rambu, pohon, bayangan, orang lewat tanpa dagangan.
   - "wrong_class": benar PKL, tetapi kelasnya salah (mis. Gerobak dilabeli Terpal, atau Emperan dilabeli Payung).
   - "bad_bbox": objek PKL ada, tapi kotak jauh meleset/terlalu besar mencakup jalan kosong.
   - `suggested_class`: salah satu dari ["Emperan", "Gerobak", "Panggul", "Payung", "Terpal", "none"] ("none" jika false_positive).
3. Cek apakah ada objek PKL nyata (khususnya Gerobak atau Emperan/lapak PKL) yang JELAS terlihat tetapi belum diberi kotak sama sekali (`missed_pkl_count`).

Balas HANYA JSON valid tanpa markdown fence:
{{
  "is_valid_cctv": true,
  "camera_angle": "high_angle_cctv",
  "image_quality": "good",
  "image_note": "alasan singkat",
  "boxes": [
    {{"idx": 0, "verdict": "valid", "suggested_class": "Gerobak", "reason": "gerobak PKL jelas di trotoar"}}
  ],
  "missed_pkl_count": 0,
  "missed_pkl_note": ""
}}
Jika tidak ada kotak anotasi (gambar background 0 box), isi "boxes": []."""


def read_yolo_boxes(lbl_path: Path) -> list[dict[str, Any]]:
    boxes: list[dict[str, Any]] = []
    if not lbl_path.exists():
        return boxes
    for raw in lbl_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = raw.strip()
        if not s:
            continue
        parts = s.split()
        if len(parts) < 5:
            continue
        cid = int(float(parts[0]))
        cx, cy, w, h = [float(x) for x in parts[1:5]]
        cname = YOLO_CLASS_NAMES[cid] if 0 <= cid < len(YOLO_CLASS_NAMES) else f"cls_{cid}"
        boxes.append({"idx": len(boxes), "class_id": cid, "class_name": cname, "cx": cx, "cy": cy, "w": w, "h": h})
    return boxes


def draw_numbered_boxes(img: np.ndarray, boxes: list[dict[str, Any]]) -> np.ndarray:
    vis = img.copy()
    h, w = vis.shape[:2]
    if max(h, w) < 640:
        scale = 640.0 / max(h, w)
        vis = cv2.resize(vis, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_LINEAR)
        h, w = vis.shape[:2]
    elif max(h, w) > 1024:
        scale = 1024.0 / max(h, w)
        vis = cv2.resize(vis, (int(round(w * scale)), int(round(h * scale))), interpolation=cv2.INTER_AREA)
        h, w = vis.shape[:2]

    for b in boxes:
        x1 = max(0, int(round((b["cx"] - b["w"] / 2.0) * w)))
        y1 = max(0, int(round((b["cy"] - b["h"] / 2.0) * h)))
        x2 = min(w - 1, int(round((b["cx"] + b["w"] / 2.0) * w)))
        y2 = min(h - 1, int(round((b["cy"] + b["h"] / 2.0) * h)))
        color = CLASS_COLORS_BGR.get(b["class_id"], (0, 0, 255))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        tag = f"#{b['idx']}:{b['class_name'][:3]}"
        (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        ty = y1 - 3 if y1 > th + 6 else min(h - 3, y2 + th + 4)
        tx = max(0, min(w - tw - 4, x1))
        cv2.rectangle(vis, (tx, ty - th - 3), (tx + tw + 4, ty + 2), color, -1)
        cv2.putText(vis, tag, (tx + 2, ty - 1), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    return vis


def parse_json_loose(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if m:
        cleaned = m.group(1)
    else:
        s, e = cleaned.find("{"), cleaned.rfind("}")
        if s != -1 and e > s:
            cleaned = cleaned[s : e + 1]
    return json.loads(cleaned)


def audit_one(
    item: dict[str, Any],
    api_key: str,
    model_chain: list[str],
    delay_sec: float,
) -> dict[str, Any]:
    img_path = Path(item["img_path"])
    lbl_path = Path(item["lbl_path"])
    boxes = read_yolo_boxes(lbl_path)
    img = cv2.imread(str(img_path))
    if img is None:
        return {
            "key": item["key"],
            "source": item["source"],
            "split": item["split"],
            "filename": img_path.name,
            "error": "cv2_unreadable",
            "is_valid_cctv": False,
            "camera_angle": "corrupt_or_unusable",
            "boxes_gt": boxes,
            "boxes_audit": [],
        }

    h_orig, w_orig = img.shape[:2]
    vis = draw_numbered_boxes(img, boxes)
    ok, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 84])
    if not ok:
        raise RuntimeError(f"Encode failed: {img_path}")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    if boxes:
        box_lines = [
            f"- #{b['idx']}: kelas={b['class_name']} (pusat x={b['cx']:.2f}, y={b['cy']:.2f}, luas={b['w']*b['h']*100:.2f}% frame)"
            for b in boxes
        ]
        box_list_str = "\n".join(box_lines)
    else:
        box_list_str = "(Tidak ada kotak anotasi — ini adalah gambar background negatif 0 PKL)"

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": AUDIT_PROMPT.format(box_list=box_list_str)},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ],
            }
        ],
        "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
    }

    last_err = ""
    for model in model_chain:
        url = GEMINI_URL.format(model=model)
        for attempt in range(3):
            try:
                resp = gemini_post(url, api_key, payload, timeout=40)
            except requests.RequestException as exc:
                last_err = f"{model} net: {exc}"
                time.sleep(1.5 * (attempt + 1))
                continue

            if resp.status_code == 200:
                try:
                    body = resp.json()
                    parts = (body["candidates"][0]["content"].get("parts") or [])
                    raw_text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict))
                    parsed = parse_json_loose(raw_text)
                    if delay_sec > 0:
                        time.sleep(delay_sec)
                    return {
                        "key": item["key"],
                        "source": item["source"],
                        "split": item["split"],
                        "filename": img_path.name,
                        "resolution": [w_orig, h_orig],
                        "model_used": model,
                        "is_valid_cctv": bool(parsed.get("is_valid_cctv", True)),
                        "camera_angle": str(parsed.get("camera_angle", "high_angle_cctv")),
                        "image_quality": str(parsed.get("image_quality", "good")),
                        "image_note": str(parsed.get("image_note", "")),
                        "boxes_gt": boxes,
                        "boxes_audit": parsed.get("boxes", []),
                        "missed_pkl_count": int(parsed.get("missed_pkl_count", 0) or 0),
                        "missed_pkl_note": str(parsed.get("missed_pkl_note", "")),
                    }
                except Exception as exc:
                    last_err = f"{model} parse_err: {exc}"
                    time.sleep(1.0)
                    continue

            if resp.status_code in (429, 500, 503):
                last_err = f"{model} HTTP {resp.status_code}: {resp.text[:140]}"
                time.sleep(retry_after_sec(resp, 5.0 * (attempt + 1)))
                continue

            last_err = f"{model} HTTP {resp.status_code}: {resp.text[:140]}"
            break

    return {
        "key": item["key"],
        "source": item["source"],
        "split": item["split"],
        "filename": img_path.name,
        "resolution": [w_orig, h_orig],
        "error": last_err,
        "boxes_gt": boxes,
        "boxes_audit": [],
    }


def collect_items() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for sp in ("train", "valid", "test"):
        img_dir = AI_ROOT / "dataset" / sp / "images"
        lbl_dir = AI_ROOT / "dataset" / sp / "labels"
        if not img_dir.exists():
            continue
        for p in sorted(img_dir.iterdir()):
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                items.append({
                    "key": f"ai_patra/{sp}/{p.stem}",
                    "source": "ai_patra",
                    "split": sp,
                    "img_path": str(p),
                    "lbl_path": str(lbl_dir / f"{p.stem}.txt"),
                })

    h_img = REPO_ROOT / "CCTV-Harvester" / "output" / "dataset_pkl" / "images"
    h_lbl = REPO_ROOT / "CCTV-Harvester" / "output" / "dataset_pkl" / "labels"
    if h_img.exists():
        for p in sorted(h_img.iterdir()):
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                items.append({
                    "key": f"harvester/dataset_pkl/{p.stem}",
                    "source": "harvester",
                    "split": "dataset_pkl",
                    "img_path": str(p),
                    "lbl_path": str(h_lbl / f"{p.stem}.txt"),
                })
    return items


def print_summary(cache_path: Path) -> None:
    recs: dict[str, dict[str, Any]] = {}
    err_keys: set[str] = set()
    if cache_path.exists():
        for ln in cache_path.read_text(encoding="utf-8").splitlines():
            if not ln.strip():
                continue
            r = json.loads(ln)
            if "error" in r:
                err_keys.add(r["key"])
            else:
                recs[r["key"]] = r
                err_keys.discard(r["key"])

    print("\n================ GEMINI AUDIT SUMMARY ================")
    print(f"Total valid audited : {len(recs)} | Remaining errors: {len(err_keys)}")
    angles = Counter(r.get("camera_angle") for r in recs.values())
    invalid_imgs = [r for r in recs.values() if not r.get("is_valid_cctv", True)]
    print(f"Camera angles       : {dict(angles)}")
    print(f"Invalid / Non-CCTV  : {len(invalid_imgs)}")
    for r in invalid_imgs[:20]:
        print(f"  - [{r['source']}/{r['split']}] {r['filename']} ({r.get('camera_angle')}, {r.get('image_quality')}): {r.get('image_note','')[:90]}")

    cls_verdicts: dict[str, Counter] = defaultdict(Counter)
    for r in recs.values():
        gt_map = {b["idx"]: b for b in r.get("boxes_gt", [])}
        for ba in r.get("boxes_audit", []):
            idx = ba.get("idx")
            if idx in gt_map:
                cls_verdicts[gt_map[idx]["class_name"]][ba.get("verdict", "unknown")] += 1

    print("\nPer-class verdict breakdown:")
    for cname, cnt in sorted(cls_verdicts.items()):
        tot = sum(cnt.values())
        fp = cnt["false_positive"] + cnt["bad_bbox"]
        print(
            f"  {cname:10s}: total={tot:4d} | valid={cnt['valid']:4d} ({100*cnt['valid']/max(1,tot):5.1f}%) | "
            f"FP+bad={fp:4d} ({100*fp/max(1,tot):5.1f}%) | wrong_cls={cnt['wrong_class']:3d}"
        )
    print("======================================================\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Audit gambar & label AI-Patra + CCTV-Harvester via Gemini Vision")
    ap.add_argument("--out", type=Path, default=DEFAULT_CACHE_PATH)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--delay", type=float, default=0.15)
    ap.add_argument("--summary-only", action="store_true")
    args = ap.parse_args()

    if args.summary_only:
        print_summary(args.out)
        return 0

    api_key = get_gemini_api_key()
    model_chain = get_gemini_model_chain()
    items = collect_items()

    done: dict[str, dict[str, Any]] = {}
    if args.out.exists():
        for ln in args.out.read_text(encoding="utf-8").splitlines():
            if not ln.strip():
                continue
            try:
                rec = json.loads(ln)
                if "error" not in rec:
                    done[rec["key"]] = rec
            except Exception:
                pass

    todo = [it for it in items if it["key"] not in done]
    print(f"Model chain : {model_chain}")
    print(f"Total images: {len(items)} | Already audited (resumed): {len(done)} | Remaining: {len(todo)}")

    if todo:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        lock = threading.Lock()
        t0 = time.time()
        completed = 0
        errors = 0
        try:
            with open(args.out, "a", encoding="utf-8") as fout:
                with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
                    futs = {pool.submit(audit_one, it, api_key, model_chain, args.delay): it for it in todo}
                    for fut in as_completed(futs):
                        rec = fut.result()
                        with lock:
                            fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
                            fout.flush()
                            completed += 1
                            if "error" in rec:
                                errors += 1
                            if completed % 10 == 0 or completed == len(todo):
                                elapsed = time.time() - t0
                                rate = completed / max(0.1, elapsed)
                                eta = (len(todo) - completed) / max(0.01, rate)
                                print(
                                    f"  [{len(done)+completed:3d}/{len(items)}] err={errors} | "
                                    f"{rate:.2f} img/s | ETA={eta:.0f}s | {rec.get('model_used','ERR')} {rec['filename'][:45]}",
                                    flush=True,
                                )
        except KeyboardInterrupt:
            print("\nDihentikan sementara (progres aman tersimpan — jalankan lagi untuk resume).")

    print_summary(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
