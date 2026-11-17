import type { Metadata } from "next";
import { ShowMore } from "@/components/show-more";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CABLE_ACTION_LABELS,
  CABLE_LEVEL_LABELS,
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
import { INLINE_LINK, levelCablesHref, locationHref } from "@/lib/links";
import { DataList, Item, JumpLinks, Section } from "@/components/detail";
import { Button } from "@/components/ui/button";
import { CableActions } from "@/features/cables/components/cable-actions";
import { CableViewTabs } from "@/features/cables/components/cable-view-tabs";
import { CableWiring } from "@/features/cables/components/cable-wiring";
import { HistoryFilterNote } from "@/features/cables/components/history-filter-note";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { DrawingViewer } from "@/features/drawings/components/drawing-viewer";
import { hasDrawingImage } from "@/server/drawings/store";
import { CableEnds, CableRoute } from "@/features/cables/components/cable-route";
import { RouteDrawings } from "@/features/drawings/components/route-drawings";
import { getRouteSheets } from "@/server/drawings/route-sheets";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { getCableDetail } from "@/server/cables/detail";
import { listLocationOptions } from "@/server/cables/service";
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
  const canEdit = !cable.deleted && hasPermission(user, "cable:update");
  // Dados de baja: sin acciones. El resto ve solo lo que su rol permite.
  const availability = cable.deleted ? [] : cableActionAvailability(user, cable.state);
  const [locations, routeSheets, hasSheet] = await Promise.all([
    availability.length > 0 ? listLocationOptions() : Promise.resolve([]),
    view === "recorrido" ? getRouteSheets(cable.route, cable.state) : Promise.resolve([]),
    view === "conexionado" ? hasDrawingImage(sheetKey) : Promise.resolve(false),
  ]);
  const correctableEvents = canRunCableAction(user, "CORRECTION")
    ? cable.history.map((entry) => ({
        id: entry.id,
        label: `${CABLE_ACTION_LABELS[entry.action]} · ${entry.user} · ${dateFormat.format(entry.at)}`,
      }))
    : [];

  return (
    <article className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            <Link
              href="/cables"
              className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
            >
              Cables
            </Link>{" "}
            ›
          </p>
          <h1 className="font-mono text-3xl font-semibold tracking-tight">{cable.code}</h1>
          {cable.level || cable.altCode ? (
            <p className="text-muted-foreground text-sm">
              {cable.level ? (
                <Link href={levelCablesHref(cable.level)} className={INLINE_LINK}>
                  {CABLE_LEVEL_LABELS[cable.level]}
                </Link>
              ) : null}
              {cable.level && cable.altCode ? " · " : null}
              {cable.altCode}
            </p>
          ) : null}
          {cable.description ? <p className="text-muted-foreground">{cable.description}</p> : null}
          <CableStatusBadges
            installationStatus={cable.installationStatus}
            connectionStatus={cable.connectionStatus}
            testStatus={cable.testStatus}
            showUntested
          />
        </div>
        {canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/cables/${cable.id}/edit`}>Editar datos</Link>
          </Button>
        ) : null}
      </header>

      {cable.deleted ? (
        <p role="status" className="border-destructive/40 rounded-lg border px-4 py-3 text-sm">
          Cable dado de baja el {dateFormat.format(cable.deleted.at)} por {cable.deleted.user}
          {cable.deleted.reason ? `. Motivo: ${cable.deleted.reason}` : ""}.
        </p>
      ) : null}

      <CableActions
        cableId={cable.id}
        code={cable.code}
        version={cable.version}
        state={cable.state}
        availability={availability}
        locations={locations}
        events={correctableEvents}
        // Un recorrido puede nombrar dos veces la misma bandeja: se sugiere una sola vez.
        routeTrays={[
          ...new Set(cable.route.flatMap((step) => (step.trayCode ? [step.trayCode] : []))),
        ]}
      />

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
        <PendingResults className="space-y-8">
          <JumpLinks
            links={
              view === "recorrido"
                ? [
                    { id: "tramos", label: "Tramos" },
                    ...(routeSheets.length > 0 ? [{ id: "planos", label: "Planos" }] : []),
                    { id: "datos", label: "Datos" },
                    { id: "historial", label: "Historial" },
                  ]
                : [
                    { id: "hilos", label: "Tabla de hilos" },
                    { id: "hoja", label: "Hoja original" },
                    { id: "historial", label: "Historial" },
                  ]
            }
          />

          <Section title="Extremos">
            <CableEnds ends={cable.ends} state={cable.state} />
            {cable.currentLocation ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Ahora está en: </span>
                {cable.currentLocationId ? (
                  <Link href={locationHref(cable.currentLocationId)} className={INLINE_LINK}>
                    {cable.currentLocation}
                  </Link>
                ) : (
                  cable.currentLocation
                )}
              </p>
            ) : null}
          </Section>

          {view === "recorrido" ? (
            <>
              <Section
                title={`Recorrido por bandejas${cable.route.length > 0 ? ` (${cable.route.length} tramos)` : ""}`}
                collapsible
                id="tramos"
              >
                <CableRoute route={cable.route} state={cable.state} />
              </Section>

              {routeSheets.length > 0 ? (
                <Section title="Recorrido en los planos" collapsible id="planos">
                  <RouteDrawings sheets={routeSheets} />
                </Section>
              ) : null}

              <Section title="Datos" collapsible id="datos">
                <DataList>
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
                  <Item label="Longitud">
                    {cable.lengthM === null && !cable.lengthPending
                      ? null
                      : `${withUnit(cable.lengthM, "m") ?? "Sin longitud"}${cable.lengthPending ? " (pendiente)" : ""}`}
                  </Item>
                  <Item label="Tensión nominal">{cable.voltageRating}</Item>
                  <Item label="Composición">{cable.composition}</Item>
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
                  <div className="space-y-1 text-sm">
                    <h3 className="text-muted-foreground">Notas</h3>
                    <p className="whitespace-pre-line">{cable.notes}</p>
                  </div>
                ) : null}
              </Section>
            </>
          ) : (
            <>
              <Section
                title={`Conexionado${cable.wiring.revision ? ` (revisión ${cable.wiring.revision})` : ""}`}
                collapsible
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

              <Section title="Hoja original del listado" collapsible id="hoja">
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
            </>
          )}

          <Section title="Último movimiento">
            {cable.lastAction ? (
              <p className="text-sm">
                {CABLE_ACTION_LABELS[cable.lastAction.action]} · {cable.lastAction.user} ·{" "}
                {dateFormat.format(cable.lastAction.at)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Sin movimientos registrados.</p>
            )}
          </Section>

          <section id="historial" className="scroll-mt-20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
              <h2 className="text-base font-semibold">
                Historial
                <span className="text-muted-foreground text-sm font-normal">
                  {" "}
                  ·{" "}
                  {historySearch.sort === "oldest" ? "más antiguo primero" : "más reciente primero"}
                </span>
              </h2>
            </div>
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
          </section>
        </PendingResults>
      </PendingListProvider>
    </article>
  );
}
