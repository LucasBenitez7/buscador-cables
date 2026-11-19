"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { TRAY_KIND_LABELS } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CODE_LINK, TEXT_LINK_SM } from "@/components/ui/text-link";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { equipmentHref, locationHref } from "@/lib/links";
import type { QuickSearchResults } from "@/server/search/quick";

/** The same as `QUICK_SEARCH_LIMIT` on the server (a client file cannot import it from there). */
const QUICK_SEARCH_LIMIT = 5;

/** Wait this long after the last key before asking: one request per pause, not per letter. */
const DEBOUNCE_MS = 250;
const MIN_LENGTH = 2;

async function fetchResults(query: string, signal?: AbortSignal): Promise<QuickSearchResults> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`Búsqueda: ${response.status}`);
  return (await response.json()) as QuickSearchResults;
}

/**
 * Where «Buscar» (or Enter) takes the user: straight to the record when the text is exactly
 * one code; otherwise to the list of the first kind that has results.
 */
export function destinationOf(query: string, results: QuickSearchResults | null): string {
  const q = encodeURIComponent(query);
  if (!results) return `/cables?q=${q}`;
  if (results.exact) return results.exact;
  if (results.cablesTotal > 0) return `/cables?q=${q}`;
  if (results.traysTotal > 0) return `/trays?q=${q}`;
  if (results.equipment.length > 0) return `/equipment?q=${q}`;
  if (results.locations.length > 0) return locationHref(results.locations[0]!.id);
  return `/cables?q=${q}`;
}

/**
 * One box to find anything: cables, trays, equipment and locations. While typing it shows a
 * few of each kind, grouped; «Buscar» goes straight to the record when the text is a code.
 * Without JavaScript it is a plain form to the cable search.
 */
export function QuickSearch() {
  const router = useRouter();
  const inputId = useId();
  const [query, setQuery] = useState("");
  // Cada respuesta va con el texto que la pidió: solo se enseña la del texto actual, así una
  // respuesta lenta de un texto anterior nunca pisa a la buena.
  const [found, setFound] = useState<{ query: string; results: QuickSearchResults } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const text = query.trim();
  const results = found?.query === text ? found.results : null;
  const status = failed === text ? "error" : "idle";
  useEffect(() => {
    if (text.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchResults(text, controller.signal)
        .then((next) => setFound({ query: text, results: next }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setFailed(text);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text) return;
    // Al pulsar Intro antes de que lleguen las sugerencias, se pregunta en ese momento.
    const known =
      results ?? (text.length >= MIN_LENGTH ? await fetchResults(text).catch(() => null) : null);
    router.push(destinationOf(text, known));
  }

  const total = results
    ? results.cablesTotal + results.traysTotal + results.equipment.length + results.locations.length
    : 0;

  return (
    <section aria-label="Búsqueda" className="bg-card space-y-3 rounded-lg border p-4">
      <form action="/cables" method="get" role="search" aria-label="Buscar" onSubmit={submit}>
        <label htmlFor={inputId} className="mb-2 block text-base font-semibold">
          Buscar
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cable, bandeja, equipo o ubicación"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 text-base md:h-11"
          />
          <Button type="submit" className="h-12 px-4 text-base md:h-11">
            <SearchIcon aria-hidden />
            Buscar
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="space-y-4">
        {text.length >= MIN_LENGTH ? (
          status === "error" ? (
            <p className="text-destructive text-sm">
              No se pudo buscar. Pulsa «Buscar» para ir a la búsqueda de cables.
            </p>
          ) : !results ? (
            <p className="text-muted-foreground text-sm">Buscando…</p>
          ) : total === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nada coincide con «{text}». Prueba con otra parte del código.
            </p>
          ) : (
            <ResultGroups query={text} results={results} />
          )
        ) : null}
      </div>
    </section>
  );
}

function ResultGroups({ query, results }: { query: string; results: QuickSearchResults }) {
  const q = encodeURIComponent(query);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {results.cables.length > 0 ? (
        <Group
          title={results.cablesFuzzy ? "Cables con código parecido" : "Cables"}
          total={results.cablesTotal}
          more={
            results.cablesTotal > results.cables.length
              ? { href: `/cables?q=${q}`, label: `Ver los ${results.cablesTotal} cables` }
              : undefined
          }
        >
          {results.cables.map((cable) => (
            <li key={cable.id} className="space-y-1 px-3 py-2">
              <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                {cable.code}
              </Link>
              {cable.description ? (
                <p className="text-muted-foreground truncate text-xs">{cable.description}</p>
              ) : null}
              <CableStatusBadges
                installationStatus={cable.installationStatus}
                connectionStatus={cable.connectionStatus}
              />
            </li>
          ))}
        </Group>
      ) : null}
      {results.trays.length > 0 ? (
        <Group
          title="Bandejas"
          total={results.traysTotal}
          more={
            results.traysTotal > results.trays.length
              ? { href: `/trays?q=${q}`, label: `Ver las ${results.traysTotal} bandejas` }
              : undefined
          }
        >
          {results.trays.map((tray) => (
            <li key={tray.code} className="space-y-0.5 px-3 py-2">
              <Link href={`/trays/${encodeURIComponent(tray.code)}`} className={CODE_LINK}>
                {tray.code}
              </Link>
              <p className="text-muted-foreground text-xs">
                {[TRAY_KIND_LABELS[tray.kind], tray.building].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </Group>
      ) : null}
      {results.equipment.length > 0 ? (
        <Group
          title="Equipos"
          total={results.equipment.length}
          more={
            results.equipment.length >= QUICK_SEARCH_LIMIT
              ? { href: `/equipment?q=${q}`, label: "Ver todos los equipos" }
              : undefined
          }
        >
          {results.equipment.map((item) => (
            <li
              key={item.equipment}
              className="flex items-baseline justify-between gap-3 px-3 py-2"
            >
              <Link href={equipmentHref(item.equipment)} className={CODE_LINK}>
                {item.equipment}
              </Link>
              <span className="text-muted-foreground text-xs">
                {item.cables} {item.cables === 1 ? "cable" : "cables"}
              </span>
            </li>
          ))}
        </Group>
      ) : null}
      {results.locations.length > 0 ? (
        <Group title="Ubicaciones" total={results.locations.length}>
          {results.locations.map((location) => (
            <li key={location.id} className="space-y-0.5 px-3 py-2">
              <Link href={locationHref(location.id)} className={CODE_LINK}>
                {location.name}
              </Link>
              <p className="text-muted-foreground font-mono text-xs">{location.code}</p>
            </li>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

function Group({
  title,
  total,
  more,
  children,
}: {
  title: string;
  total: number;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title} ({total})
      </h3>
      <ul className="bg-background divide-y rounded-lg border text-sm">{children}</ul>
      {more ? (
        <Link href={more.href} className={TEXT_LINK_SM}>
          {more.label}
        </Link>
      ) : null}
    </section>
  );
}
