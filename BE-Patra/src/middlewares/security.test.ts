import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import errorHandler from './errorHandler.js';
import { isOriginAllowed, normalizeOrigin } from '../config/config.js';
import { createRateLimiter, extractClientIp, securityHeaders } from './security.js';
import photoUpload, {
  detectImageMimeFromMagicBytes,
  validateImageMagicBytes,
} from './upload.js';

async function withServer(
  setup: (app: express.Express) => void,
  fn: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  setup(app);
  app.use(errorHandler);

  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

test('detectImageMimeFromMagicBytes menerima JPEG, PNG, WebP valid dan menolak buffer palsu/korup', () => {
  assert.equal(
    detectImageMimeFromMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    'image/jpeg',
  );
  assert.equal(
    detectImageMimeFromMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png',
  );
  assert.equal(
    detectImageMimeFromMagicBytes(
      Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]),
    ),
    'image/webp',
  );

  // Edge / failure cases: HTML spoofed payload, truncated buffer
  assert.equal(detectImageMimeFromMagicBytes(Buffer.from('<html>not image</html>')), null);
  assert.equal(detectImageMimeFromMagicBytes(Buffer.from([0xff, 0xd8])), null);
  assert.equal(detectImageMimeFromMagicBytes(Buffer.alloc(0)), null);
});

test('validateImageMagicBytes menerima gambar valid dan menolak file HTML/teks yang menyamar sebagai image/jpeg', async () => {
  await withServer(
    (app) => {
      app.post(
        '/upload-test',
        photoUpload.single('snapshot'),
        validateImageMagicBytes,
        (_req, res) => res.json({ ok: true }),
      );
    },
    async (baseUrl) => {
      // Valid JPEG
      const validForm = new FormData();
      validForm.append(
        'snapshot',
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' }),
        'valid.jpg',
      );
      const okRes = await fetch(`${baseUrl}/upload-test`, { method: 'POST', body: validForm });
      assert.equal(okRes.status, 200);

      // Spoofed MIME header (text/html disguised as image/jpeg) -> 400 INVALID_FILE_TYPE
      const spoofForm = new FormData();
      spoofForm.append(
        'snapshot',
        new Blob(['<!doctype html><script>alert(1)</script>'], { type: 'image/jpeg' }),
        'fake.jpg',
      );
      const spoofRes = await fetch(`${baseUrl}/upload-test`, { method: 'POST', body: spoofForm });
      assert.equal(spoofRes.status, 400);
      assert.equal(((await spoofRes.json()) as any).error.code, 'INVALID_FILE_TYPE');

      // Truncated 2-byte file -> 400 INVALID_FILE_TYPE
      const shortForm = new FormData();
      shortForm.append(
        'snapshot',
        new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }),
        'short.jpg',
      );
      const shortRes = await fetch(`${baseUrl}/upload-test`, { method: 'POST', body: shortForm });
      assert.equal(shortRes.status, 400);
      assert.equal(((await shortRes.json()) as any).error.code, 'INVALID_FILE_TYPE');
    },
  );
});

test('createRateLimiter membatasi burst request, mengatur header, pulih setelah window, dan menjaga batas maxBuckets', async () => {
  let clockMs = 1_000_000;

  await withServer(
    (app) => {
      app.use(securityHeaders);
      app.use(express.json({ limit: '100kb' }));
      app.get(
        '/limited',
        createRateLimiter({
          windowMs: 10_000,
          maxRequests: 2,
          keyPrefix: 'test-rl',
          maxBuckets: 10,
          now: () => clockMs,
        }),
        (req, res) => res.json({ ok: true, ip: extractClientIp(req) }),
      );
      app.post('/json-test', (_req, res) => res.json({ ok: true }));
    },
    async (baseUrl) => {
      const r1 = await fetch(`${baseUrl}/limited`, {
        headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      });
      assert.equal(r1.status, 200);
      assert.equal(r1.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r1.headers.get('x-frame-options'), 'DENY');
      assert.equal(r1.headers.get('x-powered-by'), null);
      assert.equal(r1.headers.get('x-ratelimit-limit'), '2');
      assert.equal(r1.headers.get('x-ratelimit-remaining'), '1');
      assert.equal(((await r1.json()) as any).ip, '203.0.113.5');

      const r2 = await fetch(`${baseUrl}/limited`, {
        headers: { 'x-forwarded-for': '203.0.113.5' },
      });
      assert.equal(r2.status, 200);
      assert.equal(r2.headers.get('x-ratelimit-remaining'), '0');

      // Request ke-3 -> 429 RATE_LIMIT_EXCEEDED + Retry-After
      const r3 = await fetch(`${baseUrl}/limited`, {
        headers: { 'x-forwarded-for': '203.0.113.5' },
      });
      assert.equal(r3.status, 429);
      assert.ok(Number(r3.headers.get('retry-after')) >= 1);
      assert.equal(((await r3.json()) as any).error.code, 'RATE_LIMIT_EXCEEDED');

      // IP berbeda masih diizinkan; simulasi banyak IP unik (menguji maxBuckets=10 tidak error/crash)
      for (let i = 10; i < 25; i++) {
        const other = await fetch(`${baseUrl}/limited`, {
          headers: { 'x-forwarded-for': `198.51.100.${i}` },
        });
        assert.equal(other.status, 200);
      }

      // Setelah window 10 detik habis, IP awal pulih kembali
      clockMs += 10_001;
      const recovered = await fetch(`${baseUrl}/limited`, {
        headers: { 'x-forwarded-for': '203.0.113.5' },
      });
      assert.equal(recovered.status, 200);

      // JSON > 100 KB -> 413 PAYLOAD_TOO_LARGE
      const oversizedPayload = JSON.stringify({ data: 'x'.repeat(110 * 1024) });
      const bigJsonRes = await fetch(`${baseUrl}/json-test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedPayload,
      });
      assert.equal(bigJsonRes.status, 413);
      assert.equal(((await bigJsonRes.json()) as any).error.code, 'PAYLOAD_TOO_LARGE');
    },
  );
});

test('isOriginAllowed menormalkan trailing slash dan mendukung wildcard subdomain Vercel secara aman', () => {
  assert.equal(normalizeOrigin(' https://patra-fe.vercel.app/// '), 'https://patra-fe.vercel.app');

  const allowed = ['https://patra-fe.vercel.app', 'https://*.vercel.app'];
  assert.equal(isOriginAllowed('https://patra-fe.vercel.app', allowed), true);
  assert.equal(isOriginAllowed('https://patra-fe-git-main.vercel.app', allowed), true);
  assert.equal(isOriginAllowed('http://patra-fe.vercel.app', allowed), false);
  assert.equal(isOriginAllowed('https://evil-vercel.app', allowed), false);
  assert.equal(isOriginAllowed('https://vercel.app', allowed), false);
});
