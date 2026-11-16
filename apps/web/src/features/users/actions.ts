"use server";

import { revalidatePath } from "next/cache";
import { changeRoleSchema, createUserSchema, setUserActiveSchema } from "@cables/shared";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import { notifyAccountChange } from "@/server/account-notifications";
import { authorize } from "@/server/session";
import {
  UserServiceError,
  changeUserRole,
  createUser,
  setUserActive,
} from "@/server/users/service";
import { logError } from "@/server/log";

export type { ActionResult } from "@/lib/action-result";

const USERS_PATH = "/admin/users";

function fail(error: unknown): ActionResult {
  if (error instanceof UserServiceError) {
    return { ok: false, message: error.message };
  }
  logError("users", "Error en la gestión de usuarios", error);
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
    const created = await createUser(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    await notifyAccountChange(
      { action: "CREATED", user: created, toRole: created.role },
      auth.user,
    );
    return {
      ok: true,
      message: `Usuario ${parsed.data.email} creado. Se le ha enviado un correo de bienvenida.`,
    };
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
    const change = await changeUserRole(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    if (!change) {
      return { ok: true, message: "Ya tenía ese rol." };
    }
    await notifyAccountChange(change, auth.user);
    return { ok: true, message: "Rol actualizado. Se le ha avisado por correo." };
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
    role: formValue(formData, "role") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Datos no válidos." };
  }

  try {
    const change = await setUserActive(auth.user, parsed.data);
    revalidatePath(USERS_PATH);
    // El correo no bloquea el cambio: `sendEmail` registra el fallo y no lo propaga.
    await notifyAccountChange(change, auth.user);
    const messages = {
      APPROVED: "Cuenta aprobada. Se ha avisado al usuario por correo.",
      REACTIVATED: "Usuario reactivado. Se le ha avisado por correo.",
      DEACTIVATED: "Usuario desactivado. Se le ha avisado por correo.",
    } as const;
    return {
      ok: true,
      message: messages[change.action as keyof typeof messages] ?? "Hecho.",
    };
  } catch (error) {
    return fail(error);
  }
}
