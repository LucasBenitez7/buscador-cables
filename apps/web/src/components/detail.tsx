import type { ReactNode } from "react";

/**
 * A titled block of a record page (cable, tray). `action` (a button or link about the whole
 * block) sits at the right of the title, where it is seen before the list.
 */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The grid of labelled values of a record, on a card so it reads as one block. */
export function DataList({ children }: { children: ReactNode }) {
  return (
    <dl className="bg-card grid gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  );
}

/**
 * One labelled value of a record's data list. The label is small and muted, the value stands
 * out; a missing value shows a faint dash so the filled ones are easy to spot.
 */
export function Item({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className={empty ? "text-muted-foreground/60" : "font-medium break-words"}>
        {empty ? "—" : children}
      </dd>
    </div>
  );
}
