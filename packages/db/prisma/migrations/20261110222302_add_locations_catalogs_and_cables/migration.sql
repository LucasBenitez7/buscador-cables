-- Búsqueda tolerante a errores (índice GIN trigram sobre cable.code).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PLANT', 'AREA', 'UNIT', 'SITE');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('IN_STOCK', 'COILED', 'LAID', 'RETIRED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('DISCONNECTED', 'ORIGIN_ONLY', 'DESTINATION_ONLY', 'CONNECTED');

-- CreateEnum
CREATE TYPE "CableAction" AS ENUM ('CREATED', 'UPDATED', 'LAID', 'COILED', 'CONNECTED', 'DISCONNECTED', 'MOVED', 'RETIRED', 'CORRECTION');

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cable_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT,
    "colorId" TEXT,
    "manufacturerId" TEXT,
    "conductors" INTEGER,
    "crossSectionMm2" DECIMAL(8,2),
    "outerDiameterMm" DECIMAL(8,2),
    "lengthM" DECIMAL(10,2),
    "voltageRating" TEXT,
    "originId" TEXT,
    "destinationId" TEXT,
    "currentLocationId" TEXT,
    "installationStatus" "InstallationStatus" NOT NULL DEFAULT 'IN_STOCK',
    "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastAction" "CableAction",
    "lastActionById" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_event" (
    "id" TEXT NOT NULL,
    "cableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "CableAction" NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "changes" JSONB NOT NULL,
    "notes" TEXT,
    "correctsEventId" TEXT,
    "clientCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cable_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "location_code_key" ON "location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "location_path_key" ON "location"("path");

-- CreateIndex
CREATE INDEX "location_parentId_idx" ON "location"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "cable_type_name_key" ON "cable_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "color_name_key" ON "color"("name");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturer_name_key" ON "manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cable_code_key" ON "cable"("code");

-- CreateIndex
CREATE INDEX "cable_installationStatus_connectionStatus_idx" ON "cable"("installationStatus", "connectionStatus");

-- CreateIndex
CREATE INDEX "cable_originId_idx" ON "cable"("originId");

-- CreateIndex
CREATE INDEX "cable_destinationId_idx" ON "cable"("destinationId");

-- CreateIndex
CREATE INDEX "cable_currentLocationId_idx" ON "cable"("currentLocationId");

-- CreateIndex
CREATE INDEX "cable_typeId_idx" ON "cable"("typeId");

-- CreateIndex
CREATE INDEX "cable_colorId_idx" ON "cable"("colorId");

-- CreateIndex
CREATE INDEX "cable_manufacturerId_idx" ON "cable"("manufacturerId");

-- CreateIndex
CREATE INDEX "cable_lastActionById_lastActionAt_idx" ON "cable"("lastActionById", "lastActionAt");

-- CreateIndex
CREATE INDEX "cable_code_trgm_idx" ON "cable" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "cable_event_cableId_createdAt_idx" ON "cable_event"("cableId", "createdAt");

-- CreateIndex
CREATE INDEX "cable_event_userId_createdAt_idx" ON "cable_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "cable_event_action_createdAt_idx" ON "cable_event"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "cable_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_originId_fkey" FOREIGN KEY ("originId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_lastActionById_fkey" FOREIGN KEY ("lastActionById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable" ADD CONSTRAINT "cable_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_cableId_fkey" FOREIGN KEY ("cableId") REFERENCES "cable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cable_event" ADD CONSTRAINT "cable_event_correctsEventId_fkey" FOREIGN KEY ("correctsEventId") REFERENCES "cable_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El historial de cada cable es inmutable: los errores se corrigen con un evento
-- CORRECTION, nunca editando ni borrando eventos. Se impone también en la base de
-- datos para que ningún código (ni un script manual) pueda saltárselo.
CREATE FUNCTION "cable_event_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cable_event es inmutable: registra una corrección en lugar de modificarlo'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cable_event_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "cable_event"
  FOR EACH ROW EXECUTE FUNCTION "cable_event_immutable"();
