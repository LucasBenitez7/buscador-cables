import type { Metadata } from "next";
import { ShowMore } from "@/components/show-more";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  EQUIPMENT_SORT_LABELS,
  EQUIPMENT_STATE_LABELS,
  EQUIPMENT_TEST_LABELS,
  TEST_STATUS_LABELS,
  WIRING_END_LABELS,
  optionsOf,
  parseEquipmentSearch,
} from "@cables/shared";
import { RecordTitle, Section, SectionLink } from "@/components/detail";
import { FilterForm } from "@/components/filter-form";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { Badge } from "@/components/ui/badge";
import { TEST_VARIANT } from "@/features/cables/components/cable-status-badges";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { INLINE_LINK, equipmentCablesHref } from "@/lib/links";
import { filterEquipmentGroups } from "@/server/equipment/group";
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

/** Anchor of a terminal strip on the page ("regletero-X51"). */
const stripId = (block: string | null) =>
  `regletero-${(block ?? "sin-regletero").replace(/[^A-Za-z0-9_-]+/g, "-")}`;

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
 * land in it, by terminal strip, each with the state of its end here, with filters (cable,
 * state of this end, test, strip) and order.
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
  const search = parseEquipmentSearch(await searchParams);
  const equipment = await loadEquipment(tag);
  if (!equipment) notFound();

  const { totals } = equipment;
  const base = `/equipment/${encodeURIComponent(equipment.equipment)}`;
  const groups = filterEquipmentGroups(equipment.groups, search);
  const shown = groups.reduce((sum, group) => sum + group.ends.length, 0);
  const filtered = Boolean(search.q || search.state || search.test || search.block || search.sort);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/equipment" className={INLINE_LINK}>
            Equipos
          </Link>{" "}
          ›
        </p>
        <RecordTitle
          title={equipment.equipment}
          actions={
            <SectionLink href={equipmentCablesHref(equipment.equipment)}>
              Ver sus cables en el buscador
            </SectionLink>
          }
        />
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
      </header>

      <PendingListProvider>
        <FilterForm
          action={base}
          label="Filtrar los cables del equipo"
          active={filtered}
          fields={[
            {
              kind: "text",
              name: "q",
              label: "Cable",
              value: search.q,
              placeholder: "Parte del código",
            },
            {
              kind: "select",
              name: "state",
              label: "Punta aquí",
              value: search.state,
              options: optionsOf(EQUIPMENT_STATE_LABELS),
            },
            {
              kind: "select",
              name: "test",
              label: "Timbrado",
              value: search.test,
              options: optionsOf(EQUIPMENT_TEST_LABELS),
            },
            {
              kind: "select",
              name: "block",
              label: "Regletero",
              value: search.block,
              options: equipment.groups.flatMap((group) =>
                group.block ? [{ value: group.block, label: group.block }] : [],
              ),
            },
            {
              kind: "select",
              name: "sort",
              label: "Orden",
              value: search.sort,
              options: optionsOf(EQUIPMENT_SORT_LABELS),
              emptyLabel: null,
            },
          ]}
        />
        <PendingResults className="space-y-6">
          {filtered ? (
            <p role="status" className="text-muted-foreground text-sm">
              {shown} de {totals.ends} cumplen los filtros.
            </p>
          ) : null}

          {groups.length === 0 ? (
            <p
              role="status"
              className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
            >
              Ningún cable de este equipo cumple los filtros.
            </p>
          ) : (
            groups.map((group) => (
              <Section
                key={group.block ?? "—"}
                id={stripId(group.block)}
                collapsible
                title={`${group.block ? `Regletero ${group.block}` : "Sin regletero en el listado"} · ${group.ends.length} ${group.ends.length === 1 ? "cable" : "cables"}`}
              >
                <ShowMore
                  as="ul"
                  className="bg-card divide-y rounded-lg border"
                  noun="cables"
                  items={group.ends.map((end) => (
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
                          {WIRING_END_LABELS[end.end]} · bornas {pointsText(end.points)} ·{" "}
                          {end.wires} {end.wires === 1 ? "hilo" : "hilos"} · al otro lado{" "}
                          <EquipmentLink equipment={end.otherEquipment} />
                        </p>
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
                />
              </Section>
            ))
          )}
        </PendingResults>
      </PendingListProvider>
    </article>
  );
}
