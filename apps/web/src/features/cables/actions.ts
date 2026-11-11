"use server";

import { revalidatePath } from "next/cache";
import {
  CABLE_ACTION_PERMISSIONS,
  CABLE_EDITABLE_FIELDS,
  CABLE_FIELD_ACTIONS,
  cableActionSchema,
  createCableSchema,
  deleteCableSchema,
  updateCableSchema,
  type CableFieldAction,
} from "@cables/shared";
import { firstIssue, formValue, issuesByField } from "@/lib/action-result";
import { runCableAction } from "@/server/cables/field-actions";
import { CableServiceError, createCable, deleteCable, updateCable } from "@/server/cables/service";
import { authorize } from "@/server/session";

export type CableFormResult =
  | { ok: true; message: string; id: string; changed?: boolean }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const CABLES_PATH = "/cables";

function fail(error: unknown): CableFormResult {
  if (error instanceof CableServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Error en la gestión de cables", error);
  return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };
}

function read(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, formValue(formData, key)]));
}

function invalid(error: Parameters<typeof issuesByField>[0]): CableFormResult {
  return {
    ok: false,
    message: "Revisa los campos marcados.",
    fieldErrors: issuesByField(error),
  };
}

export async function createCableAction(formData: FormData): Promise<CableFormResult> {
  const auth = await authorize("cable:create");
  if (!auth.ok) {
    return auth;
  }

  const parsed = createCableSchema.safeParse(
    read(formData, [
      ...CABLE_EDITABLE_FIELDS,
      "installationStatus",
      "connectionStatus",
      "currentLocationId",
    ]),
  );
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  try {
    const cable = await createCable(auth.user, parsed.data);
    revalidatePath(CABLES_PATH);
    return { ok: true, message: `Cable ${cable.code} dado de alta.`, id: cable.id };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCableAction(formData: FormData): Promise<CableFormResult> {
  const auth = await authorize("cable:update");
  if (!auth.ok) {
    return auth;
  }

  const parsed = updateCableSchema.safeParse(
    read(formData, [...CABLE_EDITABLE_FIELDS, "id", "version"]),
  );
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  try {
    const { changed } = await updateCable(auth.user, parsed.data);
    revalidatePath(CABLES_PATH);
    revalidatePath(`${CABLES_PATH}/${parsed.data.id}/edit`);
    return {
      ok: true,
      message: changed ? "Cambios guardados." : "No había cambios que guardar.",
      id: parsed.data.id,
      changed,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCableAction(formData: FormData): Promise<CableFormResult> {
  const auth = await authorize("cable:delete");
  if (!auth.ok) {
    return auth;
  }

  const parsed = deleteCableSchema.safeParse(read(formData, ["id", "version", "reason"]));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    await deleteCable(auth.user, parsed.data);
    revalidatePath(CABLES_PATH);
    return { ok: true, message: "Cable dado de baja.", id: parsed.data.id };
  } catch (error) {
    return fail(error);
  }
}

const ACTION_FIELDS = [
  "cableId",
  "version",
  "action",
  "notes",
  "locationId",
  "end",
  "correctsEventId",
  "installationStatus",
  "connectionStatus",
  "currentLocationId",
] as const;

function isFieldAction(value: string): value is CableFieldAction {
  return (CABLE_FIELD_ACTIONS as readonly string[]).includes(value);
}

/** Lay, coil, connect, disconnect, move, retire or correct a cable (phase 5). */
export async function runCableActionAction(formData: FormData): Promise<CableFormResult> {
  const action = formValue(formData, "action");
  if (!isFieldAction(action)) {
    return { ok: false, message: "Acción no válida." };
  }

  // Each action has its own permission: a technician can connect but not retire.
  const auth = await authorize(CABLE_ACTION_PERMISSIONS[action]);
  if (!auth.ok) {
    return auth;
  }

  const parsed = cableActionSchema.safeParse(read(formData, ACTION_FIELDS));
  if (!parsed.success) {
    return invalid(parsed.error);
  }

  try {
    const result = await runCableAction(auth.user, parsed.data);
    revalidatePath(CABLES_PATH);
    revalidatePath(`${CABLES_PATH}/${result.cableId}`);
    return { ok: true, message: result.message, id: result.cableId };
  } catch (error) {
    return fail(error);
  }
}
