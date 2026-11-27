"""
PATRA — Terapkan perbaikan label hasil audit visual (`curation/label_fixes_v5.json`).

Tiga jenis perbaikan (lihat field `policy` di manifest):
  - delete     : hapus box duplikat/parsial/salah objek (dicocokkan per koordinat).
  - add        : tambahkan box objek statis yang lupa dilabeli (sudah diverifikasi visual).
  - quarantine : pindahkan frame "background" yang ternyata berisi PKL tak berlabel ke
                 `dataset_quarantine/needs_relabel/<split>/` agar dilabeli ulang manual.

Aman & bisa dibatalkan:
  - Default = DRY RUN (hanya mencetak rencana). Tambahkan `--apply` untuk menulis.
  - Sebelum mengubah apa pun, label asli disalin ke `dataset_quarantine/label_backup_<version>/`.
  - `--revert` mengembalikan label asli & memindahkan kembali gambar karantina.

Penggunaan:
  python AI-Patra/apply_label_fixes.py                                   # dry run (manifest terbaru: v6)
  python AI-Patra/apply_label_fixes.py --apply                           # terapkan v6
  python AI-Patra/apply_label_fixes.py --manifest AI-Patra/curation/label_fixes_v5.json --apply
  python AI-Patra/apply_label_fixes.py --revert                          # batalkan v6 saja
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent
DATASET_DIR = AI_ROOT / "dataset"
QUAR_ROOT = AI_ROOT / "dataset_quarantine"
DEFAULT_MANIFEST = AI_ROOT / "curation" / "label_fixes_v6.json"
SPLITS = ("train", "valid", "test")
IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
COORD_TOL = 2e-4


def iou_xywh(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a[0] - a[2] / 2, a[1] - a[3] / 2, a[0] + a[2] / 2, a[1] + a[3] / 2
    bx1, by1, bx2, by2 = b[0] - b[2] / 2, b[1] - b[3] / 2, b[0] + b[2] / 2, b[1] + b[3] / 2
    iw = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    return inter / max(1e-9, a[2] * a[3] + b[2] * b[3] - inter)


def find_sample(dataset_dir: Path, camera: str, ts: str) -> tuple[str, Path, Path] | None:
    """Cari (split, image, label) yang namanya diawali `<camera>_<ts>`."""
    prefix = f"{camera}_{ts}"
    for split in SPLITS:
        lbl_dir = dataset_dir / split / "labels"
        if not lbl_dir.exists():
            continue
        for lbl in lbl_dir.glob(f"{prefix}*.txt"):
            for ext in IMG_EXTS:
                img = dataset_dir / split / "images" / f"{lbl.stem}{ext}"
                if img.exists():
                    return split, img, lbl
    return None


def locate(dataset_dir: Path, item: dict) -> tuple[str, Path, Path] | None:
    """Entri manifest menunjuk gambar via `stem` (nama file tanpa ekstensi) atau `camera`+`ts`."""
    if "stem" in item:
        for split in SPLITS:
            lbl = dataset_dir / split / "labels" / f"{item['stem']}.txt"
            if lbl.exists():
                for ext in IMG_EXTS:
                    img = dataset_dir / split / "images" / f"{item['stem']}{ext}"
                    if img.exists():
                        return split, img, lbl
        return None
    return find_sample(dataset_dir, item["camera"], item["ts"])


def item_name(item: dict) -> str:
    return item.get("stem") or f"{item['camera']}_{item['ts']}"


def read_boxes(lbl: Path) -> list[list[float]]:
    rows = []
    for ln in lbl.read_text(encoding="utf-8").splitlines():
        parts = ln.split()
        if len(parts) == 5:
            rows.append([float(p) for p in parts])
    return rows


def write_boxes(lbl: Path, rows: list[list[float]]) -> None:
    text = "\n".join(f"{int(r[0])} {r[1]:.6f} {r[2]:.6f} {r[3]:.6f} {r[4]:.6f}" for r in rows)
    lbl.write_text(text + ("\n" if rows else ""), encoding="utf-8")


def backup_label(lbl: Path, split: str, backup_dir: Path) -> None:
    dst = backup_dir / split / lbl.name
    if not dst.exists():  # simpan versi PALING asli saja (idempoten)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(lbl, dst)


def apply(manifest: dict, dataset_dir: Path, write: bool) -> int:
    version = manifest.get("version", "v5")
    backup_dir = QUAR_ROOT / f"label_backup_{version}"
    quar_dir = QUAR_ROOT / "needs_relabel"
    problems = 0
    edits: dict[Path, tuple[str, list[list[float]]]] = {}

    def load(split: str, lbl: Path) -> list[list[float]]:
        if lbl not in edits:
            edits[lbl] = (split, read_boxes(lbl))
        return edits[lbl][1]

    print(f"Manifest {version} | mode={'APPLY' if write else 'DRY-RUN'}\n")

    for item in manifest.get("delete", []):
        hit = locate(dataset_dir, item)
        if hit is None:
            print(f"[SKIP delete] tidak ditemukan: {item_name(item)}")
            problems += 1
            continue
        split, _, lbl = hit
        rows = load(split, lbl)
        target = item["box"]
        idx = next(
            (i for i, r in enumerate(rows) if int(r[0]) == int(target[0])
             and all(abs(r[k] - target[k]) <= COORD_TOL for k in range(1, 5))),
            None,
        )
        if idx is None:
            print(f"[ok   delete] sudah tidak ada (idempoten): {lbl.stem[:70]}")
            continue
        rows.pop(idx)
        print(f"[DEL] {split:5s} {lbl.stem[:70]} -> {item['reason']}")

    for item in manifest.get("add", []):
        hit = locate(dataset_dir, item)
        if hit is None:
            print(f"[SKIP add] tidak ditemukan: {item_name(item)}")
            problems += 1
            continue
        split, _, lbl = hit
        rows = load(split, lbl)
        box = [float(v) for v in item["box"]]
        if any(iou_xywh(r[1:], box[1:]) > 0.5 for r in rows):
            print(f"[ok   add] sudah ada box serupa (idempoten): {lbl.stem[:70]}")
            continue
        rows.append(box)
        print(f"[ADD] {split:5s} {lbl.stem[:70]} -> {item['reason']}")

    moves: list[tuple[str, Path, Path, str]] = []
    for item in manifest.get("quarantine", []):
        hit = locate(dataset_dir, item)
        if hit is None:
            already = list((quar_dir).glob(f"*/labels/{item_name(item)}*.txt"))
            print(f"[ok   quarantine] {'sudah dikarantina' if already else 'TIDAK DITEMUKAN'}: {item_name(item)}")
            problems += 0 if already else 1
            continue
        split, img, lbl = hit
        if read_boxes(lbl) and lbl not in edits:
            print(f"[WARN quarantine] {lbl.stem[:70]} punya box, tetap dikarantina sesuai manifest")
        moves.append((split, img, lbl, item["reason"]))
        print(f"[QUAR] {split:5s} {img.stem[:70]} -> {item['reason']}")

    if not write:
        print(f"\nDRY-RUN selesai: {len(edits)} file label akan diubah, {len(moves)} gambar dikarantina. "
              "Jalankan ulang dengan --apply untuk menerapkan.")
        return 1 if problems else 0

    for lbl, (split, rows) in edits.items():
        backup_label(lbl, split, backup_dir)
        write_boxes(lbl, rows)

    log_path = quar_dir / "quarantine_log.csv"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    new_log = not log_path.exists()
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new_log:
            w.writerow(["split", "image", "reason", "manifest_version"])
        for split, img, lbl, reason in moves:
            backup_label(lbl, split, backup_dir)
            for sub, src in (("images", img), ("labels", lbl)):
                dst = quar_dir / split / sub / src.name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dst))
            w.writerow([split, img.name, reason, version])

    print(f"\nSelesai: {len(edits)} label diubah, {len(moves)} gambar dikarantina ke {quar_dir}.")
    print(f"Backup label asli: {backup_dir}")
    print("Langkah berikutnya: python AI-Patra/prepare_dataset.py --verify  (lalu buat ulang k-fold)")
    return 1 if problems else 0


def revert(manifest: dict, dataset_dir: Path) -> int:
    version = manifest.get("version", "v5")
    backup_dir = QUAR_ROOT / f"label_backup_{version}"
    quar_dir = QUAR_ROOT / "needs_relabel"
    moved = restored = 0
    log_path = quar_dir / "quarantine_log.csv"
    kept_rows: list[list[str]] = []
    header = ["split", "image", "reason", "manifest_version"]
    if log_path.exists():
        with open(log_path, newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        header, body = (rows[0], rows[1:]) if rows else (header, [])
        for row in body:
            split, img_name, _, row_version = row
            if row_version != version:  # karantina versi lain tidak disentuh
                kept_rows.append(row)
                continue
            stem = Path(img_name).stem
            for sub, name in (("images", img_name), ("labels", f"{stem}.txt")):
                src = quar_dir / split / sub / name
                if src.exists():
                    dst = dataset_dir / split / sub / name
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(src), str(dst))
                    moved += 1
        with open(log_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows([header, *kept_rows])

    # Label: pulihkan dari backup versi INI (berisi kondisi tepat sebelum --apply versi ini)
    for split in SPLITS:
        bdir = backup_dir / split
        if bdir.exists():
            for b in bdir.glob("*.txt"):
                target = dataset_dir / split / "labels" / b.name
                if target.exists():  # label milik gambar yang masih dikarantina versi lain dilewati
                    shutil.copy2(b, target)
                    restored += 1
    print(f"Revert {version} selesai: {moved} file dikembalikan dari karantina, {restored} label dipulihkan.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply/revert PATRA label fixes manifest")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--dataset-dir", type=Path, default=DATASET_DIR)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Tulis perubahan (default: dry-run)")
    group.add_argument("--revert", action="store_true", help="Kembalikan label & gambar ke kondisi sebelum --apply")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if args.revert:
        return revert(manifest, args.dataset_dir)
    return apply(manifest, args.dataset_dir, write=args.apply)


if __name__ == "__main__":
    sys.exit(main())
