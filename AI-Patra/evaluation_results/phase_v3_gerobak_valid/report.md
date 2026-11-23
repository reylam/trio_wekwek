# PATRA ONNX Evaluation Report (`valid` split)

- **Dataset split**: `valid` (61 gambar, 17 kamera unik, 64 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.30`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `patra_orig` | 9.85 | 640 | **0.0331** | **0.0125** | 0.1439 (@0.15) | 0.0769 | 0.0625 | 0.0690 | 28.9 | 34.6 |
| `patra_v2_ft` | 9.85 | 640 | **0.0838** | **0.0358** | 0.2000 (@0.25) | 0.1754 | 0.1562 | 0.1653 | 29.0 | 34.5 |
| `patra_v3_ft` | 9.85 | 640 | **0.1257** | **0.0417** | 0.2151 (@0.15) | 0.3750 | 0.0938 | 0.1500 | 29.4 | 34.0 |
| `patra_v3_base` | 9.85 | 640 | **0.1462** | **0.0526** | 0.2381 (@0.10) | 0.3913 | 0.1406 | 0.2069 | 29.6 | 33.8 |

---
## Model: `patra_orig` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `28.88 ms` (p95 `30.42 ms`, `34.6 FPS`) | E2E: `39.33 ms` (`25.4 FPS`)
- **True mAP@50**: `0.0331` | **True mAP@50-95**: `0.0125`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 10 | 81 | 54 | 0.1099 | 0.1562 | 0.1290 | 0.6970 |
| 0.15 | 10 | 65 | 54 | 0.1333 | 0.1562 | 0.1439 | 0.6970 |
| 0.20 | 7 | 57 | 57 | 0.1094 | 0.1094 | 0.1094 | 0.6822 |
| 0.25 | 6 | 52 | 58 | 0.1034 | 0.0938 | 0.0984 | 0.6710 |
| 0.30 | 4 | 48 | 60 | 0.0769 | 0.0625 | 0.0690 | 0.7041 |
| 0.35 | 3 | 47 | 61 | 0.0600 | 0.0469 | 0.0526 | 0.7142 |
| 0.40 | 3 | 40 | 61 | 0.0698 | 0.0469 | 0.0561 | 0.7142 |
| 0.45 | 3 | 38 | 61 | 0.0732 | 0.0469 | 0.0571 | 0.7142 |
| 0.50 | 2 | 35 | 62 | 0.0541 | 0.0312 | 0.0396 | 0.7714 |
| 0.60 | 1 | 26 | 63 | 0.0370 | 0.0156 | 0.0220 | 0.8185 |

### Phase 2/4 — Confusion Analysis (@conf=0.30)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 0 | 7 | 0.0000 | 0.0000 |
| Gerobak | 57 | 4 | 53 | 0.0702 | 0.7041 |

- **False Positive Breakdown**: {"background_fp": 45, "localization_error": 3}
- **Background-only images (0 GT)**: 23 gambar -> `18` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.30)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 3 | 0 | 5 | 3 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Medium (1-4%) | 12 | 1 | 23 | 11 | 0.0417 | 0.0833 | 0.0556 | 0.6738 |
| Far (<1%) | 49 | 3 | 20 | 46 | 0.1304 | 0.0612 | 0.0833 | 0.7142 |
| Sub-slice Tiny (<0.25%) | 22 | 0 | - | 22 | - | 0.0000 | - | - |

### Phase 3 — Lighting Condition (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 59 | 3 | 47 | 56 | 0.0600 | 0.0508 | 0.0550 |
| Night / Low-Light | 3 | 5 | 1 | 1 | 4 | 0.5000 | 0.2000 | 0.2857 |

### Phase 3 — Image Quality / Sharpness (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 64 | 4 | 48 | 60 | 0.0769 | 0.0625 | 0.0690 |

### Phase 3 — Camera Angle / Perspective (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 63 | 4 | 48 | 59 | 0.0769 | 0.0635 | 0.0696 |

### Phase 3 — Image Resolution (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 64 | 4 | 48 | 60 | 0.0769 | 0.0625 | 0.0690 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 11 | 0 | 3 | 11 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 9 | 0 | 1 | 9 | 0.0000 | 0.0000 | 0.0000 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 5 | 0 | 19 | 5 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 4 | 0 | 5 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 4 | 0 | 6 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 19 | 1 | 11 | 18 | 0.0833 | 0.0526 | 0.0645 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 2 | 0 | 4 | 1.0000 | 0.3333 | 0.5000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 1 | 0 | 0.5000 | 1.0000 | 0.6667 |

---
## Model: `patra_v2_ft` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v2_curated_ft.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.02 ms` (p95 `30.26 ms`, `34.5 FPS`) | E2E: `41.54 ms` (`24.1 FPS`)
- **True mAP@50**: `0.0838` | **True mAP@50-95**: `0.0358`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 16 | 85 | 48 | 0.1584 | 0.2500 | 0.1939 | 0.7049 |
| 0.15 | 15 | 73 | 49 | 0.1705 | 0.2344 | 0.1974 | 0.7067 |
| 0.20 | 13 | 63 | 51 | 0.1711 | 0.2031 | 0.1857 | 0.7179 |
| 0.25 | 13 | 53 | 51 | 0.1970 | 0.2031 | 0.2000 | 0.7179 |
| 0.30 | 10 | 47 | 54 | 0.1754 | 0.1562 | 0.1653 | 0.7163 |
| 0.35 | 9 | 41 | 55 | 0.1800 | 0.1406 | 0.1579 | 0.7089 |
| 0.40 | 8 | 38 | 56 | 0.1739 | 0.1250 | 0.1455 | 0.7021 |
| 0.45 | 4 | 31 | 60 | 0.1143 | 0.0625 | 0.0808 | 0.6745 |
| 0.50 | 4 | 28 | 60 | 0.1250 | 0.0625 | 0.0833 | 0.6745 |
| 0.60 | 3 | 24 | 61 | 0.1111 | 0.0469 | 0.0659 | 0.7074 |

### Phase 2/4 — Confusion Analysis (@conf=0.30)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 1 | 6 | 0.1429 | 0.5791 |
| Gerobak | 57 | 9 | 48 | 0.1579 | 0.7315 |

- **False Positive Breakdown**: {"background_fp": 44, "localization_error": 3}
- **Background-only images (0 GT)**: 23 gambar -> `23` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.30)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 3 | 0 | 5 | 3 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Medium (1-4%) | 12 | 3 | 24 | 9 | 0.1111 | 0.2500 | 0.1538 | 0.6623 |
| Far (<1%) | 49 | 7 | 18 | 42 | 0.2800 | 0.1429 | 0.1892 | 0.7394 |
| Sub-slice Tiny (<0.25%) | 22 | 2 | - | 20 | - | 0.0909 | - | - |

### Phase 3 — Lighting Condition (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 59 | 8 | 46 | 51 | 0.1481 | 0.1356 | 0.1416 |
| Night / Low-Light | 3 | 5 | 2 | 1 | 3 | 0.6667 | 0.4000 | 0.5000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 64 | 10 | 47 | 54 | 0.1754 | 0.1562 | 0.1653 |

### Phase 3 — Camera Angle / Perspective (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 63 | 10 | 47 | 53 | 0.1754 | 0.1587 | 0.1667 |

### Phase 3 — Image Resolution (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 64 | 10 | 47 | 54 | 0.1754 | 0.1562 | 0.1653 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 11 | 0 | 3 | 11 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 9 | 0 | 1 | 9 | 0.0000 | 0.0000 | 0.0000 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 5 | 0 | 24 | 5 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 4 | 0 | 5 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 0 | 0 | 1 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 19 | 4 | 9 | 15 | 0.3077 | 0.2105 | 0.2500 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 4 | 1 | 3 | 3 | 0.2500 | 0.2500 | 0.2500 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 3 | 0 | 3 | 1.0000 | 0.5000 | 0.6667 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 1 | 1 | 1 | 0 | 0.5000 | 1.0000 | 0.6667 |

---
## Model: `patra_v3_ft` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v3_gerobak_ft.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.38 ms` (p95 `30.41 ms`, `34.0 FPS`) | E2E: `39.04 ms` (`25.6 FPS`)
- **True mAP@50**: `0.1257` | **True mAP@50-95**: `0.0417`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 11 | 29 | 53 | 0.2750 | 0.1719 | 0.2115 | 0.7039 |
| 0.15 | 10 | 19 | 54 | 0.3448 | 0.1562 | 0.2151 | 0.6922 |
| 0.20 | 9 | 17 | 55 | 0.3462 | 0.1406 | 0.2000 | 0.6845 |
| 0.25 | 6 | 13 | 58 | 0.3158 | 0.0938 | 0.1446 | 0.6843 |
| 0.30 | 6 | 10 | 58 | 0.3750 | 0.0938 | 0.1500 | 0.6843 |
| 0.35 | 6 | 8 | 58 | 0.4286 | 0.0938 | 0.1538 | 0.6843 |
| 0.40 | 5 | 8 | 59 | 0.3846 | 0.0781 | 0.1299 | 0.7153 |
| 0.45 | 3 | 5 | 61 | 0.3750 | 0.0469 | 0.0833 | 0.6885 |
| 0.50 | 3 | 4 | 61 | 0.4286 | 0.0469 | 0.0845 | 0.6885 |
| 0.60 | 1 | 2 | 63 | 0.3333 | 0.0156 | 0.0299 | 0.5945 |

### Phase 2/4 — Confusion Analysis (@conf=0.30)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 1 | 6 | 0.1429 | 0.5293 |
| Gerobak | 57 | 5 | 52 | 0.0877 | 0.7153 |

- **False Positive Breakdown**: {"background_fp": 9, "localization_error": 1}
- **Background-only images (0 GT)**: 23 gambar -> `6` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.30)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 3 | 0 | 0 | 3 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Medium (1-4%) | 12 | 2 | 4 | 10 | 0.3333 | 0.1667 | 0.2222 | 0.6106 |
| Far (<1%) | 49 | 4 | 6 | 45 | 0.4000 | 0.0816 | 0.1356 | 0.7212 |
| Sub-slice Tiny (<0.25%) | 22 | 0 | - | 22 | - | 0.0000 | - | - |

### Phase 3 — Lighting Condition (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 59 | 5 | 10 | 54 | 0.3333 | 0.0847 | 0.1351 |
| Night / Low-Light | 3 | 5 | 1 | 0 | 4 | 1.0000 | 0.2000 | 0.3333 |

### Phase 3 — Image Quality / Sharpness (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 64 | 6 | 10 | 58 | 0.3750 | 0.0938 | 0.1500 |

### Phase 3 — Camera Angle / Perspective (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 63 | 6 | 10 | 57 | 0.3750 | 0.0952 | 0.1519 |

### Phase 3 — Image Resolution (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 64 | 6 | 10 | 58 | 0.3750 | 0.0938 | 0.1500 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 11 | 0 | 1 | 11 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 9 | 0 | 0 | 9 | 0.0000 | 0.0000 | 0.0000 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 5 | 0 | 7 | 5 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 4 | 0 | 0 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 19 | 3 | 2 | 16 | 0.6000 | 0.1579 | 0.2500 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 1 | 0 | 5 | 1.0000 | 0.1667 | 0.2857 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 4 | 1 | 0 | 3 | 1.0000 | 0.2500 | 0.4000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |

---
## Model: `patra_v3_base` (`C:\Users\rey\Downloads\Competition\stack_2026_mpruy\AI-Patra\model\patra_v3_gerobak_base.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `29.56 ms` (p95 `30.79 ms`, `33.8 FPS`) | E2E: `39.92 ms` (`25.1 FPS`)
- **True mAP@50**: `0.1462` | **True mAP@50-95**: `0.0526`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 15 | 47 | 49 | 0.2419 | 0.2344 | 0.2381 | 0.6895 |
| 0.15 | 12 | 31 | 52 | 0.2791 | 0.1875 | 0.2243 | 0.6976 |
| 0.20 | 11 | 25 | 53 | 0.3056 | 0.1719 | 0.2200 | 0.7040 |
| 0.25 | 9 | 20 | 55 | 0.3103 | 0.1406 | 0.1935 | 0.7222 |
| 0.30 | 9 | 14 | 55 | 0.3913 | 0.1406 | 0.2069 | 0.7222 |
| 0.35 | 8 | 12 | 56 | 0.4000 | 0.1250 | 0.1905 | 0.7134 |
| 0.40 | 6 | 10 | 58 | 0.3750 | 0.0938 | 0.1500 | 0.7298 |
| 0.45 | 5 | 7 | 59 | 0.4167 | 0.0781 | 0.1316 | 0.6971 |
| 0.50 | 5 | 4 | 59 | 0.5556 | 0.0781 | 0.1370 | 0.6971 |
| 0.60 | 2 | 1 | 62 | 0.6667 | 0.0312 | 0.0597 | 0.7116 |

### Phase 2/4 — Confusion Analysis (@conf=0.30)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 0 | 7 | 0.0000 | 0.0000 |
| Gerobak | 57 | 9 | 48 | 0.1579 | 0.7222 |

- **False Positive Breakdown**: {"background_fp": 11, "localization_error": 3}
- **Background-only images (0 GT)**: 23 gambar -> `9` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.30)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 3 | 0 | 2 | 3 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Medium (1-4%) | 12 | 4 | 6 | 8 | 0.4000 | 0.3333 | 0.3636 | 0.8114 |
| Far (<1%) | 49 | 5 | 6 | 44 | 0.4545 | 0.1020 | 0.1667 | 0.6509 |
| Sub-slice Tiny (<0.25%) | 22 | 1 | - | 21 | - | 0.0455 | - | - |

### Phase 3 — Lighting Condition (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 59 | 8 | 14 | 51 | 0.3636 | 0.1356 | 0.1975 |
| Night / Low-Light | 3 | 5 | 1 | 0 | 4 | 1.0000 | 0.2000 | 0.3333 |

### Phase 3 — Image Quality / Sharpness (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 64 | 9 | 14 | 55 | 0.3913 | 0.1406 | 0.2069 |

### Phase 3 — Camera Angle / Perspective (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 63 | 9 | 14 | 54 | 0.3913 | 0.1429 | 0.2093 |

### Phase 3 — Image Resolution (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 64 | 9 | 14 | 55 | 0.3913 | 0.1406 | 0.2069 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.30)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 11 | 0 | 1 | 11 | 0.0000 | 0.0000 | 0.0000 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 4 | 0 | 0 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 4 | 0 | 3 | 4 | 0.0000 | 0.0000 | 0.0000 |
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 1 | 0 | 5 | 1.0000 | 0.1667 | 0.2857 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 5 | 1 | 8 | 4 | 0.1111 | 0.2000 | 0.1429 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 19 | 4 | 1 | 15 | 0.8000 | 0.2105 | 0.3333 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 9 | 2 | 1 | 7 | 0.6667 | 0.2222 | 0.3333 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 1 | 1 | 0 | 0 | 1.0000 | 1.0000 | 1.0000 |
