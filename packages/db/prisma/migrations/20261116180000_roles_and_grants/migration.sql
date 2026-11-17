-- Fase 12: roles y permisos desde la web.

-- Roles: los cuatro de siempre, con los permisos que tenían en el código, y los que cree el
-- administrador. "role:manage" (gestionar roles) solo lo tiene Administrador, como "user:manage".
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

INSERT INTO "role" ("id", "name", "description", "permissions", "locked", "system", "updatedAt") VALUES
  ('VIEWER', 'Consulta', 'Consulta sin cambiar nada.',
   ARRAY['cable:read', 'export:run'], false, true, CURRENT_TIMESTAMP),
  ('TECHNICIAN', 'Técnico', 'Trabajo en campo: registrar lo que se hace con cada cable.',
   ARRAY['cable:read', 'export:run', 'cable:create', 'cable:update', 'cable:lay', 'cable:coil',
         'cable:connect', 'cable:disconnect', 'cable:move', 'cable:test', 'cable:wiring'],
   false, true, CURRENT_TIMESTAMP),
  ('SUPERVISOR', 'Supervisor', 'Coordina la obra: supervisar y ordenar los datos.',
   ARRAY['cable:read', 'export:run', 'cable:create', 'cable:update', 'cable:lay', 'cable:coil',
         'cable:connect', 'cable:disconnect', 'cable:move', 'cable:test', 'cable:wiring',
         'cable:retire', 'cable:correct', 'activity:view', 'location:manage', 'catalog:manage',
         'import:run'],
   false, true, CURRENT_TIMESTAMP),
  ('ADMIN', 'Administrador', 'Gestiona la aplicación: todo, más las cuentas y los roles.',
   ARRAY['cable:read', 'export:run', 'cable:create', 'cable:update', 'cable:lay', 'cable:coil',
         'cable:connect', 'cable:disconnect', 'cable:move', 'cable:test', 'cable:wiring',
         'cable:retire', 'cable:correct', 'activity:view', 'location:manage', 'catalog:manage',
         'import:run', 'cable:delete', 'user:manage', 'role:manage'],
   true, true, CURRENT_TIMESTAMP);

-- Cada usuario apunta a su rol por su id; los de siempre conservan el valor que tenían.
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
ALTER TABLE "user" ADD CONSTRAINT "user_role_fkey" FOREIGN KEY ("role") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Auditoría: los roles pasan a ser ids, y caben los cambios de un rol (sin persona afectada).
ALTER TABLE "user_event" ALTER COLUMN "fromRole" TYPE TEXT USING "fromRole"::TEXT;
ALTER TABLE "user_event" ALTER COLUMN "toRole" TYPE TEXT USING "toRole"::TEXT;
ALTER TABLE "user_event" ALTER COLUMN "targetId" DROP NOT NULL;
ALTER TABLE "user_event" ADD COLUMN "roleId" TEXT;
ALTER TABLE "user_event" ADD COLUMN "details" JSONB;
CREATE INDEX "user_event_action_createdAt_idx" ON "user_event"("action", "createdAt");

ALTER TYPE "UserEventAction" ADD VALUE 'PERMISSIONS_CHANGED';
ALTER TYPE "UserEventAction" ADD VALUE 'ROLE_CREATED';
ALTER TYPE "UserEventAction" ADD VALUE 'ROLE_UPDATED';
ALTER TYPE "UserEventAction" ADD VALUE 'ROLE_DELETED';

DROP TYPE "Role";

-- Permisos extra de cada persona.
CREATE TABLE "user_permission_grant" (
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_grant_pkey" PRIMARY KEY ("userId", "permission")
);

ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_grant" ADD CONSTRAINT "user_permission_grant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nadie puede dar la gestión de cuentas o de roles fuera del rol Administrador, ni siquiera
-- con una petición directa a la base: la última barrera, además de la app.
CREATE OR REPLACE FUNCTION "role_protected_permissions"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" <> 'ADMIN' AND NEW."permissions" && ARRAY['user:manage', 'role:manage'] THEN
    RAISE EXCEPTION 'Solo el rol Administrador puede gestionar cuentas y roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "role_protected_permissions_check"
  BEFORE INSERT OR UPDATE ON "role"
  FOR EACH ROW EXECUTE FUNCTION "role_protected_permissions"();

CREATE OR REPLACE FUNCTION "grant_protected_permissions"() RETURNS trigger AS $$
BEGIN
  IF NEW."permission" IN ('user:manage', 'role:manage') THEN
    RAISE EXCEPTION 'La gestión de cuentas y de roles no se da como permiso extra';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "grant_protected_permissions_check"
  BEFORE INSERT OR UPDATE ON "user_permission_grant"
  FOR EACH ROW EXECUTE FUNCTION "grant_protected_permissions"();
