"""
Frame budget per kamera — agar dataset terdiri dari BANYAK kamera berbeda, bukan banyak frame
dari kamera yang itu-itu saja.

Alasan: frame dari 1 kamera berbagi latar yang sama, sehingga model menghafal latar kamera
(k-fold PATRA: mAP 0.85 di kamera yang pernah dilihat vs 0.37 di kamera baru). Nilai frame
ke-6 dari kamera yang sama jauh lebih kecil dari frame pertama kamera baru.

Aturan (bisa diubah lewat argumen CLI):
- `max_frames`  : maksimal frame tersimpan per kamera (default 5). Kamera yang penuh tidak dikunjungi lagi.
- `min_gap_min` : jeda minimal antar frame tersimpan dari kamera yang sama (default 120 menit), agar
                  1–5 frame itu tersebar di jam berbeda (siang/sore/malam), bukan 5 frame dalam 5 menit.
- `retry_min`   : jeda sebelum kamera dicoba lagi setelah percobaan gagal / tanpa hasil (default 30 menit).
- `max_attempts`: berhenti mencoba kamera setelah N percobaan tanpa frame tersimpan (default 6), agar
                  kuota Gemini tidak habis untuk kamera yang tidak pernah menyorot PKL.
- Prioritas: kamera dengan frame paling sedikit lebih dulu (kamera baru = prioritas utama).

Ledger disimpan di `.state/camera_frame_ledger.json`. Saat pertama kali dibuat (atau `--rebuild-ledger`),
ledger dihitung ulang dari frame yang SUDAH ada di disk: staging `.state/raw_roi_captures/`,
`output/dataset_pkl/images/`, serta dataset & karantina AI-Patra — sehingga kamera yang sudah
banyak frame-nya di dataset tidak dipanen lagi.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from config import DEFAULT_OUTPUT_DIR, DEFAULT_STATE_DIR, REPO_ROOT

LEDGER_NAME = "camera_frame_ledger.json"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
_TS_RE = re.compile(r"_(20\d{6})_(\d{6})$")


def slugify(text: str, max_len: int) -> str:
    """Identik dengan slugify di capture_roi_loop.py / monitor_cctv.py (dipakai untuk nama file)."""
    clean = re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")
    return (clean or "cam")[:max_len]


def stem_prefix(cam: dict[str, Any]) -> str:
    """Prefix nama file harvester: `<kota14>_<id34>_` (lihat pembentukan `stem` di skrip capture)."""
    return f"{slugify(str(cam.get('city', '-')), 14)}_{slugify(str(cam.get('id', 'cam')), 34)}_"


def _parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _ts_from_stem(stem: str) -> datetime | None:
    m = _TS_RE.search(stem)
    if not m:
        return None
    try:
        # Timestamp nama file memakai jam lokal mesin harvester
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").astimezone(timezone.utc)
    except ValueError:
        return None


def default_scan_dirs() -> list[Path]:
    """Folder yang dihitung saat membangun ulang ledger dari frame yang sudah ada."""
    ai = REPO_ROOT / "AI-Patra"
    dirs = [
        DEFAULT_STATE_DIR / "raw_roi_captures",
        DEFAULT_OUTPUT_DIR / "dataset_pkl" / "images",
    ]
    for split in ("train", "valid", "test"):
        dirs.append(ai / "dataset" / split / "images")
        dirs.append(ai / "dataset_quarantine" / "needs_relabel" / split / "images")
    return dirs


class FrameBudget:
    def __init__(
        self,
        state_dir: Path,
        max_frames: int = 5,
        min_gap_min: float = 120.0,
        retry_min: float = 30.0,
        max_attempts: int = 6,
    ) -> None:
        self.path = state_dir / LEDGER_NAME
        self.max_frames = max_frames
        self.min_gap = timedelta(minutes=min_gap_min)
        self.retry = timedelta(minutes=retry_min)
        self.max_attempts = max_attempts
        self.data: dict[str, Any] = {"version": 1, "cameras": {}}
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                pass
        self.data.setdefault("cameras", {})

    @property
    def enabled(self) -> bool:
        return self.max_frames > 0

    @property
    def exists(self) -> bool:
        return self.path.exists()

    def _entry(self, cam_id: str) -> dict[str, Any]:
        return self.data["cameras"].setdefault(
            cam_id,
            {"frames": 0, "stems": [], "last_frame_at": None, "last_attempt_at": None, "fails_since_frame": 0},
        )

    # ------------------------------------------------------------------ rebuild
    def rebuild(self, cameras: list[dict[str, Any]], scan_dirs: list[Path] | None = None) -> dict[str, int]:
        """Hitung ulang jumlah frame per kamera dari file yang ada di disk (dedupe per nama file)."""
        prefixes = sorted(((stem_prefix(c), str(c.get("id"))) for c in cameras), key=lambda t: -len(t[0]))
        found: dict[str, dict[str, datetime | None]] = {}

        def add(cam_id: str, stem: str, ts: datetime | None) -> None:
            found.setdefault(cam_id, {})[stem] = ts

        for d in scan_dirs or default_scan_dirs():
            if not d.exists():
                continue
            for p in d.iterdir():
                if p.name.endswith(".meta.json"):
                    try:
                        meta = json.loads(p.read_text(encoding="utf-8"))
                        stem = p.name[: -len(".meta.json")]
                        add(str(meta["camera_id"]), stem, _parse_iso(meta.get("captured_at")))
                    except Exception:
                        pass
                    continue
                if p.suffix.lower() not in IMG_EXTS:
                    continue
                for pref, cam_id in prefixes:
                    if p.stem.startswith(pref):
                        add(cam_id, p.stem, _ts_from_stem(p.stem))
                        break

        old = self.data["cameras"]
        self.data["cameras"] = {}
        for cam_id, stems in found.items():
            e = self._entry(cam_id)
            e["stems"] = sorted(stems)
            e["frames"] = len(stems)
            times = [t for t in stems.values() if t]
            e["last_frame_at"] = max(times).isoformat() if times else None
            prev = old.get(cam_id, {})
            e["last_attempt_at"] = prev.get("last_attempt_at")
        # Pertahankan riwayat percobaan kamera yang belum punya frame
        for cam_id, prev in old.items():
            if cam_id not in self.data["cameras"] and prev.get("last_attempt_at"):
                e = self._entry(cam_id)
                e["last_attempt_at"] = prev.get("last_attempt_at")
                e["fails_since_frame"] = prev.get("fails_since_frame", 0)
        self.save()
        return {cid: e["frames"] for cid, e in self.data["cameras"].items() if e["frames"]}

    # ---------------------------------------------------------------- decisions
    def status(self, cam_id: str, now: datetime) -> str:
        """'ok' | 'full' | 'gap' (jeda antar frame) | 'retry' (jeda setelah gagal) | 'gave_up'."""
        e = self.data["cameras"].get(cam_id)
        if not e:
            return "ok"
        if e["frames"] >= self.max_frames:
            return "full"
        if self.max_attempts > 0 and e.get("fails_since_frame", 0) >= self.max_attempts:
            return "gave_up"
        last_frame = _parse_iso(e.get("last_frame_at"))
        if last_frame and now - last_frame < self.min_gap:
            return "gap"
        last_attempt = _parse_iso(e.get("last_attempt_at"))
        if last_attempt and now - last_attempt < self.retry and e.get("fails_since_frame", 0) > 0:
            return "retry"
        return "ok"

    def pick(
        self,
        cameras: list[dict[str, Any]],
        max_n: int,
        skip_ids: set[str] | None = None,
        now: datetime | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Pilih kamera untuk putaran ini: hanya yang 'ok', frame paling sedikit lebih dulu."""
        now = now or datetime.now(timezone.utc)
        skip = skip_ids or set()
        counts = {"ok": 0, "full": 0, "gap": 0, "retry": 0, "gave_up": 0, "skipped_bad": 0}
        eligible: list[tuple[tuple, dict[str, Any]]] = []
        city_rank: dict[str, int] = {}  # urutan kamera di dalam kotanya -> selang-seling antar kota
        for idx, cam in enumerate(cameras):
            cid = str(cam.get("id", ""))
            if cid in skip:
                counts["skipped_bad"] += 1
                continue
            st = self.status(cid, now)
            counts[st] += 1
            if st != "ok":
                continue
            e = self.data["cameras"].get(cid, {})
            frames = e.get("frames", 0)
            last_attempt = _parse_iso(e.get("last_attempt_at"))
            city_key = f"{frames}|{cam.get('city', '-')}"
            rank = city_rank.get(city_key, 0)
            city_rank[city_key] = rank + 1
            # 1) frame paling sedikit, 2) selang-seling antar kota (hindari 40 kamera 1 jalan yang sama),
            # 3) paling lama tidak dicoba, 4) urutan katalog
            key = (frames, rank, last_attempt.timestamp() if last_attempt else 0.0, idx)
            eligible.append((key, cam))
        eligible.sort(key=lambda t: t[0])
        return [cam for _, cam in eligible[: max(0, max_n)]], counts

    def has_future_work(self, cameras: list[dict[str, Any]], skip_ids: set[str] | None = None) -> bool:
        """False bila semua kamera sudah penuh / menyerah -> loop boleh berhenti."""
        now = datetime.now(timezone.utc)
        skip = skip_ids or set()
        return any(
            self.status(str(c.get("id", "")), now) in ("ok", "gap", "retry")
            for c in cameras
            if str(c.get("id", "")) not in skip
        )

    # ------------------------------------------------------------------ updates
    def record_attempt(self, cam_id: str, saved_stem: str | None, now: datetime | None = None) -> None:
        now = now or datetime.now(timezone.utc)
        e = self._entry(cam_id)
        e["last_attempt_at"] = now.isoformat()
        if saved_stem:
            if saved_stem not in e["stems"]:
                e["stems"].append(saved_stem)
            e["frames"] = len(e["stems"])
            e["last_frame_at"] = now.isoformat()
            e["fails_since_frame"] = 0
        else:
            e["fails_since_frame"] = e.get("fails_since_frame", 0) + 1

    def frames_of(self, cam_id: str) -> int:
        return int(self.data["cameras"].get(cam_id, {}).get("frames", 0))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.data["rules"] = {
            "max_frames": self.max_frames,
            "min_gap_min": self.min_gap.total_seconds() / 60,
            "retry_min": self.retry.total_seconds() / 60,
            "max_attempts": self.max_attempts,
        }
        self.path.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")

    def summary_line(self, cameras: list[dict[str, Any]]) -> str:
        ids = {str(c.get("id", "")) for c in cameras}
        cams = [e for cid, e in self.data["cameras"].items() if cid in ids]
        with_frames = [e for e in cams if e["frames"] > 0]
        total = sum(e["frames"] for e in with_frames)
        full = sum(1 for e in with_frames if e["frames"] >= self.max_frames)
        return (
            f"Ledger: {len(with_frames)}/{len(ids)} kamera punya frame | total {total} frame | "
            f"{full} kamera penuh (>= {self.max_frames}) | rata-rata "
            f"{(total / len(with_frames)) if with_frames else 0:.1f} frame/kamera"
        )


def add_budget_args(parser) -> None:
    """Argumen CLI bersama untuk capture_roi_loop.py & monitor_cctv.py."""
    g = parser.add_argument_group("Frame budget per kamera (keragaman kamera)")
    g.add_argument("--max-frames-per-camera", type=int, default=5,
                   help="Maks frame tersimpan per kamera (default 5; 0 = tanpa batas, perilaku lama)")
    g.add_argument("--min-gap-min", type=float, default=120.0,
                   help="Jeda minimal antar frame kamera yang sama, menit (default 120)")
    g.add_argument("--retry-min", type=float, default=30.0,
                   help="Jeda coba ulang kamera setelah gagal/tanpa hasil, menit (default 30)")
    g.add_argument("--max-attempts", type=int, default=6,
                   help="Berhenti mencoba kamera setelah N percobaan tanpa frame tersimpan (default 6; 0 = tanpa batas)")
    g.add_argument("--rebuild-ledger", action="store_true",
                   help="Hitung ulang ledger dari frame yang ada di disk (otomatis saat ledger belum ada)")


def budget_from_args(args, state_dir: Path, cameras: list[dict[str, Any]]) -> FrameBudget:
    budget = FrameBudget(
        state_dir,
        max_frames=args.max_frames_per_camera,
        min_gap_min=args.min_gap_min,
        retry_min=args.retry_min,
        max_attempts=args.max_attempts,
    )
    if budget.enabled and (args.rebuild_ledger or not budget.exists):
        counts = budget.rebuild(cameras)
        over = sorted(((n, c) for c, n in counts.items() if n >= budget.max_frames), reverse=True)
        print(f"[Ledger] Dibangun dari frame yang sudah ada: {sum(counts.values())} frame dari {len(counts)} kamera.")
        if over:
            top = ", ".join(f"{c} ({n})" for n, c in over[:5])
            print(f"[Ledger] {len(over)} kamera sudah penuh dan TIDAK akan dipanen lagi, mis.: {top}")
    if budget.enabled:
        print("[Ledger] " + budget.summary_line(cameras))
    return budget
