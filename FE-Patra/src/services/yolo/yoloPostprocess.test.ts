import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidDetectionBox,
  parseYoloOutput,
} from './yoloPostprocess.ts';

function buildRawChannelsFirst(
  anchors: Array<{ cx: number; cy: number; bw: number; bh: number; score: number }>,
): Float32Array {
  const n = anchors.length;
  const buf = new Float32Array(5 * n);
  anchors.forEach((a, i) => {
    buf[i] = a.cx;
    buf[n + i] = a.cy;
    buf[2 * n + i] = a.bw;
    buf[3 * n + i] = a.bh;
    buf[4 * n + i] = a.score;
  });
  return buf;
}

test('parseYoloOutput Format B [1, 5, N] memproses NMS dan konversi letterbox dengan akurat', () => {
  // Simulasi video 1280x720 -> letterbox 640x640: scale=0.5, padX=0, padY=140
  const data = buildRawChannelsFirst([
    // Anchor 0 & 1 saling tumpang tindih (NMS harus mempertahankan yang 0.82)
    { cx: 160, cy: 320, bw: 128, bh: 72, score: 0.82 },
    { cx: 164, cy: 322, bw: 124, bh: 70, score: 0.65 },
    // Anchor 2 terpisah di sisi kanan
    { cx: 544, cy: 280, bw: 64, bh: 72, score: 0.44 },
  ]);

  const dets = parseYoloOutput(data, [1, 5, 3], 1280, 720, 0.5, 0, 140, 0.25, 0.45);
  assert.equal(dets.length, 2);
  assert.equal(dets[0]?.confidence, 0.82);
  assert.ok(Math.abs((dets[0]?.bboxNorm.x1 ?? 0) - 0.15) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.y1 ?? 0) - 0.4) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.x2 ?? 0) - 0.35) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.y2 ?? 0) - 0.6) < 1e-4);
  assert.equal(dets[1]?.confidence, 0.44);
});

test('parseYoloOutput Format A [1, N, 6] end-to-end memetakan kotak valid dengan benar', () => {
  // 640x640 tanpa padding (scale=1, padX=0, padY=0)
  const data = new Float32Array([
    128, 192, 256, 320, 0.76, 0,
  ]);
  const dets = parseYoloOutput(data, [1, 1, 6], 640, 640, 1, 0, 0, 0.25, 0.45);
  assert.equal(dets.length, 1);
  assert.equal(dets[0]?.confidence, 0.76);
  assert.deepEqual(dets[0]?.bboxNorm, { x1: 0.2, y1: 0.3, x2: 0.4, y2: 0.5 });
});

test('parseYoloOutput menolak kotak raksasa detect-everything di Format A dan Format B sambil menjaga objek valid', () => {
  // Reproduksi screenshot Malangsari: kotak raksasa x1=0.33..1.0, y1=0..1.0 (area 0.67 > 0.45)
  const rawB = buildRawChannelsFirst([
    { cx: 426, cy: 320, bw: 428, bh: 640, score: 0.34 }, // raksasa
    { cx: 448, cy: 256, bw: 96, bh: 96, score: 0.41 },   // valid 15%x15%
  ]);
  const detsB = parseYoloOutput(rawB, [1, 5, 2], 640, 640, 1, 0, 0, 0.25, 0.45);
  assert.equal(detsB.length, 1);
  assert.equal(detsB[0]?.confidence, 0.41);

  const rawA = new Float32Array([
    211, 0, 640, 640, 0.34, 0, // raksasa
    384, 192, 512, 320, 0.52, 0, // valid
  ]);
  const detsA = parseYoloOutput(rawA, [1, 2, 6], 640, 640, 1, 0, 0, 0.25, 0.45);
  assert.equal(detsA.length, 1);
  assert.equal(detsA[0]?.confidence, 0.52);
});

test('isValidDetectionBox dan parseYoloOutput menolak kotak strip memanjang (>85% dimensi) meskipun luas <= 45%', () => {
  // Lebar 20%, tinggi 95% -> area 0.19 <= 0.45, namun tinggi melebihi MAX_BOX_DIM_NORM (0.85)
  assert.equal(isValidDetectionBox({ x1: 0.1, y1: 0.02, x2: 0.3, y2: 0.97 }), false);
  // Lebar 90%, tinggi 10% -> lebar melebihi MAX_BOX_DIM_NORM
  assert.equal(isValidDetectionBox({ x1: 0.05, y1: 0.4, x2: 0.95, y2: 0.5 }), false);
  // Kotak wajar 25%x25% -> valid
  assert.equal(isValidDetectionBox({ x1: 0.2, y1: 0.3, x2: 0.45, y2: 0.55 }), true);

  const stripData = buildRawChannelsFirst([
    { cx: 128, cy: 320, bw: 128, bh: 608, score: 0.6 },
  ]);
  const dets = parseYoloOutput(stripData, [1, 5, 1], 640, 640, 1, 0, 0, 0.25, 0.45);
  assert.equal(dets.length, 0);
});

test('parseYoloOutput menangani noise terlalu kecil, skor di bawah threshold, NaN/Infinity, dan parameter tidak valid secara aman', () => {
  // Tiny noise < 0.005, low conf < 0.25, NaN
  const noisy = buildRawChannelsFirst([
    { cx: 100, cy: 100, bw: 2, bh: 2, score: 0.9 },
    { cx: 200, cy: 200, bw: 64, bh: 64, score: 0.24 },
    { cx: Number.NaN, cy: 200, bw: 64, bh: 64, score: 0.9 },
  ]);
  assert.deepEqual(parseYoloOutput(noisy, [1, 5, 3], 640, 640, 1, 0, 0, 0.25, 0.45), []);

  // Format A dengan NaN/Infinity
  const nanA = new Float32Array([100, 100, 200, 200, Number.POSITIVE_INFINITY, 0]);
  assert.deepEqual(parseYoloOutput(nanA, [1, 1, 6], 640, 640, 1, 0, 0, 0.25, 0.45), []);

  // Dimensi / scale invalid
  assert.deepEqual(parseYoloOutput(noisy, [1, 5, 3], 0, 640, 1, 0, 0, 0.25, 0.45), []);
  assert.deepEqual(parseYoloOutput(noisy, [1, 5, 3], 640, 640, 0, 0, 0, 0.25, 0.45), []);
  assert.deepEqual(parseYoloOutput(noisy, [1, 5], 640, 640, 1, 0, 0, 0.25, 0.45), []);
});

test('parseYoloOutput memetakan koordinat ROI-crop ke frame penuh lewat cropOffset', () => {
  // Frame 1280x720, crop ROI mulai (320, 180) ukuran 960x540 -> input 960x544: scale=1, padX=0, padY=2
  const data = buildRawChannelsFirst([{ cx: 480, cy: 272, bw: 96, bh: 54, score: 0.7 }]);
  const dets = parseYoloOutput(
    data, [1, 5, 1], 1280, 720, 1, 0, 2, 0.25, 0.45, undefined, { offX: 320, offY: 180 },
  );
  assert.equal(dets.length, 1);
  // Pusat crop (480, 270) + offset (320, 180) = (800, 450) di frame
  assert.ok(Math.abs((dets[0]?.bboxNorm.x1 ?? 0) - (800 - 48) / 1280) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.y1 ?? 0) - (450 - 27) / 720) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.x2 ?? 0) - (800 + 48) / 1280) < 1e-4);
  assert.ok(Math.abs((dets[0]?.bboxNorm.y2 ?? 0) - (450 + 27) / 720) < 1e-4);
});
