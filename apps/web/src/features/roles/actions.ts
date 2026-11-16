"use server";

import { revalidatePath } from "next/cache";
import {
  createRoleSchema,
  deleteRoleSchema,
  updateRoleSchema,
  userGrantsSchema,
} from "@cables/shared";
import { logError } from "@/server/log";
import {
  RoleServiceError,
  createRole,
  deleteRole,
  setUserGrants,
  updateRole,
} from "@/server/roles/service";
import { authorize } from "@/server/session";

export type RoleActionResult =
  { ok: true; message: string; id?: string } | { ok: false; message: string };

/**
 * Everything that changes roles or extra permissions. Whatever the browser sends is checked
 * here again: session, the "gestionar roles" permission (only the administrator role has it)
 * and the shape with Zod; the service checks the rest (locked role, version, people).
 */
async function run(
  input: unknown,
  schema: {
    safeParse: (
      value: unknown,
    ) =>
      | { success: true; data: unknown }
      | { success: false; error: { issues: { message: string }[] } };
  },
  task: (
    actor: Awaited<ReturnType<typeof authorize>> & { ok: true },
    data: never,
  ) => Promise<RoleActionResult>,
): Promise<RoleActionResult> {
  const auth = await authorize("role:manage");
  if (!auth.ok) return auth;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  try {
    const result = await task(auth, parsed.data as never);
    revalidatePath("/admin/roles");
    revalidatePath("/admin/users");
    return result;
  } catch (error) {
    if (error instanceof RoleServiceError) return { ok: false, message: error.message };
    logError("roles", "Error al gestionar roles", error);
    return { ok: false, message: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

export async function createRoleAction(input: unknown): Promise<RoleActionResult> {
  return run(input, createRoleSchema, async ({ user }, data: Parameters<typeof createRole>[1]) => {
    const role = await createRole(user, data);
    return { ok: true, message: `Rol «${role.name}» creado.`, id: role.id };
  });
}

export async function updateRoleAction(input: unknown): Promise<RoleActionResult> {
  return run(input, updateRoleSchema, async ({ user }, data: Parameters<typeof updateRole>[1]) => {
    const role = await updateRole(user, data);
    revalidatePath(`/admin/roles/${role.id}`);
    return { ok: true, message: `Rol «${role.name}» guardado.`, id: role.id };
  });
}

export async function deleteRoleAction(input: unknown): Promise<RoleActionResult> {
  return run(input, deleteRoleSchema, async ({ user }, data: Parameters<typeof deleteRole>[1]) => {
    await deleteRole(user, data);
    return { ok: true, message: "Rol borrado." };
  });
}

export async function setUserGrantsAction(input: unknown): Promise<RoleActionResult> {
  return run(
    input,
    userGrantsSchema,
    async ({ user }, data: Parameters<typeof setUserGrants>[1]) => {
      const changed = await setUserGrants(user, data);
      revalidatePath(`/admin/users/${data.userId}`);
      return {
        ok: true,
        message: changed ? "Permisos extra guardados." : "No había cambios que guardar.",
      };
    },
  );
}
