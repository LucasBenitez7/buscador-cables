import type { Metadata } from "next";
import {
  DISCREPANCY_VIEWS,
  DISCREPANCY_VIEW_LABELS,
  parseDiscrepancySearch,
  type DiscrepancyView,
} from "@cables/shared";
import { Pagination } from "@/components/pagination";
import { TabLinks } from "@/components/tab-links";
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

      <TabLinks
        label="Qué discrepancias"
        tabs={DISCREPANCY_VIEWS.map((item) => ({
          key: item,
          label: DISCREPANCY_VIEW_LABELS[item],
          href: href(item),
          selected: item === view,
          count: number.format(counts[item]),
        }))}
      />

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
