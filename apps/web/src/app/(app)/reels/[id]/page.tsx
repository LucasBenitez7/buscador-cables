import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { REEL_KIND_LABELS, formatExcelDay } from "@cables/shared";
import { DataList, Item, JumpLinks, RecordTitle, Section } from "@/components/detail";
import { ShowMore } from "@/components/show-more";
import { Badge } from "@/components/ui/badge";
import { CODE_LINK } from "@/components/ui/text-link";
import { ReelMeter } from "@/features/reels/components/reel-meter";
import { REEL_STATE_BADGE, metresText, pullsText } from "@/features/reels/format";
import { INLINE_LINK } from "@/lib/links";
import { decodeRouteParam } from "@/lib/route-params";
import { getReel, type ReelDetail } from "@/server/reels/service";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const loadReel = cache(async (id: string) => {
  const decoded = decodeRouteParam(id);
  return decoded === null ? null : whenSignedIn(() => getReel(decoded));
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const detail = await loadReel((await params).id);
  const name = detail ? (detail.reel.tag ?? detail.reel.drum) : null;
  return { title: name ? `Bobina ${name}` : "Bobina" };
}

const day = (value: Date | null) =>
  value ? formatExcelDay(value.toISOString().slice(0, 10)) : null;

/** «Bobina 26» (fase 18): what the reel had, what is left and every pulling taken from it. */
export default async function ReelPage({ params }: { params: Params }) {
  await requireUser();
  const detail = await loadReel((await params).id);
  if (!detail) notFound();
  const { reel, figures, totals } = detail;
  const name = reel.tag ?? reel.drum ?? "";
  const badge = detail.state ? REEL_STATE_BADGE[detail.state] : null;
  // El seguimiento y la hoja de tiradas son dos hojas del mismo Excel: si no cuadran, se dice.
  // Lo que piden las pendientes y no le queda; con los restantes ya negativos, lo dice «Revisar».
  const short =
    figures.pendingM !== null && figures.remainingM !== null && figures.remainingM >= 0
      ? Math.round((figures.pendingM - figures.remainingM) * 100) / 100
      : 0;
  const pullsDiffer =
    reel.tracked &&
    totals.pulls > 0 &&
    (totals.pulls !== figures.pulls || Math.abs(totals.usedM - (figures.usedM ?? 0)) > 1);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link
            href="/reels"
            className="hover:text-foreground focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          >
            Bobinas
          </Link>{" "}
          ›
        </p>
        <RecordTitle title={name} />
        <div className="flex flex-wrap items-center gap-2">
          {reel.request ? <span className="font-medium">{reel.request}</span> : null}
          <Badge variant="outline">{REEL_KIND_LABELS[reel.kind]}</Badge>
          {badge?.variant ? (
            <Badge variant={badge.variant} dot>
              {badge.label}
            </Badge>
          ) : null}
        </div>
        {reel.description ? <p className="text-muted-foreground">{reel.description}</p> : null}
      </header>

      <JumpLinks
        links={[
          { id: "metros", label: "Metros" },
          { id: "tiradas", label: "Tiradas" },
          { id: "pendientes", label: "Pendientes" },
          { id: "datos", label: "Datos" },
        ]}
      />

      <Section title="Metros" id="metros">
        <div className="bg-card space-y-3 rounded-lg border p-4">
          <ReelMeter
            receivedM={figures.receivedM}
            usedM={figures.usedM}
            remainingM={figures.remainingM}
          />
        </div>
        <DataList>
          <Item label="Recibidos">{metresText(figures.receivedM)}</Item>
          <Item label="Usados">{metresText(figures.usedM)}</Item>
          <Item label="Restantes">{metresText(figures.remainingM)}</Item>
          <Item label="Otros consumos">{metresText(reel.otherM)}</Item>
          <Item label="Tiradas hechas">
            {figures.pulls === null ? null : pullsText(figures.pulls)}
          </Item>
          <Item label="Tiradas pendientes">
            {figures.pendingPulls === null ? null : pullsText(figures.pendingPulls)}
          </Item>
          <Item label="Metros para las pendientes">
            {figures.pendingPulls ? metresText(figures.pendingM) : null}
          </Item>
        </DataList>
        <Notes>
          {short > 0 ? (
            <p className="text-warning">
              No llega para las tiradas pendientes: faltan {metresText(short)}.
            </p>
          ) : null}
          {!reel.tracked ? (
            <p>
              No está en el seguimiento del Excel: los metros usados y las tiradas son la suma de
              sus tiradas apuntadas.
            </p>
          ) : null}
          {pullsDiffer ? (
            <p className="text-warning">
              Las tiradas apuntadas en el Excel suman {pullsText(totals.pulls)} y{" "}
              {metresText(totals.usedM)}; su seguimiento dice {pullsText(figures.pulls ?? 0)} y{" "}
              {metresText(figures.usedM ?? 0)}.
            </p>
          ) : null}
          {reel.pieces !== null && reel.pieces > 1 ? (
            <p className="text-warning">
              La lista de almacén tiene {reel.pieces} bobinas con este mismo nombre.
            </p>
          ) : null}
          {detail.sameDrum.length > 0 ? (
            <p>
              Mismo drum que{" "}
              {detail.sameDrum.map((other, index) => (
                <span key={other.id}>
                  {index > 0 ? ", " : ""}
                  <Link href={`/reels/${other.id}`} className={INLINE_LINK}>
                    la {other.tag ?? reel.drum}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : null}
        </Notes>
      </Section>

      <Section title={`Tiradas (${detail.pulls.length})`} collapsible id="tiradas">
        {detail.pulls.length === 0 ? (
          <p className="text-muted-foreground px-1 text-sm">El Excel no apunta tiradas de ella.</p>
        ) : (
          <PullsList pulls={detail.pulls} />
        )}
      </Section>

      <Section title={`Pendientes de tirar (${detail.pending.length})`} collapsible id="pendientes">
        {detail.pending.length === 0 ? (
          <p className="text-muted-foreground px-1 text-sm">
            Ningún cable por tender tiene esta bobina como estimada.
          </p>
        ) : (
          <PendingList pending={detail.pending} drum={reel.drum} />
        )}
      </Section>

      <Section title="Datos de la bobina" collapsible defaultOpen={false} id="datos">
        <DataList>
          <Item label="Número de almacén">{reel.tag}</Item>
          <Item label="Drum">{reel.drum}</Item>
          <Item label="Solicitud">{reel.request}</Item>
          <Item label="Código de ingeniería">{reel.code}</Item>
          <Item label="Tipo de cable">{reel.description}</Item>
          <Item label="Tensión">{reel.voltage}</Item>
          <Item label="Recogida">{day(reel.pickedUpOn)}</Item>
          <Item label="Entrega">{day(reel.deliveredOn)}</Item>
          <Item label="Metros entregados">{metresText(reel.deliveredM)}</Item>
          <Item label="Según el Excel del">{day(reel.excelDate)}</Item>
        </DataList>
      </Section>
    </article>
  );
}

function Notes({ children }: { children: ReactNode }) {
  return <div className="space-y-1 px-1 text-sm empty:hidden">{children}</div>;
}

function CableCell({ cable, code }: { cable: { id: string; code: string } | null; code: string }) {
  return cable ? (
    <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
      {cable.code}
    </Link>
  ) : (
    // Un cable o un tramo que la web no tiene: lo que el buscador encuentra con su código.
    <Link href={`/cables?q=${encodeURIComponent(code)}`} className={CODE_LINK}>
      {code}
    </Link>
  );
}

const LIST = "bg-card divide-y rounded-lg border";
const ROW = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm";

function PullsList({ pulls }: { pulls: ReelDetail["pulls"] }) {
  return (
    <ShowMore
      as="ul"
      className={LIST}
      noun="tiradas"
      label="Tiradas"
      items={pulls.map((pull) => (
        <li key={pull.id} className={ROW}>
          <div className="min-w-0 space-y-0.5">
            <CableCell cable={pull.cable} code={pull.code} />
            <p className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
              <span>{day(pull.pulledOn) ?? "Sin fecha"}</span>
              {pull.conductor && pull.conductor !== pull.code ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{pull.conductor}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="text-right tabular-nums">
            <p className="font-semibold">{metresText(pull.pulledM) ?? "Sin metros"}</p>
            {pull.startM !== null && pull.endM !== null ? (
              <p className="text-muted-foreground text-xs">
                de {metresText(pull.startM)} a {metresText(pull.endM)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    />
  );
}

function PendingList({ pending, drum }: { pending: ReelDetail["pending"]; drum: string | null }) {
  return (
    <ShowMore
      as="ul"
      className={LIST}
      noun="cables"
      label="Pendientes de tirar"
      items={pending.map((item) => (
        <li key={item.cable.id} className={ROW}>
          <div className="min-w-0 space-y-0.5">
            <CableCell cable={item.cable} code={item.cable.code} />
            {item.sharedName ? (
              <p className="text-muted-foreground text-xs">
                Estimada {item.cable.plannedReel}: el drum {drum} está en varios trozos
              </p>
            ) : null}
          </div>
          <p className="text-right tabular-nums">
            <span className="font-semibold">{metresText(item.metres) ?? "Sin metros"}</span>
            {item.pulls > 1 ? (
              <span className="text-muted-foreground block text-xs">{pullsText(item.pulls)}</span>
            ) : null}
          </p>
        </li>
      ))}
    />
  );
}
