import { z } from "zod";
import { ADMIN_ROLE, hasPermission, type PermissionHolder } from "./permissions";
import { roleIdSchema } from "./roles";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const nameField = z
  .string({ error: "El nombre es obligatorio" })
  .trim()
  .min(2, "El nombre debe tener al menos 2 caracteres")
  .max(100, "El nombre no puede superar 100 caracteres");

// Trim first: Zod checks the format before a `.trim()` chained after `z.email()`, so a
// pasted address with a space around it was rejected.
const emailField = z
  .string({ error: "Introduce un correo válido" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Introduce un correo válido" }));

const passwordField = z
  .string({ error: "La contraseña es obligatoria" })
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, "La contraseña es demasiado larga");

/** Alta hecha por un administrador desde el panel. */
export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  role: roleIdSchema,
  password: passwordField,
});

/** Datos de perfil que se validan en el servidor cuando alguien se registra. */
export const signUpProfileSchema = z.object({
  name: nameField,
  email: emailField,
});

/** Formulario público de registro. El rol siempre es VIEWER; lo sube un administrador. */
export const signUpSchema = signUpProfileSchema
  .extend({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const changeRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleIdSchema,
});

export const setUserActiveSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
  /** Al aprobar una cuenta nueva: el rol con el que entra (si no, el que tiene). */
  role: roleIdSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

/** Who acts on the accounts: their id and permissions. */
export type ActorContext = {
  actorId: string;
  actor: PermissionHolder;
};

/**
 * Only who can manage accounts touches them. That permission is only in the administrator
 * role (it cannot be given to another role nor as an extra), so there is no ladder of roles
 * to climb: administrators manage everybody, the rest nobody.
 */
const NOT_ALLOWED = "No tienes permiso para gestionar cuentas.";

/** Returns an error message in Spanish, or null when the operation is allowed. */
export function validateCreateUser(actor: ActorContext): string | null {
  return hasPermission(actor.actor, "user:manage") ? null : NOT_ALLOWED;
}

export type RoleChange = ActorContext & {
  targetId: string;
  /** Role ids, before and after. */
  targetRole: string;
  newRole: string;
  /** Active administrators other than the target. */
  otherActiveAdmins: number;
};

export function validateRoleChange(change: RoleChange): string | null {
  if (!hasPermission(change.actor, "user:manage")) return NOT_ALLOWED;
  if (change.actorId === change.targetId) {
    return "No puedes cambiar tu propio rol.";
  }
  if (
    change.targetRole === ADMIN_ROLE &&
    change.newRole !== ADMIN_ROLE &&
    change.otherActiveAdmins < 1
  ) {
    return "Debe quedar al menos un administrador activo.";
  }
  return null;
}

export type ActiveChange = ActorContext & {
  targetId: string;
  targetRole: string;
  active: boolean;
  otherActiveAdmins: number;
};

export function validateActiveChange(change: ActiveChange): string | null {
  if (!hasPermission(change.actor, "user:manage")) return NOT_ALLOWED;
  if (change.actorId === change.targetId && !change.active) {
    return "No puedes desactivar tu propia cuenta.";
  }
  if (!change.active && change.targetRole === ADMIN_ROLE && change.otherActiveAdmins < 1) {
    return "Debe quedar al menos un administrador activo.";
  }
  return null;
}
