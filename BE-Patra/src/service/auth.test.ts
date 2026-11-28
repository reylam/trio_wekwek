import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import {
  assertDistrictAccess,
  assertRegionAccess,
  createAuthenticateMiddleware,
  enforceRegionScope,
  formatActorName,
  hasDistrictLock,
  isDistrictAllowed,
  requireRole,
  signAuthToken,
} from '../middlewares/auth.js';
import errorHandler from '../middlewares/errorHandler.js';
import photoUpload from '../middlewares/upload.js';
import type { AuthRepositoryPort, UserWithRegionRecord } from '../repository/auth.repository.js';
import { createAuthService } from './auth.service.js';
import { createAuthController } from '../controller/auth.controller.js';
import { createAuthRouter } from '../routes/auth.route.js';

const TEST_JWT_SECRET = 'patra-test-secret-minimum-32-characters-long';
const TEST_PASSWORD = 'PatraTestPassword123!';
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

const REGION_JKT = {
  id: 'reg-jkp',
  code: 'jkt-pusat',
  city: 'Kota Jakarta Pusat',
  province: 'DKI Jakarta',
  satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Pusat',
  umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Pusat',
  centerLat: -6.186486,
  centerLng: 106.834091,
  defaultZoom: 13,
};

const REGION_SMG = {
  id: 'reg-smg',
  code: 'semarang',
  city: 'Kota Semarang',
  province: 'Jawa Tengah',
  satpolAgencyName: 'Satpol PP Kota Semarang',
  umkmAgencyName: 'Dinas Koperasi dan Usaha Mikro Kota Semarang',
  centerLat: -6.984049,
  centerLng: 110.409582,
  defaultZoom: 13,
};

const MOCK_USERS: UserWithRegionRecord[] = [
  {
    id: 'u-satpol-jkp',
    email: 'satpol.jakpus@patra.demo',
    passwordHash: TEST_PASSWORD_HASH,
    fullName: 'Petugas Tim 1 Tanah Abang — Jakarta Pusat',
    noTelp: '+62 812 3456 7890',
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-jkp-tanah-abang',
    region: REGION_JKT,
    team: {
      id: 'team-jkp-1',
      code: 'jkp-tim-1-tanah-abang',
      name: 'Tim 1 Jakarta Pusat — Tanah Abang',
      assignedDistricts: ['Tanah Abang', 'Menteng'],
    },
  },
  {
    id: 'u-satpol-fallback',
    email: 'satpol.kota@patra.demo',
    passwordHash: TEST_PASSWORD_HASH,
    fullName: 'Petugas Satpol PP Lintas Kecamatan',
    noTelp: null,
    role: 'SATPOL_PP',
    isDemo: true,
    demoKey: 'satpol-fallback-kota',
    region: REGION_JKT,
    team: null,
  },
  {
    id: 'u-dinas-smg',
    email: 'dinas.semarang@patra.demo',
    passwordHash: TEST_PASSWORD_HASH,
    fullName: 'Admin Dinas Koperasi & UKM Semarang',
    noTelp: null,
    role: 'DINAS_UMKM',
    isDemo: true,
    demoKey: 'dinas-semarang',
    region: REGION_SMG,
    team: null,
  },
];

function createMockRepo(): AuthRepositoryPort {
  const users = MOCK_USERS.map((u) => ({ ...u }));
  return {
    async findByEmailWithRegion(email: string) {
      const normalized = email.trim().toLowerCase();
      return users.find((u) => u.email.toLowerCase() === normalized) ?? null;
    },
    async findDemoByKeyWithRegion(demoKey: string) {
      return users.find((u) => u.isDemo && u.demoKey === demoKey.trim()) ?? null;
    },
    async findByIdWithRegion(id: string) {
      return users.find((u) => u.id === id) ?? null;
    },
    async updateNoTelp(id: string, noTelp: string) {
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error('User not found');
      user.noTelp = noTelp;
      return { ...user };
    },
  };
}

async function withTestServer(
  options: { enableDemoLogin?: boolean } = {},
  fn: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());

  const repo = createMockRepo();
  const service = createAuthService(repo, {
    enableDemoLogin: options.enableDemoLogin ?? true,
    jwtSecret: TEST_JWT_SECRET,
  });
  const controller = createAuthController(service);
  const authenticate = createAuthenticateMiddleware(TEST_JWT_SECRET);

  app.use('/api/auth', createAuthRouter({ controller, jwtSecret: TEST_JWT_SECRET }));

  // Protected test routes for RBAC, Region-Lock, and Multer error handling
  app.get('/api/test/satpol-only', authenticate, requireRole('SATPOL_PP'), (_req, res) => {
    res.json({ ok: true, data: { allowed: true } });
  });

  app.get(
    '/api/test/region/:regionId',
    authenticate,
    enforceRegionScope((req) => String(req.params.regionId)),
    (_req, res) => {
      res.json({ ok: true, data: { sameRegion: true } });
    },
  );

  app.post('/api/test/upload', photoUpload.single('photo'), (_req, res) => {
    res.json({ ok: true, data: { uploaded: true } });
  });

  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('Auth endpoints: login, demo-login, /me, and /logout succeed with expected payload', async () => {
  await withTestServer({ enableDemoLogin: true }, async (baseUrl) => {
    // 1. Standard login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'SATPOL.JAKPUS@PATRA.DEMO',
        password: TEST_PASSWORD,
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as any;
    assert.equal(loginJson.ok, true);
    assert.ok(typeof loginJson.data.token === 'string' && loginJson.data.token.length > 20);
    assert.equal(loginJson.data.user.role, 'SATPOL_PP');
    assert.equal(loginJson.data.user.region.city, 'Kota Jakarta Pusat');
    assert.equal(loginJson.data.user.team.name, 'Tim 1 Jakarta Pusat — Tanah Abang');
    assert.deepEqual(loginJson.data.user.team.assignedDistricts, ['Tanah Abang', 'Menteng']);
    assert.equal('passwordHash' in loginJson.data.user, false);

    // 1b. Legacy demoKey alias resolves to new Tanah Abang team key
    const aliasDemoRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoKey: 'satpol-jkt-pusat' }),
    });
    assert.equal(aliasDemoRes.status, 200);
    const aliasDemoJson = (await aliasDemoRes.json()) as any;
    assert.equal(aliasDemoJson.data.user.id, 'u-satpol-jkp');
    assert.equal(aliasDemoJson.data.user.team.code, 'jkp-tim-1-tanah-abang');

    // 2. 1-Click Demo Login
    const demoRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoKey: 'dinas-semarang' }),
    });
    assert.equal(demoRes.status, 200);
    const demoJson = (await demoRes.json()) as any;
    assert.equal(demoJson.ok, true);
    assert.equal(demoJson.data.user.role, 'DINAS_UMKM');
    assert.equal(demoJson.data.user.region.umkmAgencyName, 'Dinas Koperasi dan Usaha Mikro Kota Semarang');

    // 3. GET /api/auth/me with Bearer token
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${demoJson.data.token}` },
    });
    assert.equal(meRes.status, 200);
    const meJson = (await meRes.json()) as any;
    assert.equal(meJson.ok, true);
    assert.equal(meJson.data.user.id, 'u-dinas-smg');
    assert.equal(meJson.data.user.noTelp, null);

    // 3b. PATCH /api/auth/me updates noTelp & rejects invalid format
    const patchRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${demoJson.data.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ noTelp: '+62 813 9988 7766' }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as any;
    assert.equal(patchJson.ok, true);
    assert.equal(patchJson.data.user.noTelp, '+62 813 9988 7766');

    const badPatchRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${demoJson.data.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ noTelp: 'abc12' }),
    });
    assert.equal(badPatchRes.status, 400);
    assert.equal(((await badPatchRes.json()) as any).error.code, 'VALIDATION_ERROR');

    // 4. POST /api/auth/logout with Bearer token
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${demoJson.data.token}` },
    });
    assert.equal(logoutRes.status, 200);
    const logoutJson = (await logoutRes.json()) as any;
    assert.equal(logoutJson.data.loggedOut, true);
  });
});

test('Auth failure & edge cases: invalid credentials, invalid token, demo disabled, unknown demoKey, bad body', async () => {
  await withTestServer({ enableDemoLogin: true }, async (baseUrl) => {
    // 1. Wrong password vs nonexistent email must share identical 401 message
    const wrongPwRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'satpol.jakpus@patra.demo', password: 'wrong-password' }),
    });
    const unknownEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@patra.demo', password: TEST_PASSWORD }),
    });
    assert.equal(wrongPwRes.status, 401);
    assert.equal(unknownEmailRes.status, 401);
    const wrongPwJson = (await wrongPwRes.json()) as any;
    const unknownEmailJson = (await unknownEmailRes.json()) as any;
    assert.equal(wrongPwJson.error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongPwJson.error.message, unknownEmailJson.error.message);

    // 2. Missing and invalid-signature JWT -> 401 UNAUTHORIZED
    const missingTokenRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(missingTokenRes.status, 401);
    const badSigToken = signAuthToken(
      {
        sub: 'u-satpol-jkp',
        role: 'SATPOL_PP',
        regionId: 'reg-jkp',
        city: 'Kota Jakarta Pusat',
        email: 'satpol.jakpus@patra.demo',
      },
      'different-secret-key-at-least-32-chars',
    );
    const badTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${badSigToken}` },
    });
    assert.equal(badTokenRes.status, 401);
    assert.equal(((await badTokenRes.json()) as any).error.code, 'UNAUTHORIZED');

    // 3. Unknown demoKey -> 404 DEMO_ACCOUNT_NOT_FOUND
    const unknownDemoRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoKey: 'non-existent-demo' }),
    });
    assert.equal(unknownDemoRes.status, 404);
    assert.equal(((await unknownDemoRes.json()) as any).error.code, 'DEMO_ACCOUNT_NOT_FOUND');

    // 4. Invalid email payload -> 400 VALIDATION_ERROR with details
    const invalidBodyRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-valid', password: '' }),
    });
    assert.equal(invalidBodyRes.status, 400);
    const invalidBodyJson = (await invalidBodyRes.json()) as any;
    assert.equal(invalidBodyJson.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(invalidBodyJson.error.details) && invalidBodyJson.error.details.length >= 1);
  });

  // 5. Demo login disabled -> 403 DEMO_LOGIN_DISABLED
  await withTestServer({ enableDemoLogin: false }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demoKey: 'satpol-jkt-pusat' }),
    });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as any).error.code, 'DEMO_LOGIN_DISABLED');
  });
});

test('RBAC, Region-Lock, and Multer upload error mappings', async () => {
  await withTestServer({ enableDemoLogin: true }, async (baseUrl) => {
    const satpolToken = signAuthToken(
      {
        sub: 'u-satpol-jkp',
        role: 'SATPOL_PP',
        regionId: 'reg-jkp',
        city: 'Kota Jakarta Pusat',
        email: 'satpol.jakpus@patra.demo',
      },
      TEST_JWT_SECRET,
    );
    const dinasToken = signAuthToken(
      {
        sub: 'u-dinas-smg',
        role: 'DINAS_UMKM',
        regionId: 'reg-smg',
        city: 'Kota Semarang',
        email: 'dinas.semarang@patra.demo',
      },
      TEST_JWT_SECRET,
    );

    // Normal RBAC & same-region
    const okRole = await fetch(`${baseUrl}/api/test/satpol-only`, {
      headers: { Authorization: `Bearer ${satpolToken}` },
    });
    assert.equal(okRole.status, 200);

    const okRegion = await fetch(`${baseUrl}/api/test/region/reg-jkp`, {
      headers: { Authorization: `Bearer ${satpolToken}` },
    });
    assert.equal(okRegion.status, 200);

    // Wrong role -> 403 FORBIDDEN_ROLE
    const badRole = await fetch(`${baseUrl}/api/test/satpol-only`, {
      headers: { Authorization: `Bearer ${dinasToken}` },
    });
    assert.equal(badRole.status, 403);
    assert.equal(((await badRole.json()) as any).error.code, 'FORBIDDEN_ROLE');

    // Cross-region HTTP & direct helper -> 403 REGION_ACCESS_DENIED
    const crossRegion = await fetch(`${baseUrl}/api/test/region/reg-smg`, {
      headers: { Authorization: `Bearer ${satpolToken}` },
    });
    assert.equal(crossRegion.status, 403);
    assert.equal(((await crossRegion.json()) as any).error.code, 'REGION_ACCESS_DENIED');

    assert.throws(
      () =>
        assertRegionAccess(
          {
            sub: 'u-satpol-jkp',
            role: 'SATPOL_PP',
            regionId: 'reg-jkp',
            city: 'Kota Jakarta Pusat',
            email: 'satpol.jakpus@patra.demo',
            fullName: 'Petugas Tim 1 Tanah Abang — Jakarta Pusat',
            teamId: 'team-jkp-1',
            teamName: 'Tim 1 Jakarta Pusat — Tanah Abang',
            assignedDistricts: ['Tanah Abang', 'Menteng'],
          },
          'reg-smg',
        ),
      (err: any) => err?.status === 403 && err?.code === 'REGION_ACCESS_DENIED',
    );

    // District lock helpers & actor name formatting
    const lockedUser = {
      sub: 'u-satpol-jkp',
      role: 'SATPOL_PP' as const,
      regionId: 'reg-jkp',
      city: 'Kota Jakarta Pusat',
      email: 'satpol.jakpus@patra.demo',
      fullName: 'Petugas Tim 1',
      teamId: 'team-jkp-1',
      teamName: 'Tim 1 Tanah Abang',
      assignedDistricts: ['Tanah Abang', 'Menteng'],
    };
    const fallbackUser = {
      ...lockedUser,
      sub: 'u-satpol-fallback',
      fullName: 'Petugas Kota',
      teamId: null,
      teamName: null,
      assignedDistricts: [],
    };
    const dinasUser = {
      ...lockedUser,
      sub: 'u-dinas-jkp',
      role: 'DINAS_UMKM' as const,
      fullName: 'Admin Sudin',
      teamId: null,
      teamName: null,
      assignedDistricts: [],
    };

    assert.equal(hasDistrictLock(lockedUser), true);
    assert.equal(hasDistrictLock(fallbackUser), false);
    assert.equal(hasDistrictLock(dinasUser), false);

    assert.equal(isDistrictAllowed(lockedUser, 'tanah abang'), true);
    assert.equal(isDistrictAllowed(lockedUser, 'Gambir'), false);
    assert.equal(isDistrictAllowed(lockedUser, null), false);
    assert.equal(isDistrictAllowed(fallbackUser, 'Gambir'), true);
    assert.equal(isDistrictAllowed(dinasUser, null), true);

    assert.doesNotThrow(() => assertDistrictAccess(lockedUser, 'Menteng', 'CCTV'));
    assert.throws(
      () => assertDistrictAccess(lockedUser, 'Gambir', 'CCTV'),
      (err: any) => err?.status === 403 && err?.code === 'DISTRICT_ACCESS_DENIED',
    );
    assert.throws(
      () => assertDistrictAccess(lockedUser, null, 'CCTV'),
      (err: any) => err?.status === 403 && err?.code === 'DISTRICT_ACCESS_DENIED',
    );

    assert.equal(formatActorName(lockedUser), 'Petugas Tim 1 (Tim 1 Tanah Abang)');
    assert.equal(formatActorName(fallbackUser), 'Petugas Kota');
    assert.equal(formatActorName({ ...fallbackUser, fullName: '' }), 'satpol.jakpus@patra.demo');

    // Multer invalid MIME type -> 400 INVALID_FILE_TYPE
    const badMimeForm = new FormData();
    badMimeForm.append('photo', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    const badMimeRes = await fetch(`${baseUrl}/api/test/upload`, {
      method: 'POST',
      body: badMimeForm,
    });
    assert.equal(badMimeRes.status, 400);
    assert.equal(((await badMimeRes.json()) as any).error.code, 'INVALID_FILE_TYPE');

    // Multer LIMIT_FILE_SIZE (> 4 MB) -> 413 PAYLOAD_TOO_LARGE
    const largeForm = new FormData();
    largeForm.append(
      'photo',
      new Blob([new Uint8Array(4 * 1024 * 1024 + 1024)], { type: 'image/jpeg' }),
      'oversized.jpg',
    );
    const largeRes = await fetch(`${baseUrl}/api/test/upload`, {
      method: 'POST',
      body: largeForm,
    });
    assert.equal(largeRes.status, 413);
    assert.equal(((await largeRes.json()) as any).error.code, 'PAYLOAD_TOO_LARGE');

    // Direct MulterError mapping sanity check via Express errorHandler
    const multerSizeErr = new multer.MulterError('LIMIT_FILE_SIZE', 'photo');
    assert.equal(multerSizeErr.code, 'LIMIT_FILE_SIZE');
  });
});
