import "server-only";
import { prisma, type Prisma } from "@cables/db";
import {
  DISCREPANCIES_PAGE_SIZE,
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

/** How many discrepancies wait for a decision (the menu shows it). */
export function countOpenDiscrepancies(): Promise<number> {
  return prisma.cableDiscrepancy.count({ where: { status: "OPEN" } });
}

export type DiscrepancyItem = {
  id: string;
  cable: { id: string; code: string };
  web: string;
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
      cable: { select: { id: true, code: true } },
      webEvent: { select: { createdAt: true, user: { select: { name: true } } } },
    },
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      cable: row.cable,
      web: stateText(row.web),
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
    })),
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
 */
export async function decideDiscrepancy(actor: Actor, rawInput: unknown): Promise<string> {
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

    const { count } = await tx.cable.updateMany({
      where: { id: cable.id, version: cable.version },
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
    const { count: decided } = await tx.cableDiscrepancy.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: decision === "ACCEPT_EXCEL" ? "ACCEPTED_EXCEL" : "KEPT_WEB",
        decidedById: actor.id,
        decidedAt: now,
        decisionEventId: event.id,
      },
    });
    if (decided === 0) throw new ExcelImportError("Otra persona ya ha decidido esta discrepancia.");

    return decision === "ACCEPT_EXCEL"
      ? `${cable.code}: aceptado lo del Excel del ${day}.`
      : `${cable.code}: se mantiene lo de la web.`;
  });
}
