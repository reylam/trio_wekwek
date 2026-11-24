import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from './errorHandler.js';

// Batas payload request Vercel Functions adalah ~4.5 MB, sehingga batas file Multer dikunci 4 MB.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type VerifiedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export class FileTypeError extends AppError {
  constructor(message = 'Format file harus berupa gambar JPEG, PNG, atau WebP.') {
    super(400, 'INVALID_FILE_TYPE', message);
    this.name = 'FileTypeError';
  }
}

/**
 * Inspects leading binary magic bytes to verify the uploaded buffer is genuinely JPEG, PNG, or WebP.
 */
export function detectImageMimeFromMagicBytes(buffer: Buffer): VerifiedImageMime | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates uploaded image magic bytes after Multer populates `req.file.buffer`.
 */
export function validateImageMagicBytes(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.file) {
    next();
    return;
  }

  if (!req.file.buffer || !detectImageMimeFromMagicBytes(req.file.buffer)) {
    next(new FileTypeError('Isi file tidak valid sebagai gambar JPEG, PNG, atau WebP.'));
    return;
  }

  next();
}

export function imageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  const mime = (file.mimetype || '').toLowerCase();
  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    return cb(null, true);
  }
  return cb(new FileTypeError());
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: imageFileFilter,
});

export default photoUpload;
