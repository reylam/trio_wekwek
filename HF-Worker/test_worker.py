"""Unit test untuk detector ONNX, filter ROI poligon, dan logika hemat tulis DB."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import numpy as np

from db_writer import decide_write_action, generate_report_code, point_in_geo_polygon
from detector import decode_onnx_output, filter_detections_by_roi


class TestHfWorker(unittest.TestCase):
    def test_decode_end2end_and_roi_filter(self) -> None:
        # 2 deteksi: satu di bawah (dalam ROI), satu di atas (luar ROI)
        raw = np.zeros((1, 2, 6), dtype=np.float32)
        raw[0, 0] = [100, 400, 200, 560, 0.88, 0]  # bottom-center y ~ 560/640 = 0.875 (dalam ROI)
        raw[0, 1] = [100, 50, 200, 150, 0.91, 0]   # bottom-center y ~ 150/640 = 0.234 (luar ROI)

        dets = decode_onnx_output(raw, orig_w=640, orig_h=640, scale=1.0, pad_left=0, pad_top=0, conf_thresh=0.30)
        self.assertEqual(len(dets), 2)

        roi = [[0.0, 0.5], [1.0, 0.5], [1.0, 1.0], [0.0, 1.0]]
        inside = filter_detections_by_roi(dets, 640, 640, roi)
        self.assertEqual(len(inside), 1)
        self.assertAlmostEqual(inside[0].score, 0.88, places=2)

    def test_decide_write_action_only_writes_on_new_or_increase(self) -> None:
        now = datetime.now(timezone.utc)
        self.assertEqual(decide_write_action(0, None, None, 30, now), "SKIP_ZERO")
        self.assertEqual(decide_write_action(2, None, None, 30, now), "CREATE")

        # Cooldown pasca penindakan aktif
        recent_action = now - timedelta(seconds=10)
        self.assertEqual(decide_write_action(2, None, recent_action, 30, now), "COOLDOWN_SKIP")

        # Sudah ada laporan aktif dengan 2 PKL
        active = {"id": "rep-1", "reportCode": "PTR-202611-ABCDE", "detectedCount": 2}
        self.assertEqual(decide_write_action(2, active, None, 30, now), "MERGED_NOOP")
        self.assertEqual(decide_write_action(1, active, None, 30, now), "MERGED_NOOP")
        # Jumlah PKL bertambah 2 -> 3: baru tulis eskalasi!
        self.assertEqual(decide_write_action(3, active, None, 30, now), "ESCALATE")

    def test_geo_polygon_and_report_code(self) -> None:
        code = generate_report_code()
        self.assertRegex(code, r"^PTR-\d{6}-[A-Z2-9]{5}$")

        zone = [[110.42, -6.99], [110.43, -6.99], [110.43, -6.98], [110.42, -6.98]]
        self.assertTrue(point_in_geo_polygon(-6.985, 110.425, zone))
        self.assertFalse(point_in_geo_polygon(-6.970, 110.425, zone))


if __name__ == "__main__":
    unittest.main()
