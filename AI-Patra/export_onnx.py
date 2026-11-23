"""
PATRA — Export YOLO26n PyTorch (`best.pt`) -> Browser-Ready ONNX (`best.onnx`) (T1-08).

Spesifikasi terkunci (docs/task.md T1-08):
- `opset=12`, `dynamic=False`, `imgsz=640`, `simplify=True`
- Validasi ukuran file `<= 12 MB` agar cepat dimuat oleh ONNX Runtime Web di browser.
- Inspeksi bentuk tensor input/output (mendukung `[1, 300, 6]` end2end & `[1, 4+nc, 8400]`).
- Salin otomatis ke `FE-Patra/public/models/best.onnx` (dapat dimatikan via `--no-copy-fe`).

Contoh penggunaan:
  python export_onnx.py
  python export_onnx.py --weights AI-Patra/model/best.pt --opset 12 --imgsz 640
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
DEFAULT_WEIGHTS = AI_ROOT / "model" / "best.pt"
DEFAULT_ONNX_OUT = AI_ROOT / "model" / "best.onnx"
FE_MODEL_DST = REPO_ROOT / "FE-Patra" / "public" / "models" / "best.onnx"
MAX_MODEL_MB = 12.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PATRA YOLO26n best.pt to browser-ready ONNX")
    parser.add_argument("--weights", type=Path, default=DEFAULT_WEIGHTS, help="Path ke best.pt")
    parser.add_argument("--out", type=Path, default=DEFAULT_ONNX_OUT, help="Path output best.onnx")
    parser.add_argument("--imgsz", type=int, default=640, help="Input size statis (default: 640)")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version (default: 12)")
    parser.add_argument("--no-simplify", action="store_true", help="Nonaktifkan ONNX graph simplify")
    parser.add_argument("--no-copy-fe", action="store_true", help="Jangan salin otomatis ke FE-Patra/public/models/")
    parser.add_argument(
        "--preset",
        type=str,
        choices=("v2_ft", "v2_base", "v3_ft", "v3_base"),
        default="",
        help="Preset export singkat untuk eksperimen dataset_v2/v3 (--no-copy-fe).",
    )
    return parser.parse_args()


def inspect_onnx(onnx_path: Path) -> None:
    try:
        import onnx
        import onnxruntime as ort
    except ImportError:
        print("[WARN] `onnx` / `onnxruntime` belum terpasang; melewati inspeksi tensor.")
        return

    model = onnx.load(str(onnx_path))
    onnx.checker.check_model(model)

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inputs = [(i.name, i.shape, i.type) for i in sess.get_inputs()]
    outputs = [(o.name, o.shape, o.type) for o in sess.get_outputs()]

    print("\n================ ONNX MODEL INSPECTION ================")
    print(f"File    : {onnx_path}")
    print(f"Size    : {onnx_path.stat().st_size / 1e6:.2f} MB (limit <= {MAX_MODEL_MB:.0f} MB)")
    print(f"Inputs  : {inputs}")
    print(f"Outputs : {outputs}")

    if outputs:
        out_shape = outputs[0][1]
        if len(out_shape) == 3 and out_shape[2] == 6:
            print("Format  : End-to-End NMS built-in [1, N, 6] (x1, y1, x2, y2, score, cls)")
        elif len(out_shape) == 3 and out_shape[2] == 8400:
            print("Format  : Raw YOLO head [1, 4+nc, 8400] (membutuhkan NMS di postprocess)")
        else:
            print(f"Format  : Custom shape {out_shape} — pastikan parser FE kompatibel.")
    print("=======================================================\n")


def main() -> int:
    args = parse_args()
    if args.preset == "v2_ft":
        args.weights = AI_ROOT / "runs" / "patra_v2_curated_ft" / "weights" / "best.pt"
        args.out = AI_ROOT / "model" / "patra_v2_curated_ft.onnx"
        args.imgsz = 640
        args.no_copy_fe = True
    elif args.preset == "v2_base":
        args.weights = AI_ROOT / "runs" / "patra_v2_curated_base" / "weights" / "best.pt"
        args.out = AI_ROOT / "model" / "patra_v2_curated_base.onnx"
        args.imgsz = 640
        args.no_copy_fe = True
    elif args.preset == "v3_ft":
        args.weights = AI_ROOT / "runs" / "patra_v3_gerobak_ft" / "weights" / "best.pt"
        args.out = AI_ROOT / "model" / "patra_v3_gerobak_ft.onnx"
        args.imgsz = 640
        args.no_copy_fe = True
    elif args.preset == "v3_base":
        args.weights = AI_ROOT / "runs" / "patra_v3_gerobak_base" / "weights" / "best.pt"
        args.out = AI_ROOT / "model" / "patra_v3_gerobak_base.onnx"
        args.imgsz = 640
        args.no_copy_fe = True
    if not args.weights.exists():
        print(f"[ERR] File weights tidak ditemukan: {args.weights}")
        print("      Jalankan `python AI-Patra/yolo.py` terlebih dahulu.")
        return 1

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERR] Package `ultralytics` belum terpasang. Jalankan: pip install -r AI-Patra/requirements.txt")
        return 1

    print(
        f"[1/3] Mengekspor `{args.weights}` -> ONNX "
        f"(opset={args.opset}, dynamic=False, imgsz={args.imgsz}, simplify={not args.no_simplify})..."
    )
    model = YOLO(str(args.weights))
    exported = model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=args.opset,
        dynamic=False,
        simplify=not args.no_simplify,
    )

    exported_path = Path(exported)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if exported_path.resolve() != args.out.resolve():
        shutil.move(str(exported_path), str(args.out))

    size_mb = args.out.stat().st_size / 1e6
    print(f"[2/3] Export selesai: {args.out} ({size_mb:.2f} MB)")
    if size_mb > MAX_MODEL_MB:
        print(
            f"[WARN] Ukuran model ({size_mb:.2f} MB) melebihi target T1-08 (<= {MAX_MODEL_MB:.0f} MB). "
            "Pertimbangkan memakai varian nano (`yolo26n.pt`) atau kuantisasi FP16/INT8."
        )

    inspect_onnx(args.out)

    if not args.no_copy_fe:
        FE_MODEL_DST.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.out, FE_MODEL_DST)
        print(f"[3/3] Model disalin ke Frontend: {FE_MODEL_DST}")
    else:
        print("[3/3] Penyalinan ke FE-Patra dilewati (--no-copy-fe).")

    print("\nLangkah berikutnya: python AI-Patra/verify_onnx.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
