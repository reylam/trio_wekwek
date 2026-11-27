"""
PATRA — Gabungkan hasil CCTV-Harvester ke dataset TANPA mengacak ulang split.

Berbeda dengan `curate_and_merge_dataset.py` (yang menjalankan ulang split penuh sehingga test set
berubah), skrip ini:
- Menyalin gambar+label harvester HANYA ke `dataset/train/` (k-fold `kfold_camera.py make` akan
  membagi kamera baru ke semua fold secara otomatis).
- Menolak kamera yang sudah ada di `valid/` atau `test/` (cegah camera leakage ke evaluasi).
- Menegakkan batas frame per kamera (default 5) TERMASUK frame yang sudah ada di dataset,
  memilih frame dengan selang waktu terjauh (variasi siang/malam).
- Opsional menyertakan frame negatif (0 PKL) dari `label_with_gemini.py --include-empty`.
- Default DRY RUN. Semua file yang disalin dicatat di `curation/harvest_merge_log.csv`.

Penggunaan (dari root repo):
  python AI-Patra/merge_harvest.py                                   # dry run
  python AI-Patra/merge_harvest.py --apply
  python AI-Patra/merge_harvest.py --apply --include-negatives --max-neg-ratio 0.35
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from prepare_dataset import DATASET_DIR, IMG_EXTS, extract_camera_group

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
HARVEST_PKL = REPO_ROOT / "CCTV-Harvester" / "output" / "dataset_pkl"
HARVEST_NEG = REPO_ROOT / "CCTV-Harvester" / ".state" / "dataset_negatif_bersih"
QUAR_DIR = AI_ROOT / "dataset_quarantine" / "needs_relabel"
LOG_PATH = AI_ROOT / "curation" / "harvest_merge_log.csv"
_TS = re.compile(r"_(20\d{6})_?(\d{6})")


def ts_of(stem: str) -> datetime | None:
    m = _TS.search(stem)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    except ValueError:
        return None


def list_pairs(root: Path) -> list[tuple[Path, Path]]:
    img_dir, lbl_dir = root / "images", root / "labels"
    if not img_dir.exists():
        return []
    pairs = []
    for img in sorted(img_dir.iterdir()):
        if img.suffix.lower() in IMG_EXTS:
            lbl = lbl_dir / f"{img.stem}.txt"
            pairs.append((img, lbl))
    return pairs


def valid_label(lbl: Path) -> bool:
    """Label YOLO 5 kolom, kelas 0/1, koordinat 0..1. File kosong/tidak ada = negatif (valid)."""
    if not lbl.exists():
        return True
    for ln in lbl.read_text(encoding="utf-8").splitlines():
        parts = ln.split()
        if not parts:
            continue
        if len(parts) != 5 or parts[0] not in ("0", "1"):
            return False
        vals = [float(v) for v in parts[1:]]
        if any(v < 0 or v > 1 for v in vals) or vals[2] <= 0 or vals[3] <= 0:
            return False
    return True


def spread_pick(stems: list[str], k: int, taken_ts: list[datetime]) -> list[str]:
    """Pilih <=k frame yang waktunya paling berjauhan satu sama lain & dari frame yang sudah ada."""
    chosen: list[str] = []
    pool = list(stems)
    anchors = list(taken_ts)
    while pool and len(chosen) < k:
        def score(s: str) -> float:
            t = ts_of(s)
            if t is None:
                return -1.0  # tanpa timestamp: pilihan terakhir
            if not anchors:
                return 0.0  # belum ada acuan: semua setara (ambil yang paling awal)
            return min(abs((t - a).total_seconds()) for a in anchors)
        best = max(pool, key=lambda s: (score(s), -pool.index(s)))
        pool.remove(best)
        chosen.append(best)
        t = ts_of(best)
        if t:
            anchors.append(t)
    return chosen


def main() -> int:
    ap = argparse.ArgumentParser(description="Merge CCTV-Harvester -> AI-Patra/dataset/train (tanpa re-split)")
    ap.add_argument("--apply", action="store_true", help="Salin file (default: dry run)")
    ap.add_argument("--max-frames-per-camera", type=int, default=5)
    ap.add_argument("--include-negatives", action="store_true", help="Sertakan frame 0-PKL dari --neg-dir")
    ap.add_argument("--neg-dir", type=Path, default=HARVEST_NEG)
    ap.add_argument("--pkl-dir", type=Path, default=HARVEST_PKL)
    ap.add_argument("--max-neg-ratio", type=float, default=0.35, help="Maks proporsi negatif di antara frame baru")
    args = ap.parse_args()

    # Kamera & frame yang sudah ada di dataset (+ karantina, agar tidak dianggap baru)
    split_of_cam: dict[str, set[str]] = defaultdict(set)
    existing: dict[str, list[datetime]] = defaultdict(list)
    existing_stems: set[str] = set()
    for sp in ("train", "valid", "test"):
        for root in (DATASET_DIR / sp / "images", QUAR_DIR / sp / "images"):
            if not root.exists():
                continue
            for p in root.iterdir():
                if p.suffix.lower() not in IMG_EXTS:
                    continue
                cam = extract_camera_group(p.stem)
                split_of_cam[cam].add(sp)
                existing_stems.add(p.stem)
                t = ts_of(p.stem)
                existing[cam].append(t) if t else existing[cam].append(datetime.min)

    candidates: dict[str, list[tuple[Path, Path, str]]] = defaultdict(list)
    rejected = defaultdict(int)
    sources = [("pkl", args.pkl_dir)] + ([("neg", args.neg_dir)] if args.include_negatives else [])
    for kind, root in sources:
        for img, lbl in list_pairs(root):
            if img.stem in existing_stems:
                rejected["sudah_ada"] += 1
                continue
            if kind == "pkl" and not (lbl.exists() and lbl.read_text(encoding="utf-8").strip()):
                rejected["pkl_tanpa_label"] += 1
                continue
            if not valid_label(lbl):
                rejected["label_rusak"] += 1
                continue
            cam = extract_camera_group(img.stem)
            if split_of_cam[cam] & {"valid", "test"}:
                rejected["kamera_di_valid_test"] += 1
                continue
            candidates[cam].append((img, lbl, kind))

    plan: list[tuple[str, Path, Path, str]] = []
    capped = 0
    for cam, items in candidates.items():
        room = args.max_frames_per_camera - len(existing.get(cam, []))
        if room <= 0:
            capped += len(items)
            continue
        by_stem = {i[0].stem: i for i in items}
        taken = [t for t in existing.get(cam, []) if t != datetime.min]
        for stem in spread_pick(sorted(by_stem), room, taken):
            img, lbl, kind = by_stem[stem]
            plan.append((cam, img, lbl, kind))
        capped += max(0, len(items) - room)

    pos = [x for x in plan if x[3] == "pkl"]
    neg = [x for x in plan if x[3] == "neg"]
    max_neg = int(len(pos) * args.max_neg_ratio / max(1e-6, 1 - args.max_neg_ratio))
    if len(neg) > max_neg:
        # Prioritaskan negatif dari kamera yang BELUM punya frame positif baru (keragaman latar)
        pos_cams = {x[0] for x in pos}
        neg.sort(key=lambda x: (x[0] in pos_cams, x[1].stem))
        neg = neg[:max_neg]
    plan = pos + neg

    new_cams = {x[0] for x in plan if x[0] not in split_of_cam}
    boxes = sum(len([l for l in x[2].read_text(encoding="utf-8").splitlines() if l.strip()])
                for x in plan if x[2].exists())
    print(f"Rencana: {len(plan)} gambar ({len(pos)} positif, {len(neg)} negatif) | {boxes} box | "
          f"{len({x[0] for x in plan})} kamera ({len(new_cams)} kamera BARU)")
    print(f"Ditolak: {dict(rejected)} | melebihi batas {args.max_frames_per_camera}/kamera: {capped}")

    if not args.apply:
        for cam, img, _, kind in plan[:15]:
            print(f"  [{kind}] {img.name[:90]}")
        print("DRY-RUN. Jalankan ulang dengan --apply untuk menyalin ke dataset/train/.")
        return 0

    dst_img = DATASET_DIR / "train" / "images"
    dst_lbl = DATASET_DIR / "train" / "labels"
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    new_log = not LOG_PATH.exists()
    with open(LOG_PATH, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_log:
            w.writerow(["merged_at", "camera_group", "image", "kind", "source"])
        now = datetime.now().isoformat(timespec="seconds")
        for cam, img, lbl, kind in plan:
            shutil.copy2(img, dst_img / img.name)
            target_lbl = dst_lbl / f"{img.stem}.txt"
            if lbl.exists():
                shutil.copy2(lbl, target_lbl)
            else:
                target_lbl.write_text("", encoding="utf-8")
            w.writerow([now, cam, img.name, kind, str(img.parent.parent)])
    print(f"[OK] {len(plan)} gambar disalin ke dataset/train/. Log: {LOG_PATH}")
    print("Berikutnya: python AI-Patra/prepare_dataset.py --verify ; python AI-Patra/kfold_camera.py make")
    return 0


if __name__ == "__main__":
    sys.exit(main())
