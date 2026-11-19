-- AlterTable
ALTER TABLE "cable" ADD COLUMN     "lastActionSource" "CableEventSource" NOT NULL DEFAULT 'APP';

-- La última acción de cada cable toma el origen del evento que la escribió (misma acción y
-- misma hora). La carga de los listados crea el cable y su evento con la misma hora.
UPDATE "cable" AS c
SET "lastActionSource" = e."source"
FROM "cable_event" AS e
WHERE e."cableId" = c."id"
  AND c."lastAction" IS NOT NULL
  AND e."action" = c."lastAction"
  AND e."createdAt" = c."lastActionAt"
  AND e."source" <> 'APP';
