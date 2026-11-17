"use client";

import { cn } from "cn";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Below this, the page came fast enough: no bar, so it does not flicker. */
const SHOW_DELAY_MS = 120;
/** A navigation that never ends (offline, an error) does not leave the bar forever. */
const GIVE_UP_MS = 20_000;

const listeners = new Set<() => void>();

/**
 * Starts the bar from code that navigates without a link (`router.push` of the filter forms).
 * Links start it on their own.
 */
export function startNavigationProgress() {
  for (const listener of listeners) listener();
}

/** A click that the app will turn into a navigation to another page (not a new tab, not `#`). */
export function isNavigationClick(event: MouseEvent, location: Location): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return false;
  // Solo cambia el `#`: el navegador salta dentro de la misma página, no hay nada que esperar.
  return url.pathname !== location.pathname || url.search !== location.search;
}

type Phase = "idle" | "waiting" | "running" | "done";

/**
 * A thin bar at the top that starts the moment a link is pressed and ends when the new page is
 * on screen, so the app never looks frozen while the server answers (slow connection, a heavy
 * page). Every page gets it; pages with their own «Cargando…» keep it too.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  // Arrancar: con un clic en un enlace o desde `startNavigationProgress()`.
  useEffect(() => {
    const start = () => {
      clearTimers();
      setPhase("waiting");
      setWidth(0);
      timers.current.push(
        window.setTimeout(() => {
          setPhase("running");
          setWidth(15);
        }, SHOW_DELAY_MS),
        window.setTimeout(() => setPhase("idle"), GIVE_UP_MS),
      );
    };
    const onClick = (event: MouseEvent) => {
      if (isNavigationClick(event, window.location)) start();
    };
    listeners.add(start);
    document.addEventListener("click", onClick, true);
    return () => {
      listeners.delete(start);
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // Mientras espera, avanza cada vez más despacio sin llegar al final.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(
      () => setWidth((value) => (value < 90 ? value + (90 - value) * 0.1 : value)),
      300,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  // Terminar: la dirección ya es la de la página nueva.
  const url = `${pathname}?${searchParams.toString()}`;
  const previousUrl = useRef(url);
  useEffect(() => {
    if (previousUrl.current === url) return;
    previousUrl.current = url;
    clearTimers();
    setPhase((current) => {
      if (current !== "running") return "idle";
      setWidth(100);
      timers.current.push(window.setTimeout(() => setPhase("idle"), 250));
      return "done";
    });
  }, [url]);

  const visible = phase === "running" || phase === "done";
  return (
    <div
      aria-hidden
      data-testid="navigation-progress"
      data-phase={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        className={cn(
          "bg-primary h-full shadow-[0_0_8px_var(--color-primary)] transition-[width,opacity] duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ width: `${visible ? width : 0}%` }}
      />
    </div>
  );
}
