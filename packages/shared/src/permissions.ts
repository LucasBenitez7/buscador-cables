/**
 * Roles and permissions for the cable inventory.
 *
 * Pure data + pure functions so they can be unit tested and reused from the
 * server, the client and the database seed. The Prisma `Role` enum must list
 * exactly the same members as `ROLES`.
 */

export const ROLES = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "cable:read",
  "cable:create",
  "cable:update",
  "cable:delete",
  "cable:lay",
  "cable:coil",
  "cable:connect",
  "cable:disconnect",
  "cable:move",
  "cable:retire",
  "cable:correct",
  "location:manage",
  "catalog:manage",
  "import:run",
  "export:run",
  "user:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Spanish labels, used by the UI. */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Técnico",
  VIEWER: "Consulta",
};

const VIEWER_PERMISSIONS: readonly Permission[] = ["cable:read", "export:run"];

const TECHNICIAN_PERMISSIONS: readonly Permission[] = [
  ...VIEWER_PERMISSIONS,
  "cable:create",
  "cable:update",
  "cable:lay",
  "cable:coil",
  "cable:connect",
  "cable:disconnect",
  "cable:move",
];

const SUPERVISOR_PERMISSIONS: readonly Permission[] = [
  ...TECHNICIAN_PERMISSIONS,
  "cable:retire",
  "cable:correct",
  "location:manage",
  "catalog:manage",
  "import:run",
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...SUPERVISOR_PERMISSIONS,
  "cable:delete",
  "user:manage",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  SUPERVISOR: SUPERVISOR_PERMISSIONS,
  TECHNICIAN: TECHNICIAN_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Roles ordered from most to least privileged. Used to decide whether a user may
 * manage another one: nobody can manage a role equal to or above their own,
 * except ADMIN, who can manage any other ADMIN.
 */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 4,
  SUPERVISOR: 3,
  TECHNICIAN: 2,
  VIEWER: 1,
};

export function canManageActor(actor: Role, target: Role): boolean {
  if (actor === "ADMIN") {
    return true;
  }
  return ROLE_RANK[actor] > ROLE_RANK[target];
}
