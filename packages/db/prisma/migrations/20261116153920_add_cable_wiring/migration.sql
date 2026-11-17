-- AlterEnum
ALTER TYPE "CableAction" ADD VALUE 'WIRING_EDITED';

-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "wiringRevision" TEXT;

-- CreateTable
CREATE TABLE "cable_wire" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wire" TEXT NOT NULL,
    "colour" TEXT,
    "originBlock" TEXT,
    "originPoint" TEXT,
    "destinationBlock" TEXT,
    "destinationPoint" TEXT,
    "pdfOriginBlock" TEXT,
    "pdfOriginPoint" TEXT,
    "pdfDestinationBlock" TEXT,
    "pdfDestinationPoint" TEXT,

    CONSTRAINT "cable_wire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_jumper" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fromBlock" TEXT,
    "fromPoint" TEXT,
    "toBlock" TEXT,
    "toPoint" TEXT,

    CONSTRAINT "cable_jumper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cable_wire_cableId_position_key" ON "cable_wire"("cableId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "cable_jumper_cableId_position_key" ON "cable_jumper"("cableId", "position");

-- AddForeignKey
ALTER TABLE "cable_wire" ADD CONSTRAINT "cable_wire_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_jumper" ADD CONSTRAINT "cable_jumper_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
