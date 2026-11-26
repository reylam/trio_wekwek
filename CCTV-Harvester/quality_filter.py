"""Filter kualitas frame CCTV otomatis (OpenCV) sebelum dikirim ke Gemini."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import cv2
import numpy as np

from config import (
    MAX_BRIGHTNESS,
    MIN_BRIGHTNESS,
    MIN_HEIGHT,
    MIN_LAPLACIAN_VAR,
    MIN_STD_CONTRAST,
    MIN_WIDTH,
)


@dataclass
class FrameQualityResult:
    is_good: bool
    category: str  # "good" | "low_res" | "dark_or_blank" | "overexposed" | "blurry"
    reason: str
    width: int
    height: int
    brightness: float
    contrast_std: float
    sharpness_laplacian: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def assess_frame_quality(frame: np.ndarray) -> FrameQualityResult:
    """Nilai apakah frame CCTV cukup tajam, terang, dan layak untuk dataset."""
    if frame is None or frame.size == 0 or frame.ndim < 2:
        return FrameQualityResult(
            is_good=False,
            category="dark_or_blank",
            reason="Frame kosong atau korup",
            width=0,
            height=0,
            brightness=0.0,
            contrast_std=0.0,
            sharpness_laplacian=0.0,
        )

    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    brightness = float(np.mean(gray))
    contrast_std = float(np.std(gray))

    # Hitung ketajaman pada skala seragam 640px agar skor konsisten antar resolusi
    if w > 640:
        scale = 640.0 / float(w)
        gray_norm = cv2.resize(
            gray,
            (640, max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        gray_norm = gray

    sharpness = float(cv2.Laplacian(gray_norm, cv2.CV_64F).var())

    if w < MIN_WIDTH or h < MIN_HEIGHT:
        return FrameQualityResult(
            is_good=False,
            category="low_res",
            reason=f"Resolusi terlalu rendah ({w}x{h}, minimal {MIN_WIDTH}x{MIN_HEIGHT})",
            width=w,
            height=h,
            brightness=round(brightness, 2),
            contrast_std=round(contrast_std, 2),
            sharpness_laplacian=round(sharpness, 2),
        )

    if contrast_std < MIN_STD_CONTRAST:
        return FrameQualityResult(
            is_good=False,
            category="dark_or_blank",
            reason=f"Layar polos/error/statis (kontras std={contrast_std:.1f} < {MIN_STD_CONTRAST})",
            width=w,
            height=h,
            brightness=round(brightness, 2),
            contrast_std=round(contrast_std, 2),
            sharpness_laplacian=round(sharpness, 2),
        )

    if brightness < MIN_BRIGHTNESS:
        return FrameQualityResult(
            is_good=False,
            category="dark_or_blank",
            reason=f"Terlalu gelap untuk pelabelan (brightness={brightness:.1f} < {MIN_BRIGHTNESS})",
            width=w,
            height=h,
            brightness=round(brightness, 2),
            contrast_std=round(contrast_std, 2),
            sharpness_laplacian=round(sharpness, 2),
        )

    if brightness > MAX_BRIGHTNESS:
        return FrameQualityResult(
            is_good=False,
            category="overexposed",
            reason=f"Terlalu silau/putih (brightness={brightness:.1f} > {MAX_BRIGHTNESS})",
            width=w,
            height=h,
            brightness=round(brightness, 2),
            contrast_std=round(contrast_std, 2),
            sharpness_laplacian=round(sharpness, 2),
        )

    if sharpness < MIN_LAPLACIAN_VAR:
        return FrameQualityResult(
            is_good=False,
            category="blurry",
            reason=f"Gambar buram/pecah (Laplacian={sharpness:.1f} < {MIN_LAPLACIAN_VAR})",
            width=w,
            height=h,
            brightness=round(brightness, 2),
            contrast_std=round(contrast_std, 2),
            sharpness_laplacian=round(sharpness, 2),
        )

    return FrameQualityResult(
        is_good=True,
        category="good",
        reason="Layak (resolusi, pencahayaan, dan ketajaman memenuhi standar dataset)",
        width=w,
        height=h,
        brightness=round(brightness, 2),
        contrast_std=round(contrast_std, 2),
        sharpness_laplacian=round(sharpness, 2),
    )
