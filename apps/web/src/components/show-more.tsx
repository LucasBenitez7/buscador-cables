"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Lists longer than this show the first `INITIAL` items and a "Ver los N" button. */
export const SHOW_MORE_LIMIT = 12;
export const SHOW_MORE_INITIAL = 10;

/**
 * A long list cut to its first items, with a button to see them all and to show fewer again,
 * so the rest of the page (drawings, history) is not far below. Short lists show everything.
 * `as` is the list element and `className` its classes, so it keeps the look of the list.
 */
export function ShowMore({
  items,
  as: List = "ul",
  className,
  noun = "elementos",
  label,
  more,
}: {
  items: ReactNode[];
  as?: "ul" | "ol";
  className?: string;
  /** What is listed, in plural: "Ver los 34 cables". */
  noun?: string;
  /** Accessible name of the list, if it has one. */
  label?: string;
  /**
   * When `items` are only the first of a longer list (a location's 315 cables): how many there
   * are and where to see them all. The button then takes there, with the real number, instead
   * of opening only the ones brought.
   */
  more?: { total: number; href: string };
}) {
  const [all, setAll] = useState(false);
  if (more && more.total > items.length) {
    return (
      <div className="space-y-2">
        <List aria-label={label} className={className}>
          {items.slice(0, SHOW_MORE_INITIAL)}
        </List>
        <Link href={more.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Ver los {more.total.toLocaleString("es-ES")} {noun} en el buscador →
        </Link>
      </div>
    );
  }
  const cut = items.length > SHOW_MORE_LIMIT && !all;
  return (
    <div className="space-y-2">
      <List aria-label={label} className={className}>
        {cut ? items.slice(0, SHOW_MORE_INITIAL) : items}
      </List>
      {items.length > SHOW_MORE_LIMIT ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setAll((value) => !value)}>
          {all
            ? "Ver menos"
            : `Ver los ${items.length} ${noun} (faltan ${items.length - SHOW_MORE_INITIAL})`}
        </Button>
      ) : null}
    </div>
  );
}
