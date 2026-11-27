/**
 * The reels in the two daily Excel files (fase 18). Each file brings two sheets about them:
 *
 * - the follow-up («Seguimientos Bobina cable»): one row per reel handed to the site, with the
 *   metres received, used and left, and the pullings done and still to do;
 * - the stock list («DrumsR01»): every reel of the project, with the metres it came with.
 *
 * Both are read and joined: the follow-up gives the figures, the stock list adds the reels the
 * follow-up does not track yet. A reel is known by its warehouse tag and by the factory drum
 * («Drum Identification»). The electrical file identifies it by the tag; the instrumentation
 * one, by the drum and the tag together, because a drum delivered in two pieces keeps its
 * factory name in both («3» and «3B»).
 *
 * Pure functions, shared by the browser, which reads the file, and the server, which validates
 * the reels again with `excelReelSchema`. The columns are found by their name, never by their
 * position.
 */
import { z } from "zod";
import { excelCell, normalizeHeader, type ExcelCell, type ExcelKind } from "./excel-status";

/** Accepted names of the two sheets, the same in both files. */
export const EXCEL_REEL_SHEETS = {
  tracking: ["Seguimientos Bobina cable", "Seguimiento Bobina cable", "Seguimiento bobinas"],
  stock: ["DrumsR01", "Drums"],
} as const;

type ReelField =
  | "request"
  | "drum"
  | "tag"
  | "code"
  | "description"
  | "voltage"
  | "pickedUpOn"
  | "receivedM"
  | "usedM"
  | "remainingM"
  | "pulls"
  | "pendingPulls"
  | "pendingM"
  | "otherM"
  | "deliveredOn"
  | "deliveredM";

type ReelColumn<Field extends string = ReelField> = {
  field: Field;
  /** How the messages call it when it is missing. */
  label: string;
  names?: readonly string[];
  /** For headers that change their first word from file to file («… TAG NUMBER»). */
  patterns?: readonly RegExp[];
  required?: boolean;
};

/** The warehouse number of the reel: «Warehouse TAG NUMBER» in one file, another word in the other. */
const TAG_PATTERNS = [/(^| )tag number$/, /^our tag n/];

const TRACKING_COLUMNS: readonly ReelColumn[] = [
  { field: "request", label: "Nro Solicitud", names: ["Nro Solicitud", "Nº Solicitud"] },
  {
    field: "drum",
    label: "Drum Identification",
    names: ["Drum Identification"],
    required: true,
  },
  { field: "tag", label: "… TAG NUMBER", patterns: TAG_PATTERNS, required: true },
  {
    field: "description",
    label: "Descripcion Cable",
    names: ["Descripcion Cable", "Descripción cable", "Description", "Descripcion"],
  },
  { field: "voltage", label: "Tipo voltaje", names: ["Tipo voltaje", "Type Voltaje"] },
  { field: "pickedUpOn", label: "Fecha/Recogida", names: ["Fecha/Recogida", "Fecha recogida"] },
  { field: "receivedM", label: "Metros Recibidos", names: ["Metros Recibidos"], required: true },
  { field: "usedM", label: "Metros Usados", names: ["Metros Usados"], required: true },
  {
    field: "remainingM",
    label: "Metros Restantes",
    names: ["Metros Restantes"],
    required: true,
  },
  { field: "pulls", label: "Tiradas reales", names: ["Tiradas reales"], required: true },
  {
    field: "pendingPulls",
    label: "Tiradas pendientes",
    names: ["Tiradas pendientes"],
    required: true,
  },
  { field: "pendingM", label: "Mts estimados", names: ["Mts estimados", "Metros estimados"] },
  { field: "otherM", label: "Otros consumos", names: ["Otros consumos"] },
  { field: "deliveredOn", label: "Fecha/Entrega", names: ["Fecha/Entrega", "Fecha entrega"] },
  { field: "deliveredM", label: "Metros entregados", names: ["Metros entregados"] },
];

const STOCK_COLUMNS: readonly ReelColumn[] = [
  { field: "tag", label: "… TAG NUMBER", patterns: TAG_PATTERNS, required: true },
  { field: "drum", label: "Drum Identification", names: ["Drum Identification"] },
  // The electrical list also gives the code the reel has in the engineering tables.
  { field: "code", label: "Drum codification", patterns: [/^drum codification/] },
  {
    field: "description",
    label: "Description",
    names: ["Description of Goods", "Description of Gods", "Description", "Descripcion"],
  },
  { field: "voltage", label: "Type Voltaje", names: ["Type Voltaje", "Tipo voltaje"] },
  {
    field: "receivedM",
    label: "Meters",
    names: ["QUANTITY RECEIVER", "QUANTITY RECEIVED", "Meters", "Metros"],
  },
];

// ---------------------------------------------------------------------------
// Reels
// ---------------------------------------------------------------------------

const REEL_ID_LIMIT = 60;
const TEXT_LIMIT = 100;

/**
 * A reel name as the app compares it: capitals and single spaces («p25004576 » → «P25004576»).
 * Every real one carries a figure: «0», «.», «NA», «PEND» or «ELIMINADO» are not reels.
 */
export function reelId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const id = value.replace(/\s+/g, " ").trim().toUpperCase();
  if (id === "" || id === "0" || !/\d/.test(id) || id.length > REEL_ID_LIMIT) return null;
  return id;
}

/** «155 / 154»: the reels a cable names, each as `reelId` says. */
export function reelIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value.split(/[/,;]/).map((part) => reelId(part));
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

const reelIdSchema = z.string().trim().min(1).max(REEL_ID_LIMIT);
const textSchema = z.string().trim().min(1).max(TEXT_LIMIT).nullable();
const metresSchema = z.number().min(-10_000_000).max(10_000_000).nullable();
const countSchema = z.number().int().min(0).max(100_000).nullable();

/** One reel as the Excel says it is. */
export const excelReelSchema = z
  .object({
    /** Factory name («Drum Identification»). */
    drum: reelIdSchema.nullable(),
    /** Warehouse number, the one written on the reel. */
    tag: reelIdSchema.nullable(),
    /** The code of the engineering tables, when the stock list gives it. */
    code: textSchema,
    /** Who asked for it («Nro Solicitud»): the site's own name for the reel. */
    request: textSchema,
    description: textSchema,
    voltage: textSchema,
    pickedUpOn: z.iso.date().nullable(),
    receivedM: metresSchema,
    usedM: metresSchema,
    /** Can be below zero: the Excel says so when more was used than received. */
    remainingM: metresSchema,
    pulls: countSchema,
    pendingPulls: countSchema,
    /** Metres the pending pullings need. */
    pendingM: metresSchema,
    otherM: metresSchema,
    deliveredOn: z.iso.date().nullable(),
    deliveredM: metresSchema,
    /** In the follow-up sheet; false: only in the stock list, without its figures. */
    tracked: z.boolean(),
    /**
     * Times the stock list names it: a lot of fibre comes as several reels with one name, which
     * the follow-up counts as one. Null when the stock list does not bring it.
     */
    pieces: z.number().int().min(1).max(1000).nullable(),
  })
  .refine((reel) => reel.drum !== null || reel.tag !== null, {
    message: "Bobina sin drum ni número de almacén",
  });
export type ExcelReel = z.infer<typeof excelReelSchema>;

/**
 * Most reels a file can bring: the project has a few hundred. They go with the first request
 * of the upload, and this many stay well below the body limit of a Server Action.
 */
export const EXCEL_MAX_REELS = 2000;

export const excelReelsSchema = z.array(excelReelSchema).max(EXCEL_MAX_REELS);

/** How a reel is told apart from the others of its kind (see the top of the file). */
export function reelKey(kind: ExcelKind, reel: { drum: string | null; tag: string | null }) {
  if (kind === "ELECTRICAL") return reel.tag !== null ? `T:${reel.tag}` : `D:${reel.drum}`;
  return `${reel.drum ?? ""}|${reel.tag ?? ""}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ExcelReelsResult =
  | {
      ok: true;
      reels: ExcelReel[];
      /** Rows of a reel already read in the same sheet: the first one is kept. */
      repeated: number;
    }
  | { ok: false; sheet: "tracking" | "stock"; missingColumns: string[] };

/** The header rows are looked for among the first ones: the stock list may have a title. */
const HEADER_SEARCH_ROWS = 10;

type Located<Field extends string = ReelField> = {
  headerAt: number;
  columns: Partial<Record<Field, number>>;
};

function locate<Field extends string>(
  table: readonly ExcelCell[][],
  spec: readonly ReelColumn<Field>[],
): Located<Field> | { missing: string[] } {
  let best: { missing: string[] } | null = null;
  for (let at = 0; at < Math.min(table.length, HEADER_SEARCH_ROWS); at += 1) {
    const headers = (table[at] ?? []).map((cell) =>
      typeof cell === "string" ? normalizeHeader(cell) : "",
    );
    const columns: Partial<Record<Field, number>> = {};
    const missing: string[] = [];
    for (const column of spec) {
      const names = (column.names ?? []).map(normalizeHeader);
      const index = headers.findIndex(
        (header) =>
          header !== "" &&
          (names.includes(header) ||
            (column.patterns ?? []).some((pattern) => pattern.test(header))),
      );
      if (index >= 0) columns[column.field] = index;
      else if (column.required) missing.push(column.label);
    }
    if (missing.length === 0) return { headerAt: at, columns };
    if (!best || missing.length < best.missing.length) best = { missing };
  }
  return best ?? { missing: spec.filter((column) => column.required).map((c) => c.label) };
}

/** A reel name in a cell: numbers as Excel keeps them («26», not «26.0»). */
function idOf(value: ExcelCell): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) ? reelId(String(value)) : null;
  }
  return reelId(excelCell.text(value));
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function metresOf(value: ExcelCell): number | null {
  const parsed = excelCell.number(value);
  return parsed === null ? null : round2(parsed);
}

function countOf(value: ExcelCell): number | null {
  const parsed = excelCell.number(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

const EMPTY_REEL: Omit<ExcelReel, "drum" | "tag" | "tracked" | "pieces"> = {
  code: null,
  request: null,
  description: null,
  voltage: null,
  pickedUpOn: null,
  receivedM: null,
  usedM: null,
  remainingM: null,
  pulls: null,
  pendingPulls: null,
  pendingM: null,
  otherM: null,
  deliveredOn: null,
  deliveredM: null,
};

function readRows(table: readonly ExcelCell[][], located: Located, tracked: boolean): ExcelReel[] {
  const at = (values: readonly ExcelCell[], field: ReelField): ExcelCell => {
    const index = located.columns[field];
    return index === undefined ? null : values[index];
  };
  // A «0» in a text column is a formula with nothing to show, not a name.
  const text = (values: readonly ExcelCell[], field: ReelField) => {
    const value = excelCell.text(at(values, field));
    return value === "0" ? null : value;
  };
  const reels: ExcelReel[] = [];
  for (const values of table.slice(located.headerAt + 1)) {
    const drum = idOf(at(values, "drum"));
    const tag = idOf(at(values, "tag"));
    if (drum === null && tag === null) continue;
    reels.push({
      drum,
      tag,
      tracked,
      pieces: tracked ? null : 1,
      code: text(values, "code"),
      request: text(values, "request"),
      description: text(values, "description"),
      voltage: text(values, "voltage"),
      pickedUpOn: excelCell.day(at(values, "pickedUpOn")),
      receivedM: metresOf(at(values, "receivedM")),
      usedM: metresOf(at(values, "usedM")),
      remainingM: metresOf(at(values, "remainingM")),
      pulls: countOf(at(values, "pulls")),
      pendingPulls: countOf(at(values, "pendingPulls")),
      pendingM: metresOf(at(values, "pendingM")),
      otherM: metresOf(at(values, "otherM")),
      deliveredOn: excelCell.day(at(values, "deliveredOn")),
      deliveredM: metresOf(at(values, "deliveredM")),
    });
  }
  return reels;
}

/**
 * Reads the reels of a file from its two sheets; either may be missing (null), but a sheet
 * that is there must have its columns. The follow-up comes first: the stock list only fills
 * what it leaves empty and adds the reels it does not track.
 */
export function readExcelReels(
  kind: ExcelKind,
  sheets: { tracking: readonly ExcelCell[][] | null; stock: readonly ExcelCell[][] | null },
): ExcelReelsResult {
  const parts: { name: "tracking" | "stock"; rows: ExcelReel[] }[] = [];
  for (const [name, table, spec] of [
    ["tracking", sheets.tracking, TRACKING_COLUMNS],
    ["stock", sheets.stock, STOCK_COLUMNS],
  ] as const) {
    if (!table) continue;
    const located = locate(table, spec);
    if ("missing" in located) return { ok: false, sheet: name, missingColumns: located.missing };
    parts.push({ name, rows: readRows(table, located, name === "tracking") });
  }

  const byKey = new Map<string, ExcelReel>();
  let repeated = 0;
  for (const part of parts) {
    // Where each row of this sheet went: a reel named again in the stock list is one more piece.
    const seen = new Map<string, string>();
    for (const row of part.rows) {
      const key = reelKey(kind, row);
      const already = seen.get(key);
      if (already !== undefined) {
        if (part.name === "tracking") repeated += 1;
        else {
          const reel = byKey.get(already)!;
          byKey.set(already, { ...reel, pieces: (reel.pieces ?? 1) + 1 });
        }
        continue;
      }
      const knownKey = byKey.has(key) ? key : sameTagWithoutDrum(byKey, row);
      const known = knownKey === null ? undefined : byKey.get(knownKey);
      if (!known || knownKey === null) {
        seen.set(key, key);
        byKey.set(key, row);
        continue;
      }
      seen.set(key, knownKey);
      // The same reel in the stock list: it fills only what the follow-up leaves empty.
      const filled = { ...known };
      for (const field of Object.keys(EMPTY_REEL) as (keyof typeof EMPTY_REEL)[]) {
        if (filled[field] === null && row[field] !== null) {
          (filled as Record<string, unknown>)[field] = row[field];
        }
      }
      byKey.set(knownKey, {
        ...filled,
        drum: known.drum ?? row.drum,
        pieces: known.pieces ?? row.pieces,
      });
    }
  }
  return { ok: true, reels: [...byKey.values()], repeated };
}

/**
 * The reel already read with the same tag, when one of the two has no drum (a typo in the
 * follow-up): only if there is exactly one, so that two pieces of a drum never merge.
 */
function sameTagWithoutDrum(byKey: ReadonlyMap<string, ExcelReel>, row: ExcelReel) {
  if (row.tag === null) return null;
  const found = [...byKey].filter(
    ([, reel]) => reel.tag === row.tag && (reel.drum === null || row.drum === null),
  );
  return found.length === 1 ? found[0]![0] : null;
}

/** The message of a sheet that lacks columns. */
export function reelSheetMessage(
  result: Extract<ExcelReelsResult, { ok: false }>,
  sheetName: string,
): string {
  return `Faltan columnas en la hoja «${sheetName}»: ${result.missingColumns.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Pullings
// ---------------------------------------------------------------------------

/**
 * The sheet where each pulling is written down with its reel: «Bobina-Tag» in the electrical
 * file (one row per core, «…T1C2», with its section), «Table» in the instrumentation one.
 */
export const EXCEL_REEL_PULL_SHEETS: Record<ExcelKind, readonly string[]> = {
  ELECTRICAL: ["Bobina-Tag", "Bobina Tag"],
  INSTRUMENTATION: ["Table"],
};

type PullField = "code" | "conductor" | "tag" | "drum" | "startM" | "endM" | "pulledM" | "pulledOn";

const PULL_COLUMNS: Record<ExcelKind, readonly ReelColumn<PullField>[]> = {
  ELECTRICAL: [
    { field: "code", label: "Cable Code", names: ["Cable Code"], required: true },
    { field: "conductor", label: "TAG Cable", names: ["TAG Cable"] },
    { field: "tag", label: "Bobina Real", names: ["Bobina Real"], required: true },
    { field: "startM", label: "start", names: ["star", "start"] },
    { field: "endM", label: "end", names: ["end"] },
    { field: "pulledM", label: "pulled", names: ["pulled"], required: true },
    { field: "pulledOn", label: "fecha", names: ["fecha", "date"] },
  ],
  INSTRUMENTATION: [
    { field: "code", label: "CABLE TAG", names: ["CABLE TAG"], required: true },
    { field: "tag", label: "CABLE DRUM TAG", names: ["CABLE DRUM TAG"], required: true },
    {
      field: "drum",
      label: "CABLE DRUM Nº",
      names: ["CABLE DRUM Nº", "CABLE DRUM N°", "CABLE DRUM NO"],
    },
    { field: "startM", label: "START [m]", names: ["START [m]"] },
    { field: "endM", label: "END [m]", names: ["END [m]"] },
    { field: "pulledM", label: "PULLED [m]", names: ["PULLED [m]"], required: true },
    { field: "pulledOn", label: "DATE", names: ["DATE"] },
  ],
};

const CODE_LIMIT = 60;

/** One pulling as the Excel writes it down. */
export const excelReelPullSchema = z
  .object({
    /** Row of the sheet, to keep the Excel's order. */
    row: z.number().int().min(2).max(1_000_000),
    /** The cable as the Excel names it: the circuit, in the electrical file. */
    code: z.string().trim().min(1).max(CODE_LIMIT),
    /**
     * The core («…T3C2»: section 3, core 2) and its section. «Núm. Circt.» is not the section:
     * it says how many sections the circuit has.
     */
    conductor: z.string().trim().min(1).max(CODE_LIMIT).nullable(),
    circuit: z.number().int().min(1).max(1000).nullable(),
    tag: reelIdSchema.nullable(),
    drum: reelIdSchema.nullable(),
    startM: metresSchema,
    endM: metresSchema,
    pulledM: metresSchema,
    pulledOn: z.iso.date().nullable(),
  })
  .refine((pull) => pull.tag !== null || pull.drum !== null, {
    message: "Tirada sin bobina",
  });
export type ExcelReelPull = z.infer<typeof excelReelPullSchema>;

/** Most pullings a file can bring: one per core of every cable, a few thousand. */
export const EXCEL_MAX_REEL_PULLS = 50_000;

export type ExcelReelPullsResult =
  { ok: true; pulls: ExcelReelPull[] } | { ok: false; missingColumns: string[] };

/**
 * Reads the pullings of a file. Rows without a cable or without a reel (a core still to lay)
 * are not pullings and are skipped.
 */
export function readExcelReelPulls(
  kind: ExcelKind,
  table: readonly ExcelCell[][],
): ExcelReelPullsResult {
  const located = locate(table, PULL_COLUMNS[kind]);
  if ("missing" in located) return { ok: false, missingColumns: located.missing };
  const at = (values: readonly ExcelCell[], field: PullField): ExcelCell => {
    const index = located.columns[field];
    return index === undefined ? null : values[index];
  };
  const pulls: ExcelReelPull[] = [];
  table.slice(located.headerAt + 1).forEach((values, index) => {
    const code = excelCell.text(at(values, "code"))?.toUpperCase() ?? null;
    const tag = idOf(at(values, "tag"));
    const drum = idOf(at(values, "drum"));
    if (code === null || code.length > CODE_LIMIT || (tag === null && drum === null)) return;
    const conductor = excelCell.text(at(values, "conductor"))?.toUpperCase() ?? null;
    const section = conductor === null ? null : /T(\d{1,3})C\d{1,3}$/.exec(conductor);
    const circuit = section ? Number(section[1]) : null;
    pulls.push({
      row: located.headerAt + index + 2,
      code,
      conductor: conductor !== null && conductor.length <= CODE_LIMIT ? conductor : null,
      circuit: circuit !== null && circuit >= 1 ? circuit : null,
      tag,
      drum,
      startM: metresOf(at(values, "startM")),
      endM: metresOf(at(values, "endM")),
      pulledM: metresOf(at(values, "pulledM")),
      pulledOn: excelCell.day(at(values, "pulledOn")),
    });
  });
  return { ok: true, pulls };
}
