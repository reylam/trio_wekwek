-- CreateEnum
CREATE TYPE "RelocationMatchStatus" AS ENUM ('NEAREST_AVAILABLE', 'FALLBACK_AVAILABLE', 'SPLIT_FALLBACK', 'PARTIAL_UNACCOMMODATED', 'ALL_SITES_FULL');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'RELOCATION_OVERRIDDEN';

-- DropIndex
DROP INDEX "User_regionId_role_idx";

-- DropIndex
DROP INDEX "RestrictedZone_regionId_isActive_idx";

-- CreateTable
CREATE TABLE "PatrolTeam" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignedDistricts" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolTeam_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "teamId" TEXT;

-- AlterTable
ALTER TABLE "RestrictedZone" ADD COLUMN "district" TEXT;

-- AlterTable
ALTER TABLE "RelocationSite"
ADD COLUMN "maxCapacity" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "occupiedCapacity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ViolationReport"
ADD COLUMN "assignedTeamId" TEXT,
ADD COLUMN "recommendedRelocationSiteId" TEXT,
ADD COLUMN "relocationMatchStatus" "RelocationMatchStatus",
ADD COLUMN "unaccommodatedPklCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "relocationCapacityCommitted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReportRelocationAllocation" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "relocationSiteId" TEXT NOT NULL,
    "allocatedCount" INTEGER NOT NULL,
    "rankOrder" INTEGER NOT NULL DEFAULT 1,
    "isRecommended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRelocationAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatrolTeam_code_key" ON "PatrolTeam"("code");

-- CreateIndex
CREATE INDEX "PatrolTeam_regionId_isActive_idx" ON "PatrolTeam"("regionId", "isActive");

-- CreateIndex
CREATE INDEX "User_regionId_role_teamId_idx" ON "User"("regionId", "role", "teamId");

-- CreateIndex
CREATE INDEX "RestrictedZone_regionId_district_isActive_idx" ON "RestrictedZone"("regionId", "district", "isActive");

-- CreateIndex
CREATE INDEX "ViolationReport_regionId_assignedTeamId_status_idx" ON "ViolationReport"("regionId", "assignedTeamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRelocationAllocation_reportId_relocationSiteId_key" ON "ReportRelocationAllocation"("reportId", "relocationSiteId");

-- CreateIndex
CREATE INDEX "ReportRelocationAllocation_relocationSiteId_idx" ON "ReportRelocationAllocation"("relocationSiteId");

-- CreateIndex
CREATE INDEX "ReportRelocationAllocation_reportId_rankOrder_idx" ON "ReportRelocationAllocation"("reportId", "rankOrder");

-- AddForeignKey
ALTER TABLE "PatrolTeam" ADD CONSTRAINT "PatrolTeam_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PatrolTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "PatrolTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViolationReport" ADD CONSTRAINT "ViolationReport_recommendedRelocationSiteId_fkey" FOREIGN KEY ("recommendedRelocationSiteId") REFERENCES "RelocationSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRelocationAllocation" ADD CONSTRAINT "ReportRelocationAllocation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ViolationReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRelocationAllocation" ADD CONSTRAINT "ReportRelocationAllocation_relocationSiteId_fkey" FOREIGN KEY ("relocationSiteId") REFERENCES "RelocationSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
