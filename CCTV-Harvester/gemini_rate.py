"""
Pembatas laju (rate limiter) Gemini API bersama untuk SEMUA skrip PATRA yang memakai API key yang sama
(`label_with_gemini.py`, `monitor_cctv.py`, `AI-Patra/audit_dataset_gemini.py`).

- Batas default 14 request/menit (di bawah kuota 15 RPM). Ubah via env `GEMINI_MAX_RPM` di `.env`.
- Sliding window 60 detik + jarak minimal 60/RPM detik antar request (tidak ada lonjakan/burst).
- Aman untuk thread (ThreadPoolExecutor) DAN antar-proses: stempel waktu request disimpan di
  `.state/gemini_rate_log.json` dengan file lock, sehingga 2 skrip yang jalan bersamaan tetap
  berbagi kuota yang sama.
- SETIAP percobaan HTTP dihitung (termasuk retry & fallback model), karena kuota Google menghitung
  request, bukan gambar.
- API key dikirim lewat header `x-goog-api-key` (tidak muncul di URL / log).
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

import requests

from config import DEFAULT_STATE_DIR, load_dotenv_file

WINDOW_SEC = 60.0
DEFAULT_MAX_RPM = 14
_LOG_PATH = DEFAULT_STATE_DIR / "gemini_rate_log.json"
_LOCK_PATH = DEFAULT_STATE_DIR / "gemini_rate_log.lock"
_thread_lock = threading.Lock()


def max_rpm() -> int:
    load_dotenv_file()
    try:
        val = int(os.environ.get("GEMINI_MAX_RPM", DEFAULT_MAX_RPM))
    except ValueError:
        val = DEFAULT_MAX_RPM
    return max(1, min(val, 14))  # dikunci < 15 RPM sesuai kuota


class _FileLock:
    """Lock antar-proses sederhana berbasis file eksklusif (Windows & Linux)."""

    def __init__(self, path: Path, stale_sec: float = 30.0) -> None:
        self.path = path
        self.stale_sec = stale_sec
        self.fd: int | None = None

    def __enter__(self) -> "_FileLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                self.fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                return self
            except FileExistsError:
                try:  # lock yatim (proses crash) dibersihkan otomatis
                    if time.time() - self.path.stat().st_mtime > self.stale_sec:
                        self.path.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                time.sleep(0.05)

    def __exit__(self, *exc: Any) -> None:
        if self.fd is not None:
            os.close(self.fd)
        self.path.unlink(missing_ok=True)


def _read_log() -> list[float]:
    try:
        data = json.loads(_LOG_PATH.read_text(encoding="utf-8"))
        return [float(t) for t in data if isinstance(t, (int, float))]
    except Exception:
        return []


def acquire_slot() -> float:
    """Blok sampai boleh mengirim 1 request. Mengembalikan lama menunggu (detik)."""
    rpm = max_rpm()
    min_spacing = WINDOW_SEC / rpm
    waited = 0.0
    with _thread_lock:
        while True:
            with _FileLock(_LOCK_PATH):
                now = time.time()
                stamps = [t for t in _read_log() if now - t < WINDOW_SEC]
                wait = 0.0
                if stamps:
                    wait = max(wait, stamps[-1] + min_spacing - now)
                if len(stamps) >= rpm:
                    wait = max(wait, stamps[-rpm] + WINDOW_SEC - now)
                if wait <= 0:
                    stamps.append(now)
                    _LOG_PATH.write_text(json.dumps(stamps[-rpm * 2:]), encoding="utf-8")
                    return waited
            sleep_for = min(max(wait, 0.05), 5.0)
            time.sleep(sleep_for)
            waited += sleep_for


def gemini_post(url: str, api_key: str, payload: dict[str, Any], timeout: float) -> requests.Response:
    """`requests.post` ke Gemini yang selalu lewat pembatas laju bersama."""
    acquire_slot()
    return requests.post(
        url,
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )


def retry_after_sec(resp: requests.Response, default: float) -> float:
    """Hormati header Retry-After dari 429 (bila ada)."""
    try:
        return max(default, float(resp.headers.get("Retry-After", default)))
    except (TypeError, ValueError):
        return default
