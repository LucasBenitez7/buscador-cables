import { z } from "zod";
import { ROLES, canManageActor, type Role } from "./permissions";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const createUserSchema = z.object({
  name: z
    .string({ error: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar 100 caracteres"),
  email: z.email({ error: "Introduce un correo válido" }).trim().toLowerCase(),
  role: z.enum(ROLES, { error: "Rol no válido" }),
  password: z
    .string({ error: "La contraseña es obligatoria" })
    .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(PASSWORD_MAX_LENGTH, "La contraseña es demasiado larga"),
});

export const changeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES, { error: "Rol no válido" }),
});

export const setUserActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export type ActorContext = {
  actorId: string;
  actorRole: Role;
};

/** Returns an error message in Spanish, or null when the operation is allowed. */
export function validateCreateUser(actor: ActorContext, newRole: Role): string | null {
  if (!canManageActor(actor.actorRole, newRole)) {
    return "No puedes crear usuarios con un rol superior al tuyo.";
  }
  return null;
}

export type RoleChange = ActorContext & {
  targetId: string;
  targetRole: Role;
  newRole: Role;
  /** Active administrators other than the target. */
  otherActiveAdmins: number;
};

export function validateRoleChange(change: RoleChange): string | null {
  if (change.actorId === change.targetId) {
    return "No puedes cambiar tu propio rol.";
  }
  if (!canManageActor(change.actorRole, change.targetRole)) {
    return "No tienes permiso para gestionar a este usuario.";
  }
  if (!canManageActor(change.actorRole, change.newRole)) {
    return "No puedes asignar un rol superior al tuyo.";
  }
  if (change.targetRole === "ADMIN" && change.newRole !== "ADMIN" && change.otherActiveAdmins < 1) {
    return "Debe quedar al menos un administrador activo.";
  }
  return null;
}

export type ActiveChange = ActorContext & {
  targetId: string;
  targetRole: Role;
  active: boolean;
  otherActiveAdmins: number;
};

export function validateActiveChange(change: ActiveChange): string | null {
  if (change.actorId === change.targetId && !change.active) {
    return "No puedes desactivar tu propia cuenta.";
  }
  if (!canManageActor(change.actorRole, change.targetRole)) {
    return "No tienes permiso para gestionar a este usuario.";
  }
  if (!change.active && change.targetRole === "ADMIN" && change.otherActiveAdmins < 1) {
    return "Debe quedar al menos un administrador activo.";
  }
  return null;
}
