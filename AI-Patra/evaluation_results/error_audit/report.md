# PETRA — Forensic Prediction Error Audit & Misclassification Analysis Report

- **Model yang diaudit**: `AI-Patra/model/best_patra_highangle.onnx` (YOLO26n, `9.85 MB`, output `[1, 5, 8400]`, 1 kelas `PKL`, `single_cls=True`)
- **Dataset evaluasi**: Split `test/` (`41` gambar CCTV Jakarta unseen, `15` kamera unik, `94` objek GT PKL)
- **Parameter matching**: `conf = 0.25`, `IoU matching = 0.50`, `IoU NMS = 0.45`, probe low-confidence `0.10–0.25`, probe pre-NMS `>= 0.10`
- **Artefak visual pendukung** (di folder ini):
  - `fp_gallery.jpg` & `fp_crops/` — seluruh 25 False Positive bernomor (`FP#01..FP#25`) dengan konteks 2.5×
  - `fn_gallery_part1.jpg`, `fn_gallery_part2.jpg` & `fn_crops/` — seluruh 69 False Negative bernomor (`FN#01..FN#69`)
  - `low_conf_gallery.jpg` — deteksi low-confidence `0.10..0.25` (recoverable TP vs noise FP)
  - `gt_overlap_gallery.jpg` — bukti visual tumpang-tindih anotasi GT (`IoU = 0.75–0.79`)
  - `full_images/` — seluruh 41 gambar `test/` dengan overlay GT, TP, FP, FN, dan low-confidence
  - `audit_data.json` — data forensik lengkap per objek & per gambar

---

## 1. Ringkasan Audit Prediksi (`conf = 0.25`, `IoU = 0.50`)

| Kategori Audit | Jumlah | Proporsi | Keterangan Kuantitatif |
|---|---:|---:|---|
| Ground Truth (`test/`) | 94 | 100.0% | 41 gambar (2 gambar background murni 0 GT → **0 FP**) |
| **True Positive (TP)** | **25** | 26.6% dari GT | Precision `0.5000`, Recall `0.2660`, F1 `0.3472`, mAP@50 `0.2809`, mAP@50-95 `0.1294` |
| **False Positive — Background (`background`)** | **18** | 72.0% dari FP | `max_IoU_to_GT < 0.10` (termasuk 3 objek PKL yang tidak terlabel di GT & 3 dari 1 foto non-CCTV) |
| **False Positive — Incorrect BBox (`incorrect_bbox`)** | **7** | 28.0% dari FP | `0.10 <= max_IoU_to_GT < 0.50` — model mendeteksi objek PKL valid, tapi box terlalu kecil (`Pred/GT area = 0.18–0.39`) |
| **False Positive — Duplicate (`duplicate`)** | **0** | 0.0% dari FP | Tidak ada duplicate detection pada NMS `0.45` |
| **False Negative (FN)** | **69** | 73.4% dari GT | `55` true model miss (`<0.05`), `7` localization miss, `7` threshold recoverable (`0.05..0.25`), `0` NMS suppressed |
| **Low-Confidence (`0.10 <= conf < 0.25`)** | **32** | — | Hanya **`5` recoverable TP** vs **`27` noise FP** (rasio noise 5.4 : 1) |

---

## 2. False Positive Analysis (Verifikasi Visual 100% dari `fp_gallery.jpg`)

Seluruh **25 False Positive** (`FP#01..FP#25`) diperiksa satu per satu secara visual pada `fp_gallery.jpg` (tanpa asumsi):

| Kategori Penyebab Aktual (Visual) | Jumlah | % FP | ID FP | Bukti Visual Aktual |
|---|---:|---:|---|---|
| **1. Incorrect BBox pada PKL valid (Terpal/Gerobak)** | **7** | **28.0%** | `FP#01–#04`, `FP#14`, `FP#15`, `FP#20` | `FP#01–#04` & `FP#15` hanya melingkari 27–39% area bawah/kanan terpal biru/merah; `FP#14` & `FP#20` hanya melingkari bagian atap gerobak (`18–21%` luas GT). |
| **2. Kendaraan Bermotor (Mobil & Motor)** | **4** | **16.0%** | `FP#06`, `FP#09`, `FP#12`, `FP#13` | `FP#12` (`c=0.78`) & `FP#13` (`c=0.42`) adalah **atap mobil putih** di `STASIUN-DUREN-KALIBATA` (bentuk kotak-oval terang mirip atap tenda/gerobak); `FP#06` (`c=0.43`) motor di `JL-PROF-DR-SATRIO`; `FP#09` (`c=0.30`) pengendara motor jaket hijau (ojol) di `JL-PENGADEGAN-TIMUR`. |
| **3. PKL Valid yang Terlewat/Tidak Konsisten di GT** | **3** | **12.0%** | `FP#05`, `FP#11`, `FP#21` | `FP#05` (`c=0.63`) gantungan baju dagangan di sisi tenda PKL; `FP#11` (`c=0.25`) ujung payung/tenda hijau lapak; `FP#21` (`c=0.27`) gerobak/lapak merah di bawah kanopi `JPO-JATINEGARA` yang tidak berlabel GT. |
| **4. Outlier 1 Foto Non-CCTV Close-Up (`noncctv_sep`)** | **3** | **12.0%** | `FP#23`, `FP#24`, `FP#25` | 1 foto kamera HP datar close-up (66.8% layar) dipecah model menjadi 3 deteksi parsial: roda sepeda (`FP#23`), kaki/stang (`FP#24`), dan pagar besi latar belakang (`FP#25`). |
| **5. Payung Hujan Pejalan Kaki** | **2** | **8.0%** | `FP#16`, `FP#22` | `FP#22` (`c=0.60`) pejalan kaki memakai payung hujan merah muda; `FP#16` (`c=0.39`) payung hujan hitam di atas rak baju. **Terkait langsung dengan inkonsistensi definisi kelas `Payung` di dataset** (lihat Bagian 3). |
| **6. Pejalan Kaki di Trotoar / Bawah Kanopi** | **2** | **8.0%** | `FP#18`, `FP#19` | Pejalan kaki berdiri di bawah kanopi halte (`FP#18`) dan di depan gerbang `MASUK` (`FP#19`) pada `JPO-JATINEGARA`. |
| **7. Struktur Bangunan / Kanopi Jalan** | **2** | **8.0%** | `FP#08`, `FP#17` | `FP#08` (`c=0.28`) selasar ruko terang lampu neon malam + motor terparkir; `FP#17` (`c=0.32`) kanopi/atap halte melengkung di `JPO-MATRAMAN`. |
| **8. Tempat Sampah & Permukaan Trotoar** | **2** | **8.0%** | `FP#07`, `FP#10` | `FP#07` (`c=0.49`) **tong sampah plastik biru** di trotoar `JL-KP-DALAM` (warna biru solid identik dengan terpal biru PKL); `FP#10` (`c=0.29`) **pelat besi penutup saluran/trotoar basah** di tepi bawah `JL-PENGADEGAN-TIMUR`. |

**Kesimpulan Bagian 2**:
- Hanya **12 dari 25 FP (48%)** yang benar-benar merupakan kesalahan klasifikasi objek non-PKL pada frame CCTV nyata (`4` kendaraan, `2` payung pejalan kaki, `2` pejalan kaki, `2` struktur bangunan, `1` tong sampah biru, `1` pelat trotoar).
- Sisanya **13 dari 25 FP (52%)** disebabkan oleh **kotak prediksi parsial pada PKL valid (`7`)**, **label GT yang tidak lengkap pada PKL valid (`3`)**, dan **1 foto outlier non-CCTV (`3`)**.
- Tidak ditemukan pola FP dari bayangan murni pada `conf >= 0.25` (bayangan pohon malam hanya muncul sebagai low-conf noise `0.10–0.13` di `low_conf_gallery.jpg`).

---

## 3. Misclassification, Class Structure & Annotation Quality Analysis

### 3.1 Status Kelas pada Model ONNX vs Ground Truth
- Model `best_patra_highangle.onnx` dilatih dengan `single_cls=True` (`output0: [1, 5, 8400]` → **1 kelas `PKL`**). Oleh karena itu, model **tidak memprediksi 6 sub-kelas terpisah**, sehingga confusion matrix model adalah **`PKL` vs `Background`** (`TP=25`, `FP=25`, `FN=69`), sedangkan pemetaan ke 6 sub-kelas GT mengukur **sub-kelas mana yang dikenali vs gagal dikenali sebagai `PKL`**:

| Sub-kelas GT (`test/`) | Jumlah GT | Terdeteksi (`PKL`) | Lolos (`FN`) | Recall | Rata-rata IoU (TP) | Distribusi `train/` (% / Median Luas) |
|---|---:|---:|---:|---:|---:|---|
| `Payung` | 24 | 16 | 8 | **66.7%** | 0.747 | 213 (`26.0%`, `0.32%` frame) |
| `Emperan` | 5 | 2 | 3 | 40.0% | 0.775 | 43 (`5.3%`, `2.10%` frame) |
| `Gerobak` | 39 | 6 | **33** | **15.4%** | 0.660 | 358 (`43.8%`, `0.97%` frame) |
| `Terpal` | 24 | 1 | **23** | **4.2%** | 0.718 | 194 (`23.7%`, `0.73%` frame) |
| `Panggul` | 1 | 0 | 1 | 0.0% | — | 3 (`0.4%`, `22.26%` frame) |
| `Sepeda-motor` | 1 | 0 | 1 | 0.0% | — | 7 (`0.9%`, `0.35%` frame) |

### 3.2 Empat Masalah Kualitas Anotasi & Definisi Kelas yang Ditemukan (Bukti Aktual)
1. **Inkonsistensi definisi kelas `Payung` (Payung Hujan Pejalan Kaki vs Payung Lapak PKL)**:
   - Bukti visual di `fn_gallery_part2.jpg`: `FN#38` (`JL-PEMUDA`), `FN#40` & `FN#42` (`JL-PENGADEGAN-TIMUR`), dan `FN#58` (`JPO-MATRAMAN`) adalah **pejalan kaki biasa yang memegang payung hujan**, bukan tenda/payung pedagang — namun diberi label GT `Payung`!
   - Sebaliknya di `fp_gallery.jpg`, pejalan kaki berpayung hujan pink (`FP#22`, `c=0.60`) dan payung hitam (`FP#16`, `c=0.39`) tidak diberi label GT sehingga dihitung FP. Ini menciptakan konflik sinyal training langsung bagi model.
2. **Double-Labeling `Gerobak <-> Terpal` pada Objek Fisik yang Sama (`gt_overlap_gallery.jpg`)**:
   - Pada 4 frame `JL-KRAMAT-JAYA-RAYA-C01_CCTV-02`, **1 gerobak tertutup terpal biru diberi 2 kotak GT sekaligus (`Gerobak` dan `Terpal`) dengan `IoU = 0.75–0.79`!**
   - Karena `IoU 0.75–0.79 >> iou_nms (0.45)`, NMS pasti menyingkirkan salah satu prediksi apabila objek ini terdeteksi. Audit seluruh split: `train` (`1` pasang `>=0.30`, `0` konflik NMS), `valid` (`3` pasang `>=0.30`, `1` konflik NMS `>=0.45`), `test` (`4` pasang konflik NMS `>=0.45`).
3. **Ketidakseimbangan Ekstrem & Pergeseran Skala Sub-Kelas**:
   - `Gerobak` (`358`) vs `Panggul` (`3`) memiliki rasio **119 : 1**; `Sepeda-motor` hanya `7` box di `train/` (dan 1 sampel `test/` `noncctv_sep` berukuran `66.8%` layar vs median `0.35%` di `train/`!).
   - `Gerobak` di `valid/` memiliki median luas `0.40%` (86% kategori Far, 38.6% Tiny), jauh lebih kecil daripada median `Gerobak` di `train/` (`0.97%`, hanya 9.8% Tiny). Ini menjelaskan mengapa model sangat lemah pada `Gerobak` kecil/jauh meski jumlah box-nya terbanyak!
4. **Alasan Konseptual Mode 1-Kelas (`PKL`)**:
   - Penggabungan 6 sub-kelas menjadi 1 kelas `PKL` memang diperlukan secara konseptual dan operasional untuk aplikasi PETRA (Satpol PP hanya menindak status *pelanggaran PKL di ROI trotoar*, bukan membedakan `Panggul` yang hanya punya 3 sampel di seluruh dataset — melatih 6 kelas sebelumnya terbukti menjatuhkan test mAP@50 ke `0.158`). Namun **inkonsistensi anotasi** (payung hujan pejalan kaki, double-labeling gerobak-terpal, dan PKL tak berlabel) tetap merusak performa meskipun dalam mode 1-kelas!

---

## 4. False Negative Analysis (`69` Objek PKL Terlewat)

### 4.1 Threshold vs Kemampuan Model (Bukti Kuantitatif `max_conf` & Pre-NMS)

| Penyebab Mekanistik FN | Jumlah | % FN | Bukti Pengukuran |
|---|---:|---:|---|
| **`true_model_miss`** (`max_conf@IoU50 < 0.05`) | **55** | **79.7%** | Model benar-benar tidak mengenali objek — **menurunkan threshold TIDAK akan menyelesaikan mayoritas FN**. |
| **`localization_miss`** (`conf >= 0.25` di `0.10 <= IoU < 0.50`) | **7** | **10.1%** | Model melihat objeknya, tapi box hanya mencakup 18–39% area (`FN#13, #15, #18, #20, #26` terpal tepi; `FN#52, #63` atap gerobak). |
| **`threshold_recoverable`** (`0.05 <= max_conf@IoU50 < 0.25`) | **7** | **10.1%** | Hanya **5 objek** yang berada di `0.10–0.25` (`FN#33` c=0.12, `FN#47` c=0.18, `FN#59` c=0.13, `FN#67` c=0.22, `FN#68` c=0.22) dan **2 objek** di `0.05–0.10` (`FN#45` c=0.07, `FN#56` c=0.09). |
| **`nms_suppressed`** (pre-NMS `>= 0.25`, hilang pasca-NMS) | **0** | **0.0%** | NMS `0.45` **bukan** penyebab FN pada model saat ini. |

> [!IMPORTANT]
> **Analisis Low-Confidence (`low_conf_gallery.jpg`)**: Menurunkan threshold dari `0.25 → 0.10` hanya memulihkan **`+5 TP`**, tetapi menambah **`+27 FP`** (motor, pejalan kaki berjas hujan, barier jalan oranye, mobil, bayangan pohon malam). Menurunkan threshold di bawah `0.20` merugikan operasional secara netto.

### 4.2 Pengelompokan 69 FN Berdasarkan Faktor Visual (Terverifikasi dari `fn_gallery_part1/2.jpg`)

| Dimensi / Faktor | Jumlah FN | % dari 69 FN | Pola Visual Utama (ID FN) |
|---|---:|---:|---|
| **Ukuran — `Near (>=4%)`** | 19 | 27.5% | 16/19 berasal dari 1 kamera (`JL-KRAMAT-JAYA-RAYA`: terpal biru/hijau raksasa gelap di tepi frame `FN#08, #12–#22, #26–#27, #32–#33`) + `FN#37` + `FN#44` + `FN#69` (`noncctv_sep`). |
| **Ukuran — `Medium (1-4%)`** | 21 | 30.4% | Gerobak malam/bawah kanopi halte (`FN#45, #51–#53, #56, #59–#68`) dan gerobak terpal biru (`FN#09–#10, #23, #25, #28–#31`). |
| **Ukuran — `Far (0.25-1%)`** | 17 | 24.6% | Gerobak pinggir trotoar jauh & sore/malam (`FN#03, #11, #24, #35–#36, #39, #41, #46–#50, #54–#55, #57, #62, #64`). |
| **Ukuran — `Tiny (<0.25%)`** | 12 | 17.4% | 7 titik gerobak silau lampu di kejauhan `JL-DANAU-SUNTER-SELATAN` (`FN#01–#02, #04–#07`), plus 4 payung hujan kecil (`FN#38, #40, #42, #58`), `FN#34`, `FN#43`. |
| **Edge-of-frame** | **20** | **29.0%** | Tenda/terpal terpotong pinggir kanan/atas frame (`FN#12–#22, #24, #26–#27, #31–#33`), gerobak/emperan terpotong tepi bawah (`FN#37, #44, #66`). |
| **Low-light (crop `V < 75` / Night)** | **15** | **21.7%** | Terpal gelap malam di atas trotoar (`FN#16, #19, #21, #22, #27, #31, #32`) & gerobak di bawah bayangan kanopi/malam (`FN#36, #37, #48, #55, #61, #67`). |
| **Occlusion / Overlap** | **14** | **20.3%** | 4 pasang duplikat GT `Gerobak <-> Terpal` (`FN#08–#11, #23, #25, #29–#30`), gerobak tertutup dahan pohon (`FN#09, #11`), dan gerobak/emperan tertutup sebagian atap kanopi halte (`FN#60–#65`). |

---

## 5. Akar Masalah Utama (Prioritas Berdasarkan Dampak)

1. **Domain & Scale Gap pada `Gerobak` (Penyebab #1 FN — 33/69 FN = 47.8%)**:
   `Gerobak` pada CCTV nyata sering muncul berukuran kecil (`Far/Tiny`, 86% di `valid`, 56% di `test`), dalam posisi menghadap/membelakangi kamera di pinggir trotoar gelap/bawah kanopi (`JPO-PULO-MAS`, `JPO-JATINEGARA`, `JL-DANAU-SUNTER-SELATAN`). Model kuat mengenali `Payung` (66.7% recall) karena bentuk kubah warna cerah konsisten, tetapi gagal pada siluet `Gerobak` gelap/kecil.
2. **Kotak Parsial pada Objek Besar di Tepi Frame (`Terpal` & `Gerobak` — 7 FP + 7 FN = 14 error sekaligus)**:
   Model mendeteksi potongan bawah terpal (`FP#01–#04, #15`) atau hanya atap gerobak (`FP#14, #20`), bukan batas penuh objek — menghasilkan penalti ganda (FP + FN).
3. **Kualitas & Konsistensi Anotasi Dataset**:
   - Payung hujan pejalan kaki dilabeli `Payung` secara tidak konsisten (memicu `FP#22` c=0.60, `FP#16` c=0.39, dan 4 FN palsu).
   - Double-labeling `Gerobak <-> Terpal` (`IoU 0.75–0.79`) & objek PKL valid tak berlabel (`FP#05, #11, #21`).
   - 1 gambar outlier non-CCTV close-up (`noncctv_sep`) di `test` dan 3 sampel `Panggul` berukuran raksasa (`mean 39.6%` layar) di `train`.
4. **Hard-Negative Confusion pada Objek Jalan Raya (12 FP CCTV nyata)**:
   Atap mobil putih (`FP#12` c=0.78, `FP#13` c=0.42), motor/ojol (`FP#06, #09`), tong sampah biru (`FP#07`), dan kanopi halte (`FP#17`) memicu FP karena dataset `train/` hanya memiliki **16 gambar background negatif** (`5%` dari train) dan minim contoh *hard-negative* jalan raya padat kendaraan tanpa PKL!

---

## 6. Correction Strategy (Terurut Berdasarkan Prioritas & Risiko)

> [!CAUTION]
> **Aturan Ketat**: `test/` (**41 gambar**) **TIDAK BOLEH diubah menjadi data training** dan tidak dipakai untuk memilih hyperparameter/threshold. Seluruh perbaikan data & seleksi eksperimen hanya dilakukan pada `train/` dan dievaluasi di `valid/`, lalu diuji final satu kali di `test/` terhadap baseline `AI-Patra/model/best_patra_highangle.onnx`.

### Prioritas 1 — Perbaikan Anotasi pada `train/` (Tanpa Menyentuh `test/`)
1. **Audit & bersihkan label `train/`** (khususnya):
   - Hapus/review label `Payung` yang ternyata payung hujan pejalan kaki di `train/` (penyebab langsung `FP#22` c=0.60 & `FP#16`).
   - Tinjau 3 sampel `Panggul` non-CCTV raksasa (`mean area 39.6%`) dan foto close-up non-CCTV di `train/` yang menggeser prior skala model dari objek CCTV high-angle.
   - Pastikan label `Gerobak` di `train/` mencakup keseluruhan bodi sampai roda (bukan hanya atap), dan tidak ada duplikat kotak pada satu objek fisik.
   - *Catatan*: `train/` yang baru ditambahkan (+19 gambar `idcctv*`) sebelumnya menyebabkan regresi `test` karena ukuran box-nya jauh lebih besar dari CCTV Diskominfotik — jika dipertahankan, hanya ambil frame dengan skala objek CCTV `Far/Medium` (`<4%` frame), bukan close-up/medium-near!

### Prioritas 2 — Penambahan Hard-Negative Samples pada `train/` (Menekan Vehicle/Roadside FP)
- Saat ini `train/` hanya punya **16 gambar background (5%)**, terlalu sedikit untuk kamera lalu lintas padat Jakarta!
- Tambahkan **35–50 frame CCTV Jakarta kosong PKL (0 label)** yang secara khusus mengandung pola FP aktual dari Bagian 2:
  - Jalan raya macet dengan **mobil putih/MPV** (`STASIUN-DUREN-KALIBATA` pattern) & **pengendara motor/ojol** (`JL-PROF-DR-SATRIO`, `JL-PENGADEGAN-TIMUR`).
  - Trotoar dengan **tong sampah biru/berwarna**, **pejalan kaki berpayung hujan**, **kanopi halte**, dan **ruko terang malam hari**.
- *Larangan*: Jangan gunakan heuristic post-filter (mis. menyaring warna/ukuran secara kasar) yang bisa membuang PKL valid; biarkan model mempelajari batas visualnya langsung lewat hard-negative training samples!

### Prioritas 3 — Penambahan Data Target untuk Weak Spots (`Gerobak Far/Medium` & `Low-Light` & `Edge`)
- Kumpulkan & anotasi **50–80 frame CCTV Jakarta high-angle** (dari stream Diskominfotik/JakCCTV yang sudah ada di katalog PETRA!) dengan fokus ketat pada:
  1. **`Gerobak` berukuran `Far` (`0.25–1%`) & `Medium` (`1–4%`)** di sisi trotoar (siang, sore, dan malam hari dengan sorotan lampu kendaraan).
  2. **`Terpal` & `Gerobak` yang terpotong sebagian di tepi frame** dengan bounding box penuh sesuai bagian yang terlihat.
  3. Pertahankan kamera yang benar-benar terpisah dari 17 kamera `valid/` dan 15 kamera `test/` (`0% camera leakage` diverifikasi via `prepare_dataset.py --verify`).

### Prioritas 4 — Penyesuaian Augmentasi (Bila Dilakukan Fine-Tuning Setelah Data Siap)
- Berdasarkan Bagian 4:
  - Gunakan **`scale=0.35–0.45`** (diperluas ke skala lebih kecil agar `Gerobak` berukuran `Medium` di `train/` juga melatih detektor pada skala `Far/Tiny`!).
  - Gunakan **`translate=0.10`** agar objek terpotong tepi frame terlatih dengan benar (`29%` FN berada di edge-of-frame).
  - Gunakan **`hsv_v=0.45–0.50`** untuk ketahanan malam/bawah kanopi (`21.7%` FN low-light).
  - Mulai fine-tuning dari `AI-Patra/model/best.pt` (`PATRA Original`), gunakan `lr0=0.0002–0.0003`, `--no-copy-best`, seleksi ketat pada `valid/`.

### Prioritas 5 — Confidence Threshold & NMS (Temuan Audit Saat Ini)
- **NMS (`iou_nms = 0.45`)**: **TIDAK perlu diubah sekarang** — terbukti **0 duplicate FP** dan **0 NMS-suppressed FN** pada `test/`.
- **Confidence Threshold**:
  - Di `valid`, `conf = 0.20` (`F1 = 0.4236`, `Prec = 0.672`, `Rec = 0.309`) vs `conf = 0.25` (`F1 = 0.3959`, `Prec = 0.672`, `Rec = 0.281`) — menurunkan ke `0.20` layak diuji pada operasional, tetapi **jangan turun di bawah `0.20`** karena `low_conf_gallery.jpg` membuktikan rasio noise `5.4 FP : 1 TP` di rentang `0.10–0.25`.
  - Karena **79.7% FN adalah `true_model_miss` (`<0.05`)**, optimasi threshold saja hanya berdampak kecil (`+2` sampai `+4` TP) — perbaikan nyata harus datang dari **Prioritas 1–3 (Data & Anotasi)**.

---

## 7. Final Validation — Sebelum vs Sesudah Perbaikan (`dataset_v2`)

### 7.1 Perbaikan yang Diterapkan (`AI-Patra/dataset_v2/`, 100% Reversible, `valid/` & `test/` Tidak Disentuh)
- Menghapus **14 gambar outlier** dari `train/` (`2` foto close-up `Panggul` 22.3% & 93.3% layar + `12` foto web/berita `idcctv*`), mempertahankan `7` frame asli JakCCTV Diskominfotik (`idcctv22–28`).
- Menghapus **36 box bukan PKL** hasil verifikasi visual (`train_small_payung_part1..4.jpg`: pejalan kaki berpayung hujan & rambu STOP).
- Menambahkan **35 frame hard-negative CCTV live terverifikasi 0-PKL** (`10` active-learning FP mobil/motor/traffic + `25` lalu lintas bersih Jakarta/Bandung/Semarang; rasio background `train` naik `5.0% → 16.4%`, `0%` camera leakage).

### 7.2 Evaluasi Kuantitatif pada `valid/` (`61` gambar, `139` GT, `IoU=0.50`, `conf=0.25`)
Sumber: `AI-Patra/evaluation_results/phase7_v2_valid/report.md`

| Metrik (`valid/`) | `patra_orig` (Baseline) | `patra_v2_ft` | `patra_v2_base` |
|---|---:|---:|---:|
| **mAP@50** | 0.3092 | **0.3167 (+0.75%)** | **0.3391 (+2.99%)** |
| **mAP@50-95** | 0.1368 | **0.1410 (+0.42%)** | **0.1465 (+0.97%)** |
| **Precision / Recall / F1 (`@0.25`)** | 0.672 / 0.281 / 0.396 | 0.621 / **0.295** / **0.400** | **0.702** / 0.237 / 0.355 |
| **FP / FN (`@0.25`)** | 19 / 100 (`12 bg + 7 loc`) | 25 / **98** | **14** / 106 (**`5 bg`**) |
| **Recall `Gerobak`** | 8.8% (5/57) | **21.1% (12/57)** | 12.3% (7/57) |
| **Recall `Tiny <0.25%`** | 7.9% (3/38) | **13.2% (5/38)** | 2.6% (1/38) |
| **Night / Low-Light F1** | 0.222 | **0.600 (0 FP)** | 0.000 |

### 7.3 Evaluasi Final pada `test/` (`41` gambar unseen, `15` kamera, `94` GT, `IoU=0.50`, `conf=0.25`)
Sumber: `AI-Patra/evaluation_results/phase7_v2_test/report.md`

| Metrik (`test/`) | `patra_orig` (Baseline) | `patra_v2_ft` | `patra_v2_base` |
|---|---:|---:|---:|
| **mAP@50** | **0.2809** | 0.2683 (-1.26%) | 0.2388 (-4.21%) |
| **mAP@50-95** | 0.1294 | **0.1308 (+0.14%)** | 0.1139 (-1.55%) |
| **Precision (`@0.25`)** | 0.5000 | **0.6000 (+10.0%)** | 0.4571 |
| **Recall (`@0.25`)** | **0.2660** | 0.1596 (-10.6%) | 0.1702 |
| **F1 (`@0.25`)** | **0.3472** | 0.2521 (-9.5%) | 0.2481 |
| **Best F1 (`@Conf`)** | **0.3553 (`@0.20`)** | 0.3121 (`@0.15`) | 0.3333 (`@0.15`) |
| **False Positive (`@0.25`)** | 25 (`18 bg + 7 loc`) | **10 (-60%: `8 bg + 2 loc`)** | 19 (`15 bg + 4 loc`) |
| **False Negative (`@0.25`)** | **69** | 79 (+10 FN) | 78 (+9 FN) |
| **Avg TP IoU (`@0.25`)** | 0.7269 | **0.7576 (+3.1%)** | 0.7545 |
| **Tiny (`<0.25%`) Recall** | **33.3%** (6/18) | 5.6% (1/18) | 5.6% (1/18) |
| **Far (`<1%`) Recall** | **31.0%** (13/42) | 9.5% (4/42) | 9.5% (4/42) |
| **Medium (`1-4%`) F1** | 0.4400 | **0.4681** (Prec 73.3%) | 0.3846 |
| **High-Angle JPO F1** | 0.4561 | **0.5098** (`JPO-MATRAMAN` 0 FP!) | 0.4000 |
| **Sub-kelas Recall (`Payung` / `Gerobak` / `Emperan` / `Terpal`)** | **66.7%** / **15.4%** / 40.0% / **4.2%** | 37.5% / 5.1% / **60.0%** / 0.0% | 45.8% / 7.7% / 0.0% / **4.2%** |
| **Bg-only images FP** | **0/2** | **0/2** | 2/2 |
| **Latency CPU** | 32.0 ms | **31.1 ms** | **30.7 ms** |

### 7.4 Keputusan Objektif Final
- **Yang terbukti berhasil**: Menghapus outlier 93% + 36 payung hujan + menambahkan 35 hard-negative live berhasil memangkas **False Positive sebesar 60% (`25 → 10`)**, menaikkan **Precision +10% (`0.50 → 0.60`, bahkan `0.80` di `conf=0.40` dan `0.92` di `conf=0.50`)**, menaikkan **`mAP@50-95` di `valid` (`+0.42%`) & `test` (`+0.14%`)**, dan menaikkan **High-Angle JPO F1 (`0.456 → 0.510`)**.
- **Alasan `patra_v2_ft` BELUM menggantikan `PATRA Original` di produksi**: Menambah 35 frame negatif tanpa diimbangi penambahan frame positif `Far/Tiny Gerobak` baru membuat model terlalu konservatif pada objek kecil (`Tiny` recall turun `33.3% → 5.6%`, `test mAP@50` turun tipis `0.2809 → 0.2683`, `F1@0.25` turun `0.3472 → 0.2521`).
- **Status Model Aktif**:
  - **`FE-Patra/public/models/best.onnx`** tetap memakai **`PATRA Original` (`AI-Patra/model/best_patra_highangle.onnx`)** sebagai model paling seimbang saat ini (`mAP@50 = 0.2809`, `F1 = 0.3472`, `Tiny recall = 33.3%`).
  - **`AI-Patra/model/patra_v2_curated_ft.onnx`** disimpan terpisah sebagai model *high-precision / low-FP* (`-60% FP`).
- **Syarat konkret agar iterasi berikutnya menang mutlak di SEMUA metrik**: Tambahkan **50–80 frame CCTV positif baru berisi `Gerobak` & `Terpal` skala `Far/Tiny` (<1% layar)** ke `dataset_v2/train/` untuk menyeimbangkan 35 hard-negative yang sudah terbukti memotong FP hingga 60%.
