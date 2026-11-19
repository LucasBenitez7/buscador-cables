/**
 * Search, filter and order of the location tree (`/locations`). The tree comes whole from the
 * server; these pure functions narrow and order it, so the page needs one query.
 */
import { z } from "zod";
import {
  LOCATION_TYPES,
  type FlatLocation,
  type LocationNode,
  type LocationType,
} from "./locations";
import { firstParams, type RawSearchParams } from "./url-params";

export const LOCATION_SORTS = ["code", "name", "cables", "cables-asc"] as const;
export type LocationSort = (typeof LOCATION_SORTS)[number];
export const LOCATION_SORT_LABELS: Record<LocationSort, string> = {
  code: "Código (A-Z)",
  name: "Nombre (A-Z)",
  cables: "Más cables primero",
  "cables-asc": "Menos cables primero",
};

export type LocationSearch = {
  /** Part of the name or the code, without accents or case. */
  q?: string;
  type?: LocationType;
  /** Only the locations with cables (their own or in what they contain). */
  cables?: boolean;
  sort?: LocationSort;
};

const locationSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(80)
    .transform((value) => (value === "" ? undefined : value))
    .optional()
    .catch(undefined),
  type: z.enum(LOCATION_TYPES).optional().catch(undefined),
  cables: z
    .literal("1")
    .transform(() => true)
    .optional()
    .catch(undefined),
  sort: z.enum(LOCATION_SORTS).optional().catch(undefined),
});

/** `/locations?q=…&type=…&cables=1&sort=…`; an invalid value is ignored. */
export function parseLocationSearch(params: RawSearchParams): LocationSearch {
  const parsed = locationSearchSchema.parse(firstParams(params));
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as LocationSearch;
}

/** Lowercase without accents: "Área" and "area" are the same text for the search. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

type Searchable = FlatLocation & { cableCount: number };

/**
 * The locations that match the search and their ancestors (so the path stays visible), in the
 * same tree shape. `matches` lists only the ids that match, not the ancestors. With no criteria
 * everything matches.
 */
export function filterLocationTree<T extends Searchable>(
  tree: readonly LocationNode<T>[],
  search: LocationSearch,
): { tree: LocationNode<T>[]; matches: string[] } {
  const text = search.q ? foldSearchText(search.q) : undefined;
  const matchesNode = (node: T) =>
    (!text ||
      foldSearchText(node.name).includes(text) ||
      foldSearchText(node.code).includes(text)) &&
    (!search.type || node.type === search.type) &&
    (!search.cables || node.cableCount > 0);

  const matches: string[] = [];
  const prune = (nodes: readonly LocationNode<T>[]): LocationNode<T>[] =>
    nodes.flatMap((node) => {
      // Primero el nodo y luego sus hijos: `matches` sale en el orden en que se ve el árbol.
      const hit = matchesNode(node);
      if (hit) matches.push(node.id);
      const children = prune(node.children);
      // Se queda lo que cumple y lo que contiene algo que cumple (sus antepasados).
      if (!hit && children.length === 0) return [];
      return [{ ...node, children }];
    });
  return { tree: prune(tree), matches };
}

/** Orders the siblings at every level: by code, by name, or by cables (most or fewest first). */
export function sortLocationTree<T extends Searchable>(
  tree: readonly LocationNode<T>[],
  sort: LocationSort,
): LocationNode<T>[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es", { numeric: true });
  const compare: (a: T, b: T) => number =
    sort === "code"
      ? (a, b) => a.code.localeCompare(b.code, "es", { numeric: true })
      : sort === "cables"
        ? (a, b) => b.cableCount - a.cableCount || byName(a, b)
        : sort === "cables-asc"
          ? (a, b) => a.cableCount - b.cableCount || byName(a, b)
          : byName;
  const sortList = (nodes: readonly LocationNode<T>[]): LocationNode<T>[] =>
    [...nodes].sort(compare).map((node) => ({ ...node, children: sortList(node.children) }));
  return sortList(tree);
}
