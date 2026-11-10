"use server";

import { revalidatePath } from "next/cache";
import {
  createLocationSchema,
  deleteLocationSchema,
  moveLocationSchema,
  updateLocationSchema,
} from "@cables/shared";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import {
  LocationServiceError,
  createLocation,
  deleteLocation,
  moveLocation,
  updateLocation,
} from "@/server/locations/service";
import { authorize } from "@/server/session";

const LOCATIONS_PATH = "/locations";

function fail(error: unknown): ActionResult {
  if (error instanceof LocationServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Error en la gestión de ubicaciones", error);
  return { ok: false, message: "No se pudo completar la operación. Inténtalo de nuevo." };
}

export async function createLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorize("location:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = createLocationSchema.safeParse({
    name: formValue(formData, "name"),
    code: formValue(formData, "code"),
    type: formValue(formData, "type"),
    parentId: formValue(formData, "parentId") || null,
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    const location = await createLocation(parsed.data);
    revalidatePath(LOCATIONS_PATH);
    return { ok: true, message: `"${location.name}" creada.` };
  } catch (error) {
    return fail(error);
  }
}

export async function updateLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorize("location:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = updateLocationSchema.safeParse({
    id: formValue(formData, "id"),
    name: formValue(formData, "name"),
    code: formValue(formData, "code"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    await updateLocation(parsed.data);
    revalidatePath(LOCATIONS_PATH);
    return { ok: true, message: "Ubicación actualizada." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteLocationAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("location:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = deleteLocationSchema.safeParse({ id: formValue(formData, "id") });
  if (!parsed.success) {
    return { ok: false, message: "Datos no válidos." };
  }

  try {
    await deleteLocation(parsed.data.id);
    revalidatePath(LOCATIONS_PATH);
    return { ok: true, message: "Ubicación eliminada." };
  } catch (error) {
    return fail(error);
  }
}

export async function moveLocationAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("location:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = moveLocationSchema.safeParse({
    id: formValue(formData, "id"),
    parentId: formValue(formData, "parentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    await moveLocation(parsed.data);
    revalidatePath(LOCATIONS_PATH);
    return { ok: true, message: "Ubicación movida." };
  } catch (error) {
    return fail(error);
  }
}
