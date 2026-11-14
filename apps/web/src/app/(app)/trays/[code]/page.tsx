import type { Metadata } from "next";
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
import { DataList, Item, Section } from "@/components/detail";
import { Button } from "@/components/ui/button";
import { CODE_LINK } from "@/components/ui/text-link";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { TrayDrawings } from "@/features/drawings/components/tray-drawings";
import { getTrayDetail, type TrayCable } from "@/server/trays/service";
import { decodeRouteParam } from "@/lib/route-params";
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
    <article className="space-y-8">
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
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{tray.code}</h1>
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

      <Section
        title={`Plano${tray.drawings.length > 1 ? `s (${tray.drawings.length} hojas)` : ""}`}
      >
        {tray.drawings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No aparece en los planos cargados.</p>
        ) : (
          <TrayDrawings code={tray.code} sheets={tray.drawings} />
        )}
      </Section>

      <Section title="Datos">
        <DataList>
          <Item label="Tamaño">{size}</Item>
          <Item label="Edificio">{tray.building}</Item>
          <Item label="Cables que pasan">{tray.cables}</Item>
        </DataList>
        {tray.notes ? <p className="text-sm whitespace-pre-line">{tray.notes}</p> : null}
      </Section>

      <Section title={`Cables esperando aquí (${tray.waitingCables.length})`}>
        {tray.waitingCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún cable tiene aquí la punta suelta.</p>
        ) : (
          <CableList cables={tray.waitingCables} />
        )}
      </Section>

      <Section
        title={`Cables que pasan por aquí (${tray.routeCables.length})`}
        action={
          tray.routeCables.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/cables?tray=${encodeURIComponent(tray.code)}`}>
                Ver y filtrar en el buscador
              </Link>
            </Button>
          ) : null
        }
      >
        {tray.routeCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún recorrido cargado pasa por aquí.</p>
        ) : (
          <CableList cables={tray.routeCables} />
        )}
      </Section>
    </article>
  );
}

function CableList({ cables }: { cables: TrayCable[] }) {
  return (
    <ul className="bg-card divide-y rounded-lg border">
      {cables.map((cable) => (
        <li
          key={cable.id}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
              {cable.code}
            </Link>
            <p className="text-muted-foreground text-xs">
              {[
                cable.level ? CABLE_LEVEL_LABELS[cable.level] : null,
                cable.originEquipment || cable.destinationEquipment
                  ? `${cable.originEquipment ?? "—"} → ${cable.destinationEquipment ?? "—"}`
                  : cable.description,
              ]
                .filter(Boolean)
                .join(" · ")}
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
    </ul>
  );
}
