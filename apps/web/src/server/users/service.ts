import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma, type UserEventAction } from "@cables/db";
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
import { isUniqueViolation } from "@/server/prisma-errors";
import type { CurrentUser } from "@/server/session";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** Self-registered and waiting for an administrator: never approved yet. */
  pending: boolean;
  createdAt: Date;
};

export class UserServiceError extends Error {}

const DUPLICATE_EMAIL = "Ya existe un usuario con ese correo.";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  approvedAt: true,
  createdAt: true,
} as const;

type SelectedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  approvedAt: Date | null;
  createdAt: Date;
};

const toRow = ({ approvedAt, ...user }: SelectedUser): UserRow => ({
  ...user,
  role: user.role as Role,
  pending: !user.active && approvedAt === null,
});

/** Accounts waiting for approval first (they need an answer), then active ones, by name. */
export async function listUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const rows = users.map(toRow);
  return [...rows.filter((user) => user.pending), ...rows.filter((user) => !user.pending)];
}

type Transaction = Prisma.TransactionClient;

/**
 * Active administrators other than `excludeUserId`, with their rows locked until the
 * transaction ends. Without the lock, two administrators demoting or deactivating each
 * other at the same time would both see "one administrator left" and leave none.
 */
async function countOtherActiveAdmins(tx: Transaction, excludeUserId: string): Promise<number> {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "user" WHERE "role" = 'ADMIN' AND "active" ORDER BY "id" FOR UPDATE`;
  return admins.filter((admin) => admin.id !== excludeUserId).length;
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
    throw new UserServiceError(DUPLICATE_EMAIL);
  }

  const passwordHash = await hashPassword(input.password);
  // En Better Auth, el accountId de una cuenta de contraseña es el id del propio usuario.
  const id = randomUUID();

  const user = await prisma.user
    .create({
      data: {
        id,
        name: input.name,
        email: input.email,
        role: input.role,
        emailVerified: true,
        // Un alta hecha por un administrador ya está aprobada.
        approvedAt: new Date(),
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: passwordHash,
          },
        },
        userEvents: { create: { action: "CREATED", actorId: actor.id, toRole: input.role } },
      },
      select: USER_SELECT,
    })
    .catch((error: unknown) => {
      // Dos altas simultáneas con el mismo correo: la segunda choca con el índice único.
      if (isUniqueViolation(error)) {
        throw new UserServiceError(DUPLICATE_EMAIL);
      }
      throw error;
    });

  return toRow(user);
}

export async function changeUserRole(actor: CurrentUser, input: ChangeRoleInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const otherActiveAdmins = await countOtherActiveAdmins(tx, input.userId);
    const target = await tx.user.findUnique({
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
      otherActiveAdmins,
    });
    if (error) {
      throw new UserServiceError(error);
    }

    if (target.role === input.role) return;
    await tx.user.update({ where: { id: target.id }, data: { role: input.role } });
    await tx.userEvent.create({
      data: {
        action: "ROLE_CHANGED",
        actorId: actor.id,
        targetId: target.id,
        fromRole: target.role as Role,
        toRole: input.role,
      },
    });
    // Las sesiones existentes siguen válidas, pero el rol se relee en cada petición.
  });
}

/**
 * Activates or deactivates an account. The first activation of a self-registered account
 * is its approval: `approved` tells the caller whom to notify.
 */
export async function setUserActive(
  actor: CurrentUser,
  input: SetUserActiveInput,
): Promise<{ approved: { name: string; email: string } | null }> {
  return prisma.$transaction(async (tx) => {
    const otherActiveAdmins = await countOtherActiveAdmins(tx, input.userId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true, name: true, email: true, approvedAt: true },
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
      otherActiveAdmins,
    });
    if (error) {
      throw new UserServiceError(error);
    }

    const approving = input.active && target.approvedAt === null;
    // Al aprobar, el administrador elige con qué rol entra (nunca uno superior al suyo).
    const role = approving && input.role ? input.role : (target.role as Role);
    if (role !== target.role) {
      const roleError = validateCreateUser({ actorId: actor.id, actorRole: actor.role }, role);
      if (roleError) {
        throw new UserServiceError("No puedes asignar un rol superior al tuyo.");
      }
    }
    await tx.user.update({
      where: { id: target.id },
      data: { active: input.active, role, ...(approving ? { approvedAt: new Date() } : {}) },
    });
    const action: UserEventAction = approving
      ? "APPROVED"
      : input.active
        ? "REACTIVATED"
        : "DEACTIVATED";
    await tx.userEvent.create({
      data: {
        action,
        actorId: actor.id,
        targetId: target.id,
        ...(approving ? { toRole: role } : {}),
      },
    });
    if (!input.active) {
      // Al desactivar se cierran todas sus sesiones.
      await tx.session.deleteMany({ where: { userId: target.id } });
    }
    return { approved: approving ? { name: target.name, email: target.email } : null };
  });
}

export type UserEventRow = {
  id: string;
  action: UserEventAction;
  actor: string;
  target: string;
  fromRole: Role | null;
  toRole: Role | null;
  createdAt: Date;
};

/** The latest changes to the accounts, newest first (users page). */
export async function listUserEvents(limit = 50): Promise<UserEventRow[]> {
  const events = await prisma.userEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      action: true,
      fromRole: true,
      toRole: true,
      createdAt: true,
      actor: { select: { name: true } },
      target: { select: { name: true } },
    },
  });
  return events.map(({ actor, target, ...event }) => ({
    ...event,
    actor: actor.name,
    target: target.name,
    fromRole: event.fromRole as Role | null,
    toRole: event.toRole as Role | null,
  }));
}
