# PHASE 1 — LEGACY CODEBASE AUDIT (`Civision` → `PATRA`)

> **Tujuan Dokumen:** Audit berbasis bukti terhadap 3 repositori lama *Civision* (`FE-civision`, `BE-civision`, `AI-civision`) **hanya untuk mengambil pelajaran teknis** bagi perancangan ulang total produk **PATRA (Pantauan Transparan Ruang Publik)** untuk *Techcomfest 2027*.  
> **Tanggal Audit:** 22 November 2026  
> **Prinsip:** Tidak ada kode legacy yang di-*copy-paste* mentah; seluruh temuan disertai bukti *path* file aktual tanpa menampilkan kredensial/rahasia apa pun.

---

## 1. Status Akses, Branch/Commit & Ringkasan Struktur/Stack Lama

### 1.1 Status Akses & Metadata Git

Ketiga repositori lama tersedia sebagai *clone* lokal lengkap di dalam `trio_wekwek/_legacy_ref/` dengan konfigurasi `origin` mengarah ke GitHub `wravelio9/*`.

| Repositori | Remote URL | Status Akses | Branch | Commit SHA (`HEAD`) | Tanggal Commit | Catatan Verifikasi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FE-civision** | `https://github.com/wravelio9/FE-civision.git` | **Diakses Penuh** (lokal + cek `git ls-remote`) | `main` | `b6dd6286e18b00ff6aa65fe4acff0e8fd7cfcd08` | 2026-10-25 15:36 WIB | `HEAD` lokal identik dengan `origin/main` di GitHub (`VERIFIED`). |
| **BE-civision** | `https://github.com/wravelio9/BE-civision.git` | **Diakses Penuh** (clone lokal) | `main` | `b971f8df5f3d53a495c1b409d6610ac5e8d4bb36` | 2026-10-25 15:39 WIB | Diaudit dari clone lokal; sinkronisasi commit terbaru di remote GitHub `NEEDS VERIFICATION`. |
| **AI-civision** | `https://github.com/wravelio9/AI-civision.git` | **Diakses Penuh** (clone lokal) | `main` | `307374e266fda5c7e4d890b634e4872f7b4487ac` | 2026-10-24 18:30 WIB | Diaudit dari clone lokal; sinkronisasi commit terbaru di remote GitHub `NEEDS VERIFICATION`. |

### 1.2 Ringkasan Struktur & Tech Stack Lama (Berbasis Bukti File)

1. **`FE-civision` (SPA React + Vite + Client-Side ONNX)**
   - **Stack aktual** (`FE-civision/package.json`): React `18.3.1`, Vite `6.4.3`, TypeScript `5.9.3`, `react-router-dom` `6.30.6`, `leaflet` `1.9.4`, `react-leaflet` `4.2.1`, `onnxruntime-web` `1.30.0`, `tesseract.js` `7.0.0`, Vitest `3.2.7`, Playwright `1.64.0`. Tanpa Tailwind/shadcn (memakai CSS kustom per halaman).
   - **Struktur utama:**
     - Routing & halaman: `src/App.tsx`, `src/pages/feat-login/`, `feat-dashboard/`, `feat-maps/`, `feat-upload/`, `feat-report/`, `feat-notification/`, `feat-profile/`, `feat-settings/`, `feat-help/`, `src/pages/model-diagnostic.tsx`.
     - Pipeline AI browser: `public/models/best.onnx` (9,79 MB), `src/services/yolo/{config,session,preprocessing,postprocessing,yoloInference}.ts`.
     - OCR & Upload: `src/services/ocr/readOverlayText.ts`, `src/services/upload/uploadPhotos.ts`, `src/services/violation/violationRule.ts`.
   - **Deploy:** `vercel.json` SPA rewrite `/(.*) -> /index.html`.

2. **`BE-civision` (Express 5 + Prisma v7 + Supabase + Vercel Serverless)**
   - **Stack aktual** (`BE-civision/package.json`): Express `5.2.1` (ESM `"type": "module"`), TypeScript `5.9.2`, Prisma `7.10.0` + `@prisma/adapter-pg` `7.10.0` + `pg` `8.23.0`, `@supabase/supabase-js` `2.117.2`, `multer` `2.4.0`, `pdfkit` `0.20.2`, `@turf/{boolean-point-in-polygon,boolean-valid,helpers,line-intersect}` `7.4.0`, `exifr` `7.1.3`.
   - **Struktur utama:** Pola berlapis `routes -> controller -> service -> repository` di `src/`, entrypoint serverless `api/index.ts` yang mengekspor `src/index.ts`, skema DB di `prisma/schema.prisma` (`Zone`, `MediaFile`, `Analysis`, `Violation`, `AnnotatedFrame`, `Report`) + `prisma.config.ts`.
   - **Deploy:** `vercel.json` menggunakan `@vercel/node` dengan `includeFiles: ["src/assets/**"]`.

3. **`AI-civision` (Pelatihan YOLO26n + Export ONNX)**
   - **Aset aktual:** `model/yolo26n.pt` (5,54 MB), `model/best.pt` (5,38 MB), `dataset/data.yaml` (1 kelas: `gerobak`; 926 *train*, 116 *valid*, 115 *test* dari Roboflow), `runs/detect/train-12/results.csv` (75 epoch, `mAP50` puncak `0.82679` di epoch 55 dan akhir `0.80037` di epoch 75; `mAP50-95` puncak `0.49843`).
   - **Skrip aktif:** `yolo.py`, `export_onnx.py`, `verify_onnx.py`, `MODEL_CONTRACT.md`, `ONNX_MIGRATION.md`, `Dockerfile`, `render.yaml`.

---

## 2. Pola Teknis yang Layak Diadaptasi (*Adapt*)

Pola berikut terbukti memecahkan masalah nyata di *production* (khususnya Vite + ONNX WASM dan Vercel Serverless + Supabase) dan berstatus `RECOMMENDATION` untuk diadaptasi ulang secara bersih ke arsitektur monorepo PATRA.

| Domain | Pola Teknis yang Layak Diadaptasi | Bukti *Path* File Legacy | Penerapan di PATRA |
| :--- | :--- | :--- | :--- |
| **ONNX Runtime Web + Vite** | 1) Mengecualikan `onnxruntime-web` dari `optimizeDeps` Vite.<br>2) Mengimpor 5 file runtime `.wasm`/`.mjs` ORT via `?url` dan memetakannya ke `ort.env.wasm.wasmPaths` agar SPA fallback tidak mengembalikan HTML (`0x3c`) alih-alih WASM (`00 61 73 6d`).<br>3) Singleton `sessionPromise` + fallback otomatis `webgpu -> wasm` + validasi *magic bytes* file `.onnx` sebelum `InferenceSession.create()`. | `FE-civision/vite.config.ts` (L14-16)<br>`FE-civision/src/services/yolo/session.ts` (L9-30, L69-143)<br>`FE-civision/src/pages/model-diagnostic.tsx` | Diadaptasi ke `packages/ai` / `<CctvPlayerWithAI />` di `apps/web`. Halaman diagnostik internal opsional untuk Dev/QA saat verifikasi Vercel. |
| **Preprocessing & Un-Letterbox** | Letterbox 640×640 dengan padding abu-abu `114`, RGB `/255`, NCHW `float32 [1,3,640,640]`, menyimpan metadata `{scale, padX, padY, srcW, srcH}` untuk mengembalikan *bounding box* ke koordinat video asli. Sudah mendukung `HTMLVideoElement`. | `FE-civision/src/services/yolo/preprocessing.ts` (L14, L30-93)<br>`FE-civision/src/services/yolo/postprocessing.ts` (L121-141) | Diadaptasi dengan **optimasi reuse `<canvas>` dan `Float32Array`** agar loop 1 FPS tidak memicu alokasi memori/GC setiap detik. |
| **Verifikasi Parity `.pt` vs `.onnx`** | Skrip `export_onnx.py` (`opset=12`, `dynamic=False`, `imgsz=640`, inspeksi tensor I/O otomatis) dan `verify_onnx.py` yang mencocokkan IoU output `.pt` vs `.onnx` secara otomatis (mendukung format end2end maupun legacy). | `AI-civision/export_onnx.py` (L50-106)<br>`AI-civision/verify_onnx.py` (L103-328) | Diadaptasi ke `packages/ai` setelah *fine-tuning* model *high-angle* CCTV untuk memastikan kontrak tensor frontend dan model identik. |
| **Supabase Storage di Vercel (Read-Only FS)** | 1) `multer.memoryStorage()` + batas 4 MB (di bawah limit body 4,5 MB Vercel) + *file filter* MIME gambar.<br>2) Lazy initialization client Supabase (`service_role`, `persistSession: false`).<br>3) Retry dengan *backoff* untuk *transient network error* + pola *Signed Upload URL* bila ukuran foto melewati batas Vercel.<br>4) `dns.setDefaultResultOrder("ipv4first")` untuk mencegah `ECONNRESET` IPv6/NAT64 ke Supabase. | `BE-civision/src/middlewares/upload.ts`<br>`BE-civision/src/config/supabase.ts`<br>`BE-civision/src/service/upload.service.ts` (L35-112, L134-230)<br>`BE-civision/src/index.ts` (L9) | Diadaptasi untuk upload snapshot *Before* (CCTV) dan foto *After* (penindakan Satpol PP) di `apps/api`. Kompresi klien (JPEG ≤ 1–2 MB) tetap jadi jalur utama agar cepat. |
| **Prisma v7 + Supabase Pooler + Vercel Serverless** | 1) Menggunakan `@prisma/adapter-pg` dengan Supabase Connection Pooler (port `6543`).<br>2) Menjalankan `prisma.$transaction([...])` berbentuk **batch array**, BUKAN *interactive transaction* yang rentan macet pada *transaction pooler*.<br>3) Guard `if (!process.env.VERCEL) app.listen(...)` + export `app` via `api/index.ts`.<br>4) `errorHandler` terpusat + endpoint diagnostik `/health` & `/health/db` (tanpa membocorkan secret). | `BE-civision/src/config/prisma.ts`<br>`BE-civision/prisma.config.ts`<br>`BE-civision/src/repository/report.repository.ts` (L35-47)<br>`BE-civision/api/index.ts`<br>`BE-civision/src/index.ts` (L46-52)<br>`BE-civision/src/middlewares/errorHandler.ts` | Wajib diadaptasi ke `apps/api` agar stabil di Vercel Serverless Functions + Supabase PgBouncer. |
| **PDFKit Streaming & Zona Waktu WIB** | Streaming langsung `doc.pipe(res)` tanpa menulis file ke disk (aman di *read-only FS* Vercel), *fetch* gambar bukti via URL Supabase dengan `AbortSignal.timeout(8000)`, `vercel.json` `includeFiles` untuk aset logo, dan `Intl.DateTimeFormat(..., { timeZone: "Asia/Jakarta" })` agar stempel waktu selalu WIB (bukan UTC server). | `BE-civision/src/service/report.service.ts` (L55-78, L107-240)<br>`BE-civision/vercel.json` (L7) | Diadaptasi untuk fitur **Unduh Berita Acara & Arahan Relokasi (PDF 1 Halaman)** di Portal Dinas UMKM (berisi *Before-After*, Audit Log, dan arahan lokasi binaan, menggunakan palet `#043FA5`). |
| **Turf.js Validasi Poligon & Konversi Leaflet** | Validasi poligon zona terlarang (`>= 3` titik + cek *self-intersecting* via `@turf/line-intersect`) serta pemetaan eksplisit GeoJSON `[lng, lat]` ↔ Leaflet `[lat, lng]` dengan sanitasi XSS (`escapeHtml`) untuk `L.divIcon`. | `BE-civision/src/service/zone.service.ts` (L19-39)<br>`BE-civision/src/service/analysis.service.ts` (L105-129)<br>`FE-civision/src/services/dashboard/mapData.ts` (L139-157)<br>`FE-civision/src/pages/feat-maps/ViolationMap.tsx` (L21-36) | Diadaptasi untuk pengelolaan Poligon Zona Terlarang di Peta Satpol PP dan sanitasi tooltip/marker di Leaflet. Untuk Lokasi Binaan terdekat, ditambahkan jarak Haversine / `@turf/distance`. |

---

## 3. Technical Debt, Konflik, Keterbatasan & Bagian yang Dibuang (*Retire*)

### 3.1 Technical Debt, Bug & Keterbatasan Keamanan/Performa yang Harus Dihindari

| Kategori | Temuan Aktual di Legacy | Bukti *Path* File | Dampak & Cara Menghindari di PATRA |
| :--- | :--- | :--- | :--- |
| **Keamanan (Kritis)** | **Autentikasi Palsu & Leak Password di Console:** Halaman login tidak memanggil API autentikasi, langsung `navigate('/dashboard')`, dan mencetak `{ email, password }` ke `console.log`. Seluruh endpoint backend **tidak memiliki middleware auth/RBAC** dan `cors()` terbuka penuh (`*`). | `FE-civision/src/pages/feat-login/LoginPage.tsx` (L18-23)<br>`BE-civision/src/index.ts` (L25, L36-41) | Di PATRA wajib ada JWT/Session Auth nyata (bcrypt + HTTP-only cookie / Bearer token), middleware RBAC (`SATPOL_PP`, `DINAS_UMKM`), **Region-Locked Middleware** (`req.user.city`), pembatasan `CORS_ORIGINS`, dan larangan mencetak kredensial. |
| **Konflik Kontrak AI (Kritis)** | **Konflik Format Output ONNX Lintas File:** `AI-civision/MODEL_CONTRACT.md` & `ONNX_MIGRATION.md` mendokumentasikan output **`[1, 300, 6]`** (YOLO26 end2end, sudah NMS), tetapi `AI-civision/export_onnx.py` (L47) mengubah default menjadi `NMS_IN_MODEL = None` → output **`[1, 5, 8400]`** (tanpa NMS), dan `FE-civision/src/services/yolo/postprocessing.ts` meng-hardcode `[1, 5, 8400]`. Format aktual `best.onnx` (9,79 MB) saat runtime berstatus `NEEDS VERIFICATION`. | `AI-civision/MODEL_CONTRACT.md` (L20, L63)<br>`AI-civision/export_onnx.py` (L20-25, L47)<br>`FE-civision/src/services/yolo/postprocessing.ts` (L87-119) | Di PATRA, `packages/ai` **wajib** men-support deteksi otomatis bentuk tensor output (`[1, 300, 6]` vs `[1, 4+nc, 8400]`) seperti di `verify_onnx.py` ATAU mengunci 1 format terverifikasi bersama `verify_onnx.py` sebelum dipakai frontend. |
| **Performa Browser 1 FPS** | 1) `preprocessing.ts` membuat elemen `<canvas>` baru & `new Float32Array(640*640*3)` di setiap panggilan.<br>2) `yoloInference.ts` hanya memanggil `tensor.dispose?.()` untuk input, **tidak memanggil `outputTensor.dispose?.()`** (berpotensi *memory leak* di WebGPU pada loop jangka panjang).<br>3) Inferensi berjalan di *main thread* tanpa pengaman *overlap* (jika inferensi > 1000 ms). | `FE-civision/src/services/yolo/preprocessing.ts` (L47-50, L70)<br>`FE-civision/src/services/yolo/yoloInference.ts` (L31-39) | Di PATRA: *reuse* offscreen `<canvas>` dan `Float32Array`, selalu panggil `outputTensor.dispose?.()`, dan terapkan *in-flight guard* (`isInferring`) pada loop 1 FPS agar frame tidak menumpuk. |
| **Logika Geometri ROI** | `violationRule.ts` mengecek titik **tengah** *bounding box* (`boxCentre`) terhadap poligon piksel mentah. | `FE-civision/src/services/violation/violationRule.ts` (L54-56, L75) | Sesuai `LOCKED DECISION`, PATRA wajib memakai **titik tengah bawah** *bounding box* `( (x1+x2)/2, y2 )` (posisi roda/alas gerobak di trotoar) terhadap poligon ROI ternormalisasi `(0..1, 0..1)`, dengan *fallback full-frame* bila ROI kosong. |
| **Bug & Kebersihan Repo** | 1) Bug JS pada `isSameFile` (blok `{ ... }` tanpa `return`, selalu `undefined`).<br>2) File `AI-civision/Dockerfile` menyalin `app.py`, `vidToFrame.py`, `ocr.py` yang **sudah tidak ada** di commit `HEAD` (`307374e2`).<br>3) `AI-civision/requirements.txt` mengunci `tensorflow==2.11.0`, `torch==1.13.1`, `ultralytics==8.0.145` (usang & tidak cocok dengan `yolo26n.pt` yang butuh `ultralytics 8.4.x` menurut `ONNX_MIGRATION.md`).<br>4) Reverse geocoding Nominatim dipanggil sinkron di dalam loop `persist()` (rentan *rate-limit* 1 req/detik & memperlambat *request* di Vercel). | `FE-civision/src/pages/feat-upload/UploadPage.tsx` (L58-62)<br>`AI-civision/Dockerfile` (L23)<br>`AI-civision/requirements.txt` (L63-72)<br>`BE-civision/src/service/analysis.service.ts` (L281) | Di PATRA: gunakan TypeScript `strict: true` + linter; pisahkan dependency Python pelatihan secara bersih di `packages/ai/requirements.txt`; **jangan** panggil Nominatim saat *auto-capture* CCTV karena nama jalan/wilayah sudah tersedia di metadata tabel `CctvCamera`! |
| **Kelemahan Dataset AI** | Dataset legacy (`dataset/data.yaml`, 926 foto *train*, mAP50-95 ~0.49) didominasi foto *eye-level* / ponsel (terlihat dari penamaan file WhatsApp & web scraping di `dataset/valid/labels/`), **bukan sudut *high-angle* CCTV jalan raya**. | `AI-civision/runs/detect/train-12/results.csv` (L56, L76)<br>`AI-civision/dataset/data.yaml` | Sesuai `LOCKED DECISION`, Dev 2 melakukan *fine-tuning* `yolo26n` dengan sampel *high-angle* CCTV dan tetap menjaga ukuran model ringan untuk browser (`~5–10 MB`). |
| **Database & Concurrency** | Tidak ada tabel `User`, `Region`, `CctvCamera`, `RelocationSite`, maupun `AuditLog`. Prisma `PrismaClient` dibuat tanpa *global singleton* di dev (`prisma.ts`), dan tidak ada validasi payload pakai `zod`. | `BE-civision/prisma/schema.prisma`<br>`BE-civision/src/config/prisma.ts` | Di PATRA: skema baru sepenuhnya di `packages/shared` (Zod) + `apps/api/prisma/schema.prisma` dengan `AuditLog` *append-only* dan *global singleton* PrismaClient. |

### 3.2 Bagian yang Dibuang Total (*Retire*)

Seluruh komponen di bawah ini berstatus **`LOCKED DECISION — RETIRE`** (dilarang dibawa ke PATRA):

1. **Alur Upload Foto Batch & Kamera In-App untuk Deteksi Awal:** `FE-civision/src/pages/feat-upload/*`, `src/services/upload/{uploadPhotos,deviceLocation,manualCoordinate}.ts`, dan endpoint `BE-civision` `/api/upload` multi-foto + `/api/analysis`. Diganti total dengan **Pantauan Live CCTV (HLS + Auto-Fallback) + Client-Side 1 FPS + Incident-Based Reporting**. *(Catatan: upload 1 foto tetap ada khusus untuk **Foto Bukti After** oleh Satpol PP pada form hasil penindakan).*
2. **Pipeline OCR Timemark & EXIF GPS:** `tesseract.js`, `FE-civision/src/services/ocr/readOverlayText.ts`, `BE-civision/src/service/ocr.service.ts`, `exifr`, serta `AnalysisService.readExifGps` / `resolveCoordinate`. Koordinat & alamat di PATRA berasal langsung dari metadata `CctvCamera` yang sudah terverifikasi.
3. **Server AI Python / Docker / Render / Hugging Face Spaces:** `AI-civision/Dockerfile`, `render.yaml`, `BE-civision/src/service/aiResponse.service.ts`. Sesuai *Strict Out-of-Scope*, tidak ada server AI Python terpisah.
4. **Skema & Halaman Legacy Civision:** Model Prisma `MediaFile`, `Analysis`, `AnnotatedFrame`, `Report` lama; halaman `feat-profile`, `feat-settings`, `feat-help`, `feat-notification`; seluruh aset gambar/logo ungu Civision (`src/assets/*`).
5. **Template CSS Kustom Lama:** Seluruh file `*.css` legacy diganti dengan Tailwind CSS + shadcn/ui + Design System Cobalt Blue `#043FA5` kustom PATRA.

---

## 4. Rekomendasi Teknis Konkret untuk Migrasi ke Monorepo Baru PATRA

### 4.1 Matriks Risiko Teknis Tinggi (Wajib Uji Sebelum Produksi)

Sesuai standar kendali proyek, setiap keputusan berisiko tinggi dicatat risiko, mitigasi, dan status pengujiannya secara jujur:

| Area Berisiko Tinggi | Risiko Spesifik | Mitigasi Konkret | Status |
| :--- | :--- | :--- | :--- |
| **1. HLS Live Stream & CORS di Browser** | Server CCTV pemda (`.go.id` / pihak ketiga) kerap: (a) memblokir CORS origin Vercel, (b) memakai HTTP di halaman HTTPS (*mixed content*), (c) memakai sertifikat TLS kadaluarsa/port non-standar (contoh port `:7028`), atau (d) *stream* mati saat hari penjurian. | 1) Katalog dipanen *offline* oleh `indonesia_sources.py` ke tabel `CctvCamera` + *snapshot* JSON lokal (anti-timeout Vercel).<br>2) Prioritaskan kamera berstatus `needs_cors_proxy: false` + HTTPS valid untuk demo.<br>3) `hls.js` dibungkus **auto-fallback 5 detik** (atau saat `FATAL` network/CORS error) menuju video MP4 CCTV lokal di `public/videos/` dengan lencana transparan *"Live CCTV Offline — Mode Simulasi"*. | `NEEDS VERIFICATION` *(wajib uji dari origin HTTPS Vercel pada Sprint 1)* |
| **2. Inferensi ONNX 1 FPS di Browser (`onnxruntime-web`)** | 1) Konflik bentuk output tensor `[1,300,6]` vs `[1,5,8400]` membuat *bounding box* meleset.<br>2) `vercel.json` rewrite mengembalikan `index.html` untuk `.wasm`/`.onnx`.<br>3) Inferensi WASM di laptop/HP kelas menengah bisa > 300–600 ms/frame, atau WebGPU bocor memori jika tensor output tidak di-`dispose()`.<br>4) `<video>` lintas-origin tanpa `crossOrigin="anonymous"` membuat `canvas.getImageData()` melempar `SecurityError` (*tainted canvas*)! | 1) Jalankan `verify_onnx.py` pada model final & dukung *auto-detect* output shape di `packages/ai`.<br>2) Wajib pertahankan `?url` mapping `wasmPaths` + `optimizeDeps.exclude` + exclude `/models/*` dan `/assets/*` dari SPA fallback.<br>3) Reuse `<canvas>` & `Float32Array`, `dispose()` input & output tensor, terapkan *in-flight lock* di loop 1 FPS.<br>4) Wajib set `video.crossOrigin = "anonymous"` saat memutar HLS; jika *canvas* tetap *tainted* oleh header CORS server CCTV, tangkap `SecurityError` dan picu *auto-fallback* ke video lokal agar AI tetap berjalan! | `NEEDS VERIFICATION` *(wajib uji `tainted canvas` + benchmark ms/frame di Chrome desktop & mobile pada Sprint 1)* |
| **3. Deployment Monorepo di Vercel Serverless + Supabase** | 1) Batas payload request Vercel 4,5 MB (upload foto *After* kamera HP modern bisa 5–12 MB).<br>2) *Connection exhaustion* PostgreSQL jika memakai direct connection (port `5432`) atau *interactive transaction*.<br>3) Cold start & *bundling* Prisma v7 + PDFKit assets di struktur monorepo (`apps/api` + `packages/shared`). | 1) Kompresi gambar *After* & snapshot *Before* di sisi klien (JPEG ≤ 1,5 MB, maks sisi 1600px) sebelum dikirim ke `apps/api` (dengan limit Multer 4 MB).<br>2) Wajib gunakan Supabase Transaction Pooler (`port 6543`, `?pgbouncer=true`) + hanya gunakan batch `$transaction([...])`.<br>3) Siapkan dua project Vercel (atau 1 monorepo Vercel dengan `rootDirectory`: `apps/web` dan `apps/api`) serta uji `vercel build` sejak Sprint 1. | `NEEDS VERIFICATION` *(wajib uji deploy awal di Sprint 1 sebelum fitur penuh selesai)* |

### 4.2 Rekomendasi Teknis Migrasi & Pemisahan Kerja Tim (4 Minggu)

1. **`RECOMMENDATION` — Tangkap Jebakan *Tainted Canvas* pada HLS CCTV:** Ini adalah risiko paling kritis yang tidak ada di *Civision* lama (karena *Civision* memakai file lokal `<input type="file">`). Jika server HLS (mis. JakCCTV/PantauSemar) tidak mengirim header `Access-Control-Allow-Origin: *` pada segmen `.ts`/`.m3u8`, video mungkin tetap bisa diputar secara visual atau gagal di `hls.js`, dan `ctx.getImageData()` pada `<video>` akan melempar `SecurityError`. Komponen `<CctvPlayerWithAI />` harus menguji pembacaan 1 piksel/frame secara aman dan otomatis beralih ke Mode Simulasi bila terjadi `SecurityError`.
2. **`RECOMMENDATION` — Kompatibilitas React 19 vs `react-leaflet`:** Di *scaffold* awal `trio_wekwek/frontend/package.json` saat ini terpasang `react: ^19.0.0`. Perlu diperhatikan bahwa `react-leaflet` v4 (yang dipakai di legacy) memiliki masalah *peer dependency* pada React 19 (butuh `react-leaflet` v5 untuk React 19, atau gunakan React 18.3.1 untuk kompatibilitas terluas dengan ekosistem shadcn/ui + Leaflet + Recharts). Keputusan versi React perlu dikunci sebelum implementasi Phase 3/4 (`NEEDS VERIFICATION`).
3. **`RECOMMENDATION` — Bersihkan `_legacy_ref/` dari Repository Submission:** Saat ini `trio_wekwek/_legacy_ref/` berada di dalam direktori git `trio_wekwek` (berstatus *untracked*). Wajib tambahkan `_legacy_ref/` ke `.gitignore` atau pindahkan keluar folder git sebelum *commit* agar tidak masuk ke repository GitHub *Techcomfest 2027* (melindungi aturan orisinalitas kompetisi).

---

## 5. Temuan Konflik / Ambiguitas Workspace Saat Ini (Perlu Konfirmasi Sebelum Phase 2)

Sesuai aturan kendali proyek, ditemukan **2 ketidaksesuaian pada kondisi workspace lokal saat ini** yang tidak saya ubah secara sepihak dan memerlukan keputusan Anda:

1. **Struktur Direktori Monorepo Awal di `trio_wekwek/` vs `LOCKED DECISION`:**
   - **Kondisi aktual:** Repository git `C:\Project Pribadi\PATRA\trio_wekwek` saat ini memiliki folder awal `frontend/` (React 19 + Vite 6) dan `backend/` (Express 5 + TS), serta `package.json` root minimal tanpa `workspaces`.
   - **`LOCKED DECISION` (Section 4):** Struktur monorepo yang dikunci adalah `apps/web`, `apps/api`, `packages/shared`, dan `packages/ai`.
   - **Rekomendasi:** Saat masuk fase *coding* (setelah Phase 4 disetujui), migrasikan *scaffold* `frontend/` → `apps/web` dan `backend/` → `apps/api`, tambahkan `packages/shared` & `packages/ai`, serta konfigurasi `npm workspaces` (atau `pnpm-workspace.yaml`) di root `trio_wekwek/`.
2. **Lokasi Folder Dokumentasi (`docs/`):**
   - **Kondisi aktual:** Workspace IDE terbuka di `C:\Project Pribadi\PATRA`, sedangkan repository Git monorepo sebenarnya berada di `C:\Project Pribadi\PATRA\trio_wekwek`.
   - **Tindakan saat ini:** Dokumen Phase 1 disimpan di `trio_wekwek/docs/legacy_audit.md` agar tercatat langsung di dalam repository Git monorepo PATRA. Mohon konfirmasi apakah seluruh dokumen Phase 2–4 tetap disimpan di `trio_wekwek/docs/`.

---

*Status Phase 1: **SELESAI — MENUNGGU TINJAUAN & PERSETUJUAN SEBELUM LANJUT KE PHASE 2 (`docs/requirement.md`).***
