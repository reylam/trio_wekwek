// Berita Acara Penertiban & Arahan Relokasi PKL — PDFKit streaming, TEPAT 1 halaman A4 (document.md §3.4).
// Prinsip anti-meluber: semua teks digambar di koordinat absolut DENGAN `height` + `ellipsis`,
// sehingga LineWrapper PDFKit tidak pernah memanggil continueOnNewPage().
import fs from 'node:fs';
import path from 'node:path';
import type { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';
import type {
  AuditAction,
  EnforcementActionType,
  JwtUserPayload,
} from '../interface/index.js';
import { assertDistrictAccess, assertRegionAccess } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import ReportRepository, {
  type ReportPdfContextRecord,
  type ReportRepositoryPort,
} from '../repository/report.repository.js';
import { formatDistanceLabel, haversineDistanceMeters } from './geo.service.js';

// ---------------------------------------------------------------------------
// Konstanta desain (Design System PATRA)
// ---------------------------------------------------------------------------
const COBALT = '#043FA5';
const HORIZON = '#73A6E9';
const CANVAS = '#F4F7FC';
const INK = '#0B132B';
const MUTED = '#5B6478';
const BORDER = '#D5DEEE';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36; // margin kiri/kanan/atas
const CONTENT_W = PAGE_W - M * 2;

export const PDF_IMAGE_TIMEOUT_MS = 6000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_AUDIT_ROWS = 6;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const ACTION_TYPE_LABEL: Record<EnforcementActionType, string> = {
  EDUCATION_WARNING: 'Edukasi & Teguran Persuasif',
  ADMINISTRATIVE_ACTION: 'Tindakan Administratif',
  RELOCATION_ASSISTANCE: 'Pendampingan Relokasi',
};

const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  REPORT_CREATED: 'Laporan Dibuat',
  INCIDENT_ESCALATED: 'Eskalasi Insiden',
  MANUAL_EVIDENCE_UPDATED: 'Bukti Manual Ditambah',
  ACTION_SUBMITTED: 'Penindakan Dikirim',
  REVISION_REQUESTED: 'Revisi Diminta',
  REVISION_SUBMITTED: 'Revisi Dikirim',
  REPORT_VALIDATED: 'Laporan Divalidasi',
  RELOCATION_ASSIGNED: 'Relokasi Ditetapkan',
  RELOCATION_OVERRIDDEN: 'Alokasi Relokasi Disesuaikan Sudin',
};

// ---------------------------------------------------------------------------
// Util waktu WIB (Asia/Jakarta = UTC+7 tetap, tanpa DST) — NFR-007
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatWib(date: Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date.getTime() + WIB_OFFSET_MS);
  return `${pad2(d.getUTCDate())} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(
    d.getUTCHours(),
  )}:${pad2(d.getUTCMinutes())} WIB`;
}

export function formatSlaDuration(from: Date, to: Date | null): string {
  if (!to) return '-';
  const totalMin = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
}

// ---------------------------------------------------------------------------
// Fetch gambar bukti dengan timeout + fallback (tidak pernah melempar)
// ---------------------------------------------------------------------------
export interface PdfImageAsset {
  buffer: Buffer | null;
  error?: string;
}

export type ImageFetcher = (url: string | null, timeoutMs: number) => Promise<PdfImageAsset>;

export const fetchEvidenceImage: ImageFetcher = async (url, timeoutMs) => {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { buffer: null, error: 'URL gambar tidak tersedia' };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { buffer: null, error: `HTTP ${res.status}` };
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_IMAGE_BYTES) {
      return { buffer: null, error: 'Ukuran gambar tidak valid' };
    }
    return { buffer: Buffer.from(arrayBuf) };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return {
      buffer: null,
      error: name === 'TimeoutError' || name === 'AbortError' ? 'Batas waktu habis' : 'Gagal mengunduh',
    };
  }
};

// ---------------------------------------------------------------------------
// Konteks dokumen (independen dari Prisma agar mudah diuji)
// ---------------------------------------------------------------------------
export interface BeritaAcaraContext {
  reportCode: string;
  satpolAgencyName: string;
  umkmAgencyName: string;
  city: string;
  cameraName: string;
  address: string;
  lat: number;
  lng: number;
  zoneName: string | null;
  source: 'AUTO_AI' | 'MANUAL';
  isSimulationMode: boolean;
  detectedCount: number;
  actualPklCount: number | null;
  actionType: EnforcementActionType | null;
  educationNotes: string | null;
  createdAt: Date;
  actionSubmittedAt: Date | null;
  validatedAt: Date | null;
  beforeImageUrl: string;
  afterImageUrl: string | null;
  relocationRequested: boolean;
  relocationSite: {
    name: string;
    address: string;
    tradeCategories: string[];
    facilities: string[];
    distanceMeters: number;
  } | null;
  relocationAssignedAt: Date | null;
  actionByUserName: string | null;
  validatedByUserName: string | null;
  auditLogs: Array<{
    createdAt: Date;
    action: AuditAction;
    actorName: string;
    actorRole: string;
    note: string | null;
  }>;
  printedAt: Date;
}

export function buildBeritaAcaraContext(
  record: ReportPdfContextRecord,
  printedAt: Date,
): BeritaAcaraContext {
  const site = record.relocationSite;
  return {
    reportCode: record.reportCode,
    satpolAgencyName: record.region.satpolAgencyName,
    umkmAgencyName: record.region.umkmAgencyName,
    city: record.region.city,
    cameraName: record.cameraName ?? record.cameraId,
    address: record.address,
    lat: record.lat,
    lng: record.lng,
    zoneName: record.zoneName ?? null,
    source: record.source,
    isSimulationMode: record.isSimulationMode,
    detectedCount: record.detectedCount,
    actualPklCount: record.actualPklCount,
    actionType: record.actionType,
    educationNotes: record.educationNotes,
    createdAt: record.createdAt,
    actionSubmittedAt: record.actionSubmittedAt,
    validatedAt: record.validatedAt,
    beforeImageUrl: record.beforeImageUrl,
    afterImageUrl: record.afterImageUrl,
    relocationRequested: record.relocationRequested,
    relocationSite: site
      ? {
          name: site.name,
          address: site.address,
          tradeCategories: site.tradeCategories,
          facilities: site.facilities,
          distanceMeters: haversineDistanceMeters(record.lat, record.lng, site.lat, site.lng),
        }
      : null,
    relocationAssignedAt: record.relocationAssignedAt,
    actionByUserName: record.actionByUserName,
    validatedByUserName: record.validatedByUserName,
    auditLogs: record.auditLogs.map((log) => ({
      createdAt: log.createdAt,
      action: log.action,
      actorName: log.actorName,
      actorRole: log.actorRole,
      note: log.note,
    })),
    printedAt,
  };
}

// ---------------------------------------------------------------------------
// Renderer PDF
// ---------------------------------------------------------------------------
function resolveLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'src', 'assets', 'patra-logo.png'),
    path.join(process.cwd(), 'BE-Patra', 'src', 'assets', 'patra-logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // abaikan
    }
  }
  return null;
}

type Doc = PDFKit.PDFDocument;

interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  size?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Teks terkunci di dalam kotak (tidak pernah memicu halaman baru). */
function boxText(doc: Doc, text: string, box: TextBox) {
  doc
    .font(box.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(box.size ?? 9)
    .fillColor(box.color ?? INK)
    .text(sanitize(text), box.x, box.y, {
      width: box.w,
      height: box.h,
      ellipsis: true,
      align: box.align ?? 'left',
      lineGap: 1,
    });
}

/** Font standar Helvetica (WinAnsi): ganti karakter di luar Latin-1 agar tidak rusak. */
function sanitize(text: string): string {
  return text
    .replace(/[\u2192\u21D2]/g, '->')
    .replace(/[\u2264]/g, '<=')
    .replace(/[\u2265]/g, '>=')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');
}

function sectionTitle(doc: Doc, label: string, y: number) {
  doc.rect(M, y + 1, 3, 11).fill(COBALT);
  boxText(doc, label, { x: M + 8, y, w: CONTENT_W - 8, h: 13, size: 9.5, bold: true, color: COBALT });
}

function drawLogo(doc: Doc, x: number, y: number, size: number) {
  const logoPath = resolveLogoPath();
  if (logoPath) {
    try {
      doc.image(logoPath, x, y, { fit: [size, size] });
      return;
    } catch {
      // jatuh ke logo vektor
    }
  }
  doc.roundedRect(x, y, size, size, 10).fill('#FFFFFF');
  doc.roundedRect(x + 6, y + 6, size - 12, size - 12, 7).fill(COBALT);
  boxText(doc, 'P', {
    x,
    y: y + size / 2 - 11,
    w: size,
    h: 24,
    size: 20,
    bold: true,
    color: '#FFFFFF',
    align: 'center',
  });
}

function drawImageBox(
  doc: Doc,
  asset: PdfImageAsset,
  x: number,
  y: number,
  w: number,
  h: number,
  fallbackUrl: string | null,
) {
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(CANVAS, BORDER);
  const fitW = 235;
  const fitH = 140;
  if (asset.buffer) {
    try {
      doc.image(asset.buffer, x + (w - fitW) / 2, y + (h - fitH) / 2, {
        fit: [fitW, fitH],
        align: 'center',
        valign: 'center',
      });
      return;
    } catch {
      asset = { buffer: null, error: 'Format gambar tidak didukung' };
    }
  }
  boxText(doc, 'Gambar tidak dapat dimuat', {
    x: x + 10,
    y: y + h / 2 - 22,
    w: w - 20,
    h: 12,
    size: 9,
    bold: true,
    color: MUTED,
    align: 'center',
  });
  boxText(doc, `(${asset.error ?? 'tidak tersedia'})`, {
    x: x + 10,
    y: y + h / 2 - 8,
    w: w - 20,
    h: 10,
    size: 7.5,
    color: MUTED,
    align: 'center',
  });
  if (fallbackUrl) {
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COBALT)
      .text(sanitize(`Tautan bukti: ${fallbackUrl}`), x + 10, y + h / 2 + 6, {
        width: w - 20,
        height: 18,
        ellipsis: true,
        align: 'center',
        link: /^https?:\/\//i.test(fallbackUrl) ? fallbackUrl : undefined,
      });
  }
}

/**
 * Menggambar Berita Acara ke stream tujuan dan resolve setelah dokumen selesai ditulis.
 * Dokumen DIJAMIN 1 halaman: tidak ada `addPage()` dan seluruh teks dibatasi tinggi kotaknya.
 */
export function renderBeritaAcaraPdf(
  ctx: BeritaAcaraContext,
  images: { before: PdfImageAsset; after: PdfImageAsset },
  out: Writable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M, bottom: 12, left: M, right: M },
      autoFirstPage: true,
      info: {
        Title: `Berita Acara ${ctx.reportCode}`,
        Author: 'PATRA - Pantauan Transparan Ruang Publik',
        Subject: 'Berita Acara Penertiban & Arahan Relokasi PKL',
      },
    });

    out.on('error', reject);
    out.on('finish', () => resolve());
    doc.on('error', reject);
    doc.pipe(out);

    // ---------------- HEADER ----------------
    doc.rect(0, 0, PAGE_W, 98).fill(COBALT);
    doc.rect(0, 98, PAGE_W, 3).fill(HORIZON);
    drawLogo(doc, M, 22, 54);
    boxText(doc, 'BERITA ACARA PENERTIBAN & ARAHAN RELOKASI PKL', {
      x: 102, y: 22, w: 360, h: 18, size: 13, bold: true, color: '#FFFFFF',
    });
    boxText(doc, `${ctx.satpolAgencyName}  |  ${ctx.umkmAgencyName}`, {
      x: 102, y: 42, w: 360, h: 12, size: 8.5, color: '#FFFFFF',
    });
    boxText(doc, `No. Laporan: ${ctx.reportCode}   \u2022   Dicetak: ${formatWib(ctx.printedAt)}`, {
      x: 102, y: 57, w: 360, h: 12, size: 8.5, color: '#FFFFFF',
    });
    boxText(doc, `PATRA \u2014 Pantauan Transparan Ruang Publik  \u2022  ${ctx.city}`, {
      x: 102, y: 72, w: 360, h: 11, size: 7.5, color: '#DCE7FA',
    });
    doc.roundedRect(PAGE_W - M - 82, 30, 82, 22, 11).fill('#FFFFFF');
    boxText(doc, 'TERVALIDASI', {
      x: PAGE_W - M - 82, y: 36.5, w: 82, h: 11, size: 8.5, bold: true, color: COBALT, align: 'center',
    });

    // ---------------- BLOK 1: RINGKASAN & SLA ----------------
    let y = 114;
    sectionTitle(doc, '1. RINGKASAN KEJADIAN & SLA', y);
    y += 18;
    const colW = (CONTENT_W - 12) / 2;
    const rowH = 23;
    const leftRows: Array<[string, string]> = [
      ['Lokasi / Kamera CCTV', ctx.cameraName],
      ['Alamat Ruas Jalan', ctx.address],
      ['Koordinat', `${ctx.lat.toFixed(6)}, ${ctx.lng.toFixed(6)}`],
      ['Zona Terlarang', ctx.zoneName ?? 'Di luar poligon zona terdaftar'],
      [
        'Sumber Deteksi',
        `${ctx.source === 'AUTO_AI' ? 'Auto-Capture AI (1 FPS)' : 'Tangkapan Manual Petugas'}${
          ctx.isSimulationMode ? ' \u2022 Mode Simulasi' : ''
        }`,
      ],
      ['Jenis Tindakan', ctx.actionType ? ACTION_TYPE_LABEL[ctx.actionType] : '-'],
    ];
    const rightRows: Array<[string, string]> = [
      ['Waktu Deteksi', formatWib(ctx.createdAt)],
      ['Waktu Tindak Satpol PP', formatWib(ctx.actionSubmittedAt)],
      ['Durasi SLA Respon', formatSlaDuration(ctx.createdAt, ctx.actionSubmittedAt)],
      ['Waktu Validasi Dinas', formatWib(ctx.validatedAt)],
      [
        'Jumlah PKL (Terdeteksi / Aktual)',
        `${ctx.detectedCount} / ${ctx.actualPklCount ?? '-'}`,
      ],
      ['Status Laporan', 'TERVALIDASI (VALIDATED)'],
    ];
    doc.roundedRect(M, y - 4, CONTENT_W, rowH * leftRows.length + 6, 6).fillAndStroke('#FFFFFF', BORDER);
    leftRows.forEach(([label, value], i) => {
      const ry = y + i * rowH;
      boxText(doc, label, { x: M + 10, y: ry, w: colW - 14, h: 9, size: 6.8, color: MUTED });
      boxText(doc, value, { x: M + 10, y: ry + 9, w: colW - 14, h: 11, size: 8.8, bold: true });
    });
    rightRows.forEach(([label, value], i) => {
      const ry = y + i * rowH;
      const rx = M + colW + 12;
      boxText(doc, label, { x: rx, y: ry, w: colW - 10, h: 9, size: 6.8, color: MUTED });
      boxText(doc, value, { x: rx, y: ry + 9, w: colW - 10, h: 11, size: 8.8, bold: true });
    });

    // ---------------- BLOK 2: BEFORE vs AFTER ----------------
    y = 132 + rowH * leftRows.length + 14; // ~284
    sectionTitle(doc, '2. PERBANDINGAN BUKTI VISUAL (BEFORE vs AFTER)', y);
    y += 18;
    const imgW = (CONTENT_W - 12) / 2;
    const imgH = 156;
    drawImageBox(doc, images.before, M, y, imgW, imgH, ctx.beforeImageUrl);
    drawImageBox(doc, images.after, M + imgW + 12, y, imgW, imgH, ctx.afterImageUrl);
    boxText(doc, `BEFORE \u2014 Deteksi CCTV \u2022 ${formatWib(ctx.createdAt)}`, {
      x: M, y: y + imgH + 4, w: imgW, h: 11, size: 7.5, bold: true, color: INK, align: 'center',
    });
    boxText(doc, `AFTER \u2014 Penindakan Satpol PP \u2022 ${formatWib(ctx.actionSubmittedAt)}`, {
      x: M + imgW + 12, y: y + imgH + 4, w: imgW, h: 11, size: 7.5, bold: true, color: INK, align: 'center',
    });

    // ---------------- BLOK 3: ARAHAN LOKASI BINAAN ----------------
    y = y + imgH + 22; // ~480
    sectionTitle(doc, '3. ARAHAN LOKASI BINAAN & CATATAN EDUKASI', y);
    y += 18;
    const relocH = 86;
    doc.roundedRect(M, y, CONTENT_W, relocH, 6).fillAndStroke(CANVAS, BORDER);
    const leftW = 300;
    if (ctx.relocationSite) {
      const s = ctx.relocationSite;
      boxText(doc, s.name, { x: M + 10, y: y + 8, w: leftW - 10, h: 12, size: 9.5, bold: true, color: COBALT });
      boxText(doc, s.address, { x: M + 10, y: y + 22, w: leftW - 10, h: 20, size: 7.8 });
      boxText(doc, `Jarak dari titik pelanggaran: ${formatDistanceLabel(s.distanceMeters)}`, {
        x: M + 10, y: y + 43, w: leftW - 10, h: 10, size: 7.5, color: MUTED,
      });
      boxText(doc, `Kategori: ${s.tradeCategories.join(', ') || '-'}`, {
        x: M + 10, y: y + 55, w: leftW - 10, h: 10, size: 7.5,
      });
      boxText(doc, `Fasilitas: ${s.facilities.join(', ') || '-'}`, {
        x: M + 10, y: y + 67, w: leftW - 10, h: 10, size: 7.5,
      });
    } else {
      boxText(
        doc,
        ctx.relocationRequested
          ? 'Relokasi diajukan Satpol PP, namun Lokasi Binaan belum ditetapkan oleh Dinas.'
          : 'Tidak ada pengajuan relokasi pada laporan ini.',
        { x: M + 10, y: y + 10, w: leftW - 10, h: 30, size: 8.5, bold: true, color: MUTED },
      );
    }
    doc
      .moveTo(M + leftW + 6, y + 10)
      .lineTo(M + leftW + 6, y + relocH - 10)
      .lineWidth(0.6)
      .strokeColor(BORDER)
      .stroke();
    boxText(doc, 'Catatan Edukasi Petugas', {
      x: M + leftW + 16, y: y + 8, w: CONTENT_W - leftW - 26, h: 10, size: 6.8, color: MUTED,
    });
    boxText(doc, ctx.educationNotes?.trim() || '-', {
      x: M + leftW + 16, y: y + 19, w: CONTENT_W - leftW - 26, h: relocH - 26, size: 7.8,
    });

    // ---------------- BLOK 4: JEJAK AUDIT ----------------
    y = y + relocH + 12; // ~596
    sectionTitle(doc, `4. JEJAK AUDIT PERMANEN (AuditLog \u2022 maks. ${MAX_AUDIT_ROWS} entri terbaru)`, y);
    y += 17;
    const cols = [
      { label: 'Waktu (WIB)', w: 104 },
      { label: 'Aksi', w: 104 },
      { label: 'Pelaku / Instansi', w: 120 },
      { label: 'Keterangan', w: CONTENT_W - 328 },
    ];
    const headH = 15;
    const auditRowH = 17;
    doc.rect(M, y, CONTENT_W, headH).fill(COBALT);
    let cx = M;
    for (const col of cols) {
      boxText(doc, col.label, { x: cx + 6, y: y + 4, w: col.w - 10, h: 9, size: 7, bold: true, color: '#FFFFFF' });
      cx += col.w;
    }
    y += headH;
    const rows = [...ctx.auditLogs]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-MAX_AUDIT_ROWS);
    if (rows.length === 0) {
      boxText(doc, 'Belum ada jejak audit.', { x: M + 6, y: y + 5, w: CONTENT_W - 12, h: 10, size: 7.5, color: MUTED });
    }
    rows.forEach((log, i) => {
      const ry = y + i * auditRowH;
      doc.rect(M, ry, CONTENT_W, auditRowH).fill(i % 2 === 0 ? '#FFFFFF' : CANVAS);
      const cells = [
        formatWib(log.createdAt),
        AUDIT_ACTION_LABEL[log.action] ?? log.action,
        `${log.actorName} (${log.actorRole})`,
        log.note ?? '-',
      ];
      let x = M;
      cells.forEach((cell, ci) => {
        boxText(doc, cell, { x: x + 6, y: ry + 4.5, w: cols[ci]!.w - 10, h: 9, size: 6.9 });
        x += cols[ci]!.w;
      });
    });
    const tableBottom = y + Math.max(rows.length, 1) * auditRowH;
    doc.rect(M, y - headH, CONTENT_W, tableBottom - (y - headH)).lineWidth(0.6).strokeColor(BORDER).stroke();

    // ---------------- TANDA TANGAN & FOOTER ----------------
    const sigY = 744;
    const sigW = 200;
    const sigs: Array<[string, string, string, number]> = [
      ['Ditindak oleh,', ctx.actionByUserName ?? '-', ctx.satpolAgencyName, M],
      ['Divalidasi oleh,', ctx.validatedByUserName ?? '-', ctx.umkmAgencyName, PAGE_W - M - sigW],
    ];
    for (const [title, name, agency, sx] of sigs) {
      boxText(doc, title, { x: sx, y: sigY, w: sigW, h: 10, size: 7.5, color: MUTED, align: 'center' });
      doc.moveTo(sx + 20, sigY + 40).lineTo(sx + sigW - 20, sigY + 40).lineWidth(0.6).strokeColor(INK).stroke();
      boxText(doc, name, { x: sx, y: sigY + 43, w: sigW, h: 11, size: 8.3, bold: true, align: 'center' });
      boxText(doc, agency, { x: sx, y: sigY + 55, w: sigW, h: 9, size: 6.8, color: MUTED, align: 'center' });
    }
    doc.rect(0, PAGE_H - 22, PAGE_W, 22).fill(CANVAS);
    boxText(
      doc,
      'Dokumen ini dihasilkan otomatis oleh sistem PATRA. Jejak audit bersifat append-only dan tidak dapat diubah (SDG 16). Halaman 1 dari 1.',
      { x: M, y: PAGE_H - 15, w: CONTENT_W, h: 9, size: 6.5, color: MUTED, align: 'center' },
    );

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Service: kontrol akses + persiapan konteks SEBELUM header response dikirim
// ---------------------------------------------------------------------------
export interface PdfServiceDeps {
  repo?: Pick<ReportRepositoryPort, 'findPdfContextById'>;
  fetchImage?: ImageFetcher;
  now?: () => Date;
  imageTimeoutMs?: number;
}

export function createPdfBeritaAcaraService(deps: PdfServiceDeps = {}) {
  const repo = deps.repo ?? ReportRepository;
  const fetchImage = deps.fetchImage ?? fetchEvidenceImage;
  const getNow = deps.now ?? (() => new Date());
  const timeoutMs = deps.imageTimeoutMs ?? PDF_IMAGE_TIMEOUT_MS;

  return {
    /**
     * Memvalidasi akses & status, lalu mengembalikan fungsi `render(out)`.
     * Error (404/403/409) dilempar di sini agar errorHandler tetap mengirim JSON standar.
     */
    async prepare(
      user: JwtUserPayload,
      id: string,
    ): Promise<{ filename: string; render: (out: Writable) => Promise<void> }> {
      const record = await repo.findPdfContextById(id);
      if (!record) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Laporan pelanggaran tidak ditemukan.');
      }
      assertRegionAccess(user, record.regionId);
      assertDistrictAccess(user, record.cameraDistrict, 'laporan pelanggaran');
      if (record.status !== 'VALIDATED') {
        throw new AppError(
          409,
          'REPORT_NOT_VALIDATED',
          'Berita Acara PDF hanya tersedia untuk laporan yang sudah tervalidasi.',
        );
      }

      const ctx = buildBeritaAcaraContext(record, getNow());
      // Promise.allSettled + timeout: kegagalan gambar TIDAK menggagalkan PDF (tetap 200).
      const [beforeRes, afterRes] = await Promise.allSettled([
        fetchImage(ctx.beforeImageUrl, timeoutMs),
        fetchImage(ctx.afterImageUrl, timeoutMs),
      ]);
      const toAsset = (r: PromiseSettledResult<PdfImageAsset>): PdfImageAsset =>
        r.status === 'fulfilled' ? r.value : { buffer: null, error: 'Gagal mengunduh' };
      const images = { before: toAsset(beforeRes), after: toAsset(afterRes) };

      return {
        filename: `Berita-Acara-${ctx.reportCode}.pdf`,
        render: (out) => renderBeritaAcaraPdf(ctx, images, out),
      };
    },
  };
}

export const PdfBeritaAcaraService = createPdfBeritaAcaraService();
export default PdfBeritaAcaraService;
