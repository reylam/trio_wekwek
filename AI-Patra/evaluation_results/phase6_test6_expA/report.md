# PATRA ONNX Evaluation Report (`test` split)

- **Dataset split**: `test` (41 gambar, 15 kamera unik, 94 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.25`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `civision` | 9.79 | 640 | **0.0369** | **0.0191** | 0.0412 (@0.25) | 0.6667 | 0.0213 | 0.0412 | 29.0 | 34.5 |
| `patra_orig` | 9.85 | 640 | **0.2809** | **0.1294** | 0.3553 (@0.20) | 0.5000 | 0.2660 | 0.3472 | 29.4 | 34.0 |
| `patra_ft_expA` | 9.85 | 640 | **0.2392** | **0.0991** | 0.2973 (@0.15) | 0.5588 | 0.2021 | 0.2969 | 29.6 | 33.8 |

---
## Model: `civision` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_civision.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `28.97 ms` (p95 `30.96 ms`, `34.5 FPS`) | E2E: `41.34 ms` (`24.2 FPS`)
- **True mAP@50**: `0.0369` | **True mAP@50-95**: `0.0191`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 2 | 8 | 92 | 0.2000 | 0.0213 | 0.0385 | 0.7774 |
| 0.15 | 2 | 5 | 92 | 0.2857 | 0.0213 | 0.0396 | 0.7774 |
| 0.20 | 2 | 4 | 92 | 0.3333 | 0.0213 | 0.0400 | 0.7774 |
| 0.25 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 | 0.7774 |
| 0.30 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 | 0.7774 |
| 0.35 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 | 0.7774 |
| 0.40 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 | 0.7774 |
| 0.45 | 1 | 1 | 93 | 0.5000 | 0.0106 | 0.0208 | 0.7011 |
| 0.50 | 1 | 1 | 93 | 0.5000 | 0.0106 | 0.0208 | 0.7011 |
| 0.60 | 1 | 0 | 93 | 1.0000 | 0.0106 | 0.0211 | 0.7011 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 5 | 0 | 5 | 0.0000 | 0.0000 |
| Gerobak | 39 | 1 | 38 | 0.0256 | 0.7011 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 24 | 0 | 24 | 0.0000 | 0.0000 |
| Sepeda-motor | 1 | 1 | 0 | 1.0000 | 0.8537 |
| Terpal | 24 | 0 | 24 | 0.0000 | 0.0000 |

- **False Positive Breakdown**: {"background_fp": 1}
- **Background-only images (0 GT)**: 2 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 20 | 2 | 1 | 18 | 0.6667 | 0.1000 | 0.1739 | 0.7774 |
| Medium (1-4%) | 32 | 0 | 0 | 32 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Far (<1%) | 42 | 0 | 0 | 42 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Sub-slice Tiny (<0.25%) | 18 | 0 | - | 18 | - | 0.0000 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Day / Bright | 2 | 8 | 1 | 0 | 7 | 1.0000 | 0.1250 | 0.2222 |
| Dusk / Overcast | 34 | 80 | 1 | 1 | 79 | 0.5000 | 0.0125 | 0.0244 |
| Night / Low-Light | 5 | 6 | 0 | 0 | 6 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 41 | 94 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 17 | 35 | 0 | 1 | 35 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 23 | 58 | 1 | 0 | 57 | 1.0000 | 0.0172 | 0.0339 |
| Non-CCTV / Mixed | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 41 | 94 | 2 | 1 | 92 | 0.6667 | 0.0213 | 0.0412 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 | 6 | 26 | 0 | 0 | 26 | 0.0000 | 0.0000 | 0.0000 |
| 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 | 9 | 20 | 0 | 1 | 20 | 0.0000 | 0.0000 | 0.0000 |
| 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 | 2 | 9 | 0 | 0 | 9 | 0.0000 | 0.0000 | 0.0000 |
| 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 | 4 | 9 | 0 | 0 | 9 | 0.0000 | 0.0000 | 0.0000 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-01 | 6 | 7 | 0 | 0 | 7 | 0.0000 | 0.0000 | 0.0000 |
| 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 | 4 | 6 | 0 | 0 | 6 | 0.0000 | 0.0000 | 0.0000 |
| 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 | 2 | 3 | 0 | 0 | 3 | 0.0000 | 0.0000 | 0.0000 |
| 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501798_JKT_KESBANGPOL_JL-PEMUDA-C03_CCTV-01 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501734_JKS_DISHUB_JL-TAMAN-MARGASATWA-RAYA-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501840_JKS_DISHUB_JL-PROF-DR-SATRIO-C02_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501829_JKS_DISHUB_STASIUN-PASAR-MINGGU-C01_CCTV-01 | 1 | 4 | 1 | 0 | 3 | 1.0000 | 0.2500 | 0.4000 |
| noncctv_sep | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |

---
## Model: `patra_orig` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.41 ms` (p95 `30.23 ms`, `34.0 FPS`) | E2E: `41.92 ms` (`23.9 FPS`)
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
## Model: `patra_ft_expA` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\ft_expA_640_lowlr.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.57 ms` (p95 `30.72 ms`, `33.8 FPS`) | E2E: `44.23 ms` (`22.6 FPS`)
- **True mAP@50**: `0.2392` | **True mAP@50-95**: `0.0991`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 24 | 44 | 70 | 0.3529 | 0.2553 | 0.2963 | 0.7089 |
| 0.15 | 22 | 32 | 72 | 0.4074 | 0.2340 | 0.2973 | 0.7123 |
| 0.20 | 20 | 23 | 74 | 0.4651 | 0.2128 | 0.2920 | 0.7096 |
| 0.25 | 19 | 15 | 75 | 0.5588 | 0.2021 | 0.2969 | 0.7164 |
| 0.30 | 15 | 13 | 79 | 0.5357 | 0.1596 | 0.2459 | 0.7416 |
| 0.35 | 14 | 11 | 80 | 0.5600 | 0.1489 | 0.2353 | 0.7452 |
| 0.40 | 14 | 8 | 80 | 0.6364 | 0.1489 | 0.2414 | 0.7452 |
| 0.45 | 12 | 6 | 82 | 0.6667 | 0.1277 | 0.2143 | 0.7614 |
| 0.50 | 11 | 1 | 83 | 0.9167 | 0.1170 | 0.2075 | 0.7781 |
| 0.60 | 7 | 0 | 87 | 1.0000 | 0.0745 | 0.1386 | 0.7630 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 5 | 1 | 4 | 0.2000 | 0.7509 |
| Gerobak | 39 | 4 | 35 | 0.1026 | 0.6714 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 24 | 12 | 12 | 0.5000 | 0.7568 |
| Sepeda-motor | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Terpal | 24 | 2 | 22 | 0.0833 | 0.5463 |

- **False Positive Breakdown**: {"localization_error": 5, "background_fp": 10}
- **Background-only images (0 GT)**: 2 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 20 | 3 | 3 | 17 | 0.5000 | 0.1500 | 0.2308 | 0.5945 |
| Medium (1-4%) | 32 | 7 | 1 | 25 | 0.8750 | 0.2188 | 0.3500 | 0.7902 |
| Far (<1%) | 42 | 9 | 11 | 33 | 0.4500 | 0.2143 | 0.2903 | 0.6996 |
| Sub-slice Tiny (<0.25%) | 18 | 2 | - | 16 | - | 0.1111 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Day / Bright | 2 | 8 | 0 | 0 | 8 | 0.0000 | 0.0000 | 0.0000 |
| Dusk / Overcast | 34 | 80 | 17 | 14 | 63 | 0.5484 | 0.2125 | 0.3063 |
| Night / Low-Light | 5 | 6 | 2 | 1 | 4 | 0.6667 | 0.3333 | 0.4444 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 41 | 94 | 19 | 15 | 75 | 0.5588 | 0.2021 | 0.2969 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 17 | 35 | 8 | 6 | 27 | 0.5714 | 0.2286 | 0.3265 |
| High-Angle Street CCTV | 23 | 58 | 11 | 9 | 47 | 0.5500 | 0.1897 | 0.2821 |
| Non-CCTV / Mixed | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 41 | 94 | 19 | 15 | 75 | 0.5588 | 0.2021 | 0.2969 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-01 | 6 | 7 | 0 | 0 | 7 | 0.0000 | 0.0000 | 0.0000 |
| 501877_JKU_DISHUB_JPO-PULO-MAS-C01_CCTV-04 | 4 | 6 | 0 | 2 | 6 | 0.0000 | 0.0000 | 0.0000 |
| 501798_JKT_KESBANGPOL_JL-PEMUDA-C03_CCTV-01 | 1 | 2 | 0 | 1 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501734_JKS_DISHUB_JL-TAMAN-MARGASATWA-RAYA-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| noncctv_sep | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-02 | 6 | 26 | 2 | 3 | 24 | 0.4000 | 0.0769 | 0.1290 |
| 501920_JKT_DISHUB_JPO-JATINEGARA-C01_CCTV-01 | 9 | 20 | 5 | 1 | 15 | 0.8333 | 0.2500 | 0.3846 |
| 501806_JKS_KESBANGPOL_JL-PENGADEGAN-TIMUR-C01_CCTV-02 | 2 | 9 | 3 | 1 | 6 | 0.7500 | 0.3333 | 0.4615 |
| 501916_JKT_DISHUB_JPO-MATRAMAN-C01_CCTV-03 | 4 | 9 | 3 | 3 | 6 | 0.5000 | 0.3333 | 0.4000 |
| 501789_JKT_BPBD_JL-JATINEGARA-BARAT-C02_CCTV-02 | 2 | 3 | 1 | 0 | 2 | 1.0000 | 0.3333 | 0.5000 |
| 501829_JKS_DISHUB_STASIUN-PASAR-MINGGU-C01_CCTV-01 | 1 | 4 | 2 | 0 | 2 | 1.0000 | 0.5000 | 0.6667 |
| 501741_JKS_BPBD_JL-KP-DALAM-C01_CCTV-01 | 1 | 2 | 1 | 1 | 1 | 0.5000 | 0.5000 | 0.5000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-02 | 1 | 2 | 1 | 3 | 1 | 0.2500 | 0.5000 | 0.3333 |
| 501840_JKS_DISHUB_JL-PROF-DR-SATRIO-C02_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
