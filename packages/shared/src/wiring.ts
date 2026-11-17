/**
 * Wiring of a cable (fase 11): its wires and where each one goes at each end, as the project
 * lists print them and as they are in the field. Shared by the load of the lists, the edit
 * mode of the wiring table and the activity pages.
 */
import { z } from "zod";
import type { FieldChange } from "./cables";

/** The four editable cells of a wire: terminal strip / block and terminal / point per end. */
export const WIRING_FIELDS = [
  "originBlock",
  "originPoint",
  "destinationBlock",
  "destinationPoint",
] as const;

export type WiringField = (typeof WIRING_FIELDS)[number];
export type WiringEnd = "origin" | "destination";

export const WIRING_FIELD_LABELS: Record<WiringField, string> = {
  originBlock: "Regletero de origen",
  originPoint: "Borna de origen",
  destinationBlock: "Regletero de destino",
  destinationPoint: "Borna de destino",
};

export const WIRING_END_LABELS: Record<WiringEnd, string> = {
  origin: "Origen",
  destination: "Destino",
};

export const endOfField = (field: WiringField): WiringEnd =>
  field.startsWith("origin") ? "origin" : "destination";

/** The value of each cell in the field, and in the list (`pdf…`). */
export type WireTerminals = Record<WiringField, string | null>;

export type WireRow = WireTerminals & {
  position: number;
  wire: string;
  colour: string | null;
  pdfOriginBlock: string | null;
  pdfOriginPoint: string | null;
  pdfDestinationBlock: string | null;
  pdfDestinationPoint: string | null;
};

const PDF_FIELD: Record<WiringField, keyof WireRow> = {
  originBlock: "pdfOriginBlock",
  originPoint: "pdfOriginPoint",
  destinationBlock: "pdfDestinationBlock",
  destinationPoint: "pdfDestinationPoint",
};

/** What the list says for a cell. */
export const pdfValue = (wire: WireRow, field: WiringField) =>
  wire[PDF_FIELD[field]] as string | null;

/** A cell that somebody corrected in the field: it no longer says what the list says. */
export const isFieldEdited = (wire: WireRow, field: WiringField) =>
  wire[field] !== pdfValue(wire, field);

/** Longest text of a cell; the lists print short codes ("X51", "1B2A TBAI", "Note 1"). */
export const WIRING_TEXT_MAX = 120;

/** Trims and collapses spaces; an empty cell is null. */
export const normalizeTerminal = (value: string | null | undefined) => {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
};

const terminalInput = z
  .string()
  .max(WIRING_TEXT_MAX, `Máximo ${WIRING_TEXT_MAX} caracteres`)
  // Codes and short notes; no control characters or markup.
  .regex(/^[^\p{Cc}<>]*$/u, "Contiene caracteres no permitidos")
  .nullable()
  .transform(normalizeTerminal);

/** What the edit mode sends: the cells of every wire it shows, and the version it read. */
export const wiringEditSchema = z.object({
  cableId: z.string().min(1).max(40),
  /** `cable.version` when the table was opened: another save in between is a conflict. */
  version: z.number().int().positive(),
  /** Save even if two wires of one end share a terminal (the user confirmed the warning). */
  confirmDuplicates: z.boolean().default(false),
  /** Why, in a few words ("el regletero está renumerado en campo"). Optional. */
  notes: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .nullish()
    .transform((value) => value || null),
  wires: z
    .array(
      z.object({
        position: z.number().int().positive(),
        originBlock: terminalInput,
        originPoint: terminalInput,
        destinationBlock: terminalInput,
        destinationPoint: terminalInput,
      }),
    )
    .min(1)
    .max(500)
    .refine(
      (wires) => new Set(wires.map((wire) => wire.position)).size === wires.length,
      "Hay hilos repetidos",
    ),
});

export type WiringEditInput = z.input<typeof wiringEditSchema>;
export type WiringEdit = z.output<typeof wiringEditSchema>;

/** Two or more wires that end in the same terminal (same strip and terminal, same end). */
export type DuplicateTerminal = {
  end: WiringEnd;
  block: string | null;
  point: string;
  /** Wire labels, in table order. */
  wires: string[];
};

const comparable = (value: string | null) => (value ?? "").toUpperCase();

/**
 * Terminals used by more than one wire at the same end. Only those where at least one of the
 * wires is in `touched` (positions changed in this edit): the lists themselves send several
 * wires to "PE" or to a note, and that must not stop every save.
 */
export function findDuplicateTerminals(
  wires: readonly (WireTerminals & { position: number; wire: string })[],
  touched?: ReadonlySet<number>,
): DuplicateTerminal[] {
  const duplicates: DuplicateTerminal[] = [];
  for (const end of ["origin", "destination"] as const) {
    const groups = new Map<string, typeof wires>();
    for (const wire of wires) {
      const point = wire[`${end}Point`];
      if (!point) continue;
      const key = `${comparable(wire[`${end}Block`])}\u0000${comparable(point)}`;
      groups.set(key, [...(groups.get(key) ?? []), wire]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      if (touched && !group.some((wire) => touched.has(wire.position))) continue;
      duplicates.push({
        end,
        block: group[0]![`${end}Block`],
        point: group[0]![`${end}Point`]!,
        wires: group.map((wire) => wire.wire),
      });
    }
  }
  return duplicates;
}

/** "X51 · 11", "· PE" when there is no strip, "—" when the cell is empty. */
export function formatTerminal(block: string | null, point: string | null): string {
  if (!block && !point) return "—";
  return [block, point].filter(Boolean).join(" · ");
}

/** "Origen: el 1+ y el 1- van a X51 · 11." */
export function describeDuplicate(duplicate: DuplicateTerminal): string {
  const wires = duplicate.wires.map((wire) => `el ${wire}`);
  const list =
    wires.length === 2 ? wires.join(" y ") : `${wires.slice(0, -1).join(", ")} y ${wires.at(-1)}`;
  return `${WIRING_END_LABELS[duplicate.end]}: ${list} van a ${formatTerminal(duplicate.block, duplicate.point)}.`;
}

// ---------------------------------------------------------------------------
// History: one event per save, one change per cell
// ---------------------------------------------------------------------------

/** A changed cell in a WIRING_EDITED event: `changes["wire.3.originPoint"]`. */
export type WiringChange = FieldChange & { wire: string };

const CHANGE_KEY = /^wire\.(\d+)\.(originBlock|originPoint|destinationBlock|destinationPoint)$/;

export const wiringChangeKey = (position: number, field: WiringField) =>
  `wire.${position}.${field}`;

export type WiringChangeEntry = WiringChange & { position: number; field: WiringField };

/** The cell changes of an event, in table order (by wire, then origin before destination). */
export function wiringChanges(changes: unknown): WiringChangeEntry[] {
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) return [];
  const entries: WiringChangeEntry[] = [];
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    const match = CHANGE_KEY.exec(key);
    if (!match || typeof value !== "object" || value === null) continue;
    const change = value as Partial<WiringChange>;
    entries.push({
      position: Number(match[1]),
      field: match[2] as WiringField,
      wire: typeof change.wire === "string" ? change.wire : `nº ${match[1]}`,
      from: change.from ?? null,
      to: change.to ?? null,
    });
  }
  return entries.sort(
    (a, b) =>
      a.position - b.position || WIRING_FIELDS.indexOf(a.field) - WIRING_FIELDS.indexOf(b.field),
  );
}

/** Wires whose strip or terminal changed, per end: a change of both cells counts once. */
export function countWiringChanges(changes: unknown): Record<WiringEnd, number> {
  const touched = { origin: new Set<number>(), destination: new Set<number>() };
  for (const change of wiringChanges(changes))
    touched[endOfField(change.field)].add(change.position);
  return { origin: touched.origin.size, destination: touched.destination.size };
}

const wireCount = (count: number) => (count === 1 ? "1 hilo" : `${count} hilos`);

/**
 * The predicate of the activity line: "corrigió las bornas de 3 hilos en origen y 1 en
 * destino". The detail page lists every cell.
 */
export function describeWiringEdit(changes: unknown): string {
  const { origin, destination } = countWiringChanges(changes);
  if (origin && destination) {
    return `corrigió las bornas de ${wireCount(origin)} en origen y ${destination} en destino`;
  }
  if (origin) return `corrigió las bornas de ${wireCount(origin)} en origen`;
  if (destination) return `corrigió las bornas de ${wireCount(destination)} en destino`;
  return "corrigió el conexionado";
}
