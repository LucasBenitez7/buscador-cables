import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CABLE_LEVEL_LABELS,
  METERS_TABS,
  parseMetersSearch,
  type MetersTab,
  DEVIATION_OK_PERCENT,
  DEVIATION_REVIEW_PERCENT,
  distanceText,
  formatExcelDay,
} from "@cables/shared";
import { ListToolbar } from "@/components/list-toolbar";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { TabLinks } from "@/components/tab-links";
import { CODE_LINK } from "@/components/ui/text-link";
import { DeviationBadge } from "@/features/meters/components/deviation-badge";
import { INLINE_LINK } from "@/lib/links";
import {
  TOP_DEVIATIONS,
  getMetersDeviation,
  getMetersProgress,
  listReels,
  type DeviationRow,
} from "@/server/meters/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Metros" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_LABELS: Record<MetersTab, string> = {
  avance: "Avance",
  desviacion: "Desviación",
  bobinas: "Bobinas",
};

const number = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
const percentOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * «Metros» (fase 17): the works in metres. «Avance»: metres laid of the planned ones.
 * «Desviación»: real metres against the list, to find wrong measures or routes. «Bobinas»: what
 * came out of each reel, to know what to check if one turns out faulty.
 */
export default async function MetersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const { tab, q = "" } = parseMetersSearch(await searchParams);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Metros</h1>
        <p className="text-muted-foreground text-sm">
          La obra en metros: lo tendido, lo que se desvía del listado y las bobinas.
        </p>
      </div>

      <TabLinks
        label="Qué ver"
        tabs={METERS_TABS.map((item) => ({
          key: item,
          label: TAB_LABELS[item],
          href: item === "avance" ? "/meters" : `/meters?tab=${item}`,
          selected: item === tab,
        }))}
      />

      {tab === "avance" ? <ProgressTab /> : null}
      {tab === "desviacion" ? <DeviationTab /> : null}
      {tab === "bobinas" ? <ReelsTab q={q} /> : null}
    </div>
  );
}

async function ProgressTab() {
  const progress = await getMetersProgress();
  const share = percentOf(progress.laid, progress.planned);
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-muted-foreground text-sm">Metros tendidos</p>
        <p className="text-2xl font-semibold tabular-nums">
          {distanceText(progress.laid)}{" "}
          <span className="text-muted-foreground text-base font-normal">
            de {distanceText(progress.planned)} previstos
          </span>
        </p>
        <Bar percent={share} label={`${Math.round(share)} %`} />
        <p className="text-muted-foreground text-xs">
          Cuenta los cables tendidos de punta a punta, con sus metros reales si el Excel los trae y
          si no con los del listado.
          {progress.withoutLength > 0
            ? ` ${number.format(progress.withoutLength)} ${progress.withoutLength === 1 ? "cable no tiene" : "cables no tienen"} longitud en el listado.`
            : ""}
        </p>
      </Card>

      <Card title="Por nivel">
        <ul className="divide-y">
          {progress.byLevel.map((row) => {
            const rowShare = percentOf(row.laid, row.planned);
            return (
              <li key={row.key} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <Link href={row.href} className={`${INLINE_LINK} font-medium`}>
                    {row.label}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    <span className="text-foreground font-medium">{distanceText(row.laid)}</span>
                    {row.planned > 0 ? ` de ${distanceText(row.planned)}` : " tendidos"} ·{" "}
                    {number.format(row.cables)} cables
                  </span>
                </div>
                {row.planned > 0 ? (
                  <Bar percent={rowShare} label={`${Math.round(rowShare)} %`} />
                ) : (
                  <p className="text-muted-foreground text-xs">Sin longitud en el listado.</p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

async function DeviationTab() {
  const deviation = await getMetersDeviation();
  if (deviation.compared === 0) {
    return (
      <p role="status" className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        Todavía no hay cables con metros reales para comparar.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-muted-foreground text-sm">
          {number.format(deviation.compared)} cables con metros reales y previstos
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {distanceText(deviation.actual)}{" "}
          <span className="text-muted-foreground text-base font-normal">
            reales frente a {distanceText(deviation.planned)} del listado
          </span>
        </p>
        <DeviationBadge planned={deviation.planned} actual={deviation.actual} />
        <p className="text-muted-foreground text-xs">
          Hasta ±{DEVIATION_OK_PERCENT} % está dentro de lo previsto; más de ±
          {DEVIATION_REVIEW_PERCENT} %, conviene revisar la medida o el recorrido. Los metros reales
          vienen de los Excel del día: el eléctrico y la hoja de tendidos del de instrumentación.
        </p>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <DeviationTable title="Por nivel" column="Nivel" rows={deviation.byLevel} />
        {/* Donde empieza el cable: su origen o, si no lo trae, su primera bandeja. */}
        <DeviationTable title="Por área" column="Área" rows={deviation.byArea} />
      </div>

      <Card title={`Los ${TOP_DEVIATIONS} cables que más se desvían`} flush>
        <TableWrap>
          <thead>
            <tr>
              <Th>Cable</Th>
              <Th>Nivel</Th>
              <Th align="right">Previstos</Th>
              <Th align="right">Reales</Th>
              <Th align="right">Desviación</Th>
            </tr>
          </thead>
          <tbody>
            {deviation.top.map((cable) => (
              <tr key={cable.id} className="hover:bg-muted/40 border-t transition-colors">
                <Td>
                  <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                    {cable.code}
                  </Link>
                </Td>
                <Td>{cable.level ? CABLE_LEVEL_LABELS[cable.level] : "—"}</Td>
                <Td align="right">{distanceText(cable.planned)}</Td>
                <Td align="right">{distanceText(cable.actual)}</Td>
                <Td align="right">
                  <DeviationBadge planned={cable.planned} actual={cable.actual} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}

function DeviationTable({
  title,
  column,
  rows,
}: {
  title: string;
  /** Name of the first column: what each row is. */
  column: string;
  rows: DeviationRow[];
}) {
  return (
    <Card title={title} flush>
      <TableWrap>
        <thead>
          <tr>
            <Th>{column}</Th>
            <Th align="right">Cables</Th>
            <Th align="right">Previstos</Th>
            <Th align="right">Reales</Th>
            <Th align="right">Desviación</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-muted/40 border-t transition-colors">
              <Td>
                {row.href ? (
                  <Link href={row.href} className={INLINE_LINK}>
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </Td>
              <Td align="right">{number.format(row.cables)}</Td>
              <Td align="right">{distanceText(row.planned)}</Td>
              <Td align="right">{distanceText(row.actual)}</Td>
              <Td align="right">
                <DeviationBadge planned={row.planned} actual={row.actual} />
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

async function ReelsTab({ q }: { q: string }) {
  const reels = await listReels(q || undefined);
  return (
    <PendingListProvider>
      <ListToolbar
        action="/meters"
        label="Buscar bobinas"
        search={{
          name: "q",
          label: "Bobina",
          value: q,
          placeholder: "Número de bobina",
          maxLength: 100,
        }}
        keep={{ tab: "bobinas" }}
        active={q !== ""}
        count={
          <>
            <span className="text-foreground font-medium">{number.format(reels.length)}</span>{" "}
            {reels.length === 1 ? "bobina" : "bobinas"}
          </>
        }
      />
      <PendingResults>
        {reels.length === 0 ? (
          <p
            role="status"
            className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
          >
            {q ? "Ninguna bobina coincide con la búsqueda." : "El Excel todavía no trae bobinas."}
          </p>
        ) : (
          <Card flush>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Bobina</Th>
                  <Th>Estado</Th>
                  <Th align="right">Cables</Th>
                  <Th align="right">Metros gastados</Th>
                  <Th align="right">Último tendido</Th>
                </tr>
              </thead>
              <tbody>
                {reels.map((reel) => (
                  <tr key={reel.reel} className="hover:bg-muted/40 border-t transition-colors">
                    <Td>
                      {/* Sus cables, en el buscador: con seleccionar, copiar e imprimir. */}
                      <Link
                        href={`/cables?reel=${encodeURIComponent(reel.reel)}`}
                        className={`${INLINE_LINK} font-mono font-medium`}
                      >
                        {reel.reel}
                      </Link>
                    </Td>
                    <Td>{reel.status ?? "—"}</Td>
                    <Td align="right">{number.format(reel.cables)}</Td>
                    <Td align="right">
                      {distanceText(reel.metres)}
                      {reel.withoutMetres > 0 ? (
                        <span className="text-muted-foreground block text-xs">
                          {reel.withoutMetres} sin metros
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right">
                      {reel.lastLaidOn
                        ? formatExcelDay(reel.lastLaidOn.toISOString().slice(0, 10))
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        )}
      </PendingResults>
    </PendingListProvider>
  );
}

function Card({
  title,
  flush = false,
  children,
}: {
  title?: string;
  /** For a table: no padding, so the table goes edge to edge under the title. */
  flush?: boolean;
  children: ReactNode;
}) {
  if (flush) {
    return (
      // `overflow-clip` recorta la cabecera de la tabla a las esquinas redondeadas sin crear una
      // caja con desplazamiento: así, en el ordenador, la cabecera sigue fija bajo el menú.
      <section className="bg-card min-w-0 overflow-clip rounded-lg border">
        {title ? <h2 className="border-b px-4 py-3 text-base font-semibold">{title}</h2> : null}
        {children}
      </section>
    );
  }
  return (
    <section className="bg-card space-y-3 rounded-lg border p-4">
      {title ? <h2 className="border-b pb-2 text-base font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
        <span
          className="bg-primary block h-full rounded-full"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </span>
      <span className="w-12 text-right text-sm font-semibold tabular-nums">{label}</span>
    </div>
  );
}

/**
 * The tables of «Metros»: the header stays in sight while scrolling down a long table, so each
 * figure keeps its column name. On a computer it stays under the menu. On a phone the table also
 * scrolls sideways, and a header cannot stay fixed to the page from inside a box that scrolls
 * sideways: there the table scrolls inside its own box, at most 70 % of the screen tall, and the
 * header stays at the top of that box.
 */
function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="max-md:max-h-[70dvh] max-md:overflow-auto max-md:overscroll-x-contain">
      <table className="w-full min-w-[28rem] text-sm [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
        {children}
      </table>
    </div>
  );
}

function Th({ children, align }: { children: ReactNode; align?: "right" }) {
  return (
    <th
      scope="col"
      className={`bg-muted text-muted-foreground sticky top-0 z-10 border-b px-3 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap uppercase md:top-14 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: ReactNode; align?: "right" }) {
  return (
    <td
      className={`px-3 py-2.5 align-middle tabular-nums ${align === "right" ? "text-right whitespace-nowrap" : ""}`}
    >
      {children}
    </td>
  );
}
