"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

/** Time to cross from the button to the menu (or leave by mistake) before it closes. */
const CLOSE_DELAY_MS = 150;

const isMouse = (event: PointerEvent) => event.pointerType === "mouse";

/**
 * Props for a Radix dropdown that also opens when the mouse rests on its button, as in a desktop
 * menu bar. Touch and keyboard keep the usual behaviour (tap or Enter to open). `modal: false`
 * so the page under the open menu still gets the pointer and the menu can close on leave.
 */
export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const cancelClose = useCallback(() => window.clearTimeout(timer.current), []);
  useEffect(() => cancelClose, [cancelClose]);

  const enter = useCallback(
    (event: PointerEvent) => {
      if (!isMouse(event)) return;
      cancelClose();
      setOpen(true);
    },
    [cancelClose],
  );
  const leave = useCallback(
    (event: PointerEvent) => {
      if (!isMouse(event)) return;
      cancelClose();
      timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    },
    [cancelClose],
  );

  return {
    root: { open, onOpenChange: setOpen, modal: false },
    trigger: {
      onPointerEnter: enter,
      onPointerLeave: leave,
      // Ya abierto por el hover: el clic no lo cierra (Radix lo alternaría).
      onPointerDown: (event: PointerEvent) => {
        if (isMouse(event) && open) event.preventDefault();
      },
    },
    content: { onPointerEnter: enter, onPointerLeave: leave },
  };
}
