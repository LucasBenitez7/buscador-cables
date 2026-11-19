"use client";

import { cn } from "cn";
import type { ComponentProps, FocusEvent, MouseEvent } from "react";

/** Space left between a revealed chip and the edge of its row. */
const EDGE = 16;

/**
 * How far a row must scroll sideways so that a chip is fully visible, with `EDGE` pixels to
 * spare; 0 when it is already visible. Negative: to the left.
 */
export function chipScrollOffset(
  chip: { left: number; right: number },
  row: { left: number; right: number },
  edge = EDGE,
): number {
  if (chip.left < row.left + edge) return chip.left - row.left - edge;
  if (chip.right > row.right - edge) return chip.right - row.right + edge;
  return 0;
}

/**
 * A row of buttons or links in one line that scrolls sideways when they do not fit (thin bar
 * on a laptop, the finger on a phone). Touching or focusing a chip that is half hidden scrolls
 * the row until it is fully shown.
 */
export function ChipRow({ className, children, ...props }: ComponentProps<"div">) {
  function reveal(event: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) {
    const row = event.currentTarget;
    // Si todo cabe, no hay nada que desplazar.
    if (row.scrollWidth <= row.clientWidth) return;
    const chip = (event.target as Element).closest("a, button");
    if (!chip || !row.contains(chip)) return;
    const offset = chipScrollOffset(chip.getBoundingClientRect(), row.getBoundingClientRect());
    // Solo de lado: no toca el desplazamiento de la página (los enlaces de «Ir a:» bajan solos).
    if (offset !== 0) row.scrollBy({ left: offset, behavior: "smooth" });
  }

  return (
    <div
      {...props}
      onClickCapture={reveal}
      onFocusCapture={reveal}
      className={cn(
        "flex [scrollbar-width:none] flex-nowrap overflow-x-auto sm:[scrollbar-width:thin]",
        className,
      )}
    >
      {children}
    </div>
  );
}
