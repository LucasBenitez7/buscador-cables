import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  /** URL of a given page; filters and sort are the caller's business. */
  href: (page: number) => string;
  previousLabel?: string;
  nextLabel?: string;
};

/**
 * Previous / next links with "Página X de Y" between them. Shared by every paginated list so
 * they all look and read the same. Renders nothing when everything fits on one page.
 */
export function Pagination({
  page,
  pageCount,
  href,
  previousLabel = "← Anterior",
  nextLabel = "Siguiente →",
}: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t pt-4 text-sm"
    >
      <div>
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={href(page - 1)} rel="prev">
              {previousLabel}
            </Link>
          </Button>
        ) : null}
      </div>
      <span className="text-muted-foreground text-center whitespace-nowrap">
        Página <span className="text-foreground font-medium tabular-nums">{page}</span> de{" "}
        <span className="text-foreground font-medium tabular-nums">{pageCount}</span>
      </span>
      <div className="flex justify-end">
        {page < pageCount ? (
          <Button asChild variant="outline">
            <Link href={href(page + 1)} rel="next">
              {nextLabel}
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
