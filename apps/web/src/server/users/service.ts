import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { hashPassword } from "better-auth/crypto";
import {
  validateActiveChange,
  validateCreateUser,
  validateRoleChange,
  type ChangeRoleInput,
  type CreateUserInput,
  type Role,
  type SetUserActiveInput,
} from "@cables/shared";
import type { CurrentUser } from "@/server/session";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
};

export class UserServiceError extends Error {}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function listUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return users.map((user) => ({ ...user, role: user.role as Role }));
}

async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", active: true, NOT: { id: excludeUserId } },
  });
}

/**
 * Creates a user with a credential account. The admin sets a temporary password;
 * the user can change it later through "olvidé mi contraseña".
 */
export async function createUser(actor: CurrentUser, input: CreateUserInput): Promise<UserRow> {
  const error = validateCreateUser({ actorId: actor.id, actorRole: actor.role }, input.role);
  if (error) {
    throw new UserServiceError(error);
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new UserServiceError("Ya existe un usuario con ese correo.");
  }

  const passwordHash = await hashPassword(input.password);
  // En Better Auth, el accountId de una cuenta de contraseña es el id del propio usuario.
  const id = randomUUID();

  const user = await prisma.user.create({
    data: {
      id,
      name: input.name,
      email: input.email,
      role: input.role,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: passwordHash,
        },
      },
    },
    select: USER_SELECT,
  });

  return { ...user, role: user.role as Role };
}

export async function changeUserRole(actor: CurrentUser, input: ChangeRoleInput): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new UserServiceError("El usuario no existe.");
  }

  const error = validateRoleChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetId: target.id,
    targetRole: target.role as Role,
    newRole: input.role,
    otherActiveAdmins: await countOtherActiveAdmins(target.id),
  });
  if (error) {
    throw new UserServiceError(error);
  }

  await prisma.user.update({ where: { id: target.id }, data: { role: input.role } });
  // Las sesiones existentes siguen válidas, pero el rol se relee en cada petición.
}

export async function setUserActive(actor: CurrentUser, input: SetUserActiveInput): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true },
  });
  if (!target) {
    throw new UserServiceError("El usuario no existe.");
  }

  const error = validateActiveChange({
    actorId: actor.id,
    actorRole: actor.role,
    targetId: target.id,
    targetRole: target.role as Role,
    active: input.active,
    otherActiveAdmins: await countOtherActiveAdmins(target.id),
  });
  if (error) {
    throw new UserServiceError(error);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { active: input.active } });
    if (!input.active) {
      // Al desactivar se cierran todas sus sesiones.
      await tx.session.deleteMany({ where: { userId: target.id } });
    }
  });
}
