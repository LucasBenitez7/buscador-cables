import type { Metadata } from "next";
import Link from "next/link";
import {
  DISCREPANCY_VIEWS,
  DISCREPANCY_VIEW_LABELS,
  parseDiscrepancySearch,
  type DiscrepancyView,
} from "@cables/shared";
import { ChipRow } from "@/components/chip-row";
import { Pagination } from "@/components/pagination";
import {
  DiscrepancyList,
  MarkDiscrepanciesSeen,
} from "@/features/excel-import/components/discrepancy-list";
import { listDiscrepancies } from "@/server/excel-import/discrepancies";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Pendientes de revisar" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const number = new Intl.NumberFormat("es-ES");

const CHIP =
  "focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3";

/** What a person marked in the web and an Excel contradicts, until somebody decides. */
export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("cable:correct");
  const search = parseDiscrepancySearch(await searchParams);
  const view = search.view ?? "open";
  const list = await listDiscrepancies(search);
  const counts: Record<DiscrepancyView, number> = { open: list.open, decided: list.decided };
  const href = (nextView: DiscrepancyView, page?: number) =>
    `/review${nextView === "open" ? "" : `?view=${nextView}`}${
      page && page > 1 ? `${nextView === "open" ? "?" : "&"}page=${page}` : ""
    }`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Pendientes de revisar</h1>
      <MarkDiscrepanciesSeen />

      <ChipRow aria-label="Qué discrepancias" className="-mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
        {DISCREPANCY_VIEWS.map((item) => {
          const selected = item === view;
          return (
            <Link
              key={item}
              href={href(item)}
              aria-current={selected ? "page" : undefined}
              className={
                selected
                  ? `${CHIP} bg-primary text-primary-foreground border-primary`
                  : `${CHIP} bg-secondary text-foreground hover:bg-muted`
              }
            >
              {DISCREPANCY_VIEW_LABELS[item]}
              <span
                className={
                  selected
                    ? "text-primary-foreground tabular-nums"
                    : "text-foreground/80 tabular-nums"
                }
              >
                {number.format(counts[item])}
              </span>
            </Link>
          );
        })}
      </ChipRow>

      {/* Siempre la lista, también vacía: el aviso de lo decidido no se pierde al vaciarse. */}
      <DiscrepancyList
        items={list.items}
        pending={view === "open"}
        total={list.open}
        empty={
          view === "open" ? "Nada pendiente de revisar." : "Todavía no se ha revisado ninguna."
        }
      />

      <Pagination page={list.page} pageCount={list.pageCount} href={(page) => href(view, page)} />
    </div>
  );
}
