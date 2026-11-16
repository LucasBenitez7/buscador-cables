"use server";

import { revalidatePath } from "next/cache";
import { describeDuplicate, wiringEditSchema } from "@cables/shared";
import { CableServiceError } from "@/server/cables/service";
import { editWiring } from "@/server/cables/wiring";
import { logError } from "@/server/log";
import { authorize } from "@/server/session";

export type WiringEditActionResult =
  | { ok: true; message: string }
  /** Nothing saved: two wires share a terminal and the user has to confirm it. */
  | { ok: false; duplicates: string[]; message: string }
  | { ok: false; message: string };

/**
 * Saves the terminals corrected in the edit mode of the wiring table. Everything that comes
 * from the browser is checked again here: session, permission and the shape of the table
 * (Zod); the service checks the version and that the wires are the stored ones.
 */
export async function editWiringAction(input: unknown): Promise<WiringEditActionResult> {
  const auth = await authorize("cable:wiring");
  if (!auth.ok) return auth;

  const parsed = wiringEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  try {
    const result = await editWiring(auth.user, parsed.data);
    if (result.status === "duplicates") {
      return {
        ok: false,
        duplicates: result.duplicates.map(describeDuplicate),
        message: "Hay hilos en la misma borna. Revísalo o confirma que en campo está así.",
      };
    }
    revalidatePath(`/cables/${result.cableId}`);
    return {
      ok: true,
      message:
        result.status === "unchanged"
          ? "No había cambios que guardar."
          : `Bornas guardadas: ${result.changedWires === 1 ? "1 hilo corregido" : `${result.changedWires} hilos corregidos`}.`,
    };
  } catch (error) {
    if (error instanceof CableServiceError) return { ok: false, message: error.message };
    logError("cables", "Error al guardar las bornas", error);
    return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };
  }
}
