# AI-Patra — Pelatihan YOLO26n High-Angle, Export ONNX & Katalog CCTV Publik

Folder ini menyimpan seluruh aset pelatihan AI dan skrip *offline pre-sync* katalog CCTV publik untuk **PATRA** (tanpa server AI Python — inferensi berjalan langsung di browser melalui `FE-Patra/src/services/yolo/`).

## Struktur Folder
- `dataset/` — Dataset *high-angle* CCTV 16:9 (`data.yaml`, `train/`, `valid/`, `test/`), split berbasis kamera (0% *leakage*).
- `dataset_quarantine/` — Dibuat oleh `apply_label_fixes.py`: `needs_relabel/` (frame background yang ternyata berisi PKL tak berlabel, perlu dilabeli ulang manual) + `label_backup_v5/` (label asli untuk `--revert`).
- `curation/label_fixes_v5.json` — Manifest audit visual label pertama (hapus box duplikat/parsial, tambah box objek statis yang hilang, karantina frame).
- `curation/label_fixes_v6.json` — Aturan **opsi 1**: semua gerobak/lapak di trotoar dilabeli, buka maupun tertutup terpal. Kandidat train+valid dari prediksi out-of-fold yang diverifikasi visual; test direview buta. Diterapkan setelah v5. Gambar di `needs_relabel/` juga harus dilabeli dengan aturan ini.
- `model/` — Bobot `best.pt`, hasil ekspor `best.onnx` + sidecar `best.json` (ukuran input), disalin ke `FE-Patra/public/models/`.
- `cctv_catalog/` — Skrip `indonesia_sources.py` dan snapshot JSON cadangan `cctv_snapshot.json`.
- `prepare_dataset.py` — Normalisasi label, split camera-grouped, audit integritas.
- `apply_label_fixes.py` — Terapkan / batalkan manifest perbaikan label (default dry-run).
- `kfold_camera.py` — K-fold berbasis kamera (`make`) + ringkasan mean ± sd (`report`).
- `yolo.py` — Training v5 (preset `v5_960`, `v5_640`, `teacher_1280`).
- `export_onnx.py` — Ekspor ONNX statis opset 12, mendukung input rect (`--imgsz 544 960`), batas 12 MB.
- `verify_onnx.py` — Parity `.pt` vs `.onnx` (ukuran input auto dari ONNX).
- `evaluate_models.py` — Evaluasi ONNX: sweep threshold, mAP, analisis ukuran/kamera/cahaya, visual error.

## Alur Eksekusi v5 (PowerShell, dari root repo)

```powershell
# 0. Dependensi
pip install -r AI-Patra/requirements.txt -r AI-Patra/requirements-onnx.txt

# 1. Perbaikan label hasil audit (lihat dulu dry-run, lalu terapkan)
python AI-Patra/apply_label_fixes.py
python AI-Patra/apply_label_fixes.py --apply
python AI-Patra/prepare_dataset.py --verify

# 2. Evaluasi jujur: 5-fold berbasis kamera (train+valid digabung, test disimpan)
python AI-Patra/kfold_camera.py make
foreach ($k in 0..4) { python AI-Patra/yolo.py --preset v5_640 --data AI-Patra/folds/fold$k/data.yaml --name v5_640_f$k --no-copy-best --eval-split none }
foreach ($k in 0..4) { python AI-Patra/yolo.py --preset v5_960 --data AI-Patra/folds/fold$k/data.yaml --name v5_960_f$k --no-copy-best --eval-split none }
python AI-Patra/kfold_camera.py report --prefix v5_640_f
python AI-Patra/kfold_camera.py report --prefix v5_960_f

# 3. Model final: latih dengan train+valid (konfigurasi sudah dipilih via k-fold), export rect 16:9
python AI-Patra/kfold_camera.py full
python AI-Patra/yolo.py --preset v5_960 --data AI-Patra/folds/full/data.yaml --name v5_960_full --eval-split none
python AI-Patra/export_onnx.py --imgsz 544 960
python AI-Patra/verify_onnx.py
python AI-Patra/evaluate_models.py --preset test_best   # evaluasi test SEKALI
```

Catatan:
- Bandingkan eksperimen dengan **mean ± sd k-fold** (`mAP50 last`), bukan mAP valid epoch terbaik (±0.05 noise).
- Early stopping dimatikan secara default (`--patience 0`); bobot yang disalin adalah `last.pt` (EMA epoch terakhir).
- Ukuran ONNX hanya bergantung jumlah parameter: `yolo26n` di 544x960 tetap ~9.5 MB.
- FE (`FE-Patra/src/services/yolo/yoloInference.ts`) membaca ukuran input dari metadata ONNX / `best.json`, jadi model 640x640 lama tetap berjalan.

## Referensi Kontrak
Lihat `../.agent/rules/data_contract.md` (Section 4 & 5) dan `../docs/task.md` (`T1-05` s/d `T1-08`).
