"use client";

import { cn } from "cn";
import { SlidersHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  CABLE_ACTIONS,
  CABLE_ACTION_LABELS,
  CABLE_LEVELS,
  CABLE_LEVEL_LABELS,
  CONNECTION_STATUSES,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUSES,
  INSTALLATION_STATUS_LABELS,
  cableSearchQuery,
  hasActivityFilters,
  parseCableSearch,
  type CableSearch,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { SearchOptions } from "@/server/cables/search";

type Props = { search: CableSearch; options: SearchOptions };

const RANGES = [
  ["section", "Sección (mm²)"],
  ["diameter", "Diámetro exterior (mm)"],
  ["length", "Longitud (m)"],
] as const;

/**
 * Filtros del buscador. Al buscar se navega a una URL limpia (`/cables?q=…`),
 * así que los filtros se pueden compartir y el botón atrás funciona. El orden
 * actual se conserva; la página vuelve a la 1.
 */
export function SearchFilters({ search, options }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const advancedActive = Boolean(
    search.manufacturer ||
    search.color ||
    hasActivityFilters(search) ||
    RANGES.some(
      ([name]) => search[`${name}Min`] !== undefined || search[`${name}Max`] !== undefined,
    ),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
    );
    const next = parseCableSearch({ ...values, sort: search.sort, dir: search.dir });
    router.push(`/cables${cableSearchQuery(next)}`);
  }

  const text = (value: number | string | undefined) =>
    value === undefined ? "" : String(value).replace(".", ",");

  // En el móvil solo se ve el cuadro de búsqueda; el resto se despliega con "Filtros".
  const { q: _q, sort: _sort, dir: _dir, page: _page, ...filters } = search;
  const activeCount = Object.values(filters).filter((value) => value !== undefined).length;

  return (
    // La clave reinicia los campos cuando cambia la URL (botón atrás, "Limpiar").
    <form
      key={cableSearchQuery(search)}
      onSubmit={submit}
      role="search"
      aria-label="Buscar cables"
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5 sm:min-w-56">
          <Label htmlFor="q">Código, equipo o descripción</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            placeholder="99xat10w2005, 99BMA, bomba…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="md:hidden"
          aria-expanded={expanded}
          aria-controls="cable-filters"
          onClick={() => setExpanded((value) => !value)}
        >
          <SlidersHorizontalIcon />
          Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </div>

      <div id="cable-filters" className={cn("space-y-4 md:block", expanded ? "block" : "hidden")}>
        <Filter label="Ubicación (incluye lo que contiene)" htmlFor="location">
          <Select id="location" name="location" defaultValue={search.location}>
            {options.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </Select>
        </Filter>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Filter label="Tipo" htmlFor="type">
            <Select id="type" name="type" defaultValue={search.type}>
              {options.cableTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Nivel" htmlFor="level">
            <Select id="level" name="level" defaultValue={search.level}>
              {CABLE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {CABLE_LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Instalación" htmlFor="installation">
            <Select id="installation" name="installation" defaultValue={search.installation}>
              {INSTALLATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INSTALLATION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Conexión" htmlFor="connection">
            <Select id="connection" name="connection" defaultValue={search.connection}>
              {CONNECTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CONNECTION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Bandeja (código)" htmlFor="tray">
            <Input
              id="tray"
              name="tray"
              defaultValue={search.tray ?? ""}
              placeholder="99UXA00L22036"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
            />
          </Filter>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              name="loose"
              value="1"
              defaultChecked={search.loose === "1"}
              className="accent-primary size-4"
            />
            Solo con la punta suelta (en esa bandeja, si la indicas)
          </label>
        </div>

        <details open={advancedActive} className="group">
          <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 cursor-pointer rounded-sm text-sm transition-colors outline-none select-none focus-visible:ring-3">
            Más filtros
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Filter label="Color" htmlFor="color">
              <Select id="color" name="color" defaultValue={search.color}>
                {options.colors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Fabricante" htmlFor="manufacturer">
              <Select id="manufacturer" name="manufacturer" defaultValue={search.manufacturer}>
                {options.manufacturers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Filter>
            {RANGES.map(([name, label]) => (
              <fieldset key={name} className="space-y-1.5">
                <legend className="text-sm leading-none font-medium">{label}</legend>
                <div className="flex items-center gap-2">
                  <Input
                    name={`${name}Min`}
                    aria-label={`${label}: desde`}
                    placeholder="desde"
                    inputMode="decimal"
                    defaultValue={text(search[`${name}Min`])}
                  />
                  <span aria-hidden>–</span>
                  <Input
                    name={`${name}Max`}
                    aria-label={`${label}: hasta`}
                    placeholder="hasta"
                    inputMode="decimal"
                    defaultValue={text(search[`${name}Max`])}
                  />
                </div>
              </fieldset>
            ))}
          </div>
          <fieldset className="mt-4 space-y-3">
            <legend className="text-sm font-medium">
              Movimientos{" "}
              <span className="text-muted-foreground font-normal">(quién, qué, cuándo)</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Filter label="Quién" htmlFor="actor">
                <Select id="actor" name="actor" defaultValue={search.actor}>
                  {options.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.label}
                    </option>
                  ))}
                </Select>
              </Filter>
              <Filter label="Qué hizo" htmlFor="action">
                <Select id="action" name="action" defaultValue={search.action}>
                  {CABLE_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {CABLE_ACTION_LABELS[action]}
                    </option>
                  ))}
                </Select>
              </Filter>
              <Filter label="Desde" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={search.from ?? ""} />
              </Filter>
              <Filter label="Hasta" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={search.to ?? ""} />
              </Filter>
            </div>
          </fieldset>
        </details>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">Buscar</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/cables")}>
          Limpiar filtros
        </Button>
      </div>
    </form>
  );
}

function Filter({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "min-w-56 flex-1 space-y-1.5" : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Select({ children, defaultValue, ...props }: React.ComponentProps<"select">) {
  return (
    <NativeSelect {...props} defaultValue={defaultValue ?? ""}>
      <option value="">Todos</option>
      {children}
    </NativeSelect>
  );
}
