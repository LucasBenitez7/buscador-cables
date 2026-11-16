import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@cables/db";
import { effectivePermissions, hasPermission, type Permission } from "@cables/shared";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** Id of the role ("ADMIN", "TECHNICIAN"… or the id of a role made on the web). */
  role: string;
  /** Its name today ("Técnico", "Conexionista"). */
  roleName: string;
  /** Role plus extras (fase 12), read from the database on every request. */
  permissions: Permission[];
  /** How many permissions come as extras, not from the role ("Técnico +2"). */
  extraCount: number;
};

/**
 * Reads the session from the request cookies and re-validates it against the database,
 * with the permissions of the person's role and their extras as they are now: a permission
 * taken away stops working on the next click, without waiting for the session to end.
 * Returns null for anonymous requests and for deactivated accounts.
 *
 * Wrapped in React `cache` so the layout and the page of the same request share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result || !result.user.active) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: result.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      role: true,
      roleInfo: { select: { name: true, permissions: true } },
      permissionGrants: { select: { permission: true } },
    },
  });
  if (!user?.active) {
    return null;
  }

  const fromRole = effectivePermissions({
    roleId: user.role,
    rolePermissions: user.roleInfo.permissions,
  });
  const permissions = effectivePermissions({
    roleId: user.role,
    rolePermissions: user.roleInfo.permissions,
    grants: user.permissionGrants.map((grant) => grant.permission),
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleName: user.roleInfo.name,
    permissions,
    extraCount: permissions.length - fromRole.length,
  };
});

/**
 * For data loaders shared by `generateMetadata` and the page: nothing is read without a
 * valid session. `generateMetadata` runs on its own, and the proxy only checks that a
 * session cookie exists, not that it is valid.
 */
export async function whenSignedIn<T>(load: () => Promise<T>): Promise<T | null> {
  return (await getCurrentUser()) ? load() : null;
}

/** For pages: sends anonymous users to the login screen. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** For pages: sends users without the permission back to the home screen. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    redirect("/");
  }
  return user;
}

export type Authorized = { ok: true; user: CurrentUser } | { ok: false; message: string };

/** For server actions: returns a result instead of redirecting. */
export async function authorize(permission: Permission): Promise<Authorized> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }
  if (!hasPermission(user, permission)) {
    return { ok: false, message: "No tienes permiso para realizar esta acción." };
  }
  return { ok: true, user };
}
