import type { Metadata } from "next";
import { cn } from "cn";
import Link from "next/link";
import {
  DISCREPANCY_VIEWS,
  DISCREPANCY_VIEW_LABELS,
  parseDiscrepancySearch,
  type DiscrepancyView,
} from "@cables/shared";
import { ChipRow } from "@/components/chip-row";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { CODE_LINK } from "@/components/ui/text-link";
import { DecisionButtons } from "@/features/excel-import/components/decision-buttons";
import { listDiscrepancies, type DiscrepancyItem } from "@/server/excel-import/discrepancies";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Pendientes de revisar" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const number = new Intl.NumberFormat("es-ES");

/** What was decided, said as done. */
const DECIDED_LABELS = {
  KEEP_WEB: "Se mantuvo lo de la web",
  ACCEPT_EXCEL: "Se aceptó lo del Excel",
} as const;

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

      {list.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {view === "open" ? "Nada pendiente de revisar." : "Todavía no se ha revisado ninguna."}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.items.map((item) => (
            <DiscrepancyCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      <Pagination page={list.page} pageCount={list.pageCount} href={(page) => href(view, page)} />
    </div>
  );
}

function DiscrepancyCard({ item }: { item: DiscrepancyItem }) {
  return (
    <li className="bg-card space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/cables/${item.cable.id}`} className={CODE_LINK}>
          {item.cable.code}
        </Link>
        {item.agreesOn ? (
          <Badge variant="info">El Excel del {item.agreesOn} ya coincide con la web</Badge>
        ) : null}
      </div>
      {/* Las dos versiones lado a lado; cada botón, bajo la suya. */}
      <div className="grid grid-cols-2 gap-2">
        <Side
          label="En la web"
          state={item.web}
          detail={`${item.webBy} · ${item.webAt}`}
          tone={tone(item, "KEEP_WEB")}
          verdict={item.decision?.kind === "KEEP_WEB" ? DECIDED_LABELS.KEEP_WEB : null}
        />
        <Side
          label={`Excel del ${item.excelDay}`}
          state={item.excel}
          tone={tone(item, "ACCEPT_EXCEL")}
          verdict={item.decision?.kind === "ACCEPT_EXCEL" ? DECIDED_LABELS.ACCEPT_EXCEL : null}
        />
      </div>
      {item.decision ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Revisada por </span>
          {item.decision.by}
          <span className="text-muted-foreground"> · {item.decision.at}</span>
        </p>
      ) : (
        <DecisionButtons id={item.id} code={item.cable.code} />
      )}
    </li>
  );
}

type Tone = "pending" | "chosen" | "discarded";

/** Pending: both ask for attention. Decided: the chosen one stands out, the other fades. */
function tone(item: DiscrepancyItem, side: "KEEP_WEB" | "ACCEPT_EXCEL"): Tone {
  if (!item.decision) return "pending";
  return item.decision.kind === side ? "chosen" : "discarded";
}

function Side({
  label,
  state,
  detail,
  tone,
  verdict,
}: {
  label: string;
  state: string;
  detail?: string;
  tone: Tone;
  verdict: string | null;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border p-3",
        tone === "pending" && "border-warning/40 bg-warning/10",
        tone === "chosen" && "border-primary bg-primary/10",
        tone === "discarded" && "bg-muted/30 opacity-60",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-base font-semibold break-words">{state}</span>
      {detail ? <span className="text-muted-foreground text-xs">{detail}</span> : null}
      {verdict ? (
        <span className="text-primary mt-auto pt-1 text-sm font-medium">✓ {verdict}</span>
      ) : null}
    </div>
  );
}
