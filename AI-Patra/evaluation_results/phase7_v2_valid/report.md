# PATRA ONNX Evaluation Report (`valid` split)

- **Dataset split**: `valid` (61 gambar, 17 kamera unik, 139 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.25`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `patra_orig` | 9.85 | 640 | **0.3092** | **0.1368** | 0.4299 (@0.15) | 0.6724 | 0.2806 | 0.3959 | 30.0 | 33.4 |
| `patra_v2_ft` | 9.85 | 640 | **0.3167** | **0.1410** | 0.4083 (@0.10) | 0.6212 | 0.2950 | 0.4000 | 29.4 | 34.0 |
| `patra_v2_base` | 9.85 | 640 | **0.3391** | **0.1465** | 0.4147 (@0.10) | 0.7021 | 0.2374 | 0.3548 | 29.8 | 33.5 |

---
## Model: `patra_orig` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.99 ms` (p95 `33.01 ms`, `33.4 FPS`) | E2E: `39.24 ms` (`25.5 FPS`)
- **True mAP@50**: `0.3092` | **True mAP@50-95**: `0.1368`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 47 | 44 | 92 | 0.5165 | 0.3381 | 0.4087 | 0.7262 |
| 0.15 | 46 | 29 | 93 | 0.6133 | 0.3309 | 0.4299 | 0.7267 |
| 0.20 | 43 | 21 | 96 | 0.6719 | 0.3094 | 0.4236 | 0.7264 |
| 0.25 | 39 | 19 | 100 | 0.6724 | 0.2806 | 0.3959 | 0.7302 |
| 0.30 | 37 | 15 | 102 | 0.7115 | 0.2662 | 0.3874 | 0.7370 |
| 0.35 | 36 | 14 | 103 | 0.7200 | 0.2590 | 0.3810 | 0.7388 |
| 0.40 | 31 | 12 | 108 | 0.7209 | 0.2230 | 0.3407 | 0.7539 |
| 0.45 | 30 | 11 | 109 | 0.7317 | 0.2158 | 0.3333 | 0.7583 |
| 0.50 | 27 | 10 | 112 | 0.7297 | 0.1942 | 0.3068 | 0.7626 |
| 0.60 | 21 | 6 | 118 | 0.7778 | 0.1511 | 0.2530 | 0.7752 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 1 | 6 | 0.1429 | 0.5793 |
| Gerobak | 57 | 5 | 52 | 0.0877 | 0.6893 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 35 | 18 | 17 | 0.5143 | 0.7794 |
| Sepeda-motor | 2 | 0 | 2 | 0.0000 | 0.0000 |
| Terpal | 37 | 15 | 22 | 0.4054 | 0.6949 |

- **False Positive Breakdown**: {"background_fp": 12, "localization_error": 7}
- **Background-only images (0 GT)**: 3 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 11 | 6 | 0 | 5 | 1.0000 | 0.5455 | 0.7059 | 0.8046 |
| Medium (1-4%) | 33 | 13 | 10 | 20 | 0.5652 | 0.3939 | 0.4643 | 0.7200 |
| Far (<1%) | 95 | 20 | 9 | 75 | 0.6897 | 0.2105 | 0.3226 | 0.7146 |
| Sub-slice Tiny (<0.25%) | 38 | 3 | - | 35 | - | 0.0789 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 132 | 38 | 18 | 94 | 0.6786 | 0.2879 | 0.4043 |
| Night / Low-Light | 3 | 7 | 1 | 1 | 6 | 0.5000 | 0.1429 | 0.2222 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 139 | 39 | 19 | 100 | 0.6724 | 0.2806 | 0.3959 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 137 | 39 | 19 | 98 | 0.6724 | 0.2847 | 0.4000 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 139 | 39 | 19 | 100 | 0.6724 | 0.2806 | 0.3959 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 13 | 1 | 1 | 12 | 0.5000 | 0.0769 | 0.1333 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 14 | 3 | 0 | 11 | 1.0000 | 0.2143 | 0.3529 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 41 | 11 | 2 | 30 | 0.8462 | 0.2683 | 0.4074 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 2 | 0 | 4 | 1.0000 | 0.3333 | 0.5000 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 26 | 9 | 11 | 17 | 0.4500 | 0.3462 | 0.3913 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 13 | 5 | 2 | 8 | 0.7143 | 0.3846 | 0.5000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 11 | 5 | 0 | 6 | 1.0000 | 0.4545 | 0.6250 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 2 | 1 | 0 | 1 | 1.0000 | 0.5000 | 0.6667 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 2 | 1 | 0 | 1 | 1.0000 | 0.5000 | 0.6667 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 3 | 0 | 0.2500 | 1.0000 | 0.4000 |

---
## Model: `patra_v2_ft` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v2_curated_ft.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.42 ms` (p95 `31.44 ms`, `34.0 FPS`) | E2E: `39.47 ms` (`25.3 FPS`)
- **True mAP@50**: `0.3167` | **True mAP@50-95**: `0.1410`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 49 | 52 | 90 | 0.4851 | 0.3525 | 0.4083 | 0.7380 |
| 0.15 | 46 | 42 | 93 | 0.5227 | 0.3309 | 0.4053 | 0.7430 |
| 0.20 | 42 | 34 | 97 | 0.5526 | 0.3022 | 0.3907 | 0.7518 |
| 0.25 | 41 | 25 | 98 | 0.6212 | 0.2950 | 0.4000 | 0.7554 |
| 0.30 | 37 | 20 | 102 | 0.6491 | 0.2662 | 0.3776 | 0.7610 |
| 0.35 | 34 | 16 | 105 | 0.6800 | 0.2446 | 0.3598 | 0.7647 |
| 0.40 | 31 | 15 | 108 | 0.6739 | 0.2230 | 0.3351 | 0.7755 |
| 0.45 | 25 | 10 | 114 | 0.7143 | 0.1799 | 0.2874 | 0.7868 |
| 0.50 | 25 | 7 | 114 | 0.7812 | 0.1799 | 0.2924 | 0.7868 |
| 0.60 | 20 | 7 | 119 | 0.7407 | 0.1439 | 0.2410 | 0.8067 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 1 | 6 | 0.1429 | 0.5791 |
| Gerobak | 57 | 12 | 45 | 0.2105 | 0.7295 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 35 | 12 | 23 | 0.3429 | 0.8176 |
| Sepeda-motor | 2 | 0 | 2 | 0.0000 | 0.0000 |
| Terpal | 37 | 16 | 21 | 0.4324 | 0.7393 |

- **False Positive Breakdown**: {"background_fp": 16, "localization_error": 9}
- **Background-only images (0 GT)**: 3 gambar -> `1` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 11 | 5 | 0 | 6 | 1.0000 | 0.4545 | 0.6250 | 0.8728 |
| Medium (1-4%) | 33 | 16 | 11 | 17 | 0.5926 | 0.4848 | 0.5333 | 0.7558 |
| Far (<1%) | 95 | 20 | 14 | 75 | 0.5882 | 0.2105 | 0.3101 | 0.7258 |
| Sub-slice Tiny (<0.25%) | 38 | 5 | - | 33 | - | 0.1316 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 132 | 38 | 25 | 94 | 0.6032 | 0.2879 | 0.3897 |
| Night / Low-Light | 3 | 7 | 3 | 0 | 4 | 1.0000 | 0.4286 | 0.6000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 139 | 41 | 25 | 98 | 0.6212 | 0.2950 | 0.4000 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 137 | 41 | 25 | 96 | 0.6212 | 0.2993 | 0.4039 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 139 | 41 | 25 | 98 | 0.6212 | 0.2950 | 0.4000 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 2 | 0 | 1 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 13 | 1 | 0 | 12 | 1.0000 | 0.0769 | 0.1429 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 14 | 3 | 2 | 11 | 0.6000 | 0.2143 | 0.3158 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 41 | 11 | 3 | 30 | 0.7857 | 0.2683 | 0.4000 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 26 | 8 | 18 | 18 | 0.3077 | 0.3077 | 0.3077 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 13 | 5 | 1 | 8 | 0.8333 | 0.3846 | 0.5263 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 11 | 5 | 0 | 6 | 1.0000 | 0.4545 | 0.6250 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 5 | 0 | 1 | 1.0000 | 0.8333 | 0.9091 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 2 | 2 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |

---
## Model: `patra_v2_base` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v2_curated_base.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.81 ms` (p95 `31.60 ms`, `33.5 FPS`) | E2E: `39.06 ms` (`25.6 FPS`)
- **True mAP@50**: `0.3391` | **True mAP@50-95**: `0.1465`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 45 | 33 | 94 | 0.5769 | 0.3237 | 0.4147 | 0.7319 |
| 0.15 | 39 | 22 | 100 | 0.6393 | 0.2806 | 0.3900 | 0.7421 |
| 0.20 | 35 | 17 | 104 | 0.6731 | 0.2518 | 0.3665 | 0.7432 |
| 0.25 | 33 | 14 | 106 | 0.7021 | 0.2374 | 0.3548 | 0.7521 |
| 0.30 | 32 | 12 | 107 | 0.7273 | 0.2302 | 0.3497 | 0.7494 |
| 0.35 | 27 | 12 | 112 | 0.6923 | 0.1942 | 0.3034 | 0.7540 |
| 0.40 | 25 | 7 | 114 | 0.7812 | 0.1799 | 0.2924 | 0.7521 |
| 0.45 | 22 | 5 | 117 | 0.8148 | 0.1583 | 0.2651 | 0.7377 |
| 0.50 | 18 | 2 | 121 | 0.9000 | 0.1295 | 0.2264 | 0.7419 |
| 0.60 | 11 | 0 | 128 | 1.0000 | 0.0791 | 0.1467 | 0.7844 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 0 | 7 | 0.0000 | 0.0000 |
| Gerobak | 57 | 7 | 50 | 0.1228 | 0.6992 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 35 | 15 | 20 | 0.4286 | 0.7717 |
| Sepeda-motor | 2 | 0 | 2 | 0.0000 | 0.0000 |
| Terpal | 37 | 11 | 26 | 0.2973 | 0.7590 |

- **False Positive Breakdown**: {"localization_error": 9, "background_fp": 5}
- **Background-only images (0 GT)**: 3 gambar -> `0` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 11 | 6 | 1 | 5 | 0.8571 | 0.5455 | 0.6667 | 0.7842 |
| Medium (1-4%) | 33 | 13 | 11 | 20 | 0.5417 | 0.3939 | 0.4561 | 0.7612 |
| Far (<1%) | 95 | 14 | 2 | 81 | 0.8750 | 0.1474 | 0.2523 | 0.7299 |
| Sub-slice Tiny (<0.25%) | 38 | 1 | - | 37 | - | 0.0263 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 132 | 33 | 14 | 99 | 0.7021 | 0.2500 | 0.3687 |
| Night / Low-Light | 3 | 7 | 0 | 0 | 7 | 0.0000 | 0.0000 | 0.0000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 139 | 33 | 14 | 106 | 0.7021 | 0.2374 | 0.3548 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 137 | 33 | 14 | 104 | 0.7021 | 0.2409 | 0.3587 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 139 | 33 | 14 | 106 | 0.7021 | 0.2374 | 0.3548 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 13 | 0 | 0 | 13 | 0.0000 | 0.0000 | 0.0000 |
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 13 | 1 | 1 | 12 | 0.5000 | 0.0769 | 0.1333 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 1 | 0 | 5 | 1.0000 | 0.1667 | 0.2857 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 14 | 3 | 0 | 11 | 1.0000 | 0.2143 | 0.3529 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 41 | 11 | 1 | 30 | 0.9167 | 0.2683 | 0.4151 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 26 | 9 | 10 | 17 | 0.4737 | 0.3462 | 0.4000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 11 | 5 | 2 | 6 | 0.7143 | 0.4545 | 0.5556 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 2 | 1 | 0 | 1 | 1.0000 | 0.5000 | 0.6667 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
