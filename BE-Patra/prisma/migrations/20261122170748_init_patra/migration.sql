-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SATPOL_PP', 'DINAS_UMKM');

-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('hls', 'mjpeg', 'mp4');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('AUTO_AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEED_ACTION', 'PENDING_VALIDATION', 'NEEDS_REVISION', 'VALIDATED');

-- CreateEnum
CREATE TYPE "EnforcementActionType" AS ENUM ('EDUCATION_WARNING', 'ADMINISTRATIVE_ACTION', 'RELOCATION_ASSISTANCE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('REPORT_CREATED', 'INCIDENT_ESCALATED', 'MANUAL_EVIDENCE_UPDATED', 'ACTION_SUBMITTED', 'REVISION_REQUESTED', 'REVISION_SUBMITTED', 'REPORT_VALIDATED', 'RELOCATION_ASSIGNED');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "island" TEXT NOT NULL DEFAULT 'Jawa',
    "satpolAgencyName" TEXT NOT NULL,
    "umkmAgencyName" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "defaultZoom" INTEGER NOT NULL DEFAULT 13,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CctvCamera" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "island" TEXT NOT NULL DEFAULT 'Jawa',
    "regionLabel" TEXT NOT NULL,
    "district" TEXT,
    "subdistrict" TEXT,
    "facilityCategory" TEXT,
    "streamUrl" TEXT NOT NULL,
    "playbackUrl" TEXT NOT NULL,
    "streamType" "StreamType" NOT NULL DEFAULT 'hls',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "coordsExact" BOOLEAN NOT NULL DEFAULT false,
    "needsCorsProxy" BOOLEAN NOT NULL DEFAULT false,
    "attribution" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "roiPolygon" JSONB,
    "thumbnailUrl" TEXT,
    "fallbackVideoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CctvCamera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestrictedZone" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestrictedZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelocationSite" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "tradeCategories" JSONB NOT NULL,
    "facilities" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelocationSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViolationReport" (
    "id" TEXT NOT NULL,
    "reportCode" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "zoneId" TEXT,
    "source" "ReportSource" NOT NULL DEFAULT 'AUTO_AI',
    "status" "ReportStatus" NOT NULL DEFAULT 'NEED_ACTION',
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "detectedCount" INTEGER NOT NULL DEFAULT 1,
    "maxConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "beforeImageUrl" TEXT NOT NULL,
    "isSimulationMode" BOOLEAN NOT NULL DEFAULT false,
    "afterImageUrl" TEXT,
    "actionType" "EnforcementActionType",
    "actualPklCount" INTEGER,
    "educationNotes" TEXT,
    "relocationRequested" BOOLEAN NOT NULL DEFAULT false,
    "actionByUserId" TEXT,
    "actionSubmittedAt" TIMESTAMP(3),
    "validatedByUserId" TEXT,
    "validatedAt" TIMESTAMP(3),
    "revisionReason" TEXT,
    "relocationSiteId" TEXT,
    "relocationAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViolationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Region_city_key" ON "Region"("city");

-- CreateIndex
CREATE INDEX "Region_province_idx" ON "Region"("province");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_demoKey_key" ON "User"("demoKey");

-- CreateIndex
CREATE INDEX "User_regionId_role_idx" ON "User"("regionId", "role");

-- CreateIndex
CREATE INDEX "CctvCamera_regionId_isActive_idx" ON "CctvCamera"("regionId", "isActive");

-- CreateIndex
CREATE INDEX "CctvCamera_city_isActive_idx" ON "CctvCamera"("city", "isActive");

-- CreateIndex
CREATE INDEX "CctvCamera_district_idx" ON "CctvCamera"("district");

-- CreateIndex
CREATE INDEX "RestrictedZone_regionId_isActive_idx" ON "RestrictedZone"("regionId", "isActive");

-- CreateIndex
CREATE INDEX "RelocationSite_regionId_isActive_idx" ON "RelocationSite"("regionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ViolationReport_reportCode_key" ON "ViolationReport"("reportCode");

-- CreateIndex
CREATE INDEX "ViolationReport_cameraId_status_createdAt_idx" ON "ViolationReport"("cameraId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ViolationReport_cameraId_actionSubmittedAt_idx" ON "ViolationReport"("cameraId", "actionSubmittedAt" DESC);

-- CreateIndex
CREATE INDEX "ViolationReport_regionId_status_createdAt_idx" ON "ViolationReport"("regionId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ViolationReport_regionId_relocationRequested_status_idx" ON "ViolationReport"("regionId", "relocationRequested", "status");

-- CreateIndex
CREATE INDEX "AuditLog_reportId_createdAt_idx" ON "AuditLog"("reportId", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestrictedZone" ADD CONSTRAINT "RestrictedZone_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelocationSite" ADD CONSTRAINT "RelocationSite_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "RestrictedZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_actionByUserId_fkey" FOREIGN KEY ("actionByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_relocationSiteId_fkey" FOREIGN KEY ("relocationSiteId") REFERENCES "RelocationSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ViolationReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
