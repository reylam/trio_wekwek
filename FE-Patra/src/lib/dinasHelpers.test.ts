import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHotspotRadius,
  escapeHtml,
  extractPdfFilename,
  formatKpiSla,
  parseCommaTags,
  validateRelocationSiteForm,
  validateRevisionReason,
} from './dinasHelpers.ts';

test('escapeHtml menetralkan tag HTML dan tanda kutip untuk popup Leaflet', () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'Taman'`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Taman&#39;',
  );
});

test('validateRevisionReason menerima alasan >= 10 karakter dan menolak pendek/berlebih', () => {
  const ok = validateRevisionReason('  Foto After buram dan belum tampak penataan trotoar.  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.trimmed, 'Foto After buram dan belum tampak penataan trotoar.');

  const tooShort = validateRevisionReason('   kurang   ');
  assert.equal(tooShort.valid, false);
  assert.ok(tooShort.error);

  const tooLong = validateRevisionReason('a'.repeat(1001));
  assert.equal(tooLong.valid, false);
  assert.ok(tooLong.error);
});

test('parseCommaTags memisahkan koma/baris baru secara unik dan menangani string kosong', () => {
  assert.deepEqual(
    parseCommaTags('Kuliner,  Minuman,\nkuliner, Kerajinan , '),
    ['Kuliner', 'Minuman', 'Kerajinan'],
  );
  assert.deepEqual(parseCommaTags('  , \n  '), []);
});

test('validateRelocationSiteForm valid menghasilkan payload tanpa field kuota', () => {
  const res = validateRelocationSiteForm({
    name: 'Selter PKL Taman Menteri Supeno',
    address: 'Jl. Taman Menteri Supeno No. 1, Semarang',
    lat: '-6.992712',
    lng: '110.420185',
    tradeCategoriesRaw: 'Kuliner, Minuman, Kuliner',
    facilitiesRaw: 'Air Bersih, Listrik, Mushola',
  });

  assert.equal(res.valid, true);
  assert.deepEqual(res.value, {
    name: 'Selter PKL Taman Menteri Supeno',
    address: 'Jl. Taman Menteri Supeno No. 1, Semarang',
    lat: -6.992712,
    lng: 110.420185,
    tradeCategories: ['Kuliner', 'Minuman'],
    facilities: ['Air Bersih', 'Listrik', 'Mushola'],
  });
  assert.equal('quota' in (res.value as object), false);
});

test('validateRelocationSiteForm menolak field kosong dan koordinat di luar batas', () => {
  const missingFields = validateRelocationSiteForm({
    name: 'AB',
    address: 'Jln',
    lat: '',
    lng: '110.4',
    tradeCategoriesRaw: '',
    facilitiesRaw: '   ',
  });
  assert.equal(missingFields.valid, false);
  assert.ok(missingFields.errors.name);
  assert.ok(missingFields.errors.address);
  assert.ok(missingFields.errors.lat);
  assert.ok(missingFields.errors.tradeCategories);
  assert.ok(missingFields.errors.facilities);

  const outOfRange = validateRelocationSiteForm({
    name: 'Lokbin Pasar Baru',
    address: 'Jl. Pasar Baru Timur No. 2',
    lat: 120,
    lng: -200,
    tradeCategoriesRaw: 'Kuliner',
    facilitiesRaw: 'Toilet',
  });
  assert.equal(outOfRange.valid, false);
  assert.ok(outOfRange.errors.lat);
  assert.ok(outOfRange.errors.lng);
});

test('extractPdfFilename memparsing header dengan aman serta menolak path traversal', () => {
  assert.equal(
    extractPdfFilename('attachment; filename="Berita-Acara-PTR-202611-7K4M9.pdf"', 'PTR-FALLBACK'),
    'Berita-Acara-PTR-202611-7K4M9.pdf',
  );
  assert.equal(
    extractPdfFilename(null, 'PTR-202611-ABC12'),
    'Berita-Acara-PATRA-PTR-202611-ABC12.pdf',
  );
  assert.equal(
    extractPdfFilename('attachment; filename="../../secret/evil.pdf"', 'PTR-SAFE'),
    'evil.pdf',
  );
});

test('formatKpiSla dan computeHotspotRadius menangani nilai normal dan batas tepi', () => {
  assert.equal(formatKpiSla(null), '-');
  assert.equal(formatKpiSla(-5), '-');
  assert.equal(formatKpiSla(42.4), '42 mnt');
  assert.equal(formatKpiSla(120), '2 jam');
  assert.equal(formatKpiSla(135), '2j 15m');

  assert.equal(computeHotspotRadius(0), 9);
  assert.equal(computeHotspotRadius(-2), 9);
  assert.equal(computeHotspotRadius(4), 17);
  assert.equal(computeHotspotRadius(100), 24);
});
