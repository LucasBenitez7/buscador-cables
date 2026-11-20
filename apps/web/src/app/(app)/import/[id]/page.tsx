import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  EXCEL_PREVIEW_TABS,
  EXCEL_PREVIEW_TAB_LABELS,
  parseExcelPreviewSearch,
  type ExcelPreviewTab,
} from "@cables/shared";
import { ChangeList } from "@/components/change-list";
import { ChipRow } from "@/components/chip-row";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CODE_LINK } from "@/components/ui/text-link";
import {
  PreviewActions,
  RowCheckbox,
  SelectTabButtons,
} from "@/features/excel-import/components/preview-controls";
import { INLINE_LINK } from "@/lib/links";
import { getExcelPreview, type ExcelPreviewRowView } from "@/server/excel-import/queries";
import { requirePermission } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const number = new Intl.NumberFormat("es-ES");

const loadPreview = cache(getExcelPreview);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const preview = await loadPreview((await params).id, {});
  return {
    title: preview
      ? `${preview.excel.kindLabel} · Excel del ${preview.excel.excelDay}`
      : "Excel del día",
  };
}

const TAB_KIND = { changes: "CHANGE", new: "NEW", discrepancies: "DISCREPANCY" } as const;

const STATUS_BADGES = {
  APPLYING: { label: "Aplicándose", variant: "warning" },
  APPLIED: { label: "Aplicado", variant: "success" },
  DISCARDED: { label: "Descartado", variant: "outline" },
} as const;

export default async function ExcelPreviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requirePermission("import:run");
  const { id } = await params;
  const preview = await loadPreview(id, parseExcelPreviewSearch(await searchParams));
  if (!preview) notFound();
  const { excel, tab } = preview;
  const editable = excel.status === "PREVIEW";
  const statusBadge = excel.status === "PREVIEW" ? null : STATUS_BADGES[excel.status];
  const tabCount: Record<ExcelPreviewTab, number> = {
    changes: excel.counts.changes,
    new: excel.counts.created,
    discrepancies: excel.counts.discrepancies,
  };
  const href = (nextTab: ExcelPreviewTab, page?: number) =>
    `/import/${excel.id}?tab=${nextTab}${page && page > 1 ? `&page=${page}` : ""}`;

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/import" className={INLINE_LINK}>
            Excel del día
          </Link>{" "}
          › Vista previa
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {excel.kindLabel} · Excel del {excel.excelDay}
          </h1>
          {statusBadge ? <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge> : null}
          {excel.projectLoad ? <Badge variant="info">Carga del proyecto</Badge> : null}
        </div>
        <p className="text-muted-foreground text-sm break-words">
          {excel.fileName} · subido por {excel.uploadedBy} · {excel.uploadedAt}
        </p>
      </header>

      {editable || excel.status === "APPLYING" ? (
        <PreviewActions
          importId={excel.id}
          excelDay={excel.excelDay}
          pending={excel.selected - excel.applied}
          applying={excel.status === "APPLYING"}
        />
      ) : (
        // Terminado: qué pasó y, a un clic, el siguiente Excel.
        <div
          role="status"
          className={`bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${excel.status === "APPLIED" ? "border-success/50" : ""}`}
        >
          <p className="text-sm">
            {excel.status === "APPLIED" ? (
              <>
                <span className="text-success font-medium">Aplicado</span>
                {excel.appliedAt ? ` el ${excel.appliedAt}` : ""} · {number.format(excel.applied)}{" "}
                {excel.applied === 1 ? "cable" : "cables"} actualizados
              </>
            ) : (
              <span className="text-muted-foreground font-medium">
                Vista previa descartada: no se aplicó nada.
              </span>
            )}
          </p>
          <Button asChild>
            <Link href="/import">Subir otro Excel</Link>
          </Button>
        </div>
      )}

      <ChipRow aria-label="Qué trae el Excel" className="-mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
        {EXCEL_PREVIEW_TABS.map((item) => {
          const selected = item === tab;
          return (
            <Link
              key={item}
              href={href(item)}
              aria-current={selected ? "page" : undefined}
              className={
                selected
                  ? "bg-primary text-primary-foreground border-primary focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3"
                  : "bg-secondary text-foreground hover:bg-muted focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3"
              }
            >
              {EXCEL_PREVIEW_TAB_LABELS[item]}
              <span
                className={
                  selected
                    ? "text-primary-foreground tabular-nums"
                    : "text-foreground/80 tabular-nums"
                }
              >
                {number.format(tabCount[item])}
              </span>
            </Link>
          );
        })}
      </ChipRow>

      {editable && preview.total > 0 ? (
        <SelectTabButtons importId={excel.id} kind={TAB_KIND[tab]} />
      ) : null}

      {preview.total === 0 ? (
        <p className="text-muted-foreground text-sm">Nada en esta pestaña.</p>
      ) : (
        <ul className="space-y-2">
          {preview.rows.map((row) => (
            <PreviewRow key={row.id} importId={excel.id} row={row} editable={editable} />
          ))}
        </ul>
      )}

      <Pagination
        page={preview.page}
        pageCount={preview.pageCount}
        href={(page) => href(tab, page)}
      />
    </article>
  );
}

function PreviewRow({
  importId,
  row,
  editable,
}: {
  importId: string;
  row: ExcelPreviewRowView;
  editable: boolean;
}) {
  return (
    <li className="bg-card space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RowCheckbox
          importId={importId}
          rowId={row.id}
          code={row.code}
          selected={row.selected}
          disabled={!editable}
        />
        {row.cableId ? (
          <Link href={`/cables/${row.cableId}`} className={CODE_LINK}>
            {row.code}
          </Link>
        ) : (
          <span className="font-mono font-medium">{row.code}</span>
        )}
        {row.applied ? <Badge variant="success">Aplicado</Badge> : null}
        {!row.selected && !row.applied ? <Badge variant="outline">No se aplica</Badge> : null}
        {row.conflict?.again ? <Badge variant="warning">Ya pendiente de revisar</Badge> : null}
      </div>
      {row.conflict ? (
        <dl className="border-warning/40 bg-warning/10 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">En la web</dt>
          <dd>
            <span className="font-medium">{row.conflict.web}</span>
            <span className="text-muted-foreground">
              {" "}
              · {row.conflict.by}, {row.conflict.at}
            </span>
          </dd>
          <dt className="text-muted-foreground">En el Excel</dt>
          <dd className="font-medium">{row.conflict.excel}</dd>
        </dl>
      ) : null}
      <ChangeList changes={row.changes} />
    </li>
  );
}
