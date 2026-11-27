-- Fase 18: tiradas de las bobinas.
-- AlterTable
ALTER TABLE "excel_import" ADD COLUMN     "reelPullCount" INTEGER;

-- CreateTable
CREATE TABLE "reel_pull" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "kind" "ExcelKind" NOT NULL,
    "row" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "conductor" TEXT,
    "circuit" INTEGER,
    "tag" TEXT,
    "drum" TEXT,
    "startM" DECIMAL(12,2),
    "endM" DECIMAL(12,2),
    "pulledM" DECIMAL(12,2),
    "pulledOn" DATE,

    CONSTRAINT "reel_pull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reel_pull_importId_idx" ON "reel_pull"("importId");

-- CreateIndex
CREATE INDEX "reel_pull_kind_tag_idx" ON "reel_pull"("kind", "tag");

-- CreateIndex
CREATE INDEX "reel_pull_code_idx" ON "reel_pull"("code");

-- AddForeignKey
ALTER TABLE "reel_pull" ADD CONSTRAINT "reel_pull_importId_fkey" FOREIGN KEY ("importId") REFERENCES "excel_import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

