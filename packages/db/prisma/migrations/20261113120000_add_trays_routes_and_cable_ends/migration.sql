-- CreateEnum
CREATE TYPE "CableLevel" AS ENUM ('L1', 'L2', 'L3', 'L4');

-- CreateEnum
CREATE TYPE "TrayKind" AS ENUM ('LADDER', 'GRID', 'SPECIAL', 'CONDUIT', 'DUCT', 'OTHER');

-- CreateEnum
CREATE TYPE "RouteSection" AS ENUM ('FIELD', 'ROOM');

-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "altCode" TEXT,
ADD COLUMN     "cablesPerCircuit" INTEGER,
ADD COLUMN     "circuit" TEXT,
ADD COLUMN     "composition" TEXT,
ADD COLUMN     "destinationCubicle" TEXT,
ADD COLUMN     "destinationEquipment" TEXT,
ADD COLUMN     "destinationFunctionKks" TEXT,
ADD COLUMN     "destinationGland" TEXT,
ADD COLUMN     "destinationInstallationKks" TEXT,
ADD COLUMN     "destinationRoom" TEXT,
ADD COLUMN     "diagram" TEXT,
ADD COLUMN     "lengthPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "level" "CableLevel",
ADD COLUMN     "looseEndTrayId" TEXT,
ADD COLUMN     "originCubicle" TEXT,
ADD COLUMN     "originEquipment" TEXT,
ADD COLUMN     "originFunctionKks" TEXT,
ADD COLUMN     "originGland" TEXT,
ADD COLUMN     "originInstallationKks" TEXT,
ADD COLUMN     "originRoom" TEXT,
ADD COLUMN     "revision" TEXT,
ADD COLUMN     "sourceDocument" TEXT,
ADD COLUMN     "sourcePage" INTEGER;

-- AlterTable
ALTER TABLE "cable_type" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "tray" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "TrayKind" NOT NULL,
    "voltageLevel" INTEGER,
    "elevationLevel" INTEGER,
    "areaCode" TEXT,
    "locationId" TEXT,
    "widthMm" INTEGER,
    "flangeHeightMm" INTEGER,
    "bendRadiusMm" INTEGER,
    "diameterMm" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tray_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tray_drawing" (
    "id" TEXT NOT NULL,
    "trayId" TEXT NOT NULL,
    "drawing" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "title" TEXT,
    "sourcePage" INTEGER,

    CONSTRAINT "tray_drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_route_step" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "trayId" TEXT,
    "section" "RouteSection",

    CONSTRAINT "cable_route_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tray_code_key" ON "tray"("code");

-- CreateIndex
CREATE INDEX "tray_areaCode_idx" ON "tray"("areaCode");

-- CreateIndex
CREATE INDEX "tray_locationId_idx" ON "tray"("locationId");

-- CreateIndex
CREATE INDEX "tray_code_trgm_idx" ON "tray" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "tray_drawing_trayId_drawing_sheet_key" ON "tray_drawing"("trayId", "drawing", "sheet");

-- CreateIndex
CREATE INDEX "cable_route_step_trayId_idx" ON "cable_route_step"("trayId");

-- CreateIndex
CREATE UNIQUE INDEX "cable_route_step_cableId_position_key" ON "cable_route_step"("cableId", "position");

-- CreateIndex
CREATE INDEX "cable_level_idx" ON "cable"("level");

-- CreateIndex
CREATE INDEX "cable_looseEndTrayId_idx" ON "cable"("looseEndTrayId");

-- CreateIndex
CREATE INDEX "cable_origin_equipment_trgm_idx" ON "cable" USING GIN ("originEquipment" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "cable_destination_equipment_trgm_idx" ON "cable" USING GIN ("destinationEquipment" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "cable_type_code_key" ON "cable_type"("code");

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_looseEndTrayId_fkey" FOREIGN KEY ("looseEndTrayId") REFERENCES "tray"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray" ADD CONSTRAINT "tray_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_drawing" ADD CONSTRAINT "tray_drawing_trayId_fkey" FOREIGN KEY ("trayId") REFERENCES "tray"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_route_step" ADD CONSTRAINT "cable_route_step_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_route_step" ADD CONSTRAINT "cable_route_step_trayId_fkey" FOREIGN KEY ("trayId") REFERENCES "tray"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Comprobaciones que Prisma no expresa.
ALTER TABLE "cable_route_step" ADD CONSTRAINT "cable_route_step_position_check" CHECK ("position" >= 1);
ALTER TABLE "tray" ADD CONSTRAINT "tray_voltage_level_check" CHECK ("voltageLevel" BETWEEN 1 AND 4);
ALTER TABLE "tray" ADD CONSTRAINT "tray_elevation_level_check" CHECK ("elevationLevel" BETWEEN 0 AND 9);
