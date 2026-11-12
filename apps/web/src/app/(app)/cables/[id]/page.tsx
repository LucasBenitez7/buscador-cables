import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  CABLE_ACTION_LABELS,
  cableActionAvailability,
  canRunCableAction,
  formatDecimal,
  hasPermission,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { CableActions } from "@/features/cables/components/cable-actions";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { getCableDetail } from "@/server/cables/detail";
import { listLocationOptions } from "@/server/cables/service";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

// generateMetadata y la página piden el mismo cable: una sola consulta por petición.
const loadCable = cache(getCableDetail);

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
  const locations = availability.length > 0 ? await listLocationOptions() : [];
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
            <Link href="/cables" className="underline-offset-4 hover:underline">
              Cables
            </Link>{" "}
            ›
          </p>
          <h1 className="font-mono text-3xl font-semibold tracking-tight">{cable.code}</h1>
          {cable.description ? <p className="text-muted-foreground">{cable.description}</p> : null}
          <CableStatusBadges
            installationStatus={cable.installationStatus}
            connectionStatus={cable.connectionStatus}
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
      />

      <Section title="Recorrido">
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <li className="rounded-lg border px-3 py-2">
            <span className="text-muted-foreground block text-xs">Origen</span>
            {cable.origin ?? "Sin indicar"}
          </li>
          <li aria-hidden className="text-muted-foreground text-center">
            <span className="sm:hidden">↓</span>
            <span className="hidden sm:inline">→</span>
          </li>
          <li className="rounded-lg border px-3 py-2">
            <span className="text-muted-foreground block text-xs">Destino</span>
            {cable.destination ?? "Sin indicar"}
          </li>
        </ol>
        {cable.currentLocation ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Ahora está en: </span>
            {cable.currentLocation}
          </p>
        ) : null}
      </Section>

      <Section title="Datos">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
          <Item label="Longitud">{withUnit(cable.lengthM, "m")}</Item>
          <Item label="Tensión nominal">{cable.voltageRating}</Item>
          <Item label="Alta">{dateFormat.format(cable.createdAt)}</Item>
        </dl>
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
        {cable.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin historial.</p>
        ) : (
          <ol className="space-y-5 border-l pl-4">
            {cable.history.map((entry) => (
              <li key={entry.id} className="relative space-y-1 text-sm">
                <span
                  aria-hidden
                  className="bg-border absolute top-1.5 -left-[1.3125rem] size-2 rounded-full"
                />
                <p className="text-muted-foreground text-xs">
                  <time dateTime={entry.at.toISOString()}>{dateFormat.format(entry.at)}</time> ·{" "}
                  {CABLE_ACTION_LABELS[entry.action]}
                </p>
                <p>
                  <span className="font-medium">{entry.user}</span> {entry.summary}
                  {entry.corrects ? (
                    <span className="text-muted-foreground"> ({entry.corrects})</span>
                  ) : null}
                  .
                </p>
                {entry.notes ? <p className="italic">“{entry.notes}”</p> : null}
                {entry.changes.length > 0 ? (
                  <ul className="text-muted-foreground space-y-0.5">
                    {entry.changes.map((change) => (
                      <li key={change.field}>
                        {change.field}: {change.from} →{" "}
                        <span className="text-foreground">{change.to}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}
