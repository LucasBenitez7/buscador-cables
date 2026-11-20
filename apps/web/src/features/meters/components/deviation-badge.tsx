import {
  DEVIATION_LEVEL_LABELS,
  deviationLevel,
  lengthDeviation,
  percentText,
  signedMetresText,
  type DeviationLevel,
} from "@cables/shared";
import { Badge } from "@/components/ui/badge";

const LEVEL_VARIANT: Record<DeviationLevel, "success" | "warning" | "destructive"> = {
  ok: "success",
  warning: "warning",
  review: "destructive",
};

/**
 * How far the real metres are from the list (fase 17): the percent, coloured by how serious it
 * is, and the metres on hover. With `withMetres`, the metres are written after it too.
 */
export function DeviationBadge({
  planned,
  actual,
  withMetres = false,
}: {
  planned: number | null;
  actual: number | null;
  withMetres?: boolean;
}) {
  const deviation = lengthDeviation(planned, actual);
  if (!deviation) return <span className="text-muted-foreground">—</span>;
  const level = deviationLevel(deviation.percent);
  const metres = signedMetresText(deviation.metres);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <Badge
        dot
        variant={LEVEL_VARIANT[level]}
        title={`${DEVIATION_LEVEL_LABELS[level]}: ${metres}`}
        className="tabular-nums"
      >
        {percentText(deviation.percent)}
      </Badge>
      {withMetres ? (
        <span className="text-muted-foreground text-sm">
          {metres} · {DEVIATION_LEVEL_LABELS[level].toLowerCase()}
        </span>
      ) : null}
    </span>
  );
}
