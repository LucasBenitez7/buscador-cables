-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "actualLengthM" DECIMAL(10,2),
ADD COLUMN     "actualLengthTotalM" DECIMAL(10,2),
ADD COLUMN     "actualSections" INTEGER,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "laidOn" DATE,
ADD COLUMN     "reel" TEXT,
ADD COLUMN     "reelStatus" TEXT;

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_name_key" ON "company"("name");

-- CreateIndex
CREATE INDEX "cable_companyId_idx" ON "cable"("companyId");

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Como los demás catálogos: el nombre es único sin distinguir mayúsculas.
CREATE UNIQUE INDEX "company_name_lower_key" ON "company" (lower("name"));
