import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma, type UserEventAction } from "@cables/db";
import { hashPassword } from "better-auth/crypto";
import {
  USERS_PAGE_SIZE,
  USER_EVENTS_PAGE_SIZE,
  validateActiveChange,
  validateCreateUser,
  validateRoleChange,
  type ChangeRoleInput,
  type CreateUserInput,
  type Role,
  type SetUserActiveInput,
  type UserEventSearch,
  type UserListSearch,
} from "@cables/shared";
import { madridDayStart, nextDay } from "@/server/activity/service";
import type { AccountChange } from "@/server/account-notifications";
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

/** Self-registered accounts never approved: what the administrators have to answer. */
export async function countPendingAccounts(): Promise<number> {
  return prisma.user.count({ where: { active: false, approvedAt: null } });
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

/** Changes the role of an account; null when it already had that role (nothing to tell). */
export async function changeUserRole(
  actor: CurrentUser,
  input: ChangeRoleInput,
): Promise<AccountChange | null> {
  return prisma.$transaction(async (tx) => {
    const otherActiveAdmins = await countOtherActiveAdmins(tx, input.userId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true, name: true, email: true },
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

    if (target.role === input.role) return null;
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
    return {
      action: "ROLE_CHANGED",
      user: { id: target.id, name: target.name, email: target.email },
      fromRole: target.role as Role,
      toRole: input.role,
    };
  });
}

/**
 * Activates or deactivates an account. The first activation of a self-registered account
 * is its approval. Returns what happened, for the emails.
 */
export async function setUserActive(
  actor: CurrentUser,
  input: SetUserActiveInput,
): Promise<AccountChange> {
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
    return {
      action,
      user: { id: target.id, name: target.name, email: target.email },
      toRole: approving ? role : null,
    };
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

const EVENT_SELECT = {
  id: true,
  action: true,
  fromRole: true,
  toRole: true,
  createdAt: true,
  actor: { select: { name: true } },
  target: { select: { name: true } },
} as const;

type SelectedEvent = Prisma.UserEventGetPayload<{ select: typeof EVENT_SELECT }>;

const toEventRow = ({ actor, target, ...event }: SelectedEvent): UserEventRow => ({
  ...event,
  actor: actor.name,
  target: target.name,
  fromRole: event.fromRole as Role | null,
  toRole: event.toRole as Role | null,
});

/** The latest changes to the accounts, newest first (users page). */
export async function listUserEvents(limit = 50): Promise<UserEventRow[]> {
  const events = await prisma.userEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: EVENT_SELECT,
  });
  return events.map(toEventRow);
}

export type Paged<T> = { rows: T[]; total: number; page: number; pageCount: number };

const pageOf = (total: number, size: number, requested = 1) => {
  const pageCount = Math.ceil(total / size);
  return { pageCount, page: Math.min(requested, Math.max(pageCount, 1)) };
};

/** Never approved and not active: waiting for an administrator. */
const PENDING: Prisma.UserWhereInput = { active: false, approvedAt: null };

/**
 * Accounts with the filters and order of the users page, a page at a time. "Pendientes
 * primero" (the default) puts the accounts waiting for an answer before the rest.
 */
export async function searchUsers(search: UserListSearch): Promise<Paged<UserRow>> {
  const where: Prisma.UserWhereInput = {
    ...(search.q
      ? {
          OR: [
            { name: { contains: search.q, mode: "insensitive" } },
            { email: { contains: search.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(search.role ? { role: search.role } : {}),
    ...(search.status === "pending" ? PENDING : {}),
    ...(search.status === "active" ? { active: true } : {}),
    ...(search.status === "inactive" ? { active: false, approvedAt: { not: null } } : {}),
  };
  const total = await prisma.user.count({ where });
  const { page, pageCount } = pageOf(total, USERS_PAGE_SIZE, search.page);
  const skip = (page - 1) * USERS_PAGE_SIZE;
  const sort = search.sort ?? "priority";

  if (sort !== "priority") {
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === "newest"
        ? [{ createdAt: "desc" }, { id: "asc" }]
        : sort === "oldest"
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : sort === "role"
            ? [{ role: "asc" }, { name: "asc" }, { id: "asc" }]
            : [{ name: "asc" }, { id: "asc" }];
    const users = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy,
      skip,
      take: USERS_PAGE_SIZE,
    });
    return { rows: users.map(toRow), total, page, pageCount };
  }

  // Pending first, then the others (active before deactivated), by name: two queries, one
  // page cut across both.
  const pendingWhere = { AND: [where, PENDING] };
  const otherWhere = { AND: [where, { NOT: PENDING }] };
  const pendingTotal = await prisma.user.count({ where: pendingWhere });
  const pending = await prisma.user.findMany({
    where: pendingWhere,
    select: USER_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: Math.min(skip, pendingTotal),
    take: Math.max(0, Math.min(USERS_PAGE_SIZE, pendingTotal - skip)),
  });
  const others = await prisma.user.findMany({
    where: otherWhere,
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    skip: Math.max(0, skip - pendingTotal),
    take: USERS_PAGE_SIZE - pending.length,
  });
  return { rows: [...pending, ...others].map(toRow), total, page, pageCount };
}

/** Changes to the accounts with the filters and order of their page, a page at a time. */
export async function searchUserEvents(search: UserEventSearch): Promise<Paged<UserEventRow>> {
  const where: Prisma.UserEventWhereInput = {
    ...(search.action ? { action: search.action } : {}),
    ...(search.person ? { OR: [{ actorId: search.person }, { targetId: search.person }] } : {}),
    ...(search.from || search.to
      ? {
          createdAt: {
            ...(search.from ? { gte: madridDayStart(search.from) } : {}),
            ...(search.to ? { lt: madridDayStart(nextDay(search.to)) } : {}),
          },
        }
      : {}),
  };
  const total = await prisma.userEvent.count({ where });
  const { page, pageCount } = pageOf(total, USER_EVENTS_PAGE_SIZE, search.page);
  const order = search.sort === "oldest" ? "asc" : "desc";
  const events = await prisma.userEvent.findMany({
    where,
    orderBy: [{ createdAt: order }, { id: order }],
    skip: (page - 1) * USER_EVENTS_PAGE_SIZE,
    take: USER_EVENTS_PAGE_SIZE,
    select: EVENT_SELECT,
  });
  return { rows: events.map(toEventRow), total, page, pageCount };
}

/** Everybody, by name: who can be picked in the "Persona" filter of the account changes. */
export async function listUserOptions(): Promise<{ id: string; label: string }[]> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return users.map((user) => ({ id: user.id, label: `${user.name} (${user.email})` }));
}
