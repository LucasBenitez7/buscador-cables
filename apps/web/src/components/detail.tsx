import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Collapsible } from "./collapsible";

/**
 * A titled block of a record page (cable, tray). `action` (a button or link about the whole
 * block) sits at the right of the title, where it is seen before the list. `collapsible`
 * blocks (long tables, drawings) fold with a click on their title, to get further down the
 * page without scrolling past them; they start open unless `defaultOpen` is false. `id` is
 * the anchor of the quick links at the top of the page; jumping there opens the block.
 */
export function Section({
  title,
  action,
  children,
  collapsible = false,
  defaultOpen = true,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  id?: string;
}) {
  if (collapsible) {
    return (
      <Collapsible
        id={id}
        defaultOpen={defaultOpen}
        className="group/section scroll-mt-20 space-y-3"
      >
        <summary className="hover:text-primary focus-visible:ring-ring/50 flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-sm border-b pb-2 outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ChevronDownIcon
              aria-hidden
              className="text-muted-foreground size-4 -rotate-90 transition-transform group-open/section:rotate-0"
            />
            {title}
          </h2>
          <span className="text-muted-foreground text-xs group-open/section:hidden">
            Plegado · pulsa para verlo
          </span>
          {action ? <span className="hidden group-open/section:inline">{action}</span> : null}
        </summary>
        <div className="space-y-3">{children}</div>
      </Collapsible>
    );
  }
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Links to the blocks of a long page ("Tabla de hilos · Hoja original · Historial"), so the
 * people in the field jump straight to what they need.
 */
export function JumpLinks({ links }: { links: readonly { id: string; label: string }[] }) {
  return (
    // Fija bajo la cabecera mientras se baja por la página: siempre a un toque.
    <nav
      aria-label="Ir a"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-1.5 border-b px-4 py-2 text-sm backdrop-blur sm:-mx-6 sm:px-6"
    >
      <span className="text-muted-foreground mr-1 text-xs">Ir a:</span>
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className="bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
        >
          {link.label}
        </a>
      ))}
    </nav>
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
