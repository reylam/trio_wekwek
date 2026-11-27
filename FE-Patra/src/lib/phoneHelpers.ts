// Prefix operator seluler Indonesia yang umum & realistis (Telkomsel, Indosat, XL, Tri, Axis)
const REALISTIC_ID_PREFIXES = [
  '811',
  '812',
  '813',
  '821',
  '822',
  '852',
  '853',
  '856',
  '857',
  '858',
  '877',
  '878',
  '895',
  '896',
  '818',
  '819',
] as const;

const MIN_LOCAL_DIGITS = 9;
const MAX_LOCAL_DIGITS = 13;

/**
 * Mengekstrak digit lokal Indonesia (tanpa awalan `+62`, `62`, atau `0`) dari input mentah.
 */
export function extractIndonesianLocalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('62')) {
    digits = digits.slice(2);
  }
  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, MAX_LOCAL_DIGITS);
}

/**
 * Memformat digit lokal (tanpa `+62`) menjadi pola `896 2956 4648`.
 */
export function formatIndonesianLocalPhone(raw: string): string {
  const digits = extractIndonesianLocalDigits(raw);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}

/**
 * Memformat nomor lengkap dengan awalan tetap `+62`, mis. `+62 896 2956 4648`.
 */
export function formatFullIndonesianPhone(raw: string): string {
  const localFormatted = formatIndonesianLocalPhone(raw);
  return localFormatted ? `+62 ${localFormatted}` : '+62 ';
}

export function validateIndonesianLocalPhone(
  rawLocal: string,
): { ok: true; fullFormatted: string; localFormatted: string } | { ok: false; message: string } {
  const digits = extractIndonesianLocalDigits(rawLocal);
  if (!digits) {
    return { ok: false, message: 'Nomor telepon tidak boleh kosong.' };
  }
  if (!digits.startsWith('8')) {
    return { ok: false, message: 'Nomor seluler Indonesia harus diawali angka 8 (contoh: 812 ...).' };
  }
  if (digits.length < MIN_LOCAL_DIGITS || digits.length > MAX_LOCAL_DIGITS) {
    return {
      ok: false,
      message: `Masukkan ${MIN_LOCAL_DIGITS}–${MAX_LOCAL_DIGITS} digit setelah +62.`,
    };
  }
  const localFormatted = formatIndonesianLocalPhone(digits);
  return {
    ok: true,
    localFormatted,
    fullFormatted: `+62 ${localFormatted}`,
  };
}

/**
 * Menghasilkan nomor telepon default yang realistis dan konsisten per akun
 * (tidak berurutan/asal-asalan, memakai prefix operator seluler Indonesia).
 */
export function generateRealisticDefaultPhone(
  userId: string | undefined,
  regionCode: string | undefined,
): string {
  const seed = `${regionCode ?? 'patra'}::${userId ?? 'officer'}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  const prefix = REALISTIC_ID_PREFIXES[h % REALISTIC_ID_PREFIXES.length]!;
  const h2 = Math.imul(h ^ 0x9e3779b9, 2246822519) >>> 0;
  const h3 = Math.imul(h2 ^ 0x85ebca6b, 3266489917) >>> 0;

  const mid = String(1000 + (h2 % 8999)).padStart(4, '0');
  const tail = String(1000 + (h3 % 8999)).padStart(4, '0');
  return `+62 ${prefix} ${mid} ${tail}`;
}
