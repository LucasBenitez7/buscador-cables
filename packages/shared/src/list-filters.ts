/**
 * Filters and orders of the lists (accounts, account changes, the history of a cable, an
 * equipment) as they travel in the URL. Same rules as the cable search and the activity: Zod
 * on the server, and an invalid value is ignored instead of failing the page, so a shared or
 * old link always opens.
 */
import { z } from "zod";
import { CABLE_ACTIONS, type CableEventSource } from "./cables";
import { daySchema, firstParams, pageSchema, type RawSearchParams } from "./url-params";

const text = z
  .string()
  .trim()
  .max(120)
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .catch(undefined);

const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

/** Options of a select from a `{ value: label }` record, in the record's order. */
export const optionsOf = (labels: Record<string, string>): { value: string; label: string }[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Query string with the given values, without empty ones or the defaults in `skip`. */
export function listQuery(
  values: Record<string, string | number | undefined>,
  skip: Record<string, string | number> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "" || skip[key] === value) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ---------------------------------------------------------------------------
// Accounts (Usuarios)
// ---------------------------------------------------------------------------

export const USER_STATUSES = ["pending", "active", "inactive"] as const;
export const USER_STATUS_LABELS: Record<(typeof USER_STATUSES)[number], string> = {
  pending: "Pendientes de aprobar",
  active: "Activas",
  inactive: "Desactivadas",
};

export const USER_SORTS = ["priority", "name", "newest", "oldest", "role"] as const;
export const USER_SORT_LABELS: Record<(typeof USER_SORTS)[number], string> = {
  priority: "Pendientes primero",
  name: "Nombre (A-Z)",
  newest: "Alta más reciente",
  oldest: "Alta más antigua",
  role: "Rol",
};

export const USERS_PAGE_SIZE = 25;

export const userListSearchSchema = z.object({
  q: text,
  /** A role id (the four starting ones or one made on the web). */
  role: text,
  status: oneOf(USER_STATUSES),
  sort: oneOf(USER_SORTS),
  page: pageSchema,
});
export type UserListSearch = z.infer<typeof userListSearchSchema>;

export const parseUserListSearch = (params: RawSearchParams): UserListSearch =>
  userListSearchSchema.parse(firstParams(params));

// ---------------------------------------------------------------------------
// Account changes (auditoría de cuentas)
// ---------------------------------------------------------------------------

export const USER_EVENT_ACTIONS = [
  "CREATED",
  "APPROVED",
  "ROLE_CHANGED",
  "DEACTIVATED",
  "REACTIVATED",
  "PERMISSIONS_CHANGED",
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "ROLE_DELETED",
] as const;
export type UserEventActionName = (typeof USER_EVENT_ACTIONS)[number];

export const USER_EVENT_ACTION_LABELS: Record<UserEventActionName, string> = {
  CREATED: "Alta",
  APPROVED: "Aprobación",
  ROLE_CHANGED: "Cambio de rol",
  DEACTIVATED: "Desactivación",
  REACTIVATED: "Reactivación",
  PERMISSIONS_CHANGED: "Permisos extra",
  ROLE_CREATED: "Rol creado",
  ROLE_UPDATED: "Rol editado",
  ROLE_DELETED: "Rol borrado",
};

export const DATE_SORTS = ["newest", "oldest"] as const;
export type DateSort = (typeof DATE_SORTS)[number];
export const DATE_SORT_LABELS: Record<DateSort, string> = {
  newest: "Más recientes primero",
  oldest: "Más antiguos primero",
};

export const USER_EVENTS_PAGE_SIZE = 50;

export const userEventSearchSchema = z.object({
  action: oneOf(USER_EVENT_ACTIONS),
  /** A person who made the change or whose account changed. */
  person: text,
  from: daySchema,
  to: daySchema,
  sort: oneOf(DATE_SORTS),
  page: pageSchema,
});
export type UserEventSearch = z.infer<typeof userEventSearchSchema>;

export const parseUserEventSearch = (params: RawSearchParams): UserEventSearch =>
  userEventSearchSchema.parse(firstParams(params));

// ---------------------------------------------------------------------------
// Who wrote a movement: people in the app or the load of the project lists
// ---------------------------------------------------------------------------

/**
 * The load of the project (the lists, and the first Excel) writes one event per cable, and is
 * never shown: not in the activity, the history of a cable nor its last action (fase 14). The
 * Excel of the day is shown.
 */
export const VISIBLE_EVENT_SOURCES = [
  "APP",
  "EXCEL",
] as const satisfies readonly CableEventSource[];

export function isVisibleEventSource(source: CableEventSource): boolean {
  return (VISIBLE_EVENT_SOURCES as readonly CableEventSource[]).includes(source);
}

export const ACTIVITY_ORIGINS = ["people", "excel", "all"] as const;
export type ActivityOrigin = (typeof ACTIVITY_ORIGINS)[number];
export const ACTIVITY_ORIGIN_LABELS: Record<ActivityOrigin, string> = {
  people: "En campo",
  excel: "Excel",
  all: "Todo",
};

/** The event sources an origin shows: never the load of the project. */
export function originSources(origin: ActivityOrigin | undefined): CableEventSource[] {
  if (origin === "all") return [...VISIBLE_EVENT_SOURCES];
  return origin === "excel" ? ["EXCEL"] : ["APP"];
}

// ---------------------------------------------------------------------------
// History of a cable
// ---------------------------------------------------------------------------

export const cableHistorySearchSchema = z.object({
  origin: oneOf(ACTIVITY_ORIGINS),
  action: oneOf(CABLE_ACTIONS),
  person: text,
  sort: oneOf(DATE_SORTS),
});
export type CableHistorySearch = z.infer<typeof cableHistorySearchSchema>;

export const parseCableHistorySearch = (params: RawSearchParams): CableHistorySearch =>
  cableHistorySearchSchema.parse(firstParams(params));

// ---------------------------------------------------------------------------
// Equipment (cables that land in a cabinet)
// ---------------------------------------------------------------------------

export const EQUIPMENT_STATES = ["pending", "connected"] as const;
export const EQUIPMENT_STATE_LABELS: Record<(typeof EQUIPMENT_STATES)[number], string> = {
  pending: "Sin conectar aquí",
  connected: "Conectados aquí",
};

export const EQUIPMENT_TESTS = ["untested", "ok", "failed"] as const;
export const EQUIPMENT_TEST_LABELS: Record<(typeof EQUIPMENT_TESTS)[number], string> = {
  untested: "Sin timbrar",
  ok: "Timbrados",
  failed: "Timbrados con fallo",
};

export const EQUIPMENT_SORTS = ["block", "code", "pending"] as const;
export const EQUIPMENT_SORT_LABELS: Record<(typeof EQUIPMENT_SORTS)[number], string> = {
  block: "Por regletero y borna",
  code: "Por código de cable",
  pending: "Sin conectar primero",
};

export const equipmentSearchSchema = z.object({
  q: text,
  state: oneOf(EQUIPMENT_STATES),
  test: oneOf(EQUIPMENT_TESTS),
  block: text,
  sort: oneOf(EQUIPMENT_SORTS),
});
export type EquipmentSearch = z.infer<typeof equipmentSearchSchema>;

export const parseEquipmentSearch = (params: RawSearchParams): EquipmentSearch =>
  equipmentSearchSchema.parse(firstParams(params));

// ---------------------------------------------------------------------------
// Equipment list (búsqueda de equipos). Distinto de la ficha de un equipo: aquí solo hay el
// código y el orden.
// ---------------------------------------------------------------------------

export const EQUIPMENT_LIST_SORTS = ["cables", "cables-asc", "name", "name-desc"] as const;
export type EquipmentListSort = (typeof EQUIPMENT_LIST_SORTS)[number];
export const EQUIPMENT_LIST_SORT_LABELS: Record<EquipmentListSort, string> = {
  cables: "Más cables primero",
  "cables-asc": "Menos cables primero",
  name: "Código (A-Z)",
  "name-desc": "Código (Z-A)",
};

export const equipmentListSearchSchema = z.object({
  q: text,
  sort: oneOf(EQUIPMENT_LIST_SORTS),
});
export type EquipmentListSearch = z.infer<typeof equipmentListSearchSchema>;

export const parseEquipmentListSearch = (params: RawSearchParams): EquipmentListSearch =>
  equipmentListSearchSchema.parse(firstParams(params));
