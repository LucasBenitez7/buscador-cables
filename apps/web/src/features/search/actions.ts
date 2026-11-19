"use server";

import { cableSearchSchema } from "@cables/shared";
import type { SelectAllResult } from "@/components/selection";
import { searchCableCodes } from "@/server/cables/search";
import { SELECT_ALL_TOO_MANY } from "@/server/select-all";
import { getCurrentUser } from "@/server/session";
import { logError } from "@/server/log";

/** «Seleccionar las N que cumplen los filtros» in the cable search: every matching code. */
export async function selectAllCablesAction(raw: unknown): Promise<SelectAllResult> {
  if (!(await getCurrentUser())) {
    return { ok: false, message: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }
  const parsed = cableSearchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "No se pudieron leer los filtros." };
  }
  try {
    const cables = await searchCableCodes(parsed.data);
    if (cables === null) {
      return { ok: false, message: SELECT_ALL_TOO_MANY };
    }
    return { ok: true, items: cables.map((cable) => ({ key: cable.id, label: cable.code })) };
  } catch (error) {
    logError("search", "Error al seleccionar todos los cables", error);
    return { ok: false, message: "No se pudieron seleccionar. Inténtalo de nuevo." };
  }
}
