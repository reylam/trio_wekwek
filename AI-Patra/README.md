# AI-Patra — Pelatihan YOLO26n High-Angle, Export ONNX & Katalog CCTV Publik

Folder ini menyimpan seluruh aset pelatihan AI dan skrip *offline pre-sync* katalog CCTV publik untuk **PATRA** (tanpa server AI Python — inferensi berjalan langsung di browser melalui `FE-Patra/src/services/yolo/`).

## Struktur Folder
- `dataset/` — Dataset *high-angle* CCTV (`data.yaml`, `train/`, `valid/`, `test/`, `raw/`).
- `model/` — Bobot master `best.pt` dan hasil ekspor `best.onnx` (disalin ke `FE-Patra/public/models/best.onnx`).
- `cctv_catalog/` — Skrip `indonesia_sources.py` dan snapshot JSON cadangan `cctv_snapshot.json`.
- `prepare_dataset.py` — Normalisasi label 5-kolom YOLO, *camera-grouped stratified split* (0% *leakage*), dan audit integritas dataset.
- `yolo.py` — Skrip pelatihan/fine-tuning `yolo26n` sudut *high-angle* (`T1-08`).
- `export_onnx.py` — Ekspor `best.pt -> best.onnx` (`opset=12`, `dynamic=False`, `imgsz=640`, ukuran `<= 12 MB`) + salin otomatis ke `FE-Patra/public/models/best.onnx`.
- `verify_onnx.py` — Verifikasi *parity* IoU `.pt` vs `.onnx` (target `mean IoU >= 0.50`) pada split `test/`.

## Alur Eksekusi (`Python 3.11+` / Google Colab GPU)

```bash
# 1. Install dependencies (di venv Python 3.11+ atau Google Colab)
pip install -r AI-Patra/requirements.txt -r AI-Patra/requirements-onnx.txt

# 2. Verifikasi integritas & 0% camera leakage dataset
python AI-Patra/prepare_dataset.py --verify
# (Jika menambah gambar berlabel baru ke dataset/train, jalankan ulang:)
# python AI-Patra/prepare_dataset.py --split

# 3. Fine-tuning YOLO26n high-angle (default single_cls=True -> 1 kelas PKL)
python AI-Patra/yolo.py --epochs 100 --batch 16 --imgsz 640

# 4. Export ke ONNX statis (opset=12) & salin otomatis ke FE-Patra/public/models/best.onnx
python AI-Patra/export_onnx.py

# 5. Verifikasi parity .pt vs .onnx pada split test (target IoU >= 0.50)
python AI-Patra/verify_onnx.py
```

## Referensi Kontrak
Lihat `../.agent/rules/data_contract.md` (Section 4 & 5) dan `../docs/task.md` (`T1-05` s/d `T1-08`).
