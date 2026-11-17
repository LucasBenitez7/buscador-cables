import type { Metadata } from "next";
import Link from "next/link";
import {
  TRAY_KIND_LABELS,
  TRAY_PAGE_SIZES,
  TRAY_SORT_LABELS,
  formatTraySize,
  optionsOf,
  parseTraySearch,
  trayQuery,
} from "@cables/shared";
import { ListToolbar } from "@/components/list-toolbar";
import { PageSizePicker } from "@/components/page-size-picker";
import { Pagination } from "@/components/pagination";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { trayHref } from "@/features/cables/components/cable-route";
import { requireUser } from "@/server/session";
import { searchTrays, trayLevels } from "@/server/trays/service";

export const metadata: Metadata = { title: "Bandejas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TraysPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const search = parseTraySearch(await searchParams);
  const [result, levels] = await Promise.all([searchTrays(search), trayLevels()]);
  const pageLink = (page: number) => `/trays${trayQuery(search, { page })}`;
  const active = Boolean(
    search.q ||
    search.kind ||
    search.level ||
    search.waiting ||
    (search.sort && search.sort !== "code"),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bandejas</h1>
        <p className="text-muted-foreground text-sm">
          Bandejas, tubos y canalizaciones de los planos: qué cables pasan por cada una y cuáles
          esperan en ella con la punta suelta.
        </p>
      </div>

      <PendingListProvider>
        <ListToolbar
          action="/trays"
          label="Buscar bandejas"
          search={{
            name: "q",
            label: "Código de bandeja",
            value: search.q ?? "",
            placeholder: "99UXA00L22036, 99UXA00L2…",
            mono: true,
            maxLength: 50,
          }}
          sort={{
            name: "sort",
            value: search.sort ?? "code",
            defaultValue: "code",
            options: optionsOf(TRAY_SORT_LABELS),
          }}
          filters={[
            {
              kind: "select",
              name: "kind",
              label: "Tipo",
              value: search.kind,
              options: optionsOf(TRAY_KIND_LABELS),
            },
            {
              kind: "select",
              name: "level",
              label: "Nivel",
              value: search.level === undefined ? undefined : String(search.level),
              options: levels.map((level) => ({ value: String(level), label: `L${level}` })),
            },
            {
              kind: "checkbox",
              name: "waiting",
              label: "Solo con cables esperando",
              checked: search.waiting,
            },
          ]}
          // El tamaño de página se conserva al buscar.
          keep={search.size ? { size: String(search.size) } : {}}
          active={active}
          countAside={
            result.total > TRAY_PAGE_SIZES[0] ? (
              <PageSizePicker
                sizes={TRAY_PAGE_SIZES}
                size={search.size}
                page={result.page}
                href={(size, page) => `/trays${trayQuery(search, { size, page })}`}
              />
            ) : null
          }
          count={
            <>
              <span className="text-foreground font-medium">
                {result.total.toLocaleString("es-ES")}
              </span>{" "}
              {result.total === 1 ? "bandeja" : "bandejas"}
              {result.pageCount > 1 ? ` · página ${result.page} de ${result.pageCount}` : ""}
            </>
          }
        />

        <PendingResults className="space-y-6">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((tray) => {
              const size = formatTraySize(tray.size);
              return (
                <li
                  key={tray.code}
                  className="bg-card hover:border-primary/50 hover:bg-muted/40 has-focus-visible:ring-ring/50 relative space-y-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3"
                >
                  {/* La tarjeta entera abre la bandeja: el enlace la cubre con su ::after. */}
                  <Link
                    href={trayHref(tray.code)}
                    className="text-primary font-mono text-base font-semibold outline-none after:absolute after:inset-0 after:rounded-lg"
                  >
                    {tray.code}
                  </Link>
                  <p className="text-muted-foreground">
                    {[
                      TRAY_KIND_LABELS[tray.kind],
                      tray.voltageLevel ? `L${tray.voltageLevel}` : null,
                      size,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {tray.building ? <p className="text-muted-foreground">{tray.building}</p> : null}
                  <p className={tray.cables > 0 ? "font-medium" : "text-muted-foreground"}>
                    {tray.cables} {tray.cables === 1 ? "cable" : "cables"}
                    {tray.waiting > 0 ? (
                      <span className="text-warning">
                        {" "}
                        · {tray.waiting} {tray.waiting === 1 ? "espera" : "esperan"} aquí
                      </span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>

          <Pagination page={result.page} pageCount={result.pageCount} href={pageLink} />
        </PendingResults>
      </PendingListProvider>
    </div>
  );
}
