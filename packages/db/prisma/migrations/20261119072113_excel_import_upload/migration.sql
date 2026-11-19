-- AlterEnum
ALTER TYPE "ExcelImportStatus" ADD VALUE 'UPLOADING';

-- AlterTable
ALTER TABLE "excel_import" ADD COLUMN     "receivedCount" INTEGER NOT NULL DEFAULT 0;
