import { repage } from "@cables/shared";
import { cn } from "cn";
import Link from "next/link";

type Props = {
  /** Sizes on offer; the first one is the default. */
  sizes: readonly number[];
  /** Size in the URL, if any. */
  size?: number;
  page: number;
  /** URL with that page size and page; filters and sort are the caller's business. */
  href: (size: number, page: number) => string;
};

/**
 * "Por página: 25 · 50 · 100". Links, not a form: the size lives in the URL like everything
 * else. Switching keeps the first item on screen in view by recomputing the page.
 */
export function PageSizePicker({ sizes, size, page, href }: Props) {
  const current = size ?? sizes[0]!;
  return (
    <nav aria-label="Resultados por página" className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Por página</span>
      <ul className="bg-muted/40 flex rounded-lg border p-0.5">
        {sizes.map((option) => {
          const active = option === current;
          return (
            <li key={option}>
              <Link
                href={href(option, repage(page, current, option))}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 block rounded-md px-2.5 py-1 font-medium tabular-nums transition-colors outline-none focus-visible:ring-3",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
