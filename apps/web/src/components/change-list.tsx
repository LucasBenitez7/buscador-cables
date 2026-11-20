import Link from "next/link";
import type { ReactNode } from "react";
import { SELF_EXPLAINED_CHANGE_LABELS } from "@cables/shared";

type Change = { field: string; from: string; to: string; fromHref?: string; toHref?: string };

const VALUE_LINK =
  "focus-visible:ring-ring/50 rounded-sm underline underline-offset-2 outline-none hover:text-primary focus-visible:ring-3";

function Value({ href, children }: { href?: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={VALUE_LINK}>
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

/**
 * What an event changed, one row per field: "Longitud (m)  120 → 125". The states go without
 * their field name: "Sin timbrar → Timbrado" already says it.
 * Trays and locations are links to their page.
 */
export function ChangeList({ changes }: { changes: readonly Change[] }) {
  if (changes.length === 0) return null;
  return (
    <dl className="bg-muted/40 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md px-3 py-2 text-xs sm:grid-cols-[auto_1fr]">
      {changes.map((change) => (
        <div key={change.field} className="contents">
          {/* Los estados se explican solos: sin su nombre a la vista (sí para los lectores). */}
          <dt
            className={
              SELF_EXPLAINED_CHANGE_LABELS.has(change.field) ? "sr-only" : "text-muted-foreground"
            }
          >
            {change.field}
          </dt>
          <dd
            className={
              SELF_EXPLAINED_CHANGE_LABELS.has(change.field)
                ? "break-words sm:col-span-2"
                : "break-words"
            }
          >
            <span className="text-muted-foreground">
              <Value href={change.fromHref}>{change.from}</Value>
            </span>{" "}
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <span className="sr-only">a</span>{" "}
            <span className="text-foreground font-medium">
              <Value href={change.toHref}>{change.to}</Value>
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
