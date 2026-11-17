"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import {
  createContext,
  useContext,
  useTransition,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { BrandLoader } from "@/components/loading";
import { startNavigationProgress } from "@/components/navigation-progress";
import { cn } from "cn";

type NavigateOptions = { scroll?: boolean };
type PendingState = {
  navigate: (href: string, options?: NavigateOptions) => void;
  pending: boolean;
};

/** Exportado solo para los tests: en la app se usa `PendingListProvider`. */
export const PendingListContext = createContext<PendingState | null>(null);

/**
 * Une un formulario de filtros con su lista: mientras navega (cambia el filtro, el orden o la
 * página), la lista muestra «Cargando…» en vez de quedarse quieta y la gente no pulsa varias veces.
 */
export function PendingListProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string, options?: NavigateOptions) => {
    startNavigationProgress();
    startTransition(() => {
      router.push(href, { scroll: options?.scroll ?? true });
    });
  };
  return (
    <PendingListContext.Provider value={{ navigate, pending }}>
      {children}
    </PendingListContext.Provider>
  );
}

/**
 * `navigate(href, { scroll })` dentro de la transición del provider, y `pending` mientras
 * llega la página nueva. Fuera de un provider navega con `router.push` normal y `pending` es
 * false, así que nada se rompe si falta.
 */
export function usePendingNavigation(): PendingState {
  const router = useRouter();
  const context = useContext(PendingListContext);
  if (context) return context;
  return {
    navigate: (href, options) => {
      startNavigationProgress();
      if (options) router.push(href, { scroll: options.scroll ?? true });
      else router.push(href);
    },
    pending: false,
  };
}

/** Los resultados de la lista. Con una navegación en curso, en su lugar se ve «Cargando…». */
export function PendingResults({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(PendingListContext);
  if (context?.pending) {
    return (
      <div aria-busy="true" className={cn("flex min-h-40 items-center justify-center", className)}>
        <BrandLoader label="Cargando…" />
      </div>
    );
  }
  return <div className={className}>{children}</div>;
}

/** Texto de un botón de enviar: el suyo, o «Cargando…» con un giro mientras navega. */
export function SubmitLabel({ pending, idle }: { pending: boolean; idle: string }) {
  if (!pending) return idle;
  return (
    <>
      <Loader2Icon aria-hidden className="motion-safe:animate-spin" />
      Cargando…
    </>
  );
}

/** Como `next/link`, pero navega con la transición del provider (paginación, tamaño de página, orden). */
export function PendingLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const context = useContext(PendingListContext);
  return (
    <Link
      {...props}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        // Ctrl/cmd/shift, clic central o `target`: el navegador se encarga, como siempre.
        if (!context || event.defaultPrevented || isModifiedClick(event, props.target)) return;
        event.preventDefault();
        // Mismo `scroll` que pediría el Link (p. ej. `scroll={false}` en una sección).
        context.navigate(href, { scroll: props.scroll !== false });
      }}
    />
  );
}

function isModifiedClick(event: MouseEvent, target: string | undefined) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (target !== undefined && target !== "_self")
  );
}
