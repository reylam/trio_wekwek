// Utilitas kompresi gambar klien (<= 1.5 MB JPEG) untuk snapshot CCTV & foto bukti After Satpol PP

const DEFAULT_MAX_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;

function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca berkas gambar.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengompresi gambar ke JPEG.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImageToJpeg(
  source: File | Blob,
  options?: { maxBytes?: number; maxDimension?: number; filename?: string },
): Promise<File> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const targetName =
    options?.filename ??
    (source instanceof File
      ? source.name.replace(/\.[^.]+$/, '') + '.jpg'
      : `evidence-${Date.now()}.jpg`);

  const img = await loadImageFromFile(source);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context tidak tersedia.');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxBytes && quality > 0.35) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }

  return new File([blob], targetName, { type: 'image/jpeg' });
}

export async function compressCanvasToJpegBlob(
  canvas: HTMLCanvasElement,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<Blob> {
  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxBytes && quality > 0.35) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }

  return blob;
}
