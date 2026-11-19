-- CreateEnum
CREATE TYPE "ExcelKind" AS ENUM ('ELECTRICAL', 'INSTRUMENTATION');

-- CreateEnum
CREATE TYPE "ExcelImportStatus" AS ENUM ('PREVIEW', 'APPLYING', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ExcelRowKind" AS ENUM ('CHANGE', 'NEW', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'KEPT_WEB', 'ACCEPTED_EXCEL');

-- AlterEnum
ALTER TYPE "CableAction" ADD VALUE 'EXCEL_UPDATED';

-- AlterEnum
ALTER TYPE "CableEventSource" ADD VALUE 'EXCEL';

-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "excelOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cable_event" ADD COLUMN     "excelImportId" TEXT;

-- CreateTable
CREATE TABLE "excel_import" (
    "id" TEXT NOT NULL,
    "kind" "ExcelKind" NOT NULL,
    "excelDate" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "projectLoad" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExcelImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "uploadedById" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "ignored" JSONB NOT NULL,
    "agreeingDiscrepancyIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),

    CONSTRAINT "excel_import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_import_row" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cableId" TEXT,
    "kind" "ExcelRowKind" NOT NULL,
    "data" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "conflict" JSONB,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "excel_import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_discrepancy" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "excelDate" DATE NOT NULL,
    "web" JSONB NOT NULL,
    "excel" JSONB NOT NULL,
    "webEventId" TEXT NOT NULL,
    "agreesOn" DATE,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cable_discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "excel_import_kind_status_idx" ON "excel_import"("kind", "status");

-- CreateIndex
CREATE INDEX "excel_import_status_excelDate_idx" ON "excel_import"("status", "excelDate");

-- CreateIndex
CREATE INDEX "excel_import_row_importId_kind_idx" ON "excel_import_row"("importId", "kind");

-- CreateIndex
CREATE INDEX "excel_import_row_importId_selected_appliedAt_idx" ON "excel_import_row"("importId", "selected", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "excel_import_row_importId_code_key" ON "excel_import_row"("importId", "code");

-- CreateIndex
CREATE INDEX "cable_discrepancy_status_createdAt_idx" ON "cable_discrepancy"("status", "createdAt");

-- CreateIndex
CREATE INDEX "cable_discrepancy_cableId_status_idx" ON "cable_discrepancy"("cableId", "status");

-- CreateIndex
CREATE INDEX "cable_event_excelImportId_idx" ON "cable_event"("excelImportId");

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_excelImportId_fkey" FOREIGN KEY ("excelImportId") REFERENCES "excel_import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_import" ADD CONSTRAINT "excel_import_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_import_row" ADD CONSTRAINT "excel_import_row_importId_fkey" FOREIGN KEY ("importId") REFERENCES "excel_import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_import_row" ADD CONSTRAINT "excel_import_row_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_discrepancy" ADD CONSTRAINT "cable_discrepancy_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_discrepancy" ADD CONSTRAINT "cable_discrepancy_importId_fkey" FOREIGN KEY ("importId") REFERENCES "excel_import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_discrepancy" ADD CONSTRAINT "cable_discrepancy_webEventId_fkey" FOREIGN KEY ("webEventId") REFERENCES "cable_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_discrepancy" ADD CONSTRAINT "cable_discrepancy_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_discrepancy" ADD CONSTRAINT "cable_discrepancy_decisionEventId_fkey" FOREIGN KEY ("decisionEventId") REFERENCES "cable_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
