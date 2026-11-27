"""Kurasi dataset AI-Patra + gabung CCTV-Harvester berdasarkan hasil audit Gemini Vision & audit FP/FN.

Default (mode bersih low-FP / low-FN berdasarkan bukti audit):
- Pertahankan kelas fisik PKL yang bersih: `0: Emperan`, `1: Gerobak`
  (menghapus kelas pemicu FP/FN tinggi: `Payung` [~30% FP payung hujan pejalan kaki],
   `Terpal` [95.8% FN / 4.2% Recall + konflik double-label Gerobak], `Panggul` [0% Recall, 5 sampel]).
- Hapus gambar non-CCTV / rusak yang ditandai Gemini (`is_valid_cctv == False`) & outlier close-up web.
- Hapus kotak individual yang ditandai `false_positive` / `bad_bbox` oleh Gemini, dan perbaiki `wrong_class`.
- Gabungkan gambar & label valid dari `CCTV-Harvester/output/dataset_pkl/` ke `AI-Patra/dataset/`.
- Jalankan ulang camera-grouped stratified split (0% camera leakage) & audit `prepare_dataset.py --verify`.
- Sinkronkan `data.yaml`, `prepare_dataset.py`, dan konfigurasi kelas `CCTV-Harvester`.

Penggunaan:
  # 1. Preview dulu tanpa mengubah file:
  python AI-Patra/curate_and_merge_dataset.py --dry-run

  # 2. Terapkan langsung ke AI-Patra/dataset/ & sinkronkan config kelas:
  python AI-Patra/curate_and_merge_dataset.py --apply
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
DATASET_DIR = AI_ROOT / "dataset"
HARVESTER_PKL_DIR = REPO_ROOT / "CCTV-Harvester" / "output" / "dataset_pkl"
DEFAULT_CACHE_PATH = AI_ROOT / ".audit_cache" / "audit_results.jsonl"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Outlier foto close-up non-CCTV / berita web yang sudah terkonfirmasi visual sebelumnya
KNOWN_NON_CCTV_PREFIXES = (
    "Panggul_jpg.",
    "panggul_jpg.",
    "sep_jpg.",
    "idcctv2_raw",
    "idcctv3_raw",
    "idcctv4_raw",
    "idcctv7_raw",
    "idcctv8_raw",
    "idcctv9_raw",
    "idcctv10_raw",
    "idcctv11_raw",
    "idcctv12_raw",
    "idcctv13_raw",
    "idcctv15_raw",
    "idcctv17_raw",
)


def box_iou(b1: tuple[float, float, float, float], b2: tuple[float, float, float, float]) -> float:
    x1a, y1a = b1[0] - b1[2] / 2, b1[1] - b1[3] / 2
    x2a, y2a = b1[0] + b1[2] / 2, b1[1] + b1[3] / 2
    x1b, y1b = b2[0] - b2[2] / 2, b2[1] - b2[3] / 2
    x2b, y2b = b2[0] + b2[2] / 2, b2[1] + b2[3] / 2
    ix1, iy1 = max(x1a, x1b), max(y1a, y1b)
    ix2, iy2 = min(x2a, x2b), min(y2a, y2b)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = max(1e-9, b1[2] * b1[3] + b2[2] * b2[3] - inter)
    return inter / union


def dedup_boxes(boxes: list[tuple[int, float, float, float, float]], iou_thr: float = 0.65) -> list[tuple[int, float, float, float, float]]:
    kept: list[tuple[int, float, float, float, float]] = []
    for box in boxes:
        if any(box_iou(box[1:], k[1:]) >= iou_thr for k in kept):
            continue
        kept.append(box)
    return kept


def load_audit_records(cache_path: Path) -> dict[str, dict[str, Any]]:
    if not cache_path.exists():
        raise FileNotFoundError(
            f"File cache audit belum ditemukan: {cache_path}\n"
            "Jalankan dulu: python AI-Patra/audit_dataset_gemini.py"
        )
    recs: dict[str, dict[str, Any]] = {}
    for ln in cache_path.read_text(encoding="utf-8").splitlines():
        if not ln.strip():
            continue
        r = json.loads(ln)
        if "error" not in r:
            recs[r["key"]] = r
    return recs


def sync_class_configs(kept_classes: list[str]) -> None:
    """Sinkronkan daftar kelas di AI-Patra/prepare_dataset.py, CCTV-Harvester/config.py, dan gemini_labeler.py."""
    # 1. AI-Patra/prepare_dataset.py
    prep_path = AI_ROOT / "prepare_dataset.py"
    prep_txt = prep_path.read_text(encoding="utf-8")
    cls_dict_lines = ["CLASS_NAMES = {"] + [f'    {i}: "{name}",' for i, name in enumerate(kept_classes)] + ["}"]
    prep_txt = re.sub(r"CLASS_NAMES\s*=\s*\{[^}]*\}", "\n".join(cls_dict_lines), prep_txt, count=1)
    prep_path.write_text(prep_txt, encoding="utf-8")

    # 2. CCTV-Harvester/config.py
    cfg_path = REPO_ROOT / "CCTV-Harvester" / "config.py"
    cfg_txt = cfg_path.read_text(encoding="utf-8")
    alias_templates: dict[str, list[str]] = {
        "Emperan": ["emperan", "lapak", "lesehan", "meja dagang"],
        "Gerobak": ["gerobak", "gerobak pkl", "gerobak dorong", "cart"],
        "Panggul": ["panggul", "pikulan", "pedagang pikul"],
        "Payung": ["payung", "payung dagang", "payung pkl"],
        "Terpal": ["terpal", "tenda", "tenda pkl", "tenda terpal"],
    }
    color_templates: dict[str, tuple[int, int, int]] = {
        "Emperan": (255, 140, 0),
        "Gerobak": (40, 40, 235),
        "Panggul": (200, 60, 220),
        "Payung": (0, 185, 255),
        "Terpal": (40, 175, 60),
    }

    names_block = "YOLO_CLASS_NAMES: list[str] = [\n" + "".join(f'    "{n}",\n' for n in kept_classes) + "]"
    aliases_block = "CLASS_ALIASES: dict[str, int] = {\n"
    for i, n in enumerate(kept_classes):
        for al in alias_templates.get(n, [n.lower()]):
            aliases_block += f'    "{al}": {i},\n'
    aliases_block += "}"
    colors_block = "CLASS_COLORS_BGR: dict[int, tuple[int, int, int]] = {\n"
    for i, n in enumerate(kept_classes):
        colors_block += f"    {i}: {color_templates.get(n, (40, 40, 235))},  # {n}\n"
    colors_block += "}"

    cfg_txt = re.sub(r"YOLO_CLASS_NAMES:\s*list\[str\]\s*=\s*\[[^\]]*\]", names_block, cfg_txt, count=1)
    cfg_txt = re.sub(r"CLASS_ALIASES:\s*dict\[str,\s*int\]\s*=\s*\{[^}]*\}", aliases_block, cfg_txt, count=1)
    cfg_txt = re.sub(r"CLASS_COLORS_BGR:\s*dict\[int,\s*tuple\[int,\s*int,\s*int\]\]\s*=\s*\{[^}]*\}", colors_block, cfg_txt, count=1)
    cfg_path.write_text(cfg_txt, encoding="utf-8")

    # 3. CCTV-Harvester/gemini_labeler.py (update daftar kelas prompt)
    lbl_path = REPO_ROOT / "CCTV-Harvester" / "gemini_labeler.py"
    lbl_txt = lbl_path.read_text(encoding="utf-8")
    desc_map = {
        "Emperan": '   - "Emperan": lapak/meja/hamparan dagangan di trotoar atau emperan toko',
        "Gerobak": '   - "Gerobak": gerobak dorong / gerobak jualan PKL (bakso, mie ayam, gorengan, kopi, dll)',
        "Panggul": '   - "Panggul": pedagang keliling yang memikul/memanggul dagangan',
        "Payung": '   - "Payung": payung besar dagangan PKL (bukan payung pejalan kaki hujan)',
        "Terpal": '   - "Terpal": tenda/warung terpal PKL di trotoar atau pinggir jalan',
    }
    excluded = [c for c in ("Payung", "Terpal", "Panggul", "Sepeda-motor") if c not in kept_classes]
    new_rule2 = (
        f"2. Deteksi semua objek PKL yang tampak jelas di trotoar/bahu jalan/area publik menggunakan TEPAT salah satu dari {len(kept_classes)} kelas berikut:\n"
        + "\n".join(desc_map[c] for c in kept_classes if c in desc_map)
        + f"\n3. JANGAN memberi label pada {', '.join(excluded)} (jika bukan lapak/gerobak fisik jelas), segala jenis sepeda motor, mobil, truk, angkot, pohon, tong sampah, tiang rambu, atau bangunan toko permanen."
    )
    lbl_txt = re.sub(
        r"2\. Deteksi semua objek PKL[\s\S]*?3\. JANGAN memberi label[^\n]*",
        new_rule2,
        lbl_txt,
        count=1,
    )
    lbl_path.write_text(lbl_txt, encoding="utf-8")

    # 4. CCTV-Harvester/output/dataset_pkl/data.yaml
    h_yaml = HARVESTER_PKL_DIR / "data.yaml"
    if h_yaml.exists():
        lines = "\n".join(f"  {i}: {n}" for i, n in enumerate(kept_classes))
        h_yaml.write_text(
            "# Dataset PKL hasil auto-capture & auto-label Gemini (CCTV-Harvester)\n"
            "train: images\nval: images\n\n"
            f"nc: {len(kept_classes)}\nnames:\n{lines}\n",
            encoding="utf-8",
        )


def main() -> int:
    ap = argparse.ArgumentParser(description="Kurasi & gabungkan dataset AI-Patra + CCTV-Harvester berdasarkan audit Gemini")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE_PATH)
    ap.add_argument(
        "--keep-classes",
        type=str,
        default="Emperan,Gerobak",
        help="Daftar kelas yang dipertahankan (default: Emperan,Gerobak — buang Payung/Terpal/Panggul pemicu FP/FN)",
    )
    ap.add_argument("--apply", action="store_true", help="Terapkan perubahan langsung ke AI-Patra/dataset/ & config")
    ap.add_argument("--dry-run", action="store_true", help="Simulasi & tampilkan laporan tanpa mengubah file")
    args = ap.parse_args()

    if not args.apply and not args.dry_run:
        args.dry_run = True

    kept_classes = [c.strip() for c in args.keep_classes.split(",") if c.strip()]
    kept_name_to_new_id = {name: idx for idx, name in enumerate(kept_classes)}
    recs = load_audit_records(args.cache)

    # Kumpulkan seluruh file sumber (AI-Patra train/valid/test + CCTV-Harvester dataset_pkl)
    sources: list[dict[str, Any]] = []
    for sp in ("train", "valid", "test"):
        img_dir = DATASET_DIR / sp / "images"
        lbl_dir = DATASET_DIR / sp / "labels"
        if not img_dir.exists():
            continue
        for p in sorted(img_dir.iterdir()):
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                sources.append({
                    "key": f"ai_patra/{sp}/{p.stem}",
                    "source": "ai_patra",
                    "split": sp,
                    "img_path": p,
                    "lbl_path": lbl_dir / f"{p.stem}.txt",
                })

    h_img = HARVESTER_PKL_DIR / "images"
    h_lbl = HARVESTER_PKL_DIR / "labels"
    if h_img.exists():
        for p in sorted(h_img.iterdir()):
            if p.is_file() and p.suffix.lower() in IMG_EXTS:
                sources.append({
                    "key": f"harvester/dataset_pkl/{p.stem}",
                    "source": "harvester",
                    "split": "dataset_pkl",
                    "img_path": p,
                    "lbl_path": h_lbl / f"{p.stem}.txt",
                })

    missing_audit = [s["key"] for s in sources if s["key"] not in recs]
    if missing_audit:
        print(f"[PERINGATAN] Masih ada {len(missing_audit)} gambar yang belum diaudit Gemini!")
        print("Jalankan dulu: python AI-Patra/audit_dataset_gemini.py")
        if args.apply:
            print("Dibatalkan agar tidak mengkurasi data setengah matang.")
            return 1

    stats = Counter()
    kept_cls_cnt = Counter()
    dropped_cls_cnt = Counter()
    plan_keep: list[dict[str, Any]] = []
    plan_drop_imgs: list[tuple[str, str]] = []

    for item in sources:
        rec = recs.get(item["key"])
        fname = item["img_path"].name
        if fname.startswith(KNOWN_NON_CCTV_PREFIXES):
            stats["drop_known_non_cctv"] += 1
            plan_drop_imgs.append((item["key"], "known_non_cctv_outlier"))
            continue

        if rec is not None and (
            rec.get("camera_angle") != "high_angle_cctv"
            or rec.get("image_quality") != "good"
        ):
            stats["drop_gemini_invalid_img"] += 1
            plan_drop_imgs.append((item["key"], f"{rec.get('camera_angle')}: {rec.get('image_note','')[:60]}"))
            continue

        gt_boxes = rec.get("boxes_gt", []) if rec else []
        audit_by_idx = {b.get("idx"): b for b in (rec.get("boxes_audit", []) if rec else [])}

        curated_boxes: list[tuple[int, float, float, float, float]] = []
        for b in gt_boxes:
            orig_cname = b["class_name"]
            ba = audit_by_idx.get(b["idx"], {})
            verdict = str(ba.get("verdict", "valid")).lower()
            sugg = str(ba.get("suggested_class", orig_cname)).strip()

            if verdict in ("false_positive", "bad_bbox"):
                stats[f"drop_box_gemini_{verdict}"] += 1
                dropped_cls_cnt[f"{orig_cname}({verdict})"] += 1
                continue

            final_cname = sugg if (verdict == "wrong_class" and sugg in kept_name_to_new_id) else orig_cname
            if final_cname not in kept_name_to_new_id:
                stats["drop_box_excluded_class"] += 1
                dropped_cls_cnt[f"{orig_cname}(excluded_cls)"] += 1
                continue

            if verdict == "wrong_class" and final_cname != orig_cname:
                stats["fixed_wrong_class"] += 1

            new_cid = kept_name_to_new_id[final_cname]
            curated_boxes.append((new_cid, float(b["cx"]), float(b["cy"]), float(b["w"]), float(b["h"])))

        before_dedup = len(curated_boxes)
        curated_boxes = dedup_boxes(curated_boxes, iou_thr=0.65)
        stats["drop_box_overlap_dedup"] += before_dedup - len(curated_boxes)

        # Untuk Harvester: hanya masukkan gambar yang masih punya >=1 box PKL valid (hindari nambah negatif tak sengaja)
        if item["source"] == "harvester" and not curated_boxes:
            stats["drop_harvester_empty_after_curation"] += 1
            plan_drop_imgs.append((item["key"], "harvester_0_kept_pkl_boxes"))
            continue

        for box in curated_boxes:
            kept_cls_cnt[kept_classes[box[0]]] += 1

        if curated_boxes:
            stats["kept_pos_imgs"] += 1
        else:
            stats["kept_bg_imgs"] += 1

        plan_keep.append({
            **item,
            "curated_boxes": curated_boxes,
        })

    print("\n================ CURATION & MERGE PLAN ================")
    print(f"Mode                 : {'APPLY (MENULIS PERUBAHAN)' if args.apply else 'DRY-RUN (SIMULASI)'}")
    print(f"Kept classes ({len(kept_classes)})     : {kept_classes}")
    print(f"Total source images  : {len(sources)} (AI-Patra + Harvester)")
    print(f"Images kept          : {len(plan_keep)} (pos={stats['kept_pos_imgs']}, bg={stats['kept_bg_imgs']})")
    print(f"  - from AI-Patra    : {sum(1 for x in plan_keep if x['source']=='ai_patra')}")
    print(f"  - from Harvester   : {sum(1 for x in plan_keep if x['source']=='harvester')}")
    print(f"Images dropped       : {len(plan_drop_imgs)} (known_non_cctv={stats['drop_known_non_cctv']}, gemini_invalid={stats['drop_gemini_invalid_img']}, harvester_empty={stats['drop_harvester_empty_after_curation']})")
    print(f"Boxes kept           : {sum(kept_cls_cnt.values())} {dict(kept_cls_cnt)}")
    print(f"Boxes dropped        : gemini_fp={stats['drop_box_gemini_false_positive']}, gemini_bad_bbox={stats['drop_box_gemini_bad_bbox']}, excluded_cls={stats['drop_box_excluded_class']}, overlap_dedup={stats['drop_box_overlap_dedup']}")
    print(f"Boxes class-fixed    : {stats['fixed_wrong_class']}")
    print(f"Dropped breakdown    : {dict(dropped_cls_cnt.most_common(12))}")
    if plan_drop_imgs:
        print("\nContoh gambar yang dibuang (maks 15):")
        for k, reason in plan_drop_imgs[:15]:
            print(f"  - {k}: {reason}")
    print("=======================================================\n")

    if not args.apply:
        print("Dry-run selesai. Jalankan dengan `--apply` untuk memperbarui dataset & melakukan re-split 0% leakage.")
        return 0

    # Backup aman ringan di .audit_cache/backup_before_curate (tanpa menimpa kalau sudah ada)
    backup_dir = AI_ROOT / ".audit_cache" / "backup_dataset_before_curate"
    if not backup_dir.exists():
        shutil.copytree(DATASET_DIR, backup_dir)
        print(f"[BACKUP] Dataset lama disimpan di: {backup_dir}")

    # Tulis seluruh file hasil kurasi ke staging sementara, lalu ganti train/valid/test sebelum re-split
    staging = AI_ROOT / ".audit_cache" / "staging_curated"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "images").mkdir(parents=True, exist_ok=True)
    (staging / "labels").mkdir(parents=True, exist_ok=True)

    seen_names: set[str] = set()
    for entry in plan_keep:
        src_img: Path = entry["img_path"]
        dst_name = src_img.name
        if dst_name in seen_names:
            dst_name = f"harv_{dst_name}"
        seen_names.add(dst_name)
        shutil.copy2(src_img, staging / "images" / dst_name)
        lines = [f"{c} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}" for c, cx, cy, w, h in entry["curated_boxes"]]
        (staging / "labels" / f"{Path(dst_name).stem}.txt").write_text(
            "\n".join(lines) + ("\n" if lines else ""),
            encoding="utf-8",
        )

    # Kosongkan train/valid/test lalu tempatkan sementara di train/ agar prepare_dataset.py --split membagi ulang secara camera-grouped 75/15/10
    for sp in ("train", "valid", "test"):
        sp_dir = DATASET_DIR / sp
        if sp_dir.exists():
            shutil.rmtree(sp_dir)
        (sp_dir / "images").mkdir(parents=True, exist_ok=True)
        (sp_dir / "labels").mkdir(parents=True, exist_ok=True)

    for f in (staging / "images").iterdir():
        shutil.move(str(f), str(DATASET_DIR / "train" / "images" / f.name))
    for f in (staging / "labels").iterdir():
        shutil.move(str(f), str(DATASET_DIR / "train" / "labels" / f.name))
    shutil.rmtree(staging)

    # Sinkronkan konfigurasi kelas (AI-Patra & CCTV-Harvester)
    sync_class_configs(kept_classes)
    print(f"[OK] Konfigurasi kelas disinkronkan ke {len(kept_classes)} kelas: {kept_classes}")

    # Jalankan re-split & verifikasi anti-leakage dari prepare_dataset.py
    import importlib
    sys.path.insert(0, str(AI_ROOT))
    import prepare_dataset  # noqa: E402
    importlib.reload(prepare_dataset)
    prepare_dataset.perform_split(DATASET_DIR)
    ok = prepare_dataset.verify_dataset(DATASET_DIR)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
