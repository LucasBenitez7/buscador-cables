import Link from "next/link";
import {
  CABLE_END_SIDE_LABELS,
  ROUTE_SECTION_LABELS,
  routeProgress,
  type CableEndSide,
  type RouteStepProgress,
} from "@cables/shared";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { CableDetail, CableEndDetail } from "@/server/cables/detail";

export const trayHref = (code: string) => `/trays/${encodeURIComponent(code)}`;

const looseEndText = (end: CableEndSide) =>
  end === "ORIGIN" ? "la punta de origen" : "la punta de destino";

/** Both ends of the cable as the project lists give them: equipment first, it is what people look for. */
export function CableEnds({ ends, state }: Pick<CableDetail, "ends" | "state">) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["ORIGIN", "DESTINATION"] as const).map((side) => (
        <EndCard
          key={side}
          side={side}
          end={side === "ORIGIN" ? ends.origin : ends.destination}
          looseTray={state.looseEnd === side ? state.looseEndTray : null}
        />
      ))}
    </div>
  );
}

function EndCard({
  side,
  end,
  looseTray,
}: {
  side: CableEndSide;
  end: CableEndDetail;
  looseTray: string | null;
}) {
  // [label, value, is a code]: codes in monospace; the location route reads as text.
  const rows: [string, string | null, boolean][] = [
    ["Cubículo", end.cubicle, true],
    ["Prensaestopas", end.gland, true],
    ["KKS de función", end.functionKks, true],
    ["KKS de instalación", end.installationKks, true],
    ["Sala", end.location ?? end.room, !end.location],
  ];
  return (
    <section
      aria-label={CABLE_END_SIDE_LABELS[side]}
      className={cn("space-y-2 rounded-lg border p-3", looseTray && "border-warning/50")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-xs">{CABLE_END_SIDE_LABELS[side]}</h3>
        {looseTray ? (
          <Badge variant="warning">
            {/* A non-breaking space: the badge is a flex box, where a plain space is dropped. */}
            Punta suelta en&nbsp;
            <Link
              href={trayHref(looseTray)}
              className="font-mono underline-offset-2 hover:underline"
            >
              {looseTray}
            </Link>
          </Badge>
        ) : null}
      </div>
      <p className="font-mono text-base font-medium">{end.equipment ?? "Equipo sin indicar"}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        {rows
          .filter(([, value]) => value)
          .map(([label, value, code]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={code ? "font-mono break-all" : "break-words"}>{value}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

const PROGRESS_LABELS: Record<RouteStepProgress, string> = {
  laid: "Tendido",
  pending: "Falta",
  unknown: "",
};

/**
 * The planned route, tray by tray. On a partially laid cable it shows how far it got: the
 * steps already laid, the tray where the loose end waits and what is missing.
 */
export function CableRoute({ route, state }: Pick<CableDetail, "route" | "state">) {
  if (route.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        El listado no da bandejas para este cable (cable local, de suministro externo o pendiente).
      </p>
    );
  }
  const { steps, looseIndex } = routeProgress(route, state);
  const looseStep = looseIndex === null ? null : route[looseIndex];

  return (
    <div className="space-y-3">
      {looseStep && state.looseEnd ? (
        <p className="text-sm">
          Tendido hasta la bandeja <span className="font-mono">{looseStep.trayCode}</span>, donde
          espera {looseEndText(state.looseEnd)}. Faltan{" "}
          {steps.filter((step) => step === "pending").length} tramos.
        </p>
      ) : null}
      <ol aria-label="Tramos del recorrido" className="space-y-1 text-sm">
        {route.map((step, index) => {
          const progress = steps[index]!;
          const newSection = step.section && step.section !== route[index - 1]?.section;
          return (
            <li key={step.position} className="space-y-1">
              {newSection ? (
                <p className="text-muted-foreground pt-1 text-xs tracking-wide uppercase">
                  {ROUTE_SECTION_LABELS[step.section!]}
                </p>
              ) : null}
              <div
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1",
                  index === looseIndex && "bg-warning/10",
                )}
                data-progress={progress}
              >
                <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                  {step.position}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-full border",
                    progress === "laid" && "bg-success border-success",
                    progress === "pending" && "border-muted-foreground border-dashed",
                    progress === "unknown" && "bg-border border-border",
                  )}
                />
                {step.trayCode ? (
                  <Link
                    href={trayHref(step.trayCode)}
                    className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-mono underline-offset-4 outline-none hover:underline focus-visible:ring-3"
                  >
                    {step.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground italic">{step.label}</span>
                )}
                {PROGRESS_LABELS[progress] ? (
                  <span className="sr-only">· {PROGRESS_LABELS[progress]}</span>
                ) : null}
                {index === looseIndex && state.looseEnd ? (
                  <Badge variant="warning">Aquí espera {looseEndText(state.looseEnd)}</Badge>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
