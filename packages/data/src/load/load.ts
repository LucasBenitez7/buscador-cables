/**
 * Loads the extracted project data (`cables.json`, `trays.json`, `sheets.json`) into the
 * database.
 *
 * Idempotent: it creates or updates by code and can run again with a new revision of the
 * lists without duplicating anything. It only writes **engineering** data (what the lists
 * say). What the field records with the app — status, connection, location, loose end,
 * notes, history — is never overwritten, and neither is a value somebody corrected by hand
 * in the edit form (a measured length, the room of an end): the load keeps it and says so.
 * Every new cable gets its CREATED event and every change an UPDATED event, signed by the
 * user who runs the load and marked as written by the load.
 */
import type { Prisma, PrismaClient } from "@cables/db";
import {
  CABLE_FIELD_LABELS,
  diffFields,
  formatDecimal,
  parseBuildingCode,
  parseRoomCode,
  type FieldChange,
  type FieldValue,
} from "@cables/shared";
import { z } from "zod";
import {
  projectCableSchema,
  projectSheetSchema,
  projectTraySchema,
  type ProjectCable,
  type ProjectRouteStep,
  type ProjectSheet,
  type ProjectTray,
} from "../extract/schema";
import { sheetKey } from "../render/render-sheets";

export type LoadOptions = {
  /** Who signs the events of the load. */
  userId: string;
  now?: Date;
  onProgress?: (message: string) => void;
  /** Runs the whole load in one transaction and rolls it back: only the summary is kept. */
  dryRun?: boolean;
};

/** What the load needs from the database: the client itself or one open transaction. */
type Db = Prisma.TransactionClient;
/** Runs a group of writes atomically. In a dry run everything already shares one transaction. */
type Within = <T>(run: (tx: Db) => Promise<T>) => Promise<T>;

export type LoadSummary = {
  locations: { created: number };
  cableTypes: { created: number };
  sheets: { created: number; updated: number; removed: number };
  trays: { created: number; updated: number; unchanged: number };
  cables: { created: number; updated: number; unchanged: number; skipped: number };
  /** Cables loaded earlier from the lists that the new lists no longer include. */
  missingFromLists: string[];
  issues: string[];
};

const BATCH = 500;

/** Engineering fields of a cable, in the order the history shows them. */
const ENGINEERING_FIELDS = [
  "description",
  "level",
  "altCode",
  "revision",
  "typeId",
  "conductors",
  "crossSectionMm2",
  "voltageRating",
  "lengthM",
  "lengthPending",
  "circuit",
  "cablesPerCircuit",
  "composition",
  "diagram",
  "originId",
  "originEquipment",
  "originCubicle",
  "originGland",
  "originFunctionKks",
  "originInstallationKks",
  "originRoom",
  "destinationId",
  "destinationEquipment",
  "destinationCubicle",
  "destinationGland",
  "destinationFunctionKks",
  "destinationInstallationKks",
  "destinationRoom",
  "sourceDocument",
  "sourcePage",
] as const;

type EngineeringField = (typeof ENGINEERING_FIELDS)[number];
type EngineeringValues = Record<EngineeringField, FieldValue>;

const TRAY_FIELDS = [
  "kind",
  "voltageLevel",
  "elevationLevel",
  "areaCode",
  "locationId",
  "widthMm",
  "flangeHeightMm",
  "bendRadiusMm",
  "diameterMm",
] as const;

const round2 = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);
const decimal = (value: { toNumber(): number } | null) => round2(value?.toNumber() ?? null);
const chunks = <T>(items: readonly T[], size = BATCH) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const ROLLBACK = Symbol("dry run");

export async function loadProjectData(
  client: PrismaClient,
  /** `sheets` may be missing in an extraction made before the drawings had sheets. */
  input: { cables: unknown; trays: unknown; sheets?: unknown },
  { userId, now = new Date(), onProgress = () => {}, dryRun = false }: LoadOptions,
): Promise<LoadSummary> {
  // The files come from disk: validate them again before writing anything.
  const cables = z.array(projectCableSchema).parse(input.cables);
  const trays = z.array(projectTraySchema).parse(input.trays);
  const sheets =
    input.sheets === undefined ? null : z.array(projectSheetSchema).parse(input.sheets);
  const run = (db: Db, within: Within) =>
    loadValidated(db, within, { cables, trays, sheets }, { userId, now, onProgress });

  if (!dryRun) {
    return run(client, (write) => client.$transaction(write));
  }
  let summary: LoadSummary | undefined;
  await client
    .$transaction(
      async (tx) => {
        summary = await run(tx, (write) => write(tx));
        throw ROLLBACK;
      },
      { timeout: 10 * 60 * 1000, maxWait: 30 * 1000 },
    )
    .catch((error: unknown) => {
      if (error !== ROLLBACK) throw error;
    });
  return summary!;
}

async function loadValidated(
  db: Db,
  within: Within,
  {
    cables,
    trays,
    sheets,
  }: { cables: ProjectCable[]; trays: ProjectTray[]; sheets: ProjectSheet[] | null },
  { userId, now, onProgress }: Required<Pick<LoadOptions, "userId" | "now" | "onProgress">>,
): Promise<LoadSummary> {
  const summary: LoadSummary = {
    locations: { created: 0 },
    cableTypes: { created: 0 },
    sheets: { created: 0, updated: 0, removed: 0 },
    trays: { created: 0, updated: 0, unchanged: 0 },
    cables: { created: 0, updated: 0, unchanged: 0, skipped: 0 },
    missingFromLists: [],
    issues: [],
  };

  const locations = await ensureLocations(db, cables, trays, summary);
  onProgress(`Ubicaciones: ${summary.locations.created} nuevas`);
  const typeIds = await ensureCableTypes(db, cables, summary);
  onProgress(`Tipos de cable: ${summary.cableTypes.created} nuevos`);
  const sheetIds = sheets ? await loadSheets(db, sheets, summary) : await currentSheetIds(db);
  onProgress(
    `Hojas de plano: ${summary.sheets.created} nuevas, ${summary.sheets.updated} actualizadas, ` +
      `${summary.sheets.removed} retiradas`,
  );
  const trayIds = await loadTrays(db, within, trays, locations, sheetIds, summary);
  onProgress(`Bandejas: ${summary.trays.created} nuevas, ${summary.trays.updated} actualizadas`);
  await loadCables(
    db,
    within,
    cables,
    { locations, typeIds, trayIds, userId, now },
    summary,
    onProgress,
  );
  return summary;
}

// ---------------------------------------------------------------------------
// Locations: plant → building group → building → room, from the KKS codes
// ---------------------------------------------------------------------------

type LocationRef = { id: string; path: string };
type Node = {
  code: string;
  name: string;
  type: "PLANT" | "AREA" | "UNIT" | "SITE";
  parentCode: string | null;
};

const roomOf = (room: string | null) => (room ? parseRoomCode(room) : null);

async function ensureLocations(
  db: Db,
  cables: readonly ProjectCable[],
  trays: readonly ProjectTray[],
  summary: LoadSummary,
): Promise<Map<string, LocationRef>> {
  const nodes = new Map<string, Node>();
  const addBuilding = (unit: string, groupCode: string, buildingCode: string) => {
    nodes.set(unit, { code: unit, name: `Planta ${unit}`, type: "PLANT", parentCode: null });
    nodes.set(groupCode, { code: groupCode, name: groupCode, type: "AREA", parentCode: unit });
    nodes.set(buildingCode, {
      code: buildingCode,
      name: buildingCode,
      type: "UNIT",
      parentCode: groupCode,
    });
  };
  for (const cable of cables) {
    for (const end of [cable.origin, cable.destination]) {
      const room = roomOf(end.room);
      if (!room) continue;
      addBuilding(room.unit, room.groupCode, room.buildingCode);
      nodes.set(room.code, {
        code: room.code,
        name: room.code,
        type: "SITE",
        parentCode: room.buildingCode,
      });
    }
  }
  for (const tray of trays) {
    const building = parseBuildingCode(tray.areaCode);
    if (building) addBuilding(building.unit, building.groupCode, building.buildingCode);
  }

  const existing = await db.location.findMany({
    where: { code: { in: [...nodes.keys()] } },
    select: { id: true, code: true, type: true, path: true, parent: { select: { code: true } } },
  });
  const byCode = new Map(existing.map((location) => [location.code, location]));
  const refs = new Map<string, LocationRef>();

  // Parents first: plants, then groups, buildings and rooms.
  for (const type of ["PLANT", "AREA", "UNIT", "SITE"] as const) {
    for (const node of [...nodes.values()].filter((candidate) => candidate.type === type)) {
      const parent = node.parentCode ? refs.get(node.parentCode) : null;
      if (node.parentCode && !parent) continue;
      const found = byCode.get(node.code);
      if (found) {
        // Somebody may have renamed it: keep it, but only if it is still the same place.
        if (found.type !== node.type || (found.parent?.code ?? null) !== node.parentCode) {
          summary.issues.push(
            `La ubicación ${node.code} ya existe en otro sitio del árbol: no se usa para los cables.`,
          );
          continue;
        }
        refs.set(node.code, { id: found.id, path: found.path });
        continue;
      }
      const path = `${parent?.path ?? ""}/${node.code}`;
      const created = await db.location.create({
        data: {
          code: node.code,
          name: node.name,
          type: node.type,
          parentId: parent?.id ?? null,
          path,
        },
        select: { id: true, path: true },
      });
      refs.set(node.code, created);
      summary.locations.created += 1;
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Cable types
// ---------------------------------------------------------------------------

/** Names compared as the catalog does: ignoring case and repeated spaces. */
const typeKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The id of the cable type of every name in the lists. A type is the same one when its name
 * matches (ignoring case and spacing) or, if it was renamed in the app, when it still has
 * the code the lists give it: the load never renames a type nor duplicates a renamed one.
 */
async function ensureCableTypes(
  db: Db,
  cables: readonly ProjectCable[],
  summary: LoadSummary,
): Promise<Map<string, string>> {
  const wanted = new Map<string, string | null>();
  for (const cable of cables) {
    if (!wanted.has(cable.typeName) || (cable.typeCode && !wanted.get(cable.typeName))) {
      wanted.set(cable.typeName, cable.typeCode);
    }
  }
  const wantedKeys = new Set([...wanted.keys()].map(typeKey));
  const existing = await db.cableType.findMany({ select: { id: true, name: true, code: true } });
  const byKey = new Map(existing.map((type) => [typeKey(type.name), type]));
  const byCode = new Map(existing.flatMap((type) => (type.code ? [[type.code, type]] : [])));
  const usedCodes = new Set(byCode.keys());
  const codeOf = (name: string, code: string | null) => {
    if (!code) return null;
    if (usedCodes.has(code)) {
      summary.issues.push(
        `El código de tipo ${code} ya lo tiene otro tipo: "${name}" queda sin código.`,
      );
      return null;
    }
    usedCodes.add(code);
    return code;
  };

  const ids = new Map<string, string>();
  for (const [name, code] of wanted) {
    const sameName = byKey.get(typeKey(name));
    if (sameName) {
      ids.set(name, sameName.id);
      if (!sameName.code && code) {
        const free = codeOf(sameName.name, code);
        if (free) await db.cableType.update({ where: { id: sameName.id }, data: { code: free } });
      }
      continue;
    }
    // Renamed in the app: it keeps the code, and no type of the lists has its new name.
    const sameCode = code ? byCode.get(code) : undefined;
    if (sameCode && !wantedKeys.has(typeKey(sameCode.name))) {
      ids.set(name, sameCode.id);
      continue;
    }
    const created = await db.cableType.create({
      data: { name, code: codeOf(name, code) },
      select: { id: true, name: true, code: true },
    });
    ids.set(name, created.id);
    byKey.set(typeKey(name), created);
    summary.cableTypes.created += 1;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Drawing sheets
// ---------------------------------------------------------------------------

const drawingSheetKey = (sheet: { drawing: string; sheet: string }) =>
  `${sheet.drawing}#${sheet.sheet}`;

async function currentSheetIds(db: Db): Promise<Map<string, string>> {
  const rows = await db.drawingSheet.findMany({ select: { id: true, drawing: true, sheet: true } });
  return new Map(rows.map((row) => [drawingSheetKey(row), row.id]));
}

/**
 * Creates or updates every sheet; the ones the drawings no longer have are removed (their
 * trays keep the sheet name, without image). Sheets hold no field data.
 */
async function loadSheets(
  db: Db,
  sheets: readonly ProjectSheet[],
  summary: LoadSummary,
): Promise<Map<string, string>> {
  const existing = await db.drawingSheet.findMany();
  const byKey = new Map(existing.map((row) => [drawingSheetKey(row), row]));
  const ids = new Map<string, string>();
  for (const sheet of sheets) {
    const key = drawingSheetKey(sheet);
    const values = {
      title: sheet.title,
      sourcePage: sheet.page,
      width: sheet.width,
      height: sheet.height,
      imageKey: sheetKey(sheet),
      fingerprint: sheet.fingerprint,
    };
    const current = byKey.get(key);
    if (!current) {
      const created = await db.drawingSheet.create({
        data: { drawing: sheet.drawing, sheet: sheet.sheet, ...values },
        select: { id: true },
      });
      ids.set(key, created.id);
      summary.sheets.created += 1;
      continue;
    }
    ids.set(key, current.id);
    const changed = (Object.keys(values) as (keyof typeof values)[]).some(
      (field) => current[field] !== values[field],
    );
    if (changed) {
      await db.drawingSheet.update({ where: { id: current.id }, data: values });
      summary.sheets.updated += 1;
    }
  }
  const gone = existing.filter((row) => !ids.has(drawingSheetKey(row)));
  if (gone.length > 0) {
    await db.drawingSheet.deleteMany({ where: { id: { in: gone.map((row) => row.id) } } });
    summary.sheets.removed += gone.length;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Trays and their drawing sheets
// ---------------------------------------------------------------------------

async function loadTrays(
  db: Db,
  within: Within,
  trays: readonly ProjectTray[],
  locations: Map<string, LocationRef>,
  sheetIds: Map<string, string>,
  summary: LoadSummary,
): Promise<Map<string, string>> {
  const existing = await db.tray.findMany({
    include: { drawings: { orderBy: [{ drawing: "asc" }, { sheet: "asc" }] } },
  });
  const byCode = new Map(existing.map((tray) => [tray.code, tray]));
  const ids = new Map(existing.map((tray) => [tray.code, tray.id]));

  const valuesOf = (tray: ProjectTray) => ({
    kind: tray.kind,
    voltageLevel: tray.voltageLevel,
    elevationLevel: tray.elevationLevel,
    areaCode: tray.areaCode,
    locationId: locations.get(tray.areaCode)?.id ?? null,
    widthMm: tray.widthMm,
    flangeHeightMm: tray.flangeHeightMm,
    bendRadiusMm: tray.bendRadiusMm,
    diameterMm: tray.diameterMm,
  });
  const sheetsOf = (tray: ProjectTray) =>
    tray.drawings
      .map(({ drawing, sheet, title, sourcePage, marks }) => ({
        drawing,
        sheet,
        title,
        sourcePage,
        marks,
        sheetId: sheetIds.get(drawingSheetKey({ drawing, sheet })) ?? null,
      }))
      .sort((a, b) => a.drawing.localeCompare(b.drawing) || a.sheet.localeCompare(b.sheet));
  const sameSheets = (a: readonly object[], b: readonly object[]) =>
    JSON.stringify(a) === JSON.stringify(b);

  const toCreate = trays.filter((tray) => !byCode.has(tray.code));
  for (const batch of chunks(toCreate)) {
    const created = await db.tray.createManyAndReturn({
      data: batch.map((tray) => ({ code: tray.code, ...valuesOf(tray) })),
      select: { id: true, code: true },
    });
    for (const tray of created) ids.set(tray.code, tray.id);
    await db.trayDrawing.createMany({
      data: batch.flatMap((tray) =>
        sheetsOf(tray).map((sheet) => ({ ...sheet, trayId: ids.get(tray.code)! })),
      ),
    });
    summary.trays.created += created.length;
  }

  for (const tray of trays) {
    const current = byCode.get(tray.code);
    if (!current) continue;
    const values = valuesOf(tray);
    const changed = TRAY_FIELDS.some((field) => current[field] !== values[field]);
    const sheets = sheetsOf(tray);
    const currentSheets = current.drawings.map(
      ({ drawing, sheet, title, sourcePage, marks, sheetId }) => ({
        drawing,
        sheet,
        title,
        sourcePage,
        marks,
        sheetId,
      }),
    );
    const sheetsChanged = !sameSheets(sheets, currentSheets);
    if (!changed && !sheetsChanged) {
      summary.trays.unchanged += 1;
      continue;
    }
    // Trays hold no field data (only their notes, which the load never touches).
    await within(async (tx) => {
      if (changed) await tx.tray.update({ where: { id: current.id }, data: values });
      if (sheetsChanged) {
        await tx.trayDrawing.deleteMany({ where: { trayId: current.id } });
        await tx.trayDrawing.createMany({
          data: sheets.map((sheet) => ({ ...sheet, trayId: current.id })),
        });
      }
    });
    summary.trays.updated += 1;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Cables and their routes
// ---------------------------------------------------------------------------

type CableContext = {
  locations: Map<string, LocationRef>;
  typeIds: Map<string, string>;
  trayIds: Map<string, string>;
  userId: string;
  now: Date;
};

/** The location of an end: its room, if the list gives a KKS room. */
function endLocationId(room: string | null, locations: Map<string, LocationRef>) {
  const parsed = roomOf(room);
  return parsed ? (locations.get(parsed.code)?.id ?? null) : null;
}

function engineeringValues(cable: ProjectCable, context: CableContext): EngineeringValues {
  return {
    description: cable.description,
    level: cable.level,
    altCode: cable.altCode,
    revision: cable.revision,
    typeId: context.typeIds.get(cable.typeName) ?? null,
    conductors: cable.conductors,
    crossSectionMm2: round2(cable.crossSectionMm2),
    voltageRating: cable.voltageRating,
    lengthM: round2(cable.lengthM),
    lengthPending: cable.lengthPending ? "sí" : "no",
    circuit: cable.circuit,
    cablesPerCircuit: cable.cablesPerCircuit,
    composition: cable.composition,
    diagram: cable.diagram,
    originId: endLocationId(cable.origin.room, context.locations),
    originEquipment: cable.origin.equipment,
    originCubicle: cable.origin.cubicle,
    originGland: cable.origin.gland,
    originFunctionKks: cable.origin.functionKks,
    originInstallationKks: cable.origin.installationKks,
    originRoom: cable.origin.room,
    destinationId: endLocationId(cable.destination.room, context.locations),
    destinationEquipment: cable.destination.equipment,
    destinationCubicle: cable.destination.cubicle,
    destinationGland: cable.destination.gland,
    destinationFunctionKks: cable.destination.functionKks,
    destinationInstallationKks: cable.destination.installationKks,
    destinationRoom: cable.destination.room,
    sourceDocument: cable.sourceDocument,
    sourcePage: cable.sourcePage,
  };
}

/** Field values as Prisma wants them (the boolean is a "sí"/"no" only for the history). */
function toColumns(values: Partial<EngineeringValues>) {
  const { lengthPending, ...rest } = values;
  return {
    ...rest,
    ...(lengthPending === undefined ? {} : { lengthPending: lengthPending === "sí" }),
  } as Record<string, unknown>;
}

type StoredStep = {
  position: number;
  label: string;
  trayId: string | null;
  section: string | null;
};

function routeRows(route: readonly ProjectRouteStep[], trayIds: Map<string, string>): StoredStep[] {
  return route.map((step, index) => ({
    position: index + 1,
    label: step.label,
    trayId: step.trayCode ? (trayIds.get(step.trayCode) ?? null) : null,
    section: step.section,
  }));
}

/**
 * Engineering fields a person can also change in the edit form. If the last one to change
 * one of them was a person (not an earlier load), the load keeps their value.
 */
const HAND_EDITABLE_FIELDS = [
  "description",
  "typeId",
  "conductors",
  "crossSectionMm2",
  "voltageRating",
  "lengthM",
  "originId",
  "destinationId",
] as const satisfies readonly EngineeringField[];

type HandEditableField = (typeof HAND_EDITABLE_FIELDS)[number];

const isHandEditable = (field: string): field is HandEditableField =>
  (HAND_EDITABLE_FIELDS as readonly string[]).includes(field);

/**
 * For each cable, the fields whose latest change in the history was made by a person in
 * the app. A later load that changed the field again takes it back.
 */
async function handEditedFields(db: Db, cableIds: readonly string[]) {
  const edited = new Map<string, Set<string>>();
  for (const batch of chunks(cableIds)) {
    const events = await db.cableEvent.findMany({
      where: { cableId: { in: batch }, action: "UPDATED" },
      select: { cableId: true, changes: true, source: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const event of events) {
      const fields = edited.get(event.cableId) ?? new Set<string>();
      edited.set(event.cableId, fields);
      const changed =
        event.changes && typeof event.changes === "object" && !Array.isArray(event.changes)
          ? Object.keys(event.changes)
          : [];
      for (const field of changed) {
        if (event.source === "APP") fields.add(field);
        else fields.delete(field);
      }
    }
  }
  return edited;
}

/** "Longitud (m) corregida en la app (150); el listado dice 142": why a field was kept. */
function keptEditMessage(code: string, field: HandEditableField, change: FieldChange): string {
  const label = CABLE_FIELD_LABELS[field];
  // Locations and types are ids: their names are in the app, not here.
  if (field === "typeId" || field === "originId" || field === "destinationId") {
    return `${code}: ${label} cambiado en la app; no se sustituye por el del listado.`;
  }
  const text = (value: FieldValue) =>
    value === null ? "sin dato" : typeof value === "number" ? formatDecimal(value) : value;
  return `${code}: ${label} corregido en la app (${text(change.from)}); el listado dice ${text(change.to)}. No se cambia.`;
}

async function loadCables(
  db: Db,
  within: Within,
  cables: readonly ProjectCable[],
  context: CableContext,
  summary: LoadSummary,
  onProgress: (message: string) => void,
) {
  const existing = await db.cable.findMany({
    where: {
      OR: [{ code: { in: cables.map((cable) => cable.code) } }, { sourceDocument: { not: null } }],
    },
    include: { routeSteps: { orderBy: { position: "asc" } } },
  });
  const byCode = new Map(existing.map((cable) => [cable.code, cable]));
  const listed = new Set(cables.map((cable) => cable.code));
  summary.missingFromLists = existing
    .filter((cable) => cable.sourceDocument && !listed.has(cable.code) && !cable.deletedAt)
    .map((cable) => cable.code)
    .sort();

  // A route step whose tray is unknown keeps its text but loses the link: say so.
  const unknownTrays = new Set(
    cables.flatMap((cable) =>
      cable.route.flatMap((step) =>
        step.trayCode && !context.trayIds.has(step.trayCode) ? [step.trayCode] : [],
      ),
    ),
  );
  if (unknownTrays.size > 0) {
    const codes = [...unknownTrays].sort();
    summary.issues.push(
      `Los recorridos nombran ${codes.length} bandejas que no están cargadas (${codes.slice(0, 10).join(", ")}${codes.length > 10 ? "…" : ""}): esos tramos quedan sin enlazar.`,
    );
  }

  // New cables, in batches: they come in "unverified" until somebody checks them.
  const toCreate = cables.filter((cable) => !byCode.has(cable.code));
  for (const batch of chunks(toCreate)) {
    const created = await within(async (tx) => {
      const rows = await tx.cable.createManyAndReturn({
        data: batch.map((cable) => ({
          code: cable.code,
          ...toColumns(engineeringValues(cable, context)),
          notes: cable.notes,
          installationStatus: "UNVERIFIED" as const,
          connectionStatus: "DISCONNECTED" as const,
          lastAction: "CREATED" as const,
          lastActionById: context.userId,
          lastActionAt: context.now,
        })),
        select: { id: true, code: true },
      });
      const idOf = new Map(rows.map((row) => [row.code, row.id]));
      await tx.cableEvent.createMany({
        data: batch.map((cable) => ({
          cableId: idOf.get(cable.code)!,
          userId: context.userId,
          action: "CREATED" as const,
          source: "PROJECT_LOAD" as const,
          changes: { installationStatus: { from: null, to: "UNVERIFIED" } },
          notes: `Cargado de los listados del proyecto (${cable.sourceDocument ?? cable.sourceFile}, pág. ${cable.sourcePage}).`,
          createdAt: context.now,
        })),
      });
      await tx.cableRouteStep.createMany({
        data: batch.flatMap((cable) =>
          routeRows(cable.route, context.trayIds).map((step) => ({
            ...step,
            section: step.section as "FIELD" | "ROOM" | null,
            cableId: idOf.get(cable.code)!,
          })),
        ),
      });
      return rows.length;
    });
    summary.cables.created += created;
    onProgress(`Cables nuevos: ${summary.cables.created} de ${toCreate.length}`);
  }

  // Cables already in the database: only what the lists say, and only if it changed.
  type Pending = {
    cable: ProjectCable;
    current: (typeof existing)[number];
    after: EngineeringValues;
    changes: Record<string, FieldChange>;
    route: StoredStep[];
    currentRoute: StoredStep[];
    routeChanged: boolean;
  };
  const pending: Pending[] = [];
  for (const cable of cables) {
    const current = byCode.get(cable.code);
    if (!current) continue;
    if (current.deletedAt) {
      summary.cables.skipped += 1;
      summary.issues.push(`${cable.code} está dado de baja en la app: no se actualiza.`);
      continue;
    }
    const before: EngineeringValues = {
      ...(Object.fromEntries(
        ENGINEERING_FIELDS.map((field) => [
          field,
          (current as Record<string, unknown>)[field] ?? null,
        ]),
      ) as EngineeringValues),
      crossSectionMm2: decimal(current.crossSectionMm2),
      lengthM: decimal(current.lengthM),
      lengthPending: current.lengthPending ? "sí" : "no",
    };
    const after = engineeringValues(cable, context);
    // The power lists give no room: a room somebody chose in the app is not "removed".
    for (const field of ["originId", "destinationId"] as const) {
      if (after[field] === null && before[field] !== null) after[field] = before[field];
    }
    const changes: Record<string, FieldChange> = diffFields(ENGINEERING_FIELDS, before, after);

    const route = routeRows(cable.route, context.trayIds);
    const currentRoute = current.routeSteps.map(({ position, label, trayId, section }) => ({
      position,
      label,
      trayId,
      section,
    }));
    const routeChanged = JSON.stringify(route) !== JSON.stringify(currentRoute);
    if (Object.keys(changes).length === 0 && !routeChanged) {
      summary.cables.unchanged += 1;
      continue;
    }
    pending.push({ cable, current, after, changes, route, currentRoute, routeChanged });
  }

  // Values a person corrected in the app win over the lists: keep them and say so.
  const edited = await handEditedFields(
    db,
    pending
      .filter(({ changes }) => Object.keys(changes).some(isHandEditable))
      .map(({ current }) => current.id),
  );
  const trayCodes = new Map([...context.trayIds].map(([code, id]) => [id, code]));

  for (const { cable, current, after, changes, route, currentRoute, routeChanged } of pending) {
    const kept = edited.get(current.id);
    for (const field of Object.keys(changes)) {
      if (kept?.has(field) && isHandEditable(field)) {
        summary.issues.push(keptEditMessage(cable.code, field, changes[field]!));
        delete changes[field];
      }
    }
    if (routeChanged) {
      changes.route = { from: `${currentRoute.length} tramos`, to: `${route.length} tramos` };
      // A partially laid cable waits in a tray of its route: the new route may not have it.
      const looseTrayId = current.looseEndTrayId;
      const routeTrays = route.flatMap((step) => (step.trayId ? [step.trayId] : []));
      if (looseTrayId && routeTrays.length > 0 && !routeTrays.includes(looseTrayId)) {
        summary.issues.push(
          `${cable.code}: la punta suelta espera en la bandeja ${trayCodes.get(looseTrayId) ?? "?"}, que ya no está en su recorrido nuevo. Revísalo en campo.`,
        );
      }
    }
    if (Object.keys(changes).length === 0) {
      summary.cables.unchanged += 1;
      continue;
    }

    const changedValues = Object.fromEntries(
      Object.keys(changes)
        .filter((field) => field !== "route")
        .map((field) => [field, after[field as EngineeringField]]),
    ) as Partial<EngineeringValues>;
    await within(async (tx) => {
      // The summary columns ("último movimiento") stay with the field actions.
      await tx.cable.update({
        where: { id: current.id },
        data: { ...toColumns(changedValues), version: { increment: 1 } },
      });
      if (routeChanged) {
        await tx.cableRouteStep.deleteMany({ where: { cableId: current.id } });
        await tx.cableRouteStep.createMany({
          data: route.map((step) => ({
            ...step,
            section: step.section as "FIELD" | "ROOM" | null,
            cableId: current.id,
          })),
        });
      }
      await tx.cableEvent.create({
        data: {
          cableId: current.id,
          userId: context.userId,
          action: "UPDATED",
          source: "PROJECT_LOAD",
          changes,
          notes: `Actualizado desde los listados del proyecto (revisión ${cable.revision ?? "?"}).`,
          createdAt: context.now,
        },
      });
    });
    summary.cables.updated += 1;
  }
}
