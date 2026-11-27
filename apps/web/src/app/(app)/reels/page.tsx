import type { Metadata } from "next";
import Link from "next/link";
import {
  REEL_KIND_LABELS,
  REEL_PAGE_SIZES,
  REEL_SORT_LABELS,
  REEL_STATE_LABELS,
  formatExcelDay,
  optionsOf,
  parseReelsSearch,
  reelsQuery,
} from "@cables/shared";
import { ListToolbar } from "@/components/list-toolbar";
import { PageSizePicker } from "@/components/page-size-picker";
import { Pagination } from "@/components/pagination";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { Badge } from "@/components/ui/badge";
import { ReelMeter } from "@/features/reels/components/reel-meter";
import { REEL_STATE_BADGE, pullsText } from "@/features/reels/format";
import { searchReels, type ReelListResult } from "@/server/reels/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Bobinas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** «Excel del 17/11/2026», or one date per file when they differ. */
function excelDatesText(dates: ReelListResult["excelDates"]): string | null {
  const days = [...new Set(dates.map((date) => date.day.toISOString().slice(0, 10)))];
  if (days.length === 0) return null;
  if (days.length === 1) return `Excel del ${formatExcelDay(days[0]!)}`;
  return dates
    .map(
      (date) =>
        `${REEL_KIND_LABELS[date.kind].toLowerCase()} del ${formatExcelDay(date.day.toISOString().slice(0, 10))}`,
    )
    .join(", ");
}

/**
 * «Bobinas» (fase 18): every reel of the two Excel files of the day, to find one by any of its
 * names and see what is left on it.
 */
export default async function ReelsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const search = parseReelsSearch(await searchParams);
  const result = await searchReels(search);
  const pageLink = (page: number) => `/reels${reelsQuery(search, { page })}`;
  const active = Boolean(
    search.q || search.kind || search.state || (search.sort && search.sort !== "name"),
  );
  const dates = excelDatesText(result.excelDates);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bobinas</h1>
        <p className="text-muted-foreground text-sm">
          Las bobinas de los Excel: metros recibidos, usados y restantes, y sus tiradas.
        </p>
      </div>

      <PendingListProvider>
        <ListToolbar
          action="/reels"
          label="Buscar bobinas"
          search={{
            name: "q",
            label: "Bobina",
            value: search.q ?? "",
            placeholder: "Número, drum, solicitud o tipo de cable",
            maxLength: 100,
          }}
          sort={{
            name: "sort",
            value: search.sort ?? "name",
            defaultValue: "name",
            options: optionsOf(REEL_SORT_LABELS),
          }}
          filters={[
            {
              kind: "select",
              name: "kind",
              label: "Excel",
              value: search.kind,
              options: optionsOf(REEL_KIND_LABELS),
            },
            {
              kind: "select",
              name: "state",
              label: "Metros",
              value: search.state,
              options: optionsOf(REEL_STATE_LABELS),
            },
          ]}
          keep={search.size ? { size: String(search.size) } : {}}
          active={active}
          countAside={
            result.total > REEL_PAGE_SIZES[0] ? (
              <PageSizePicker
                sizes={REEL_PAGE_SIZES}
                size={search.size}
                page={result.page}
                href={(size, page) => `/reels${reelsQuery(search, { size, page })}`}
              />
            ) : null
          }
          count={
            <>
              <span className="text-foreground font-medium">
                {result.total.toLocaleString("es-ES")}
              </span>{" "}
              {result.total === 1 ? "bobina" : "bobinas"}
              {dates ? <span className="text-muted-foreground"> · {dates}</span> : null}
            </>
          }
        />

        <PendingResults className="space-y-6">
          {result.items.length === 0 ? (
            <p
              role="status"
              className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
            >
              {active
                ? "Ninguna bobina coincide con la búsqueda."
                : "Todavía no hay bobinas: llegan con los Excel."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((reel) => {
                const badge = reel.state ? REEL_STATE_BADGE[reel.state] : null;
                const name = reel.tag ?? reel.drum ?? "";
                return (
                  <li
                    key={reel.id}
                    className="bg-card hover:border-primary/50 hover:bg-muted/40 has-focus-visible:ring-ring/50 relative space-y-2 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3"
                  >
                    {/* La tarjeta entera abre la bobina: el enlace la cubre con su ::after. */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/reels/${reel.id}`}
                          className="text-primary font-mono text-base font-semibold break-all outline-none after:absolute after:inset-0 after:rounded-lg"
                        >
                          {name}
                        </Link>
                        {reel.request ? (
                          <span className="text-foreground ml-2 font-medium">{reel.request}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {badge?.variant ? (
                          <Badge variant={badge.variant} dot>
                            {badge.label}
                          </Badge>
                        ) : null}
                        <Badge variant="outline">{REEL_KIND_LABELS[reel.kind]}</Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground break-words">
                      {[reel.drum !== name ? reel.drum : null, reel.description]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <ReelMeter
                      receivedM={reel.figures.receivedM}
                      usedM={reel.figures.usedM}
                      remainingM={reel.figures.remainingM}
                    />
                    <p className="text-muted-foreground tabular-nums">
                      {pullsText(reel.figures.pulls ?? 0)}
                      {reel.figures.pendingPulls ? (
                        <span className="text-foreground">
                          {" "}
                          · {reel.figures.pendingPulls}{" "}
                          {reel.figures.pendingPulls === 1 ? "pendiente" : "pendientes"}
                        </span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination page={result.page} pageCount={result.pageCount} href={pageLink} />
        </PendingResults>
      </PendingListProvider>
    </div>
  );
}
