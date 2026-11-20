import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { TRAY_KIND_LABELS } from "@cables/shared";
import { Section } from "@/components/detail";
import { SelectCheckbox, SelectionControl, SelectionProvider } from "@/components/selection";
import { CODE_LINK } from "@/components/ui/text-link";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { FolderActions, FolderChosenActions } from "@/features/saved/components/folder-forms";
import { INLINE_LINK, equipmentHref, trayHref } from "@/lib/links";
import { decodeRouteParam } from "@/lib/route-params";
import { getFolder, listFolders } from "@/server/saved/service";
import { getCurrentUser, requireUser, whenSignedIn } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

// Una consulta para generateMetadata y la página; solo las carpetas de quien la abre.
const loadFolder = cache(async (raw: string) => {
  const id = decodeRouteParam(raw);
  if (id === null) return null;
  return whenSignedIn(async () => {
    const user = await getCurrentUser();
    return user ? getFolder(user.id, id) : null;
  });
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const folder = await loadFolder((await params).id);
  return { title: folder ? folder.name : "Carpeta" };
}

/** One folder of «Guardados»: its cables, trays and equipment, to open, copy, move or remove. */
export default async function SavedFolderPage({ params }: { params: Params }) {
  const user = await requireUser();
  const folder = await loadFolder((await params).id);
  if (!folder) notFound();
  const others = (await listFolders(user.id))
    .filter((other) => other.id !== folder.id)
    .map(({ id, name }) => ({ id, name }));
  const empty = folder.cables.length + folder.trays.length + folder.equipment.length === 0;

  // Las tres cajas eligen igual: la clave es el id de lo guardado; se copia el código.
  const list = (title: string, items: { itemId: string; code: string }[], rows: ReactNode) => (
    <SelectionProvider
      title={`${folder.name} · ${title.toLowerCase()}`}
      items={items.map((item) => ({ key: item.itemId, label: item.code }))}
      actions={<FolderChosenActions folderId={folder.id} others={others} />}
    >
      <Section title={`${title} (${items.length})`} collapsible>
        <SelectionControl />
        <ul className="bg-card divide-y rounded-lg border">{rows}</ul>
      </Section>
    </SelectionProvider>
  );

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/saved" className={INLINE_LINK}>
            Guardados
          </Link>{" "}
          ›
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight break-words">{folder.name}</h1>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <FolderActions id={folder.id} name={folder.name} />
          </div>
        </div>
      </header>

      {empty ? (
        <p
          role="status"
          className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
        >
          Esta carpeta está vacía.
        </p>
      ) : null}

      {folder.cables.length > 0
        ? list(
            "Cables",
            folder.cables,
            folder.cables.map((cable) => {
              const item = { key: cable.itemId, label: cable.code };
              return (
                <li
                  key={cable.itemId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <SelectCheckbox item={item} />
                      {cable.deleted ? (
                        <span className="text-muted-foreground font-mono line-through">
                          {cable.code}
                        </span>
                      ) : (
                        <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                          {cable.code}
                        </Link>
                      )}
                    </div>
                    {cable.deleted ? (
                      <p className="text-muted-foreground text-xs">Dado de baja</p>
                    ) : cable.originEquipment || cable.destinationEquipment ? (
                      <p className="text-muted-foreground text-xs">
                        de <EquipmentLink equipment={cable.originEquipment} /> a{" "}
                        <EquipmentLink equipment={cable.destinationEquipment} />
                      </p>
                    ) : null}
                  </div>
                  {cable.deleted ? null : (
                    <CableStatusBadges
                      installationStatus={cable.installationStatus}
                      connectionStatus={cable.connectionStatus}
                      testStatus={cable.testStatus}
                    />
                  )}
                </li>
              );
            }),
          )
        : null}

      {folder.trays.length > 0
        ? list(
            "Bandejas",
            folder.trays,
            folder.trays.map((tray) => (
              <li key={tray.itemId} className="space-y-0.5 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <SelectCheckbox item={{ key: tray.itemId, label: tray.code }} />
                  <Link href={trayHref(tray.code)} className={CODE_LINK}>
                    {tray.code}
                  </Link>
                </div>
                <p className="text-muted-foreground text-xs">
                  {tray.kind
                    ? [
                        TRAY_KIND_LABELS[tray.kind],
                        tray.voltageLevel ? `L${tray.voltageLevel}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Ya no está en los planos"}
                </p>
              </li>
            )),
          )
        : null}

      {folder.equipment.length > 0
        ? list(
            "Equipos",
            folder.equipment.map((equipment) => ({ ...equipment, code: equipment.equipment })),
            folder.equipment.map((equipment) => (
              <li key={equipment.itemId} className="space-y-0.5 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <SelectCheckbox item={{ key: equipment.itemId, label: equipment.equipment }} />
                  <Link href={equipmentHref(equipment.equipment)} className={CODE_LINK}>
                    {equipment.equipment}
                  </Link>
                </div>
                <p className="text-muted-foreground text-xs">
                  {equipment.cables} {equipment.cables === 1 ? "cable" : "cables"}
                </p>
              </li>
            )),
          )
        : null}
    </article>
  );
}
