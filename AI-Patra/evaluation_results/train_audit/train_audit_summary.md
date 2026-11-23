# Train Set Read-Only Annotation Audit (Prioritas 1)

## Perbandingan Skala Objek per Subset di `train/`
| Subset | Images | Boxes | Tiny (<0.25%) | Far (0.25-1%) | Medium (1-4%) | Near (>=4%) | Median Area% | Mean Area% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `roboflow_cctv` | 300 | 710 | 169 | 281 | 215 | 45 | 0.644% | 1.387% |
| `idcctv_added` | 19 | 106 | 5 | 27 | 45 | 29 | 1.991% | 2.809% |
| `noncctv_orig` | 2 | 2 | 0 | 0 | 0 | 2 | 57.805% | 57.805% |

- Galeri non-CCTV / `idcctv*` / box >= 12%: `27` gambar (`train_noncctv_and_large_gallery.jpg`)
- Galeri `Payung` kecil (`<0.8%`): `151` box (`train_small_payung_part*.jpg`)

## Daftar Gambar Non-CCTV / `idcctv*` / Box Besar (>=12%)
| TR# | Subset | File | Res | Boxes | Max Area% | Classes |
|---:|---|---|---|---:|---:|---|
| TR#01 | `roboflow_cctv` | `501814_JKT_DISHUB_STASIUN-KALENDER-C01_CCTV-02_20240118172833_jpg.rf.59403035a6dfa7eee0e147742b1d1752.jpg` | 640x640 | 13 | 17.8% | {'Terpal': 5, 'Payung': 6, 'Emperan': 1, 'Gerobak': 1} |
| TR#02 | `roboflow_cctv` | `501814_JKT_DISHUB_STASIUN-KALENDER-C01_CCTV-02_20240118184114_jpg.rf.593086d87e50881c60357d14335235ab.jpg` | 640x640 | 8 | 34.7% | {'Terpal': 4, 'Payung': 4} |
| TR#03 | `roboflow_cctv` | `501814_JKT_DISHUB_STASIUN-KALENDER-C01_CCTV-02_20240118195542_jpg.rf.550d842d48a8fe4dce367048302d63a9.jpg` | 640x640 | 12 | 35.4% | {'Terpal': 4, 'Payung': 7, 'Gerobak': 1} |
| TR#04 | `roboflow_cctv` | `501814_JKT_DISHUB_STASIUN-KALENDER-C01_CCTV-02_20240118211009_jpg.rf.d15d329abee2071d052e7389e59cd17d.jpg` | 640x640 | 8 | 34.8% | {'Terpal': 2, 'Payung': 6} |
| TR#05 | `roboflow_cctv` | `501864_JKT_DISHUB_TERMINAL-KAMPUNG-RAMBUTAN-C01_CCTV-03_20240119032645_jpg.rf.fcd3bf3374c29c45a74373dc1f5a2d32.jpg` | 640x640 | 2 | 16.3% | {'Gerobak': 1, 'Terpal': 1} |
| TR#06 | `roboflow_cctv` | `501864_JKT_DISHUB_TERMINAL-KAMPUNG-RAMBUTAN-C01_CCTV-03_20240119044156_jpg.rf.2ecebb77a191704bdae703677b71b5dc.jpg` | 640x640 | 1 | 15.0% | {'Terpal': 1} |
| TR#07 | `idcctv_added` | `idcctv10_raw.jpg` | 977x652 | 13 | 12.2% | {'Payung': 7, 'Gerobak': 6} |
| TR#08 | `idcctv_added` | `idcctv11_raw.jpg` | 1200x800 | 5 | 7.7% | {'Gerobak': 4, 'Payung': 1} |
| TR#09 | `idcctv_added` | `idcctv12_raw.jpg` | 1400x1046 | 4 | 5.7% | {'Payung': 1, 'Emperan': 3} |
| TR#10 | `idcctv_added` | `idcctv13_raw.jpg` | 650x364 | 13 | 8.0% | {'Gerobak': 13} |
| TR#11 | `idcctv_added` | `idcctv15_raw.jpg` | 542x300 | 8 | 1.5% | {'Gerobak': 8} |
| TR#12 | `idcctv_added` | `idcctv17_raw.jpg` | 626x455 | 6 | 6.6% | {'Payung': 1, 'Gerobak': 3, 'Terpal': 2} |
| TR#13 | `idcctv_added` | `idcctv22_raw.jpg` | 1600x900 | 13 | 6.7% | {'Payung': 9, 'Terpal': 2, 'Panggul': 1, 'Gerobak': 1} |
| TR#14 | `idcctv_added` | `idcctv23_raw.jpg` | 1600x900 | 2 | 0.9% | {'Payung': 1, 'Gerobak': 1} |
| TR#15 | `idcctv_added` | `idcctv24_raw.jpg` | 1600x900 | 1 | 0.9% | {'Gerobak': 1} |
| TR#16 | `idcctv_added` | `idcctv25_raw.jpg` | 1600x900 | 2 | 0.4% | {'Gerobak': 2} |
| TR#17 | `idcctv_added` | `idcctv26_raw.jpg` | 1600x900 | 2 | 1.3% | {'Gerobak': 2} |
| TR#18 | `idcctv_added` | `idcctv27_raw.jpg` | 1600x900 | 2 | 1.3% | {'Payung': 2} |
| TR#19 | `idcctv_added` | `idcctv28_raw.jpg` | 1600x900 | 2 | 2.3% | {'Gerobak': 1, 'Emperan': 1} |
| TR#20 | `idcctv_added` | `idcctv2_raw.jpg` | 640x360 | 7 | 0.8% | {'Payung': 7} |
| TR#21 | `idcctv_added` | `idcctv3_raw.jpg` | 700x395 | 2 | 8.9% | {'Payung': 1, 'Gerobak': 1} |
| TR#22 | `idcctv_added` | `idcctv4_raw.jpg` | 1024x576 | 6 | 4.2% | {'Payung': 1, 'Gerobak': 5} |
| TR#23 | `idcctv_added` | `idcctv7_raw.jpg` | 1200x676 | 6 | 3.9% | {'Payung': 2, 'Emperan': 4} |
| TR#24 | `idcctv_added` | `idcctv8_raw.jpg` | 1280x720 | 7 | 7.2% | {'Gerobak': 6, 'Terpal': 1} |
| TR#25 | `idcctv_added` | `idcctv9_raw.jpg` | 1024x577 | 5 | 2.5% | {'Gerobak': 4, 'Terpal': 1} |
| TR#26 | `noncctv_orig` | `Panggul_jpg.rf.4219b01a02091914e6b0be2bf4ef54a1.jpg` | 640x640 | 1 | 22.3% | {'Panggul': 1} |
| TR#27 | `noncctv_orig` | `panggul_jpg.rf.f58f560d3c2801db9249f3d45e5484e3.jpg` | 640x640 | 1 | 93.3% | {'Panggul': 1} |
