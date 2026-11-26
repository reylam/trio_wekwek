# Panduan Deploy PATRA ke Vercel (2 Project dari 1 Monorepo)

Arsitektur paling rapi untuk monorepo PATRA adalah membuat **2 project Vercel** dari repository GitHub yang sama, masing-masing diarahkan ke **Root Directory** yang berbeda:

1. **Project Backend (`patra-be`)** -> Root Directory: `BE-Patra`
2. **Project Frontend (`patra-fe`)** -> Root Directory: `FE-Patra`

---

## 1. Deploy Backend (`BE-Patra`) Terlebih Dahulu

Di dashboard Vercel (**Add New -> Project**):

- **Root Directory:** `BE-Patra`
- **Framework Preset:** `Other` (otomatis terbaca dari `BE-Patra/vercel.json`)
- **Node.js Version:** `22.x`

### Environment Variables (`BE-Patra`)

Salin nilai dari `.env` Supabase/backend Anda (tanpa tanda kutip berlebih):

| Key | Contoh / Nilai |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<pass>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | `postgresql://postgres.<ref>:<pass>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` |
| `SUPABASE_BUCKET` | `patra-evidence` |
| `JWT_SECRET` | `<string acak minimal 32 karakter>` |
| `JWT_EXPIRES_IN` | `12h` |
| `ENABLE_DEMO_LOGIN` | `true` |
| `CAMERA_COOLDOWN_SEC` | `30` |
| `ALLOWED_ORIGINS` | `https://<domain-fe-anda>.vercel.app,http://localhost:5173` (bisa juga tambah `https://*.vercel.app` untuk preview branch) |

Klik **Deploy**, lalu catat URL backend yang dihasilkan (misalnya `https://patra-be.vercel.app`).

### Cek Kesehatan Backend

Buka di browser:
- `https://<domain-be>.vercel.app/health` -> harus mengembalikan `"status": "OK"` dan `"onVercel": true`
- `https://<domain-be>.vercel.app/health/db` -> harus mengembalikan koneksi database sehat
- `https://<domain-be>.vercel.app/api/public/cities` -> harus mengembalikan 17 kota

---

## 2. Deploy Frontend (`FE-Patra`)

Di dashboard Vercel (**Add New -> Project**, pilih repo GitHub yang sama):

- **Root Directory:** `FE-Patra`
- **Framework Preset:** `Vite` (otomatis terbaca dari `FE-Patra/vercel.json`)

### Environment Variables (`FE-Patra`)

| Key | Nilai |
| --- | --- |
| `VITE_USE_BACKEND` | `true` |
| `VITE_API_BASE_URL` | `https://<domain-be>.vercel.app` (tanpa garis miring `/` di akhir) |
| `VITE_VIOLATION_THRESHOLD_SEC` | `15` |

Klik **Deploy**, lalu catat URL frontend (misalnya `https://patra-fe.vercel.app`).

---

## 3. Sinkronkan CORS Backend

1. Kembali ke project **Backend (`patra-be`) -> Settings -> Environment Variables**.
2. Pastikan `ALLOWED_ORIGINS` berisi domain frontend production Anda (mis. `https://patra-fe.vercel.app`).
3. Klik **Redeploy** pada deployment backend terakhir agar `ALLOWED_ORIGINS` baru aktif.

---

## 4. Verifikasi Akhir

- Buka `/` (Beranda), `/zona-hijau`, `/panduan-pkl`, `/tentang` lalu refresh langsung di setiap rute (memastikan SPA rewrite berjalan tanpa 404).
- Coba **Demo 1-Klik** Satpol PP & Dinas UMKM dari Beranda atau `/login`.
- Coba unduh **Berita Acara PDF** di portal Dinas UMKM (header `Content-Disposition` sudah diekspos lintas origin).
- Pastikan model ONNX `/models/best.onnx` terunduh dengan status `200` saat membuka inspeksi CCTV AI.
