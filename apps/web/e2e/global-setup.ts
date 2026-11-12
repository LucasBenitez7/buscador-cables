import { runDbScript } from "./support/db";
import { clearMailbox } from "./support/mailpit";

/** Crea `cables_e2e` si no existe, la migra, carga datos conocidos y vacía el buzón. */
export default async function globalSetup() {
  runDbScript("prepare");
  await clearMailbox();
}
