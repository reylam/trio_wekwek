"""Client Gemini Vision untuk menilai kualitas CCTV, mendeteksi PKL, dan membuat bounding box YOLO."""

from __future__ import annotations

import base64
import json
import re
import time
from dataclasses import asdict, dataclass
from typing import Any

import cv2
import numpy as np
import requests

from config import YOLO_CLASS_NAMES, resolve_class_id

GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)

SYSTEM_PROMPT = """Kamu adalah annotator dataset computer vision khusus CCTV jalanan Indonesia untuk deteksi Pedagang Kaki Lima (PKL).
Tugasmu pada setiap gambar CCTV:
1. Nilai apakah gambar CCTV ini BAGUS ("good") atau JELEK ("bad") untuk dijadikan dataset training YOLO deteksi PKL di trotoar/pinggir jalan.
   - "bad" jika: buram/pecah parah, terlalu gelap/silau, lensa berembun/kotor, kamera indoor/ruangan, layar error/no-signal, atau sudut pandang sama sekali tidak memperlihatkan jalan/trotoar (misal langit/tembok/pohon penuh).
   - "good" jika: gambar jalan/persimpangan/trotoar/pasar terlihat cukup jelas untuk mengenali objek PKL maupun kondisi jalan bersih.
2. Deteksi semua objek PKL yang tampak jelas di trotoar/bahu jalan/area publik menggunakan TEPAT salah satu dari 6 kelas berikut:
   - "Emperan": lapak/meja/hamparan dagangan di trotoar atau emperan toko
   - "Gerobak": gerobak dorong / gerobak jualan PKL (bakso, mie ayam, gorengan, kopi, dll)
   - "Panggul": pedagang keliling yang memikul/memanggul dagangan
   - "Payung": payung besar dagangan PKL (bukan payung pejalan kaki hujan)
   - "Sepeda-motor": sepeda motor yang jelas dipakai berjualan PKL (ada keranjang/kotak/box dagangan mangkal di pinggir jalan, BUKAN motor lalu lintas biasa yang lewat atau parkir biasa)
   - "Terpal": tenda/warung terpal PKL di trotoar atau pinggir jalan
3. JANGAN memberi label pada mobil, truk, angkot, motor lalu lintas biasa, pohon, tong sampah, tiang rambu, atau bangunan toko permanen.
4. Untuk setiap objek PKL yang ditemukan, berikan koordinat bounding box `box_2d` dalam format standar Gemini: [ymin, xmin, ymax, xmax] bilangan bulat rentang 0 sampai 1000 (relatif terhadap tinggi & lebar gambar).

Balas HANYA dalam JSON valid tanpa markdown fence, persis mengikuti struktur berikut:
{
  "camera_quality": "good" atau "bad",
  "quality_reason": "alasan singkat bahasa Indonesia",
  "scene_summary": "deskripsi 1 kalimat kondisi jalan/trotoar",
  "has_pkl": true atau false,
  "detections": [
    {
      "label": "Gerobak",
      "confidence": 0.88,
      "box_2d": [ymin, xmin, ymax, xmax],
      "note": "deskripsi singkat objek"
    }
  ]
}
Jika tidak ada PKL, set "has_pkl": false dan "detections": []."""


@dataclass
class YoloDetection:
    class_id: int
    class_name: str
    confidence: float
    cx: float
    cy: float
    w: float
    h: float
    box_2d: list[int]
    note: str = ""

    def to_yolo_line(self) -> str:
        return f"{self.class_id} {self.cx:.6f} {self.cy:.6f} {self.w:.6f} {self.h:.6f}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class GeminiAnalysisResult:
    model_used: str
    camera_quality: str  # "good" | "bad"
    quality_reason: str
    scene_summary: str
    has_pkl: bool
    detections: list[YoloDetection]
    raw_text: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_used": self.model_used,
            "camera_quality": self.camera_quality,
            "quality_reason": self.quality_reason,
            "scene_summary": self.scene_summary,
            "has_pkl": self.has_pkl,
            "detections": [d.to_dict() for d in self.detections],
        }


def box2d_to_yolo(
    box_2d: list[Any],
    min_side: float = 0.008,
) -> tuple[float, float, float, float, list[int]] | None:
    """Konversi box_2d [ymin, xmin, ymax, xmax] (0..1000) menjadi (cx, cy, w, h) ternormalisasi (0..1)."""
    if not isinstance(box_2d, (list, tuple)) or len(box_2d) != 4:
        return None
    try:
        ymin, xmin, ymax, xmax = [float(v) for v in box_2d]
    except (TypeError, ValueError):
        return None

    # Jika model terlanjur mengirim skala 0..1, skalakan ke 0..1000
    if max(abs(ymin), abs(xmin), abs(ymax), abs(xmax)) <= 1.05:
        ymin, xmin, ymax, xmax = ymin * 1000.0, xmin * 1000.0, ymax * 1000.0, xmax * 1000.0

    ymin = max(0.0, min(1000.0, ymin))
    xmin = max(0.0, min(1000.0, xmin))
    ymax = max(0.0, min(1000.0, ymax))
    xmax = max(0.0, min(1000.0, xmax))

    if ymax <= ymin or xmax <= xmin:
        return None

    w = (xmax - xmin) / 1000.0
    h = (ymax - ymin) / 1000.0
    if w < min_side or h < min_side:
        return None

    cx = (xmin + xmax) / 2000.0
    cy = (ymin + ymax) / 2000.0
    clamped_box = [int(round(ymin)), int(round(xmin)), int(round(ymax)), int(round(xmax))]
    return cx, cy, w, h, clamped_box


def extract_json_object(text: str) -> dict[str, Any]:
    """Ekstrak objek JSON pertama dari teks respons Gemini (tahan terhadap markdown fence)."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Respons JSON Gemini bukan object")
    return parsed


def parse_gemini_response(
    raw_text: str,
    model_used: str,
    min_conf: float = 0.45,
    single_class: bool = False,
) -> GeminiAnalysisResult:
    data = extract_json_object(raw_text)

    quality_raw = str(data.get("camera_quality", "good")).strip().lower()
    camera_quality = "bad" if quality_raw in {"bad", "jelek", "poor", "unusable"} else "good"
    quality_reason = str(data.get("quality_reason", "")).strip() or (
        "Layak untuk dataset" if camera_quality == "good" else "Tidak layak untuk dataset"
    )
    scene_summary = str(data.get("scene_summary", "")).strip()

    detections: list[YoloDetection] = []
    raw_dets = data.get("detections", [])
    if isinstance(raw_dets, list):
        for item in raw_dets:
            if not isinstance(item, dict):
                continue
            label_raw = str(item.get("label", "")).strip()
            class_id = resolve_class_id(label_raw, single_class=single_class)
            if class_id is None:
                continue
            try:
                conf = float(item.get("confidence", 0.75))
            except (TypeError, ValueError):
                conf = 0.75
            conf = max(0.0, min(1.0, conf))
            if conf < min_conf:
                continue

            converted = box2d_to_yolo(item.get("box_2d"))
            if converted is None:
                continue
            cx, cy, w, h, clamped_box = converted
            class_name = "PKL" if single_class else YOLO_CLASS_NAMES[class_id]
            detections.append(
                YoloDetection(
                    class_id=class_id,
                    class_name=class_name,
                    confidence=round(conf, 3),
                    cx=round(cx, 6),
                    cy=round(cy, 6),
                    w=round(w, 6),
                    h=round(h, 6),
                    box_2d=clamped_box,
                    note=str(item.get("note", "")).strip(),
                )
            )

    has_pkl = bool(detections)
    return GeminiAnalysisResult(
        model_used=model_used,
        camera_quality=camera_quality,
        quality_reason=quality_reason,
        scene_summary=scene_summary,
        has_pkl=has_pkl,
        detections=detections,
        raw_text=raw_text,
    )


def encode_frame_for_gemini(frame: np.ndarray, max_width: int = 1024, quality: int = 85) -> str:
    """Resize ringan & encode BGR frame ke base64 JPEG agar hemat bandwidth tanpa kehilangan detail PKL."""
    h, w = frame.shape[:2]
    if w > max_width:
        scale = max_width / float(w)
        resized = cv2.resize(frame, (max_width, max(1, int(round(h * scale)))), interpolation=cv2.INTER_AREA)
    else:
        resized = frame
    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Gagal encode frame JPEG untuk Gemini")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def analyze_frame_with_gemini(
    frame: np.ndarray,
    api_key: str,
    model_chain: list[str],
    camera_meta: dict[str, Any] | None = None,
    min_conf: float = 0.45,
    single_class: bool = False,
    timeout_sec: int = 35,
) -> GeminiAnalysisResult:
    """Kirim frame ke Gemini Vision dengan auto-fallback antar model jika terjadi 429/503/timeout."""
    img_b64 = encode_frame_for_gemini(frame)
    cam_hint = ""
    if camera_meta:
        cam_hint = (
            f"\nKonteks lokasi kamera: {camera_meta.get('name', '-')} "
            f"({camera_meta.get('city', '-')}, {camera_meta.get('facility_category', 'Jalan Umum')})."
        )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": SYSTEM_PROMPT + cam_hint},
                    {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    last_error: str = "Tidak ada model yang dicoba"
    for model in model_chain:
        url = GEMINI_ENDPOINT_TEMPLATE.format(model=model)
        for attempt in range(2):
            try:
                resp = requests.post(
                    url,
                    params={"key": api_key},
                    json=payload,
                    timeout=timeout_sec,
                )
            except requests.RequestException as exc:
                last_error = f"{model} network/timeout error: {exc}"
                break

            if resp.status_code == 200:
                body = resp.json()
                candidates = body.get("candidates") or []
                if not candidates:
                    last_error = f"{model} mengembalikan candidates kosong"
                    break
                parts = (candidates[0].get("content") or {}).get("parts") or []
                raw_text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict))
                if not raw_text.strip():
                    last_error = f"{model} mengembalikan teks kosong"
                    break
                return parse_gemini_response(
                    raw_text=raw_text,
                    model_used=model,
                    min_conf=min_conf,
                    single_class=single_class,
                )

            if resp.status_code in (429, 500, 503):
                last_error = f"{model} HTTP {resp.status_code}: {resp.text[:180]}"
                if attempt == 0:
                    time.sleep(1.5)
                    continue
                break

            # Error permanen untuk model ini (misal 404/400) -> lanjut fallback model berikutnya
            last_error = f"{model} HTTP {resp.status_code}: {resp.text[:180]}"
            break

    raise RuntimeError(f"Semua model Gemini gagal merespons. Error terakhir: {last_error}")
