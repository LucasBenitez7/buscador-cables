import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { equipmentHref } from "@/lib/links";
import { EQUIPMENT_MAX, searchEquipment } from "@/server/equipment/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Find a cabinet, box or panel to see every cable that lands in it (fase 11). */
export default async function EquipmentSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const raw = (await searchParams).q;
  const query = (typeof raw === "string" ? raw : "").trim().slice(0, EQUIPMENT_MAX);
  const matches = await searchEquipment(query);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
        <p className="text-muted-foreground text-sm">
          Cuadros, cajas y armarios: cada uno con los cables que llegan a él, por regletero, y si
          esa punta está conectada.
        </p>
      </div>

      <form
        action="/equipment"
        role="search"
        aria-label="Buscar equipos"
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:min-w-56">
          <Label htmlFor="equipment-q">Código del equipo</Label>
          <Input
            id="equipment-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={EQUIPMENT_MAX}
            placeholder="99BMA10, 99CXJ…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <p role="status" className="text-muted-foreground text-sm">
        {query
          ? matches.length === 0
            ? "Ningún equipo contiene ese código."
            : `${matches.length} ${matches.length === 1 ? "equipo" : "equipos"}${matches.length >= 60 ? " (los 60 con más cables; afina la búsqueda)" : ""}`
          : "Los equipos con más cables. Escribe un código para buscar uno."}
      </p>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((match) => (
          <li
            key={match.equipment}
            className="bg-card hover:border-primary/50 hover:bg-muted/40 has-focus-visible:ring-ring/50 relative space-y-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3"
          >
            <Link
              href={equipmentHref(match.equipment)}
              className="text-primary font-mono text-base font-semibold break-all outline-none after:absolute after:inset-0 after:rounded-lg"
            >
              {match.equipment}
            </Link>
            <p className="text-muted-foreground">
              {match.cables} {match.cables === 1 ? "cable" : "cables"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
