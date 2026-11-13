import type { Metadata } from "next";
import Link from "next/link";
import { TRAY_KIND_LABELS, formatTraySize, parseTraySearch } from "@cables/shared";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trayHref } from "@/features/cables/components/cable-route";
import { searchTrays } from "@/server/trays/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Bandejas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TraysPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const search = parseTraySearch(await searchParams);
  const result = await searchTrays(search);
  const pageLink = (page: number) =>
    `/trays?${new URLSearchParams({ ...(search.q ? { q: search.q } : {}), page: String(page) })}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bandejas</h1>
        <p className="text-muted-foreground text-sm">
          Bandejas, tubos y canalizaciones de los planos: qué cables pasan por cada una y cuáles
          esperan en ella con la punta suelta.
        </p>
      </div>

      <form
        action="/trays"
        role="search"
        aria-label="Buscar bandejas"
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:min-w-56">
          <Label htmlFor="tray-q">Código de bandeja</Label>
          <Input
            id="tray-q"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            placeholder="99UXA00L22036, 99UXA00L2…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <p role="status" className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">{result.total.toLocaleString("es-ES")}</span>{" "}
        {result.total === 1 ? "bandeja" : "bandejas"}
        {result.pageCount > 1 ? ` · página ${result.page} de ${result.pageCount}` : ""}
      </p>

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
    </div>
  );
}
