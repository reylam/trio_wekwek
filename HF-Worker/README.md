---
title: PATRA 24/7 CCTV AI Worker
emoji: 🛰️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# PATRA 24/7 CCTV AI Worker (Hugging Face Spaces)

Worker AI 24 jam (gratis di Hugging Face Spaces CPU Basic: 2 vCPU, 16 GB RAM) untuk memantau CCTV publik secara otomatis dengan alur:

```text
Hugging Face Space (1 frame / 3 detik, ONNX CPU)
   -> tulis ke Supabase PostgreSQL + Storage HANYA saat PKL baru / bertambah
   <- dibaca live oleh BE-Patra & FE-Patra di Vercel
```

## Kenapa Hemat Memori & Database?
- Memakai **ONNX Runtime CPU** (`best.onnx`, ~9.8 MB) tanpa PyTorch -> RAM stabil sekitar 180-250 MB.
- Membaca **1 frame tiap 3 detik** (`FRAME_INTERVAL_SEC=3`) bergiliran antar kamera aktif lalu langsung melepas `VideoCapture`.
- **Zero spam ke database:**
  - `0 PKL` -> tidak tulis DB & tidak upload gambar.
  - Sudah ada laporan `NEED_ACTION` aktif dan jumlah PKL tetap/berkurang -> tidak tulis DB (`MERGED_NOOP`).
  - Laporan baru atau jumlah PKL **bertambah** -> baru unggah snapshot ke Supabase Storage (`patra-evidence`) & tulis `ViolationReport` + `AuditLog`.
- Model `best.onnx` otomatis diunduh saat startup dari `MODEL_URL` (default: `https://portal-patra.vercel.app/models/best.onnx`), jadi tidak perlu Git LFS saat upload ke Hugging Face Spaces.

## Cara Deploy Gratis ke Hugging Face Spaces

1. Buka [huggingface.co/new-space](https://huggingface.co/new-space):
   - **Space name:** mis. `patra-cctv-worker`
   - **SDK:** pilih **Docker** (template *Blank*)
   - **Hardware:** **CPU basic - 2 vCPU - 16 GB RAM (Free)**
2. Push atau upload seluruh isi folder `HF-Worker/` ini ke repository Space tersebut.
3. Buka tab **Settings -> Variables and secrets** di Space, lalu tambahkan **Secrets** berikut:
   - `DATABASE_URL` = connection string Supabase pooler (`:6543`, `?pgbouncer=true`)
   - `SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = service role key Supabase Anda
4. (Opsional) Tambahkan **Variables** untuk mengatur beban:
   - `FRAME_INTERVAL_SEC` = `3` (1 frame per 3 detik)
   - `WORKER_CITIES` = `Kota Jakarta Pusat,Kota Semarang` (atau kosongkan untuk semua 17 kota)
   - `MAX_CAMERAS` = `60`
   - `CONF_THRESH` = `0.30`
   - `MODEL_URL` = `https://portal-patra.vercel.app/models/best.onnx`
5. Setelah status Space **Running**, buka URL Space untuk melihat dashboard status & endpoint `/health`.

## Tips Supaya Benar-Benar Hidup 24/7 Gratis (Anti Sleep 48 Jam)
Hugging Face Free Space akan masuk mode *sleep* jika tidak ada 1 pun request HTTP ke port `7860` selama 48 jam. Cukup pasang monitor gratis di **UptimeRobot** atau **cron-job.org** untuk ping `GET https://<username>-patra-cctv-worker.hf.space/health` setiap 10-30 menit sekali agar worker tetap bangun 24/7 non-stop.
