import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  CABLE_END_SIDE_LABELS,
  CABLE_LEVEL_LABELS,
  TRAY_KIND_LABELS,
  formatTraySize,
  normalizeTrayCode,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { getTrayDetail, type TrayCable } from "@/server/trays/service";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;

const loadTray = cache((code: string) =>
  getTrayDetail(normalizeTrayCode(decodeURIComponent(code))),
);

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

      <Section title="Datos">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Tamaño">{size}</Item>
          <Item label="Edificio">{tray.building}</Item>
          <Item label="Cables que pasan">{tray.cables}</Item>
        </dl>
        {tray.notes ? <p className="text-sm whitespace-pre-line">{tray.notes}</p> : null}
      </Section>

      <Section title="Planos">
        {tray.drawings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No aparece en los planos cargados.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tray.drawings.map((drawing) => (
              <li key={`${drawing.drawing}-${drawing.sheet}`}>
                <span className="font-mono">{drawing.drawing}</span> · hoja {drawing.sheet}
                {drawing.title ? (
                  <span className="text-muted-foreground"> · {drawing.title}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Cables esperando aquí (${tray.waitingCables.length})`}>
        {tray.waitingCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún cable tiene aquí la punta suelta.</p>
        ) : (
          <CableList cables={tray.waitingCables} />
        )}
      </Section>

      <Section title={`Cables que pasan por aquí (${tray.routeCables.length})`}>
        {tray.routeCables.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún recorrido cargado pasa por aquí.</p>
        ) : (
          <>
            <CableList cables={tray.routeCables} />
            <Button asChild variant="outline">
              <Link href={`/cables?tray=${encodeURIComponent(tray.code)}`}>
                Ver y filtrar en el buscador
              </Link>
            </Button>
          </>
        )}
      </Section>
    </article>
  );
}

function CableList({ cables }: { cables: TrayCable[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {cables.map((cable) => (
        <li
          key={cable.id}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <Link
              href={`/cables/${cable.id}`}
              className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-mono font-medium outline-none focus-visible:ring-3"
            >
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
          />
        </li>
      ))}
    </ul>
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
