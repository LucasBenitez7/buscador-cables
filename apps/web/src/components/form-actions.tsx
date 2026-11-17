"use client";

import { PendingLink, SubmitLabel } from "@/components/pending-list";
import { Button } from "@/components/ui/button";

type Props = {
  /** «Buscar» when the form has a text box, «Aplicar» when it only has filters. */
  submitLabel: "Buscar" | "Aplicar";
  /** A navigation is on its way: the submit button shows «Cargando…». */
  pending: boolean;
  /** Where «Limpiar» goes: the list without any search or filter. */
  clearHref: string;
  /** Something is searched or filtered. Without it «Limpiar» has nothing to do and is off. */
  active: boolean;
};

/**
 * The buttons that close every search and filter form, the same everywhere: the submit button
 * and «Limpiar» next to it, on the left. «Limpiar» is greyed out (not a lock cursor, it simply
 * does nothing) until there is something to clear.
 */
export function FormActions({ submitLabel, pending, clearHref, active }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={pending}>
        <SubmitLabel pending={pending} idle={submitLabel} />
      </Button>
      {active ? (
        <Button asChild type="button" variant="ghost">
          <PendingLink href={clearHref}>Limpiar</PendingLink>
        </Button>
      ) : (
        // `disabled` también quita el puntero (pointer-events-none): se ve la flecha normal.
        <Button type="button" variant="ghost" disabled>
          Limpiar
        </Button>
      )}
    </div>
  );
}
