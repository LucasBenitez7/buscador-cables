import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CABLE_ACTION_LABELS,
  CABLE_LEVEL_LABELS,
  cableActionAvailability,
  canRunCableAction,
  formatDecimal,
  hasPermission,
} from "@cables/shared";
import { ChangeList } from "@/components/change-list";
import { DataList, Item, Section } from "@/components/detail";
import { Button } from "@/components/ui/button";
import { CableActions } from "@/features/cables/components/cable-actions";
import { CableEnds, CableRoute } from "@/features/cables/components/cable-route";
import { RouteDrawings } from "@/features/drawings/components/route-drawings";
import { getRouteSheets } from "@/server/drawings/route-sheets";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { getCableDetail } from "@/server/cables/detail";
import { listLocationOptions } from "@/server/cables/service";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

// generateMetadata y la página piden el mismo cable: una sola consulta por petición, y
// ninguna sin sesión (generateMetadata se ejecuta aparte de la comprobación de la página).
const loadCable = cache((id: string) => whenSignedIn(() => getCableDetail(id)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const cable = await loadCable(id);
  return { title: cable ? `Cable ${cable.code}` : "Cable" };
}

const withUnit = (value: number | null, unit: string) =>
  value === null ? null : `${formatDecimal(value)} ${unit}`;

export default async function CablePage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  const cable = await loadCable(id);
  if (!cable) {
    notFound();
  }
  const canEdit = !cable.deleted && hasPermission(user.role, "cable:update");
  // Dados de baja: sin acciones. El resto ve solo lo que su rol permite.
  const availability = cable.deleted ? [] : cableActionAvailability(user.role, cable.state);
  const [locations, routeSheets] = await Promise.all([
    availability.length > 0 ? listLocationOptions() : Promise.resolve([]),
    getRouteSheets(cable.route, cable.state),
  ]);
  const correctableEvents = canRunCableAction(user.role, "CORRECTION")
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
              {[cable.level ? CABLE_LEVEL_LABELS[cable.level] : null, cable.altCode]
                .filter(Boolean)
                .join(" · ")}
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

      <Section title="Extremos">
        <CableEnds ends={cable.ends} state={cable.state} />
        {cable.currentLocation ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Ahora está en: </span>
            {cable.currentLocation}
          </p>
        ) : null}
      </Section>

      <Section
        title={`Recorrido por bandejas${cable.route.length > 0 ? ` (${cable.route.length} tramos)` : ""}`}
      >
        {routeSheets.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <CableRoute route={cable.route} state={cable.state} />
            <RouteDrawings sheets={routeSheets} />
          </div>
        ) : (
          <CableRoute route={cable.route} state={cable.state} />
        )}
      </Section>

      <Section title="Datos">
        <DataList>
          <Item label="Tipo">{cable.type}</Item>
          <Item label="Color">
            {cable.color ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="border-foreground/40 size-3 rounded-full border"
                  style={{ backgroundColor: cable.color.hex ?? "transparent" }}
                />
                {cable.color.name}
              </span>
            ) : null}
          </Item>
          <Item label="Fabricante">{cable.manufacturer}</Item>
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
              ? [cable.source.document, cable.source.page ? `pág. ${cable.source.page}` : null]
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

      <Section title="Historial (más reciente primero)">
        {cable.historyTotal > cable.history.length ? (
          <p role="note" className="text-muted-foreground text-sm">
            Se muestran los {cable.history.length} movimientos más recientes de {cable.historyTotal}
            . Los anteriores siguen guardados.
          </p>
        ) : null}
        {cable.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin historial.</p>
        ) : (
          <ol className="space-y-5 border-l pl-4">
            {cable.history.map((entry, index) => (
              <li key={entry.id} className="relative space-y-1 text-sm">
                <span
                  aria-hidden
                  className={`absolute top-1.5 -left-[1.3125rem] size-2 rounded-full ${index === 0 ? "bg-primary" : "bg-border"}`}
                />
                <p className="text-muted-foreground text-xs">
                  <time dateTime={entry.at.toISOString()}>{dateFormat.format(entry.at)}</time> ·{" "}
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
              </li>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
}
