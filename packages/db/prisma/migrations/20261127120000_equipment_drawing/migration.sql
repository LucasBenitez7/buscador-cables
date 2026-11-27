-- Fase 19: dónde está dibujado cada equipo.
-- CreateTable
CREATE TABLE "equipment_drawing" (
    "id" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "drawing" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "title" TEXT,
    "sourcePage" INTEGER,
    "drawnAs" TEXT NOT NULL,
    "marks" JSONB NOT NULL DEFAULT '[]',
    "sheetId" TEXT,

    CONSTRAINT "equipment_drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_drawing_sheetId_idx" ON "equipment_drawing"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_drawing_equipment_drawing_sheet_key" ON "equipment_drawing"("equipment", "drawing", "sheet");

-- AddForeignKey
ALTER TABLE "equipment_drawing" ADD CONSTRAINT "equipment_drawing_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "drawing_sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

