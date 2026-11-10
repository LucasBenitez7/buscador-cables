import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  CABLE_EDITABLE_FIELDS,
  diffFields,
  type CableEditableField,
  type CableFields,
  type ConnectionStatus,
  type CreateCableInput,
  type DeleteCableInput,
  type FieldValue,
  type InstallationStatus,
  type LocationType,
  type UpdateCableInput,
} from "@cables/shared";

export class CableServiceError extends Error {}

const CONFLICT =
  "Otra persona ha modificado este cable mientras lo editabas. Recarga la página para ver los cambios.";
const NOT_FOUND = "El cable no existe o está dado de baja.";

type Actor = { id: string };
type Db = Prisma.TransactionClient | typeof prisma;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DecimalLike = { toNumber(): number } | null;

const toNumber = (value: DecimalLike): number | null => (value === null ? null : value.toNumber());

type CableRow = {
  [K in CableEditableField]: K extends "crossSectionMm2" | "outerDiameterMm" | "lengthM"
    ? DecimalLike
    : K extends "conductors"
      ? number | null
      : K extends "code"
        ? string
        : string | null;
};

/** Plain values of the editable fields, comparable with `diffFields`. */
function fieldValues(row: CableRow): Record<CableEditableField, FieldValue> {
  return {
    code: row.code,
    description: row.description,
    typeId: row.typeId,
    colorId: row.colorId,
    manufacturerId: row.manufacturerId,
    conductors: row.conductors,
    crossSectionMm2: toNumber(row.crossSectionMm2),
    outerDiameterMm: toNumber(row.outerDiameterMm),
    lengthM: toNumber(row.lengthM),
    voltageRating: row.voltageRating,
    originId: row.originId,
    destinationId: row.destinationId,
    notes: row.notes,
  };
}

function inputValues(input: CableFields): Record<CableEditableField, FieldValue> {
  return Object.fromEntries(CABLE_EDITABLE_FIELDS.map((field) => [field, input[field]])) as Record<
    CableEditableField,
    FieldValue
  >;
}

function fieldData(input: CableFields) {
  return {
    code: input.code,
    description: input.description,
    typeId: input.typeId,
    colorId: input.colorId,
    manufacturerId: input.manufacturerId,
    conductors: input.conductors,
    crossSectionMm2: input.crossSectionMm2,
    outerDiameterMm: input.outerDiameterMm,
    lengthM: input.lengthM,
    voltageRating: input.voltageRating,
    originId: input.originId,
    destinationId: input.destinationId,
    notes: input.notes,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function assertCodeAvailable(db: Db, code: string, exceptId?: string) {
  const existing = await db.cable.findUnique({
    where: { code },
    select: { id: true, deletedAt: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new CableServiceError(
      existing.deletedAt
        ? `El código ${code} pertenece a un cable dado de baja; usa otro.`
        : `Ya existe un cable con el código ${code}.`,
    );
  }
}

/** Every referenced catalog item and location must exist. */
async function assertReferences(
  db: Db,
  refs: {
    typeId: string | null;
    colorId: string | null;
    manufacturerId: string | null;
    locationIds: (string | null)[];
  },
) {
  const locationIds = [...new Set(refs.locationIds.filter((id): id is string => id !== null))];
  const [type, color, manufacturer, locations] = await Promise.all([
    refs.typeId ? db.cableType.count({ where: { id: refs.typeId } }) : 1,
    refs.colorId ? db.color.count({ where: { id: refs.colorId } }) : 1,
    refs.manufacturerId ? db.manufacturer.count({ where: { id: refs.manufacturerId } }) : 1,
    locationIds.length > 0 ? db.location.count({ where: { id: { in: locationIds } } }) : 0,
  ]);
  if (type === 0) throw new CableServiceError("El tipo de cable elegido ya no existe.");
  if (color === 0) throw new CableServiceError("El color elegido ya no existe.");
  if (manufacturer === 0) throw new CableServiceError("El fabricante elegido ya no existe.");
  if (locations !== locationIds.length) {
    throw new CableServiceError("Alguna de las ubicaciones elegidas ya no existe.");
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Registers a cable and its CREATED event in one transaction. The event stores
 * every initial value, so the history starts complete.
 */
export async function createCable(
  actor: Actor,
  input: CreateCableInput,
): Promise<{ id: string; code: string }> {
  const currentLocationId = input.installationStatus === "LAID" ? null : input.currentLocationId;
  await assertCodeAvailable(prisma, input.code);
  await assertReferences(prisma, {
    typeId: input.typeId,
    colorId: input.colorId,
    manufacturerId: input.manufacturerId,
    locationIds: [input.originId, input.destinationId, currentLocationId],
  });

  const empty = Object.fromEntries(CABLE_EDITABLE_FIELDS.map((field) => [field, null])) as Record<
    CableEditableField,
    FieldValue
  >;
  const changes = {
    ...diffFields(CABLE_EDITABLE_FIELDS, empty, inputValues(input)),
    installationStatus: { from: null, to: input.installationStatus },
    connectionStatus: { from: null, to: input.connectionStatus },
    ...(currentLocationId ? { currentLocationId: { from: null, to: currentLocationId } } : {}),
  };
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const cable = await tx.cable.create({
        data: {
          ...fieldData(input),
          installationStatus: input.installationStatus,
          connectionStatus: input.connectionStatus,
          currentLocationId,
          lastAction: "CREATED",
          lastActionById: actor.id,
          lastActionAt: now,
        },
        select: { id: true, code: true },
      });
      await tx.cableEvent.create({
        data: {
          cableId: cable.id,
          userId: actor.id,
          action: "CREATED",
          toLocationId: currentLocationId,
          changes,
          createdAt: now,
        },
      });
      return cable;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CableServiceError(`Ya existe un cable con el código ${input.code}.`);
    }
    throw error;
  }
}

/**
 * Saves the edited fields if nobody changed the cable since `input.version`
 * was read. Records an UPDATED event with only the fields that changed.
 */
export async function updateCable(
  actor: Actor,
  input: UpdateCableInput,
): Promise<{ changed: boolean }> {
  const current = await prisma.cable.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!current) {
    throw new CableServiceError(NOT_FOUND);
  }
  if (current.version !== input.version) {
    throw new CableServiceError(CONFLICT);
  }

  const changes = diffFields(CABLE_EDITABLE_FIELDS, fieldValues(current), inputValues(input));
  if (Object.keys(changes).length === 0) {
    return { changed: false };
  }
  if (changes.code) {
    await assertCodeAvailable(prisma, input.code, input.id);
  }
  await assertReferences(prisma, {
    typeId: input.typeId,
    colorId: input.colorId,
    manufacturerId: input.manufacturerId,
    locationIds: [input.originId, input.destinationId],
  });

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // La condición sobre `version` hace la comprobación y la escritura atómicas.
      const { count } = await tx.cable.updateMany({
        where: { id: input.id, version: input.version, deletedAt: null },
        data: {
          ...fieldData(input),
          version: { increment: 1 },
          lastAction: "UPDATED",
          lastActionById: actor.id,
          lastActionAt: now,
        },
      });
      if (count === 0) {
        throw new CableServiceError(CONFLICT);
      }
      await tx.cableEvent.create({
        data: { cableId: input.id, userId: actor.id, action: "UPDATED", changes, createdAt: now },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CableServiceError(`Ya existe un cable con el código ${input.code}.`);
    }
    throw error;
  }
  return { changed: true };
}

/** Soft delete: the cable and its history stay in the database. */
export async function deleteCable(actor: Actor, input: DeleteCableInput): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.cable.updateMany({
      where: { id: input.id, version: input.version, deletedAt: null },
      data: {
        deletedAt: now,
        version: { increment: 1 },
        lastAction: "DELETED",
        lastActionById: actor.id,
        lastActionAt: now,
      },
    });
    if (count === 0) {
      const exists = await tx.cable.count({ where: { id: input.id, deletedAt: null } });
      throw new CableServiceError(exists ? CONFLICT : NOT_FOUND);
    }
    await tx.cableEvent.create({
      data: {
        cableId: input.id,
        userId: actor.id,
        action: "DELETED",
        changes: { deletedAt: { from: null, to: now.toISOString() } },
        notes: input.reason,
        createdAt: now,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type CableForEdit = Record<CableEditableField, FieldValue> & {
  id: string;
  code: string;
  version: number;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
};

export async function getCableForEdit(id: string): Promise<CableForEdit | null> {
  const cable = await prisma.cable.findFirst({ where: { id, deletedAt: null } });
  if (!cable) {
    return null;
  }
  return {
    ...fieldValues(cable),
    id: cable.id,
    code: cable.code,
    version: cable.version,
    installationStatus: cable.installationStatus,
    connectionStatus: cable.connectionStatus,
  };
}

export type CableListItem = {
  id: string;
  code: string;
  description: string | null;
  type: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  origin: string | null;
  destination: string | null;
  updatedAt: Date;
};

const locationLabelSelect = { name: true, parent: { select: { name: true } } } as const;

/** "Caldera 1 › Bandeja norte": site names repeat in every unit, so add the parent. */
function locationLabel(location: { name: string; parent: { name: string } | null } | null) {
  if (!location) {
    return null;
  }
  return location.parent ? `${location.parent.name} › ${location.name}` : location.name;
}

/** Most recently changed active cables (the full search arrives in phase 4). */
export async function listRecentCables(limit = 50): Promise<CableListItem[]> {
  const cables = await prisma.cable.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      code: true,
      description: true,
      installationStatus: true,
      connectionStatus: true,
      updatedAt: true,
      type: { select: { name: true } },
      origin: { select: locationLabelSelect },
      destination: { select: locationLabelSelect },
    },
  });
  return cables.map(({ type, origin, destination, ...cable }) => ({
    ...cable,
    type: type?.name ?? null,
    origin: locationLabel(origin),
    destination: locationLabel(destination),
  }));
}

export type Option = { id: string; label: string };
export type LocationOption = Option & { type: LocationType };

export type CableFormOptions = {
  cableTypes: Option[];
  colors: Option[];
  manufacturers: Option[];
  /** Every location except plants, labelled with its route ("Planta › Área › Sitio"). */
  locations: LocationOption[];
};

/** Locations labelled with their route ("Planta › Área › Sitio"), sorted by it. */
export async function listLocationOptions(
  options: { includePlants?: boolean } = {},
): Promise<LocationOption[]> {
  const locations = await prisma.location.findMany({
    select: { id: true, name: true, type: true, parentId: true },
  });
  const byId = new Map(locations.map((location) => [location.id, location]));
  const route = (id: string): string[] => {
    const location = byId.get(id);
    if (!location) {
      return [];
    }
    return [...(location.parentId ? route(location.parentId) : []), location.name];
  };

  return locations
    .filter((location) => options.includePlants || location.type !== "PLANT")
    .map((location) => ({
      id: location.id,
      label: route(location.id).join(" › "),
      type: location.type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
}

export async function getCableFormOptions(): Promise<CableFormOptions> {
  const byName = { orderBy: { name: "asc" }, select: { id: true, name: true } } as const;
  const [cableTypes, colors, manufacturers, locations] = await Promise.all([
    prisma.cableType.findMany(byName),
    prisma.color.findMany(byName),
    prisma.manufacturer.findMany(byName),
    listLocationOptions(),
  ]);
  const toOption = (item: { id: string; name: string }) => ({ id: item.id, label: item.name });

  return {
    cableTypes: cableTypes.map(toOption),
    colors: colors.map(toOption),
    manufacturers: manufacturers.map(toOption),
    locations,
  };
}
