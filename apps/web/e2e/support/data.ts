/** Datos conocidos que la preparación global carga en `cables_e2e`. */

export const PASSWORD = "E2e-Clave-Segura-1";

export const USERS = {
  admin: { name: "Ada Admin", email: "admin@e2e.test", role: "ADMIN" },
  supervisor: { name: "Sara Supervisora", email: "supervisora@e2e.test", role: "SUPERVISOR" },
  technician: { name: "Tomás Técnico", email: "tecnico@e2e.test", role: "TECHNICIAN" },
  viewer: { name: "Vera Consulta", email: "consulta@e2e.test", role: "VIEWER" },
} as const;

export type UserKey = keyof typeof USERS;

/**
 * Usuario solo para el test de "olvidé mi contraseña": restablecerla cierra todas sus
 * sesiones, así que no puede ser uno de los que guardan sesión en `auth.setup.ts`.
 */
export const RECOVERY_USER = {
  name: "Rita Recupera",
  email: "recupera@e2e.test",
  role: "VIEWER",
} as const;

export const storageStatePath = (user: UserKey) => `e2e/.auth/${user}.json`;

export const LOCATIONS = {
  plant: { id: "e2e-plant", name: "Planta E2E", code: "E2E" },
  area: { id: "e2e-area", name: "Calderas", code: "E2E-CAL" },
  origin: { id: "e2e-origin", name: "Armario A", code: "E2E-CAL-A" },
  destination: { id: "e2e-destination", name: "Bandeja B", code: "E2E-CAL-B" },
  store: { id: "e2e-store", name: "Almacén", code: "E2E-ALM" },
  yard: { id: "e2e-yard", name: "Patio", code: "E2E-PAT" },
} as const;

/** Cables de partida. Cada test que modifica uno usa el suyo para no depender del orden. */
export const CABLES = {
  search: { code: "SH-50", status: "LAID", connection: "CONNECTED" },
  searchSibling: { code: "SH-500", status: "IN_STOCK", connection: "DISCONNECTED" },
  actions: { code: "AC-1", status: "IN_STOCK", connection: "DISCONNECTED" },
  supervisor: { code: "AC-2", status: "LAID", connection: "CONNECTED" },
  mobile: { code: "MV-1", status: "COILED", connection: "DISCONNECTED" },
  concurrency: { code: "CC-1", status: "IN_STOCK", connection: "DISCONNECTED" },
  partial: {
    code: "TP-1",
    status: "IN_STOCK",
    connection: "DISCONNECTED",
    route: ["99UXA00L22036", "99UXA00L22051"],
  },
} as const;

/** Bandejas inventadas para los recorridos. */
export const TRAYS = ["99UXA00L22036", "99UXA00L22051", "99UXB00L22001"] as const;
