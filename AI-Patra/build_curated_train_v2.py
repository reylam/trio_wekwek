"""
PETRA / PATRA — Build Curated Training Split `dataset_v2` (Reversible, Zero Deletion).

Mempertahankan `AI-Patra/dataset/` (train/valid/test) 100% UTUH, lalu membangun
`AI-Patra/dataset_v2/train/` + `data_v2.yaml` (yang menunjuk langsung ke `dataset/valid`
dan `dataset/test` yang tidak tersentuh) dengan 3 perbaikan berbasis bukti audit visual:

1. Hapus outlier non-CCTV & skala perusak (`TR#26, TR#27` Panggul 22% & 93% layar;
   12 foto web/berita `idcctv2..4, 7..13, 15, 17` yang menggeser skala Far/Tiny),
   sambil MEMPERTAHANKAN 7 gambar asli JakCCTV Diskominfotik (`idcctv22..28`).
2. Hapus 36 box terkonfirmasi bukan PKL dari audit visual `train_small_payung_part1..4.jpg`
   (pejalan kaki berpayung hujan, rambu STOP, pejalan kaki tanpa lapak).
3. Tambahkan 35 frame CCTV live terverifikasi 0-PKL dari `dataset/staging_harvest/`
   (10 hard-negative active-learning FP mobil/motor/traffic + 25 traffic bersih Jakarta/Bandung/Semarang).

Penggunaan:
  python AI-Patra/build_curated_train_v2.py
"""

from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from prepare_dataset import CLASS_NAMES, DATASET_DIR, IMG_EXTS, extract_camera_group  # noqa: E402

AUDIT_JSON = AI_ROOT / "evaluation_results" / "train_audit" / "train_audit_report.json"
HARVEST_MANIFEST = DATASET_DIR / "staging_harvest" / "manifest.json"
OUT_DATASET = AI_ROOT / "dataset_v2"

# 1. File di train/ yang dikeluarkan pada dataset_v2 (berdasarkan audit visual train_noncctv_and_large_gallery.jpg)
EXCLUDE_TRAIN_PREFIXES = (
    "Panggul_jpg.",     # TR#26: foto HP datar close-up (22.3% layar)
    "panggul_jpg.",     # TR#27: foto HP ekstrem close-up (93.3% layar -> pemicu giant-box FP)
    "idcctv2_raw",      # Foto web bukan JakCCTV
    "idcctv3_raw",      # Foto berita detikcom
    "idcctv4_raw",      # Foto jalan bukan Diskominfotik
    "idcctv7_raw",      # Foto kerumunan low-angle
    "idcctv8_raw",      # Foto malam box besar 7.2%
    "idcctv9_raw",      # Foto jalan bukan Diskominfotik
    "idcctv10_raw",     # Foto sudut rendah box 12.2%
    "idcctv11_raw",     # Foto sudut rendah halte
    "idcctv12_raw",     # Foto jembatan sudut berbeda
    "idcctv13_raw",     # Foto berita detikcom
    "idcctv15_raw",     # Foto web resolusi rendah 542x300
    "idcctv17_raw",     # Foto night-vision 6.6%
)

# 2. ID `PY#` dari train_small_payung_part1..4.jpg yang terkonfirmasi visual bukan PKL
#    (pejalan kaki memegang payung hujan di trotoar/zebra cross/motor & rambu STOP)
REMOVE_PY_IDS = {
    1, 2, 3,                         # JL-PLUMPANG-SEMPER: pejalan kaki berpayung hujan
    8,                               # JL-RAYA-CASABLANCA: pemotor berpayung hujan merah
    12, 13,                          # JL-PENGADEGAN-TIMUR: pejalan kaki berpayung hujan
    14, 15, 16, 17,                  # JL-RAWAJATI-TIMUR: payung hujan & pejalan kaki samping rambu STOP
    18, 19, 20, 21, 22,              # JL-PLUIT-SELATAN: 5 pejalan kaki menyeberang berpayung hujan
    42, 43, 44, 45, 46, 47, 48, 49, 50,  # STASIUN-KALENDER: pejalan kaki hujan & orang baju putih
    71, 72, 75, 76, 77,              # JL-LEBAK-BULUS: pejalan kaki berpayung hujan
    79,                              # JL-PADEMANGAN-VIII: pejalan kaki berpayung hitam
    84, 85, 86, 87, 105,             # JPO-MATRAMAN-BARU: pejalan kaki berpayung di trotoar
    123,                             # JPO-PASAR-IKAN: pejalan kaki kecil 0.04%
}

# 3. Frame staging_harvest terverifikasi 0-PKL (visual check dari flagged_gallery.jpg & clean_gallery.jpg)
#    FL#02, FL#04, FL#13 SENGAJA DIKECUALIKAN karena berisi PKL nyata!
APPROVED_HARD_NEG_TAGS = {
    "FL#01", "FL#03", "FL#05", "FL#06", "FL#07",
    "FL#08", "FL#09", "FL#10", "FL#11", "FL#12",
}
#    CL#28 SENGAJA DIKECUALIKAN karena ada overlay kotak biru besar pada frame
APPROVED_CLEAN_NEG_TAGS = {
    f"CL#{i:02d}" for i in range(1, 28)
} | {"CL#29", "CL#30", "CL#31", "CL#32"}
MAX_CLEAN_NEG = 25


def should_exclude_train_file(stem: str) -> bool:
    return any(stem.startswith(pref) for pref in EXCLUDE_TRAIN_PREFIXES)


def main() -> int:
    if not AUDIT_JSON.exists():
        raise FileNotFoundError(f"Jalankan `audit_train_annotations.py` terlebih dahulu: {AUDIT_JSON}")
    if not HARVEST_MANIFEST.exists():
        raise FileNotFoundError(f"Jalankan `harvest_cctv_frames.py` terlebih dahulu: {HARVEST_MANIFEST}")

    with open(AUDIT_JSON, "r", encoding="utf-8") as f:
        train_audit = json.load(f)
    with open(HARVEST_MANIFEST, "r", encoding="utf-8") as f:
        harvest = json.load(f)

    # Peta stem -> set(line_idx) yang akan dihapus dari label
    drop_lines_by_stem: dict[str, set[int]] = {}
    for rec in train_audit["small_payung"]:
        if rec["py_id"] in REMOVE_PY_IDS:
            drop_lines_by_stem.setdefault(rec["stem"], set()).add(int(rec["line_idx"]))

    out_img_dir = OUT_DATASET / "train" / "images"
    out_lbl_dir = OUT_DATASET / "train" / "labels"
    if OUT_DATASET.exists():
        shutil.rmtree(OUT_DATASET)
    out_img_dir.mkdir(parents=True, exist_ok=True)
    out_lbl_dir.mkdir(parents=True, exist_ok=True)

    src_img_dir = DATASET_DIR / "train" / "images"
    src_lbl_dir = DATASET_DIR / "train" / "labels"

    excluded_images: list[str] = []
    cleaned_boxes_total = 0
    kept_train_images = 0
    kept_boxes_total = 0
    bg_from_orig = 0

    for img_path in sorted(p for p in src_img_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS):
        stem = img_path.stem
        if should_exclude_train_file(stem):
            excluded_images.append(img_path.name)
            continue

        shutil.copy2(img_path, out_img_dir / img_path.name)
        src_lbl = src_lbl_dir / f"{stem}.txt"
        drop_set = drop_lines_by_stem.get(stem, set())

        kept_lines: list[str] = []
        if src_lbl.exists():
            with open(src_lbl, "r", encoding="utf-8") as f:
                for idx, raw_ln in enumerate(f):
                    stripped = raw_ln.strip()
                    if not stripped:
                        continue
                    if idx in drop_set:
                        cleaned_boxes_total += 1
                        continue
                    kept_lines.append(stripped)

        with open(out_lbl_dir / f"{stem}.txt", "w", encoding="utf-8") as f:
            if kept_lines:
                f.write("\n".join(kept_lines) + "\n")
            else:
                bg_from_orig += 1

        kept_train_images += 1
        kept_boxes_total += len(kept_lines)

    # Tambahkan hard-negatives terverifikasi dari staging_harvest (0-label .txt)
    added_hard_neg: list[str] = []
    added_clean_neg: list[str] = []
    staging_root = DATASET_DIR / "staging_harvest"

    for item in harvest.get("items", []):
        tag = item["tag"]
        bucket = item["bucket"]
        fname = item["filename"]
        src_file = staging_root / bucket / fname
        if not src_file.exists():
            continue

        if tag in APPROVED_HARD_NEG_TAGS:
            shutil.copy2(src_file, out_img_dir / fname)
            (out_lbl_dir / f"{Path(fname).stem}.txt").write_text("", encoding="utf-8")
            added_hard_neg.append(fname)
        elif tag in APPROVED_CLEAN_NEG_TAGS and len(added_clean_neg) < MAX_CLEAN_NEG:
            shutil.copy2(src_file, out_img_dir / fname)
            (out_lbl_dir / f"{Path(fname).stem}.txt").write_text("", encoding="utf-8")
            added_clean_neg.append(fname)

    # Verifikasi 0% camera leakage terhadap valid/ dan test/
    protected_cams = set()
    for sp in ("valid", "test"):
        for p in (DATASET_DIR / sp / "images").iterdir():
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                protected_cams.add(extract_camera_group(p.stem))
    train_v2_cams = {
        extract_camera_group(p.stem)
        for p in out_img_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMG_EXTS
    }
    overlap = protected_cams & train_v2_cams
    if overlap:
        raise RuntimeError(f"TERDETEKSI LEAKAGE KAMERA: {overlap}")

    # Tulis data_v2.yaml (val & test tetap menunjuk dataset asli yang tidak disentuh!)
    yaml_lines = [
        f"train: {(OUT_DATASET / 'train' / 'images').as_posix()}",
        f"val: {(DATASET_DIR / 'valid' / 'images').as_posix()}",
        f"test: {(DATASET_DIR / 'test' / 'images').as_posix()}",
        "",
        f"nc: {len(CLASS_NAMES)}",
        "names:",
    ]
    for cid in sorted(CLASS_NAMES.keys()):
        yaml_lines.append(f"  {cid}: {CLASS_NAMES[cid]}")
    data_yaml_path = OUT_DATASET / "data_v2.yaml"
    data_yaml_path.write_text("\n".join(yaml_lines) + "\n", encoding="utf-8")

    total_v2_imgs = kept_train_images + len(added_hard_neg) + len(added_clean_neg)
    total_v2_bg = bg_from_orig + len(added_hard_neg) + len(added_clean_neg)

    log = {
        "dataset_v2_yaml": str(data_yaml_path),
        "kept_original_train_images": kept_train_images,
        "excluded_outlier_images_count": len(excluded_images),
        "excluded_outlier_images": excluded_images,
        "removed_nonpkl_boxes_count": cleaned_boxes_total,
        "added_hard_negative_flagged_count": len(added_hard_neg),
        "added_hard_negative_flagged": added_hard_neg,
        "added_clean_traffic_negative_count": len(added_clean_neg),
        "added_clean_traffic_negative": added_clean_neg,
        "total_train_v2_images": total_v2_imgs,
        "total_train_v2_boxes": kept_boxes_total,
        "total_train_v2_background_images": total_v2_bg,
        "background_ratio_pct": round(100.0 * total_v2_bg / max(1, total_v2_imgs), 1),
        "camera_leakage_vs_valid_test": 0,
    }
    with open(OUT_DATASET / "curation_log.json", "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)

    print("================ DATASET V2 CURATION COMPLETE ================")
    print(f"Original train kept       : {kept_train_images} gambar ({kept_boxes_total} box)")
    print(f"Excluded outliers         : {len(excluded_images)} gambar (2 non-CCTV Panggul + 12 foto web)")
    print(f"Removed non-PKL boxes     : {cleaned_boxes_total} box (payung hujan pejalan kaki / STOP)")
    print(f"Added hard-negatives (FP) : {len(added_hard_neg)} frame CCTV live")
    print(f"Added clean traffic negs  : {len(added_clean_neg)} frame CCTV live")
    print(f"Total train_v2            : {total_v2_imgs} gambar | {total_v2_bg} bg ({log['background_ratio_pct']}%)")
    print(f"Camera leakage (val/test) : 0 (VERIFIED)")
    print(f"YAML siap pakai           : {data_yaml_path}")
    print("==============================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
