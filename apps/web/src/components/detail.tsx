import type { ReactNode } from "react";

/** A titled block of a record page (cable, tray). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** One labelled value of a record's data list; shows a dash when there is no value. */
export function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}
