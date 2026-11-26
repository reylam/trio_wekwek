# CCTV-Harvester (Auto-Screenshot ROI 5 Menit + Auto-Label Gemini Delay 5 Detik + Export Roboflow)

Folder mandiri di luar `AI-Patra`, `FE-Patra`, dan `BE-Patra` untuk membangun dataset PKL secara otomatis dari CCTV publik.

## Alur 2 Tahap (Rekomendasi untuk Dataset Roboflow)

### Tahap 1: Auto-Screenshot + Crop ROI Setiap 5 Menit (`capture_roi_loop.py`)
Mengambil frame dari CCTV katalog, memisahkan kamera **bagus vs jelek** (`quality_filter.py`), lalu memotong sesuai poligon ROI dan menyimpannya ke `output/raw_roi_captures/`:

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
# Label semua screenshot di raw_roi_captures/ dengan jeda 5 detik
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/label_with_gemini.py --delay-sec 5

# Ikut sertakan gambar bersih 0-PKL (background negative) ke output/dataset_negatif_bersih/
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/label_with_gemini.py --delay-sec 5 --include-empty
```

Hasil Tahap 2 disimpan langsung ke **`CCTV-Harvester/output/dataset_pkl/`** (khusus gambar yang terdeteksi PKL, agar tidak dobel):
- `images/*.jpg` -> gambar asli/ROI yang terdeteksi PKL
- `labels/*.txt` -> anotasi format **YOLO** (`Emperan`, `Gerobak`, `Panggul`, `Payung`, `Sepeda-motor`, `Terpal`)
- `previews/*.jpg` -> gambar preview dengan bounding box & label kelas (khusus gambar PKL)
- `data.yaml` -> konfigurasi kelas siap upload ke Roboflow / YOLO
- *(Opsional `--export-coco`)* `_annotations.coco.json` di dalam `dataset_pkl/`
- Cache JSON auto-resume disimpan terpisah di `CCTV-Harvester/output/.gemini_cache/` (dan gambar bersih 0-PKL masuk ke `output/dataset_negatif_bersih/` bila `--include-empty` dipakai).

## Mode Cepat 1 Langkah (`monitor_cctv.py`)
Jika ingin langsung capture + filter bagus/jelek + auto-label dalam 1 skrip:

```powershell
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/monitor_cctv.py --max-cameras 25 --delay-sec 5 --skip-known-bad
```

## Konfigurasi API Key
API key disimpan secara lokal di `CCTV-Harvester/.env` (sudah di-gitignore). Lihat `.env.example` untuk formatnya.
