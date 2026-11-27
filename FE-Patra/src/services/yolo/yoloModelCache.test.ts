import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidModelDim,
  parseModelSidecarMeta,
  resolveModelFetchPlan,
  sanitizeModelVersion,
} from './yoloModelCache.ts';

test('resolveModelFetchPlan menggunakan URL berversi dengan force-cache bila versi valid tersedia', () => {
  const plan = resolveModelFetchPlan('/models/best.onnx', '14bbd3d24aa1');
  assert.deepEqual(plan, {
    url: '/models/best.onnx?v=14bbd3d24aa1',
    cache: 'force-cache',
  });

  const otherPlan = resolveModelFetchPlan('/models/best.onnx', 'deadbeef1234');
  assert.notEqual(otherPlan.url, plan.url);

  const withQuery = resolveModelFetchPlan('/models/best.onnx?foo=1', 'v6.0-rc1');
  assert.deepEqual(withQuery, {
    url: '/models/best.onnx?foo=1&v=v6.0-rc1',
    cache: 'force-cache',
  });
});

test('resolveModelFetchPlan fallback ke no-cache bila version kosong, null, atau bukan string', () => {
  for (const emptyVersion of [undefined, null, '', '   ', 12345, {}]) {
    assert.deepEqual(resolveModelFetchPlan('/models/best.onnx', emptyVersion), {
      url: '/models/best.onnx',
      cache: 'no-cache',
    });
  }
});

test('resolveModelFetchPlan dan sanitizeModelVersion menolak token versi berbahaya atau terlalu pendek', () => {
  for (const badVersion of ['v1&evil=1', '../bad', 'a b', 'ab', 'ver/1']) {
    assert.equal(sanitizeModelVersion(badVersion), null);
    assert.deepEqual(resolveModelFetchPlan('/models/best.onnx', badVersion), {
      url: '/models/best.onnx',
      cache: 'no-cache',
    });
  }
});

test('parseModelSidecarMeta memvalidasi dimensi kelipatan 32 dan menolak payload korup', () => {
  assert.deepEqual(
    parseModelSidecarMeta({
      input: { height: 544, width: 960 },
      version: '14bbd3d24aa1',
    }),
    {
      dims: { w: 960, h: 544 },
      version: '14bbd3d24aa1',
    },
  );

  // Dimensi bukan kelipatan 32 / negatif / 0 ditolak
  assert.deepEqual(
    parseModelSidecarMeta({
      input: { height: 545, width: 960 },
      version: '14bbd3d24aa1',
    }),
    { dims: null, version: '14bbd3d24aa1' },
  );
  assert.deepEqual(
    parseModelSidecarMeta({
      input: { height: 0, width: -32 },
      version: 'bad version!',
    }),
    { dims: null, version: null },
  );
  assert.equal(isValidModelDim(640), true);
  assert.equal(isValidModelDim(544), true);
  assert.equal(isValidModelDim(641), false);
  assert.deepEqual(parseModelSidecarMeta(null), { dims: null, version: null });
  assert.deepEqual(parseModelSidecarMeta('invalid'), { dims: null, version: null });
});
