"use server";

import { parseTraySearch } from "@cables/shared";
import type { SelectAllResult } from "@/components/selection";
import { logError } from "@/server/log";
import { SELECT_ALL_TOO_MANY } from "@/server/select-all";
import { getCurrentUser } from "@/server/session";
import { searchTrayCodes } from "@/server/trays/service";

/**
 * «Seleccionar todas las que cumplen los filtros» in the tray list. `query` is the list's own
 * query string (`?q=…&kind=…`), read again here like the page reads it.
 */
export async function selectAllTraysAction(query: unknown): Promise<SelectAllResult> {
  if (!(await getCurrentUser())) {
    return { ok: false, message: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }
  if (typeof query !== "string" || query.length > 500) {
    return { ok: false, message: "No se pudieron leer los filtros." };
  }
  try {
    const codes = await searchTrayCodes(
      parseTraySearch(Object.fromEntries(new URLSearchParams(query))),
    );
    if (codes === null) return { ok: false, message: SELECT_ALL_TOO_MANY };
    return { ok: true, items: codes.map((code) => ({ key: code, label: code })) };
  } catch (error) {
    logError("trays", "Error al seleccionar todas las bandejas", error);
    return { ok: false, message: "No se pudieron seleccionar. Inténtalo de nuevo." };
  }
}
