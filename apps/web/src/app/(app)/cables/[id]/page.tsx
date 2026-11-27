import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import { ShowMore } from "@/components/show-more";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CABLE_ACTION_LABELS,
  CABLE_LEVEL_LABELS,
  cableLengthItems,
  formatExcelDay,
  lengthDeviation,
  reelText,
  cableActionAvailability,
  cableSheetKey,
  canRunCableAction,
  ACTIVITY_ORIGIN_LABELS,
  CABLE_ACTIONS,
  DATE_SORT_LABELS,
  formatDecimal,
  hasPermission,
  optionsOf,
  parseCableHistorySearch,
  type CableHistorySearch,
} from "@cables/shared";
import { FilterForm } from "@/components/filter-form";
import { ChangeList } from "@/components/change-list";
import { INLINE_LINK, levelCablesHref } from "@/lib/links";
import { DataList, Item, JumpLinks, RecordTitle, Section, SectionLink } from "@/components/detail";
import { CableActions } from "@/features/cables/components/cable-actions";
import { SaveRecordButton } from "@/features/saved/components/save-dialog";
import { CableViewTabs } from "@/features/cables/components/cable-view-tabs";
import { CableWiring } from "@/features/cables/components/cable-wiring";
import { HistoryFilterNote } from "@/features/cables/components/history-filter-note";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { DrawingViewer } from "@/features/drawings/components/drawing-viewer";
import { hasDrawingImage } from "@/server/drawings/store";
import { CableEnds, CableRoute } from "@/features/cables/components/cable-route";
import { RouteDrawings } from "@/features/drawings/components/route-drawings";
import { getRouteSheets } from "@/server/drawings/route-sheets";
import { Badge } from "@/components/ui/badge";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { DeviationBadge } from "@/features/meters/components/deviation-badge";
import { getCableDetail } from "@/server/cables/detail";
import { reelLinksOfCable, type CableReelLink } from "@/server/reels/service";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The two ways to look at a cable: who lays it (route) and who connects it (wiring). */
const VIEWS = [
  { id: "recorrido", label: "Recorrido" },
  { id: "conexionado", label: "Conexionado" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

// generateMetadata y la página piden el mismo cable: una sola consulta por petición, y
// ninguna sin sesión (generateMetadata se ejecuta aparte de la comprobación de la página).
const loadCable = cache((id: string, history = "{}") =>
  whenSignedIn(() => getCableDetail(id, JSON.parse(history) as CableHistorySearch)),
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const cable = await loadCable(id);
  return { title: cable ? `Cable ${cable.code}` : "Cable" };
}

const withUnit = (value: number | null, unit: string) =>
  value === null ? null : `${formatDecimal(value)} ${unit}`;

export default async function CablePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const view: View = query.vista === "conexionado" ? "conexionado" : "recorrido";
  const historySearch = parseCableHistorySearch(query);
  const cable = await loadCable(id, JSON.stringify(historySearch));
  if (!cable) {
    notFound();
  }
  const sheetKey = cableSheetKey(cable.code);
  const lengths = cableLengthItems({ ...cable, ...cable.excel });
  const canEdit = !cable.deleted && hasPermission(user, "cable:update");
  // Dados de baja: sin acciones. El resto ve solo lo que su rol permite.
  const availability = cable.deleted ? [] : cableActionAvailability(user, cable.state);
  const [routeSheets, hasSheet, reelLinks] = await Promise.all([
    view === "recorrido" ? getRouteSheets(cable.route, cable.state) : Promise.resolve([]),
    view === "conexionado" ? hasDrawingImage(sheetKey) : Promise.resolve(false),
    reelLinksOfCable({
      id: cable.id,
      code: cable.code,
      level: cable.level,
      plannedReel: cable.excel.plannedReel,
    }),
  ]);
  const correctableEvents = canRunCableAction(user, "CORRECTION")
    ? cable.history.map((entry) => ({
        id: entry.id,
        label: `${CABLE_ACTION_LABELS[entry.action]} · ${entry.user} · ${dateFormat.format(entry.at)}`,
      }))
    : [];

  return (
    <article className="space-y-6">
      {/* Cabecera corta: el código y su estado. Lo demás está en «Datos del cable», para que el
          plano quede lo más arriba posible. */}
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link
            href="/cables"
            className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          >
            Cables
          </Link>{" "}
          ›
        </p>
        <RecordTitle
          title={cable.code}
          actions={
            <>
              {canEdit ? (
                <SectionLink href={`/cables/${cable.id}/edit`} icon={<PencilIcon aria-hidden />}>
                  Editar
                </SectionLink>
              ) : null}
              <SaveRecordButton kind="CABLE" itemKey={cable.id} label={cable.code} />
            </>
          }
        />
        <CableStatusBadges
          installationStatus={cable.installationStatus}
          connectionStatus={cable.connectionStatus}
          testStatus={cable.testStatus}
          showUntested
        >
          {cable.excelOnly ? <Badge variant="outline">Solo datos del Excel</Badge> : null}
        </CableStatusBadges>
      </header>

      {cable.deleted ? (
        <p role="status" className="border-destructive/40 rounded-lg border px-4 py-3 text-sm">
          Cable dado de baja el {dateFormat.format(cable.deleted.at)} por {cable.deleted.user}
          {cable.deleted.reason ? `. Motivo: ${cable.deleted.reason}` : ""}.
        </p>
      ) : null}

      {/* Pestañas y todo lo de debajo: al cambiar de vista, «Cargando…» en su lugar. */}
      <PendingListProvider>
        <CableViewTabs
          current={view}
          tabs={VIEWS.map((item) => ({
            id: item.id,
            label: item.label,
            href: `/cables/${cable.id}?vista=${item.id}`,
            count: item.id === "conexionado" ? cable.wiring.wires.length : undefined,
          }))}
        />
        <PendingResults className="space-y-4">
          <JumpLinks
            links={
              view === "recorrido"
                ? [
                    ...(routeSheets.length > 0 ? [{ id: "planos", label: "Plano" }] : []),
                    { id: "tramos", label: "Tramos" },
                    { id: "extremos", label: "Extremos" },
                    { id: "datos", label: "Datos" },
                    { id: "historial", label: "Historial" },
                  ]
                : [
                    { id: "hoja", label: "Hoja original" },
                    { id: "extremos", label: "Extremos" },
                    { id: "hilos", label: "Bornas" },
                    { id: "historial", label: "Historial" },
                  ]
            }
          />
          {view === "recorrido" ? (
            <>
              {routeSheets.length > 0 ? (
                <Section title="Recorrido en los planos" id="planos">
                  <RouteDrawings sheets={routeSheets} />
                </Section>
              ) : null}

              <Section
                title={`Recorrido por bandejas${cable.route.length > 0 ? ` (${cable.route.length} tramos)` : ""}`}
                collapsible
                id="tramos"
              >
                <CableRoute route={cable.route} state={cable.state} />
              </Section>

              <Section title="Extremos" collapsible defaultOpen={false} id="extremos">
                <CableEnds ends={cable.ends} state={cable.state} />
              </Section>

              <Section title="Datos del cable" collapsible defaultOpen={false} id="datos">
                <DataList title="Qué es">
                  <Item label="Servicio">{cable.description}</Item>
                  <Item label="Nivel">
                    {cable.level ? (
                      <Link href={levelCablesHref(cable.level)} className={INLINE_LINK}>
                        {CABLE_LEVEL_LABELS[cable.level]}
                      </Link>
                    ) : null}
                  </Item>
                  <Item label="Marcado alternativo">{cable.altCode}</Item>
                  <Item label="Tipo">
                    {cable.type && cable.typeId ? (
                      <Link
                        href={`/cables?type=${encodeURIComponent(cable.typeId)}`}
                        className={INLINE_LINK}
                      >
                        {cable.type}
                      </Link>
                    ) : (
                      cable.type
                    )}
                  </Item>
                  <Item label="Color">
                    {cable.color ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="border-foreground/40 size-3 rounded-full border"
                          style={{ backgroundColor: cable.color.hex ?? "transparent" }}
                        />
                        {cable.colorId ? (
                          <Link
                            href={`/cables?color=${encodeURIComponent(cable.colorId)}`}
                            className={INLINE_LINK}
                          >
                            {cable.color.name}
                          </Link>
                        ) : (
                          cable.color.name
                        )}
                      </span>
                    ) : null}
                  </Item>
                  <Item label="Fabricante">
                    {cable.manufacturer && cable.manufacturerId ? (
                      <Link
                        href={`/cables?manufacturer=${encodeURIComponent(cable.manufacturerId)}`}
                        className={INLINE_LINK}
                      >
                        {cable.manufacturer}
                      </Link>
                    ) : (
                      cable.manufacturer
                    )}
                  </Item>
                  <Item label="Nº de conductores">{cable.conductors}</Item>
                  <Item label="Sección">{withUnit(cable.crossSectionMm2, "mm²")}</Item>
                  <Item label="Diámetro exterior">{withUnit(cable.outerDiameterMm, "mm")}</Item>
                  <Item label="Tensión nominal">{cable.voltageRating}</Item>
                  <Item label="Composición">{cable.composition}</Item>
                </DataList>
                {/* Lo que trae el Excel. */}
                <DataList title="Tendido">
                  <Item label="Fecha">
                    {cable.excel.laidOn
                      ? `${formatExcelDay(cable.excel.laidOn)}, según el Excel`
                      : null}
                  </Item>
                  <Item label="Empresa">{cable.excel.company}</Item>
                  {/* La que se pidió usar; sin bobina real, el estado va con ella. */}
                  <Item label="Bobina estimada">
                    {reelLinks.planned.length > 0 ? (
                      <ReelLinks
                        links={reelLinks.planned}
                        status={cable.excel.reel ? null : cable.excel.reelStatus}
                      />
                    ) : cable.excel.reel ? (
                      cable.excel.plannedReel
                    ) : (
                      reelText(cable.excel.plannedReel, cable.excel.reelStatus)
                    )}
                  </Item>
                  {/* La bobina lleva a su ficha (fase 18): sus metros y todo lo tirado de ella.
                      Sin ficha, a sus cables en el buscador (fase 17). */}
                  <Item label="Bobina real">
                    {reelLinks.real.length > 0 ? (
                      <ReelLinks links={reelLinks.real} status={cable.excel.reelStatus} />
                    ) : cable.excel.reel ? (
                      <>
                        <Link
                          href={`/cables?reel=${encodeURIComponent(cable.excel.reel)}`}
                          className={INLINE_LINK}
                        >
                          {cable.excel.reel}
                        </Link>
                        {cable.excel.reelStatus ? ` · ${cable.excel.reelStatus}` : ""}
                      </>
                    ) : null}
                  </Item>
                  {lengths
                    .filter((item) => item.label === "Longitud real")
                    .map((item) => (
                      <Item key={item.label} label={item.label}>
                        {item.value}
                      </Item>
                    ))}
                  {/* Solo con las dos longitudes: si no, la fila no sale. */}
                  <Item label="Frente al listado">
                    {lengthDeviation(cable.lengthM, cable.excel.actualLengthM) ? (
                      <DeviationBadge
                        planned={cable.lengthM}
                        actual={cable.excel.actualLengthM}
                        withMetres
                      />
                    ) : null}
                  </Item>
                </DataList>
                <DataList title="Proyecto">
                  {lengths
                    .filter((item) => item.label !== "Longitud real")
                    .map((item) => (
                      <Item key={item.label} label={item.label}>
                        {item.value}
                      </Item>
                    ))}
                  <Item label="Circuito">
                    {cable.circuit
                      ? `${cable.circuit}${cable.cablesPerCircuit ? ` · ${cable.cablesPerCircuit} cables por circuito` : ""}`
                      : null}
                  </Item>
                  <Item label="Esquema">{cable.diagram}</Item>
                  <Item label="Revisión">{cable.revision}</Item>
                  <Item label="Listado de origen">
                    {cable.source
                      ? [
                          cable.source.document,
                          cable.source.page ? `pág. ${cable.source.page}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : null}
                  </Item>
                  <Item label="Alta">{dateFormat.format(cable.createdAt)}</Item>
                </DataList>
                {cable.notes ? (
                  <section className="space-y-1.5">
                    <h3 className="text-primary px-1 text-sm font-semibold">Notas</h3>
                    <p className="bg-card rounded-lg border px-4 py-2.5 text-[15px] whitespace-pre-line">
                      {cable.notes}
                    </p>
                  </section>
                ) : null}
              </Section>
            </>
          ) : (
            <>
              <Section title="Hoja original del listado" id="hoja">
                {hasSheet ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                      {cable.source?.document ?? "Listado"}
                      {cable.source?.page ? `, pág. ${cable.source.page}` : ""}
                      {cable.revision ? ` · revisión ${cable.revision}` : ""}. En caso de duda,
                      manda la hoja original.
                    </p>
                    <DrawingViewer
                      imageKey={sheetKey}
                      width={1000}
                      height={1414}
                      marks={[]}
                      label={`Hoja original del cable ${cable.code}`}
                      noun="hoja"
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    La hoja original de este cable todavía no está disponible.
                  </p>
                )}
              </Section>

              <Section title="Extremos" collapsible id="extremos">
                <CableEnds ends={cable.ends} state={cable.state} />
              </Section>

              <Section
                title={`Bornas · ${cable.wiring.wires.length} ${cable.wiring.wires.length === 1 ? "hilo" : "hilos"}${cable.wiring.revision ? ` (revisión ${cable.wiring.revision})` : ""}`}
                collapsible
                defaultOpen={false}
                id="hilos"
              >
                <CableWiring
                  cableId={cable.id}
                  version={cable.version}
                  wires={cable.wiring.wires}
                  jumpers={cable.wiring.jumpers}
                  equipment={{
                    origin: cable.ends.origin.equipment,
                    destination: cable.ends.destination.equipment,
                  }}
                  canEdit={!cable.deleted && hasPermission(user, "cable:wiring")}
                />
              </Section>
            </>
          )}

          <Section title="Historial" collapsible defaultOpen={false} id="historial">
            <PendingListProvider>
              <FilterForm
                action={`/cables/${cable.id}`}
                label="Filtrar el historial"
                anchor="historial"
                keep={{ vista: view }}
                active={Boolean(
                  historySearch.origin ||
                  historySearch.action ||
                  historySearch.person ||
                  historySearch.sort,
                )}
                fields={[
                  {
                    kind: "select",
                    name: "origin",
                    label: "Origen",
                    value: historySearch.origin,
                    options: optionsOf(ACTIVITY_ORIGIN_LABELS),
                    emptyLabel: null,
                  },
                  {
                    kind: "select",
                    name: "action",
                    label: "Qué se hizo",
                    value: historySearch.action,
                    options: CABLE_ACTIONS.map((action) => ({
                      value: action,
                      label: CABLE_ACTION_LABELS[action],
                    })),
                  },
                  {
                    kind: "select",
                    name: "person",
                    label: "Quién",
                    value: historySearch.person,
                    options: cable.historyPeople.map((person) => ({
                      value: person.id,
                      label: person.label,
                    })),
                  },
                  {
                    kind: "select",
                    name: "sort",
                    label: "Orden",
                    value: historySearch.sort,
                    options: optionsOf(DATE_SORT_LABELS),
                    emptyLabel: null,
                  },
                ]}
              />
              <PendingResults className="space-y-3">
                <HistoryFilterNote
                  search={historySearch}
                  total={cable.historyTotal}
                  all={cable.historyAll}
                />
                {cable.historyTotal > cable.history.length ? (
                  <p role="note" className="text-muted-foreground text-sm">
                    Se muestran {cable.history.length} de {cable.historyTotal}. Los demás siguen
                    guardados: usa los filtros o el orden para verlos.
                  </p>
                ) : null}
                {cable.history.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {cable.historyAll === 0
                      ? "Sin historial."
                      : "Ningún movimiento cumple los filtros."}
                  </p>
                ) : (
                  <ShowMore
                    as="ol"
                    className="space-y-5 border-l pl-4"
                    noun="movimientos"
                    items={cable.history.map((entry, index) => (
                      <li key={entry.id} className="relative space-y-1 text-sm">
                        <span
                          aria-hidden
                          className={`absolute top-1.5 -left-[1.3125rem] size-2 rounded-full ${index === 0 && historySearch.sort !== "oldest" ? "bg-primary" : "bg-border"}`}
                        />
                        <p className="text-muted-foreground text-xs">
                          <time dateTime={entry.at.toISOString()}>
                            {dateFormat.format(entry.at)}
                          </time>{" "}
                          ·{" "}
                          <span className="text-foreground font-medium">
                            {CABLE_ACTION_LABELS[entry.action]}
                          </span>
                        </p>
                        <p>
                          <span className="font-medium">{entry.user}</span> {entry.summary}
                          {entry.corrects ? (
                            <span className="text-muted-foreground"> ({entry.corrects})</span>
                          ) : null}
                          .
                        </p>
                        {entry.notes ? <p className="italic">“{entry.notes}”</p> : null}
                        <ChangeList changes={entry.changes} />
                        {entry.detailHref ? (
                          <Link href={entry.detailHref} className={INLINE_LINK}>
                            Ver qué cambió
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  />
                )}
              </PendingResults>
            </PendingListProvider>
          </Section>
        </PendingResults>
      </PendingListProvider>

      {/* Fija abajo, a mano con el pulgar: la ficha empieza por el plano, no por los botones. */}
      <CableActions
        cableId={cable.id}
        code={cable.code}
        version={cable.version}
        state={cable.state}
        availability={availability}
        events={correctableEvents}
        // Un recorrido puede nombrar dos veces la misma bandeja: se sugiere una sola vez.
        routeTrays={[
          ...new Set(cable.route.flatMap((step) => (step.trayCode ? [step.trayCode] : []))),
        ]}
      />
    </article>
  );
}

/** «26 · EJ-DRUM 10 · En Sitio»: each reel links to its record (fase 18). */
function ReelLinks({ links, status }: { links: CableReelLink[]; status: string | null }) {
  return (
    <>
      {links.map((link, index) => (
        <span key={link.id}>
          {index > 0 ? " / " : ""}
          <Link href={`/reels/${link.id}`} className={INLINE_LINK}>
            {link.label}
          </Link>
        </span>
      ))}
      {status ? ` · ${status}` : ""}
    </>
  );
}
