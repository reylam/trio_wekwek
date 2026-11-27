import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearChunkRecoveryReloadFlag,
  importWithRetry,
  isChunkLoadError,
  triggerChunkRecoveryReload,
} from './lazyWithRetry.ts';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

test('isChunkLoadError mengenali variasi error dynamic import lintas browser', () => {
  assert.equal(
    isChunkLoadError(
      new TypeError(
        'Failed to fetch dynamically imported module: https://portal-patra.vercel.app/assets/PublicAboutPage-CcNgnuqx.js',
      ),
    ),
    true,
  );
  assert.equal(isChunkLoadError(new Error('Importing a module script failed.')), true);
  assert.equal(isChunkLoadError(new Error('Loading chunk 42 failed.')), true);
  assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/app.css')), true);
  assert.equal(isChunkLoadError(new Error('Validation failed: email invalid')), false);
  assert.equal(isChunkLoadError(null), false);
});

test('triggerChunkRecoveryReload mencegah infinite reload loop dalam guard window', () => {
  const storage = createMemoryStorage();
  let reloads = 0;
  let now = 100_000;

  const first = triggerChunkRecoveryReload({
    storage,
    now: () => now,
    reload: () => {
      reloads += 1;
    },
    guardWindowMs: 15_000,
  });
  assert.equal(first, true);
  assert.equal(reloads, 1);

  // Dalam rentang 15 detik tidak boleh reload lagi
  now += 5_000;
  const second = triggerChunkRecoveryReload({
    storage,
    now: () => now,
    reload: () => {
      reloads += 1;
    },
    guardWindowMs: 15_000,
  });
  assert.equal(second, false);
  assert.equal(reloads, 1);

  // Setelah guard window lewat (atau flag dibersihkan), boleh reload lagi
  clearChunkRecoveryReloadFlag(storage);
  const third = triggerChunkRecoveryReload({
    storage,
    now: () => now,
    reload: () => {
      reloads += 1;
    },
    guardWindowMs: 15_000,
  });
  assert.equal(third, true);
  assert.equal(reloads, 2);
});

test('importWithRetry mencoba ulang sekali saat gagal chunk lalu berhasil', async () => {
  let calls = 0;
  const result = await importWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError(
          'Failed to fetch dynamically imported module: /assets/PublicAboutPage-CcNgnuqx.js',
        );
      }
      return { default: 'OK' };
    },
    { retryDelayMs: 1, maxRetries: 1, storage: createMemoryStorage(), reload: () => {} },
  );

  assert.equal(calls, 2);
  assert.deepEqual(result, { default: 'OK' });
});

test('importWithRetry meneruskan error bila reload sudah pernah dipicu dalam guard window', async () => {
  const storage = createMemoryStorage();
  let now = 50_000;
  triggerChunkRecoveryReload({
    storage,
    now: () => now,
    reload: () => {},
    guardWindowMs: 15_000,
  });

  now += 1_000;
  await assert.rejects(
    () =>
      importWithRetry(
        async () => {
          throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
        },
        {
          retryDelayMs: 1,
          maxRetries: 1,
          storage,
          now: () => now,
          reload: () => {
            throw new Error('Tidak boleh reload ulang dalam guard window');
          },
        },
      ),
    /Failed to fetch dynamically imported module/i,
  );
});
