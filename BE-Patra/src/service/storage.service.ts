import crypto from 'node:crypto';
import config from '../config/config.js';
import { getSupabase, SUPABASE_BUCKET } from '../config/supabase.js';
import { AppError } from '../middlewares/errorHandler.js';

export interface StorageServicePort {
  uploadEvidence(folder: 'before' | 'after', file: Express.Multer.File): Promise<string>;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function isTransientError(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err ?? '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('eai_again')
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= RETRY_ATTEMPTS || !isTransientError(err)) {
        break;
      }
      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(
        `[storage] ${label} gagal (percobaan ${attempt}/${RETRY_ATTEMPTS}), ulang dalam ${delay}ms:`,
        err instanceof Error ? err.message : String(err),
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

export const StorageService: StorageServicePort = {
  async uploadEvidence(folder: 'before' | 'after', file: Express.Multer.File): Promise<string> {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = MIME_TO_EXT[mime] || '.jpg';
    const objectPath = `${folder}/${crypto.randomUUID()}${ext}`;
    const bucket = config.supabaseBucket || SUPABASE_BUCKET;
    const supabase = getSupabase();

    try {
      await withRetry(`upload ${folder}`, async () => {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(objectPath, file.buffer, {
            contentType: mime || 'image/jpeg',
            upsert: true,
          });
        if (error) {
          throw new Error(error.message);
        }
      });
    } catch (err) {
      console.error('[storage] gagal upload ke Supabase:', err);
      throw new AppError(
        502,
        'STORAGE_UPLOAD_FAILED',
        'Gagal mengunggah foto bukti ke penyimpanan.',
      );
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return data?.publicUrl || objectPath;
  },
};

export default StorageService;
