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
- `dataset_pkl/labels/*.txt` -> anotasi format **YOLO** (`Emperan`, `Gerobak`)
- `dataset_pkl/previews/*.jpg` -> gambar preview dengan bounding box & label kelas (khusus gambar PKL)
- `dataset_pkl/data.yaml` -> konfigurasi kelas siap upload ke Roboflow / YOLO
- *(Opsional `--export-coco`)* `_annotations.coco.json` di dalam `dataset_pkl/`
- Seluruh state internal (rotasi kamera, daftar kamera jelek, cache resume Gemini) disimpan terpisah di `CCTV-Harvester/.state/` (di-gitignore).

## Mode Cepat 1 Langkah (`monitor_cctv.py`)
Jika ingin langsung capture + filter kualitas + auto-label dalam 1 skrip (output hanya masuk ke `CCTV-Harvester/output/dataset_pkl/`):

```powershell
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/monitor_cctv.py --max-cameras 25 --delay-sec 5 --skip-known-bad
```

## Frame Budget per Kamera (default aktif)
Dataset yang bagus = **banyak kamera berbeda**, bukan banyak frame dari kamera yang itu-itu saja (frame dari 1 kamera berbagi latar yang sama sehingga model menghafal latar). `capture_roi_loop.py` dan `monitor_cctv.py` memakai `frame_budget.py`:

| Aturan | Default | Argumen |
|---|---|---|
| Maks frame tersimpan per kamera | 5 | `--max-frames-per-camera` (0 = tanpa batas / perilaku lama) |
| Jeda antar frame kamera yang sama (agar tersebar siang/sore/malam) | 120 menit | `--min-gap-min` |
| Jeda coba ulang setelah gagal / tanpa PKL | 30 menit | `--retry-min` |
| Berhenti mencoba kamera setelah N percobaan tanpa frame | 6 | `--max-attempts` |

- Urutan prioritas: kamera dengan frame **paling sedikit** dulu, diselang-seling **antar kota**.
- Ledger `.state/camera_frame_ledger.json` otomatis dibangun dari frame yang sudah ada (staging, `output/dataset_pkl`, dataset & karantina AI-Patra) pada run pertama; kamera yang sudah penuh tidak dipanen lagi. Hitung ulang dengan `--rebuild-ledger`.
- Loop berhenti sendiri saat semua kamera sudah penuh / menyerah.

```powershell
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/capture_roi_loop.py --max-cameras 40 --skip-known-bad --interval-sec 600
.\AI-Patra\.venv\Scripts\python.exe CCTV-Harvester/monitor_cctv.py --loop --max-cameras 30 --skip-known-bad --max-frames-per-camera 3
```

## Batas Laju Gemini (< 15 RPM)
Semua pemanggilan Gemini (`label_with_gemini.py`, `monitor_cctv.py`, `AI-Patra/audit_dataset_gemini.py`) lewat `gemini_rate.py`: maks **14 request/menit** gabungan untuk semua thread & proses (log bersama di `.state/gemini_rate_log.json`), termasuk retry & fallback model. Atur via `GEMINI_MAX_RPM` di `.env` (dikunci maks 14). Jangan heran bila skrip "menunggu" — itu pembatas yang bekerja.

## Konfigurasi API Key
API key disimpan secara lokal di `CCTV-Harvester/.env` (sudah di-gitignore). Lihat `.env.example` untuk formatnya.
