import "server-only";
import { prisma, type Prisma } from "@cables/db";
import {
  CONNECTION_STATUS_LABELS,
  EXCEL_KINDS,
  EXCEL_KIND_LABELS,
  EXCEL_PREVIEW_PAGE_SIZE,
  formatExcelDay,
  installationStatusLabel,
  type ExcelKind,
  type ExcelPreviewCounts,
  type ExcelPreviewSearch,
  type ExcelPreviewTab,
} from "@cables/shared";
import { readableChanges, type Lookups } from "@/server/cables/detail";
import { previewCounts } from "./service";

const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

/** The Excel stores names and texts, never ids: nothing to look up. */
const NO_LOOKUPS: Lookups = {
  locations: new Map(),
  types: new Map(),
  colors: new Map(),
  manufacturers: new Map(),
};

const day = (value: Date) => formatExcelDay(value.toISOString().slice(0, 10));

/** "Tendido · Solo origen": a state of the web or of the Excel in one line. */
export function stateText(state: unknown): string {
  const { installationStatus, connectionStatus } = (state ?? {}) as Record<string, string>;
  const laid = installationStatusLabel(installationStatus ?? "");
  const connection =
    CONNECTION_STATUS_LABELS[connectionStatus as keyof typeof CONNECTION_STATUS_LABELS];
  return connectionStatus && connectionStatus !== "DISCONNECTED" ? `${laid} · ${connection}` : laid;
}

export type ExcelImportCard = {
  id: string;
  kind: ExcelKind;
  kindLabel: string;
  /** "16/11/2026": always the date of the Excel, never «hoy». */
  excelDay: string;
  fileName: string;
  status: "PREVIEW" | "APPLYING" | "APPLIED";
  projectLoad: boolean;
  uploadedBy: string;
  uploadedAt: string;
  /** When it finished being applied («19/11/26, 9:12»), or null while it is not. */
  appliedAt: string | null;
  counts: ExcelPreviewCounts;
  /** Marked rows, and how many of them are already applied. */
  selected: number;
  applied: number;
};

const cardSelect = {
  id: true,
  kind: true,
  excelDate: true,
  fileName: true,
  status: true,
  projectLoad: true,
  createdAt: true,
  appliedAt: true,
  uploadedBy: { select: { name: true } },
} satisfies Prisma.ExcelImportSelect;

async function toCard(
  excel: Prisma.ExcelImportGetPayload<{ select: typeof cardSelect }>,
): Promise<ExcelImportCard> {
  const [counts, selected, applied] = await Promise.all([
    previewCounts(prisma, excel.id),
    prisma.excelImportRow.count({ where: { importId: excel.id, selected: true } }),
    prisma.excelImportRow.count({
      where: { importId: excel.id, selected: true, appliedAt: { not: null } },
    }),
  ]);
  return {
    id: excel.id,
    kind: excel.kind,
    kindLabel: EXCEL_KIND_LABELS[excel.kind],
    excelDay: day(excel.excelDate),
    fileName: excel.fileName,
    status: excel.status as ExcelImportCard["status"],
    projectLoad: excel.projectLoad,
    uploadedBy: excel.uploadedBy.name,
    uploadedAt: dateTime.format(excel.createdAt),
    appliedAt: excel.appliedAt ? dateTime.format(excel.appliedAt) : null,
    counts,
    selected,
    applied,
  };
}

export type ExcelKindOverview = {
  kind: ExcelKind;
  label: string;
  /** The preview waiting to be applied (or being applied). */
  current: ExcelImportCard | null;
  /** The last Excel applied: its file, its date, when it was applied and who uploaded it. */
  lastApplied: {
    id: string;
    fileName: string;
    excelDay: string;
    appliedAt: string;
    uploadedBy: string;
  } | null;
};

/** For each Excel: the preview waiting and the last one applied. */
export async function getExcelOverview(): Promise<ExcelKindOverview[]> {
  return Promise.all(
    EXCEL_KINDS.map(async (kind) => {
      const [current, lastApplied] = await Promise.all([
        prisma.excelImport.findFirst({
          where: { kind, status: { in: ["PREVIEW", "APPLYING"] } },
          orderBy: { createdAt: "desc" },
          select: cardSelect,
        }),
        prisma.excelImport.findFirst({
          where: { kind, status: "APPLIED" },
          orderBy: [{ excelDate: "desc" }, { appliedAt: "desc" }],
          select: {
            id: true,
            fileName: true,
            excelDate: true,
            appliedAt: true,
            uploadedBy: { select: { name: true } },
          },
        }),
      ]);
      return {
        kind,
        label: EXCEL_KIND_LABELS[kind],
        current: current ? await toCard(current) : null,
        lastApplied: lastApplied
          ? {
              id: lastApplied.id,
              fileName: lastApplied.fileName,
              excelDay: day(lastApplied.excelDate),
              appliedAt: dateTime.format(lastApplied.appliedAt!),
              uploadedBy: lastApplied.uploadedBy.name,
            }
          : null,
      };
    }),
  );
}

export type ExcelPreviewRowView = {
  id: string;
  code: string;
  cableId: string | null;
  selected: boolean;
  applied: boolean;
  changes: ReturnType<typeof readableChanges>;
  conflict: {
    web: string;
    excel: string;
    /** Who marked it in the web, and when. */
    by: string;
    at: string;
    /** It was already pending: this Excel contradicts it again. */
    again: boolean;
  } | null;
};

export type ExcelPreviewView = {
  excel: ExcelImportCard & { status: ExcelImportCard["status"] | "DISCARDED" };
  tab: ExcelPreviewTab;
  rows: ExcelPreviewRowView[];
  total: number;
  page: number;
  pageCount: number;
};

const TAB_KIND = { changes: "CHANGE", new: "NEW", discrepancies: "DISCREPANCY" } as const;

/** A preview with one page of the rows of a tab; null when it does not exist. */
export async function getExcelPreview(
  importId: string,
  search: ExcelPreviewSearch,
): Promise<ExcelPreviewView | null> {
  const excel = await prisma.excelImport.findUnique({
    where: { id: importId },
    select: cardSelect,
  });
  if (!excel || excel.status === "UPLOADING") return null;
  const card = await toCard(excel);
  const tab =
    search.tab ??
    (card.counts.changes > 0
      ? "changes"
      : card.counts.created > 0
        ? "new"
        : card.counts.discrepancies > 0
          ? "discrepancies"
          : "changes");

  const where = { importId, kind: TAB_KIND[tab] };
  const total = await prisma.excelImportRow.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / EXCEL_PREVIEW_PAGE_SIZE));
  const page = Math.min(search.page ?? 1, pageCount);
  const rows = await prisma.excelImportRow.findMany({
    where,
    orderBy: { code: "asc" },
    skip: (page - 1) * EXCEL_PREVIEW_PAGE_SIZE,
    take: EXCEL_PREVIEW_PAGE_SIZE,
    select: {
      id: true,
      code: true,
      cableId: true,
      selected: true,
      appliedAt: true,
      changes: true,
      conflict: true,
    },
  });
  const webEventIds = rows.flatMap((row) => {
    const id = (row.conflict as { webEventId?: string } | null)?.webEventId;
    return id ? [id] : [];
  });
  const events = new Map(
    (
      await prisma.cableEvent.findMany({
        where: { id: { in: webEventIds } },
        select: { id: true, createdAt: true, user: { select: { name: true } } },
      })
    ).map((event) => [event.id, event]),
  );

  return {
    excel: { ...card, status: excel.status as ExcelPreviewView["excel"]["status"] },
    tab,
    rows: rows.map((row) => {
      const conflict = row.conflict as {
        web: unknown;
        excel: unknown;
        webEventId: string;
        discrepancyId: string | null;
      } | null;
      const event = conflict ? events.get(conflict.webEventId) : undefined;
      return {
        id: row.id,
        code: row.code,
        cableId: row.cableId,
        selected: row.selected,
        applied: row.appliedAt !== null,
        changes: readableChanges(row.changes, NO_LOOKUPS),
        conflict: conflict
          ? {
              web: stateText(conflict.web),
              excel: stateText(conflict.excel),
              by: event?.user.name ?? "—",
              at: event ? dateTime.format(event.createdAt) : "—",
              again: conflict.discrepancyId !== null,
            }
          : null,
      };
    }),
    total,
    page,
    pageCount,
  };
}
