# PATRA ONNX Evaluation Report (`test` split)

- **Dataset split**: `test` (41 gambar, 15 kamera unik, 94 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.25`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `patra_orig` | 9.85 | 640 | **0.2809** | **0.1294** | 0.3553 (@0.20) | 0.5000 | 0.2660 | 0.3472 | 32.0 | 31.3 |
| `patra_v2_ft` | 9.85 | 640 | **0.2683** | **0.1308** | 0.3121 (@0.15) | 0.6000 | 0.1596 | 0.2521 | 31.1 | 32.1 |
| `patra_v2_base` | 9.85 | 640 | **0.2388** | **0.1139** | 0.3333 (@0.15) | 0.4571 | 0.1702 | 0.2481 | 30.7 | 32.6 |

---
## Model: `patra_orig` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `31.96 ms` (p95 `36.09 ms`, `31.3 FPS`) | E2E: `45.97 ms` (`21.8 FPS`)
- **True mAP@50**: `0.2809` | **True mAP@50-95**: `0.1294`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 30 | 52 | 64 | 0.3659 | 0.3191 | 0.3409 | 0.7150 |
| 0.15 | 28 | 40 | 66 | 0.4118 | 0.2979 | 0.3457 | 0.7231 |
| 0.20 | 27 | 31 | 67 | 0.4655 | 0.2872 | 0.3553 | 0.7219 |
| 0.25 | 25 | 25 | 69 | 0.5000 | 0.2660 | 0.3472 | 0.7269 |
| 0.30 | 20 | 18 | 74 | 0.5263 | 0.2128 | 0.3030 | 0.7431 |
| 0.35 | 18 | 13 | 76 | 0.5806 | 0.1915 | 0.2880 | 0.7545 |
| 0.40 | 16 | 10 | 78 | 0.6154 | 0.1702 | 0.2667 | 0.7577 |
| 0.45 | 15 | 5 | 79 | 0.7500 | 0.1596 | 0.2632 | 0.7660 |
| 0.50 | 14 | 4 | 80 | 0.7778 | 0.1489 | 0.2500 | 0.7656 |
| 0.60 | 12 | 3 | 82 | 0.8000 | 0.1277 | 0.2202 | 0.7937 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 5 | 2 | 3 | 0.4000 | 0.7750 |
| Gerobak | 39 | 6 | 33 | 0.1538 | 0.6599 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 24 | 16 | 8 | 0.6667 | 0.7466 |
| Sepeda-motor | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Terpal | 24 | 1 | 23 | 0.0417 | 0.7175 |

- **False Positive Breakdown**: {"localization_error": 7, "background_fp": 18}
- **Background-only images (0 GT)**: 2 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 20 | 1 | 5 | 19 | 0.1667 | 0.0500 | 0.0769 | 0.5188 |
| Medium (1-4%) | 32 | 11 | 7 | 21 | 0.6111 | 0.3438 | 0.4400 | 0.7650 |
| Far (<1%) | 42 | 13 | 13 | 29 | 0.5000 | 0.3095 | 0.3824 | 0.7106 |
| Sub-slice Tiny (<0.25%) | 18 | 6 | - | 12 | - | 0.3333 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Day / Bright | 2 | 8 | 0 | 4 | 8 | 0.0000 | 0.0000 | 0.0000 |
| Dusk / Overcast | 34 | 80 | 23 | 20 | 57 | 0.5349 | 0.2875 | 0.3740 |
| Night / Low-Light | 5 | 6 | 2 | 1 | 4 | 0.6667 | 0.3333 | 0.4444 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 41 | 94 | 25 | 25 | 69 | 0.5000 | 0.2660 | 0.3472 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 17 | 35 | 13 | 9 | 22 | 0.5909 | 0.3714 | 0.4561 |
| High-Angle Street CCTV | 23 | 58 | 12 | 13 | 46 | 0.4800 | 0.2069 | 0.2892 |
| Non-CCTV / Mixed | 1 | 1 | 0 | 3 | 1 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 41 | 94 | 25 | 25 | 69 | 0.5000 | 0.2660 | 0.3472 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 | 6 | 26 | 0 | 5 | 26 | 0.0000 | 0.0000 | 0.0000 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-01 | 6 | 7 | 0 | 0 | 7 | 0.0000 | 0.0000 | 0.0000 |
| 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 | 4 | 6 | 0 | 1 | 6 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501734_JKS_DISHUB_JL-TAMAN-MARGASATWA-RAYA-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| noncctv_sep | 1 | 1 | 0 | 3 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501829_JKS_DISHUB_STASIUN-PASAR-MINGGU-C01_CCTV-01 | 1 | 4 | 1 | 0 | 3 | 1.0000 | 0.2500 | 0.4000 |
| 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 | 4 | 9 | 3 | 3 | 6 | 0.5000 | 0.3333 | 0.4000 |
| 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 | 2 | 3 | 1 | 1 | 2 | 0.5000 | 0.3333 | 0.4000 |
| 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 | 9 | 20 | 10 | 5 | 10 | 0.6667 | 0.5000 | 0.5714 |
| 501798_JKT_KESBANGPOL_JL-PEMUDA-C03_CCTV-01 | 1 | 2 | 1 | 0 | 1 | 1.0000 | 0.5000 | 0.6667 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 | 1 | 2 | 1 | 2 | 1 | 0.3333 | 0.5000 | 0.4000 |
| 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 | 2 | 9 | 5 | 3 | 4 | 0.6250 | 0.5556 | 0.5882 |
| 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 | 1 | 2 | 2 | 1 | 0 | 0.6667 | 1.0000 | 0.8000 |
| 501840_JKS_DISHUB_JL-PROF-DR-SATRIO-C02_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |

---
## Model: `patra_v2_ft` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v2_curated_ft.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `31.15 ms` (p95 `37.12 ms`, `32.1 FPS`) | E2E: `42.78 ms` (`23.4 FPS`)
- **True mAP@50**: `0.2683` | **True mAP@50-95**: `0.1308`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 24 | 38 | 70 | 0.3871 | 0.2553 | 0.3077 | 0.7533 |
| 0.15 | 22 | 25 | 72 | 0.4681 | 0.2340 | 0.3121 | 0.7472 |
| 0.20 | 20 | 15 | 74 | 0.5714 | 0.2128 | 0.3101 | 0.7460 |
| 0.25 | 15 | 10 | 79 | 0.6000 | 0.1596 | 0.2521 | 0.7576 |
| 0.30 | 14 | 7 | 80 | 0.6667 | 0.1489 | 0.2435 | 0.7591 |
| 0.35 | 13 | 5 | 81 | 0.7222 | 0.1383 | 0.2321 | 0.7648 |
| 0.40 | 12 | 3 | 82 | 0.8000 | 0.1277 | 0.2202 | 0.7645 |
| 0.45 | 11 | 2 | 83 | 0.8462 | 0.1170 | 0.2056 | 0.7739 |
| 0.50 | 11 | 1 | 83 | 0.9167 | 0.1170 | 0.2075 | 0.7739 |
| 0.60 | 10 | 1 | 84 | 0.9091 | 0.1064 | 0.1905 | 0.7937 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 5 | 3 | 2 | 0.6000 | 0.7418 |
| Gerobak | 39 | 2 | 37 | 0.0513 | 0.6720 |
| Panggul | 1 | 1 | 0 | 1.0000 | 0.7678 |
| Payung | 24 | 9 | 15 | 0.3750 | 0.7807 |
| Sepeda-motor | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Terpal | 24 | 0 | 24 | 0.0000 | 0.0000 |

- **False Positive Breakdown**: {"background_fp": 8, "localization_error": 2}
- **Background-only images (0 GT)**: 2 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 20 | 0 | 0 | 20 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Medium (1-4%) | 32 | 11 | 4 | 21 | 0.7333 | 0.3438 | 0.4681 | 0.7742 |
| Far (<1%) | 42 | 4 | 6 | 38 | 0.4000 | 0.0952 | 0.1538 | 0.7119 |
| Sub-slice Tiny (<0.25%) | 18 | 1 | - | 17 | - | 0.0556 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Day / Bright | 2 | 8 | 0 | 1 | 8 | 0.0000 | 0.0000 | 0.0000 |
| Dusk / Overcast | 34 | 80 | 14 | 7 | 66 | 0.6667 | 0.1750 | 0.2772 |
| Night / Low-Light | 5 | 6 | 1 | 2 | 5 | 0.3333 | 0.1667 | 0.2222 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 41 | 94 | 15 | 10 | 79 | 0.6000 | 0.1596 | 0.2521 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 17 | 35 | 13 | 3 | 22 | 0.8125 | 0.3714 | 0.5098 |
| High-Angle Street CCTV | 23 | 58 | 2 | 6 | 56 | 0.2500 | 0.0345 | 0.0606 |
| Non-CCTV / Mixed | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 41 | 94 | 15 | 10 | 79 | 0.6000 | 0.1596 | 0.2521 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 | 6 | 26 | 0 | 1 | 26 | 0.0000 | 0.0000 | 0.0000 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-01 | 6 | 7 | 0 | 1 | 7 | 0.0000 | 0.0000 | 0.0000 |
| 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 | 4 | 6 | 0 | 1 | 6 | 0.0000 | 0.0000 | 0.0000 |
| 501829_JKS_DISHUB_STASIUN-PASAR-MINGGU-C01_CCTV-01 | 1 | 4 | 0 | 1 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 | 2 | 3 | 0 | 2 | 3 | 0.0000 | 0.0000 | 0.0000 |
| 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501798_JKT_KESBANGPOL_JL-PEMUDA-C03_CCTV-01 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501734_JKS_DISHUB_JL-TAMAN-MARGASATWA-RAYA-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501840_JKS_DISHUB_JL-PROF-DR-SATRIO-C02_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| noncctv_sep | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 | 2 | 9 | 1 | 0 | 8 | 1.0000 | 0.1111 | 0.2000 |
| 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 | 4 | 9 | 4 | 0 | 5 | 1.0000 | 0.4444 | 0.6154 |
| 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 | 9 | 20 | 9 | 2 | 11 | 0.8182 | 0.4500 | 0.5806 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 | 1 | 2 | 1 | 1 | 1 | 0.5000 | 0.5000 | 0.5000 |

---
## Model: `patra_v2_base` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v2_curated_base.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `30.68 ms` (p95 `37.67 ms`, `32.6 FPS`) | E2E: `41.83 ms` (`23.9 FPS`)
- **True mAP@50**: `0.2388` | **True mAP@50-95**: `0.1139`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 27 | 43 | 67 | 0.3857 | 0.2872 | 0.3293 | 0.7379 |
| 0.15 | 24 | 26 | 70 | 0.4800 | 0.2553 | 0.3333 | 0.7429 |
| 0.20 | 21 | 23 | 73 | 0.4773 | 0.2234 | 0.3043 | 0.7455 |
| 0.25 | 16 | 19 | 78 | 0.4571 | 0.1702 | 0.2481 | 0.7545 |
| 0.30 | 13 | 15 | 81 | 0.4643 | 0.1383 | 0.2131 | 0.7500 |
| 0.35 | 12 | 13 | 82 | 0.4800 | 0.1277 | 0.2017 | 0.7565 |
| 0.40 | 12 | 13 | 82 | 0.4800 | 0.1277 | 0.2017 | 0.7565 |
| 0.45 | 10 | 7 | 84 | 0.5882 | 0.1064 | 0.1802 | 0.7761 |
| 0.50 | 8 | 6 | 86 | 0.5714 | 0.0851 | 0.1481 | 0.7947 |
| 0.60 | 6 | 2 | 88 | 0.7500 | 0.0638 | 0.1176 | 0.8193 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 5 | 0 | 5 | 0.0000 | 0.0000 |
| Gerobak | 39 | 3 | 36 | 0.0769 | 0.6958 |
| Panggul | 1 | 1 | 0 | 1.0000 | 0.7878 |
| Payung | 24 | 11 | 13 | 0.4583 | 0.7750 |
| Sepeda-motor | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Terpal | 24 | 1 | 23 | 0.0417 | 0.6718 |

- **False Positive Breakdown**: {"background_fp": 15, "localization_error": 4}
- **Background-only images (0 GT)**: 2 gambar -> `2` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 20 | 2 | 3 | 18 | 0.4000 | 0.1000 | 0.1600 | 0.6858 |
| Medium (1-4%) | 32 | 10 | 10 | 22 | 0.5000 | 0.3125 | 0.3846 | 0.7571 |
| Far (<1%) | 42 | 4 | 6 | 38 | 0.4000 | 0.0952 | 0.1538 | 0.7822 |
| Sub-slice Tiny (<0.25%) | 18 | 1 | - | 17 | - | 0.0556 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Day / Bright | 2 | 8 | 1 | 3 | 7 | 0.2500 | 0.1250 | 0.1667 |
| Dusk / Overcast | 34 | 80 | 15 | 13 | 65 | 0.5357 | 0.1875 | 0.2778 |
| Night / Low-Light | 5 | 6 | 0 | 3 | 6 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 41 | 94 | 16 | 19 | 78 | 0.4571 | 0.1702 | 0.2481 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 17 | 35 | 10 | 5 | 25 | 0.6667 | 0.2857 | 0.4000 |
| High-Angle Street CCTV | 23 | 58 | 6 | 13 | 52 | 0.3158 | 0.1034 | 0.1558 |
| Non-CCTV / Mixed | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 41 | 94 | 16 | 19 | 78 | 0.4571 | 0.1702 | 0.2481 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-01 | 6 | 7 | 0 | 4 | 7 | 0.0000 | 0.0000 | 0.0000 |
| 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 | 4 | 6 | 0 | 1 | 6 | 0.0000 | 0.0000 | 0.0000 |
| 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 | 2 | 3 | 0 | 1 | 3 | 0.0000 | 0.0000 | 0.0000 |
| 501798_JKT_KESBANGPOL_JL-PEMUDA-C03_CCTV-01 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501734_JKS_DISHUB_JL-TAMAN-MARGASATWA-RAYA-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501840_JKS_DISHUB_JL-PROF-DR-SATRIO-C02_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| noncctv_sep | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 | 6 | 26 | 1 | 5 | 25 | 0.1667 | 0.0385 | 0.0625 |
| 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 | 2 | 9 | 2 | 1 | 7 | 0.6667 | 0.2222 | 0.3333 |
| 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 | 4 | 9 | 3 | 2 | 6 | 0.6000 | 0.3333 | 0.4286 |
| 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 | 9 | 20 | 7 | 2 | 13 | 0.7778 | 0.3500 | 0.4828 |
| 501829_JKS_DISHUB_STASIUN-PASAR-MINGGU-C01_CCTV-01 | 1 | 4 | 2 | 2 | 2 | 0.5000 | 0.5000 | 0.5000 |
| 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 | 1 | 2 | 1 | 0 | 1 | 1.0000 | 0.5000 | 0.6667 |
