"""
PETRA / PATRA — Build Focused Low-FP Dataset `dataset_v3_gerobak` (Skip Payung & Terpal).

Menjaga `AI-Patra/dataset/` dan `AI-Patra/dataset_v2/` 100% UTUH, lalu membangun
`AI-Patra/dataset_v3_gerobak/` yang berfokus khusus pada objek fisik **Gerobak & Emperan**
(menghapus label `Payung`, `Terpal`, `Panggul`, `Sepeda-motor` di `train/valid/test` sehingga
payung hujan pejalan kaki, tenda/terpal tepi frame, tong sampah biru, dan kanopi otomatis
menjadi negatif/background untuk menekan False Positive secara agresif).

Komposisi `dataset_v3_gerobak`:
- `train/`: 342 gambar (300 Roboflow CCTV + 7 JakCCTV Diskominfotik + 35 hard-negative live CCTV),
            hanya mempertahankan label `0: Emperan` & `1: Gerobak`.
            Frame yang sebelumnya hanya berisi Payung/Terpal menjadi hard-negative alami!
- `valid/`: 61 gambar identik dengan `dataset/valid/`, label difilter hanya `Emperan` & `Gerobak`.
- `test/` : 41 gambar identik dengan `dataset/test/`, label difilter hanya `Emperan` & `Gerobak`.

Penggunaan:
  python AI-Patra/build_dataset_v3_gerobak.py
"""

from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from build_curated_train_v2 import (  # noqa: E402
    APPROVED_CLEAN_NEG_TAGS,
    APPROVED_HARD_NEG_TAGS,
    HARVEST_MANIFEST,
    MAX_CLEAN_NEG,
    should_exclude_train_file,
)
from prepare_dataset import (  # noqa: E402
    CLASS_NAMES,
    DATASET_DIR,
    IMG_EXTS,
    convert_line_to_yolo_bbox,
    extract_camera_group,
)

OUT_DIR = AI_ROOT / "dataset_v3_gerobak"
# Hanya pertahankan 0: Emperan dan 1: Gerobak (skip 2: Panggul, 3: Payung, 4: Sepeda-motor, 5: Terpal)
KEEP_CLASS_IDS = {0, 1}


def filter_label_file(src_lbl: Path) -> tuple[list[str], Counter, Counter]:
    kept_lines: list[str] = []
    kept_cnt = Counter()
    dropped_cnt = Counter()
    if not src_lbl.exists():
        return kept_lines, kept_cnt, dropped_cnt

    with open(src_lbl, "r", encoding="utf-8") as f:
        for raw_ln in f:
            parsed = convert_line_to_yolo_bbox(raw_ln)
            if parsed is None:
                continue
            cid, cx, cy, bw, bh = parsed
            cname = CLASS_NAMES.get(cid, f"cls_{cid}")
            if cid in KEEP_CLASS_IDS:
                kept_lines.append(f"{cid} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
                kept_cnt[cname] += 1
            else:
                dropped_cnt[cname] += 1
    return kept_lines, kept_cnt, dropped_cnt


def main() -> int:
    if not HARVEST_MANIFEST.exists():
        raise FileNotFoundError(f"Manifest harvest tidak ditemukan: {HARVEST_MANIFEST}")
    with open(HARVEST_MANIFEST, "r", encoding="utf-8") as f:
        harvest = json.load(f)

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)

    split_summary: dict[str, dict] = {}

    for split in ("train", "valid", "test"):
        src_img_dir = DATASET_DIR / split / "images"
        src_lbl_dir = DATASET_DIR / split / "labels"
        dst_img_dir = OUT_DIR / split / "images"
        dst_lbl_dir = OUT_DIR / split / "labels"
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        dst_lbl_dir.mkdir(parents=True, exist_ok=True)

        img_cnt = 0
        bg_cnt = 0
        kept_cls = Counter()
        dropped_cls = Counter()
        excluded_imgs = 0

        for img_path in sorted(p for p in src_img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS):
            stem = img_path.stem
            # Hanya hapus outlier non-CCTV pada train/; valid/ dan test/ tetap 100% gambar yang sama
            if split == "train" and should_exclude_train_file(stem):
                excluded_imgs += 1
                continue

            shutil.copy2(img_path, dst_img_dir / img_path.name)
            kept_lines, kc, dc = filter_label_file(src_lbl_dir / f"{stem}.txt")
            kept_cls.update(kc)
            dropped_cls.update(dc)

            with open(dst_lbl_dir / f"{stem}.txt", "w", encoding="utf-8") as f:
                if kept_lines:
                    f.write("\n".join(kept_lines) + "\n")
                else:
                    bg_cnt += 1
            img_cnt += 1

        # Tambahkan 35 hard-negative live CCTV ke train/
        added_neg = 0
        if split == "train":
            staging_root = DATASET_DIR / "staging_harvest"
            clean_added = 0
            for item in harvest.get("items", []):
                tag = item["tag"]
                bucket = item["bucket"]
                fname = item["filename"]
                src_file = staging_root / bucket / fname
                if not src_file.exists():
                    continue
                if tag in APPROVED_HARD_NEG_TAGS:
                    shutil.copy2(src_file, dst_img_dir / fname)
                    (dst_lbl_dir / f"{Path(fname).stem}.txt").write_text("", encoding="utf-8")
                    img_cnt += 1
                    bg_cnt += 1
                    added_neg += 1
                elif tag in APPROVED_CLEAN_NEG_TAGS and clean_added < MAX_CLEAN_NEG:
                    shutil.copy2(src_file, dst_img_dir / fname)
                    (dst_lbl_dir / f"{Path(fname).stem}.txt").write_text("", encoding="utf-8")
                    img_cnt += 1
                    bg_cnt += 1
                    clean_added += 1
                    added_neg += 1

        split_summary[split] = {
            "images": img_cnt,
            "background_images": bg_cnt,
            "background_pct": round(100.0 * bg_cnt / max(1, img_cnt), 1),
            "total_boxes": sum(kept_cls.values()),
            "kept_classes": dict(kept_cls),
            "skipped_classes": dict(dropped_cls),
            "excluded_outlier_images": excluded_imgs,
            "added_live_negatives": added_neg,
        }

    # Verifikasi 0% camera leakage
    cam_sets = {}
    for split in ("train", "valid", "test"):
        cam_sets[split] = {
            extract_camera_group(p.stem)
            for p in (OUT_DIR / split / "images").iterdir()
            if p.is_file() and p.suffix.lower() in IMG_EXTS
        }
    if (cam_sets["train"] & cam_sets["valid"]) or (cam_sets["train"] & cam_sets["test"]) or (cam_sets["valid"] & cam_sets["test"]):
        raise RuntimeError("TERDETEKSI LEAKAGE KAMERA PADA dataset_v3_gerobak!")

    # Tulis data_v3.yaml (tetap gunakan indeks kelas asli 0..5 agar kompatibel penuh dengan evaluate_models.py + single_cls=True)
    yaml_lines = [
        f"train: {(OUT_DIR / 'train' / 'images').as_posix()}",
        f"val: {(OUT_DIR / 'valid' / 'images').as_posix()}",
        f"test: {(OUT_DIR / 'test' / 'images').as_posix()}",
        "",
        f"nc: {len(CLASS_NAMES)}",
        "names:",
    ]
    for cid in sorted(CLASS_NAMES.keys()):
        yaml_lines.append(f"  {cid}: {CLASS_NAMES[cid]}")
    yaml_path = OUT_DIR / "data_v3.yaml"
    yaml_path.write_text("\n".join(yaml_lines) + "\n", encoding="utf-8")

    with open(OUT_DIR / "v3_summary.json", "w", encoding="utf-8") as f:
        json.dump(split_summary, f, indent=2, ensure_ascii=False)

    print("============ DATASET V3 (GEROBAK + EMPERAN ONLY) ============")
    for sp, st in split_summary.items():
        print(
            f"{sp:5s}: {st['images']:3d} img | {st['total_boxes']:3d} boxes {st['kept_classes']} | "
            f"bg={st['background_images']} ({st['background_pct']}%) | skipped={st['skipped_classes']}"
        )
    print(f"Camera leakage : 0 (VERIFIED)")
    print(f"YAML           : {yaml_path}")
    print("=============================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
