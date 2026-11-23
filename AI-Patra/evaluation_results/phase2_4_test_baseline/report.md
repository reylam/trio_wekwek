# PATRA ONNX Evaluation Report (`test` split)

- **Dataset split**: `test` (41 gambar, 15 kamera unik, 94 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.25`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `civision` | 9.79 | 640 | **0.0369** | **0.0191** | 0.0412 (@0.25) | 0.6667 | 0.0213 | 0.0412 | 29.9 | 33.4 |
| `patra_orig` | 9.85 | 640 | **0.2809** | **0.1294** | 0.3553 (@0.20) | 0.5000 | 0.2660 | 0.3472 | 30.2 | 33.1 |

---
## Model: `civision` (`AI-Patra\model\best_civision.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.93 ms` (p95 `32.25 ms`, `33.4 FPS`) | E2E: `43.55 ms` (`23.0 FPS`)
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
## Model: `patra_orig` (`AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `30.16 ms` (p95 `31.90 ms`, `33.1 FPS`) | E2E: `40.65 ms` (`24.6 FPS`)
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
