"""
PATRA — Leakage-Free Camera-Grouped Dataset Preparation & Audit Script.

Fungsi:
1. Mengonversi label 9-kolom (4-titik poligon aksis-sejajar dari Roboflow) ke format
   standar YOLO Detect 5-kolom (`class cx cy w h` ternormalisasi 0..1).
2. Membagi dataset secara deterministik ke `train/` (~75%), `valid/` (~15%), dan
   `test/` (~10%) berdasarkan **grup kamera (camera-grouped stratified split)** agar
   tidak terjadi data leakage antar-frame dari kamera CCTV yang sama.
3. Menjaga distribusi kelas (termasuk kelas langka & frame background/negatif) merata
   di ketiga split.
4. Memperbaiki `dataset/data.yaml` agar path siap langsung dipakai Ultralytics YOLO.
5. Menjalankan verifikasi menyeluruh (gambar korup, label hilang/yatim, format bbox,
   dan 0% kebocoran kamera antar split).

Penggunaan:
  python prepare_dataset.py --split     # Lakukan normalisasi + split + audit
  python prepare_dataset.py --verify    # Hanya jalankan audit tanpa memindahkan file
"""

from __future__ import annotations

import argparse
import os
import random
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
SPLITS = ("train", "valid", "test")
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

CLASS_NAMES = {
    0: "Emperan",
    1: "Gerobak",
    2: "Panggul",
    3: "Payung",
    4: "Sepeda-motor",
    5: "Terpal",
}


def extract_camera_group(stem: str) -> str:
    """Ambil ID kamera CCTV unik sebelum timestamp agar 1 kamera tidak terpecah antar split."""
    orig = stem.split(".rf.")[0]
    m = re.match(r"^(.+?)_20\d{12}", orig)
    if m:
        return m.group(1)
    # Normalisasi case untuk grup non-CCTV (mis. Panggul vs panggul)
    prefix = orig.split("_")[0].strip().lower()
    return f"noncctv_{prefix}"


def convert_line_to_yolo_bbox(line: str) -> tuple[int, float, float, float, float] | None:
    """Konversi 5-kolom YOLO bbox atau >=9-kolom poligon menjadi (cls, cx, cy, w, h)."""
    parts = line.strip().split()
    if not parts:
        return None
    cls_id = int(float(parts[0]))
    coords = [float(x) for x in parts[1:]]

    if len(coords) == 4:
        cx, cy, w, h = coords
    elif len(coords) >= 6 and len(coords) % 2 == 0:
        xs = coords[0::2]
        ys = coords[1::2]
        x_min = max(0.0, min(1.0, min(xs)))
        x_max = max(0.0, min(1.0, max(xs)))
        y_min = max(0.0, min(1.0, min(ys)))
        y_max = max(0.0, min(1.0, max(ys)))
        w = x_max - x_min
        h = y_max - y_min
        cx = x_min + w / 2.0
        cy = y_min + h / 2.0
    else:
        raise ValueError(f"Format baris label tidak dikenali ({len(parts)} kolom): {line}")

    cx = max(0.0, min(1.0, cx))
    cy = max(0.0, min(1.0, cy))
    w = max(0.0, min(1.0, w))
    h = max(0.0, min(1.0, h))
    if w <= 1e-6 or h <= 1e-6:
        return None
    return cls_id, cx, cy, w, h


def collect_all_samples(dataset_dir: Path) -> list[dict]:
    """Kumpulkan seluruh pasangan (image, label) yang sudah ada di train/valid/test."""
    samples = []
    seen_stems = set()
    for split in SPLITS:
        img_dir = dataset_dir / split / "images"
        lbl_dir = dataset_dir / split / "labels"
        if not img_dir.exists():
            continue
        for img_path in sorted(img_dir.iterdir()):
            if not img_path.is_file() or img_path.suffix.lower() not in IMG_EXTS:
                continue
            stem = img_path.stem
            if stem in seen_stems:
                continue
            lbl_path = lbl_dir / f"{stem}.txt"
            if not lbl_path.exists():
                raise FileNotFoundError(f"Label tidak ditemukan untuk gambar: {img_path}")
            seen_stems.add(stem)

            with open(lbl_path, "r", encoding="utf-8") as f:
                raw_lines = [ln.strip() for ln in f if ln.strip()]

            boxes = []
            classes = Counter()
            for ln in raw_lines:
                box = convert_line_to_yolo_bbox(ln)
                if box is not None:
                    boxes.append(box)
                    classes[box[0]] += 1

            samples.append(
                {
                    "stem": stem,
                    "img_path": img_path,
                    "lbl_path": lbl_path,
                    "current_split": split,
                    "camera_group": extract_camera_group(stem),
                    "boxes": boxes,
                    "classes": classes,
                    "is_bg": len(boxes) == 0,
                }
            )
    return samples


def stratified_camera_group_split(
    samples: list[dict],
    ratios: tuple[float, float, float] = (0.75, 0.15, 0.10),
    seed: int = 42,
) -> dict[str, str]:
    """
    Alokasikan setiap camera_group ke train/valid/test menggunakan optimasi lokal
    deterministik (greedy init + move/swap refinement):
    - 100% camera-grouped (0% kebocoran frame antar kamera yang sama).
    - Rasio gambar tepat mendekati 75% train / 15% valid / 10% test.
    - Proporsi SETIAP kelas (termasuk Emperan, Panggul, Sepeda-motor) & frame background
      mengikuti 75/15/10 seimbang tanpa kekurangan di train/valid/test.
    """
    rng = random.Random(seed)
    groups: dict[str, list[dict]] = defaultdict(list)
    for s in samples:
        groups[s["camera_group"]].append(s)

    total_imgs = len(samples)
    target_imgs = {sp: total_imgs * r for sp, r in zip(SPLITS, ratios)}

    total_class = Counter()
    total_bg = 0
    for s in samples:
        total_class.update(s["classes"])
        if s["is_bg"]:
            total_bg += 1

    target_class = {
        sp: {c: cnt * r for c, cnt in total_class.items()}
        for sp, r in zip(SPLITS, ratios)
    }
    target_bg = {sp: total_bg * r for sp, r in zip(SPLITS, ratios)}

    group_names = sorted(groups.keys())
    g_size = {}
    g_cls = {}
    g_bg = {}
    for g in group_names:
        items = groups[g]
        g_size[g] = len(items)
        c_cnt = Counter()
        bg_cnt = 0
        for it in items:
            c_cnt.update(it["classes"])
            if it["is_bg"]:
                bg_cnt += 1
        g_cls[g] = c_cnt
        g_bg[g] = bg_cnt

    def evaluate(assign: dict[str, str]) -> float:
        s_imgs = {sp: 0 for sp in SPLITS}
        s_cls = {sp: Counter() for sp in SPLITS}
        s_bg = {sp: 0 for sp in SPLITS}
        for g, sp in assign.items():
            s_imgs[sp] += g_size[g]
            s_cls[sp].update(g_cls[g])
            s_bg[sp] += g_bg[g]

        loss = 0.0
        for sp in SPLITS:
            # 1. Kesesuaian rasio jumlah gambar (bobot tinggi)
            img_err = (s_imgs[sp] - target_imgs[sp]) / max(1.0, target_imgs[sp])
            loss += 18.0 * (img_err ** 2)

            # 2. Kesesuaian distribusi tiap kelas
            for c, tot in total_class.items():
                tgt = max(0.5, target_class[sp][c])
                val = s_cls[sp][c]
                err = (val - tgt) / tgt
                # Pastikan kelas yang punya >= 3 box hadir di setiap split
                if val == 0 and tot >= 3:
                    loss += 25.0
                # Pastikan train selalu mendapatkan mayoritas setiap kelas
                if sp == "train" and val < tot * 0.55:
                    loss += 15.0 * (((tot * 0.55 - val) / max(1.0, tot)) ** 2)
                weight = 5.0 if tot >= 30 else 3.0
                loss += weight * (err ** 2)

            # 3. Kesesuaian frame background (negatif) untuk uji false positive
            if total_bg >= 3:
                bg_tgt = max(1.0, target_bg[sp])
                bg_val = s_bg[sp]
                if bg_val == 0:
                    loss += 12.0
                loss += 4.0 * (((bg_val - bg_tgt) / bg_tgt) ** 2)

        return loss

    best_assign: dict[str, str] = {}
    best_loss = float("inf")

    # Multi-start local search deterministik (15 restart x move/swap refinement)
    for _ in range(15):
        assign = {}
        shuffled = list(group_names)
        rng.shuffle(shuffled)
        for g in shuffled:
            r = rng.random()
            if r < ratios[0]:
                assign[g] = "train"
            elif r < ratios[0] + ratios[1]:
                assign[g] = "valid"
            else:
                assign[g] = "test"

        cur_loss = evaluate(assign)
        improved = True
        while improved:
            improved = False
            # Single-group moves
            for g in shuffled:
                orig_sp = assign[g]
                for sp in SPLITS:
                    if sp == orig_sp:
                        continue
                    assign[g] = sp
                    new_loss = evaluate(assign)
                    if new_loss + 1e-9 < cur_loss:
                        cur_loss = new_loss
                        orig_sp = sp
                        improved = True
                    else:
                        assign[g] = orig_sp

            # Pairwise swaps antar split berbeda
            for i in range(len(shuffled)):
                g1 = shuffled[i]
                for j in range(i + 1, len(shuffled)):
                    g2 = shuffled[j]
                    if assign[g1] == assign[g2]:
                        continue
                    assign[g1], assign[g2] = assign[g2], assign[g1]
                    new_loss = evaluate(assign)
                    if new_loss + 1e-9 < cur_loss:
                        cur_loss = new_loss
                        improved = True
                    else:
                        assign[g1], assign[g2] = assign[g2], assign[g1]

        if cur_loss < best_loss:
            best_loss = cur_loss
            best_assign = dict(assign)

    return best_assign


def write_data_yaml(dataset_dir: Path) -> None:
    yaml_text = "\n".join(
        [
            "# PATRA — High-Angle PKL Detection Dataset (Camera-Grouped Split, 0% Leakage)",
            "# Tanpa key `path:` agar Ultralytics selalu me-resolve relatif terhadap folder data.yaml ini.",
            "train: train/images",
            "val: valid/images",
            "test: test/images",
            "",
            f"nc: {len(CLASS_NAMES)}",
            "names:",
            *[f"  {k}: {v}" for k, v in CLASS_NAMES.items()],
            "",
        ]
    )
    (dataset_dir / "data.yaml").write_text(yaml_text, encoding="utf-8")


def perform_split(dataset_dir: Path) -> None:
    samples = collect_all_samples(dataset_dir)
    if not samples:
        raise RuntimeError("Tidak ada gambar berlabel yang ditemukan di dataset/.")

    assignment = stratified_camera_group_split(samples, ratios=(0.75, 0.15, 0.10), seed=42)

    for sp in SPLITS:
        (dataset_dir / sp / "images").mkdir(parents=True, exist_ok=True)
        (dataset_dir / sp / "labels").mkdir(parents=True, exist_ok=True)

    moved = 0
    converted_files = 0
    for s in samples:
        target_split = assignment[s["camera_group"]]
        dst_img = dataset_dir / target_split / "images" / s["img_path"].name
        dst_lbl = dataset_dir / target_split / "labels" / s["lbl_path"].name

        if s["img_path"].resolve() != dst_img.resolve():
            shutil.move(str(s["img_path"]), str(dst_img))
            moved += 1

        # Tulis ulang label ke format standar YOLO 5-kolom (class cx cy w h)
        lines = [
            f"{cls_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"
            for cls_id, cx, cy, w, h in s["boxes"]
        ]
        dst_lbl.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        if s["lbl_path"].resolve() != dst_lbl.resolve() and s["lbl_path"].exists():
            s["lbl_path"].unlink()
        converted_files += 1

    write_data_yaml(dataset_dir)
    print(f"[OK] Selesai normalisasi {converted_files} label ke 5-kolom YOLO bbox & pindah {moved} gambar.")


def verify_dataset(dataset_dir: Path) -> bool:
    print("\n================ DATASET AUDIT REPORT ================")
    all_ok = True
    split_cameras: dict[str, set[str]] = {}
    total_images = 0

    for sp in SPLITS:
        img_dir = dataset_dir / sp / "images"
        lbl_dir = dataset_dir / sp / "labels"
        imgs = sorted(p for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS) if img_dir.exists() else []
        lbls = sorted(p for p in lbl_dir.iterdir() if p.is_file() and p.suffix.lower() == ".txt") if lbl_dir.exists() else []

        img_stems = {p.stem for p in imgs}
        lbl_stems = {p.stem for p in lbls}
        missing_lbl = img_stems - lbl_stems
        orphan_lbl = lbl_stems - img_stems

        corrupt_imgs = 0
        for p in imgs:
            try:
                with Image.open(p) as im:
                    im.verify()
            except Exception:
                corrupt_imgs += 1

        cls_boxes = Counter()
        bg_count = 0
        bad_format = 0
        cams = set()

        for p in lbls:
            cams.add(extract_camera_group(p.stem))
            content = p.read_text(encoding="utf-8")
            lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
            if not lines:
                bg_count += 1
            for ln in lines:
                parts = ln.split()
                if len(parts) != 5:
                    bad_format += 1
                    continue
                cls_id = int(parts[0])
                vals = [float(x) for x in parts[1:]]
                if cls_id not in CLASS_NAMES or any(v < 0.0 or v > 1.0 for v in vals) or vals[2] <= 0 or vals[3] <= 0:
                    bad_format += 1
                else:
                    cls_boxes[cls_id] += 1

        split_cameras[sp] = cams
        total_images += len(imgs)

        if missing_lbl or orphan_lbl or corrupt_imgs or bad_format:
            all_ok = False

        cls_summary = ", ".join(
            f"{CLASS_NAMES[c]}:{cls_boxes[c]}" for c in sorted(CLASS_NAMES)
        )
        print(
            f"[{sp.upper():5s}] images={len(imgs):3d} | cameras={len(cams):2d} | bg={bg_count:2d} "
            f"| boxes={sum(cls_boxes.values()):3d} ({cls_summary})"
        )
        if missing_lbl or orphan_lbl or corrupt_imgs or bad_format:
            print(
                f"   [ERR] missing_lbl={len(missing_lbl)} orphan_lbl={len(orphan_lbl)} "
                f"corrupt_imgs={corrupt_imgs} bad_format={bad_format}"
            )

    # Cek kebocoran kamera antar split
    tv = split_cameras["train"] & split_cameras["valid"]
    tt = split_cameras["train"] & split_cameras["test"]
    vt = split_cameras["valid"] & split_cameras["test"]
    leak_total = len(tv) + len(tt) + len(vt)
    if leak_total > 0:
        all_ok = False

    print(f"\nTotal labeled images : {total_images}")
    if total_images > 0:
        pcts = [
            f"{sp}={len(list((dataset_dir / sp / 'images').glob('*'))) / total_images * 100:.1f}%"
            for sp in SPLITS
        ]
        print("Split ratio          :", " | ".join(pcts))
    print(f"Camera leakage check : train∩valid={len(tv)}, train∩test={len(tt)}, valid∩test={len(vt)}")
    print(f"Audit status         : {'PASSED (READY FOR YOLO TRAINING)' if all_ok else 'FAILED'}")
    print("======================================================\n")
    return all_ok


def main() -> int:
    parser = argparse.ArgumentParser(description="PATRA Dataset Preparation & Audit")
    parser.add_argument("--split", action="store_true", help="Normalize labels and run camera-grouped split")
    parser.add_argument("--verify", action="store_true", help="Run integrity & leakage audit")
    args = parser.parse_args()

    if not args.split and not args.verify:
        args.verify = True

    if args.split:
        perform_split(DATASET_DIR)

    ok = verify_dataset(DATASET_DIR)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
