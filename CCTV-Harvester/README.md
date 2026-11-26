# CCTV-Harvester (Auto-Screenshot ROI 5 Menit + Auto-Label Gemini Delay 5 Detik + Export Roboflow)

Folder mandiri di luar `AI-Patra`, `FE-Patra`, dan `BE-Patra` untuk membangun dataset PKL secara otomatis dari CCTV publik.

## Alur 2 Tahap (Rekomendasi untuk Dataset Roboflow)

### Tahap 1: Auto-Screenshot + Crop ROI Setiap 5 Menit (`capture_roi_loop.py`)
Mengambil frame dari CCTV katalog, memfilter kamera berkualitas bagus (`quality_filter.py`), lalu memotong sesuai poligon ROI dan menyimpannya ke folder staging internal `CCTV-Harvester/.state/raw_roi_captures/`:

```powershell
# Jalankan otomatis tiap 5 menit (300 detik) + skip kamera jelek
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --interval-sec 300 --max-cameras 30 --skip-known-bad

# Filter kota tertentu + pakai ROI bawah default bila kamera belum punya roi_polygon
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --city Semarang --interval-sec 300 --default-bottom-roi

# Uji cepat 1 putaran saja
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --once --max-cameras 10
```

### Tahap 2: Auto-Label Gemini (Delay 5 Detik) + Export Terpadu (`label_with_gemini.py`)
Melabeli gambar yang sudah terkumpul dengan jeda **5 detik** antar request Gemini agar aman dari rate limit (otomatis resume bila dihentikan & dijalankan lagi):

```powershell
# Label semua screenshot di .state/raw_roi_captures/ dengan jeda 5 detik
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/label_with_gemini.py --delay-sec 5
```

Folder **`CCTV-Harvester/output/`** dijaga tetap bersih dan **hanya berisi `dataset_pkl/`** (khusus gambar yang terdeteksi PKL):
- `dataset_pkl/images/*.jpg` -> gambar asli/ROI yang terdeteksi PKL
- `dataset_pkl/labels/*.txt` -> anotasi format **YOLO** (`Emperan`, `Gerobak`, `Panggul`, `Payung`, `Sepeda-motor`, `Terpal`)
- `dataset_pkl/previews/*.jpg` -> gambar preview dengan bounding box & label kelas (khusus gambar PKL)
- `dataset_pkl/data.yaml` -> konfigurasi kelas siap upload ke Roboflow / YOLO
- *(Opsional `--export-coco`)* `_annotations.coco.json` di dalam `dataset_pkl/`
- Seluruh state internal (rotasi kamera, daftar kamera jelek, cache resume Gemini) disimpan terpisah di `CCTV-Harvester/.state/` (di-gitignore).

## Mode Cepat 1 Langkah (`monitor_cctv.py`)
Jika ingin langsung capture + filter kualitas + auto-label dalam 1 skrip (output hanya masuk ke `CCTV-Harvester/output/dataset_pkl/`):

```powershell
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/monitor_cctv.py --max-cameras 25 --delay-sec 5 --skip-known-bad
```

## Konfigurasi API Key
API key disimpan secara lokal di `CCTV-Harvester/.env` (sudah di-gitignore). Lihat `.env.example` untuk formatnya.
