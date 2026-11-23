# PHASE 4 — IMPLEMENTATION ROADMAP & CONSISTENCY CHECK (`PATRA`)

> **Produk:** `PATRA (Pantauan Transparan Ruang Publik)`  
> **Timeline Eksekusi:** 23 November 2026 – 18 Desember 2026 (**26 hari kalender / ~3,7 minggu**)  
> **Kapasitas Tim:** 2 Developer Aktif (`[Dev 1 - Fullstack]`, `[Dev 2 - AI/CCTV]`) + 1 UI/UX & QA Lead (`[Dev 3 - UI/QA]`)  
> **Referensi Wajib:** [legacy_audit.md](./legacy_audit.md) | [requirement.md](./requirement.md) | [document.md](./document.md) | [.agent/rules/data_contract.md](../.agent/rules/data_contract.md)  
> **Status Dokumen:** Draft Phase 4 — Menunggu Persetujuan Akhir Sebelum Coding Dimulai (_Stop-Gate_)

---

## 1. Consistency Check & Feasibility Review

### 1.1 Matriks Keselarasan Lintas Dokumen

| Dimensi Verifikasi                    | `requirement.md`                                                                                         | `document.md`                                                                   | `data_contract.md` (`schema.prisma` & API)                                                                  |   Status    |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------- | :---------: |
| **3 Portal & 3+3 Menu Inti**          | Portal Publik + Satpol PP (3 menu) + Dinas UMKM (3 menu)                                                 | Routing `apps/web/src/pages/{public,satpol,dinas}`                              | Grup endpoint terpisah per portal & role                                                                    | **SELARAS** |
| **Region-Locked per `city`**          | `FR-006`, Role Matrix                                                                                    | Middleware `authenticate -> requireRole -> enforceRegionScope`                  | `Region.city` (unique) + FK `regionId` di semua entitas utama                                               | **SELARAS** |
| **Privasi Portal Publik**             | `FR-003`, `NFR-004` (dilarang foto mentah)                                                               | Sequence Diagram publik tanpa Storage URL                                       | `GET /api/public/*` mengecualikan `beforeImageUrl` & `afterImageUrl`                                        | **SELARAS** |
| **Katalog CCTV Pre-Sync + Lazy Load** | `FR-007`, `FR-008`                                                                                       | `indonesia_sources.py` → JSON → Supabase + Edge Cache 900s                      | Tabel `CctvCamera` + `GET /api/cctv` (`s-maxage=900, SWR=60`)                                               | **SELARAS** |
| **HLS Direct + Auto-Fallback 5s**     | `FR-009`, `EC-001`                                                                                       | `hls.js` + `crossOrigin="anonymous"` + catch `SecurityError`                    | `needs_cors_proxy`, `playback_url`, `fallbackVideoUrl`, `CctvPlayerWithAIProps`                             | **SELARAS** |
| **ONNX 1 FPS + ROI + Tracker**        | `FR-010`–`FR-012`, `EC-004`, `EC-005`                                                                    | Dual-format parser, reused canvas, `dispose()`, `Map<camera_id, CameraTracker>` | `CctvCamera.roiPolygon`, `NormalizedPolygon`, `TrackedObjectOverlay`                                        | **SELARAS** |
| **Incident Merging & Cooldown**       | `FR-014`, `BR-001`–`BR-003`                                                                              | Flow `Peak Active Count` + arsip URL lama di `AuditLog`                         | `POST /api/reports/auto-detect` (4 outcomes) + index `(cameraId, status)` & `(cameraId, actionSubmittedAt)` | **SELARAS** |
| **Validasi, Relokasi 1-Klik & PDF**   | `FR-019`, `FR-020`, `BR-005`–`BR-006`                                                                    | Haversine Top 3 + PDFKit streaming 1 halaman A4 WIB                             | `POST /validate`, `POST /relocation`, `GET /:id/pdf`                                                        | **SELARAS** |
| **AuditLog Append-Only (SDG 16)**     | `FR-022`, `BR-007`                                                                                       | Batch `$transaction([...])` pada setiap transisi                                | `AuditLog` tanpa `updatedAt`, `onDelete: Restrict`, tanpa endpoint ubah/hapus                               | **SELARAS** |
| **6 Strict Out-of-Scope**             | No blur wajah, no kuota, no menu Antrean Tiket, no panel Live Alert, no server AI Python/MQ, no template | Tidak ada server Python/MQ/Redis; layout video lebar penuh                      | Tidak ada kolom kuota di `RelocationSite`; tidak ada field blur wajah                                       | **BERSIH**  |

### 1.2 Dua Penyempurnaan Teknis Kecil dari Hasil Cross-Check (`RECOMMENDATION`)

Tidak ditemukan konflik arsitektur mayor. Ditemukan **2 detail implementasi kecil** yang wajib diperhatikan Dev 1 agar tidak menimbulkan _bug_ saat integrasi:

1. **Multi-Status Query pada `GET /api/reports`:** Peta Operasional Satpol PP (`FEAT-SPP-03`) membutuhkan pin pelanggaran aktif (`NEED_ACTION` dan `NEEDS_REVISION`). Pastikan `GET /api/reports` menerima nilai `status` dipisahkan koma (mis. `?status=NEED_ACTION,NEEDS_REVISION`), bukan hanya 1 nilai enum tunggal.
2. **Anti-Kolisi `reportCode` di Serverless:** Hindari generate `reportCode` (`PTR-202611-0001`) dengan `count() + 1` karena rentan tabrakan `@unique` pada request paralel di Vercel. Gunakan format deterministik ringan `PTR-YYYYMM-<5-CHAR-ALPHANUM>` (mis. `PTR-202611-7K4M9` dengan `crypto.randomBytes`) agar bebas kolisi tanpa transaksi sekuens tambahan.

### 1.3 Feasibility Review — Fitur Berisiko Keterlambatan Tertinggi (Tim 2 Dev + 1 UI/QA)

Dengan waktu efektif **26 hari kalender**, 5 area berikut memiliki risiko keterlambatan tertinggi beserta mitigasi operasionalnya:

|  #  | Area Berisiko Tinggi                                                                      | Dampak Jika Terlambat                                                                                                 | Mitigasi Realistis & _Cut-Line_ Aman                                                                                                                                                                                                                                                                          |
| :-: | :---------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  1  | **Fine-Tuning YOLO26n _High-Angle_ & Parity ONNX (`[Dev 2]`)**                            | Jika pelatihan dataset baru berlarut melewati minggu ke-1, komponen `<CctvPlayerWithAI />` tertahan.                  | **Decouple dari Hari 1:** Gunakan `best.onnx` hasil export model legacy sementara untuk menguji pipeline `<CctvPlayerWithAI />` (1 FPS + ROI + Tracker) sejak Sprint 1, sambil _fine-tuning_ dataset _high-angle_ berjalan paralel; tukar file `best.onnx` di `public/models/` begitu `verify_onnx.py` lulus! |
|  2  | **HLS Live Stream Pemda, CORS & _Tainted Canvas_ (`[Dev 2]`)**                            | Stream `.go.id` tidak stabil atau memblokir `getImageData()`, menggagalkan demo langsung di depan juri.               | **Verifikasi di Sprint 1:** Uji minimal 5 kamera JakCCTV & 5 kamera PantauSemar dari domain HTTPS Vercel paling lambat **29 Nov**. Siapkan minimal **2 video MP4 CCTV _high-angle_ berkualitas tinggi** (`demo-jakarta.mp4` & `demo-semarang.mp4`) sebagai _auto-fallback_ 5 detik yang mulus.                |
|  3  | **Deployment Monorepo (`apps/web` + `apps/api` + `@patra/shared`) di Vercel (`[Dev 1]`)** | Kegagalan resolve workspace TypeScript ESM atau Prisma v7/PDFKit pada minggu terakhir bisa menghentikan seluruh demo. | **Deploy Skeleton di Sprint 1 (paling lambat 28 Nov):** Deploy `apps/api` (`/health/db`) dan `apps/web` (halaman login kosong) ke Vercel sebelum menulis fitur bisnis, lalu _continuous deploy_ tiap selesai milestone.                                                                                       |
|  4  | **PDFKit 1 Halaman A4 dengan 2 Foto Remote (`[Dev 1]`)**                                  | Layout PDF meluber ke halaman ke-2 atau timeout saat mengambil foto _Before_ & _After_.                               | Kunci layout tinggi tetap (foto `fit: [235, 140]`, tabel audit maks 6 baris, `Promise.allSettled` fetch gambar dengan timeout 6 detik + fallback teks). Kerjakan di akhir Sprint 2, jangan ditunda ke Sprint 3.                                                                                               |
|  5  | **Desain 13 Halaman Kustom & Responsivitas Mobile (`[Dev 3]` & `[Dev 1]`)**               | Desain Figma terlambat diserahkan membuat Dev 1 menunggu sebelum membangun UI.                                        | **Staggered Handoff:** Dev 3 menyerahkan _Design Tokens_ (palet `#043FA5`, tipografi, komponen kartu/badge) + wireframe **Portal Satpol PP** terlebih dahulu di **Hari 3 (25 Nov)**, menyusul **Portal Dinas** di **Hari 6 (28 Nov)**, dan **Portal Publik** di **Hari 9 (1 Des)**.                           |

---

## 2. Task Breakdown per Milestone (Sprint 1 – Sprint 3)

> **Konvensi Pemilik Tugas:**
>
> - `[Dev 1 - Fullstack]` — Monorepo, Prisma/Supabase, Express REST API, React Pages & Integrasi, Vercel Deploy
> - `[Dev 2 - AI/CCTV]` — Fine-tuning YOLO26n, `packages/ai`, `indonesia_sources.py` + `cctv_snapshot.json`, Video Fallback MP4, `<CctvPlayerWithAI />`
> - `[Dev 3 - UI/QA]` — Desain Figma kustom (13 halaman + mobile), aset grafis/logo PATRA, QA fungsional/responsivitas, Video Demo

---

### SPRINT 1 — Fondasi Monorepo, Database, Auth & Verifikasi Risiko Tinggi

**Target Waktu:** 23 November – 2 Desember 2026 (10 hari)  
**Goal Sprint:** Monorepo terstruktur & ter-deploy di Vercel, DB Supabase + seed 2 kota berjalan, Auth/Region-Lock aktif, kontrak `<CctvPlayerWithAI />` teruji dengan ONNX 1 FPS + HLS/Fallback, dan desain Figma inti selesai.

#### A. Setup Monorepo, Kontrak Interface & Deployment Awal

- [x] **`T1-01` `[Dev 1 - Fullstack]` — Restrukturisasi Monorepo (`FE-Patra`, `BE-Patra`, `AI-Patra`)**
  - **Target:** `package.json`, `.gitignore`, `FE-Patra/`, `BE-Patra/`, `AI-Patra/`
  - **Dependency:** Persetujuan Phase 4
  - **Acceptance Criteria:** Folder `frontend/` & `backend/` lama dipindah ke `FE-Patra/` (React 18.3.1 + Vite + Tailwind + shadcn/ui + `optimizeDeps.exclude: ['onnxruntime-web']`), `BE-Patra/` (struktur `src/{assets,config,controller,interface,middlewares,repository,routes,service}` + `api/index.ts`), & `AI-Patra/`; `_legacy_ref/` masuk `.gitignore`; `npm run typecheck` dan `npm run build` di root berhasil.
- [x] **`T1-02` `[Dev 1 - Fullstack]` — Implementasi Kontrak Interface & Zod Schemas (`BE-Patra/src/interface/` & `FE-Patra/src/types/`)**
  - **Target:** `BE-Patra/src/interface/*`, `FE-Patra/src/types/*`
  - **Dependency:** `T1-01`
  - **Acceptance Criteria:** Seluruh enum, schema Zod request API, dan interface `CctvCameraDto` / `CctvPlayerWithAIProps` / `ViolationCapturePayload` persis sesuai `.agent/rules/data_contract.md` dan sinkron antara `BE-Patra` & `FE-Patra`.
- [x] **`T1-03` `[Dev 1 - Fullstack]` — Setup Prisma v7, Migrasi Supabase Pooler & Seed 2 Kota Pilot**
  - **Target:** `BE-Patra/prisma/{schema.prisma,seed.ts}`, `BE-Patra/prisma.config.ts`, `BE-Patra/src/config/{prisma.ts,supabase.ts}`
  - **Dependency:** `T1-01`
  - **Acceptance Criteria:** Migrasi 7 tabel berhasil di Supabase PostgreSQL; `prisma.ts` memakai `@prisma/adapter-pg` + global singleton + `dns.setDefaultResultOrder("ipv4first")`; `seed.ts` idempoten mengisi 2 `Region` (Jakarta Pusat & Semarang), 4 `User` demo, 6+ `CctvCamera`, 4 `RestrictedZone`, 6 `RelocationSite`, 8 `ViolationReport`, dan `AuditLog`.
- [ ] **`T1-04` `[Dev 1 - Fullstack]` — Middleware Auth (JWT), RBAC, Region-Lock, Multer & ErrorHandler + Deploy Awal Vercel**
  - **Target:** `BE-Patra/src/middlewares/{auth.ts,validate.ts,upload.ts,errorHandler.ts,healthdb.ts}`, `BE-Patra/src/routes/{auth.route.ts,health.route.ts}`, `BE-Patra/{vercel.json,api/index.ts}`, `FE-Patra/vercel.json`
  - **Dependency:** `T1-02`, `T1-03`
  - **Acceptance Criteria:** `POST /api/auth/login`, `POST /api/auth/demo-login`, `GET /api/auth/me` lulus uji; akses lintas kota mengembalikan `403 REGION_ACCESS_DENIED`; deploy awal `BE-Patra` (`/health/db` → 200 dengan host `pooler.supabase.com:6543`) dan `FE-Patra` live di URL publik Vercel (`VERIFIED`).

#### B. Pipeline Katalog CCTV & Modul AI Browser (`AI-Patra` & `FE-Patra/src/services/yolo`)

- [ ] **`T1-05` `[Dev 2 - AI/CCTV]` — Panen & Normalisasi Katalog CCTV Multi-Kota + Video MP4 Fallback**
  - **Target:** `AI-Patra/cctv_catalog/{indonesia_sources.py,cctv_snapshot.json}`, `FE-Patra/public/videos/{demo-jakarta.mp4,demo-semarang.mp4}`
  - **Dependency:** `T1-01`
  - **Acceptance Criteria:** `cctv_snapshot.json` valid sesuai skema Section 4 `data_contract.md` untuk minimal Kota Jakarta Pusat & Kota Semarang (memuat `roi_polygon` pada minimal 2 kamera demo per kota); 2 video MP4 simulasi berdurasi 30–60 detik (< 8 MB/video, sudut _high-angle_ menampakkan gerobak PKL di trotoar) tersedia di `FE-Patra/public/videos/`.
- [ ] **`T1-06` `[Dev 2 - AI/CCTV]` — Core ONNX Runtime Web, ROI Filter & Centroid/IoU Tracker (`FE-Patra/src/services/yolo/`)**
  - **Target:** `FE-Patra/src/services/yolo/{config.ts,session.ts,preprocessing.ts,postprocessing.ts,yoloInference.ts,roi.ts,tracker.ts}` + unit test Vitest
  - **Dependency:** `T1-02`
  - **Acceptance Criteria:**
    - `session.ts` memakai `?url` mapping 5 file `.wasm`/`.mjs` + fallback `webgpu -> wasm` + cek _magic bytes_.
    - `preprocessing.ts` me-_reuse_ canvas & `Float32Array`; `postprocessing.ts` otomatis mendukung `[1,300,6]` & `[1,5,8400]`; tensor input & output selalu di-`dispose()`.
    - `roi.ts` menguji titik tengah bawah `((x1+x2)/2, y2)` ternormalisasi `0..1` + fallback _full-frame_.
    - `tracker.ts` terisolasi `Map<camera_id, CameraTracker>` dan unit test lulus untuk `OBSERVING -> REPORTED -> SUPPRESSED -> CLEARED` serta _occlusion grace period_ 30–60s.
- [ ] **`T1-07` `[Dev 2 - AI/CCTV]` — Risk Spike: Uji HLS/CORS/_Tainted Canvas_ & Benchmark ONNX 1 FPS di Vercel**
  - **Target:** Komponen awal `FE-Patra/src/components/cctv/CctvPlayerWithAI.tsx`
  - **Dependency:** `T1-04`, `T1-05`, `T1-06`
  - **Acceptance Criteria:** Diuji langsung di URL HTTPS Vercel pada minimal 3 kamera JakCCTV & 3 kamera PantauSemar; _auto-fallback_ ≤ 5 detik bekerja saat stream gagal atau terkena `SecurityError` (_tainted canvas_); inferensi 1 FPS stabil tanpa _memory leak_ selama 5 menit (status risiko di `document.md` dapat diperbarui menjadi `VERIFIED`).
- [ ] **`T1-08` `[Dev 2 - AI/CCTV]` — Fine-Tuning YOLO26n _High-Angle_ & Verifikasi Parity `.pt` vs `.onnx`**
  - **Target:** `AI-Patra/{yolo.py,export_onnx.py,verify_onnx.py}`, `AI-Patra/model/best.onnx`, `FE-Patra/public/models/best.onnx`
  - **Dependency:** `T1-01`
  - **Acceptance Criteria:** Model _high-angle_ diekspor dengan `opset=12, dynamic=False, imgsz=640`, ukuran `≤ 12 MB`, lulus `verify_onnx.py` (IoU ≥ 0.5 terhadap `best.pt`), dan mendeteksi PKL secara akurat pada video `demo-jakarta.mp4` & `demo-semarang.mp4`.

#### C. Desain UI/UX Kustom & Aset Visual PATRA

- [ ] **`T1-09` `[Dev 3 - UI/QA]` — Design System, Logo PATRA & Figma 13 Halaman + Mobile View**
  - **Target:** File Figma + aset `FE-Patra/public/favicon.svg`, `BE-Patra/src/assets/patra-logo.png`, `FE-Patra/src/assets/patra-logo.svg`
  - **Dependency:** `requirement.md`
  - **Acceptance Criteria:** Palet `#043FA5` / `#73A6E9` / `#9EC1EB` / `#F4F7FC` / `#0B132B` + font Plus Jakarta Sans & JetBrains Mono; bebas template jadi; handoff bertahap selesai (Hari 3: Tokens + Satpol PP; Hari 6: Dinas UMKM; Hari 9: Portal Publik + Mobile Form _After_ 360px).

---

### SPRINT 2 — Core End-to-End Workflow (Satpol PP ↔ Dinas UMKM + PDF)

**Target Waktu:** 3 Desember – 11 Desember 2026 (9 hari)  
**Goal Sprint:** Seluruh siklus operasional dari _Live CCTV AI Detection_ → _Incident Merging_ → Penindakan Satpol PP (Desktop & Mobile) → Validasi _Split-View_ & Relokasi 1-Klik Dinas UMKM → Unduh PDF 1 Halaman berjalan _end-to-end_ di produksi.

#### A. Backend REST API Inti (`BE-Patra`)

- [x] **`T2-01` `[Dev 1 - Fullstack]` — Endpoint Katalog CCTV (Pre-Synced + Edge Cache) & CRUD Zona Terlarang**
  - **Target:** `BE-Patra/src/{routes,controller,service,repository}/{cctv,zone}.*`
  - **Dependency:** `T1-04`, `T1-05`
  - **Acceptance Criteria:** `GET /api/cctv` memfilter `regionId`, mengembalikan metadata + `hasActiveReport`, dan menyertakan header `Cache-Control: s-maxage=900, stale-while-revalidate=60`; CRUD `/api/zones` memvalidasi poligon anti _self-intersecting_ via Turf.js dan terkunci per kota; `seed.ts` meng-upsert penuh `AI-Patra/cctv_catalog/cctv_snapshot.json`.
- [x] **`T2-02` `[Dev 1 - Fullstack]` — Endpoint Laporan: Auto/Manual Capture (_Incident Merging_), List, Detail (+ 3 Lokasi Terdekat) & Upload _After_**
  - **Target:** `BE-Patra/src/{routes,controller,service,repository}/report.*`, `BE-Patra/src/service/{storage.service.ts,geo.service.ts}`
  - **Dependency:** `T2-01`
  - **Acceptance Criteria:**
    - `POST /api/reports/auto-detect` lulus unit/integration test untuk 4 outcome (`CREATED`, `MERGED_ESCALATED` dengan preservasi `previousBeforeImageUrl` di `AuditLog`, `MERGED_NOOP` tanpa upload duplikat, `COOLDOWN_SUPPRESSED`) + `MANUAL` capture (`BR-003`).
    - `GET /api/reports` mendukung filter multi-status (`?status=NEED_ACTION,NEEDS_REVISION`), `relocationRequested`, pencarian, dan pagination.
    - `GET /api/reports/:id` otomatis menyertakan `auditLogs` dan 3 `nearestRelocationSites` (Haversine, tanpa kuota).
    - `POST /api/reports/:id/action` mengunggah foto _After_ ke Supabase Storage (retry 3x), memakai _guarded update_ (`409 Conflict` jika status sudah berubah), menutup _incident_ & mencatat `AuditLog`.
- [x] **`T2-03` `[Dev 1 - Fullstack]` — Endpoint Validasi Dinas, Relokasi 1-Klik, CRUD Lokasi Binaan, Analitik Dinas & PDF 1 Halaman**
  - **Target:** `BE-Patra/src/{routes,controller,service,repository}/{dinas,relocationSite}.*`, `BE-Patra/src/service/pdfBeritaAcara.service.ts`
  - **Dependency:** `T2-02`, `T1-09` (logo PNG)
  - **Acceptance Criteria:**
    - `POST /api/reports/:id/validate` (`APPROVE` / `REQUEST_REVISION` wajib alasan ≥ 10 karakter) & `POST /api/reports/:id/relocation` terkunci role `DINAS_UMKM` & `regionId`, `409` guarded.
    - `GET /api/reports/:id/pdf` men-stream PDF **tepat 1 halaman A4** (header `#043FA5` + nama instansi dinamis, foto _Before-After_ sejajar dengan timeout fallback, ringkasan `AuditLog` WIB, arahan relokasi).
    - `GET /api/dinas/analytics` mengembalikan 4 KPI, tren 30 hari, _peak hours_ 00–23 WIB, top 5 jalan, dan `planningMap` (**tanpa pin CCTV**).
    - CRUD `/api/relocation-sites` mendukung _soft-archive_ (`isActive = false`) bila sudah terikat laporan `VALIDATED`.

#### B. Komponen Final AI CCTV & Portal Pemerintah (`FE-Patra`)

- [ ] **`T2-04` `[Dev 2 - AI/CCTV]` — Finalisasi `<CctvPlayerWithAI />` Sesuai Design System & Kontrak**
  - **Target:** `FE-Patra/src/components/cctv/CctvPlayerWithAI.tsx`
  - **Dependency:** `T1-07`, `T1-08`, `T1-09`
  - **Acceptance Criteria:** Pemutar lebar penuh (`#0B132B`, tanpa panel Live Alert kanan & tanpa ilustrasi menutupi video); overlay bbox `PKL` + confidence + garis putus-putus ROI; kontrol `AI Detection ON/OFF`, `Show ROI Trotoar ON/OFF` (hanya visual), `Fullscreen`; 1 bar aksi bersih di bawah video (indikator status + durasi persistensi + lencana _"Live CCTV Offline — Mode Simulasi"_ + tombol _"Tangkap Bukti & Buat Laporan"_); mengompresi snapshot JPEG ≤ 1,5 MB saat memanggil `onViolationCaptured`.
- [ ] **`T2-05` `[Dev 1 - Fullstack]` — Shell Aplikasi, Halaman Login (+ 1-Click Demo) & Portal Satpol PP (3 Menu)**
  - **Target:** `FE-Patra/src/components/layout/*`, `FE-Patra/src/pages/feat-login/LoginPage.tsx`, `FE-Patra/src/pages/{feat-cctv,feat-maps,feat-reports}/*`, `FE-Patra/src/lib/imageCompress.ts`
  - **Dependency:** `T1-09`, `T2-01`, `T2-02`, `T2-04`
  - **Acceptance Criteria:**
    - Login standar + Panel Demo 1-Klik berfungsi; route guard memblokir role salah.
    - Menu 1: Grid metadata (0 request HLS) → klik kartu buka `CctvLivePage` dengan `<CctvPlayerWithAI />` + toast notification auto/manual capture.
    - Menu 2: Peta Wilayah 3 layer (Pin CCTV → "Buka Live CCTV", Poligon Zona + CRUD, Pin Pelanggaran Aktif → "Tindak Lanjuti").
    - Menu 3: 1 Halaman Laporan & Penindakan terfilter + Detail Mobile-Responsive (`360px+`, banner revisi, foto _Before_ tanpa blur, AuditLog, Kartu Asisten 2–3 Lokasi Binaan tanpa kuota, form upload foto _After_ terkompresi ≤ 1,5 MB + checkbox relokasi).
- [x] **`T2-06` `[Dev 1 - Fullstack]` — Portal Dinas UMKM / Suku Dinas PPKUKM (3 Menu)**
  - **Target:** `FE-Patra/src/pages/{feat-dinas-dashboard,feat-validation,feat-relocation}/*`
  - **Dependency:** `T1-09`, `T2-03`
  - **Acceptance Criteria:**
    - Label instansi header dinamis (`Suku Dinas PPKUKM Jakarta Pusat` / `Dinas Koperasi & UKM Kota Semarang`).
    - Menu 1: 4 KPI, Grafik Tren & _Peak Hours_ (Recharts), Top 5 Jalan, Peta Penataan (Heatmap/titik valid + Pin Lokasi Binaan, **tanpa pin CCTV**).
    - Menu 2: Daftar terfilter + Workspace _Split-View_ _Before_ vs _After_, tombol Setujui/Tolak (dialog wajib alasan), Penetapan Relokasi 1-Klik (3 lokasi terdekat tanpa kuota), dan tombol **"Unduh Berita Acara & Arahan Relokasi (PDF 1 Halaman)"**.
    - Menu 3: CRUD Lokasi Binaan dengan _click-to-pin_ di peta Leaflet (tanpa kolom kuota).
- [ ] **`T2-07` `[Dev 3 - UI/QA]` — QA Tengah Sprint (Alur Satpol PP ↔ Dinas UMKM & Responsivitas Mobile)**
  - **Target:** Daftar bug/temuan di issue tracker / checklist QA
  - **Dependency:** `T2-05`, `T2-06`
  - **Acceptance Criteria:** Uji _end-to-end_ skenario normal + revisi berulang + uji form _After_ di ponsel nyata (Android/iOS) + verifikasi tidak ada elemen _Out-of-Scope_.

---

### SPRINT 3 — Portal Publik, Hardening, QA Menyeluruh & Pengumpulan Karya

**Target Waktu:** 12 Desember – 18 Desember 2026 (7 hari)  
**Goal Sprint:** Portal Publik SDG 16 selesai dan bebas bocor privasi, seluruh edge case & performa teruji di URL produksi publik, video demo & dokumentasi pengumpulan Techcomfest 2027 siap sebelum 18 Desember 2026.

- [ ] **`T3-01` `[Dev 1 - Fullstack]` — Backend & Frontend Portal Publik (Tanpa Login)**
  - **Target:** `BE-Patra/src/{routes,controller,service}/public.*`, `FE-Patra/src/pages/feat-public/PublicHomePage.tsx`
  - **Dependency:** `T2-03`, `T1-09`
  - **Acceptance Criteria:** Filter Kabupaten/Kota dinamis (Jakarta Pusat, Semarang, Semua Kota); 4 Kartu KPI _real-time_; Peta Transparansi Interaktif (Poligon Zona, _Hotspot_ tanpa foto mentah, Pin Lokasi Binaan); Linimasa Akuntabilitas (_Public Audit Feed_ `Deteksi -> Tindak -> Validasi`); tombol jelas menuju `/login` & Demo 1-Klik.
- [ ] **`T3-02` `[Dev 2 - AI/CCTV]` — Kalibrasi Final ROI Kamera Demo & Tuning Threshold Demo vs Operasional**
  - **Target:** `AI-Patra/cctv_catalog/cctv_snapshot.json`, `BE-Patra/prisma/seed.ts`, env `VITE_VIOLATION_THRESHOLD_SEC` & `CAMERA_COOLDOWN_SEC`
  - **Dependency:** `T2-04`, `T1-08`
  - **Acceptance Criteria:** Kamera pilot Jakarta Pusat & Semarang memiliki `roi_polygon` presisi; mode demo (`10–15 detik` threshold, `30 detik` cooldown) teruji mulus untuk auto-capture, _Peak Active Count_ merging saat multi-gerobak/refresh browser, dan _occlusion_ tidak mereset palsu.
- [ ] **`T3-03` `[Dev 1 - Fullstack]` — Security, Privacy & Performance Hardening di Produksi Vercel**
  - **Target:** `BE-Patra` & `FE-Patra` production deployment
  - **Dependency:** `T3-01`, `T3-02`
  - **Acceptance Criteria:**
    - Inspeksi Network Tab pada Portal Publik memastikan **0 URL foto mentah** bocor.
    - Uji akses lintas kota (`403`), akses tanpa token (`401`), concurrent submit (`409`), upload file > 4 MB (`413`), dan `AuditLog` tidak dapat diubah/dihapus.
    - Pastikan `_legacy_ref/` tidak ikut ter-commit di repository GitHub publik.
- [ ] **`T3-04` `[Dev 3 - UI/QA]` — Final E2E QA Checklist (Desktop & Mobile) + Uji Juri 1-Klik**
  - **Target:** URL produksi publik PATRA (`FE-Patra` + `BE-Patra`)
  - **Dependency:** `T3-03`
  - **Acceptance Criteria:** 0 _console error_ fatal di Chrome Desktop, Edge, dan Mobile Browser; seluruh 13 halaman + mobile responsive lulus cek; PDF 1 halaman terunduh & terbaca rapi; semua 4 tombol Demo 1-Klik (Satpol PP & Dinas untuk 2 kota) berfungsi penuh.
- [ ] **`T3-05` `[Dev 3 - UI/QA]` (didukung `[Dev 1]` & `[Dev 2]`) — Produksi Video Demo, README Monorepo & Final Submission Techcomfest 2027**
  - **Target:** `README.md` root monorepo, Video Demo (menampilkan siklus utuh SDG 16: Portal Publik → 1-Click Demo Satpol PP Live CCTV AI & Mobile Action → Validasi Split-View Dinas UMKM & PDF 1 Halaman → Pembaruan Real-Time Portal Publik)
  - **Dependency:** `T3-04`
  - **Acceptance Criteria:** Tautan demo publik aktif 24/7, repository GitHub monorepo bersih & terdokumentasi lengkap, seluruh berkas karya Techcomfest 2027 terkumpul **paling lambat 18 Desember 2026**.

---

## 3. Instruksi Khusus untuk AI Coding Agent

Saat mengeksekusi tugas dari `docs/task.md` bersama AI Coding Agent di sesi-sesi berikutnya, patuhi protokol berikut secara ketat:

1. **Satu Tugas (atau 1 Modul Terkait) per Sesi:** Berikan prompt spesifik menyebut ID tugas (contoh: _"Kerjakan `T2-02` sesuai `docs/task.md`"_). Jangan meminta agent membangun seluruh aplikasi sekaligus dalam 1 prompt agar konteks tetap tajam dan mudah diverifikasi.
2. **Rujuk Mutlak `.agent/rules/data_contract.md` sebagai _Single Source of Truth_:**
   - Dilarang mengubah nama tabel/kolom Prisma, nama enum, struktur envelope JSON (`{ ok, data }` / `{ ok, error }`), maupun prop/callback `CctvPlayerWithAIProps` tanpa persetujuan eksplisit dan pembaruan `.agent/rules/data_contract.md` terlebih dahulu.
   - Setiap skema validasi input baru wajib ditulis di `BE-Patra/src/interface/` (Zod) dan disinkronkan tipenya ke `FE-Patra/src/types/`.
3. **Patuhi 6 _Strict Out-of-Scope_ & Batasan Vercel/Supabase:**
   - **Dilarang keras** menambahkan fitur blur wajah, kolom kuota Lokasi Binaan, menu "Antrean Tiket Aktif", panel "Live Alert" kanan video, atau server Python/Redis/FFmpeg.
   - Pada `BE-Patra`: **selalu** gunakan batch array `prisma.$transaction([...])` (dilarang memakai _interactive transaction_ callback `async (tx) => ...` yang rawan macet di PgBouncer pooler), selalu terapkan _guarded update_ (`409 Conflict`) untuk transisi status laporan, dan **selalu** append `AuditLog` di transaksi yang sama.
   - Pada `FE-Patra`: jangan lupa `tensor.dispose?.()` untuk input & output ONNX, `video.crossOrigin = "anonymous"`, dan tangkap `SecurityError` (_tainted canvas_) untuk memicu _auto-fallback_ 5 detik.
4. **Gerbang Verifikasi Sebelum Menutup Tugas (`Definition of Done`):**
   - Setelah selesai menulis kode untuk satu tugas, wajib jalankan perintah verifikasi yang relevan (`npm run typecheck`, `npm run test`, `npm run build`) dan laporkan hasilnya secara jujur (tandai `VERIFIED` hanya untuk yang benar-benar sudah dijalankan dan lulus; tandai `NEEDS VERIFICATION` jika belum diuji di Vercel/perangkat nyata).
   - Perbarui status checkbox `- [x]` pada `docs/task.md` hanya setelah _Acceptance Criteria_ tugas tersebut benar-benar terpenuhi.

---

\*Status Phase 4: **SELESAI — SELURUH 4 FASE DOKUMEN PERANCANGAN LENGKAP (`legacy_audit.md`, `requirement.md`, `document.md`, `data_contract.md`, `task.md`). MENUNGGU PERSETUJUAN AKHIR SEBELUM MEMULAI IMPLEMENTASI SPRINT 1 (`T1-01`).\***
