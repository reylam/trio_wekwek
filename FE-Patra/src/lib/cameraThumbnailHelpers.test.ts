import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isThumbnailFailureFresh,
  resolveThumbnailGrabStrategy,
  setBoundedCacheEntry,
} from './cameraThumbnailHelpers.ts';

test('resolveThumbnailGrabStrategy memilih mode CORS dan non-CORS fallback sesuai karakter kamera', () => {
  const normal = resolveThumbnailGrabStrategy(
    {
      playbackUrl: 'https://cctv.example.go.id/live/cam1/index.m3u8',
      streamUrl: 'https://cctv.example.go.id/raw/cam1.m3u8',
      streamType: 'hls',
      needsCorsProxy: false,
    },
    'https:',
  );
  assert.deepEqual(normal, {
    canGrab: true,
    startWithCors: true,
    sourceUrl: 'https://cctv.example.go.id/live/cam1/index.m3u8',
  });

  const corsProxyCam = resolveThumbnailGrabStrategy(
    {
      streamUrl: 'https://cctv.example.go.id/live/cam2/index.m3u8',
      streamType: 'hls',
      needsCorsProxy: true,
    },
    'http:',
  );
  assert.deepEqual(corsProxyCam, {
    canGrab: true,
    startWithCors: false,
    sourceUrl: 'https://cctv.example.go.id/live/cam2/index.m3u8',
  });
});

test('resolveThumbnailGrabStrategy menolak URL kosong, stream non-HLS, dan mixed-content HTTP di HTTPS', () => {
  assert.deepEqual(
    resolveThumbnailGrabStrategy(
      { streamUrl: '   ', streamType: 'hls' },
      'http:',
    ),
    { canGrab: false, reason: 'NO_SOURCE' },
  );

  assert.deepEqual(
    resolveThumbnailGrabStrategy(
      { streamUrl: 'https://cctv.example.go.id/feed.mp4', streamType: 'mp4' },
      'https:',
    ),
    { canGrab: false, reason: 'UNSUPPORTED_STREAM' },
  );

  assert.deepEqual(
    resolveThumbnailGrabStrategy(
      { streamUrl: 'http://103.10.10.10/live/cam.m3u8', streamType: 'hls' },
      'https:',
    ),
    { canGrab: false, reason: 'MIXED_CONTENT' },
  );
});

test('isThumbnailFailureFresh menghormati TTL dan menghapus entri kedaluwarsa atau korup', () => {
  const failed = new Map<string, number>();
  failed.set('cam-1', 1_000);
  failed.set('cam-nan', Number.NaN);
  failed.set('cam-future', 9_000);

  assert.equal(isThumbnailFailureFresh(failed, 'cam-1', 30_000, 60_000), true);
  assert.equal(isThumbnailFailureFresh(failed, 'cam-1', 61_000, 60_000), false);
  assert.equal(failed.has('cam-1'), false);

  assert.equal(isThumbnailFailureFresh(failed, 'cam-nan', 5_000, 60_000), false);
  assert.equal(failed.has('cam-nan'), false);

  assert.equal(isThumbnailFailureFresh(failed, 'cam-future', 5_000, 60_000), false);
  assert.equal(failed.has('cam-future'), false);
});

test('setBoundedCacheEntry membatasi ukuran cache dan mengeluarkan entri terlama', () => {
  const cache = new Map<string, string>();
  setBoundedCacheEntry(cache, 'a', '1', 2);
  setBoundedCacheEntry(cache, 'b', '2', 2);
  setBoundedCacheEntry(cache, 'a', '1-new', 2);
  setBoundedCacheEntry(cache, 'c', '3', 2);

  assert.deepEqual(Array.from(cache.entries()), [
    ['a', '1-new'],
    ['c', '3'],
  ]);
});
