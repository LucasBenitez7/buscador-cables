"use server";

import { revalidatePath } from "next/cache";
import { changeRoleSchema, createUserSchema, setUserActiveSchema } from "@cables/shared";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import { authorize } from "@/server/session";
import {
  UserServiceError,
  changeUserRole,
  createUser,
  setUserActive,
} from "@/server/users/service";

export type { ActionResult } from "@/lib/action-result";

const USERS_PATH = "/admin/users";

function fail(error: unknown): ActionResult {
  if (error instanceof UserServiceError) {
    return { ok: false, message: error.message };
  }
  console.error("Error en la gestión de usuarios", error);
  return { ok: false, message: "No se pudo completar la operación. Inténtalo de nuevo." };
}

export async function createUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorize("user:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = createUserSchema.safeParse({
    name: formValue(formData, "name"),
    email: formValue(formData, "email"),
    role: formValue(formData, "role"),
    password: formValue(formData, "password"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    await createUser(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    return { ok: true, message: `Usuario ${parsed.data.email} creado.` };
  } catch (error) {
    return fail(error);
  }
}

export async function changeRoleAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("user:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = changeRoleSchema.safeParse({
    userId: formValue(formData, "userId"),
    role: formValue(formData, "role"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos no válidos." };
  }

  try {
    await changeUserRole(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    return { ok: true, message: "Rol actualizado." };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserActiveAction(formData: FormData): Promise<ActionResult> {
  const auth = await authorize("user:manage");
  if (!auth.ok) {
    return auth;
  }

  const parsed = setUserActiveSchema.safeParse({
    userId: formValue(formData, "userId"),
    active: formValue(formData, "active") === "true",
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos no válidos." };
  }

  try {
    await setUserActive(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    return {
      ok: true,
      message: parsed.data.active ? "Usuario reactivado." : "Usuario desactivado.",
    };
  } catch (error) {
    return fail(error);
  }
}
