"""
PATRA — Camera-grouped K-Fold untuk evaluasi yang tidak bising.

Kenapa: split `valid` hanya ~67 box / 20 kamera -> mAP@50 berayun ±0.05 antar epoch, sehingga
selisih antar eksperimen < ~0.06 tidak bisa dibedakan dari noise. K-fold berbasis kamera
(train+valid digabung, `test` tetap disimpan untuk evaluasi final) memberi mean ± sd.

Tidak ada file gambar yang disalin: setiap fold berisi train.txt / val.txt (daftar path absolut)
+ data.yaml. Label tetap dibaca Ultralytics dari folder `labels/` di samping `images/`.

Penggunaan:
  python AI-Patra/kfold_camera.py make                     # buat AI-Patra/folds/fold0..4
  python AI-Patra/kfold_camera.py make --k 5 --seed 0
  # latih tiap fold (PowerShell):
  #   foreach ($k in 0..4) { python AI-Patra/yolo.py --preset v5_960 --data AI-Patra/folds/fold$k/data.yaml --name v5_960_f$k --no-copy-best --eval-split none }
  python AI-Patra/kfold_camera.py report --prefix v5_960_f  # mean ± sd mAP dari runs/<prefix>*/results.csv
"""

from __future__ import annotations

import argparse
import csv
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from prepare_dataset import CLASS_NAMES, DATASET_DIR, IMG_EXTS, extract_camera_group

AI_ROOT = Path(__file__).resolve().parent
FOLDS_DIR = AI_ROOT / "folds"
RUNS_DIR = AI_ROOT / "runs"


def count_boxes(img: Path) -> int:
    lbl = img.parent.parent / "labels" / f"{img.stem}.txt"
    if not lbl.exists():
        return 0
    return sum(1 for ln in lbl.read_text(encoding="utf-8").splitlines() if ln.strip())


def make_folds(k: int, seed: int, splits: tuple[str, ...]) -> int:
    groups: dict[str, list[Path]] = defaultdict(list)
    for sp in splits:
        img_dir = DATASET_DIR / sp / "images"
        for p in sorted(img_dir.iterdir()):
            if p.suffix.lower() in IMG_EXTS:
                groups[extract_camera_group(p.stem)].append(p)
    if len(groups) < k:
        print(f"[ERR] Hanya {len(groups)} kamera, tidak cukup untuk {k} fold.")
        return 1

    cam_boxes = {c: sum(count_boxes(p) for p in ps) for c, ps in groups.items()}
    cams = list(groups)
    random.Random(seed).shuffle(cams)  # tie-break deterministik
    pos = sorted((c for c in cams if cam_boxes[c] > 0), key=lambda c: -cam_boxes[c])
    neg = [c for c in cams if cam_boxes[c] == 0]

    fold_boxes = [0] * k
    fold_imgs: list[list[Path]] = [[] for _ in range(k)]
    fold_cams: list[list[str]] = [[] for _ in range(k)]
    # Kamera positif: seimbangkan jumlah box; kamera negatif-only: seimbangkan jumlah gambar.
    for c in pos:
        i = min(range(k), key=lambda j: (fold_boxes[j], len(fold_imgs[j])))
        fold_boxes[i] += cam_boxes[c]
        fold_imgs[i] += groups[c]
        fold_cams[i].append(c)
    for c in neg:
        i = min(range(k), key=lambda j: len(fold_imgs[j]))
        fold_imgs[i] += groups[c]
        fold_cams[i].append(c)

    names = ", ".join(f"'{CLASS_NAMES[i]}'" for i in sorted(CLASS_NAMES))
    test_dir = (DATASET_DIR / "test" / "images").resolve().as_posix()
    print(f"{'fold':5s} {'img':>4s} {'box':>4s} {'cam':>4s} {'bg':>4s}")
    for i in range(k):
        d = FOLDS_DIR / f"fold{i}"
        d.mkdir(parents=True, exist_ok=True)
        train = [p for j in range(k) if j != i for p in fold_imgs[j]]
        (d / "train.txt").write_text("\n".join(p.resolve().as_posix() for p in train) + "\n", encoding="utf-8")
        (d / "val.txt").write_text("\n".join(p.resolve().as_posix() for p in fold_imgs[i]) + "\n", encoding="utf-8")
        (d / "data.yaml").write_text(
            "\n".join([
                f"# Camera-grouped fold {i}/{k} (seed={seed}) — dibuat oleh kfold_camera.py",
                f"train: {(d / 'train.txt').resolve().as_posix()}",
                f"val: {(d / 'val.txt').resolve().as_posix()}",
                f"test: {test_dir}",
                f"nc: {len(CLASS_NAMES)}",
                f"names: [{names}]",
                "",
            ]),
            encoding="utf-8",
        )
        (d / "cameras.txt").write_text("\n".join(sorted(fold_cams[i])) + "\n", encoding="utf-8")
        bg = sum(1 for p in fold_imgs[i] if count_boxes(p) == 0)
        print(f"fold{i} {len(fold_imgs[i]):4d} {fold_boxes[i]:4d} {len(fold_cams[i]):4d} {bg:4d}")

    # Sanity check: tidak ada kamera yang muncul di 2 fold
    seen: dict[str, int] = {}
    for i, cs in enumerate(fold_cams):
        for c in cs:
            if c in seen:
                print(f"[ERR] Kamera {c} bocor di fold{seen[c]} & fold{i}")
                return 1
            seen[c] = i
    print(f"\n[OK] {k} fold dibuat di {FOLDS_DIR} (0% camera leakage, test/ tidak disentuh).")
    return 0


def make_full(splits: tuple[str, ...]) -> int:
    """Data.yaml model FINAL: train = gabungan `splits` (default train+valid), test = test/.

    Dipakai SETELAH konfigurasi dipilih lewat k-fold (jumlah epoch tetap, tanpa early stopping),
    sehingga semua kamera non-test ikut melatih model. `val` diisi split valid hanya agar
    Ultralytics bisa jalan — angkanya optimistis karena kamera valid ikut di-train.
    Angka yang dilaporkan = mean k-fold + evaluasi test sekali.
    """
    imgs = [
        p for sp in splits for p in sorted((DATASET_DIR / sp / "images").iterdir())
        if p.suffix.lower() in IMG_EXTS
    ]
    val_imgs = [p for p in sorted((DATASET_DIR / "valid" / "images").iterdir()) if p.suffix.lower() in IMG_EXTS]
    d = FOLDS_DIR / "full"
    d.mkdir(parents=True, exist_ok=True)
    (d / "train.txt").write_text("\n".join(p.resolve().as_posix() for p in imgs) + "\n", encoding="utf-8")
    (d / "val.txt").write_text("\n".join(p.resolve().as_posix() for p in val_imgs) + "\n", encoding="utf-8")
    names = ", ".join(f"'{CLASS_NAMES[i]}'" for i in sorted(CLASS_NAMES))
    (d / "data.yaml").write_text(
        "\n".join([
            f"# Model final: train = {'+'.join(splits)} | val = valid (OPTIMISTIS, hanya monitor) | test = test",
            f"train: {(d / 'train.txt').resolve().as_posix()}",
            f"val: {(d / 'val.txt').resolve().as_posix()}",
            f"test: {(DATASET_DIR / 'test' / 'images').resolve().as_posix()}",
            f"nc: {len(CLASS_NAMES)}",
            f"names: [{names}]",
            "",
        ]),
        encoding="utf-8",
    )
    cams = {extract_camera_group(p.stem) for p in imgs}
    boxes = sum(count_boxes(p) for p in imgs)
    print(f"[OK] {d / 'data.yaml'}: {len(imgs)} gambar, {boxes} box, {len(cams)} kamera (test/ tidak disentuh).")
    return 0


def report(prefix: str, metric_col: str) -> int:
    rows = []
    for run in sorted(RUNS_DIR.glob(f"{prefix}*")):
        res = run / "results.csv"
        if not res.exists():
            continue
        with open(res, newline="", encoding="utf-8") as f:
            data = [{k.strip(): v for k, v in r.items()} for r in csv.DictReader(f)]
        if not data:
            continue
        last = data[-1]
        best = max(data, key=lambda r: float(r[metric_col]))
        rows.append((run.name, float(last[metric_col]), float(last["metrics/mAP50-95(B)"]),
                     float(best[metric_col]), int(float(best["epoch"]))))
    if not rows:
        print(f"[ERR] Tidak ada runs/{prefix}*/results.csv")
        return 1
    print(f"{'run':30s} {'mAP50(last)':>11s} {'mAP50-95':>9s} {'mAP50(best)':>11s} {'@ep':>4s}")
    for r in rows:
        print(f"{r[0]:30s} {r[1]:11.4f} {r[2]:9.4f} {r[3]:11.4f} {r[4]:4d}")
    lasts = [r[1] for r in rows]
    sd = statistics.stdev(lasts) if len(lasts) > 1 else 0.0
    print(f"\nmAP50 (epoch terakhir) = {statistics.mean(lasts):.4f} ± {sd:.4f}  (n={len(lasts)})")
    print(f"mAP50-95               = {statistics.mean(r[2] for r in rows):.4f}")
    print("Catatan: gunakan angka 'last' untuk membandingkan eksperimen; 'best' bias ke atas.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PATRA camera-grouped k-fold")
    sub = parser.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make", help="Buat folds/foldK/{train,val}.txt + data.yaml")
    m.add_argument("--k", type=int, default=5)
    m.add_argument("--seed", type=int, default=0)
    m.add_argument("--splits", nargs="+", default=["train", "valid"], help="Split yang digabung (test tetap disimpan)")
    fu = sub.add_parser("full", help="Buat folds/full/data.yaml (train+valid) untuk model final")
    fu.add_argument("--splits", nargs="+", default=["train", "valid"])
    r = sub.add_parser("report", help="Ringkas mean ± sd dari runs/<prefix>*")
    r.add_argument("--prefix", required=True)
    r.add_argument("--metric", default="metrics/mAP50(B)")
    args = parser.parse_args()
    if args.cmd == "make":
        return make_folds(args.k, args.seed, tuple(args.splits))
    if args.cmd == "full":
        return make_full(tuple(args.splits))
    return report(args.prefix, args.metric)


if __name__ == "__main__":
    sys.exit(main())
