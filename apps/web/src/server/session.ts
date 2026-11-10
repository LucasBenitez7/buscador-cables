import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasPermission, isRole, type Permission, type Role } from "@cables/shared";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Reads the session from the request cookies and re-validates it against the
 * database. Returns null for anonymous requests and for deactivated accounts.
 *
 * Wrapped in React `cache` so the layout and the page of the same request share
 * one lookup instead of querying the database twice.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) {
    return null;
  }

  const { user } = result;
  if (!user.active || !isRole(user.role)) {
    return null;
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

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
  if (!hasPermission(user.role, permission)) {
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
  if (!hasPermission(user.role, permission)) {
    return { ok: false, message: "No tienes permiso para realizar esta acción." };
  }
  return { ok: true, user };
}
