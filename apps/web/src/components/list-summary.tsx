import type { ReactNode } from "react";

/**
 * The line above a list: how many there are (announced to screen readers) and, when there is
 * one, the «Por página» picker. On a computer, both on one row (count left, picker right); on a
 * phone, each on its own row, both on the left. The same in every list.
 */
export function ListSummary({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p role="status" className="text-muted-foreground text-sm">
        {children}
      </p>
      {aside}
    </div>
  );
}
