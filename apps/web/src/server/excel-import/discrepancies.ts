import "server-only";
import { prisma, type Prisma } from "@cables/db";
import {
  DISCREPANCIES_PAGE_SIZE,
  DISCREPANCY_BATCH,
  decideDiscrepanciesSchema,
  decideDiscrepancySchema,
  formatExcelDay,
  hasPermission,
  stateChanges,
  type DiscrepancySearch,
  type ExcelCableState,
} from "@cables/shared";
import { dayOf, ExcelImportError } from "./service";
import { stateText } from "./queries";

/** Who decides: their id and what they can do (see `getCurrentUser`). */
type Actor = { id: string; permissions: readonly string[] };

const CONFLICT =
  "Otra persona ha cambiado este cable mientras tanto. Recarga la página y vuelve a decidir.";

const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const excelDay = (value: Date) => formatExcelDay(dayOf(value)!);

const sameState = (a: ExcelCableState, b: ExcelCableState) =>
  a.installationStatus === b.installationStatus && a.connectionStatus === b.connectionStatus;

const CHANGED_SINCE =
  "Su estado cambió en la web después de la discrepancia: decídela mirando su tarjeta.";

/** How many discrepancies wait for a decision. */
export function countOpenDiscrepancies(): Promise<number> {
  return prisma.cableDiscrepancy.count({ where: { status: "OPEN" } });
}

/**
 * Pending discrepancies that are new for a person: opened since they last opened «Pendientes
 * de revisar». The menu and the home page only warn about these; the page keeps every pending
 * one until somebody decides. A later Excel that contradicts one again, or already agrees with
 * the web, does not make it new: each daily Excel would warn again about all of them.
 */
export async function countNewDiscrepancies(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discrepanciesSeenAt: true },
  });
  const seen = user?.discrepanciesSeenAt;
  return prisma.cableDiscrepancy.count({
    where: { status: "OPEN", ...(seen ? { createdAt: { gt: seen } } : {}) },
  });
}

/**
 * The person has opened «Pendientes de revisar»: what is there is no longer new to them.
 * Says whether there was something new, the only case in which the warnings change.
 */
export async function markDiscrepanciesSeen(userId: string): Promise<boolean> {
  const fresh = await countNewDiscrepancies(userId);
  await prisma.user.update({ where: { id: userId }, data: { discrepanciesSeenAt: new Date() } });
  return fresh > 0;
}

export type DiscrepancyItem = {
  id: string;
  cable: { id: string; code: string };
  /** Pending: the state the cable has now. Decided: the one it had when the Excel came. */
  web: string;
  /**
   * Pending, and somebody changed the state in the web after the Excel contradicted it: what
   * the web said then. Null otherwise.
   */
  webBefore: string | null;
  /** Who marked it in the web, and when. */
  webBy: string;
  webAt: string;
  excel: string;
  /** The last Excel that contradicts it. */
  excelDay: string;
  /** A later Excel already agrees with the web: only a notice. */
  agreesOn: string | null;
  decision: {
    kind: "KEEP_WEB" | "ACCEPT_EXCEL";
    by: string;
    at: string;
  } | null;
};

export type DiscrepancyList = {
  items: DiscrepancyItem[];
  total: number;
  open: number;
  decided: number;
  page: number;
  pageCount: number;
};

/** Pending ones oldest first (they wait the longest); decided ones newest first. */
export async function listDiscrepancies(search: DiscrepancySearch): Promise<DiscrepancyList> {
  const view = search.view ?? "open";
  const where: Prisma.CableDiscrepancyWhereInput =
    view === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } };
  const [open, decided] = await Promise.all([
    prisma.cableDiscrepancy.count({ where: { status: "OPEN" } }),
    prisma.cableDiscrepancy.count({ where: { status: { not: "OPEN" } } }),
  ]);
  const total = view === "open" ? open : decided;
  const pageCount = Math.max(1, Math.ceil(total / DISCREPANCIES_PAGE_SIZE));
  const page = Math.min(search.page ?? 1, pageCount);
  const rows = await prisma.cableDiscrepancy.findMany({
    where,
    orderBy: view === "open" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ decidedAt: "desc" }],
    skip: (page - 1) * DISCREPANCIES_PAGE_SIZE,
    take: DISCREPANCIES_PAGE_SIZE,
    select: {
      id: true,
      web: true,
      excel: true,
      excelDate: true,
      agreesOn: true,
      status: true,
      decidedAt: true,
      decidedBy: { select: { name: true } },
      cable: {
        select: { id: true, code: true, installationStatus: true, connectionStatus: true },
      },
      webEvent: { select: { createdAt: true, user: { select: { name: true } } } },
    },
  });
  return {
    items: rows.map((row) => {
      const { installationStatus, connectionStatus } = row.cable;
      const changed =
        row.status === "OPEN" &&
        !sameState(row.web as ExcelCableState, { installationStatus, connectionStatus });
      return {
        id: row.id,
        cable: { id: row.cable.id, code: row.cable.code },
        web: changed ? stateText(row.cable) : stateText(row.web),
        webBefore: changed ? stateText(row.web) : null,
        webBy: row.webEvent.user.name,
        webAt: dateTime.format(row.webEvent.createdAt),
        excel: stateText(row.excel),
        excelDay: excelDay(row.excelDate),
        agreesOn: row.agreesOn ? excelDay(row.agreesOn) : null,
        decision:
          row.status === "OPEN"
            ? null
            : {
                kind: row.status === "KEPT_WEB" ? "KEEP_WEB" : "ACCEPT_EXCEL",
                by: row.decidedBy?.name ?? "—",
                at: row.decidedAt ? dateTime.format(row.decidedAt) : "—",
              },
      };
    }),
    total,
    open,
    decided,
    page,
    pageCount,
  };
}

/**
 * Decides a discrepancy. «Aceptar lo del Excel» moves the cable to the Excel's state;
 * «Mantener lo de la web» leaves it as it is. Both write an event in the history of the cable
 * with who decided and which Excel it was about; accepting also says which mark it corrects.
 * A cable removed in the web is not touched: keeping the web only closes the discrepancy.
 *
 * `blind`: the person did not see the card (every pending one at once). Then a cable whose
 * state somebody changed in the web after the discrepancy is not accepted: that newer mark
 * would be lost without anybody looking at it.
 */
export async function decideDiscrepancy(
  actor: Actor,
  rawInput: unknown,
  { blind = false }: { blind?: boolean } = {},
): Promise<string> {
  if (!hasPermission(actor, "cable:correct")) {
    throw new ExcelImportError("No tienes permiso para revisar discrepancias.");
  }
  const parsed = decideDiscrepancySchema.safeParse(rawInput);
  if (!parsed.success) throw new ExcelImportError("Decisión no válida.");
  const { id, decision } = parsed.data;

  return prisma.$transaction(async (tx) => {
    const discrepancy = await tx.cableDiscrepancy.findUnique({
      where: { id },
      select: {
        status: true,
        web: true,
        excel: true,
        excelDate: true,
        webEventId: true,
        cable: {
          select: {
            id: true,
            code: true,
            version: true,
            deletedAt: true,
            installationStatus: true,
            connectionStatus: true,
            looseEnd: true,
            looseEndTray: { select: { code: true } },
          },
        },
      },
    });
    if (!discrepancy) throw new ExcelImportError("Esa discrepancia no existe.");
    if (discrepancy.status !== "OPEN") {
      throw new ExcelImportError("Otra persona ya ha decidido esta discrepancia.");
    }
    const { cable } = discrepancy;
    const excel = discrepancy.excel as ExcelCableState;
    const day = excelDay(discrepancy.excelDate);
    const now = new Date();

    const changes =
      decision === "ACCEPT_EXCEL"
        ? stateChanges({ ...cable, looseEndTray: cable.looseEndTray?.code ?? null }, excel)
        : {};
    if (decision === "ACCEPT_EXCEL" && cable.deletedAt) {
      throw new ExcelImportError(`El cable ${cable.code} está dado de baja.`);
    }
    if (
      decision === "ACCEPT_EXCEL" &&
      blind &&
      !sameState(discrepancy.web as ExcelCableState, cable)
    ) {
      throw new ExcelImportError(CHANGED_SINCE);
    }

    // A removed cable is not touched: there is nothing left to keep (accepting was refused).
    let eventId: string | null = null;
    if (!cable.deletedAt) {
      const { count } = await tx.cable.updateMany({
        where: { id: cable.id, version: cable.version, deletedAt: null },
        data: {
          ...(changes.installationStatus ? { installationStatus: excel.installationStatus } : {}),
          ...(changes.connectionStatus ? { connectionStatus: excel.connectionStatus } : {}),
          ...(changes.looseEnd ? { looseEnd: null } : {}),
          ...(changes.looseEndTray ? { looseEndTrayId: null } : {}),
          version: { increment: 1 },
          lastAction: "EXCEL_REVIEWED",
          lastActionById: actor.id,
          lastActionAt: now,
          lastActionSource: "APP",
        },
      });
      if (count === 0) throw new ExcelImportError(CONFLICT);

      const event = await tx.cableEvent.create({
        data: {
          cableId: cable.id,
          userId: actor.id,
          action: "EXCEL_REVIEWED",
          changes: changes as Prisma.InputJsonObject,
          notes:
            decision === "ACCEPT_EXCEL"
              ? `Aceptó lo del Excel del ${day}.`
              : `Mantuvo lo de la web frente al Excel del ${day}.`,
          correctsEventId: decision === "ACCEPT_EXCEL" ? discrepancy.webEventId : null,
          createdAt: now,
        },
        select: { id: true },
      });
      eventId = event.id;
    }
    const { count: decided } = await tx.cableDiscrepancy.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: decision === "ACCEPT_EXCEL" ? "ACCEPTED_EXCEL" : "KEPT_WEB",
        decidedById: actor.id,
        decidedAt: now,
        decisionEventId: eventId,
      },
    });
    if (decided === 0) throw new ExcelImportError("Otra persona ya ha decidido esta discrepancia.");

    return decision === "ACCEPT_EXCEL"
      ? `${cable.code}: aceptado lo del Excel del ${day}.`
      : `${cable.code}: se mantiene lo de la web.`;
  });
}

export type DecideManyResult = {
  decided: number;
  /** Why some could not be decided (somebody else decided them, the cable changed…). */
  failed: { id: string; code: string; message: string }[];
  /** Pending ones left when deciding all of them: the screen asks again. */
  remaining: number;
};

/**
 * Decides several discrepancies with the same decision, each one as if it were decided by
 * hand (its own event in the history). With `all`, every pending one, a batch per request.
 */
export async function decideDiscrepancies(
  actor: Actor,
  rawInput: unknown,
): Promise<DecideManyResult> {
  if (!hasPermission(actor, "cable:correct")) {
    throw new ExcelImportError("No tienes permiso para revisar discrepancias.");
  }
  const parsed = decideDiscrepanciesSchema.safeParse(rawInput);
  if (!parsed.success) throw new ExcelImportError("Elige qué discrepancias decidir.");
  const { ids, all, decision, skip = [] } = parsed.data;

  const targets = await prisma.cableDiscrepancy.findMany({
    where: {
      status: "OPEN",
      ...(all ? { id: { notIn: [...skip] } } : { id: { in: ids } }),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: DISCREPANCY_BATCH,
    select: { id: true, cable: { select: { code: true } } },
  });
  const result: DecideManyResult = { decided: 0, failed: [], remaining: 0 };
  for (const target of targets) {
    try {
      await decideDiscrepancy(actor, { id: target.id, decision }, { blind: Boolean(all) });
      result.decided += 1;
    } catch (error) {
      if (!(error instanceof ExcelImportError)) throw error;
      result.failed.push({ id: target.id, code: target.cable.code, message: error.message });
    }
  }
  if (all) {
    const failedIds = result.failed.map((failure) => failure.id);
    result.remaining = await prisma.cableDiscrepancy.count({
      where: { status: "OPEN", id: { notIn: [...skip, ...failedIds] } },
    });
  }
  return result;
}
