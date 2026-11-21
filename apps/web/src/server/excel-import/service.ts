import "server-only";
import { Prisma, prisma, type CableEventSource } from "@cables/db";
import {
  ADMIN_ROLE,
  EXCEL_APPLY_BATCH,
  excelPreviewInputSchema,
  excelPreviewPartSchema,
  excelPreviewParts,
  excelPreviewStartSchema,
  excelRowSelectionSchema,
  excelStatusRowSchema,
  formatExcelDay,
  hasPermission,
  planExcelRow,
  type ExcelCableSnapshot,
  type ExcelIgnoredRow,
  type ExcelKind,
  type ExcelPreviewCounts,
  type ExcelRowPlan,
  type ExcelStatusRow,
  type FieldChange,
  type OpenDiscrepancy,
  type WebStateMark,
} from "@cables/shared";
import { isUniqueViolation } from "@/server/prisma-errors";

export class ExcelImportError extends Error {}

/** Who acts: their id, their role and what they can do (see `getCurrentUser`). */
type Actor = { id: string; role: string; permissions: readonly string[] };
type Db = Prisma.TransactionClient;

const NO_PERMISSION = "No tienes permiso para subir el Excel del día.";
const ONLY_ADMIN = "Solo un administrador puede hacer la carga del proyecto.";
const NOT_FOUND = "Esa vista previa ya no existe.";
const CONFLICT =
  "Alguien ha cambiado un cable mientras se aplicaba el Excel. Vuelve a pulsar «Aplicar» para seguir.";

/** Long transactions: a whole file is planned and saved at once. */
const TRANSACTION = { timeout: 120_000, maxWait: 10_000 };
/** Codes per query: far below the parameter limit of Postgres. */
const CHUNK = 1000;

function requireImporter(actor: Actor, projectLoad: boolean) {
  if (!hasPermission(actor, "import:run")) throw new ExcelImportError(NO_PERMISSION);
  if (projectLoad && actor.role !== ADMIN_ROLE) throw new ExcelImportError(ONLY_ADMIN);
}

/** One Excel of each kind at a time: the preview and its batches never cross. */
async function lockKind(tx: Db, kind: ExcelKind) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`excel_import:${kind}`}))`;
}

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

export const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const dateOf = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);
const toNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

// ---------------------------------------------------------------------------
// What the app has now
// ---------------------------------------------------------------------------

type CableNow = ExcelCableSnapshot & {
  id: string;
  code: string;
  version: number;
  excelOnly: boolean;
};

/** "99XAT10W0001.3" → "99XAT10W0001": a section of a circuit split in the project's lists. */
const SECTION = /^(.+)\.(\d+)$/;
export const circuitOf = (code: string) => SECTION.exec(code)?.[1] ?? null;
const sectionNumber = (code: string) => Number(SECTION.exec(code)?.[2] ?? 0);

async function cablesByCode(db: Db, codes: readonly string[]): Promise<Map<string, CableNow>> {
  const found = new Map<string, CableNow>();
  for (const part of chunks(codes)) {
    const cables = await db.cable.findMany({
      where: { code: { in: part } },
      select: {
        id: true,
        code: true,
        version: true,
        deletedAt: true,
        excelOnly: true,
        installationStatus: true,
        connectionStatus: true,
        looseEnd: true,
        looseEndTray: { select: { code: true } },
        laidOn: true,
        company: { select: { name: true } },
        reel: true,
        reelStatus: true,
        actualLengthM: true,
        actualLengthTotalM: true,
        actualSections: true,
      },
    });
    for (const cable of cables) {
      found.set(cable.code, {
        id: cable.id,
        code: cable.code,
        version: cable.version,
        excelOnly: cable.excelOnly,
        deleted: cable.deletedAt !== null,
        installationStatus: cable.installationStatus,
        connectionStatus: cable.connectionStatus,
        looseEnd: cable.looseEnd,
        looseEndTray: cable.looseEndTray?.code ?? null,
        laidOn: dayOf(cable.laidOn),
        company: cable.company?.name ?? null,
        reel: cable.reel,
        reelStatus: cable.reelStatus,
        actualLengthM: toNumber(cable.actualLengthM),
        actualLengthTotalM: toNumber(cable.actualLengthTotalM),
        actualSections: cable.actualSections,
      });
    }
  }
  return found;
}

/** The sections in the web of each circuit code, in order ("….1", "….2"…). */
async function sectionsByCircuit(db: Db, codes: readonly string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  for (const part of chunks(codes)) {
    const rows = await db.$queryRaw<{ code: string }[]>`
      SELECT "code" FROM "cable"
      WHERE "deletedAt" IS NULL AND "code" ~ '\\.[0-9]+$'
        AND substring("code" from '^(.+)\\.[0-9]+$') = ANY(${part})`;
    for (const { code } of rows) {
      const circuit = circuitOf(code)!;
      found.set(circuit, [...(found.get(circuit) ?? []), code]);
    }
  }
  for (const sections of found.values()) {
    sections.sort((a, b) => sectionNumber(a) - sectionNumber(b));
  }
  return found;
}

/**
 * The rows as they apply to the web. The electrical Excel names a circuit by its code
 * ("99XAT10W0001"), while the project's lists split it in sections, one cable each
 * ("99XAT10W0001.1", ".2"…): the row of the circuit goes to every section, with the metres
 * of one. A cable of the lists with that exact code wins; a copy created only from the Excel
 * does not (see `removeCircuitCopies`). A section the file also names on its own keeps its
 * own row.
 */
async function rowsForWeb(
  db: Db,
  rows: readonly ExcelStatusRow[],
): Promise<{ rows: ExcelStatusRow[]; cables: Map<string, CableNow> }> {
  const codes = rows.map((row) => row.code);
  const [exact, sections] = await Promise.all([
    cablesByCode(db, codes),
    sectionsByCircuit(db, codes),
  ]);
  const named = new Set(codes);
  const result: ExcelStatusRow[] = [];
  const toFetch: string[] = [];
  for (const row of rows) {
    const cable = exact.get(row.code);
    const own = sections.get(row.code)?.filter((code) => !named.has(code)) ?? [];
    if ((cable && !cable.excelOnly && !cable.deleted) || own.length === 0) {
      result.push(row);
      continue;
    }
    for (const code of own) {
      result.push({ ...row, code });
      toFetch.push(code);
    }
  }
  if (toFetch.length > 0) {
    for (const [code, cable] of await cablesByCode(db, toFetch)) exact.set(code, cable);
  }
  return { rows: result, cables: exact };
}

/**
 * The last change of state written by a person or an Excel, per cable: a person's one is the
 * mark an Excel may contradict. The load of the project does not count, nor does registering
 * a cable: its first state is not something a person checked in the field. A decision on a
 * discrepancy counts: keeping the web is a person's mark of that day; accepting the Excel
 * leaves the state to the Excel.
 */
async function webMarks(db: Db, cableIds: readonly string[]): Promise<Map<string, WebStateMark>> {
  const marks = new Map<string, WebStateMark>();
  for (const part of chunks(cableIds)) {
    const rows = await db.$queryRaw<
      {
        cableId: string;
        id: string;
        source: CableEventSource;
        action: string;
        changesState: boolean;
        createdAt: Date;
      }[]
    >`
      SELECT DISTINCT ON ("cableId") "cableId", "id", "source", "action"::text AS "action",
        jsonb_exists_any("changes", ARRAY['installationStatus', 'connectionStatus'])
          AS "changesState",
        "createdAt"
      FROM "cable_event"
      WHERE "cableId" = ANY(${part})
        AND "source" IN ('APP', 'EXCEL')
        AND "action" <> 'CREATED'
        AND (
          jsonb_exists_any("changes", ARRAY['installationStatus', 'connectionStatus'])
          OR "action" = 'EXCEL_REVIEWED'
        )
      ORDER BY "cableId", "createdAt" DESC, "id" DESC`;
    for (const row of rows) {
      const acceptedExcel = row.action === "EXCEL_REVIEWED" && row.changesState;
      if (row.source === "APP" && !acceptedExcel) {
        marks.set(row.cableId, { eventId: row.id, at: row.createdAt });
      }
    }
  }
  return marks;
}

async function openDiscrepancies(
  db: Db,
  cableIds: readonly string[],
): Promise<Map<string, OpenDiscrepancy>> {
  const open = new Map<string, OpenDiscrepancy>();
  for (const part of chunks(cableIds)) {
    const rows = await db.cableDiscrepancy.findMany({
      where: { cableId: { in: part }, status: "OPEN" },
      select: {
        id: true,
        cableId: true,
        webEventId: true,
        webEvent: { select: { createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    for (const row of rows) {
      open.set(row.cableId, {
        id: row.id,
        webEventId: row.webEventId,
        webAt: row.webEvent.createdAt,
      });
    }
  }
  return open;
}

type PlannedRow = { row: ExcelStatusRow; cable: CableNow | null; plan: ExcelRowPlan };

/** Decides every row against the app as it is now (see `planExcelRow`). */
async function planRows(
  db: Db,
  excel: { kind: ExcelKind; excelDate: string; projectLoad: boolean },
  rows: readonly ExcelStatusRow[],
): Promise<PlannedRow[]> {
  const forWeb = await rowsForWeb(db, rows);
  const cables = forWeb.cables;
  const ids = [...cables.values()].map((cable) => cable.id);
  // The first load states the truth: no person's mark nor discrepancy counts.
  const [marks, open] = excel.projectLoad
    ? [new Map<string, WebStateMark>(), new Map<string, OpenDiscrepancy>()]
    : await Promise.all([webMarks(db, ids), openDiscrepancies(db, ids)]);
  return forWeb.rows.map((row) => {
    const cable = cables.get(row.code) ?? null;
    return {
      row,
      cable,
      plan: planExcelRow({
        kind: excel.kind,
        excelDate: excel.excelDate,
        row,
        cable,
        webMark: cable ? (marks.get(cable.id) ?? null) : null,
        openDiscrepancy: cable ? (open.get(cable.id) ?? null) : null,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type ExcelPreviewSummary = {
  importId: string;
  counts: ExcelPreviewCounts;
  ignored: number;
};

function invalid(error: { issues: readonly { message: string }[] }): never {
  throw new ExcelImportError(error.issues[0]?.message ?? "El Excel no es válido.");
}

/**
 * First step of an upload: saves what the file is. A new Excel of the same kind replaces the
 * saved preview (or one left half sent); while one is being applied, it waits.
 */
export async function startExcelPreview(actor: Actor, rawInput: unknown): Promise<string> {
  const parsed = excelPreviewStartSchema.safeParse(rawInput);
  if (!parsed.success) invalid(parsed.error);
  const input = parsed.data;
  requireImporter(actor, input.projectLoad);

  return prisma.$transaction(async (tx) => {
    await lockKind(tx, input.kind);
    const applying = await tx.excelImport.count({
      where: { kind: input.kind, status: "APPLYING" },
    });
    if (applying > 0) {
      throw new ExcelImportError(
        "Se está aplicando otro Excel de este tipo. Espera a que termine para subir uno nuevo.",
      );
    }
    if (input.projectLoad) {
      const daily = await tx.excelImport.count({
        where: { kind: input.kind, status: "APPLIED", projectLoad: false },
      });
      if (daily > 0) {
        throw new ExcelImportError(
          "Ya se han aplicado Excel del día de este tipo: la carga del proyecto es solo la primera.",
        );
      }
    }
    // An older file would undo what a newer one already applied: the Excel marks no person.
    const latest = await tx.excelImport.findFirst({
      where: { kind: input.kind, status: "APPLIED" },
      orderBy: { excelDate: "desc" },
      select: { excelDate: true },
    });
    if (latest && dayOf(latest.excelDate)! > input.excelDate) {
      throw new ExcelImportError(
        `Ya se aplicó el Excel del ${formatExcelDay(dayOf(latest.excelDate)!)} de este tipo: no se puede aplicar uno anterior. Revisa la fecha.`,
      );
    }
    const now = new Date();
    await tx.excelImport.updateMany({
      where: { kind: input.kind, status: { in: ["UPLOADING", "PREVIEW"] } },
      data: { status: "DISCARDED", discardedAt: now },
    });
    const saved = await tx.excelImport.create({
      data: {
        kind: input.kind,
        excelDate: dateOf(input.excelDate)!,
        fileName: input.fileName,
        projectLoad: input.projectLoad,
        status: "UPLOADING",
        uploadedById: actor.id,
        rowCount: input.rowCount,
        ignored: [],
        agreeingDiscrepancyIds: [],
        createdAt: now,
      },
      select: { id: true },
    });
    return saved.id;
  }, TRANSACTION);
}

/** The upload of one's own that is still arriving: the parts go only to it. */
async function uploadInProgress(tx: Db, actor: Actor, importId: string) {
  const excel = await tx.excelImport.findUnique({
    where: { id: importId },
    select: { kind: true, projectLoad: true, uploadedById: true },
  });
  if (!excel || excel.uploadedById !== actor.id) throw new ExcelImportError(NOT_FOUND);
  requireImporter(actor, excel.projectLoad);
  await lockKind(tx, excel.kind);
  const current = await tx.excelImport.findUniqueOrThrow({
    where: { id: importId },
    select: {
      status: true,
      kind: true,
      excelDate: true,
      projectLoad: true,
      rowCount: true,
      receivedCount: true,
      ignored: true,
    },
  });
  if (current.status !== "UPLOADING") {
    throw new ExcelImportError("Otro Excel de este tipo ha sustituido a este: súbelo otra vez.");
  }
  return current;
}

/**
 * Second step, once per part: decides its rows against the app as it is now and saves the
 * ones that change something. Nothing of the cables is touched.
 */
export async function addExcelPreviewPart(actor: Actor, rawInput: unknown): Promise<void> {
  const parsed = excelPreviewPartSchema.safeParse(rawInput);
  if (!parsed.success) invalid(parsed.error);
  const part = parsed.data;

  await prisma.$transaction(async (tx) => {
    const excel = await uploadInProgress(tx, actor, part.importId);
    if (excel.receivedCount + part.rows.length > excel.rowCount) {
      throw new ExcelImportError("Han llegado más filas de las que tiene el Excel.");
    }
    if (excel.kind === "INSTRUMENTATION" && part.rows.some((row) => row.sections !== null)) {
      throw new ExcelImportError("El Excel de instrumentación no trae tramos");
    }

    const planned = await planRows(
      tx,
      { kind: excel.kind, excelDate: dayOf(excel.excelDate)!, projectLoad: excel.projectLoad },
      part.rows,
    );
    const ignored: ExcelIgnoredRow[] = [...part.ignored];
    const agreeing: string[] = [];
    const rows: Prisma.ExcelImportRowCreateManyInput[] = [];
    for (const { row, cable, plan } of planned) {
      if (plan.kind === "IGNORED") {
        ignored.push({ row: row.row, code: row.code, reason: plan.reason });
        continue;
      }
      if ((plan.kind === "NONE" || plan.kind === "CHANGE") && plan.agreesWithDiscrepancyId) {
        agreeing.push(plan.agreesWithDiscrepancyId);
      }
      if (plan.kind === "NONE") continue;
      rows.push({
        importId: part.importId,
        code: row.code,
        cableId: cable?.id ?? null,
        kind: plan.kind,
        data: row,
        changes: plan.changes as Prisma.InputJsonObject,
        conflict:
          plan.kind === "DISCREPANCY"
            ? (plan.conflict as unknown as Prisma.InputJsonObject)
            : Prisma.DbNull,
      });
    }
    try {
      // Rows that change nothing are not saved, but they count as received.
      await tx.excelImportRow.createMany({ data: rows });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ExcelImportError("Un cable está repetido en el Excel: súbelo otra vez.");
      }
      throw error;
    }
    await tx.excelImport.update({
      where: { id: part.importId },
      data: {
        receivedCount: { increment: part.rows.length },
        ignored: [
          ...(excel.ignored as ExcelIgnoredRow[]),
          ...ignored,
        ] as unknown as Prisma.InputJsonArray,
        agreeingDiscrepancyIds: { push: agreeing },
      },
    });
  }, TRANSACTION);
}

/** Last step: with every row received, the preview is ready to review and apply. */
export async function finishExcelPreview(
  actor: Actor,
  importId: string,
): Promise<ExcelPreviewSummary> {
  return prisma.$transaction(async (tx) => {
    const excel = await uploadInProgress(tx, actor, importId);
    if (excel.receivedCount !== excel.rowCount) {
      throw new ExcelImportError("No han llegado todas las filas del Excel: súbelo otra vez.");
    }
    await tx.excelImport.update({ where: { id: importId }, data: { status: "PREVIEW" } });
    return {
      importId,
      counts: await previewCounts(tx, importId),
      ignored: (excel.ignored as unknown[]).length,
    };
  }, TRANSACTION);
}

export async function previewCounts(
  db: Db | typeof prisma,
  importId: string,
): Promise<ExcelPreviewCounts> {
  const groups = await db.excelImportRow.groupBy({
    by: ["kind"],
    where: { importId },
    _count: { _all: true },
  });
  const count = (kind: string) => groups.find((group) => group.kind === kind)?._count._all ?? 0;
  return { changes: count("CHANGE"), created: count("NEW"), discrepancies: count("DISCREPANCY") };
}

/** The three steps for a whole file at once, as the browser does them. */
export async function createExcelPreview(
  actor: Actor,
  rawInput: unknown,
): Promise<ExcelPreviewSummary> {
  const parsed = excelPreviewInputSchema.safeParse(rawInput);
  if (!parsed.success) invalid(parsed.error);
  const { rows, ignored, ...file } = parsed.data;
  const importId = await startExcelPreview(actor, { ...file, rowCount: rows.length });
  for (const part of excelPreviewParts(rows, ignored)) {
    await addExcelPreviewPart(actor, { importId, ...part });
  }
  return finishExcelPreview(actor, importId);
}

async function previewToEdit(tx: Db, actor: Actor, importId: string) {
  const excel = await tx.excelImport.findUnique({
    where: { id: importId },
    select: { id: true, kind: true, status: true, projectLoad: true },
  });
  if (!excel) throw new ExcelImportError(NOT_FOUND);
  requireImporter(actor, excel.projectLoad);
  await lockKind(tx, excel.kind);
  const { status } = await tx.excelImport.findUniqueOrThrow({
    where: { id: importId },
    select: { status: true },
  });
  if (status !== "PREVIEW") {
    throw new ExcelImportError(
      status === "APPLYING"
        ? "Este Excel ya se está aplicando: no se puede cambiar."
        : "Esta vista previa ya no se puede cambiar: sube el Excel otra vez.",
    );
  }
  return excel;
}

/** Marks or unmarks rows of a preview (all of them without `rowIds`). */
export async function setExcelRowsSelected(actor: Actor, rawInput: unknown): Promise<number> {
  const parsed = excelRowSelectionSchema.safeParse(rawInput);
  if (!parsed.success) throw new ExcelImportError("Selección no válida.");
  const { importId, rowIds, kind, selected } = parsed.data;
  return prisma.$transaction(async (tx) => {
    await previewToEdit(tx, actor, importId);
    const { count } = await tx.excelImportRow.updateMany({
      where: { importId, ...(rowIds ? { id: { in: rowIds } } : {}), ...(kind ? { kind } : {}) },
      data: { selected },
    });
    return count;
  }, TRANSACTION);
}

/** Discards a preview: nothing of it is applied, and it stays saved as discarded. */
export async function discardExcelPreview(actor: Actor, importId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await previewToEdit(tx, actor, importId);
    await tx.excelImport.update({
      where: { id: importId },
      data: { status: "DISCARDED", discardedAt: new Date() },
    });
  }, TRANSACTION);
}

/**
 * Cancels one's own upload while it is still being prepared (or just ready, if the last part
 * arrived meanwhile): it stays saved as discarded. Anything else is left as it is.
 */
export async function cancelExcelUpload(actor: Actor, importId: string): Promise<void> {
  if (!hasPermission(actor, "import:run")) throw new ExcelImportError(NO_PERMISSION);
  await prisma.$transaction(async (tx) => {
    const excel = await tx.excelImport.findUnique({
      where: { id: importId },
      select: { kind: true, uploadedById: true },
    });
    if (!excel || excel.uploadedById !== actor.id) throw new ExcelImportError(NOT_FOUND);
    await lockKind(tx, excel.kind);
    await tx.excelImport.updateMany({
      where: { id: importId, status: { in: ["UPLOADING", "PREVIEW"] } },
      data: { status: "DISCARDED", discardedAt: new Date() },
    });
  }, TRANSACTION);
}

// ---------------------------------------------------------------------------
// Apply, in batches
// ---------------------------------------------------------------------------

export type ExcelBatchResult = { applied: number; remaining: number; done: boolean };

/** Company ids by name, created in the catalog when the Excel brings a new one. */
async function companyId(tx: Db, cache: Map<string, string>, name: string): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = await tx.company.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  const id = existing?.id ?? (await tx.company.create({ data: { name }, select: { id: true } })).id;
  cache.set(key, id);
  return id;
}

/** The columns of the cable that a set of changes writes. */
async function cableData(
  tx: Db,
  companies: Map<string, string>,
  changes: Record<string, FieldChange>,
): Promise<Prisma.CableUncheckedUpdateInput> {
  const data: Prisma.CableUncheckedUpdateInput = {};
  for (const [field, { to }] of Object.entries(changes)) {
    switch (field) {
      case "installationStatus":
        data.installationStatus = to as ExcelStatusRow["installationStatus"];
        break;
      case "connectionStatus":
        data.connectionStatus = to as NonNullable<ExcelStatusRow["connectionStatus"]>;
        break;
      case "looseEnd":
        data.looseEnd = null;
        break;
      case "looseEndTray":
        data.looseEndTrayId = null;
        break;
      case "laidOn":
        data.laidOn = dateOf(to as string | null);
        break;
      case "company":
        data.companyId = to === null ? null : await companyId(tx, companies, String(to));
        break;
      case "reel":
      case "reelStatus":
        data[field] = to as string | null;
        break;
      case "actualLengthM":
      case "actualLengthTotalM":
      case "actualSections":
        data[field] = to as number | null;
        break;
    }
  }
  return data;
}

type ApplyContext = {
  tx: Db;
  importId: string;
  uploadedById: string;
  excelDate: Date;
  source: CableEventSource;
  now: Date;
  companies: Map<string, string>;
};

async function applyChanges(
  context: ApplyContext,
  cable: CableNow,
  changes: Record<string, FieldChange>,
) {
  if (Object.keys(changes).length === 0) return;
  const { tx, now, source, uploadedById, importId } = context;
  const { count } = await tx.cable.updateMany({
    where: { id: cable.id, version: cable.version, deletedAt: null },
    data: {
      ...(await cableData(tx, context.companies, changes)),
      version: { increment: 1 },
      lastAction: "EXCEL_UPDATED",
      lastActionById: uploadedById,
      lastActionAt: now,
      lastActionSource: source,
    } as Prisma.CableUncheckedUpdateManyInput,
  });
  if (count === 0) throw new ExcelImportError(CONFLICT);
  await tx.cableEvent.create({
    data: {
      cableId: cable.id,
      userId: uploadedById,
      action: "EXCEL_UPDATED",
      changes: changes as Prisma.InputJsonObject,
      source,
      excelImportId: importId,
      createdAt: now,
    },
  });
}

async function createCable(
  context: ApplyContext,
  row: ExcelStatusRow,
  changes: Record<string, FieldChange>,
) {
  const { tx, now, source, uploadedById, importId } = context;
  const data = await cableData(tx, context.companies, changes);
  const cable = await tx.cable
    .create({
      data: {
        ...(data as Prisma.CableUncheckedCreateInput),
        code: row.code,
        excelOnly: true,
        lastAction: "CREATED",
        lastActionById: uploadedById,
        lastActionAt: now,
        lastActionSource: source,
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      // Somebody registered it in the web meanwhile: the next try sees it as a change.
      if (isUniqueViolation(error)) {
        throw new ExcelImportError(
          `El cable ${row.code} se ha dado de alta en la web mientras se aplicaba el Excel. Vuelve a pulsar «Aplicar» para seguir.`,
        );
      }
      throw error;
    });
  await tx.cableEvent.create({
    data: {
      cableId: cable.id,
      userId: uploadedById,
      action: "CREATED",
      changes: changes as Prisma.InputJsonObject,
      source,
      excelImportId: importId,
      createdAt: now,
    },
  });
}

async function recordDiscrepancy(
  context: ApplyContext,
  cable: CableNow,
  conflict: Extract<ExcelRowPlan, { kind: "DISCREPANCY" }>["conflict"],
) {
  const { tx, importId, excelDate } = context;
  if (conflict.discrepancyId) {
    // The Excel contradicts it again: it keeps the newest date.
    await tx.cableDiscrepancy.update({
      where: { id: conflict.discrepancyId },
      data: { importId, excelDate, excel: conflict.excel, agreesOn: null },
    });
    return;
  }
  await tx.cableDiscrepancy.create({
    data: {
      cableId: cable.id,
      importId,
      excelDate,
      web: conflict.web,
      excel: conflict.excel,
      webEventId: conflict.webEventId,
    },
  });
}

/**
 * Before the Excel went to the sections of a circuit, it created a cable with the code of the
 * circuit, only with the Excel's data. Once the sections get the Excel, that copy is removed
 * (a soft delete, with its history), so the circuit is not counted twice.
 */
async function removeCircuitCopies(context: ApplyContext, sectionCodes: readonly string[]) {
  const circuits = [...new Set(sectionCodes.map(circuitOf).filter((code) => code !== null))];
  if (circuits.length === 0) return;
  const { tx, now, source, uploadedById, importId } = context;
  const copies = await tx.cable.findMany({
    where: { code: { in: circuits }, excelOnly: true, deletedAt: null },
    select: { id: true, code: true },
  });
  for (const copy of copies) {
    await tx.cable.update({
      where: { id: copy.id },
      data: {
        deletedAt: now,
        version: { increment: 1 },
        lastAction: "DELETED",
        lastActionById: uploadedById,
        lastActionAt: now,
        lastActionSource: source,
      },
    });
    await tx.cableEvent.create({
      data: {
        cableId: copy.id,
        userId: uploadedById,
        action: "DELETED",
        changes: { deletedAt: { from: null, to: now.toISOString() } },
        notes: `Copia del circuito: el Excel ya se aplica a sus tramos (${copy.code}.1…).`,
        source,
        excelImportId: importId,
        createdAt: now,
      },
    });
  }
}

/**
 * Applies the next batch of marked rows of a preview, deciding each row again against the
 * app as it is now (somebody may have acted since the preview). The screen calls it until
 * `done`. The last batch closes the Excel and notes the discrepancies it already agrees with.
 */
export async function applyExcelBatch(actor: Actor, importId: string): Promise<ExcelBatchResult> {
  const excel = await prisma.excelImport.findUnique({
    where: { id: importId },
    select: { kind: true, projectLoad: true },
  });
  if (!excel) throw new ExcelImportError(NOT_FOUND);
  requireImporter(actor, excel.projectLoad);

  return prisma.$transaction(async (tx) => {
    await lockKind(tx, excel.kind);
    const current = await tx.excelImport.findUniqueOrThrow({
      where: { id: importId },
      select: {
        status: true,
        kind: true,
        excelDate: true,
        projectLoad: true,
        uploadedById: true,
        agreeingDiscrepancyIds: true,
      },
    });
    if (current.status === "APPLIED") throw new ExcelImportError("Este Excel ya está aplicado.");
    if (current.status === "UPLOADING") {
      throw new ExcelImportError("Este Excel todavía no ha llegado entero.");
    }
    if (current.status === "DISCARDED") {
      throw new ExcelImportError("Esta vista previa se descartó: sube el Excel otra vez.");
    }
    const now = new Date();
    if (current.status === "PREVIEW") {
      await tx.excelImport.update({ where: { id: importId }, data: { status: "APPLYING" } });
    }

    const pending = await tx.excelImportRow.findMany({
      where: { importId, selected: true, appliedAt: null },
      orderBy: { code: "asc" },
      take: EXCEL_APPLY_BATCH,
      select: { id: true, data: true },
    });
    const rows = pending.map((row) => excelStatusRowSchema.parse(row.data));
    const context: ApplyContext = {
      tx,
      importId,
      uploadedById: current.uploadedById,
      excelDate: current.excelDate,
      source: current.projectLoad ? "PROJECT_LOAD" : "EXCEL",
      now,
      companies: new Map(),
    };
    const planned = await planRows(
      tx,
      {
        kind: current.kind,
        excelDate: dayOf(current.excelDate)!,
        projectLoad: current.projectLoad,
      },
      rows,
    );
    for (const { row, cable, plan } of planned) {
      if (plan.kind === "NEW") await createCable(context, row, plan.changes);
      else if (cable && plan.kind === "CHANGE") await applyChanges(context, cable, plan.changes);
      else if (cable && plan.kind === "DISCREPANCY") {
        await applyChanges(context, cable, plan.changes);
        await recordDiscrepancy(context, cable, plan.conflict);
      }
    }
    await removeCircuitCopies(
      context,
      planned.map(({ row }) => row.code),
    );
    if (pending.length > 0) {
      await tx.excelImportRow.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: { appliedAt: now },
      });
    }

    const remaining = await tx.excelImportRow.count({
      where: { importId, selected: true, appliedAt: null },
    });
    if (remaining === 0) {
      await tx.excelImport.update({
        where: { id: importId },
        data: { status: "APPLIED", appliedAt: now },
      });
      if (current.agreeingDiscrepancyIds.length > 0) {
        await tx.cableDiscrepancy.updateMany({
          where: { id: { in: current.agreeingDiscrepancyIds }, status: "OPEN" },
          data: { agreesOn: current.excelDate },
        });
      }
    }
    return { applied: pending.length, remaining, done: remaining === 0 };
  }, TRANSACTION);
}
