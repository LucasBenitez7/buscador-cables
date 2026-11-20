"use client";

import { CheckIcon, CopyIcon, PrinterIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

/** One row that can be chosen: `key` identifies it, `label` is what is copied and printed. */
export type SelectionItem = { key: string; label: string };

export type SelectAllResult = { ok: true; items: SelectionItem[] } | { ok: false; message: string };

type SelectionState = {
  selecting: boolean;
  start: () => void;
  isSelected: (key: string) => boolean;
  toggle: (item: SelectionItem) => void;
  /** Whether every row shown now is chosen ("all"), some of them, or none. */
  page: "all" | "some" | "none";
  /** Chooses every row shown now, or takes them all out when they already are. */
  togglePage: () => void;
  /** How many rows are shown now and how many match the filters. */
  shown: number;
  total: number;
  /** How many are chosen, in every page. */
  count: number;
  /** Only in lists with pages: everything that matches the filters can be chosen at once. */
  everything?: {
    checked: boolean;
    loading: boolean;
    error: string | null;
    toggle: () => void;
  };
};

const SelectionContext = createContext<SelectionState | null>(null);

/** Sent when a list starts choosing, so that any other list on the page stops. */
const START_EVENT = "selection:start";

type Props = {
  /** Heading of the printed sheet («Cables», «Bandeja 99UXA…»). */
  title: string;
  /** What this list shows now: the page, or everything when it has no pages. */
  items: SelectionItem[];
  /** How many match the filters, across every page (by default, `items.length`). */
  total?: number;
  /** Brings every item that matches the filters, for lists with pages. */
  selectAll?: () => Promise<SelectAllResult>;
  /** The filters (not the page): when it changes, the choice starts again. */
  resetKey?: string;
  /**
   * More buttons for the bar, before «Copiar» («Guardar», «Mover a…»). They read what is
   * chosen with `useChosen()`.
   */
  actions?: ReactNode;
  children: ReactNode;
};

/** What is chosen, for the extra buttons of the bar. */
export type Chosen = {
  items: SelectionItem[];
  /** Leaves «Seleccionar» (after moving or removing what was chosen). */
  finish: () => void;
  /** Says in the bar how it went («25 cables en «Armario 80BBA»»). */
  notify: (message: string) => void;
};

const ChosenContext = createContext<Chosen | null>(null);

/** What is chosen in the list around, for a button of the bar. */
export function useChosen(): Chosen {
  const chosen = useContext(ChosenContext);
  if (!chosen) throw new Error("useChosen va dentro de las acciones de un SelectionProvider");
  return chosen;
}

/**
 * «Seleccionar» in a list (fase 15): ticks on each row and a bar fixed at the bottom with how
 * many are chosen, «Seleccionar todas», «Copiar» and «Imprimir». What is chosen stays when
 * the page changes and goes when the filters do. Put it around the list's `PendingResults`,
 * never inside: while a page loads the list is replaced and the choice must survive.
 */
export function SelectionProvider({
  title,
  items,
  total = items.length,
  selectAll,
  resetKey = "",
  actions,
  children,
}: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map());
  // Una ficha puede tener varias listas (bandeja: «Esperando aquí» y «Pasan por aquí»): solo
  // una elige a la vez, para que no se apilen dos barras.
  const [id] = useState(() => ({}));
  useEffect(() => {
    const onStart = (event: Event) => {
      if ((event as CustomEvent<object>).detail === id) return;
      setSelecting(false);
      setSelected(new Map());
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [id]);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    // Otros filtros, otra lista: lo elegido antes ya no cumple necesariamente.
    setLastKey(resetKey);
    setSelected(new Map());
  }

  const chosenHere = items.filter((item) => selected.has(item.key)).length;
  const page =
    items.length > 0 && chosenHere === items.length ? "all" : chosenHere > 0 ? "some" : "none";
  const togglePage = () =>
    setSelected((current) => {
      const next = new Map(current);
      if (page === "all") items.forEach((item) => next.delete(item.key));
      else items.forEach((item) => next.set(item.key, item.label));
      return next;
    });

  const [loadingAll, startLoadingAll] = useTransition();
  const [allError, setAllError] = useState<string | null>(null);
  const everything =
    selectAll && total > items.length
      ? {
          checked: selected.size >= total,
          loading: loadingAll,
          error: allError,
          toggle: () => {
            setAllError(null);
            if (selected.size >= total) {
              setSelected(new Map());
              return;
            }
            startLoadingAll(async () => {
              const result = await selectAll();
              if (result.ok) {
                setSelected(new Map(result.items.map((item) => [item.key, item.label])));
              } else {
                setAllError(result.message);
              }
            });
          },
        }
      : undefined;

  const state: SelectionState = {
    selecting,
    page,
    togglePage,
    shown: items.length,
    count: selected.size,
    total,
    everything,
    start: () => {
      window.dispatchEvent(new CustomEvent(START_EVENT, { detail: id }));
      setSelecting(true);
    },
    isSelected: (key) => selected.has(key),
    toggle: (item) =>
      setSelected((current) => {
        const next = new Map(current);
        if (next.has(item.key)) next.delete(item.key);
        else next.set(item.key, item.label);
        return next;
      }),
  };

  return (
    <SelectionContext.Provider value={state}>
      {children}
      {selecting ? (
        <SelectionBar
          title={title}
          selected={selected}
          actions={actions}
          onClose={() => {
            setSelecting(false);
            setSelected(new Map());
          }}
        />
      ) : null}
    </SelectionContext.Provider>
  );
}

/**
 * «Seleccionar» and, once pressed, «Seleccionar todas» in the very same place and size (fase
 * 17): nothing appears or disappears around it, so the list does not jump. It goes on its own
 * line: under the count of a list, or first inside a box of a record, under its title.
 */
export function SelectionControl({ className }: { className?: string }) {
  const context = useContext(SelectionContext);
  // Sin filas no hay nada que elegir.
  if (!context || context.shown === 0) return null;
  if (!context.selecting) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={context.start}
      >
        Seleccionar
      </Button>
    );
  }
  const error = context.everything?.error;
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <label
        className={cn(
          // La misma caja que el botón «Seleccionar» (alto incluido, en el móvil y en el
          // portátil): al cambiar de uno a otro no se mueve nada.
          buttonVariants({ variant: "outline", size: "sm" }),
          "cursor-pointer gap-2",
        )}
      >
        <AllCheckbox context={context} />
        {allLabel(context)}
        {context.everything?.loading
          ? null
          : ` (${(context.everything ? context.total : context.shown).toLocaleString("es-ES")})`}
      </label>
      {error ? (
        <span role="alert" className="text-destructive text-xs font-normal">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The tick of one row, only while choosing. It sits above a card's link (`relative z-10`), so
 * pressing it never opens the card.
 */
export function SelectCheckbox({ item, className }: { item: SelectionItem; className?: string }) {
  const context = useContext(SelectionContext);
  if (!context?.selecting) return null;
  return (
    <input
      type="checkbox"
      checked={context.isSelected(item.key)}
      onChange={() => context.toggle(item)}
      aria-label={`Elegir ${item.label}`}
      className={cn("accent-primary relative z-10 size-5 shrink-0 md:size-4", className)}
    />
  );
}

/**
 * «Seleccionar todas», one single tick (decidido el 2026-11-19): in a list with pages it takes
 * everything that matches the filters, not only the page; otherwise, every row of the list.
 * Empty or ticked, never half ticked: it is ticked only when everything is chosen.
 */
function AllCheckbox({ context, className }: { context: SelectionState; className?: string }) {
  const { everything } = context;
  const checked = everything ? everything.checked : context.page === "all";
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={everything?.loading}
      onChange={everything ? everything.toggle : context.togglePage}
      aria-label={allLabel(context)}
      className={cn("accent-primary size-5 shrink-0 md:size-4", className)}
    />
  );
}

/** The words of «Seleccionar todas», or «Seleccionando…» while every page is asked for. */
function allLabel(context: SelectionState): string {
  if (context.everything?.loading) return "Seleccionando…";
  // Corto en todas partes (fase 17): «Seleccionar todas (N)»; con páginas, N ya dice que son
  // todas las que cumplen los filtros.
  return "Seleccionar todas";
}

/**
 * The header of the column of ticks of a table, only while choosing. Empty: «Seleccionar
 * todas» is `SelectionControl`, above the table, as in every list.
 */
export function SelectHeaderCell() {
  const context = useContext(SelectionContext);
  if (!context?.selecting) return null;
  return (
    <th scope="col" className="w-10 px-3 py-2">
      <span className="sr-only">Elegir</span>
    </th>
  );
}

/** The tick of one table row, in its own cell, only while choosing. */
export function SelectCell({ item }: { item: SelectionItem }) {
  const context = useContext(SelectionContext);
  if (!context?.selecting) return null;
  return (
    <td className="px-3 py-2">
      <SelectCheckbox item={item} className="mt-0.5" />
    </td>
  );
}

type BarProps = {
  title: string;
  selected: Map<string, string>;
  actions?: ReactNode;
  onClose: () => void;
};

function SelectionBar({ title, selected, actions, onClose }: BarProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const count = selected.size;
  const labels = [...selected.values()];

  const copy = async () => {
    setError(null);
    setNotice(null);
    try {
      await navigator.clipboard.writeText(labels.join("\n"));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Inténtalo de nuevo.");
    }
  };

  const print = () => {
    // La hoja tiene que estar en la página antes de abrir el diálogo de impresión.
    flushSync(() => setPrinting(true));
    document.documentElement.classList.add("printing-selection");
    const done = () => {
      document.documentElement.classList.remove("printing-selection");
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  // La barra y su hueco van al final de la página, fuera de la lista o la caja que elige: así
  // ni los márgenes de la página la despegan del borde de abajo ni el hueco cae dentro de una
  // caja.
  return createPortal(
    <>
      {/* Hueco: la barra fija no tapa las últimas filas. */}
      <div aria-hidden className={cn("md:h-20", actions ? "h-48" : "h-32")} />
      <section
        aria-label="Elegidos"
        className="bg-card fixed inset-x-0 bottom-0 z-40 border-t-2 border-t-[color-mix(in_oklch,var(--primary)_45%,var(--card))] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_var(--background)]"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <p role="status" className="font-medium">
              {count === 0
                ? "Ninguno elegido"
                : `${count.toLocaleString("es-ES")} ${count === 1 ? "elegido" : "elegidos"}`}
            </p>
            {notice ? (
              <p aria-live="polite" className="text-success w-full text-xs">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive w-full text-xs">
                {error}
              </p>
            ) : null}
          </div>
          <div className={cn("grid gap-2 md:flex", actions ? "grid-cols-2" : "grid-cols-3")}>
            {actions ? (
              <ChosenContext.Provider
                value={{
                  items: [...selected].map(([key, label]) => ({ key, label })),
                  finish: onClose,
                  notify: (message) => {
                    setError(null);
                    setNotice(message);
                  },
                }}
              >
                {actions}
              </ChosenContext.Provider>
            ) : null}
            <Button type="button" variant="outline" disabled={count === 0} onClick={copy}>
              {copied ? (
                <CheckIcon aria-hidden className="text-success" />
              ) : (
                <CopyIcon aria-hidden />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button type="button" variant="outline" disabled={count === 0} onClick={print}>
              <PrinterIcon aria-hidden />
              Imprimir
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </section>
      {printing ? <PrintSheet title={title} labels={labels} /> : null}
    </>,
    document.body,
  );
}

/**
 * What is printed: the title, the date and the codes, nothing else. Only the print styles
 * show it (`globals.css` → `.printing-selection`).
 */
function PrintSheet({ title, labels }: { title: string; labels: string[] }) {
  const date = new Date().toLocaleDateString("es-ES");
  return (
    <div data-print-sheet>
      <h1>{title}</h1>
      <p>
        {date} · {labels.length.toLocaleString("es-ES")}
      </p>
      <ol>
        {labels.map((label, index) => (
          <li key={`${label}-${index}`}>{label}</li>
        ))}
      </ol>
    </div>
  );
}
