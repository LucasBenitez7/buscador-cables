/**
 * What the administrator sends when creating or editing a role and when giving extra
 * permissions to a person (fase 12). Checked again on the server: only known permissions,
 * never the protected ones, "cable:read" always in.
 */
import { z } from "zod";
import {
  PERMISSIONS,
  REQUIRED_PERMISSIONS,
  isProtectedPermission,
  type Permission,
} from "./permissions";

const permissionList = z
  .array(z.enum(PERMISSIONS, { error: "Permiso no válido" }))
  .max(PERMISSIONS.length)
  .refine((list) => !list.some(isProtectedPermission), {
    message: "La gestión de cuentas y de roles es solo del rol Administrador",
  })
  .transform((list) => PERMISSIONS.filter((permission) => list.includes(permission)));

/** Role ids: the four starting keys or a generated id. */
export const roleIdSchema = z
  .string({ error: "Rol no válido" })
  .trim()
  .min(1, "Rol no válido")
  .max(40, "Rol no válido")
  .regex(/^[A-Za-z0-9_-]+$/, "Rol no válido");

export const roleFormSchema = z.object({
  name: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(40, "El nombre no puede superar 40 caracteres")
    .regex(/^[^<>\p{Cc}]+$/u, "El nombre tiene caracteres no permitidos"),
  description: z
    .string()
    .trim()
    .max(300, "La descripción no puede superar 300 caracteres")
    .regex(/^[^<>\p{Cc}]*$/u, "La descripción tiene caracteres no permitidos")
    .nullish()
    .transform((value) => value || null),
  // "cable:read" va siempre: sin él la app no enseña nada.
  permissions: permissionList.transform((list) =>
    PERMISSIONS.filter(
      (permission) =>
        list.includes(permission) ||
        (REQUIRED_PERMISSIONS as readonly string[]).includes(permission),
    ),
  ),
});

export const createRoleSchema = roleFormSchema;

export const updateRoleSchema = roleFormSchema.extend({
  id: roleIdSchema,
  /** `role.version` when the form was opened: another save in between is a conflict. */
  version: z.coerce.number().int().positive(),
});

export const deleteRoleSchema = z.object({
  id: roleIdSchema,
  version: z.coerce.number().int().positive(),
});

/** The extra permissions of a person: the whole list replaces the previous one. */
export const userGrantsSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  permissions: permissionList,
});

export type RoleForm = z.output<typeof roleFormSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;
export type DeleteRoleInput = z.output<typeof deleteRoleSchema>;
export type UserGrantsInput = z.output<typeof userGrantsSchema>;

/** What changed between two permission lists, in catalogue order. */
export function diffPermissions(
  before: readonly string[],
  after: readonly string[],
): { added: Permission[]; removed: Permission[] } {
  return {
    added: PERMISSIONS.filter((p) => after.includes(p) && !before.includes(p)),
    removed: PERMISSIONS.filter((p) => before.includes(p) && !after.includes(p)),
  };
}
