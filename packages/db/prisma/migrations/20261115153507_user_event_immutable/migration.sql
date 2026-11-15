-- La auditoría de cuentas no se edita ni se borra, como el historial de los cables.
CREATE OR REPLACE FUNCTION "user_event_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'user_event es inmutable: la auditoría de cuentas no se modifica';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "user_event_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "user_event"
  FOR EACH ROW EXECUTE FUNCTION "user_event_immutable"();
