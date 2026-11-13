/**
 * Loads the extracted project data (`cables.json`, `trays.json`) into the database.
 *
 * Idempotent: it creates or updates by code and can run again with a new revision of the
 * lists without duplicating anything. It only writes **engineering** data (what the lists
 * say). What the field records with the app — status, connection, location, loose end,
 * notes, history — is never overwritten. Every new cable gets its CREATED event and every
 * change an UPDATED event, signed by the user who runs the load.
 */
import type { PrismaClient } from "@cables/db";
import {
  diffFields,
  parseBuildingCode,
  parseRoomCode,
  type FieldChange,
  type FieldValue,
} from "@cables/shared";
import { z } from "zod";
import {
  projectCableSchema,
  projectTraySchema,
  type ProjectCable,
  type ProjectRouteStep,
  type ProjectTray,
} from "../extract/schema";

export type LoadOptions = {
  /** Who signs the events of the load. */
  userId: string;
  now?: Date;
  onProgress?: (message: string) => void;
};

export type LoadSummary = {
  locations: { created: number };
  cableTypes: { created: number };
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

export async function loadProjectData(
  db: PrismaClient,
  input: { cables: unknown; trays: unknown },
  { userId, now = new Date(), onProgress = () => {} }: LoadOptions,
): Promise<LoadSummary> {
  // The files come from disk: validate them again before writing anything.
  const cables = z.array(projectCableSchema).parse(input.cables);
  const trays = z.array(projectTraySchema).parse(input.trays);
  const summary: LoadSummary = {
    locations: { created: 0 },
    cableTypes: { created: 0 },
    trays: { created: 0, updated: 0, unchanged: 0 },
    cables: { created: 0, updated: 0, unchanged: 0, skipped: 0 },
    missingFromLists: [],
    issues: [],
  };

  const locations = await ensureLocations(db, cables, trays, summary);
  onProgress(`Ubicaciones: ${summary.locations.created} nuevas`);
  const typeIds = await ensureCableTypes(db, cables, summary);
  onProgress(`Tipos de cable: ${summary.cableTypes.created} nuevos`);
  const trayIds = await loadTrays(db, trays, locations, summary);
  onProgress(`Bandejas: ${summary.trays.created} nuevas, ${summary.trays.updated} actualizadas`);
  await loadCables(db, cables, { locations, typeIds, trayIds, userId, now }, summary, onProgress);
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
  db: PrismaClient,
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

async function ensureCableTypes(
  db: PrismaClient,
  cables: readonly ProjectCable[],
  summary: LoadSummary,
): Promise<Map<string, string>> {
  const wanted = new Map<string, string | null>();
  for (const cable of cables) {
    if (!wanted.has(cable.typeName) || (cable.typeCode && !wanted.get(cable.typeName))) {
      wanted.set(cable.typeName, cable.typeCode);
    }
  }
  const existing = await db.cableType.findMany({ select: { id: true, name: true, code: true } });
  const ids = new Map(existing.map((type) => [type.name, type.id]));
  const usedCodes = new Set(existing.flatMap((type) => (type.code ? [type.code] : [])));
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

  for (const type of existing) {
    const code = wanted.get(type.name);
    if (!type.code && code) {
      const free = codeOf(type.name, code);
      if (free) await db.cableType.update({ where: { id: type.id }, data: { code: free } });
    }
  }
  for (const [name, code] of wanted) {
    if (ids.has(name)) continue;
    const created = await db.cableType.create({
      data: { name, code: codeOf(name, code) },
      select: { id: true },
    });
    ids.set(name, created.id);
    summary.cableTypes.created += 1;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Trays and their drawing sheets
// ---------------------------------------------------------------------------

async function loadTrays(
  db: PrismaClient,
  trays: readonly ProjectTray[],
  locations: Map<string, LocationRef>,
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
      .map((drawing) => ({ ...drawing }))
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
    const currentSheets = current.drawings.map(({ drawing, sheet, title, sourcePage }) => ({
      drawing,
      sheet,
      title,
      sourcePage,
    }));
    const sheetsChanged = !sameSheets(sheets, currentSheets);
    if (!changed && !sheetsChanged) {
      summary.trays.unchanged += 1;
      continue;
    }
    // Trays hold no field data (only their notes, which the load never touches).
    await db.$transaction(async (tx) => {
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

async function loadCables(
  db: PrismaClient,
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

  // New cables, in batches: they come in "unverified" until somebody checks them.
  const toCreate = cables.filter((cable) => !byCode.has(cable.code));
  for (const batch of chunks(toCreate)) {
    const created = await db.$transaction(async (tx) => {
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
    const changes: Record<string, FieldChange> = diffFields(ENGINEERING_FIELDS, before, after);

    const route = routeRows(cable.route, context.trayIds);
    const currentRoute = current.routeSteps.map(({ position, label, trayId, section }) => ({
      position,
      label,
      trayId,
      section,
    }));
    const routeChanged = JSON.stringify(route) !== JSON.stringify(currentRoute);
    if (routeChanged) {
      changes.route = { from: `${currentRoute.length} tramos`, to: `${route.length} tramos` };
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
    await db.$transaction(async (tx) => {
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
          changes,
          notes: `Actualizado desde los listados del proyecto (revisión ${cable.revision ?? "?"}).`,
          createdAt: context.now,
        },
      });
    });
    summary.cables.updated += 1;
  }
}
