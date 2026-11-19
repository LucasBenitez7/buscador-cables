import type { Metadata } from "next";
import { ShowMore } from "@/components/show-more";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CABLE_END_SIDE_LABELS,
  CABLE_LEVEL_LABELS,
  TRAY_KIND_LABELS,
  formatTraySize,
  normalizeTrayCode,
} from "@cables/shared";
import { DataList, Item, JumpLinks, RecordTitle, Section, SectionLink } from "@/components/detail";
import { ListSummary } from "@/components/list-summary";
import {
  SelectAllRow,
  SelectCheckbox,
  SelectionAside,
  SelectionProvider,
} from "@/components/selection";
import { CODE_LINK } from "@/components/ui/text-link";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { TrayDrawings } from "@/features/drawings/components/tray-drawings";
import { getTrayDetail, type TrayCable } from "@/server/trays/service";
import { INLINE_LINK, levelCablesHref, locationHref } from "@/lib/links";
import { decodeRouteParam } from "@/lib/route-params";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;

// Una sola consulta para generateMetadata y la página, y ninguna sin sesión. Un código mal
// codificado en la URL es una bandeja que no existe, no un error.
const loadTray = cache(async (code: string) => {
  const decoded = decodeRouteParam(code);
  return decoded === null ? null : whenSignedIn(() => getTrayDetail(normalizeTrayCode(decoded)));
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tray = await loadTray((await params).code);
  return { title: tray ? `Bandeja ${tray.code}` : "Bandeja" };
}

export default async function TrayPage({ params }: { params: Params }) {
  await requireUser();
  const tray = await loadTray((await params).code);
  if (!tray) notFound();
  const size = formatTraySize(tray.size);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link
            href="/trays"
            className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          >
            Bandejas
          </Link>{" "}
          ›
        </p>
        <RecordTitle
          title={tray.code}
          actions={
            tray.routeCables.length > 0 ? (
              <SectionLink href={`/cables?tray=${encodeURIComponent(tray.code)}`}>
                Ver sus cables en el buscador
              </SectionLink>
            ) : null
          }
        />
        <p className="text-muted-foreground">
          {[
            TRAY_KIND_LABELS[tray.kind],
            tray.voltageLevel ? `nivel de tensión L${tray.voltageLevel}` : null,
            tray.elevationLevel !== null ? `cota ${tray.elevationLevel}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <JumpLinks
        links={[
          { id: "planos", label: "Plano" },
          { id: "esperando", label: "Esperando aquí" },
          { id: "pasan", label: "Pasan por aquí" },
          { id: "datos", label: "Datos" },
        ]}
      />

      <Section
        title={`Plano${tray.drawings.length > 1 ? `s (${tray.drawings.length} hojas)` : ""}`}
        id="planos"
      >
        {tray.drawings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No aparece en los planos cargados.</p>
        ) : (
          <TrayDrawings code={tray.code} sheets={tray.drawings} />
        )}
      </Section>

      <Section title={`Esperando aquí (${tray.waitingCables.length})`} collapsible id="esperando">
        {tray.waitingCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún cable tiene aquí la punta suelta.</p>
        ) : (
          <CableList title={`Bandeja ${tray.code} · esperando aquí`} cables={tray.waitingCables} />
        )}
      </Section>

      <Section title={`Pasan por aquí (${tray.routeCables.length})`} collapsible id="pasan">
        {tray.routeCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún recorrido cargado pasa por aquí.</p>
        ) : (
          <CableList title={`Bandeja ${tray.code} · pasan por aquí`} cables={tray.routeCables} />
        )}
      </Section>

      <Section title="Datos de la bandeja" collapsible defaultOpen={false} id="datos">
        <DataList>
          <Item label="Tamaño">{size}</Item>
          <Item label="Edificio">
            {tray.building && tray.buildingId ? (
              <Link href={locationHref(tray.buildingId)} className={INLINE_LINK}>
                {tray.building}
              </Link>
            ) : (
              tray.building
            )}
          </Item>
          <Item label="Cables que pasan">{tray.cables}</Item>
        </DataList>
        {tray.notes ? <p className="text-sm whitespace-pre-line">{tray.notes}</p> : null}
      </Section>
    </article>
  );
}

/** One list of cables of the tray, with «Seleccionar» (fase 15). */
function CableList({ title, cables }: { title: string; cables: TrayCable[] }) {
  return (
    <SelectionProvider
      title={title}
      items={cables.map((cable) => ({ key: cable.id, label: cable.code }))}
    >
      <div className="space-y-3">
        <ListSummary aside={<SelectionAside />}>{null}</ListSummary>
        <SelectAllRow />
        <ShowMore
          as="ul"
          className="bg-card divide-y rounded-lg border"
          noun="cables"
          items={cables.map((cable) => (
            <li
              key={cable.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <SelectCheckbox item={{ key: cable.id, label: cable.code }} />
                  <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                    {cable.code}
                  </Link>
                </div>
                <p className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
                  {cable.level ? (
                    <>
                      <Link href={levelCablesHref(cable.level)} className={INLINE_LINK}>
                        {CABLE_LEVEL_LABELS[cable.level]}
                      </Link>
                      <span aria-hidden>·</span>
                    </>
                  ) : null}
                  {cable.originEquipment || cable.destinationEquipment ? (
                    <span>
                      de <EquipmentLink equipment={cable.originEquipment} /> a{" "}
                      <EquipmentLink equipment={cable.destinationEquipment} />
                    </span>
                  ) : (
                    <span>{cable.description}</span>
                  )}
                </p>
                {cable.looseEndHere ? (
                  <p className="text-warning text-xs">
                    Punta de {CABLE_END_SIDE_LABELS[cable.looseEndHere].toLowerCase()} suelta aquí
                  </p>
                ) : null}
              </div>
              <CableStatusBadges
                installationStatus={cable.installationStatus}
                connectionStatus={cable.connectionStatus}
                testStatus={cable.testStatus}
              />
            </li>
          ))}
        />
      </div>
    </SelectionProvider>
  );
}
