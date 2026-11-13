-- Tendido a medias (fase 7): el cable llega a un extremo y la otra punta espera en una bandeja.

-- CreateEnum
CREATE TYPE "CableEndSide" AS ENUM ('ORIGIN', 'DESTINATION');

-- AlterEnum (en el orden en que se muestran)
ALTER TYPE "CableAction" ADD VALUE 'PARTIALLY_LAID' BEFORE 'COILED';

-- AlterEnum
ALTER TYPE "InstallationStatus" ADD VALUE 'PARTIALLY_LAID' BEFORE 'LAID';

-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "looseEnd" "CableEndSide";

-- Un cable tendido a medias, y solo él, dice qué punta quedó suelta y en qué bandeja.
-- Se compara como texto porque el valor nuevo del enum no se puede usar en la misma transacción.
ALTER TABLE "cable" ADD CONSTRAINT "cable_loose_end_check" CHECK (
  ("installationStatus"::text = 'PARTIALLY_LAID') =
  ("looseEnd" IS NOT NULL AND "looseEndTrayId" IS NOT NULL)
  AND ("looseEnd" IS NULL) = ("looseEndTrayId" IS NULL)
);
