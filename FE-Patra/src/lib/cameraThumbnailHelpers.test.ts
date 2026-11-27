import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCctvListUrl,
  clearSavedCctvListViewState,
  clearUnavailableCameras,
  consumeSavedCctvScrollY,
  getSavedCctvListViewState,
  getUnavailableCameraIdsSnapshot,
  isFatalHttpStatus,
  isThumbnailFailureFresh,
  markCameraUnavailable,
  paginateList,
  parseCctvListSearchParams,
  resolveCctvReturnPath,
  resolveHlsPlaybackUrl,
  resolveThumbnailGrabStrategy,
  sanitizeCctvPage,
  saveCctvListViewState,
  setBoundedCacheEntry,
  subscribeUnavailableCameras,
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

test('resolveHlsPlaybackUrl & resolveThumbnailGrabStrategy menangani CORS Magelang (restreamer proxy & dev.cctv CORS)', () => {
  const restreamer = resolveHlsPlaybackUrl(
    'https://restreamer.magelangkota.go.id/memfs/e87d2aad-61a2-464c-b49e-07734a664710.m3u8',
  );
  assert.deepEqual(restreamer, {
    url: '/hls-proxy/magelang-restreamer/memfs/e87d2aad-61a2-464c-b49e-07734a664710.m3u8',
    proxied: true,
    corsSafeHost: true,
  });

  const restreamerStrategy = resolveThumbnailGrabStrategy(
    {
      streamUrl:
        'https://restreamer.magelangkota.go.id/memfs/e87d2aad-61a2-464c-b49e-07734a664710.m3u8',
      streamType: 'hls',
      needsCorsProxy: true,
    },
    'https:',
  );
  assert.deepEqual(restreamerStrategy, {
    canGrab: true,
    startWithCors: true,
    sourceUrl: '/hls-proxy/magelang-restreamer/memfs/e87d2aad-61a2-464c-b49e-07734a664710.m3u8',
  });

  // dev.cctv.magelangkota.go.id mengirim ACAO: *, sehingga tetap mulai dengan CORS meski flag DB lama masih true
  const devMagelangStrategy = resolveThumbnailGrabStrategy(
    {
      streamUrl:
        'https://dev.cctv.magelangkota.go.id/memfs/8fb93fb3-cf14-4d29-8ec5-6ae8d56419df.m3u8',
      streamType: 'hls',
      needsCorsProxy: true,
    },
    'https:',
  );
  assert.deepEqual(devMagelangStrategy, {
    canGrab: true,
    startWithCors: true,
    sourceUrl:
      'https://dev.cctv.magelangkota.go.id/memfs/8fb93fb3-cf14-4d29-8ec5-6ae8d56419df.m3u8',
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

test('paginateList membagi 34 item menjadi 3 halaman @12 item serta menangani array kosong dan input di luar batas', () => {
  const cameras = Array.from({ length: 34 }, (_, idx) => `cam-${idx + 1}`);

  const p1 = paginateList(cameras, 1, 12);
  assert.equal(p1.currentPage, 1);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.totalItems, 34);
  assert.equal(p1.items.length, 12);
  assert.equal(p1.startIndex, 1);
  assert.equal(p1.endIndex, 12);

  const p3 = paginateList(cameras, 3, 12);
  assert.equal(p3.currentPage, 3);
  assert.equal(p3.items.length, 10);
  assert.equal(p3.startIndex, 25);
  assert.equal(p3.endIndex, 34);

  // Edge / failure cases: array kosong, halaman negatif/NaN/kelebihan, pageSize <= 0
  const empty = paginateList([], 2, 12);
  assert.deepEqual(empty, {
    items: [],
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    startIndex: 0,
    endIndex: 0,
  });

  const clampedHigh = paginateList(cameras, 99, 12);
  assert.equal(clampedHigh.currentPage, 3);

  const clampedLow = paginateList(cameras, -5, 12);
  assert.equal(clampedLow.currentPage, 1);

  const nanInputs = paginateList(cameras, Number.NaN, 0);
  assert.equal(nanInputs.currentPage, 1);
  assert.equal(nanInputs.totalPages, 34);
  assert.equal(nanInputs.items.length, 1);
});

test('isFatalHttpStatus dan store unavailableCameraIds menandai & membersihkan kamera 404/offline', () => {
  assert.equal(isFatalHttpStatus(404), true);
  assert.equal(isFatalHttpStatus(503), true);
  assert.equal(isFatalHttpStatus(200), false);
  assert.equal(isFatalHttpStatus(undefined), false);

  clearUnavailableCameras();
  let notifications = 0;
  const unsub = subscribeUnavailableCameras(() => {
    notifications += 1;
  });

  markCameraUnavailable('smg-dead-1');
  markCameraUnavailable('smg-dead-1'); // duplikat tidak memicu notifikasi ulang
  assert.equal(notifications, 1);
  assert.equal(getUnavailableCameraIdsSnapshot().has('smg-dead-1'), true);

  clearUnavailableCameras();
  assert.equal(notifications, 2);
  assert.equal(getUnavailableCameraIdsSnapshot().size, 0);
  unsub();
});

test('buildCctvListUrl dan parseCctvListSearchParams menjaga halaman serta filter dengan URL bersih', () => {
  assert.equal(
    buildCctvListUrl({ page: 1, searchQuery: '  ', selectedDistrict: '' }),
    '/satpol/cctv',
  );

  const url = buildCctvListUrl({
    page: 3,
    searchQuery: ' gerbang ',
    selectedDistrict: 'Tanah Abang',
  });
  assert.equal(url, '/satpol/cctv?page=3&q=gerbang&district=Tanah+Abang');

  const parsed = parseCctvListSearchParams(new URLSearchParams(url.split('?')[1]));
  assert.deepEqual(parsed, {
    hasParams: true,
    page: 3,
    searchQuery: 'gerbang',
    selectedDistrict: 'Tanah Abang',
  });

  const emptyParsed = parseCctvListSearchParams(new URLSearchParams());
  assert.deepEqual(emptyParsed, {
    hasParams: false,
    page: 1,
    searchQuery: '',
    selectedDistrict: '',
  });
});

test('saveCctvListViewState dan consumeSavedCctvScrollY memulihkan halaman dan scroll per wilayah', () => {
  clearSavedCctvListViewState();
  saveCctvListViewState({
    regionId: 'reg-jkp',
    page: 2,
    searchQuery: 'pasar',
    selectedDistrict: 'Menteng',
    scrollY: 642.6,
  });

  assert.deepEqual(getSavedCctvListViewState('reg-jkp'), {
    regionId: 'reg-jkp',
    page: 2,
    searchQuery: 'pasar',
    selectedDistrict: 'Menteng',
    scrollY: 643,
  });
  // Wilayah berbeda tidak boleh mewarisi halaman/scroll wilayah sebelumnya
  assert.equal(getSavedCctvListViewState('reg-smg'), null);

  // ScrollY dikonsumsi sekali lalu di-reset ke 0 agar navigasi berikutnya bersih
  assert.equal(consumeSavedCctvScrollY('reg-jkp'), 643);
  assert.equal(consumeSavedCctvScrollY('reg-jkp'), null);
  assert.equal(getSavedCctvListViewState('reg-jkp')?.page, 2);

  clearSavedCctvListViewState();
});

test('sanitizeCctvPage dan parseCctvListSearchParams menolak input halaman korup atau negatif', () => {
  for (const bad of ['abc', '-3', '0', 'NaN', '', null, undefined, Number.POSITIVE_INFINITY]) {
    assert.equal(sanitizeCctvPage(bad), 1);
  }
  assert.equal(sanitizeCctvPage('2.8'), 2);

  const parsedBad = parseCctvListSearchParams(new URLSearchParams('page=-9&q='));
  assert.deepEqual(parsedBad, {
    hasParams: true,
    page: 1,
    searchQuery: '',
    selectedDistrict: '',
  });
});

test('resolveCctvReturnPath menerima path CCTV yang sah dan menolak redirect berbahaya/luar rute', () => {
  const saved = {
    regionId: 'reg-jkp',
    page: 2,
    searchQuery: '',
    selectedDistrict: '',
    scrollY: 320,
  };

  assert.equal(
    resolveCctvReturnPath('/satpol/cctv?page=3&q=pasar', saved),
    '/satpol/cctv?page=3&q=pasar',
  );

  for (const unsafe of [
    'https://evil.com/phish',
    '//evil.com/satpol/cctv',
    '/satpol/laporan',
    'javascript:alert(1)',
    '/satpol/cctv#hash',
  ]) {
    assert.equal(resolveCctvReturnPath(unsafe, saved), '/satpol/cctv?page=2');
    assert.equal(resolveCctvReturnPath(unsafe, null), '/satpol/cctv');
  }
});
