import "server-only";
import { prisma, type Prisma } from "@cables/db";
import {
  ADMIN_ROLE,
  ROLES,
  diffPermissions,
  effectivePermissions,
  hasPermission,
  isPermission,
  type DeleteRoleInput,
  type Permission,
  type PermissionHolder,
  type RoleForm,
  type UpdateRoleInput,
  type UserGrantsInput,
} from "@cables/shared";
import { isUniqueViolation } from "@/server/prisma-errors";

/**
 * Roles and extra permissions (fase 12). Every function checks `role:manage` itself (defence
 * in depth: the Server Actions check it first), the shapes were checked with Zod, and every
 * change leaves an immutable entry in the account changes.
 */

export class RoleServiceError extends Error {}

type Actor = PermissionHolder & { id: string };

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  /** Administrador: cannot be edited or deleted. */
  locked: boolean;
  /** One of the four starting roles: cannot be deleted. */
  system: boolean;
  version: number;
  /** People with this role (active or not). */
  users: number;
};

const CONFLICT =
  "Otra persona ha cambiado este rol mientras tanto. Recarga la página y vuelve a intentarlo.";
const DUPLICATE_NAME = "Ya hay un rol con ese nombre.";

function requireManager(actor: Actor) {
  if (!hasPermission(actor, "role:manage")) {
    throw new RoleServiceError("No tienes permiso para gestionar roles.");
  }
}

const SELECT = {
  id: true,
  name: true,
  description: true,
  permissions: true,
  locked: true,
  system: true,
  version: true,
  _count: { select: { users: true } },
} as const;

type Selected = Prisma.RoleGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, permissions, ...role }: Selected): RoleRow => ({
  ...role,
  // Lo que diga la base pasa por las mismas reglas que una sesión.
  permissions: effectivePermissions({ roleId: role.id, rolePermissions: permissions }),
  users: _count.users,
});

/** The starting roles first, from most to least powerful, then the ones made on the web. */
const rank = (id: string) => {
  const index = (ROLES as readonly string[]).indexOf(id);
  return index === -1 ? ROLES.length : index;
};

/** Every role, for the roles page and the role pickers. */
export async function listRoles(): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({ select: SELECT, orderBy: { name: "asc" } });
  return roles.map(toRow).sort((a, b) => rank(a.id) - rank(b.id));
}

export async function getRole(id: string): Promise<RoleRow | null> {
  const role = await prisma.role.findUnique({ where: { id }, select: SELECT });
  return role ? toRow(role) : null;
}

/** A new role, made from the form (copied from another one, or from scratch). */
export async function createRole(actor: Actor, input: RoleForm): Promise<RoleRow> {
  requireManager(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { name: input.name, description: input.description, permissions: input.permissions },
        select: SELECT,
      });
      await tx.userEvent.create({
        data: {
          action: "ROLE_CREATED",
          actorId: actor.id,
          roleId: role.id,
          details: { role: role.name, added: input.permissions },
        },
      });
      return toRow(role);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new RoleServiceError(DUPLICATE_NAME);
    throw error;
  }
}

/** Name, description and permissions of a role; never the administrator role. */
export async function updateRole(actor: Actor, input: UpdateRoleInput): Promise<RoleRow> {
  requireManager(actor);
  const current = await prisma.role.findUnique({ where: { id: input.id } });
  if (!current) throw new RoleServiceError("Ese rol no existe.");
  if (current.locked || current.id === ADMIN_ROLE) {
    throw new RoleServiceError("El rol Administrador no se puede cambiar.");
  }
  if (current.version !== input.version) throw new RoleServiceError(CONFLICT);

  const { added, removed } = diffPermissions(current.permissions, input.permissions);
  try {
    return await prisma.$transaction(async (tx) => {
      // La condición de `version` hace atómicas la comprobación y la escritura.
      const { count } = await tx.role.updateMany({
        where: { id: current.id, version: input.version },
        data: {
          name: input.name,
          description: input.description,
          permissions: input.permissions,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new RoleServiceError(CONFLICT);
      await tx.userEvent.create({
        data: {
          action: "ROLE_UPDATED",
          actorId: actor.id,
          roleId: current.id,
          details: {
            role: input.name,
            ...(input.name !== current.name ? { renamedFrom: current.name } : {}),
            added,
            removed,
          },
        },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { id: current.id }, select: SELECT });
      return toRow(role);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new RoleServiceError(DUPLICATE_NAME);
    throw error;
  }
}

/** Deletes a role made on the web that nobody has (people first change role). */
export async function deleteRole(actor: Actor, input: DeleteRoleInput): Promise<void> {
  requireManager(actor);
  await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { id: input.id },
      select: { id: true, name: true, system: true, locked: true, version: true },
    });
    if (!role) throw new RoleServiceError("Ese rol no existe.");
    if (role.system || role.locked) {
      throw new RoleServiceError("Los cuatro roles de siempre no se pueden borrar.");
    }
    if (role.version !== input.version) throw new RoleServiceError(CONFLICT);
    const users = await tx.user.count({ where: { role: role.id } });
    if (users > 0) {
      throw new RoleServiceError(
        `${users === 1 ? "Hay 1 persona" : `Hay ${users} personas`} con este rol. Cámbiales el rol antes de borrarlo.`,
      );
    }
    await tx.role.delete({ where: { id: role.id } });
    await tx.userEvent.create({
      data: {
        action: "ROLE_DELETED",
        actorId: actor.id,
        roleId: role.id,
        details: { role: role.name },
      },
    });
  });
}

export type UserPermissions = {
  id: string;
  name: string;
  email: string;
  role: { id: string; name: string; permissions: Permission[] };
  /** Extras that still mean something (a permission the role gained stops being an extra). */
  extras: Permission[];
  /** Everything this person can do. */
  effective: Permission[];
};

/** What a person can do and why: from the role or as an extra. */
export async function getUserPermissions(userId: string): Promise<UserPermissions | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      roleInfo: { select: { name: true, permissions: true } },
      permissionGrants: { select: { permission: true } },
    },
  });
  if (!user) return null;
  const fromRole = effectivePermissions({
    roleId: user.role,
    rolePermissions: user.roleInfo.permissions,
  });
  const grants = user.permissionGrants.map((grant) => grant.permission).filter(isPermission);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: { id: user.role, name: user.roleInfo.name, permissions: fromRole },
    extras: grants.filter((permission) => !fromRole.includes(permission)),
    effective: effectivePermissions({
      roleId: user.role,
      rolePermissions: user.roleInfo.permissions,
      grants,
    }),
  };
}

/**
 * Replaces the extra permissions of a person. Permissions their role already has are not
 * stored as extras; the protected ones never arrive (Zod, and the database refuses them).
 */
export async function setUserGrants(actor: Actor, input: UserGrantsInput): Promise<boolean> {
  requireManager(actor);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        roleInfo: { select: { permissions: true } },
        permissionGrants: { select: { permission: true } },
      },
    });
    if (!user) throw new RoleServiceError("La persona no existe.");
    const wanted = input.permissions.filter(
      (permission) => !user.roleInfo.permissions.includes(permission),
    );
    const before = user.permissionGrants.map((grant) => grant.permission);
    const { added, removed } = diffPermissions(before, wanted);
    if (added.length === 0 && removed.length === 0) return false;

    await tx.userPermissionGrant.deleteMany({
      where: { userId: user.id, permission: { in: removed } },
    });
    await tx.userPermissionGrant.createMany({
      data: added.map((permission) => ({ userId: user.id, permission, grantedById: actor.id })),
    });
    await tx.userEvent.create({
      data: {
        action: "PERMISSIONS_CHANGED",
        actorId: actor.id,
        targetId: user.id,
        details: { added, removed },
      },
    });
    return true;
  });
}
