# PATRA ONNX Evaluation Report (`valid` split)

- **Dataset split**: `valid` (61 gambar, 17 kamera unik, 139 objek GT PKL)
- **Matching IoU**: `0.50` | **Operating Conf (Phase 3/4)**: `0.25`

## 1. Ringkasan Perbandingan Model

| Model | Size (MB) | ImgSz | mAP@50 | mAP@50-95 | Best F1 (@Conf) | Prec@Op | Rec@Op | F1@Op | Latency (ms) | FPS |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| `patra_orig` | 9.85 | 640 | **0.3092** | **0.1368** | 0.4299 (@0.15) | 0.6724 | 0.2806 | 0.3959 | 31.9 | 31.4 |
| `ft_expB_640_freeze_loc` | 9.85 | 640 | **0.3446** | **0.1391** | 0.4402 (@0.30) | 0.5663 | 0.3381 | 0.4234 | 30.4 | 32.9 |

---
## Model: `patra_orig` (`AI-Patra\model\best_patra_highangle.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `31.90 ms` (p95 `34.93 ms`, `31.4 FPS`) | E2E: `42.88 ms` (`23.3 FPS`)
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
## Model: `ft_expB_640_freeze_loc` (`AI-Patra\model\ft_expB_640_freeze_loc.onnx`)

- Input: `[1, 3, 640, 640]` | Output: `[1, 5, 8400]` | Provider: `['CPUExecutionProvider']`
- Inference Latency: mean `30.39 ms` (p95 `32.45 ms`, `32.9 FPS`) | E2E: `40.45 ms` (`24.7 FPS`)
- **True mAP@50**: `0.3446` | **True mAP@50-95**: `0.1391`

### Phase 2 — Confidence Threshold Sweep (IoU=0.50)

| Conf | TP | FP | FN | Precision | Recall | F1 | Avg TP IoU |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.10 | 52 | 77 | 87 | 0.4031 | 0.3741 | 0.3881 | 0.6977 |
| 0.15 | 49 | 57 | 90 | 0.4623 | 0.3525 | 0.4000 | 0.7001 |
| 0.20 | 48 | 44 | 91 | 0.5217 | 0.3453 | 0.4156 | 0.7031 |
| 0.25 | 47 | 36 | 92 | 0.5663 | 0.3381 | 0.4234 | 0.7064 |
| 0.30 | 46 | 24 | 93 | 0.6571 | 0.3309 | 0.4402 | 0.7094 |
| 0.35 | 43 | 22 | 96 | 0.6615 | 0.3094 | 0.4216 | 0.7110 |
| 0.40 | 36 | 20 | 103 | 0.6429 | 0.2590 | 0.3692 | 0.7167 |
| 0.45 | 34 | 16 | 105 | 0.6800 | 0.2446 | 0.3598 | 0.7206 |
| 0.50 | 31 | 13 | 108 | 0.7045 | 0.2230 | 0.3388 | 0.7268 |
| 0.60 | 27 | 5 | 112 | 0.8438 | 0.1942 | 0.3158 | 0.7319 |

### Phase 2/4 — Confusion Analysis (@conf=0.25)

| Sub-kelas GT | GT | TP | FN | Recall | Avg IoU |
|---|---:|---:|---:|---:|---:|
| Emperan | 7 | 1 | 6 | 0.1429 | 0.5410 |
| Gerobak | 57 | 11 | 46 | 0.1930 | 0.6832 |
| Panggul | 1 | 0 | 1 | 0.0000 | 0.0000 |
| Payung | 35 | 19 | 16 | 0.5429 | 0.7594 |
| Sepeda-motor | 2 | 0 | 2 | 0.0000 | 0.0000 |
| Terpal | 37 | 16 | 21 | 0.4324 | 0.6698 |

- **False Positive Breakdown**: {"background_fp": 25, "localization_error": 11}
- **Background-only images (0 GT)**: 3 gambar -> `1` FP

### Phase 3 — Visual Distance / Object Size Evaluation (@conf=0.25)

| Ukuran Objek (Jarak Visual) | GT | TP | FP | FN | Precision | Recall | F1 | Avg IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Near (>=4%) | 11 | 6 | 6 | 5 | 0.5000 | 0.5455 | 0.5217 | 0.8132 |
| Medium (1-4%) | 33 | 14 | 14 | 19 | 0.5000 | 0.4242 | 0.4590 | 0.7064 |
| Far (<1%) | 95 | 27 | 16 | 68 | 0.6279 | 0.2842 | 0.3913 | 0.6827 |
| Sub-slice Tiny (<0.25%) | 38 | 5 | - | 33 | - | 0.1316 | - | - |

### Phase 3 — Lighting Condition (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dusk / Overcast | 58 | 132 | 45 | 35 | 87 | 0.5625 | 0.3409 | 0.4245 |
| Night / Low-Light | 3 | 7 | 2 | 1 | 5 | 0.6667 | 0.2857 | 0.4000 |

### Phase 3 — Image Quality / Sharpness (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sharp / High Detail | 61 | 139 | 47 | 36 | 92 | 0.5663 | 0.3381 | 0.4234 |

### Phase 3 — Camera Angle / Perspective (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| High-Angle JPO/Overpass | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| High-Angle Street CCTV | 59 | 137 | 47 | 36 | 90 | 0.5663 | 0.3431 | 0.4273 |

### Phase 3 — Image Resolution (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 640x640 (Roboflow Stretch) | 61 | 139 | 47 | 36 | 92 | 0.5663 | 0.3381 | 0.4234 |

### Phase 3 — Per Camera Source (diurutkan Recall terendah) (@conf=0.25)

| Grup | Images | GT | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 501719_JKU_DISHUB_JL-PEGANGSAAN-DUA-C01_CCTV-01 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501803_JKT_KESBANGPOL_TMII-C03_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501819_JKU_DISHUB_JL-TAMAN-STASIUN-C01_CCTV-02 | 2 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501860_JKS_DISHUB_JL-PANGERAN-ANTASARI-C01_CCTV-04 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501870_JKS_DISHUB_JPO-BUNG-KARNO-C01_CCTV-02 | 1 | 2 | 0 | 0 | 2 | 0.0000 | 0.0000 | 0.0000 |
| 501808_JKU_BPBD_JL-PLUIT-SELATAN-RAYA-C02_CCTV-02 | 1 | 1 | 0 | 1 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501812_JKT_DISHUB_JL-I-GUSTI-NGURAH-RAI-C02_CCTV-02 | 1 | 1 | 0 | 0 | 1 | 0.0000 | 0.0000 | 0.0000 |
| 501871_JKS_DISHUB_JPO-POLDA-METRO-JAYA-C01_CCTV-02 | 1 | 0 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.0000 |
| 501732_JKS_DISHUB_JL-PROF-DR-SATRIO-C01_CCTV-03 | 6 | 13 | 2 | 7 | 11 | 0.2222 | 0.1538 | 0.1818 |
| 501714_JKU_DISHUB_JL-DANAU-SUNTER-SELATAN-C01_CCTV-02 | 6 | 14 | 3 | 2 | 11 | 0.6000 | 0.2143 | 0.3158 |
| 501850_JKU_DISHUB_JL-PADEMANGAN-VIII-C01_CCTV-02 | 13 | 26 | 9 | 16 | 17 | 0.3600 | 0.3462 | 0.3529 |
| 501823_JKU_DISHUB_JL-TAMAN-STASIUN-C02_CCTV-01 | 9 | 41 | 15 | 5 | 26 | 0.7500 | 0.3659 | 0.4918 |
| 501716_JKU_DISHUB_JL-KRAMAT-JAYA-RAYA-C01_CCTV-01 | 5 | 11 | 5 | 1 | 6 | 0.8333 | 0.4545 | 0.5882 |
| 501821_JKT_DISHUB_JL-ALVARO-C01_CCTV-02 | 3 | 6 | 3 | 0 | 3 | 1.0000 | 0.5000 | 0.6667 |
| 501868_JKT_DISHUB_JL-JEND-BASUKI-RACHMAT-C01_CCTV-03 | 7 | 13 | 7 | 1 | 6 | 0.8750 | 0.5385 | 0.6667 |
| 501813_JKS_DISHUB_STASIUN-DUREN-KALIBATA-C01_CCTV-01 | 1 | 1 | 1 | 2 | 0 | 0.3333 | 1.0000 | 0.5000 |
| 501815_JKS_DISHUB_JL-MOH-KAHFI-II-C02_CCTV-02 | 1 | 2 | 2 | 1 | 0 | 0.6667 | 1.0000 | 0.8000 |
