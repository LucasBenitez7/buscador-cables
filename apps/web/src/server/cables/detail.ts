import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_FIELD_LABELS,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  formatDecimal,
  isRole,
  type CableAction,
  type ConnectionStatus,
  type FieldChange,
  type InstallationStatus,
} from "@cables/shared";
import { listLocationOptions } from "@/server/cables/service";

export type ReadableChange = { field: string; from: string; to: string };

export type CableHistoryEntry = {
  id: string;
  action: CableAction;
  user: string;
  at: Date;
  notes: string | null;
  changes: ReadableChange[];
};

export type CableDetail = {
  id: string;
  code: string;
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

type Lookups = {
  locations: Map<string, string>;
  types: Map<string, string>;
  colors: Map<string, string>;
  manufacturers: Map<string, string>;
};

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
    case "connectionStatus":
      return CONNECTION_STATUS_LABELS[text as ConnectionStatus] ?? text;
    case "deletedAt":
      return dateFormat.format(new Date(text));
    default:
      return typeof value === "number" ? formatDecimal(value) : text;
  }
}

function readableChanges(changes: unknown, lookups: Lookups): ReadableChange[] {
  if (typeof changes !== "object" || changes === null) {
    return [];
  }
  return Object.entries(changes as Record<string, FieldChange>).map(([field, change]) => ({
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
      events: {
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        include: { user: { select: { name: true, role: true } } },
      },
    },
  });
  if (!cable) {
    return null;
  }

  const byName = { select: { id: true, name: true } } as const;
  const [locations, types, colors, manufacturers] = await Promise.all([
    listLocationOptions({ includePlants: true }),
    prisma.cableType.findMany(byName),
    prisma.color.findMany(byName),
    prisma.manufacturer.findMany(byName),
  ]);
  const toMap = (items: { id: string; name?: string; label?: string }[]) =>
    new Map(items.map((item) => [item.id, item.label ?? item.name ?? ""]));
  const lookups: Lookups = {
    locations: toMap(locations),
    types: toMap(types),
    colors: toMap(colors),
    manufacturers: toMap(manufacturers),
  };
  const location = (locationId: string | null) =>
    locationId ? (lookups.locations.get(locationId) ?? null) : null;

  const userName = (user: { name: string; role: string }) =>
    isRole(user.role) ? user.name : `${user.name} (rol desconocido)`;
  const deletion = cable.deletedAt
    ? cable.events.find((event) => event.action === "DELETED")
    : undefined;

  return {
    id: cable.id,
    code: cable.code,
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
      notes: event.notes,
      changes: readableChanges(event.changes, lookups),
    })),
  };
}
