import { metresText } from "@/features/reels/format";

/**
 * «Quedan 94 m de 504 m» with a bar of what is used. More used than received fills the bar in
 * the warning colour; without the metres received there is no bar.
 */
export function ReelMeter({
  receivedM,
  usedM,
  remainingM,
}: {
  receivedM: number | null;
  usedM: number | null;
  remainingM: number | null;
}) {
  const over = remainingM !== null && remainingM < 0;
  const share =
    receivedM !== null && receivedM > 0 && usedM !== null
      ? Math.min(100, Math.max(0, (usedM / receivedM) * 100))
      : null;
  return (
    <div className="space-y-1">
      <p className="text-sm">
        {remainingM === null ? (
          <span className="text-muted-foreground">Sin metros restantes</span>
        ) : (
          <>
            <span className={`font-semibold tabular-nums ${over ? "text-warning" : ""}`}>
              {over ? `Faltan ${metresText(-remainingM)}` : `Quedan ${metresText(remainingM)}`}
            </span>
            {receivedM !== null ? (
              <span className="text-muted-foreground tabular-nums">
                {" "}
                de {metresText(receivedM)}
              </span>
            ) : null}
          </>
        )}
      </p>
      {share !== null ? (
        <div
          className="bg-muted h-1.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`Usado el ${Math.round(over ? 100 : share)} %`}
        >
          <div
            className={`h-full rounded-full ${over ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${over ? 100 : share}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
