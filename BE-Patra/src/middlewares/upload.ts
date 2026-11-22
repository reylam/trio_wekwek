import type { Request } from 'express';
import multer from 'multer';
import { AppError } from './errorHandler.js';

// Batas payload request Vercel Functions adalah ~4.5 MB, sehingga batas file Multer dikunci 4 MB.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export class FileTypeError extends AppError {
  constructor(message = 'Format file harus berupa gambar JPEG, PNG, atau WebP.') {
    super(400, 'INVALID_FILE_TYPE', message);
    this.name = 'FileTypeError';
  }
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
