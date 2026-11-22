import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma.js';

// Endpoint diagnostik koneksi DB Supabase Pooler.
// TIDAK pernah membocorkan kredensial atau nilai rahasia env (hanya host & port).
export async function healthdb(_req: Request, res: Response) {
  const url = process.env.DATABASE_URL || '';
  let host: string | null = null;
  let port: string | null = null;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port || null;
  } catch {
    // URL kosong atau tidak valid
  }

  const info: Record<string, unknown> = {
    hasDatabaseUrl: url.length > 0,
    host,
    port,
    onVercel: Boolean(process.env.VERCEL),
  };

  try {
    const prisma = getPrisma();
    const [regionCount, cameraCount, reportCount] = await prisma.$transaction([
      prisma.region.count(),
      prisma.cctvCamera.count(),
      prisma.violationReport.count(),
    ]);
    return res.status(200).json({
      ok: true,
      data: {
        ...info,
        dbConnected: true,
        counts: { regions: regionCount, cameras: cameraCount, reports: reportCount },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'DB_HEALTHCHECK_FAILED',
        message: 'Koneksi ke database PostgreSQL gagal.',
        details: [{ message }],
      },
    });
  }
}
