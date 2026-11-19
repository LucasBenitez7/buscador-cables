import "server-only";
import type { Prisma } from "@cables/db";
import {
  HISTORY_START,
  VISIBLE_EVENT_SOURCES,
  isVisibleEventSource,
  type CableEventSource,
} from "@cables/shared";
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

/**
 * Los eventos que se ven: desde el corte y nunca los de la carga del proyecto (fase 14). Las
 * dos reglas valen a la vez.
 */
export function visibleEventsWhere(): Prisma.CableEventWhereInput {
  return { createdAt: { gte: historyStart() }, source: { in: [...VISIBLE_EVENT_SOURCES] } };
}

export function isVisibleEvent(event: { createdAt: Date; source: CableEventSource }): boolean {
  return (
    event.createdAt.getTime() >= historyStart().getTime() && isVisibleEventSource(event.source)
  );
}

/**
 * La última acción de un cable, o null si no se ve: anterior al corte o escrita por la carga
 * del proyecto.
 */
export function visibleLastAction<T>(
  at: Date | null,
  source: CableEventSource,
  value: T,
): T | null {
  if (!at || !isVisibleEvent({ createdAt: at, source })) return null;
  return value;
}
