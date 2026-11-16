"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
}: {
  items: ReactNode[];
  as?: "ul" | "ol";
  className?: string;
  /** What is listed, in plural: "Ver los 34 cables". */
  noun?: string;
  /** Accessible name of the list, if it has one. */
  label?: string;
}) {
  const [all, setAll] = useState(false);
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
