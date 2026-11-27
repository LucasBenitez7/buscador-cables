-- Fase 18: bobinas de los Excel del día.
-- AlterTable
ALTER TABLE "excel_import" ADD COLUMN     "reels" JSONB;

-- CreateTable
CREATE TABLE "reel" (
    "id" TEXT NOT NULL,
    "kind" "ExcelKind" NOT NULL,
    "key" TEXT NOT NULL,
    "drum" TEXT,
    "tag" TEXT,
    "code" TEXT,
    "request" TEXT,
    "description" TEXT,
    "voltage" TEXT,
    "pickedUpOn" DATE,
    "receivedM" DECIMAL(12,2),
    "usedM" DECIMAL(12,2),
    "remainingM" DECIMAL(12,2),
    "pulls" INTEGER,
    "pendingPulls" INTEGER,
    "pendingM" DECIMAL(12,2),
    "otherM" DECIMAL(12,2),
    "deliveredOn" DATE,
    "deliveredM" DECIMAL(12,2),
    "tracked" BOOLEAN NOT NULL,
    "pieces" INTEGER,
    "importId" TEXT NOT NULL,
    "excelDate" DATE NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reel_tag_idx" ON "reel"("tag");

-- CreateIndex
CREATE INDEX "reel_drum_idx" ON "reel"("drum");

-- CreateIndex
CREATE UNIQUE INDEX "reel_kind_key_key" ON "reel"("kind", "key");

-- AddForeignKey
ALTER TABLE "reel" ADD CONSTRAINT "reel_importId_fkey" FOREIGN KEY ("importId") REFERENCES "excel_import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

