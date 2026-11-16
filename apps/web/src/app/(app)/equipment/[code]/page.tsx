import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TEST_STATUS_LABELS, WIRING_END_LABELS } from "@cables/shared";
import { Section } from "@/components/detail";
import { Badge } from "@/components/ui/badge";
import { TEST_VARIANT } from "@/features/cables/components/cable-status-badges";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { INLINE_LINK, equipmentCablesHref } from "@/lib/links";
import { getEquipment } from "@/server/equipment/service";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The tag from the URL; a malformed escape is just not found. */
function tagOf(code: string): string {
  try {
    return decodeURIComponent(code);
  } catch {
    return "";
  }
}

const loadEquipment = cache((tag: string) => whenSignedIn(() => getEquipment(tag)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const equipment = await loadEquipment(tagOf((await params).code));
  return { title: equipment ? `Equipo ${equipment.equipment}` : "Equipo" };
}

/** "11–14", or the list when they are not a run of numbers. */
function pointsText(points: readonly string[]): string {
  if (points.length === 0) return "sin bornas en el listado";
  const numbers = points.map(Number);
  const consecutive =
    points.length > 2 &&
    numbers.every((n, i) => Number.isInteger(n) && (i === 0 || n === numbers[i - 1]! + 1));
  return consecutive ? `${points[0]}–${points.at(-1)}` : points.join(", ");
}

/**
 * One equipment (cabinet, junction box, panel) as the connection crew sees it: the cables that
 * land in it, by terminal strip, each with the state of its end here. "Solo pendientes" hides
 * the ends already connected.
 */
export default async function EquipmentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireUser();
  const tag = tagOf((await params).code);
  const pendingOnly = (await searchParams).pendientes === "1";
  const equipment = await loadEquipment(tag);
  if (!equipment) notFound();

  const { totals } = equipment;
  const base = `/equipment/${encodeURIComponent(equipment.equipment)}`;
  const groups = equipment.groups
    .map((group) => ({
      ...group,
      ends: pendingOnly ? group.ends.filter((end) => !end.connected) : group.ends,
    }))
    .filter((group) => group.ends.length > 0);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/equipment" className={INLINE_LINK}>
            Equipos
          </Link>{" "}
          ›
        </p>
        <h1 className="font-mono text-3xl font-semibold tracking-tight break-all">
          {equipment.equipment}
        </h1>
        <p className="text-sm">
          <span className="font-medium">
            {totals.ends} {totals.ends === 1 ? "cable llega" : "cables llegan"}
          </span>{" "}
          · <span className="text-success">{totals.connected} conectados</span> ·{" "}
          <span className={totals.ends > totals.connected ? "text-warning" : ""}>
            {totals.ends - totals.connected} pendientes
          </span>{" "}
          · {totals.tested} timbrados
        </p>
        <p className="text-sm">
          <Link href={equipmentCablesHref(equipment.equipment)} className={INLINE_LINK}>
            Ver estos cables en el buscador
          </Link>
        </p>
      </header>

      <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
        {[
          { label: "Todos", href: base, active: !pendingOnly },
          {
            label: "Solo pendientes de conectar",
            href: `${base}?pendientes=1`,
            active: pendingOnly,
          },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.active ? "true" : undefined}
            className={
              item.active
                ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-medium"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <p
          role="status"
          className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
        >
          Todas las puntas de este equipo están conectadas.
        </p>
      ) : (
        groups.map((group) => (
          <Section
            key={group.block ?? "—"}
            title={`${group.block ? `Regletero ${group.block}` : "Sin regletero en el listado"} · ${group.ends.length} ${group.ends.length === 1 ? "cable" : "cables"}`}
          >
            <ul className="bg-card divide-y rounded-lg border">
              {group.ends.map((end) => (
                <li
                  key={`${end.cableId}-${end.end}`}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/cables/${end.cableId}?vista=conexionado`}
                      className="text-primary font-mono text-base font-semibold hover:underline"
                    >
                      {end.code}
                    </Link>
                    <p className="text-muted-foreground">
                      {WIRING_END_LABELS[end.end]} · bornas {pointsText(end.points)} · {end.wires}{" "}
                      {end.wires === 1 ? "hilo" : "hilos"} · al otro lado{" "}
                      <EquipmentLink equipment={end.otherEquipment} />
                    </p>
                    {end.description ? (
                      <p className="text-muted-foreground text-xs">{end.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge dot variant={end.connected ? "success" : "outline"}>
                      {end.connected ? "Conectado aquí" : "Sin conectar aquí"}
                    </Badge>
                    {end.testStatus !== "NOT_TESTED" ? (
                      <Badge dot variant={TEST_VARIANT[end.testStatus]}>
                        {TEST_STATUS_LABELS[end.testStatus]}
                      </Badge>
                    ) : null}
                    {end.editedInField ? (
                      <Badge dot variant="warning">
                        Bornas corregidas
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </article>
  );
}
