import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { LOCATION_TYPE_LABELS } from "@cables/shared";
import { DataList, Item, Section } from "@/components/detail";
import { Button } from "@/components/ui/button";
import { CODE_LINK } from "@/components/ui/text-link";
import { decodeRouteParam } from "@/lib/route-params";
import { INLINE_LINK, locationCablesHref, locationHref, traysByCodeHref } from "@/lib/links";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { getLocationDetail } from "@/server/locations/service";
import { requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

const ROLE_TEXT = {
  origin: "sale de aquí",
  destination: "llega aquí",
  here: "guardado aquí",
} as const;

type Params = Promise<{ id: string }>;

// Una sola consulta para generateMetadata y la página, y ninguna sin sesión.
const loadLocation = cache(async (id: string) => {
  const decoded = decodeRouteParam(id);
  return decoded ? whenSignedIn(() => getLocationDetail(decoded)) : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const location = await loadLocation((await params).id);
  return { title: location ? location.name : "Ubicación" };
}

/** A place of the plant: where it is, what it contains, and its cables and trays. */
export default async function LocationPage({ params }: { params: Params }) {
  await requireUser();
  const location = await loadLocation((await params).id);
  if (!location) notFound();
  const typeLabel = LOCATION_TYPE_LABELS[location.type];

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <nav aria-label="Ruta" className="text-muted-foreground text-sm">
          <ol className="flex flex-wrap items-center gap-x-1.5">
            <li>
              <Link href="/locations" className={INLINE_LINK}>
                Ubicaciones
              </Link>
            </li>
            {location.ancestors.map((ancestor) => (
              <li key={ancestor.id} className="flex items-center gap-x-1.5">
                <span aria-hidden>›</span>
                <Link href={locationHref(ancestor.id)} className={INLINE_LINK}>
                  {ancestor.name}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{location.name}</h1>
        <p className="text-muted-foreground">
          {typeLabel}
          {location.name !== location.code ? (
            <>
              {" "}
              · <span className="font-mono">{location.code}</span>
            </>
          ) : null}
        </p>
      </header>

      <Section title="Datos">
        <DataList>
          <Item label="Tipo">{typeLabel}</Item>
          <Item label="Código">
            <span className="font-mono">{location.code}</span>
          </Item>
          <Item label="Dentro de">
            {location.ancestors.length > 0 ? (
              <Link href={locationHref(location.ancestors.at(-1)!.id)} className={INLINE_LINK}>
                {location.ancestors.at(-1)!.name}
              </Link>
            ) : null}
          </Item>
          <Item label="Cables">
            {location.cables > 0 ? (
              <Link href={locationCablesHref(location.id)} className={INLINE_LINK}>
                {location.cables} {location.cables === 1 ? "cable" : "cables"} →
              </Link>
            ) : (
              "Ninguno"
            )}
          </Item>
          {location.trays > 0 ? (
            <Item label="Bandejas">
              <Link href={traysByCodeHref(location.code)} className={INLINE_LINK}>
                {location.trays} {location.trays === 1 ? "bandeja" : "bandejas"} →
              </Link>
            </Item>
          ) : null}
        </DataList>
        <p className="text-muted-foreground text-xs">
          Los cables cuentan si empiezan, terminan o están guardados aquí o en cualquier sitio que
          contiene.
        </p>
      </Section>

      {location.someCables.length > 0 ? (
        <Section
          title={`Cables (${location.cables})`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={locationCablesHref(location.id)}>
                {location.cables > location.someCables.length
                  ? `Ver los ${location.cables} en el buscador`
                  : "Filtrar en el buscador"}
              </Link>
            </Button>
          }
        >
          <ul className="bg-card divide-y rounded-lg border">
            {location.someCables.map((cable) => (
              <li
                key={cable.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                  {cable.code}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {cable.roles.map((role) => ROLE_TEXT[role]).join(" y ")}
                  {cable.otherEnd ? (
                    <>
                      {" "}
                      · {cable.roles[0] === "origin" ? "hacia" : "desde"}{" "}
                      <EquipmentLink equipment={cable.otherEnd} />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {location.children.length > 0 ? (
        <Section
          title={`Contiene (${location.children.length})`}
          action={
            location.cables > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={locationCablesHref(location.id)}>Ver sus cables en el buscador</Link>
              </Button>
            ) : null
          }
        >
          <ul className="bg-card divide-y rounded-lg border">
            {location.children.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm"
              >
                <Link href={locationHref(child.id)} className={CODE_LINK}>
                  {child.name}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {LOCATION_TYPE_LABELS[child.type]}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}
