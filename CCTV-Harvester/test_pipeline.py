"""Unit test untuk filter kualitas CCTV dan konversi label Gemini -> YOLO."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from capture_roi_loop import apply_roi_to_frame, parse_manual_roi, select_round_cameras
from gemini_labeler import box2d_to_yolo, parse_gemini_response
from label_with_gemini import build_roboflow_coco, export_labeled_record
from quality_filter import assess_frame_quality


class TestCctvHarvester(unittest.TestCase):
    def test_quality_filter_rejects_dark_and_low_res(self) -> None:
        dark = np.zeros((480, 640, 3), dtype=np.uint8)
        res_dark = assess_frame_quality(dark)
        self.assertFalse(res_dark.is_good)
        self.assertEqual(res_dark.category, "dark_or_blank")

        tiny = np.random.default_rng(42).integers(0, 255, (180, 320, 3), dtype=np.uint8)
        res_tiny = assess_frame_quality(tiny)
        self.assertFalse(res_tiny.is_good)
        self.assertEqual(res_tiny.category, "low_res")

    def test_quality_filter_accepts_sharp_frame(self) -> None:
        rng = np.random.default_rng(7)
        sharp = rng.integers(40, 215, (720, 1280, 3), dtype=np.uint8)
        res = assess_frame_quality(sharp)
        self.assertTrue(res.is_good)
        self.assertEqual(res.category, "good")

    def test_box2d_to_yolo_conversion(self) -> None:
        conv = box2d_to_yolo([200, 100, 600, 500])
        self.assertIsNotNone(conv)
        cx, cy, w, h, clamped = conv  # type: ignore[misc]
        self.assertAlmostEqual(cx, 0.3, places=4)
        self.assertAlmostEqual(cy, 0.4, places=4)
        self.assertAlmostEqual(w, 0.4, places=4)
        self.assertAlmostEqual(h, 0.4, places=4)
        self.assertEqual(clamped, [200, 100, 600, 500])

        # Box terbalik atau terlalu kecil harus ditolak
        self.assertIsNone(box2d_to_yolo([600, 100, 200, 500]))
        self.assertIsNone(box2d_to_yolo([100, 100, 102, 102]))

    def test_parse_gemini_response_with_fence_and_aliases(self) -> None:
        raw = """```json
        {
          "camera_quality": "good",
          "quality_reason": "Jalan dan trotoar tampak jelas",
          "scene_summary": "Terlihat gerobak dan tenda terpal di sisi kiri jalan",
          "has_pkl": true,
          "detections": [
            {"label": "Gerobak", "confidence": 0.91, "box_2d": [500, 200, 750, 400], "note": "gerobak bakso"},
            {"label": "Tenda PKL", "confidence": 0.80, "box_2d": [450, 500, 700, 800], "note": "terpal biru"},
            {"label": "Mobil", "confidence": 0.95, "box_2d": [300, 100, 500, 300], "note": "harus diabaikan"},
            {"label": "Payung", "confidence": 0.20, "box_2d": [100, 100, 200, 200], "note": "conf rendah"}
          ]
        }
        ```"""
        parsed = parse_gemini_response(raw, model_used="gemini-3.5-flash-lite", min_conf=0.45)
        self.assertEqual(parsed.camera_quality, "good")
        self.assertTrue(parsed.has_pkl)
        self.assertEqual(len(parsed.detections), 2)
        self.assertEqual(parsed.detections[0].class_id, 1)  # Gerobak
        self.assertEqual(parsed.detections[1].class_id, 5)  # Terpal via alias Tenda PKL
        self.assertTrue(parsed.detections[0].to_yolo_line().startswith("1 0.300000 0.625000"))

    def test_roi_crop_and_roboflow_coco_export(self) -> None:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        roi = parse_manual_roi("0.1,0.5,0.9,1.0")
        cropped, info = apply_roi_to_frame(frame, roi, mode="crop", margin_ratio=0.0)
        self.assertTrue(info["applied"])
        self.assertEqual(cropped.shape[0], 360)
        self.assertEqual(cropped.shape[1], 1024)

        coco = build_roboflow_coco(
            [
                {
                    "file_name": "sample.jpg",
                    "width": 1000,
                    "height": 500,
                    "detections": [
                        {"class_id": 1, "cx": 0.5, "cy": 0.5, "w": 0.2, "h": 0.4}
                    ],
                }
            ],
            single_class=False,
        )
        self.assertEqual(len(coco["categories"]), 6)
        self.assertEqual(len(coco["images"]), 1)
        self.assertEqual(coco["annotations"][0]["bbox"], [400.0, 150.0, 200.0, 200.0])

    def test_select_round_cameras_rotates_and_skips_bad(self) -> None:
        cams = [{"id": f"cam-{i}"} for i in range(1, 6)]

        b1, cur1 = select_round_cameras(cams, max_cameras=2, start_cursor=0)
        self.assertEqual([c["id"] for c in b1], ["cam-1", "cam-2"])
        self.assertEqual(cur1, 2)

        b2, cur2 = select_round_cameras(cams, max_cameras=2, start_cursor=cur1)
        self.assertEqual([c["id"] for c in b2], ["cam-3", "cam-4"])
        self.assertEqual(cur2, 4)

        b3, cur3 = select_round_cameras(cams, max_cameras=2, start_cursor=cur2)
        self.assertEqual([c["id"] for c in b3], ["cam-5", "cam-1"])
        self.assertEqual(cur3, 1)

        # Skip known bad cameras
        b_skip, cur_skip = select_round_cameras(
            cams, max_cameras=2, start_cursor=0, skip_ids={"cam-2"}
        )
        self.assertEqual([c["id"] for c in b_skip], ["cam-1", "cam-3"])
        self.assertEqual(cur_skip, 2)

        # Edge cases: empty list, max_cameras <= 0, all skipped, rotate=False
        self.assertEqual(select_round_cameras([], max_cameras=5), ([], 0))
        self.assertEqual(select_round_cameras(cams, max_cameras=0), ([], 0))
        self.assertEqual(
            select_round_cameras(cams, max_cameras=2, skip_ids={f"cam-{i}" for i in range(1, 6)}),
            ([], 0),
        )
        no_rot, cur_no_rot = select_round_cameras(cams, max_cameras=2, start_cursor=3, rotate=False)
        self.assertEqual([c["id"] for c in no_rot], ["cam-1", "cam-2"])
        self.assertEqual(cur_no_rot, 0)

    def test_export_labeled_record_pkl_only_and_edge_cases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out_dir = root / "dataset_pkl"
            neg_dir = root / "dataset_negatif_bersih"
            frame = np.full((120, 200, 3), 128, dtype=np.uint8)
            img_path = root / "cam_pkl.jpg"
            cv2.imwrite(str(img_path), frame)

            pkl_record = {
                "camera_quality": "good",
                "detections": [
                    {
                        "class_id": 1,
                        "class_name": "Gerobak",
                        "confidence": 0.92,
                        "cx": 0.5,
                        "cy": 0.5,
                        "w": 0.3,
                        "h": 0.4,
                    }
                ],
            }

            # Normal case: PKL detected -> image, label, preview saved to dataset_pkl
            res1 = export_labeled_record(
                img_path,
                frame,
                pkl_record,
                out_dir,
                neg_dir=neg_dir,
                include_empty=True,
                overwrite_preview=True,
            )
            self.assertEqual(res1, "pkl")
            self.assertTrue((out_dir / "images" / "cam_pkl.jpg").exists())
            self.assertTrue((out_dir / "labels" / "cam_pkl.txt").exists())
            prev_path = out_dir / "previews" / "cam_pkl.jpg"
            self.assertTrue(prev_path.exists())
            vis = cv2.imread(str(prev_path))
            self.assertIsNotNone(vis)
            self.assertEqual(vis.shape[0], 150)  # 120px frame + 30px status banner

            # Idempotent re-run & missing preview recovery on resume
            prev_path.unlink()
            res2 = export_labeled_record(
                img_path,
                frame,
                pkl_record,
                out_dir,
                neg_dir=neg_dir,
                overwrite_preview=False,
            )
            self.assertEqual(res2, "pkl")
            self.assertTrue(prev_path.exists())
            self.assertEqual(len(list((out_dir / "images").iterdir())), 1)

            # Edge case 1: 0-PKL good frame must NEVER enter dataset_pkl/previews
            empty_path = root / "cam_empty.jpg"
            cv2.imwrite(str(empty_path), frame)
            empty_record = {"camera_quality": "good", "detections": []}
            self.assertEqual(
                export_labeled_record(empty_path, frame, empty_record, out_dir, neg_dir=neg_dir, include_empty=False),
                "empty",
            )
            self.assertFalse((out_dir / "previews" / "cam_empty.jpg").exists())
            self.assertFalse((neg_dir / "images" / "cam_empty.jpg").exists())

            self.assertEqual(
                export_labeled_record(empty_path, frame, empty_record, out_dir, neg_dir=neg_dir, include_empty=True),
                "empty",
            )
            self.assertFalse((out_dir / "images" / "cam_empty.jpg").exists())
            self.assertFalse((out_dir / "previews" / "cam_empty.jpg").exists())
            self.assertTrue((neg_dir / "images" / "cam_empty.jpg").exists())
            self.assertTrue((neg_dir / "labels" / "cam_empty.txt").exists())

            # Edge case 2: bad quality frame writes nothing anywhere
            bad_path = root / "cam_bad.jpg"
            cv2.imwrite(str(bad_path), frame)
            bad_record = {"camera_quality": "bad", "detections": pkl_record["detections"]}
            self.assertEqual(
                export_labeled_record(bad_path, frame, bad_record, out_dir, neg_dir=neg_dir, include_empty=True),
                "bad",
            )
            self.assertFalse((out_dir / "images" / "cam_bad.jpg").exists())
            self.assertFalse((out_dir / "previews" / "cam_bad.jpg").exists())
            self.assertFalse((neg_dir / "images" / "cam_bad.jpg").exists())


if __name__ == "__main__":
    unittest.main()
