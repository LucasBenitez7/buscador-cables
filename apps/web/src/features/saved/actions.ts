"use server";

import { revalidatePath } from "next/cache";
import {
  SAVED_KIND_LABELS,
  createSavedFolderSchema,
  deleteSavedFolderSchema,
  moveSavedItemsSchema,
  renameSavedFolderSchema,
  saveItemsSchema,
  savedRefSchema,
} from "@cables/shared";
import { z } from "zod";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import { logError } from "@/server/log";
import {
  SavedServiceError,
  createFolder,
  deleteFolder,
  foldersFor,
  moveItems,
  renameFolder,
  saveItems,
} from "@/server/saved/service";
import { getCurrentUser } from "@/server/session";

const SAVED_PATH = "/saved";
const EXPIRED = "Tu sesión ha caducado. Vuelve a iniciar sesión.";

function fail(error: unknown): { ok: false; message: string } {
  if (error instanceof SavedServiceError) return { ok: false, message: error.message };
  logError("saved", "Error en los guardados", error);
  return { ok: false, message: "No se pudo completar. Inténtalo de nuevo." };
}

/** Guardados are each person's own: any signed-in person, whatever their role. */
async function currentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function createFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = createSavedFolderSchema.safeParse({ name: formValue(formData, "name") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await createFolder(userId, parsed.data.name);
    revalidatePath(SAVED_PATH);
    return { ok: true, message: `Carpeta «${parsed.data.name}» creada.` };
  } catch (error) {
    return fail(error);
  }
}

export async function renameFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = renameSavedFolderSchema.safeParse({
    id: formValue(formData, "id"),
    name: formValue(formData, "name"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await renameFolder(userId, parsed.data.id, parsed.data.name);
    revalidatePath(SAVED_PATH, "layout");
    return { ok: true, message: `Ahora se llama «${parsed.data.name}».` };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteFolderAction(id: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = deleteSavedFolderSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const { name } = await deleteFolder(userId, parsed.data.id);
    revalidatePath(SAVED_PATH, "layout");
    return { ok: true, message: `Carpeta «${name}» borrada.` };
  } catch (error) {
    return fail(error);
  }
}

export type FolderChoice = { id: string; name: string; holds: number };

/** The folders for the «Guardar» dialog, with how many of `refs` each one already holds. */
export async function foldersForAction(
  refs: unknown,
): Promise<{ ok: true; folders: FolderChoice[] } | { ok: false; message: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = z.array(savedRefSchema).min(1).max(5000).safeParse(refs);
  if (!parsed.success) return { ok: false, message: "No se pudo leer lo elegido." };
  try {
    return { ok: true, folders: await foldersFor(userId, parsed.data) };
  } catch (error) {
    return fail(error);
  }
}

/** «Guardar»: puts what is chosen in the folders ticked and takes it out of those unticked. */
export async function saveItemsAction(input: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = saveItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const { saved, folders } = await saveItems(userId, parsed.data);
    revalidatePath(SAVED_PATH, "layout");
    if (folders.length === 0) return { ok: true, message: "Guardados actualizados." };
    const what =
      saved === 1
        ? `1 ${SAVED_KIND_LABELS[parsed.data.refs[0]!.kind].singular}`
        : `${saved.toLocaleString("es-ES")} ${SAVED_KIND_LABELS[parsed.data.refs[0]!.kind].plural.toLowerCase()}`;
    return {
      ok: true,
      message: `${what} en ${folders.map((name) => `«${name}»`).join(", ")}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Takes things out of a folder, or moves them to another one. */
export async function moveItemsAction(input: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: EXPIRED };
  const parsed = moveSavedItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const { moved, to } = await moveItems(userId, parsed.data);
    revalidatePath(SAVED_PATH, "layout");
    const what = moved === 1 ? "1 elemento" : `${moved.toLocaleString("es-ES")} elementos`;
    const done = moved === 1 ? (to ? "movido" : "quitado") : to ? "movidos" : "quitados";
    return { ok: true, message: to ? `${what} ${done} a «${to}».` : `${what} ${done}.` };
  } catch (error) {
    return fail(error);
  }
}
