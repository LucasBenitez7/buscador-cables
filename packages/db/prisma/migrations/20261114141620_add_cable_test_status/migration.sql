-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('NOT_TESTED', 'TESTED_OK', 'TESTED_FAILED');

-- AlterEnum
ALTER TYPE "CableAction" ADD VALUE 'TESTED';

-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "testStatus" "TestStatus" NOT NULL DEFAULT 'NOT_TESTED';
