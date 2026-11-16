"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A `<details>` that opens when "Ir a" jumps to it (`#id` in the URL), so a folded section is
 * never a dead end. It does not remember being folded: every page starts as `defaultOpen`.
 */
export function Collapsible({
  id,
  defaultOpen,
  className,
  children,
}: {
  id?: string;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!id) return;
    const openOnJump = () => {
      if (window.location.hash === `#${id}` && ref.current) ref.current.open = true;
    };
    openOnJump();
    window.addEventListener("hashchange", openOnJump);
    return () => window.removeEventListener("hashchange", openOnJump);
  }, [id]);

  return (
    <details ref={ref} id={id} open={defaultOpen} className={className}>
      {children}
    </details>
  );
}
