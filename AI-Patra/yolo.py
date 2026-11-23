"""
PATRA — High-Angle CCTV PKL Detection Training Script (T1-08).

Melatih / fine-tuning model YOLO26n pada dataset `AI-Patra/dataset/data.yaml`
yang sudah di-split secara camera-grouped (0% leakage) dan menyalin bobot terbaik
ke `AI-Patra/model/best.pt`.

Default mode: `single_cls=True` (menggabungkan 6 sub-kelas Emperan/Gerobak/Panggul/
Payung/Sepeda-motor/Terpal menjadi 1 kelas `PKL` sesuai kebutuhan UI PATRA, tanpa
mengubah file label asli). Gunakan `--multi-cls` bila ingin melatih 6 kelas terpisah.

Contoh penggunaan:
  python yolo.py                                  # Training standar (100 epoch, single_cls=True)
  python yolo.py --epochs 120 --batch 16 --device 0
  python yolo.py --multi-cls --epochs 100         # Training 6 sub-kelas
  python yolo.py --model yolo26n.pt --imgsz 640
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train YOLO for PATRA High-Angle CCTV PKL Detection")
    parser.add_argument("--model", type=str, default="yolo26n.pt", help="Base checkpoint (mis. yolo11n.pt, yolo26n.pt)")
    parser.add_argument("--data", type=Path, default=DATASET_DIR / "data.yaml", help="Path ke data.yaml")
    parser.add_argument("--epochs", type=int, default=120, help="Jumlah epoch training (default: 120)")
    parser.add_argument("--imgsz", type=int, default=640, help="Ukuran input gambar (default: 640)")
    parser.add_argument("--batch", type=int, default=16, help="Batch size (default: 16, gunakan -1 untuk auto)")
    parser.add_argument("--device", type=str, default="", help="Device GPU/CPU, mis. '0' atau 'cpu' (default: auto)")
    parser.add_argument("--workers", type=int, default=2, help="Jumlah dataloader workers (default: 2, aman untuk Windows)")
    parser.add_argument("--patience", type=int, default=35, help="Early stopping patience (default: 35)")
    parser.add_argument("--optimizer", type=str, default="AdamW", help="Optimizer (default: AdamW)")
    parser.add_argument("--lr0", type=float, default=0.001, help="Initial learning rate (default: 0.001)")
    parser.add_argument("--weight-decay", type=float, default=0.001, help="Weight decay regularization (default: 0.001)")
    parser.add_argument("--freeze", type=int, default=0, help="Jumlah layer backbone yang di-freeze (mis. 10 untuk dataset kecil)")
    parser.add_argument("--mosaic", type=float, default=0.4, help="Probabilitas mosaic (default: 0.4, aman untuk tiny objects)")
    parser.add_argument("--close-mosaic", type=int, default=25, help="Matikan mosaic N epoch terakhir (default: 25)")
    parser.add_argument("--scale", type=float, default=0.25, help="Random scale gain (default: 0.25, agar tiny objects tidak hilang)")
    parser.add_argument("--translate", type=float, default=0.05, help="Random translation fraction (default: 0.05)")
    parser.add_argument("--hsv-v", type=float, default=0.35, help="HSV value/brightness augmentation gain (default: 0.35)")
    parser.add_argument("--box", type=float, default=7.5, help="Box regression loss gain (default: 7.5)")
    parser.add_argument("--warmup-epochs", type=float, default=5.0, help="Jumlah warmup epoch (default: 5.0)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed deterministik")
    parser.add_argument("--name", type=str, default="patra_yolo26n_pkl", help="Nama folder eksperimen di runs/")
    parser.add_argument(
        "--eval-split",
        type=str,
        choices=("valid", "test", "none"),
        default="valid",
        help="Split evaluasi pasca-training (default: valid agar test set tidak bocor saat tuning)",
    )
    parser.add_argument(
        "--no-copy-best",
        action="store_true",
        help="Jangan timpa AI-Patra/model/best.pt (simpan bobot hanya di AI-Patra/runs/<name>/weights/best.pt)",
    )
    parser.add_argument(
        "--multi-cls",
        action="store_true",
        help="Latih 6 sub-kelas terpisah (default: single_cls=True -> 1 kelas PKL)",
    )
    parser.add_argument(
        "--preset",
        type=str,
        choices=("v2_ft", "v2_base", "v3_ft", "v3_base"),
        default="",
        help="Preset konfigurasi eksperimen singkat agar perintah CLI tidak terpotong.",
    )
    parser.add_argument(
        "--skip-audit",
        action="store_true",
        help="Lewati audit integritas dataset sebelum training",
    )
    return parser.parse_args()


def apply_preset(args: argparse.Namespace) -> None:
    if not args.preset:
        return
    args.data = AI_ROOT / "dataset_v2" / "data_v2.yaml"
    args.imgsz = 640
    args.batch = 16
    args.device = "0"
    args.scale = 0.35
    args.translate = 0.08
    args.hsv_v = 0.45
    args.skip_audit = True
    args.no_copy_best = True
    args.eval_split = "valid"
    if args.preset == "v2_ft":
        args.model = str(MODEL_DIR / "best.pt")
        args.name = "patra_v2_curated_ft"
        args.epochs = 60
        args.patience = 25
        args.lr0 = 0.00025
        args.warmup_epochs = 2.0
        args.mosaic = 0.35
        args.close_mosaic = 15
    elif args.preset == "v2_base":
        args.model = "yolo26n.pt"
        args.name = "patra_v2_curated_base"
        args.epochs = 120
        args.patience = 35
        args.lr0 = 0.001
        args.warmup_epochs = 5.0
        args.mosaic = 0.40
        args.close_mosaic = 25
    elif args.preset == "v3_ft":
        args.data = AI_ROOT / "dataset_v3_gerobak" / "data_v3.yaml"
        args.model = str(MODEL_DIR / "best.pt")
        args.name = "patra_v3_gerobak_ft"
        args.epochs = 60
        args.patience = 25
        args.lr0 = 0.0003
        args.warmup_epochs = 2.0
        args.mosaic = 0.35
        args.close_mosaic = 15
    elif args.preset == "v3_base":
        args.data = AI_ROOT / "dataset_v3_gerobak" / "data_v3.yaml"
        args.model = "yolo26n.pt"
        args.name = "patra_v3_gerobak_base"
        args.epochs = 120
        args.patience = 35
        args.lr0 = 0.001
        args.warmup_epochs = 5.0
        args.mosaic = 0.40
        args.close_mosaic = 25


def main() -> int:
    args = parse_args()
    apply_preset(args)

    if not args.skip_audit:
        print("[1/4] Menjalankan audit integritas & anti-leakage dataset...")
        if not verify_dataset(args.data.parent):
            print("[ERR] Audit dataset gagal. Jalankan `python prepare_dataset.py --split` terlebih dahulu.")
            return 1

    try:
        from ultralytics import YOLO
    except ImportError:
        print(
            "[ERR] Package `ultralytics` belum terpasang.\n"
            "      Jalankan: pip install -r AI-Patra/requirements.txt"
        )
        return 1

    single_cls = not args.multi_cls
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    # Simpan checkpoint base (mis. yolo26n.pt) di AI-Patra/model/ agar root repo tetap bersih
    model_arg = Path(args.model)
    if not model_arg.is_absolute() and len(model_arg.parts) == 1:
        model_path = str(MODEL_DIR / model_arg.name)
    else:
        model_path = str(model_arg)

    print(
        f"[2/4] Memulai fine-tuning `{model_path}` | data={args.data} | "
        f"imgsz={args.imgsz} | epochs={args.epochs} | single_cls={single_cls} | "
        f"opt={args.optimizer} lr0={args.lr0} freeze={args.freeze} mosaic={args.mosaic} scale={args.scale}"
    )

    model = YOLO(model_path)

    # Augmentasi & regularisasi khusus dataset CCTV kecil + tiny objects (<1% area gambar)
    train_kwargs = dict(
        data=str(args.data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        patience=args.patience,
        seed=args.seed,
        single_cls=single_cls,
        optimizer=args.optimizer,
        lr0=args.lr0,
        lrf=0.01,
        warmup_epochs=args.warmup_epochs,
        weight_decay=args.weight_decay,
        box=args.box,
        cos_lr=True,
        project=str(RUNS_DIR),
        name=args.name,
        exist_ok=True,
        pretrained=True,
        # CCTV & tiny-object-safe augmentations
        hsv_h=0.015,
        hsv_s=0.45,
        hsv_v=args.hsv_v,  # Adaptasi siang/malam & silau lampu malam CCTV
        degrees=3.0,       # Kemiringan kamera CCTV tipis
        translate=args.translate,
        scale=args.scale,
        fliplr=0.50,
        flipud=0.0,     # CCTV tidak pernah upside-down
        erasing=0.0,    # Hindari random erasing yang menghapus objek kecil
        mosaic=args.mosaic,
        close_mosaic=args.close_mosaic,
    )
    if args.freeze > 0:
        train_kwargs["freeze"] = args.freeze
    if args.device:
        train_kwargs["device"] = args.device

    results = model.train(**train_kwargs)

    save_dir = Path(getattr(results, "save_dir", RUNS_DIR / args.name))
    best_pt_src = save_dir / "weights" / "best.pt"
    if not best_pt_src.exists():
        print(f"[ERR] File bobot terbaik tidak ditemukan di: {best_pt_src}")
        return 1

    if args.no_copy_best:
        eval_weights = best_pt_src
        print(
            f"[3/4] --no-copy-best aktif: AI-Patra/model/best.pt dipertahankan. "
            f"Bobot eksperimen tersimpan di: {best_pt_src} ({best_pt_src.stat().st_size / 1e6:.2f} MB)"
        )
    else:
        best_pt_dst = MODEL_DIR / "best.pt"
        shutil.copy2(best_pt_src, best_pt_dst)
        eval_weights = best_pt_dst
        print(f"[3/4] Bobot terbaik disalin ke: {best_pt_dst} ({best_pt_dst.stat().st_size / 1e6:.2f} MB)")

    if args.eval_split != "none":
        split_label = "val" if args.eval_split == "valid" else args.eval_split
        print(f"[4/4] Mengevaluasi bobot terbaik pada split `{args.eval_split}`...")
        best_model = YOLO(str(eval_weights))
        val_kwargs = dict(
            data=str(args.data),
            split=split_label,
            imgsz=args.imgsz,
            workers=args.workers,
            single_cls=single_cls,
            project=str(RUNS_DIR),
            name=f"{args.name}_{args.eval_split}_eval",
            exist_ok=True,
        )
        if args.device:
            val_kwargs["device"] = args.device

        metrics = best_model.val(**val_kwargs)
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

    print("\nLangkah berikutnya:")
    print(f"  1) Export ONNX eksperimen: python AI-Patra/export_onnx.py --weights {eval_weights} --out AI-Patra/model/{args.name}.onnx --imgsz {args.imgsz} --no-copy-fe")
    print(f"  2) Evaluasi pada valid   : python AI-Patra/evaluate_models.py --split valid --models patra_orig=AI-Patra/model/best_patra_highangle.onnx {args.name}=AI-Patra/model/{args.name}.onnx --run-name cmp_valid_{args.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
