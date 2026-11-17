import "server-only";
import { HISTORY_START } from "@cables/shared";
import { z } from "zod";

/**
 * Fecha desde la que se muestra el historial. `HISTORY_START` en el entorno la cambia (los
 * tests de integración la ponen en 1970 para usar fechas fijas). Si falta o no es una fecha,
 * vale la constante de `@cables/shared`.
 */
const historyStartSchema = z.coerce.date().catch(HISTORY_START);

export function historyStart(): Date {
  return historyStartSchema.parse(process.env.HISTORY_START);
}

/** Una última acción anterior a `historyStart()` no se muestra: devuelve null. */
export function visibleLastAction<T>(at: Date | null, value: T): T | null {
  if (!at || at.getTime() < historyStart().getTime()) return null;
  return value;
}
