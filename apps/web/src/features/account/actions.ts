"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { changeOwnNameSchema, changePasswordSchema } from "@cables/shared";
import { firstIssue, formValue, type ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import { logError } from "@/server/log";
import { getCurrentUser } from "@/server/session";
import { UserServiceError, changeOwnName } from "@/server/users/service";

export type { ActionResult } from "@/lib/action-result";

const SESSION_EXPIRED: ActionResult = {
  ok: false,
  message: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
};

/** «Mi cuenta»: the signed-in person changes their own name (never somebody else's). */
export async function changeOwnNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const parsed = changeOwnNameSchema.safeParse({ name: formValue(formData, "name") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    const changed = await changeOwnName(user, parsed.data);
    // El nombre sale en la cabecera, el historial y las listas: todo se vuelve a pintar.
    revalidatePath("/", "layout");
    return { ok: true, message: changed ? "Nombre guardado." : "Ese ya es tu nombre." };
  } catch (error) {
    if (error instanceof UserServiceError) return { ok: false, message: error.message };
    logError("account", "Error al cambiar el nombre", error);
    return { ok: false, message: "No se pudo guardar el nombre. Inténtalo de nuevo." };
  }
}

/**
 * «Mi cuenta»: a new password, checked against the current one by Better Auth. The other
 * sessions are closed (a stolen session stops working) and this one goes on.
 */
export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formValue(formData, "currentPassword"),
    newPassword: formValue(formData, "newPassword"),
    confirmPassword: formValue(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const requestHeaders = await headers();
  try {
    // Sin `revokeOtherSessions` aquí: Better Auth cerraría también esta sesión y abriría otra
    // con una cookie nueva, y la página, que aún lee la vieja, mandaba al login (y de ahí al
    // inicio). Se cierran solo las demás, después.
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    return passwordError(error);
  }

  try {
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
  } catch (error) {
    logError("account", "Error al cerrar las otras sesiones", error);
    return {
      ok: true,
      message:
        "Contraseña cambiada, pero no se pudieron cerrar tus otras sesiones. Cierra sesión en los otros dispositivos.",
    };
  }
  return {
    ok: true,
    message: "Contraseña cambiada. Se han cerrado tus otras sesiones.",
  };
}

function passwordError(error: unknown): ActionResult {
  if (isAPIError(error)) {
    if (error.body?.code === "INVALID_PASSWORD") {
      return { ok: false, message: "La contraseña actual no es correcta." };
    }
    if (error.status === "TOO_MANY_REQUESTS") {
      return {
        ok: false,
        message: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
      };
    }
  }
  logError("account", "Error al cambiar la contraseña", error);
  return { ok: false, message: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
}
