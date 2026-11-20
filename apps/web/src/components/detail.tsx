import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChipRow } from "./chip-row";
import { Collapsible } from "./collapsible";

/** The code at the top of a record (cable, tray, equipment, location): the same everywhere. */
export const RECORD_TITLE = "font-mono text-xl font-semibold tracking-tight break-all";

/**
 * The code of a record and, right next to it, what can be done with it (`SectionLink`s:
 * «Editar», «Ver en el buscador»). When they do not fit beside the code they go under it.
 */
export function RecordTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h1 className={RECORD_TITLE}>{title}</h1>
      {actions ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">{actions}</div>
      ) : null}
    </div>
  );
}

/** The look of `SectionLink`, also for a button that does the same kind of thing («Guardar»). */
export const SECTION_LINK =
  "text-primary border-primary/50 hover:border-primary focus-visible:ring-ring/50 inline-flex items-center gap-1.5 border-b text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * What can be done with a block or a record ("Ver en el buscador", "Editar"), next to its
 * title: plain text with a line under it, no box, so it does not compete with the title.
 */
export function SectionLink({
  href,
  icon,
  children,
}: {
  href: string;
  /** Before the words, like every action of a record (fase 17): «Editar» with its pencil. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={SECTION_LINK}>
      {icon}
      {children}
    </Link>
  );
}

/**
 * A titled block of a record page (cable, tray). `action` (a `SectionLink` about the whole
 * block) sits right next to the title, and goes under it when it does not fit. `collapsible`
 * blocks fold with a click anywhere on their bar, to get further down the page without
 * scrolling past them; they start open unless `defaultOpen` is false. The drawings are never
 * collapsible: they are what people come for. `id` is
 * the anchor of the quick links at the top of the page; jumping there opens the block.
 */
export function Section({
  title,
  action,
  tools,
  children,
  collapsible = false,
  defaultOpen = true,
  id,
}: {
  title: string;
  action?: ReactNode;
  /** On the right of the bar of a collapsible block, before «Ocultar», only while it is open
   *  («Seleccionar»). */
  tools?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  id?: string;
}) {
  if (collapsible) {
    return (
      // Una sola caja: el título es su cabecera y lo de dentro va debajo, en la misma caja, para
      // que se vea a qué título pertenece. Cerrada, solo queda la cabecera y se acerca a la
      // siguiente.
      <Collapsible
        id={id}
        defaultOpen={defaultOpen}
        className="group/section bg-card scroll-mt-28 overflow-hidden rounded-xl border not-open:mb-3"
      >
        {/* Toda la barra se pulsa, y dice con palabras qué pasa al pulsarla: no hace falta
            saber qué significa una flecha. */}
        <summary className="bg-muted hover:bg-border/70 focus-visible:ring-ring/50 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 transition-colors outline-none select-none group-open/section:border-b focus-visible:ring-3 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {action}
          </span>
          {tools ? (
            <span className="hidden shrink-0 group-open/section:inline-flex">{tools}</span>
          ) : null}
          <span className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium">
            <span className="group-open/section:hidden">Mostrar</span>
            <span className="hidden group-open/section:inline">Ocultar</span>
            <ChevronDownIcon
              aria-hidden
              className="size-4 transition-transform group-open/section:rotate-180"
            />
          </span>
        </summary>
        {/* Las listas de dentro, más oscuras que la caja: se distinguen sin otra caja igual. */}
        <div className="[&_.bg-card]:bg-background space-y-3 p-2 sm:p-3">{children}</div>
      </Collapsible>
    );
  }
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Links to the blocks of a long page ("Tabla de hilos · Hoja original · Historial"), so the
 * people in the field jump straight to what they need. Meant for a few fixed blocks, not for
 * long lists. It always takes one line (what does not fit scrolls sideways): its height is
 * fixed, so the blocks' `scroll-mt-28` keeps their title clear of it and of the header.
 */
export function JumpLinks({ links }: { links: readonly { id: string; label: string }[] }) {
  return (
    // Fija bajo la cabecera mientras se baja por la página: siempre a un toque.
    <ChipRow
      role="navigation"
      aria-label="Ir a"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-30 -mx-4 items-center gap-1.5 border-b px-4 py-2 text-sm whitespace-nowrap backdrop-blur sm:-mx-6 sm:px-6"
    >
      <span className="text-foreground mr-1 shrink-0 text-xs font-medium">Ir a:</span>
      {links.map((link) => (
        <a
          key={link.id}
          href={`#${link.id}`}
          className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-ring/50 shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
        >
          {link.label}
        </a>
      ))}
    </ChipRow>
  );
}

/**
 * A block of labelled values of a record, on a card: one row per value, the name on the left
 * and the value on the right. The optional title goes above the card, not as a row. A block
 * whose values are all empty is not shown.
 */
export function DataList({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 [&:not(:has(dd))]:hidden">
      {title ? <h3 className="text-primary px-1 text-sm font-semibold">{title}</h3> : null}
      <dl className="bg-card divide-border divide-y rounded-lg border text-[15px]">{children}</dl>
    </section>
  );
}

/**
 * One labelled value: the name on the left, the value in bold on the right. A long value
 * wraps on several lines, still on the right; an empty one is not shown at all.
 */
export function Item({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-foreground/85 max-w-[45%] shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  );
}
