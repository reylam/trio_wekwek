"""
PATRA 24/7 CCTV AI Worker untuk Hugging Face Spaces (Docker, CPU Basic Free).

Alur:
  Hugging Face Space (1 frame tiap 3 detik, ONNX CPU)
      -> tulis ke Supabase PostgreSQL & Storage HANYA jika ada PKL baru / PKL bertambah
      <- dibaca langsung oleh BE-Patra & FE-Patra di Vercel
"""

from __future__ import annotations

import gc
import os
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from db_writer import CameraRecord, SupabasePatraStore
from detector import DEFAULT_MODEL_URL, OnnxPklDetector, render_evidence_jpeg

FRAME_INTERVAL_SEC = max(1.0, float(os.environ.get("FRAME_INTERVAL_SEC", "3")))
CONF_THRESH = float(os.environ.get("CONF_THRESH", "0.30"))
IOU_NMS = float(os.environ.get("IOU_NMS", "0.45"))
STREAM_TIMEOUT_MS = int(os.environ.get("STREAM_TIMEOUT_MS", "5500"))
CAMERA_COOLDOWN_SEC = int(os.environ.get("CAMERA_COOLDOWN_SEC", "30"))
CAMERA_REFRESH_SEC = int(os.environ.get("CAMERA_REFRESH_SEC", "600"))
MAX_CAMERAS = int(os.environ.get("MAX_CAMERAS", "60"))
WORKER_CITIES = [
    c.strip() for c in os.environ.get("WORKER_CITIES", "").split(",") if c.strip()
]


class WorkerState:
    def __init__(self) -> None:
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.running = False
        self.last_error: str | None = None
        self.cameras_loaded = 0
        self.frames_scanned = 0
        self.stream_failures = 0
        self.db_created = 0
        self.db_escalated = 0
        self.skipped_zero = 0
        self.skipped_noop = 0
        self.last_camera: str | None = None
        self.last_scan_at: str | None = None
        self.recent_events: deque[dict[str, Any]] = deque(maxlen=25)
        self.stop_event = threading.Event()


state = WorkerState()


def grab_single_frame(url: str, timeout_ms: int) -> np.ndarray | None:
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        f"timeout;{timeout_ms * 1000}|stimeout;{timeout_ms * 1000}"
    )
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
    if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)

    if not cap.isOpened():
        cap.release()
        return None

    frame = None
    for _ in range(2):
        ok, f = cap.read()
        if ok and f is not None and f.size > 0:
            frame = f
    cap.release()
    return frame


def worker_loop() -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    supabase_bucket = os.environ.get("SUPABASE_BUCKET", "patra-evidence").strip()
    model_path = os.environ.get("MODEL_PATH", "model/best.onnx").strip()
    model_url = os.environ.get("MODEL_URL", DEFAULT_MODEL_URL).strip()

    if not database_url or not supabase_url or not supabase_key:
        state.last_error = (
            "Secret DATABASE_URL, SUPABASE_URL, atau SUPABASE_SERVICE_ROLE_KEY belum diisi di HF Space."
        )
        print(f"[worker] {state.last_error}")
        return

    try:
        detector = OnnxPklDetector(
            model_path=model_path,
            model_url=model_url,
            conf_thresh=CONF_THRESH,
            iou_nms=IOU_NMS,
        )
        store = SupabasePatraStore(
            database_url=database_url,
            supabase_url=supabase_url,
            supabase_service_key=supabase_key,
            supabase_bucket=supabase_bucket,
            cooldown_sec=CAMERA_COOLDOWN_SEC,
        )
    except Exception as exc:
        state.last_error = f"Gagal inisialisasi detector/DB: {exc}"
        print(f"[worker] {state.last_error}")
        return

    cameras: list[CameraRecord] = []
    last_refresh_ts = 0.0
    cam_index = 0
    state.running = True
    state.last_error = None
    print(
        f"[worker] Aktif! Interval={FRAME_INTERVAL_SEC}s/frame, conf={CONF_THRESH}, "
        f"cities={WORKER_CITIES or 'ALL'}, max_cameras={MAX_CAMERAS}"
    )

    while not state.stop_event.is_set():
        loop_start = time.monotonic()

        # Segarkan daftar kamera aktif dari DB secara berkala
        if not cameras or (loop_start - last_refresh_ts) >= CAMERA_REFRESH_SEC:
            try:
                cameras = store.load_active_cameras(
                    cities=WORKER_CITIES or None,
                    max_cameras=MAX_CAMERAS,
                )
                state.cameras_loaded = len(cameras)
                last_refresh_ts = loop_start
                print(f"[worker] Memuat {len(cameras)} kamera aktif dari database.")
            except Exception as exc:
                state.last_error = f"Gagal baca daftar kamera DB: {exc}"
                print(f"[worker] {state.last_error}")
                state.stop_event.wait(10.0)
                continue

        if not cameras:
            state.stop_event.wait(15.0)
            continue

        cam = cameras[cam_index % len(cameras)]
        cam_index = (cam_index + 1) % len(cameras)
        state.last_camera = f"{cam.city} / {cam.name}"
        state.last_scan_at = datetime.now(timezone.utc).isoformat()

        frame = grab_single_frame(cam.stream_url, STREAM_TIMEOUT_MS)
        if frame is None:
            state.stream_failures += 1
        else:
            state.frames_scanned += 1
            try:
                dets = detector.detect(frame, roi_polygon=cam.roi_polygon)
                count = len(dets)
                if count == 0:
                    state.skipped_zero += 1
                else:
                    max_conf = max(d.score for d in dets)
                    jpeg_bytes = render_evidence_jpeg(frame, dets, roi_polygon=cam.roi_polygon)
                    res = store.record_detection_if_needed(
                        cam=cam,
                        detected_count=count,
                        max_confidence=max_conf,
                        jpeg_bytes=jpeg_bytes,
                    )
                    outcome = res["outcome"]
                    if outcome == "CREATED":
                        state.db_created += 1
                    elif outcome == "ESCALATED":
                        state.db_escalated += 1
                    else:
                        state.skipped_noop += 1

                    if res.get("written"):
                        event = {
                            "time": state.last_scan_at,
                            "outcome": outcome,
                            "reportCode": res.get("reportCode"),
                            "city": cam.city,
                            "camera": cam.name,
                            "detectedCount": count,
                            "maxConfidence": round(max_conf, 3),
                        }
                        state.recent_events.appendleft(event)
                        print(
                            f"[worker] DB WRITE ({outcome}) {res.get('reportCode')} | "
                            f"{cam.city} | {cam.name} | PKL={count} (conf={max_conf:.2f})"
                        )
            except Exception as exc:
                state.last_error = f"Error inferensi/DB di {cam.id}: {exc}"
                print(f"[worker] {state.last_error}")
            finally:
                del frame

        # Jaga penggunaan RAM tetap datar untuk operasi 24/7
        if state.frames_scanned > 0 and state.frames_scanned % 40 == 0:
            gc.collect()

        elapsed = time.monotonic() - loop_start
        sleep_time = max(0.2, FRAME_INTERVAL_SEC - elapsed)
        state.stop_event.wait(sleep_time)

    state.running = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    thread = threading.Thread(target=worker_loop, name="patra-hf-worker", daemon=True)
    thread.start()
    yield
    state.stop_event.set()
    thread.join(timeout=5.0)


app = FastAPI(title="PATRA 24/7 CCTV AI Worker", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "running": state.running,
        "started_at": state.started_at,
        "frame_interval_sec": FRAME_INTERVAL_SEC,
        "cameras_loaded": state.cameras_loaded,
        "frames_scanned": state.frames_scanned,
        "stream_failures": state.stream_failures,
        "db_created": state.db_created,
        "db_escalated": state.db_escalated,
        "skipped_zero": state.skipped_zero,
        "skipped_noop": state.skipped_noop,
        "last_camera": state.last_camera,
        "last_scan_at": state.last_scan_at,
        "last_error": state.last_error,
        "recent_events": list(state.recent_events),
    }


@app.get("/", response_class=HTMLResponse)
def status_page() -> str:
    rows = "".join(
        f"<tr><td>{e['time']}</td><td><b>{e['outcome']}</b></td><td>{e.get('reportCode','-')}</td>"
        f"<td>{e['city']}</td><td>{e['camera']}</td><td>{e['detectedCount']}</td></tr>"
        for e in state.recent_events
    ) or "<tr><td colspan='6'>Belum ada insiden PKL yang ditulis ke database pada sesi ini.</td></tr>"

    status_badge = "RUNNING 24/7" if state.running else "WAITING CONFIG / STOPPED"
    err_html = (
        f"<p style='color:#b91c1c;background:#fef2f2;padding:10px;border-radius:8px;'>{state.last_error}</p>"
        if state.last_error
        else ""
    )
    return f"""<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PATRA 24/7 CCTV AI Worker</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 960px; margin: 32px auto; padding: 0 16px; color: #0f172a; background: #f8fafc; }}
    .card {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }}
    .kpi {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }}
    .kpi small {{ color: #64748b; display: block; font-size: 11px; text-transform: uppercase; }}
    .kpi b {{ font-size: 22px; color: #043fa5; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    th, td {{ border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; }}
    th {{ color: #64748b; font-size: 11px; text-transform: uppercase; }}
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0 0 6px;">PATRA 24/7 CCTV AI Worker</h1>
    <p style="margin:0;color:#475569;font-size:14px;">Status: <b>{status_badge}</b> | Interval: <b>1 frame / {FRAME_INTERVAL_SEC} detik</b> | Terakhir: {state.last_camera or '-'}</p>
    {err_html}
  </div>
  <div class="card grid">
    <div class="kpi"><small>Kamera Aktif</small><b>{state.cameras_loaded}</b></div>
    <div class="kpi"><small>Frame Dipindai</small><b>{state.frames_scanned}</b></div>
    <div class="kpi"><small>Laporan Baru (DB)</small><b>{state.db_created}</b></div>
    <div class="kpi"><small>Eskalasi PKL (+)</small><b>{state.db_escalated}</b></div>
    <div class="kpi"><small>Skip 0-PKL / No-Op</small><b>{state.skipped_zero + state.skipped_noop}</b></div>
  </div>
  <div class="card">
    <h2 style="margin:0 0 12px;font-size:16px;">Insiden Terbaru Dikirim ke Database</h2>
    <table>
      <thead><tr><th>Waktu (UTC)</th><th>Aksi</th><th>Kode</th><th>Kota</th><th>Kamera</th><th>PKL</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
</body>
</html>"""
