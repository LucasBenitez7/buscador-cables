import Link from "next/link";
import { INLINE_LINK } from "@/lib/links";

/**
 * Above the search when it shows the cables of one reel (fase 17): the reel filter sits under
 * «Más filtros», so without this it would not be clear that the list is only that reel.
 */
export function ReelNotice({
  reel,
  status,
  clearHref,
}: {
  reel: string;
  /** Its state in the Excel («En Sitio»), when it brings one. */
  status: string | null;
  /** The same search without the reel. */
  clearHref: string;
}) {
  return (
    <div
      role="status"
      className="border-primary/45 bg-primary/10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3.5 py-2.5 text-sm"
    >
      <p>
        <span className="text-muted-foreground">Cables de la bobina</span>{" "}
        <span className="font-mono font-semibold">{reel}</span>
        {status ? <span className="text-muted-foreground"> · {status}</span> : null}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/meters?tab=bobinas" className={INLINE_LINK}>
          Ver todas las bobinas
        </Link>
        <Link href={clearHref} className={INLINE_LINK}>
          Quitar filtro
        </Link>
      </p>
    </div>
  );
}
