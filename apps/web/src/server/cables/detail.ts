import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_ACTION_LABELS,
  CABLE_END_SIDE_LABELS,
  CABLE_FIELD_LABELS,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  describeCableEvent,
  formatDecimal,
  isRole,
  orderedChanges,
  type CableAction,
  type CableEndSide,
  type CableState,
  type ConnectionStatus,
  type InstallationStatus,
} from "@cables/shared";
import { listLocationOptions } from "@/server/cables/service";

export type ReadableChange = { field: string; from: string; to: string };

export type CableHistoryEntry = {
  id: string;
  action: CableAction;
  user: string;
  at: Date;
  /** Predicate of the sentence after the user's name: "movió el cable de A a B". */
  summary: string;
  notes: string | null;
  changes: ReadableChange[];
  /** For corrections: the event they correct ("Tendido · 11/11/26 10:42"). */
  corrects: string | null;
};

export type CableDetail = {
  id: string;
  code: string;
  /** For the action dialogs: the version the user acts on (concurrency control). */
  version: number;
  /** Raw state for the action state machine (ids, not names). */
  state: CableState;
  /** Planned route, in order: the list text and, if it is a known tray, its code. */
  route: { position: number; label: string; trayCode: string | null }[];
  description: string | null;
  type: string | null;
  color: { name: string; hex: string | null } | null;
  manufacturer: string | null;
  conductors: number | null;
  crossSectionMm2: number | null;
  outerDiameterMm: number | null;
  lengthM: number | null;
  voltageRating: string | null;
  notes: string | null;
  origin: string | null;
  destination: string | null;
  currentLocation: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  lastAction: { action: CableAction; user: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  deleted: { at: Date; user: string; reason: string | null } | null;
  history: CableHistoryEntry[];
};

const HISTORY_LIMIT = 100;
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

/** Names for the ids stored in events (locations by their full route). */
export type Lookups = {
  locations: Map<string, string>;
  types: Map<string, string>;
  colors: Map<string, string>;
  manufacturers: Map<string, string>;
};

export async function loadLookups(): Promise<Lookups> {
  const byName = { select: { id: true, name: true } } as const;
  const [locations, types, colors, manufacturers] = await Promise.all([
    listLocationOptions({ includePlants: true }),
    prisma.cableType.findMany(byName),
    prisma.color.findMany(byName),
    prisma.manufacturer.findMany(byName),
  ]);
  const toMap = (items: { id: string; name?: string; label?: string }[]) =>
    new Map(items.map((item) => [item.id, item.label ?? item.name ?? ""]));
  return {
    locations: toMap(locations),
    types: toMap(types),
    colors: toMap(colors),
    manufacturers: toMap(manufacturers),
  };
}

export const locationName = (lookups: Lookups, locationId: string | null) =>
  locationId ? (lookups.locations.get(locationId) ?? "(ubicación eliminada)") : null;

/** Users whose stored role is no longer valid are flagged instead of hidden. */
export const userName = (user: { name: string; role: string }) =>
  isRole(user.role) ? user.name : `${user.name} (rol desconocido)`;

/** Turns a stored `{ from, to }` value into text: names instead of ids, labels, commas. */
function readableValue(field: string, value: unknown, lookups: Lookups): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const text = String(value);
  switch (field) {
    case "originId":
    case "destinationId":
    case "currentLocationId":
      return lookups.locations.get(text) ?? "(ubicación eliminada)";
    case "typeId":
      return lookups.types.get(text) ?? "(tipo eliminado)";
    case "colorId":
      return lookups.colors.get(text) ?? "(color eliminado)";
    case "manufacturerId":
      return lookups.manufacturers.get(text) ?? "(fabricante eliminado)";
    case "installationStatus":
      return INSTALLATION_STATUS_LABELS[text as InstallationStatus] ?? text;
    case "looseEnd":
      return CABLE_END_SIDE_LABELS[text as CableEndSide] ?? text;
    case "connectionStatus":
      return CONNECTION_STATUS_LABELS[text as ConnectionStatus] ?? text;
    case "deletedAt":
      return dateFormat.format(new Date(text));
    default:
      return typeof value === "number" ? formatDecimal(value) : text;
  }
}

export function readableChanges(changes: unknown, lookups: Lookups): ReadableChange[] {
  return orderedChanges(changes).map(([field, change]) => ({
    field: CABLE_FIELD_LABELS[field as keyof typeof CABLE_FIELD_LABELS] ?? field,
    from: readableValue(field, change?.from, lookups),
    to: readableValue(field, change?.to, lookups),
  }));
}

const toNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

/**
 * Everything about a cable, including retired (soft-deleted) ones so their
 * record and history stay reachable from old links.
 */
export async function getCableDetail(id: string): Promise<CableDetail | null> {
  const cable = await prisma.cable.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      color: { select: { name: true, hex: true } },
      manufacturer: { select: { name: true } },
      lastActionBy: { select: { name: true } },
      looseEndTray: { select: { code: true } },
      routeSteps: {
        orderBy: { position: "asc" },
        select: { position: true, label: true, tray: { select: { code: true } } },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        include: {
          user: { select: { name: true, role: true } },
          correctsEvent: { select: { action: true, createdAt: true } },
        },
      },
    },
  });
  if (!cable) {
    return null;
  }

  const lookups = await loadLookups();
  const location = (locationId: string | null) => locationName(lookups, locationId);
  const deletion = cable.deletedAt
    ? cable.events.find((event) => event.action === "DELETED")
    : undefined;

  return {
    id: cable.id,
    code: cable.code,
    version: cable.version,
    state: {
      installationStatus: cable.installationStatus,
      connectionStatus: cable.connectionStatus,
      currentLocationId: cable.currentLocationId,
      looseEnd: cable.looseEnd,
      looseEndTray: cable.looseEndTray?.code ?? null,
      // Cables from the project lists may know the equipment but not the room.
      originId: cable.originId ?? cable.originEquipment,
      destinationId: cable.destinationId ?? cable.destinationEquipment,
      deleted: cable.deletedAt !== null,
    },
    route: cable.routeSteps.map((step) => ({
      position: step.position,
      label: step.label,
      trayCode: step.tray?.code ?? null,
    })),
    description: cable.description,
    type: cable.type?.name ?? null,
    color: cable.color,
    manufacturer: cable.manufacturer?.name ?? null,
    conductors: cable.conductors,
    crossSectionMm2: toNumber(cable.crossSectionMm2),
    outerDiameterMm: toNumber(cable.outerDiameterMm),
    lengthM: toNumber(cable.lengthM),
    voltageRating: cable.voltageRating,
    notes: cable.notes,
    origin: location(cable.originId),
    destination: location(cable.destinationId),
    currentLocation: location(cable.currentLocationId),
    installationStatus: cable.installationStatus,
    connectionStatus: cable.connectionStatus,
    lastAction:
      cable.lastAction && cable.lastActionAt
        ? {
            action: cable.lastAction,
            user: cable.lastActionBy?.name ?? "—",
            at: cable.lastActionAt,
          }
        : null,
    createdAt: cable.createdAt,
    updatedAt: cable.updatedAt,
    deleted: cable.deletedAt
      ? {
          at: cable.deletedAt,
          user: deletion ? userName(deletion.user) : "—",
          reason: deletion?.notes ?? null,
        }
      : null,
    history: cable.events.map((event) => ({
      id: event.id,
      action: event.action,
      user: userName(event.user),
      at: event.createdAt,
      summary: describeCableEvent({
        action: event.action,
        changes: event.changes,
        fromLocation: location(event.fromLocationId),
        toLocation: location(event.toLocationId),
      }),
      notes: event.notes,
      changes: readableChanges(event.changes, lookups),
      corrects: event.correctsEvent
        ? `${CABLE_ACTION_LABELS[event.correctsEvent.action]} · ${dateFormat.format(event.correctsEvent.createdAt)}`
        : null,
    })),
  };
}
