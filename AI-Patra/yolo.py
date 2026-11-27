"""
PATRA — High-Angle CCTV PKL Detection Training Script (v5).

Melatih / fine-tuning YOLO (default `yolo26n`) pada dataset camera-grouped (0% leakage)
dan menyalin bobot terbaik ke `AI-Patra/model/best.pt`.

Perubahan v5 (berdasarkan diagnosis run `v4_16x9`):
- `warmup_bias_lr=0.0` — default Ultralytics 0.1 membuat lr bias head = 0.08 di epoch 1
  (cls_loss 54 -> merusak head pretrained) saat lr0 kecil.
- Default SGD (lr0=0.005, momentum=0.937, wd=5e-4). Untuk AdamW gunakan wd ~0.05
  (wd 0.001 pada AdamW praktis tanpa regularisasi).
- Augmentasi anti-hafal-latar: mosaic=1.0, scale=0.5, mixup=0.1, translate=0.1.
  (`copy_paste` TIDAK dipakai: Ultralytics hanya menerapkannya pada label segmentasi.
   `dropout` TIDAK dipakai: hanya berlaku untuk model klasifikasi.)
- Early stopping default MATI (`--patience 0`): mAP valid (67 box) bising ±0.05 sehingga
  "best epoch" bias ke atas. Laporkan bobot epoch terakhir (EMA) / mean k-fold.
- Audit dataset otomatis dilewati jika `--data` bukan layout train/valid/test standar
  (mis. folds/foldK/data.yaml dari `kfold_camera.py`).

Contoh:
  python AI-Patra/yolo.py --preset v5_960                     # rekomendasi utama (30 ep, mosaic s/d akhir)
  python AI-Patra/yolo.py --preset v5_960 --data AI-Patra/folds/full/data.yaml --name v5_960_full   # final: train+valid
  python AI-Patra/yolo.py --preset v5_640 --name base640
  python AI-Patra/yolo.py --data AI-Patra/folds/fold0/data.yaml --preset v5_960 --name v5_960_f0 --no-copy-best
  python AI-Patra/yolo.py --preset teacher_1280               # teacher besar untuk pseudo-label (bukan untuk browser)
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from prepare_dataset import DATASET_DIR, verify_dataset

AI_ROOT = Path(__file__).resolve().parent
MODEL_DIR = AI_ROOT / "model"
RUNS_DIR = AI_ROOT / "runs"

# Nilai preset menimpa default argparse HANYA untuk argumen yang tidak diketik user.
PRESETS: dict[str, dict] = {
    # Rekomendasi utama: train square 960 (mosaic), export rect 544x960 untuk browser.
    # Jadwal pendek terbukti di 5-fold kamera: 30 ep + mosaic s/d akhir = 0.365±0.045 mAP50,
    # vs 80 ep + close_mosaic 15 = 0.269±0.022 (overfit mulai ~ep 15; close_mosaic memperparah).
    "v5_960": dict(imgsz=960, batch=8, epochs=30, close_mosaic=0, name="v5_yolo26n_960"),
    # Baseline pembanding di resolusi lama.
    "v5_640": dict(imgsz=640, batch=16, epochs=30, close_mosaic=0, name="v5_yolo26n_640"),
    # Teacher besar (offline, untuk pseudo-label 594 stream HLS) — TIDAK untuk browser.
    "teacher_1280": dict(
        model="yolo11l.pt", imgsz=1280, batch=4, epochs=120, freeze=0, lr0=0.002, name="teacher_yolo11l_1280"
    ),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train YOLO for PATRA High-Angle CCTV PKL Detection")
    p.add_argument("--preset", type=str, choices=tuple(PRESETS), default="", help="Preset konfigurasi v5")
    p.add_argument("--model", type=str, default="yolo26n.pt", help="Base checkpoint (yolo26n.pt, yolo11n.pt, ...)")
    p.add_argument("--data", type=Path, default=DATASET_DIR / "data.yaml", help="Path ke data.yaml")
    p.add_argument("--epochs", type=int, default=80)
    p.add_argument("--imgsz", type=int, default=960, help="Ukuran train square (export bisa rect, lihat export_onnx.py)")
    p.add_argument("--batch", type=int, default=8, help="Batch size (-1 = auto)")
    p.add_argument("--device", type=str, default="", help="'0', 'cpu', atau kosong = auto")
    p.add_argument("--workers", type=int, default=2, help="Dataloader workers (2 aman di Windows)")
    p.add_argument("--cache", type=str, default="", choices=("", "ram", "disk"), help="Cache gambar")
    p.add_argument("--patience", type=int, default=0, help="Early stopping (0 = mati; disarankan untuk val kecil)")
    p.add_argument("--optimizer", type=str, default="SGD", help="SGD | AdamW | auto")
    p.add_argument("--lr0", type=float, default=0.005)
    p.add_argument("--lrf", type=float, default=0.01)
    p.add_argument("--momentum", type=float, default=0.937)
    p.add_argument("--weight-decay", type=float, default=None, help="Default: 5e-4 (SGD) / 0.05 (AdamW)")
    p.add_argument("--warmup-epochs", type=float, default=3.0)
    p.add_argument("--warmup-bias-lr", type=float, default=0.0, help="0.0 mencegah lonjakan lr bias di epoch awal")
    p.add_argument("--freeze", type=int, default=10, help="Jumlah layer awal di-freeze (0 = full fine-tune)")
    p.add_argument("--mosaic", type=float, default=1.0)
    p.add_argument("--close-mosaic", type=int, default=15)
    p.add_argument("--mixup", type=float, default=0.1)
    p.add_argument("--scale", type=float, default=0.5, help="Random scale gain (0.5 -> zoom 0.5x..1.5x)")
    p.add_argument("--translate", type=float, default=0.1)
    p.add_argument("--degrees", type=float, default=0.0)
    p.add_argument("--hsv-v", type=float, default=0.4, help="Variasi brightness siang/malam")
    p.add_argument("--fliplr", type=float, default=0.5)
    p.add_argument("--box", type=float, default=7.5)
    p.add_argument("--cls", type=float, default=0.5)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--name", type=str, default="v5_yolo26n_960", help="Nama folder eksperimen di runs/")
    p.add_argument("--eval-split", type=str, choices=("valid", "test", "none"), default="valid")
    p.add_argument("--no-copy-best", action="store_true", help="Jangan timpa AI-Patra/model/best.pt")
    p.add_argument("--multi-cls", action="store_true", help="Latih 2 kelas (Emperan/Gerobak) terpisah")
    p.add_argument("--skip-audit", action="store_true", help="Lewati audit integritas dataset")

    args = p.parse_args()
    if args.preset:
        defaults = {a.dest: a.default for a in p._actions}
        for key, val in PRESETS[args.preset].items():
            if getattr(args, key) == defaults.get(key):  # hanya isi yang tidak diketik user
                setattr(args, key, val)
    is_adamw = args.optimizer.lower() == "adamw"
    if args.weight_decay is None:
        args.weight_decay = 0.05 if is_adamw else 5e-4
    if is_adamw and args.lr0 == defaults_lr0(p):
        args.lr0 = 0.001  # lr0 SGD (0.005) terlalu besar untuk AdamW
    return args


def defaults_lr0(parser: argparse.ArgumentParser) -> float:
    return next(a.default for a in parser._actions if a.dest == "lr0")


def is_standard_layout(data_yaml: Path) -> bool:
    root = data_yaml.parent
    return all((root / sp / "images").is_dir() for sp in ("train", "valid", "test"))


def resolve_model_path(model: str) -> str:
    """Checkpoint dasar (mis. yolo26n.pt) disimpan di AI-Patra/model/ agar root repo bersih."""
    m = Path(model)
    if not m.is_absolute() and len(m.parts) == 1:
        return str(MODEL_DIR / m.name)
    return str(m)


def main() -> int:
    args = parse_args()

    if not args.skip_audit and is_standard_layout(args.data):
        print("[1/4] Audit integritas & anti-leakage dataset...")
        if not verify_dataset(args.data.parent):
            print("[ERR] Audit dataset gagal. Perbaiki dataset atau gunakan --skip-audit.")
            return 1
    else:
        print("[1/4] Audit dataset dilewati (layout non-standar / --skip-audit).")

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERR] Package `ultralytics` belum terpasang. Jalankan: pip install -r AI-Patra/requirements.txt")
        return 1

    single_cls = not args.multi_cls
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = resolve_model_path(args.model)

    print(
        f"[2/4] Training `{model_path}` | data={args.data} | imgsz={args.imgsz} | epochs={args.epochs} | "
        f"single_cls={single_cls} | opt={args.optimizer} lr0={args.lr0} wd={args.weight_decay} "
        f"warmup_bias_lr={args.warmup_bias_lr} | freeze={args.freeze} | mosaic={args.mosaic} "
        f"scale={args.scale} mixup={args.mixup} | patience={args.patience or 'off'}"
    )

    model = YOLO(model_path)
    train_kwargs = dict(
        data=str(args.data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        patience=args.patience,  # 0 -> Ultralytics menonaktifkan early stopping
        seed=args.seed,
        deterministic=True,
        single_cls=single_cls,
        optimizer=args.optimizer,
        lr0=args.lr0,
        lrf=args.lrf,
        momentum=args.momentum,
        weight_decay=args.weight_decay,
        warmup_epochs=args.warmup_epochs,
        warmup_bias_lr=args.warmup_bias_lr,
        box=args.box,
        cls=args.cls,
        cos_lr=True,
        project=str(RUNS_DIR),
        name=args.name,
        exist_ok=True,
        pretrained=True,
        # Augmentasi CCTV high-angle
        hsv_h=0.015,
        hsv_s=0.5,
        hsv_v=args.hsv_v,
        degrees=args.degrees,
        translate=args.translate,
        scale=args.scale,
        fliplr=args.fliplr,
        flipud=0.0,      # CCTV tidak pernah terbalik
        erasing=0.0,     # random erasing menghapus objek kecil
        mosaic=args.mosaic,
        close_mosaic=args.close_mosaic,
        mixup=args.mixup,
    )
    if args.freeze > 0:
        train_kwargs["freeze"] = args.freeze
    if args.device:
        train_kwargs["device"] = args.device
    if args.cache:
        train_kwargs["cache"] = args.cache

    results = model.train(**train_kwargs)

    save_dir = Path(getattr(results, "save_dir", RUNS_DIR / args.name))
    # Dengan early stopping mati, last.pt = bobot EMA epoch terakhir (bebas bias pemilihan epoch).
    weights_dir = save_dir / "weights"
    src = weights_dir / ("best.pt" if args.patience > 0 else "last.pt")
    if not src.exists():
        src = weights_dir / "best.pt"
    if not src.exists():
        print(f"[ERR] File bobot tidak ditemukan di: {weights_dir}")
        return 1

    if args.no_copy_best:
        eval_weights = src
        print(f"[3/4] --no-copy-best: bobot eksperimen di {src} ({src.stat().st_size / 1e6:.2f} MB)")
    else:
        dst = MODEL_DIR / "best.pt"
        shutil.copy2(src, dst)
        eval_weights = dst
        print(f"[3/4] {src.name} disalin ke: {dst} ({dst.stat().st_size / 1e6:.2f} MB)")

    if args.eval_split != "none":
        split_label = "val" if args.eval_split == "valid" else args.eval_split
        print(f"[4/4] Evaluasi `{eval_weights.name}` pada split `{args.eval_split}`...")
        val_kwargs = dict(
            data=str(args.data),
            split=split_label,
            imgsz=args.imgsz,
            batch=max(1, args.batch if args.batch > 0 else 8),
            workers=args.workers,
            single_cls=single_cls,
            project=str(RUNS_DIR),
            name=f"{args.name}_{args.eval_split}_eval",
            exist_ok=True,
        )
        if args.device:
            val_kwargs["device"] = args.device
        metrics = YOLO(str(eval_weights)).val(**val_kwargs)
        box = getattr(metrics, "box", None)
        if box is not None:
            print(f"\n================ {args.eval_split.upper()} SPLIT METRICS ================")
            print(f"Precision : {box.mp:.4f}")
            print(f"Recall    : {box.mr:.4f}")
            print(f"mAP@50    : {box.map50:.4f}")
            print(f"mAP@50-95 : {box.map:.4f}")
            print("====================================================")
    else:
        print("[4/4] Evaluasi pasca-training dilewati (--eval-split none).")

    h, w = (round(args.imgsz * 9 / 16 / 32) * 32, args.imgsz)
    print("\nLangkah berikutnya:")
    print(f"  1) Export ONNX rect 16:9 : python AI-Patra/export_onnx.py --weights {eval_weights} --imgsz {h} {w} --out AI-Patra/model/{args.name}.onnx --no-copy-fe")
    print(f"  2) Evaluasi ONNX         : python AI-Patra/evaluate_models.py --split valid --models {args.name}=AI-Patra/model/{args.name}.onnx --run-name {args.name}_valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
