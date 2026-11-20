import type { ReactNode } from "react";

/**
 * The line above a list: how many there are (announced to screen readers) on the left and, when
 * there is one, the «Por página» picker on the right, on one row also on a phone (fase 17: the
 * picker has two sizes at most, so it fits). The page number is only at the bottom, next to the
 * page buttons. The same in every list.
 */
export function ListSummary({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p role="status" className="text-muted-foreground text-sm">
        {children}
      </p>
      {aside}
    </div>
  );
}
