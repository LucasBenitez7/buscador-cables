import type { Metadata } from "next";
import {
  LOCATION_SORT_LABELS,
  LOCATION_TYPE_LABELS,
  filterLocationTree,
  hasPermission,
  optionsOf,
  parseLocationSearch,
  sortLocationTree,
} from "@cables/shared";
import { ListToolbar } from "@/components/list-toolbar";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { SelectAllRow, SelectionAside, SelectionProvider } from "@/components/selection";
import { LocationTree } from "@/features/locations/components/location-tree";
import { locationLabel } from "@/lib/location-label";
import { listLocationTree } from "@/server/locations/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Ubicaciones" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LocationsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const search = parseLocationSearch(await searchParams);
  const tree = await listLocationTree();
  const filtered = filterLocationTree(tree, search);
  const shown = sortLocationTree(filtered.tree, search.sort ?? "name");
  const canManage = hasPermission(user, "location:manage");
  const searching = Boolean(search.q || search.type || search.cables);
  const active = searching || (search.sort !== undefined && search.sort !== "name");
  const count = filtered.matches.length;
  // Cambiar un criterio reabre el árbol con lo que cumple (y sus antepasados): se reinicia.
  const treeKey = `${search.q ?? ""}|${search.type ?? ""}|${search.cables ? 1 : 0}`;
  // Lo que se puede elegir: lo que cumple la búsqueda (sin sus antepasados), en el orden del árbol.
  const matching = new Set(filtered.matches);
  type Node = (typeof shown)[number];
  const flatten = (nodes: readonly Node[]): Node[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);
  const selectable = flatten(shown)
    .filter((node) => !searching || matching.has(node.id))
    .map((node) => ({ key: node.id, label: locationLabel(node) }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ubicaciones</h1>
        <p className="text-muted-foreground text-sm">
          Planta → Área → Unidad → Sitio, con su código KKS. Por ejemplo,{" "}
          <code className="font-mono">99UXA16RA001</code> es una sala.
        </p>
      </div>

      <PendingListProvider>
        <SelectionProvider
          title="Ubicaciones"
          items={selectable}
          resetKey={`${treeKey}|${search.sort ?? ""}`}
        >
          <ListToolbar
            action="/locations"
            label="Buscar ubicaciones"
            search={{
              name: "q",
              label: "Nombre o código",
              value: search.q ?? "",
              placeholder: "99UXA, Sala de control…",
              maxLength: 80,
            }}
            sort={{
              name: "sort",
              value: search.sort ?? "name",
              defaultValue: "name",
              options: optionsOf(LOCATION_SORT_LABELS),
            }}
            filters={[
              {
                kind: "select",
                name: "type",
                label: "Tipo",
                value: search.type,
                options: optionsOf(LOCATION_TYPE_LABELS),
              },
              {
                kind: "checkbox",
                name: "cables",
                label: "Solo con cables",
                checked: search.cables,
              },
            ]}
            active={active}
            count={
              <>
                <span className="text-foreground font-medium">{count.toLocaleString("es-ES")}</span>{" "}
                {count === 1 ? "ubicación" : "ubicaciones"}
              </>
            }
            countAside={selectable.length > 0 ? <SelectionAside /> : null}
          />

          <PendingResults className="space-y-3">
            <SelectAllRow />
            <LocationTree
              key={treeKey}
              tree={shown}
              allTree={tree}
              canManage={canManage}
              matches={filtered.matches}
              searching={searching}
            />
          </PendingResults>
        </SelectionProvider>
      </PendingListProvider>
    </div>
  );
}
