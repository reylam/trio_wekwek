# AI-Patra — Pelatihan YOLO26n High-Angle, Export ONNX & Katalog CCTV Publik

Folder ini menyimpan seluruh aset pelatihan AI dan skrip *offline pre-sync* katalog CCTV publik untuk **PATRA** (tanpa server AI Python — inferensi berjalan langsung di browser melalui `FE-Patra/src/services/yolo/`).

## Struktur Folder
- `dataset/` — Dataset *high-angle* CCTV (`data.yaml`, `train/`, `valid/`, `test/`).
- `model/` — Bobot master `best.pt` dan hasil ekspor `best.onnx` (disalin ke `FE-Patra/public/models/best.onnx`).
- `cctv_catalog/` — Skrip `indonesia_sources.py` dan snapshot JSON cadangan `cctv_snapshot.json`.
- `yolo.py` — Skrip pelatihan/fine-tuning `yolo26n` sudut *high-angle* (T1-08).
- `export_onnx.py` — Ekspor `best.pt -> best.onnx` (`opset=12`, `dynamic=False`, `imgsz=640`).
- `verify_onnx.py` — Verifikasi *parity* IoU `.pt` vs `.onnx` sebelum disalin ke `FE-Patra/public/models/`.

## Referensi Kontrak
Lihat `../.agent/rules/data_contract.md` (Section 4 & 5) dan `../docs/task.md` (`T1-05` s/d `T1-08`).
