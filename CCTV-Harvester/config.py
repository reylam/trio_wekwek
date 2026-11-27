"""Konfigurasi dasar CCTV-Harvester (selaras dengan kelas dataset PATRA)."""

from __future__ import annotations

import os
from pathlib import Path

HARVESTER_ROOT = Path(__file__).resolve().parent
REPO_ROOT = HARVESTER_ROOT.parent
DEFAULT_CATALOG_PATH = REPO_ROOT / "AI-Patra" / "cctv_catalog" / "cctv_snapshot.json"
DEFAULT_OUTPUT_DIR = HARVESTER_ROOT / "output"
DEFAULT_STATE_DIR = HARVESTER_ROOT / ".state"

# Pemetaan 1 kelas YOLO identik dengan AI-Patra/dataset/data.yaml (khusus Gerobak)
YOLO_CLASS_NAMES: list[str] = [
    "Gerobak",
]

CLASS_NAME_TO_ID: dict[str, int] = {
    name.lower(): idx for idx, name in enumerate(YOLO_CLASS_NAMES)
}

# Alias tambahan bila Gemini mengembalikan variasi ejaan
CLASS_ALIASES: dict[str, int] = {
    "gerobak": 0,
    "gerobak pkl": 0,
    "gerobak dorong": 0,
    "cart": 0,
}

# Warna BGR per kelas untuk gambar preview bounding box
CLASS_COLORS_BGR: dict[int, tuple[int, int, int]] = {
    0: (40, 40, 235),  # Gerobak
}

# Ambang batas pre-check kualitas gambar (sebelum panggil Gemini)
MIN_WIDTH = 480
MIN_HEIGHT = 270
MIN_STD_CONTRAST = 16.0
MIN_BRIGHTNESS = 28.0
MAX_BRIGHTNESS = 242.0
MIN_LAPLACIAN_VAR = 40.0

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_FALLBACK_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
]


def load_dotenv_file(env_path: Path | None = None) -> None:
    """Muat file .env sederhana tanpa butuh dependensi python-dotenv."""
    path = env_path or (HARVESTER_ROOT / ".env")
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def get_gemini_api_key() -> str:
    load_dotenv_file()
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY belum diatur. Isi di CCTV-Harvester/.env atau environment variable."
        )
    return key


def get_gemini_model_chain(primary_override: str | None = None) -> list[str]:
    load_dotenv_file()
    primary = (primary_override or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    raw_fallbacks = os.environ.get("GEMINI_FALLBACK_MODELS", "")
    fallbacks = [m.strip() for m in raw_fallbacks.split(",") if m.strip()] or list(DEFAULT_FALLBACK_MODELS)

    chain: list[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in chain:
            chain.append(m)
    return chain


def resolve_class_id(label: str, single_class: bool = False) -> int | None:
    """Konversi nama kelas dari Gemini ke ID YOLO (0..1, atau 0 jika single_class)."""
    norm = label.strip().lower().replace("_", "-")
    if norm in CLASS_NAME_TO_ID:
        return 0 if single_class else CLASS_NAME_TO_ID[norm]
    if norm in CLASS_ALIASES:
        return 0 if single_class else CLASS_ALIASES[norm]
    for alias, cid in CLASS_ALIASES.items():
        if alias in norm:
            return 0 if single_class else cid
    return None
