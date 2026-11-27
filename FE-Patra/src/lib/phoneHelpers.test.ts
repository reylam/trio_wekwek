import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractIndonesianLocalDigits,
  formatFullIndonesianPhone,
  formatIndonesianLocalPhone,
  generateRealisticDefaultPhone,
  validateIndonesianLocalPhone,
} from './phoneHelpers.ts';

test('formatIndonesianLocalPhone memformat angka mentah menjadi pola 896 2956 4648', () => {
  assert.equal(formatIndonesianLocalPhone('89629564648'), '896 2956 4648');
  assert.equal(formatIndonesianLocalPhone('+6289629564648'), '896 2956 4648');
  assert.equal(formatIndonesianLocalPhone('089629564648'), '896 2956 4648');
  assert.equal(formatIndonesianLocalPhone('89629'), '896 29');
  assert.equal(formatFullIndonesianPhone('89629564648'), '+62 896 2956 4648');
  assert.equal(extractIndonesianLocalDigits('+62 812-3456-7890'), '81234567890');
});

test('validateIndonesianLocalPhone menerima nomor valid dan menolak terlalu pendek atau bukan awalan 8', () => {
  const ok = validateIndonesianLocalPhone('89629564648');
  assert.deepEqual(ok, {
    ok: true,
    localFormatted: '896 2956 4648',
    fullFormatted: '+62 896 2956 4648',
  });

  assert.equal(validateIndonesianLocalPhone('812345').ok, false);
  assert.equal(validateIndonesianLocalPhone('2123456789').ok, false);
  assert.equal(validateIndonesianLocalPhone('').ok, false);
});

test('generateRealisticDefaultPhone deterministik dan menghasilkan format +62 8xx xxxx xxxx', () => {
  const p1 = generateRealisticDefaultPhone('u-satpol-jkp', 'jkt-pusat');
  const p2 = generateRealisticDefaultPhone('u-satpol-jkp', 'jkt-pusat');
  const p3 = generateRealisticDefaultPhone('u-dinas-smg', 'semarang');

  assert.equal(p1, p2);
  assert.notEqual(p1, p3);
  assert.match(p1, /^\+62 8\d{2} \d{4} \d{4}$/);
  assert.match(p3, /^\+62 8\d{2} \d{4} \d{4}$/);
});
