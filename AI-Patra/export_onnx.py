"""
PATRA — Export YOLO PyTorch (`best.pt`) -> Browser-Ready ONNX (`best.onnx`).

Spesifikasi:
- `opset=12`, `dynamic=False` (static shape), `simplify=True`, ukuran file `<= 12 MB`.
- Input boleh persegi (`--imgsz 640`) ATAU persegi panjang 16:9 (`--imgsz 544 960` = H W).
  Rect 544x960 memberi objek 1.5x lebih besar dari letterbox 640x640 dengan compute ~1.27x,
  karena 44% piksel input 640x640 hanya berisi padding untuk frame 16:9.
  Ukuran file TIDAK bergantung resolusi (hanya jumlah parameter).
- Menulis sidecar `<nama>.json` ({"input": {"height", "width"}, "format", ...}) yang dibaca
  FE (`FE-Patra/src/services/yolo/yoloInference.ts`) untuk menyesuaikan letterbox otomatis.
- Salin otomatis ke `FE-Patra/public/models/best.onnx` + `best.json` (matikan via `--no-copy-fe`).

Contoh:
  python AI-Patra/export_onnx.py                                   # model/best.pt, 640x640
  python AI-Patra/export_onnx.py --imgsz 544 960                   # rect 16:9 (disarankan untuk model 960)
  python AI-Patra/export_onnx.py --weights AI-Patra/runs/v5_yolo26n_960/weights/last.pt --imgsz 544 960 --out AI-Patra/model/v5_960.onnx --no-copy-fe
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
DEFAULT_WEIGHTS = AI_ROOT / "model" / "best.pt"
DEFAULT_ONNX_OUT = AI_ROOT / "model" / "best.onnx"
FE_MODEL_DIR = REPO_ROOT / "FE-Patra" / "public" / "models"
MAX_MODEL_MB = 12.0
STRIDE = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PATRA YOLO best.pt to browser-ready ONNX")
    parser.add_argument("--weights", type=Path, default=DEFAULT_WEIGHTS, help="Path ke .pt")
    parser.add_argument("--out", type=Path, default=DEFAULT_ONNX_OUT, help="Path output .onnx")
    parser.add_argument(
        "--imgsz", type=int, nargs="+", default=[640],
        help="Ukuran input statis: 1 angka (persegi) atau 2 angka H W (mis. 544 960)",
    )
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset (default: 12)")
    parser.add_argument("--no-simplify", action="store_true", help="Nonaktifkan ONNX graph simplify")
    parser.add_argument("--no-copy-fe", action="store_true", help="Jangan salin ke FE-Patra/public/models/")
    args = parser.parse_args()
    if len(args.imgsz) == 1:
        args.imgsz = [args.imgsz[0], args.imgsz[0]]
    elif len(args.imgsz) != 2:
        parser.error("--imgsz menerima 1 angka (persegi) atau 2 angka (H W).")
    bad = [v for v in args.imgsz if v % STRIDE]
    if bad:
        parser.error(f"--imgsz harus kelipatan {STRIDE}, dapat {args.imgsz}.")
    return args


def inspect_onnx(onnx_path: Path) -> dict:
    info: dict = {}
    try:
        import onnx
        import onnxruntime as ort
    except ImportError:
        print("[WARN] `onnx` / `onnxruntime` belum terpasang; melewati inspeksi tensor.")
        return info

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
            info["format"] = "end2end"
            print("Format  : End-to-End NMS built-in [1, N, 6] (x1, y1, x2, y2, score, cls)")
        elif len(out_shape) == 3:
            info["format"] = "raw"
            print(f"Format  : Raw YOLO head {out_shape} (membutuhkan NMS di postprocess)")
        else:
            info["format"] = "unknown"
            print(f"Format  : Custom shape {out_shape} — pastikan parser FE kompatibel.")
        info["output_shape"] = [int(x) if isinstance(x, int) else str(x) for x in out_shape]
    print("=======================================================\n")
    return info


def main() -> int:
    args = parse_args()
    if not args.weights.exists():
        print(f"[ERR] File weights tidak ditemukan: {args.weights}")
        return 1
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERR] Package `ultralytics` belum terpasang. Jalankan: pip install -r AI-Patra/requirements.txt")
        return 1

    h, w = args.imgsz
    print(f"[1/3] Export `{args.weights}` -> ONNX (opset={args.opset}, static {h}x{w}, simplify={not args.no_simplify})...")
    exported = YOLO(str(args.weights)).export(
        format="onnx",
        imgsz=[h, w],
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
        print(f"[WARN] Ukuran model ({size_mb:.2f} MB) > {MAX_MODEL_MB:.0f} MB. Gunakan varian nano atau kuantisasi.")

    info = inspect_onnx(args.out)
    sidecar = {
        "input": {"height": h, "width": w},
        "format": info.get("format", "unknown"),
        "output_shape": info.get("output_shape"),
        "classes": ["PKL"],
        "letterbox_pad_value": 114,
        "source_weights": args.weights.name,
    }
    sidecar_path = args.out.with_suffix(".json")
    sidecar_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    print(f"      Sidecar metadata: {sidecar_path}")

    if not args.no_copy_fe:
        FE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.out, FE_MODEL_DIR / "best.onnx")
        shutil.copy2(sidecar_path, FE_MODEL_DIR / "best.json")
        print(f"[3/3] Model + sidecar disalin ke Frontend: {FE_MODEL_DIR}")
    else:
        print("[3/3] Penyalinan ke FE-Patra dilewati (--no-copy-fe).")

    print(f"\nLangkah berikutnya: python AI-Patra/verify_onnx.py --pt {args.weights} --onnx {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
