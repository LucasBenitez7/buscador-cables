"use server";

import { revalidatePath } from "next/cache";
import {
  createCatalogItemSchema,
  deleteCatalogItemSchema,
  updateCatalogItemSchema,
} from "@cables/shared";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import {
  CatalogServiceError,
  createCatalogItem,
  deleteCatalogItem,
  updateCatalogItem,
} from "@/server/catalogs/service";
import { authorize } from "@/server/session";

const CATALOGS_PATH = "/catalogs";

function fail(error: unknown): ActionResult {
  if (error instanceof CatalogServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Error en la gestión de catálogos", error);
  return { ok: false, message: "No se pudo completar la operación. Inténtalo de nuevo." };
}

function fields(formData: FormData) {
  return {
    kind: formValue(formData, "kind"),
    name: formValue(formData, "name"),
    hex: formValue(formData, "hex"),
  };
}

export async function createCatalogItemAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("catalog:manage");
  if (!auth.ok) {
    return auth;
  }
  const parsed = createCatalogItemSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }
  try {
    const item = await createCatalogItem(parsed.data);
    revalidatePath(CATALOGS_PATH);
    return { ok: true, message: `"${item.name}" añadido.` };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCatalogItemAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("catalog:manage");
  if (!auth.ok) {
    return auth;
  }
  const parsed = updateCatalogItemSchema.safeParse({
    ...fields(formData),
    id: formValue(formData, "id"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }
  try {
    await updateCatalogItem(parsed.data);
    revalidatePath(CATALOGS_PATH);
    return { ok: true, message: "Guardado." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCatalogItemAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("catalog:manage");
  if (!auth.ok) {
    return auth;
  }
  const parsed = deleteCatalogItemSchema.safeParse({
    kind: formValue(formData, "kind"),
    id: formValue(formData, "id"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos no válidos." };
  }
  try {
    await deleteCatalogItem(parsed.data.kind, parsed.data.id);
    revalidatePath(CATALOGS_PATH);
    return { ok: true, message: "Eliminado." };
  } catch (error) {
    return fail(error);
  }
}
