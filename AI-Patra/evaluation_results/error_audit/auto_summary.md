# Raw Forensic Audit Data (`test` split, `conf=0.25`, `IoU=0.5`)

- Model: `C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_patra_highangle.onnx` | Output tensor: `[1, 5, 8400]` (1 kelas `PKL`)
- Total: `41` gambar | `94` GT | `TP=25` | `FP=25` | `FN=69`
- FP breakdown: `{'incorrect_bbox': 7, 'background': 18}`
- FN mekanistik: `{'true_model_miss': 55, 'localization_miss': 7, 'threshold_recoverable': 7}`
- FN faktor kondisi: `{'Near (>=4%)': 19, 'Medium (1-4%)': 21, 'Far (0.25-1%)': 17, 'Tiny (<0.25%)': 12, 'Low-light (crop V<75 or Night)': 15, 'Edge-of-frame': 20, 'GT-to-GT Overlap (IoU>=0.15)': 14}`
- Low-confidence (`0.10..0.25`): `{'low_conf_fp': 27, 'recoverable_tp': 5}`

## Daftar Lengkap False Positive (untuk klasifikasi visual dari `fp_gallery.jpg`)
| FP# | Tipe | Conf | MaxGT IoU | Near GT | Pred/GT Area | Size | Edge | Camera |
|---:|---|---:|---:|---|---:|---|---|---|
| FP#01 | incorrect_bbox | 0.35 | 0.33 | Terpal | 0.33 | Near (>=4%) | Y | 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 |
| FP#02 | incorrect_bbox | 0.41 | 0.39 | Terpal | 0.39 | Near (>=4%) | Y | 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 |
| FP#03 | incorrect_bbox | 0.39 | 0.34 | Terpal | 0.34 | Near (>=4%) | Y | 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 |
| FP#04 | incorrect_bbox | 0.31 | 0.27 | Terpal | 0.27 | Near (>=4%) | Y | 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 |
| FP#05 | background | 0.63 | 0.08 | - | - | Medium (1-4%) | N | 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 |
| FP#06 | background | 0.43 | 0.00 | - | - | Tiny (<0.25%) | N | 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 |
| FP#07 | background | 0.49 | 0.00 | - | - | Far (0.25-1%) | N | 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 |
| FP#08 | background | 0.28 | 0.00 | - | - | Far (0.25-1%) | N | 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 |
| FP#09 | background | 0.30 | 0.00 | - | - | Medium (1-4%) | N | 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 |
| FP#10 | background | 0.29 | 0.00 | - | - | Near (>=4%) | Y | 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 |
| FP#11 | background | 0.25 | 0.09 | - | - | Tiny (<0.25%) | N | 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 |
| FP#12 | background | 0.78 | 0.00 | - | - | Far (0.25-1%) | N | 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 |
| FP#13 | background | 0.42 | 0.00 | - | - | Far (0.25-1%) | N | 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 |
| FP#14 | incorrect_bbox | 0.26 | 0.16 | Gerobak | 0.18 | Far (0.25-1%) | N | 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 |
| FP#15 | incorrect_bbox | 0.43 | 0.38 | Terpal | 0.38 | Tiny (<0.25%) | N | 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 |
| FP#16 | background | 0.39 | 0.08 | - | - | Tiny (<0.25%) | N | 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 |
| FP#17 | background | 0.32 | 0.00 | - | - | Medium (1-4%) | N | 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 |
| FP#18 | background | 0.27 | 0.00 | - | - | Medium (1-4%) | N | 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 |
| FP#19 | background | 0.27 | 0.00 | - | - | Far (0.25-1%) | N | 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 |
| FP#20 | incorrect_bbox | 0.31 | 0.15 | Gerobak | 0.21 | Far (0.25-1%) | N | 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 |
| FP#21 | background | 0.27 | 0.02 | - | - | Far (0.25-1%) | N | 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 |
| FP#22 | background | 0.60 | 0.09 | - | - | Tiny (<0.25%) | N | 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 |
| FP#23 | background | 0.54 | 0.04 | - | - | Medium (1-4%) | Y | noncctv_sep |
| FP#24 | background | 0.43 | 0.05 | - | - | Medium (1-4%) | N | noncctv_sep |
| FP#25 | background | 0.31 | 0.01 | - | - | Medium (1-4%) | Y | noncctv_sep |

## Ringkasan Audit Anotasi Seluruh Split (`train/valid/test`)
| Split | Img | Bg | Boxes | Edge | AR>5 | GT Overlap IoU>=0.30 | GT Overlap IoU>=0.45 (NMS conflict) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `train` | 321 | 16 | 818 | 100 | 0 | 1 | 0 |
| `valid` | 61 | 3 | 139 | 18 | 1 | 3 | 1 |
| `test` | 41 | 2 | 94 | 20 | 0 | 4 | 4 |
