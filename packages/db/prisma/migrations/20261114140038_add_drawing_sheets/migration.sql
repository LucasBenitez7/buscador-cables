-- AlterTable
ALTER TABLE "tray_drawing" ADD COLUMN     "marks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "sheetId" TEXT;

-- CreateTable
CREATE TABLE "drawing_sheet" (
    "id" TEXT NOT NULL,
    "drawing" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "title" TEXT,
    "sourcePage" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "imageKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawing_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drawing_sheet_imageKey_key" ON "drawing_sheet"("imageKey");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_sheet_drawing_sheet_key" ON "drawing_sheet"("drawing", "sheet");

-- CreateIndex
CREATE INDEX "tray_drawing_sheetId_idx" ON "tray_drawing"("sheetId");

-- AddForeignKey
ALTER TABLE "tray_drawing" ADD CONSTRAINT "tray_drawing_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "drawing_sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
