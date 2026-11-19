import "server-only";
import { prisma } from "@cables/db";
import {
  CABLE_ACTION_LABELS,
  CABLE_END_SIDE_LABELS,
  CABLE_FIELD_LABELS,
  CONNECTION_STATUS_LABELS,
  TEST_STATUS_LABELS,
  installationStatusLabel,
  EXCEL_FIELD_LABELS,
  PROJECT_FIELD_LABELS,
  describeCableEvent,
  formatDecimal,
  isRole,
  orderedChanges,
  type CableAction,
  type CableEndSide,
  type CableLevel,
  type CableState,
  type ConnectionStatus,
  type TestStatus,
  type InstallationStatus,
  originSources,
  type CableHistorySearch,
  type RouteSection,
  type WireRow,
} from "@cables/shared";
import { listLocationOptions } from "@/server/cables/service";
import { visibleEventsWhere, visibleLastAction } from "@/server/activity/history-start";

/** A change as text, with a link for each value that has a page (a tray, a location). */
export type ReadableChange = {
  field: string;
  from: string;
  to: string;
  fromHref?: string;
  toHref?: string;
};

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
  /** Events too long for one line (terminals corrected): the page with every change. */
  detailHref: string | null;
};

export type CableJumperDetail = {
  position: number;
  code: string;
  fromBlock: string | null;
  fromPoint: string | null;
  toBlock: string | null;
  toPoint: string | null;
};

/** The wiring table (fase 11): wires with field and list values, and jumpers. */
export type CableWiring = {
  revision: string | null;
  wires: WireRow[];
  jumpers: CableJumperDetail[];
};

export type CableEndDetail = {
  equipment: string | null;
  cubicle: string | null;
  gland: string | null;
  functionKks: string | null;
  installationKks: string | null;
  room: string | null;
  /** Full route of the location in the tree ("99 › 99UX › 99UXA › 99UXA16RA001"). */
  location: string | null;
  /** To link the room to its page. */
  locationId: string | null;
};

export type CableDetail = {
  id: string;
  code: string;
  /** For the action dialogs: the version the user acts on (concurrency control). */
  version: number;
  /** Raw state for the action state machine (ids, not names). */
  state: CableState;
  /** Planned route, in order: the list text and, if it is a known tray, its code. */
  route: {
    position: number;
    label: string;
    trayCode: string | null;
    section: RouteSection | null;
  }[];
  level: CableLevel | null;
  altCode: string | null;
  revision: string | null;
  circuit: string | null;
  cablesPerCircuit: number | null;
  composition: string | null;
  diagram: string | null;
  lengthPending: boolean;
  /** Where the data comes from in the project lists, to check it on paper. */
  source: { document: string | null; page: number | null } | null;
  wiring: CableWiring;
  /** Both ends as the lists give them, plus the location in the tree. */
  ends: { origin: CableEndDetail; destination: CableEndDetail };
  description: string | null;
  type: string | null;
  color: { name: string; hex: string | null } | null;
  manufacturer: string | null;
  /** To open the cables with the same type, colour or manufacturer. */
  typeId: string | null;
  colorId: string | null;
  manufacturerId: string | null;
  conductors: number | null;
  crossSectionMm2: number | null;
  outerDiameterMm: number | null;
  lengthM: number | null;
  /** What the daily Excel says (fase 14). */
  excel: {
    /** Real date of laying, "YYYY-MM-DD". */
    laidOn: string | null;
    company: string | null;
    reel: string | null;
    reelStatus: string | null;
    /** Real metres of this cable, of the whole circuit and how many sections it has. */
    actualLengthM: number | null;
    actualLengthTotalM: number | null;
    actualSections: number | null;
  };
  voltageRating: string | null;
  notes: string | null;
  origin: string | null;
  destination: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  testStatus: TestStatus;
  lastAction: { action: CableAction; user: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  deleted: { at: Date; user: string; reason: string | null } | null;
  /**
   * The events that match the history filters (newest first unless asked otherwise), up to
   * `HISTORY_LIMIT`; `historyTotal` says how many match and `historyAll` how many there are
   * that can be seen (`visibleEventsWhere()`).
   */
  history: CableHistoryEntry[];
  historyTotal: number;
  historyAll: number;
  /** People who appear in the history, for its "Quién" filter. */
  historyPeople: { id: string; label: string }[];
};

export const HISTORY_LIMIT = 100;
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
      return installationStatusLabel(text);
    case "looseEnd":
      return CABLE_END_SIDE_LABELS[text as CableEndSide] ?? text;
    case "connectionStatus":
      return CONNECTION_STATUS_LABELS[text as ConnectionStatus] ?? text;
    case "testStatus":
      return TEST_STATUS_LABELS[text as TestStatus] ?? text;
    case "deletedAt":
      return dateFormat.format(new Date(text));
    default:
      return typeof value === "number" ? formatDecimal(value) : text;
  }
}

/** Where a stored value can be opened: a tray, or the cables of a location. */
function valueHref(field: string, value: unknown, lookups: Lookups): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  switch (field) {
    case "looseEndTray":
      return `/trays/${encodeURIComponent(value)}`;
    case "originId":
    case "destinationId":
    case "currentLocationId":
      return lookups.locations.has(value)
        ? `/cables?location=${encodeURIComponent(value)}`
        : undefined;
    default:
      return undefined;
  }
}

/** Cells of a terminal correction ("wire.3.originPoint"): shown on the event's own page. */
const isWiringCell = (field: string) => field.startsWith("wire.");

export function readableChanges(changes: unknown, lookups: Lookups): ReadableChange[] {
  return orderedChanges(changes)
    .filter(([field]) => !isWiringCell(field))
    .map(([field, change]) => {
      const fromHref = valueHref(field, change?.from, lookups);
      const toHref = valueHref(field, change?.to, lookups);
      return {
        field:
          CABLE_FIELD_LABELS[field as keyof typeof CABLE_FIELD_LABELS] ??
          PROJECT_FIELD_LABELS[field] ??
          EXCEL_FIELD_LABELS[field] ??
          field,
        from: readableValue(field, change?.from, lookups),
        to: readableValue(field, change?.to, lookups),
        ...(fromHref ? { fromHref } : {}),
        ...(toHref ? { toHref } : {}),
      };
    });
}

/** The page with every change of an event, for the ones summed up in one line. */
export const eventDetailHref = (event: { id: string; action: CableAction }) =>
  event.action === "WIRING_EDITED" ? `/activity/${event.id}` : null;

const toNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

/**
 * Everything about a cable, including retired (soft-deleted) ones so their
 * record and history stay reachable from old links.
 */
export async function getCableDetail(
  id: string,
  historySearch: CableHistorySearch = {},
): Promise<CableDetail | null> {
  const sources = originSources(historySearch.origin);
  // Lo anterior al corte y la carga del proyecto no aparecen en ningún sitio de la ficha.
  const visible = visibleEventsWhere();
  const historyWhere = {
    ...visible,
    source: { in: sources },
    ...(historySearch.action ? { action: historySearch.action } : {}),
    ...(historySearch.person ? { userId: historySearch.person } : {}),
  };
  const historyOrder = historySearch.sort === "oldest" ? "asc" : "desc";
  const cable = await prisma.cable.findUnique({
    where: { id },
    include: {
      type: { select: { name: true } },
      color: { select: { name: true, hex: true } },
      manufacturer: { select: { name: true } },
      company: { select: { name: true } },
      lastActionBy: { select: { name: true } },
      looseEndTray: { select: { code: true } },
      routeSteps: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          label: true,
          section: true,
          tray: { select: { code: true } },
        },
      },
      wires: { orderBy: { position: "asc" }, omit: { id: true, cableId: true } },
      jumpers: { orderBy: { position: "asc" }, omit: { id: true, cableId: true } },
    },
  });
  if (!cable) {
    return null;
  }

  // El historial va en su propia consulta y no anidado en la del cable: anidado (con su orden y
  // su límite) Prisma lo resolvía en una transacción con varias consultas a la vez sobre la
  // misma conexión, y `pg` avisa de que eso dejará de funcionar (pg@9).
  const [events, lookups, historyTotal, historyAll, people] = await Promise.all([
    prisma.cableEvent.findMany({
      where: { cableId: cable.id, ...historyWhere },
      orderBy: [{ createdAt: historyOrder }, { id: historyOrder }],
      take: HISTORY_LIMIT,
      include: {
        user: { select: { name: true, role: true } },
        correctsEvent: { select: { action: true, createdAt: true } },
      },
    }),
    loadLookups(),
    prisma.cableEvent.count({ where: { cableId: cable.id, ...historyWhere } }),
    prisma.cableEvent.count({ where: { cableId: cable.id, ...visible } }),
    prisma.user.findMany({
      where: { cableEvents: { some: { cableId: cable.id, ...visible } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const location = (locationId: string | null) => locationName(lookups, locationId);
  // The deletion reason is read even when the history filters leave it out.
  const deletion = cable.deletedAt
    ? await prisma.cableEvent.findFirst({
        where: { cableId: cable.id, action: "DELETED" },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, role: true } } },
      })
    : null;

  return {
    id: cable.id,
    code: cable.code,
    version: cable.version,
    state: {
      installationStatus: cable.installationStatus,
      connectionStatus: cable.connectionStatus,
      testStatus: cable.testStatus,
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
      section: step.section,
    })),
    level: cable.level,
    altCode: cable.altCode,
    revision: cable.revision,
    circuit: cable.circuit,
    cablesPerCircuit: cable.cablesPerCircuit,
    composition: cable.composition,
    diagram: cable.diagram,
    lengthPending: cable.lengthPending,
    source:
      cable.sourceDocument || cable.sourcePage
        ? { document: cable.sourceDocument, page: cable.sourcePage }
        : null,
    wiring: { revision: cable.wiringRevision, wires: cable.wires, jumpers: cable.jumpers },
    ends: {
      origin: {
        equipment: cable.originEquipment,
        cubicle: cable.originCubicle,
        gland: cable.originGland,
        functionKks: cable.originFunctionKks,
        installationKks: cable.originInstallationKks,
        room: cable.originRoom,
        location: location(cable.originId),
        locationId: cable.originId,
      },
      destination: {
        equipment: cable.destinationEquipment,
        cubicle: cable.destinationCubicle,
        gland: cable.destinationGland,
        functionKks: cable.destinationFunctionKks,
        installationKks: cable.destinationInstallationKks,
        room: cable.destinationRoom,
        location: location(cable.destinationId),
        locationId: cable.destinationId,
      },
    },
    description: cable.description,
    type: cable.type?.name ?? null,
    color: cable.color,
    manufacturer: cable.manufacturer?.name ?? null,
    typeId: cable.typeId,
    colorId: cable.colorId,
    manufacturerId: cable.manufacturerId,
    conductors: cable.conductors,
    crossSectionMm2: toNumber(cable.crossSectionMm2),
    outerDiameterMm: toNumber(cable.outerDiameterMm),
    lengthM: toNumber(cable.lengthM),
    excel: {
      laidOn: cable.laidOn ? cable.laidOn.toISOString().slice(0, 10) : null,
      company: cable.company?.name ?? null,
      reel: cable.reel,
      reelStatus: cable.reelStatus,
      actualLengthM: toNumber(cable.actualLengthM),
      actualLengthTotalM: toNumber(cable.actualLengthTotalM),
      actualSections: cable.actualSections,
    },
    voltageRating: cable.voltageRating,
    notes: cable.notes,
    origin: location(cable.originId),
    destination: location(cable.destinationId),
    installationStatus: cable.installationStatus,
    connectionStatus: cable.connectionStatus,
    testStatus: cable.testStatus,
    lastAction: visibleLastAction(
      cable.lastActionAt,
      cable.lastActionSource,
      cable.lastAction && cable.lastActionAt
        ? {
            action: cable.lastAction,
            user: cable.lastActionBy?.name ?? "—",
            at: cable.lastActionAt,
          }
        : null,
    ),
    createdAt: cable.createdAt,
    updatedAt: cable.updatedAt,
    deleted: cable.deletedAt
      ? {
          at: cable.deletedAt,
          user: deletion ? userName(deletion.user) : "—",
          reason: deletion?.notes ?? null,
        }
      : null,
    historyTotal,
    historyAll,
    historyPeople: people.map((person) => ({ id: person.id, label: userName(person) })),
    history: events.map((event) => ({
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
      detailHref: eventDetailHref(event),
    })),
  };
}
