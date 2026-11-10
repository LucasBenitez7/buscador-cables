-- Usa el código de error genérico (P0001) para que el mensaje llegue tal cual a
-- la aplicación; con `restrict_violation` Prisma lo mostraba como un error de
-- clave foránea.
CREATE OR REPLACE FUNCTION "cable_event_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cable_event es inmutable: registra una corrección en lugar de modificarlo';
END;
$$ LANGUAGE plpgsql;
