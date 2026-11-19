/**
 * Roles and permissions for the cable inventory (fase 12).
 *
 * The catalogue of permissions is code: a permission only exists if the code checks it. Which
 * permissions each role has, the roles themselves and the extra permissions of each person live
 * in the database and are edited from the web by an administrator. What a person can do is
 * `effectivePermissions` of their role and extras, read again on every request.
 *
 * Pure data + pure functions so they can be unit tested and reused from the server, the client
 * and the database seed.
 */

/** The four roles every installation starts with: their id in the database is their key. */
export const ROLES = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"] as const;

/** One of the four starting roles. A role created on the web has a generated id instead. */
export type Role = (typeof ROLES)[number];

/** The administrator role: locked, and the only one that manages accounts and roles. */
export const ADMIN_ROLE: Role = "ADMIN";

export const PERMISSIONS = [
  "cable:read",
  "cable:create",
  "cable:update",
  "cable:delete",
  "cable:lay",
  "cable:connect",
  "cable:disconnect",
  "cable:test",
  "cable:wiring",
  "cable:retire",
  "cable:correct",
  "activity:view",
  "location:manage",
  "catalog:manage",
  "import:run",
  "export:run",
  "user:manage",
  "role:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Only the administrator role has them: they cannot be given to another role nor as an extra
 * (the database refuses it too). Whoever could give them could make themselves administrator.
 */
export const PROTECTED_PERMISSIONS: readonly Permission[] = ["user:manage", "role:manage"];

/** Every role can look at the cables: without it the app shows nothing. */
export const REQUIRED_PERMISSIONS: readonly Permission[] = ["cable:read"];

export const isPermission = (value: unknown): value is Permission =>
  typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);

export const isProtectedPermission = (permission: string) =>
  (PROTECTED_PERMISSIONS as readonly string[]).includes(permission);

/** Names of the four starting roles (the database keeps the current name of every role). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Técnico",
  VIEWER: "Consulta",
};

/**
 * Every permission in the words of the people who use the app, by topic: the administrator
 * reads it to decide what a role or a person can do.
 */
export const PERMISSION_GROUPS: readonly {
  title: string;
  permissions: readonly { id: Permission; label: string; help: string }[];
}[] = [
  {
    title: "Consultar",
    permissions: [
      {
        id: "cable:read",
        label: "Ver cables, bandejas, equipos y planos",
        help: "Buscar, abrir fichas, ver el historial de cada cable y los planos. Todo rol lo tiene.",
      },
      {
        id: "export:run",
        label: "Exportar listados",
        help: "Descargar los resultados de una búsqueda.",
      },
    ],
  },
  {
    title: "Trabajo en campo",
    permissions: [
      {
        id: "cable:lay",
        label: "Tender cables",
        help: "También a medias, con dónde quedó la punta.",
      },
      { id: "cable:connect", label: "Conectar", help: "Marcar conectada una punta o las dos." },
      {
        id: "cable:disconnect",
        label: "Desconectar",
        help: "Marcar desconectada una punta o las dos.",
      },
      { id: "cable:test", label: "Timbrar", help: "Registrar el timbrado, correcto o con fallo." },
      {
        id: "cable:wiring",
        label: "Corregir bornas",
        help: "Cambiar el regletero o la borna de un hilo cuando en campo no coincide con el listado.",
      },
    ],
  },
  {
    title: "Datos de los cables",
    permissions: [
      { id: "cable:create", label: "Dar de alta cables", help: "Crear cables nuevos a mano." },
      { id: "cable:update", label: "Editar cables", help: "Cambiar los datos de un cable." },
      {
        id: "cable:retire",
        label: "Retirar cables",
        help: "Dar un cable por retirado, con el motivo.",
      },
      {
        id: "cable:correct",
        label: "Corregir movimientos",
        help: "Corregir el estado de un cable o un movimiento mal registrado.",
      },
      {
        id: "cable:delete",
        label: "Dar de baja cables",
        help: "Quitar un cable de la lista (no se borra su historial).",
      },
      { id: "import:run", label: "Importar listados", help: "Cargar datos desde ficheros." },
    ],
  },
  {
    title: "Organización",
    permissions: [
      {
        id: "activity:view",
        label: "Ver la actividad del equipo",
        help: "Lo que ha hecho cada persona con los cables. Cada uno ve siempre la suya.",
      },
      {
        id: "location:manage",
        label: "Gestionar ubicaciones",
        help: "Crear y ordenar el árbol de la planta.",
      },
      {
        id: "catalog:manage",
        label: "Gestionar catálogos",
        help: "Tipos de cable, colores y fabricantes.",
      },
    ],
  },
  {
    title: "Administración (solo el rol Administrador)",
    permissions: [
      {
        id: "user:manage",
        label: "Gestionar cuentas",
        help: "Aprobar, dar de alta, cambiar de rol y desactivar cuentas, y ver sus cambios.",
      },
      {
        id: "role:manage",
        label: "Gestionar roles y permisos",
        help: "Crear y editar roles y dar permisos extra, y ver sus cambios.",
      },
    ],
  },
];

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((item) => [item.id, item.label])),
) as Record<Permission, string>;

/** What each starting role can do: the migration creates them with these permissions. */
const VIEWER_PERMISSIONS: readonly Permission[] = ["cable:read", "export:run"];

const TECHNICIAN_PERMISSIONS: readonly Permission[] = [
  ...VIEWER_PERMISSIONS,
  "cable:create",
  "cable:update",
  "cable:lay",
  "cable:connect",
  "cable:disconnect",
  "cable:test",
  "cable:wiring",
];

const SUPERVISOR_PERMISSIONS: readonly Permission[] = [
  ...TECHNICIAN_PERMISSIONS,
  "cable:retire",
  "cable:correct",
  "activity:view",
  "location:manage",
  "catalog:manage",
  "import:run",
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...SUPERVISOR_PERMISSIONS,
  "cable:delete",
  "user:manage",
  "role:manage",
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

/** Who asks: anything that carries the permissions it has (the current user, an actor). */
export type PermissionHolder = { permissions: readonly string[] };

export function hasPermission(who: PermissionHolder, permission: Permission): boolean {
  return who.permissions.includes(permission);
}

export function hasAnyPermission(who: PermissionHolder, permissions: readonly Permission[]) {
  return permissions.some((permission) => hasPermission(who, permission));
}

/** The permissions of a starting role, as a holder (seeds, tests, the load CLI). */
export const permissionsOfRole = (role: Role): PermissionHolder => ({
  permissions: ROLE_PERMISSIONS[role],
});

/**
 * What a person can do: their role's permissions plus their extras, only known permissions,
 * always "cable:read", and the protected ones only for the administrator role, whatever the
 * database says (defence in depth).
 */
export function effectivePermissions({
  roleId,
  rolePermissions,
  grants = [],
}: {
  roleId: string;
  rolePermissions: readonly string[];
  grants?: readonly string[];
}): Permission[] {
  const wanted = new Set<string>([...REQUIRED_PERMISSIONS, ...rolePermissions, ...grants]);
  return PERMISSIONS.filter(
    (permission) =>
      wanted.has(permission) && (!isProtectedPermission(permission) || roleId === ADMIN_ROLE),
  );
}
