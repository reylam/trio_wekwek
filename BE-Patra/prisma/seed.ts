// Script SEED idempoten untuk PATRA (2 Kota Pilot: Kota Jakarta Pusat & Kota Semarang)
// Jalankan: npm --prefix BE-Patra run prisma:seed
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../src/config/prisma.js';
import {
  parseCctvSnapshotItems,
  SEED_CAMERAS,
  SEED_REGIONS,
  SEED_RELOCATION_SITES,
  SEED_REPORTS,
  SEED_USERS,
  SEED_ZONES,
} from '../src/config/seedData.js';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'PatraDemo2026!';

// 15 kota/kabupaten publik tambahan dari katalog indonesia_sources.py (total 17 kota, 594 CCTV)
const EXTRA_PUBLIC_REGIONS = [
  {
    code: 'yogyakarta',
    city: 'Kota Yogyakarta',
    province: 'DI Yogyakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Yogyakarta',
    umkmAgencyName: 'Dinas Perdagangan & Koperasi UMKM Kota Yogyakarta',
    centerLat: -7.79963,
    centerLng: 110.37152,
    defaultZoom: 13,
  },
  {
    code: 'pekanbaru',
    city: 'Kota Pekanbaru',
    province: 'Riau',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Pekanbaru',
    umkmAgencyName: 'Dinas Koperasi dan UMKM Kota Pekanbaru',
    centerLat: 0.5072,
    centerLng: 101.44767,
    defaultZoom: 13,
  },
  {
    code: 'pekalongan',
    city: 'Kota Pekalongan',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Pekalongan',
    umkmAgencyName: 'Dindagkop UKM Kota Pekalongan',
    centerLat: -6.89521,
    centerLng: 109.67294,
    defaultZoom: 13,
  },
  {
    code: 'cianjur',
    city: 'Kabupaten Cianjur',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kabupaten Cianjur',
    umkmAgencyName: 'Diskumdagin Kabupaten Cianjur',
    centerLat: -6.79982,
    centerLng: 107.12414,
    defaultZoom: 12,
  },
  {
    code: 'magelang',
    city: 'Kota Magelang',
    province: 'Jawa Tengah',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Magelang',
    umkmAgencyName: 'Disperindagkop UKM Kota Magelang',
    centerLat: -7.47156,
    centerLng: 110.21771,
    defaultZoom: 14,
  },
  {
    code: 'banda-aceh',
    city: 'Kota Banda Aceh',
    province: 'Aceh',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP dan WH Kota Banda Aceh',
    umkmAgencyName: 'Diskopukmdag Kota Banda Aceh',
    centerLat: 5.54904,
    centerLng: 95.31116,
    defaultZoom: 13,
  },
  {
    code: 'bandung',
    city: 'Kota Bandung',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Bandung',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Bandung',
    centerLat: -6.9261,
    centerLng: 107.62107,
    defaultZoom: 13,
  },
  {
    code: 'palembang',
    city: 'Kota Palembang',
    province: 'Sumatera Selatan',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Palembang',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Palembang',
    centerLat: -2.98371,
    centerLng: 104.75023,
    defaultZoom: 13,
  },
  {
    code: 'mataram',
    city: 'Kota Mataram',
    province: 'Nusa Tenggara Barat',
    island: 'Bali & Nusa Tenggara',
    satpolAgencyName: 'Satpol PP Kota Mataram',
    umkmAgencyName: 'Dinas Perindustrian, Koperasi & UKM Kota Mataram',
    centerLat: -8.5879,
    centerLng: 116.11257,
    defaultZoom: 13,
  },
  {
    code: 'jkt-selatan',
    city: 'Kota Jakarta Selatan',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Selatan',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Selatan',
    centerLat: -6.235,
    centerLng: 106.82,
    defaultZoom: 13,
  },
  {
    code: 'tasikmalaya',
    city: 'Kota Tasikmalaya',
    province: 'Jawa Barat',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Tasikmalaya',
    umkmAgencyName: 'Dinas KUMKM Perindag Kota Tasikmalaya',
    centerLat: -7.32638,
    centerLng: 108.22062,
    defaultZoom: 13,
  },
  {
    code: 'bengkulu',
    city: 'Kota Bengkulu',
    province: 'Bengkulu',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Bengkulu',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Bengkulu',
    centerLat: -3.80604,
    centerLng: 102.28475,
    defaultZoom: 13,
  },
  {
    code: 'padang',
    city: 'Kota Padang',
    province: 'Sumatera Barat',
    island: 'Sumatera',
    satpolAgencyName: 'Satpol PP Kota Padang',
    umkmAgencyName: 'Dinas Koperasi dan UKM Kota Padang',
    centerLat: -0.92147,
    centerLng: 100.38818,
    defaultZoom: 13,
  },
  {
    code: 'jkt-barat',
    city: 'Kota Jakarta Barat',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Barat',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Barat',
    centerLat: -6.17799,
    centerLng: 106.79264,
    defaultZoom: 13,
  },
  {
    code: 'jkt-timur',
    city: 'Kota Jakarta Timur',
    province: 'DKI Jakarta',
    island: 'Jawa',
    satpolAgencyName: 'Satpol PP Kota Administrasi Jakarta Timur',
    umkmAgencyName: 'Suku Dinas PPKUKM Jakarta Timur',
    centerLat: -6.22951,
    centerLng: 106.90083,
    defaultZoom: 13,
  },
] as const;

function loadExternalCctvSnapshot() {
  const snapshotPath = path.resolve(
    process.cwd(),
    '../AI-Patra/cctv_catalog/cctv_snapshot.json',
  );
  if (!fs.existsSync(snapshotPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.cameras) ? raw.cameras : [];
    const { valid, skippedCount } = parseCctvSnapshotItems(items);
    console.log(
      `[seed] Membaca cctv_snapshot.json: ${valid.length} kamera valid (${skippedCount} dilewati).`,
    );
    return valid;
  } catch (err) {
    console.warn('[seed] Gagal membaca cctv_snapshot.json, gunakan kamera pilot bawaan:', err);
    return [];
  }
}

async function main() {
  const prisma = getPrisma();
  console.log('[seed] Memulai seeding database PATRA (idempoten)...');

  // 1. Upsert 2 Region pilot + 15 Region publik Indonesia (total 17 kota)
  const allRegions = [...SEED_REGIONS, ...EXTRA_PUBLIC_REGIONS];
  const regionByCode = new Map<string, { id: string; city: string }>();
  const regionByCity = new Map<string, string>();
  for (const r of allRegions) {
    const row = await prisma.region.upsert({
      where: { code: r.code },
      update: {
        city: r.city,
        province: r.province,
        island: r.island,
        satpolAgencyName: r.satpolAgencyName,
        umkmAgencyName: r.umkmAgencyName,
        centerLat: r.centerLat,
        centerLng: r.centerLng,
        defaultZoom: r.defaultZoom,
      },
      create: r,
    });
    regionByCode.set(r.code, { id: row.id, city: row.city });
    regionByCity.set(row.city.trim().toLowerCase(), row.id);
  }

  // 2. Upsert 4 User demo pilot + 15 User demo Satpol PP kota publik (bcrypt hash)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const allDemoUsers = [
    ...SEED_USERS,
    ...EXTRA_PUBLIC_REGIONS.map((r) => ({
      regionCode: r.code,
      email: `satpol.${r.code}@patra.demo`,
      fullName: `Petugas ${r.satpolAgencyName}`,
      role: 'SATPOL_PP' as const,
      isDemo: true,
      demoKey: `satpol-${r.code}`,
    })),
  ];
  const userByDemoKey = new Map<string, string>();
  for (const u of allDemoUsers) {
    const region = regionByCode.get(u.regionCode);
    if (!region) continue;
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        regionId: region.id,
        fullName: u.fullName,
        role: u.role,
        isDemo: u.isDemo,
        demoKey: u.demoKey,
      },
      create: {
        regionId: region.id,
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        isDemo: u.isDemo,
        demoKey: u.demoKey,
      },
    });
    userByDemoKey.set(u.demoKey, row.id);
  }

  // 3. Upsert CctvCamera (gabungan pilot + snapshot eksternal jika tersedia untuk kota terdaftar)
  const externalCameras = loadExternalCctvSnapshot();
  const mergedCameraMap = new Map(SEED_CAMERAS.map((cam) => [cam.id, cam]));
  for (const ext of externalCameras) {
    mergedCameraMap.set(ext.id, ext);
  }

  let syncedCameras = 0;
  for (const cam of mergedCameraMap.values()) {
    const regionId = regionByCity.get(cam.city.trim().toLowerCase());
    if (!regionId) continue;

    await prisma.cctvCamera.upsert({
      where: { id: cam.id },
      update: {
        regionId,
        name: cam.name,
        city: cam.city,
        province: cam.province,
        island: cam.island,
        regionLabel: cam.region,
        district: cam.district ?? null,
        subdistrict: cam.subdistrict ?? null,
        facilityCategory: cam.facility_category ?? null,
        streamUrl: cam.stream_url,
        playbackUrl: cam.playback_url,
        streamType: cam.stream_type,
        lat: cam.lat,
        lng: cam.lng,
        coordsExact: cam.coords_exact,
        needsCorsProxy: cam.needs_cors_proxy,
        attribution: cam.attribution,
        sourcePortal: cam.source_portal,
        roiPolygon: cam.roi_polygon ?? undefined,
        thumbnailUrl: cam.thumbnail_url ?? null,
        fallbackVideoUrl: cam.fallback_video_url ?? null,
        isActive: true,
        syncedAt: new Date(),
      },
      create: {
        id: cam.id,
        regionId,
        name: cam.name,
        city: cam.city,
        province: cam.province,
        island: cam.island,
        regionLabel: cam.region,
        district: cam.district ?? null,
        subdistrict: cam.subdistrict ?? null,
        facilityCategory: cam.facility_category ?? null,
        streamUrl: cam.stream_url,
        playbackUrl: cam.playback_url,
        streamType: cam.stream_type,
        lat: cam.lat,
        lng: cam.lng,
        coordsExact: cam.coords_exact,
        needsCorsProxy: cam.needs_cors_proxy,
        attribution: cam.attribution,
        sourcePortal: cam.source_portal,
        roiPolygon: cam.roi_polygon ?? undefined,
        thumbnailUrl: cam.thumbnail_url ?? null,
        fallbackVideoUrl: cam.fallback_video_url ?? null,
        isActive: true,
      },
    });
    syncedCameras++;
  }

  // 4. Upsert RestrictedZone (idempoten berdasarkan regionId + name)
  const zoneByKey = new Map<string, string>();
  for (const z of SEED_ZONES) {
    const region = regionByCode.get(z.regionCode);
    if (!region) continue;
    const existing = await prisma.restrictedZone.findFirst({
      where: { regionId: region.id, name: z.name },
    });
    const row = existing
      ? await prisma.restrictedZone.update({
          where: { id: existing.id },
          data: { description: z.description, points: z.points, isActive: true },
        })
      : await prisma.restrictedZone.create({
          data: {
            regionId: region.id,
            name: z.name,
            description: z.description,
            points: z.points,
            isActive: true,
          },
        });
    zoneByKey.set(`${z.regionCode}::${z.name}`, row.id);
  }

  // 5. Upsert RelocationSite (idempoten berdasarkan regionId + name, TANPA KUOTA)
  const siteByKey = new Map<string, string>();
  for (const s of SEED_RELOCATION_SITES) {
    const region = regionByCode.get(s.regionCode);
    if (!region) continue;
    const existing = await prisma.relocationSite.findFirst({
      where: { regionId: region.id, name: s.name },
    });
    const row = existing
      ? await prisma.relocationSite.update({
          where: { id: existing.id },
          data: {
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            tradeCategories: s.tradeCategories,
            facilities: s.facilities,
            isActive: true,
          },
        })
      : await prisma.relocationSite.create({
          data: {
            regionId: region.id,
            name: s.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            tradeCategories: s.tradeCategories,
            facilities: s.facilities,
            isActive: true,
          },
        });
    siteByKey.set(`${s.regionCode}::${s.name}`, row.id);
  }

  // 6. Seed 8 ViolationReport + AuditLog (hanya insert jika reportCode belum ada agar AuditLog tetap append-only)
  let createdReports = 0;
  const nowMs = Date.now();
  for (const rep of SEED_REPORTS) {
    const exists = await prisma.violationReport.findUnique({
      where: { reportCode: rep.reportCode },
      select: { id: true },
    });
    if (exists) continue;

    const region = regionByCode.get(rep.regionCode);
    if (!region) continue;

    const createdAt = new Date(nowMs - rep.createdHoursAgo * 60 * 60 * 1000);
    const actionSubmittedAt =
      rep.actionOffsetMinutes !== undefined
        ? new Date(createdAt.getTime() + rep.actionOffsetMinutes * 60 * 1000)
        : null;
    const validatedAt =
      rep.validatedOffsetMinutes !== undefined
        ? new Date(createdAt.getTime() + rep.validatedOffsetMinutes * 60 * 1000)
        : null;
    const relocationAssignedAt =
      rep.relocationOffsetMinutes !== undefined
        ? new Date(createdAt.getTime() + rep.relocationOffsetMinutes * 60 * 1000)
        : null;

    const zoneId = zoneByKey.get(`${rep.regionCode}::${rep.zoneName}`) ?? null;
    const relocationSiteId = rep.relocationSiteName
      ? (siteByKey.get(`${rep.regionCode}::${rep.relocationSiteName}`) ?? null)
      : null;

    await prisma.violationReport.create({
      data: {
        reportCode: rep.reportCode,
        regionId: region.id,
        cameraId: rep.cameraId,
        zoneId,
        source: rep.source,
        status: rep.status,
        address: rep.address,
        lat: rep.lat,
        lng: rep.lng,
        detectedCount: rep.detectedCount,
        maxConfidence: rep.maxConfidence,
        beforeImageUrl: rep.beforeImageUrl,
        isSimulationMode: rep.isSimulationMode,
        afterImageUrl: rep.afterImageUrl ?? null,
        actionType: rep.actionType ?? null,
        actualPklCount: rep.actualPklCount ?? null,
        educationNotes: rep.educationNotes ?? null,
        relocationRequested: rep.relocationRequested,
        actionByUserId: rep.actionByDemoKey ? (userByDemoKey.get(rep.actionByDemoKey) ?? null) : null,
        actionSubmittedAt,
        validatedByUserId: rep.validatedByDemoKey ? (userByDemoKey.get(rep.validatedByDemoKey) ?? null) : null,
        validatedAt,
        revisionReason: rep.revisionReason ?? null,
        relocationSiteId,
        relocationAssignedAt,
        createdAt,
        auditLogs: {
          create: rep.auditLogs.map((log) => ({
            actorId: log.actorDemoKey ? (userByDemoKey.get(log.actorDemoKey) ?? null) : null,
            actorRole: log.actorRole,
            actorName: log.actorName,
            action: log.action,
            fromStatus: log.fromStatus,
            toStatus: log.toStatus,
            note: log.note,
            metadata: log.metadata as object | undefined,
            createdAt: new Date(createdAt.getTime() + log.offsetMinutesFromCreated * 60 * 1000),
          })),
        },
      },
    });
    createdReports++;
  }

  console.log(
    `[seed] Selesai! Regions=${allRegions.length}, DemoUsers=${allDemoUsers.length}, CamerasSynced=${syncedCameras}, Zones=${SEED_ZONES.length}, RelocationSites=${SEED_RELOCATION_SITES.length}, NewReports=${createdReports}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] ERROR:', err);
    process.exit(1);
  });
