-- Estados finales (fase 14): «En almacén» y «Enrollado» pasan a «No tendido». «Sin revisar» se
-- queda para los cables que no salen en ningún Excel. La ubicación actual se conserva sin uso.

ALTER TYPE "InstallationStatus" RENAME TO "InstallationStatus_old";
CREATE TYPE "InstallationStatus" AS ENUM ('UNVERIFIED', 'NOT_LAID', 'PARTIALLY_LAID', 'LAID', 'RETIRED');

ALTER TABLE "cable" ALTER COLUMN "installationStatus" DROP DEFAULT;
ALTER TABLE "cable" ALTER COLUMN "installationStatus" TYPE "InstallationStatus" USING (
  CASE
    WHEN "installationStatus"::text IN ('IN_STOCK', 'COILED') THEN 'NOT_LAID'
    ELSE "installationStatus"::text
  END
)::"InstallationStatus";
ALTER TABLE "cable" ALTER COLUMN "installationStatus" SET DEFAULT 'NOT_LAID';

DROP TYPE "InstallationStatus_old";

-- «Enrollar» y «Mover» ya no existen: sus permisos salen de los roles y de los permisos extra.
UPDATE "role"
SET "permissions" = array_remove(array_remove("permissions", 'cable:coil'), 'cable:move')
WHERE "permissions" && ARRAY['cable:coil', 'cable:move'];
DELETE FROM "user_permission_grant" WHERE "permission" IN ('cable:coil', 'cable:move');
