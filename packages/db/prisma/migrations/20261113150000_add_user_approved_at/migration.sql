-- Cuentas nuevas pendientes de que un administrador las apruebe.
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- Las cuentas que ya existían estaban aprobadas de hecho: entraban sin más requisito.
UPDATE "user" SET "approvedAt" = "createdAt";
