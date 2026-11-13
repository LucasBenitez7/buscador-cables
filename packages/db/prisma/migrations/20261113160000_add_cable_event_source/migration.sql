-- Origen de cada evento del historial: una persona en la app o la carga de los listados.
-- CreateEnum
CREATE TYPE "CableEventSource" AS ENUM ('APP', 'PROJECT_LOAD');

-- AlterTable
ALTER TABLE "cable_event" ADD COLUMN     "source" "CableEventSource" NOT NULL DEFAULT 'APP';

-- Los eventos que ya escribió la carga solo se reconocen por su nota. El historial es
-- inmutable (trigger), así que se desactiva solo para marcar esta columna nueva: ningún
-- otro dato cambia.
ALTER TABLE "cable_event" DISABLE TRIGGER "cable_event_no_update_or_delete";

UPDATE "cable_event"
SET "source" = 'PROJECT_LOAD'
WHERE "notes" LIKE 'Cargado de los listados del proyecto (%'
   OR "notes" LIKE 'Actualizado desde los listados del proyecto (%';

ALTER TABLE "cable_event" ENABLE TRIGGER "cable_event_no_update_or_delete";
