import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CABLE_ACTION_LABELS,
  WIRING_END_LABELS,
  endOfField,
  type WiringChangeEntry,
} from "@cables/shared";
import { ChangeList } from "@/components/change-list";
import { Section } from "@/components/detail";
import { Badge } from "@/components/ui/badge";
import { CODE_LINK } from "@/components/ui/text-link";
import { actionVariant } from "@/features/activity/components/activity-list";
import { INLINE_LINK } from "@/lib/links";
import { getActivityEvent } from "@/server/activity/service";
import { getCurrentUser, requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

const loadEvent = cache(async (id: string) => {
  const viewer = await getCurrentUser();
  return viewer ? getActivityEvent(id, viewer) : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const event = await loadEvent((await params).id);
  return {
    title: event ? `${CABLE_ACTION_LABELS[event.action]} · ${event.cable.code}` : "Movimiento",
  };
}

/** "Regletero" / "Borna" of a cell: the end goes in its own column. */
const cellLabel = (change: WiringChangeEntry) =>
  change.field.endsWith("Block") ? "Regletero" : "Borna";

/**
 * One movement with everything it changed. The activity lists sum up long changes in one
 * line (a technician who corrected twenty terminals); here they are all, wire by wire.
 */
export default async function ActivityEventPage({ params }: { params: Params }) {
  await requireUser();
  const event = await loadEvent((await params).id);
  if (!event) notFound();

  const wiresTouched = new Set(event.wiring.map((change) => change.position)).size;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href={`/cables/${event.cable.id}`} className={INLINE_LINK}>
            Cable {event.cable.code}
          </Link>{" "}
          › Movimiento
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge dot variant={actionVariant(event)}>
            {CABLE_ACTION_LABELS[event.action]}
          </Badge>
          <Link href={`/cables/${event.cable.id}`} className={`${CODE_LINK} text-xl`}>
            {event.cable.code}
          </Link>
        </div>
        <p>
          <span className="font-medium">{event.user}</span> {event.summary}.
        </p>
        <p className="text-muted-foreground text-sm">
          <time dateTime={event.at.toISOString()}>{dateFormat.format(event.at)}</time>
        </p>
        {event.notes ? (
          <blockquote className="border-muted-foreground/40 text-muted-foreground border-l-2 pl-3 italic">
            “{event.notes}”
          </blockquote>
        ) : null}
      </header>

      {event.wiring.length > 0 ? (
        <Section
          title={`Bornas corregidas (${wiresTouched} ${wiresTouched === 1 ? "hilo" : "hilos"})`}
          action={
            <Link href={`/cables/${event.cable.id}?vista=conexionado`} className={INLINE_LINK}>
              Ver el conexionado actual
            </Link>
          }
        >
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Celdas cambiadas, con su valor antes y después</caption>
              <thead className="border-b">
                <tr className="text-muted-foreground text-left text-xs">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Hilo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Punta
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Qué
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Antes
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Después
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {event.wiring.map((change) => (
                  <tr key={`${change.position}.${change.field}`}>
                    <th scope="row" className="px-3 py-2 text-left font-mono font-semibold">
                      {change.wire}
                    </th>
                    <td className="px-3 py-2">{WIRING_END_LABELS[endOfField(change.field)]}</td>
                    <td className="px-3 py-2">{cellLabel(change)}</td>
                    <td className="text-muted-foreground px-3 py-2 font-mono line-through">
                      {change.from ?? "vacío"}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">{change.to ?? "vacío"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {event.changes.length > 0 ? (
        <Section title="Cambios">
          <ChangeList changes={event.changes} />
        </Section>
      ) : null}
    </article>
  );
}
