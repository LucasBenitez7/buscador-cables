import { z } from "zod";
import { cableCodeSchema } from "./cable-code";

/** The Prisma enums must list exactly the same members. */
export const INSTALLATION_STATUSES = [
  "IN_STOCK",
  "COILED",
  "PARTIALLY_LAID",
  "LAID",
  "RETIRED",
] as const;
export const CONNECTION_STATUSES = [
  "DISCONNECTED",
  "ORIGIN_ONLY",
  "DESTINATION_ONLY",
  "CONNECTED",
] as const;
export const CABLE_ACTIONS = [
  "CREATED",
  "UPDATED",
  "LAID",
  "PARTIALLY_LAID",
  "COILED",
  "CONNECTED",
  "DISCONNECTED",
  "MOVED",
  "RETIRED",
  "CORRECTION",
  "DELETED",
] as const;

export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type CableAction = (typeof CABLE_ACTIONS)[number];

export const INSTALLATION_STATUS_LABELS: Record<InstallationStatus, string> = {
  IN_STOCK: "En almacén",
  COILED: "Enrollado",
  PARTIALLY_LAID: "Tendido parcial",
  LAID: "Tendido",
  RETIRED: "Retirado",
};

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  DISCONNECTED: "Desconectado",
  ORIGIN_ONLY: "Solo origen",
  DESTINATION_ONLY: "Solo destino",
  CONNECTED: "Conectado",
};

export const CABLE_ACTION_LABELS: Record<CableAction, string> = {
  CREATED: "Alta",
  UPDATED: "Datos editados",
  LAID: "Tendido",
  PARTIALLY_LAID: "Tendido parcial",
  COILED: "Enrollado",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  MOVED: "Movido",
  RETIRED: "Retirado",
  CORRECTION: "Corrección",
  DELETED: "Baja",
};

/** Fields a technician edits in the cable form (statuses change through actions). */
export const CABLE_EDITABLE_FIELDS = [
  "code",
  "description",
  "typeId",
  "colorId",
  "manufacturerId",
  "conductors",
  "crossSectionMm2",
  "outerDiameterMm",
  "lengthM",
  "voltageRating",
  "originId",
  "destinationId",
  "notes",
] as const;

export type CableEditableField = (typeof CABLE_EDITABLE_FIELDS)[number];

export const CABLE_FIELD_LABELS: Record<
  | CableEditableField
  | "installationStatus"
  | "connectionStatus"
  | "currentLocationId"
  | "looseEnd"
  | "looseEndTray"
  | "deletedAt",
  string
> = {
  code: "Código",
  description: "Descripción",
  typeId: "Tipo",
  colorId: "Color",
  manufacturerId: "Fabricante",
  conductors: "Nº de conductores",
  crossSectionMm2: "Sección (mm²)",
  outerDiameterMm: "Diámetro exterior (mm)",
  lengthM: "Longitud (m)",
  voltageRating: "Tensión nominal",
  originId: "Origen",
  destinationId: "Destino",
  notes: "Notas",
  installationStatus: "Estado de instalación",
  connectionStatus: "Estado de conexión",
  currentLocationId: "Ubicación actual",
  looseEnd: "Punta suelta",
  looseEndTray: "Bandeja de la punta suelta",
  deletedAt: "Baja",
};

// ---------------------------------------------------------------------------
// Field schemas (inputs arrive as strings from a FormData)
// ---------------------------------------------------------------------------

/** "" or missing → null; trims and caps length. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.string().max(max, `${label}: máximo ${max} caracteres`))
    .transform((value) => (value === "" ? null : value));
}

/** Optional foreign key: "" → null. */
const optionalId = z
  .string()
  .optional()
  .transform((value) => (value ? value : null));

/**
 * Optional positive decimal typed by people in Spain: accepts "2,5" and "2.5",
 * at most two decimals (the columns are DECIMAL(n, 2)). "" → null.
 */
function optionalDecimal(label: string, max: number) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      const text = (value ?? "").trim().replace(",", ".");
      if (text === "") {
        return null;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: escribe un número positivo con 2 decimales como máximo`,
        });
        return z.NEVER;
      }
      const number = Number(text);
      if (number <= 0 || number > max) {
        ctx.addIssue({ code: "custom", message: `${label}: debe estar entre 0 y ${max}` });
        return z.NEVER;
      }
      return number;
    });
}

const optionalConductors = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const text = (value ?? "").trim();
    if (text === "") {
      return null;
    }
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1 || number > 500) {
      ctx.addIssue({
        code: "custom",
        message: "Nº de conductores: un número entero entre 1 y 500",
      });
      return z.NEVER;
    }
    return number;
  });

const cableFieldsSchema = z.object({
  code: cableCodeSchema,
  description: optionalText(200, "Descripción"),
  typeId: optionalId,
  colorId: optionalId,
  manufacturerId: optionalId,
  conductors: optionalConductors,
  crossSectionMm2: optionalDecimal("Sección", 10_000),
  outerDiameterMm: optionalDecimal("Diámetro exterior", 1_000),
  lengthM: optionalDecimal("Longitud", 100_000),
  voltageRating: optionalText(30, "Tensión nominal"),
  originId: optionalId,
  destinationId: optionalId,
  notes: optionalText(2000, "Notas"),
});

export type CableFields = z.infer<typeof cableFieldsSchema>;

const differentEnds = (data: { originId: string | null; destinationId: string | null }) =>
  data.originId === null || data.originId !== data.destinationId;
const differentEndsIssue = {
  message: "El origen y el destino no pueden ser la misma ubicación",
  path: ["destinationId"],
};

/**
 * Initial status of a cable being registered. Returns an error message in
 * Spanish, or null when the combination is coherent.
 */
export function validateInitialStatus(input: {
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  currentLocationId: string | null;
  originId: string | null;
  destinationId: string | null;
}): string | null {
  const { installationStatus, connectionStatus } = input;
  if (installationStatus === "RETIRED") {
    return "Un cable no se puede dar de alta como retirado.";
  }
  if (installationStatus === "PARTIALLY_LAID") {
    return "Da de alta el cable y regístralo después con la acción «Tender a medias».";
  }
  if (installationStatus !== "LAID" && connectionStatus !== "DISCONNECTED") {
    return "Solo un cable tendido puede estar conectado.";
  }
  if (installationStatus !== "LAID" && !input.currentLocationId) {
    return "Indica dónde está el cable (almacén o lugar donde está enrollado).";
  }
  if (installationStatus === "LAID" && (!input.originId || !input.destinationId)) {
    return "Un cable tendido necesita origen y destino.";
  }
  return null;
}

export const createCableSchema = cableFieldsSchema
  .extend({
    installationStatus: z.enum(INSTALLATION_STATUSES, { error: "Estado de instalación no válido" }),
    connectionStatus: z.enum(CONNECTION_STATUSES, { error: "Estado de conexión no válido" }),
    currentLocationId: optionalId,
  })
  .refine(differentEnds, differentEndsIssue)
  .superRefine((data, ctx) => {
    const error = validateInitialStatus(data);
    if (error) {
      ctx.addIssue({ code: "custom", message: error, path: ["installationStatus"] });
    }
  });

const versionSchema = z.coerce
  .number({ error: "Versión no válida" })
  .int("Versión no válida")
  .min(1, "Versión no válida");

export const updateCableSchema = cableFieldsSchema
  .extend({ id: z.string().min(1), version: versionSchema })
  .refine(differentEnds, differentEndsIssue);

export const deleteCableSchema = z.object({
  id: z.string().min(1),
  version: versionSchema,
  reason: z
    .string({ error: "Indica el motivo de la baja" })
    .trim()
    .min(3, "Indica el motivo de la baja")
    .max(500, "El motivo no puede superar 500 caracteres"),
});

export type CreateCableInput = z.infer<typeof createCableSchema>;
export type UpdateCableInput = z.infer<typeof updateCableSchema>;
export type DeleteCableInput = z.infer<typeof deleteCableSchema>;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type FieldValue = string | number | null;
export type FieldChange = { from: FieldValue; to: FieldValue };

/** `{ field: { from, to } }` for every field whose value changed, in field order. */
export function diffFields<K extends string>(
  fields: readonly K[],
  before: Record<K, FieldValue>,
  after: Record<K, FieldValue>,
): Partial<Record<K, FieldChange>> {
  const changes: Partial<Record<K, FieldChange>> = {};
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}

/** "2.5" → "2,5": numbers as people in Spain read them. */
export function formatDecimal(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}
