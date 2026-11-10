import { z } from "zod";

/**
 * Location tree rules: Planta → Área → Unidad → Sitio.
 *
 * Every location stores a materialized `path` built from the codes of its
 * ancestors ("/PL/A1/R-X"), so a whole subtree can be selected with a prefix.
 * The Prisma `LocationType` enum must list exactly the same members.
 */
export const LOCATION_TYPES = ["PLANT", "AREA", "UNIT", "SITE"] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  PLANT: "Planta",
  AREA: "Área",
  UNIT: "Unidad",
  SITE: "Sitio",
};

export const PATH_SEPARATOR = "/";

/** Type that a child of `type` must have, or null for the last level. */
export function childLocationType(type: LocationType): LocationType | null {
  return LOCATION_TYPES[LOCATION_TYPES.indexOf(type) + 1] ?? null;
}

/** Returns an error message in Spanish, or null when the placement is valid. */
export function validateLocationPlacement(
  type: LocationType,
  parentType: LocationType | null,
): string | null {
  if (parentType === null) {
    return type === "PLANT" ? null : "Solo las plantas pueden estar en el nivel superior.";
  }
  const expected = childLocationType(parentType);
  if (expected === null) {
    return "Un sitio no puede contener otras ubicaciones.";
  }
  if (type !== expected) {
    return `Dentro de ${LOCATION_TYPE_LABELS[parentType].toLowerCase()} solo se puede crear: ${LOCATION_TYPE_LABELS[expected].toLowerCase()}.`;
  }
  return null;
}

export function buildLocationPath(parentPath: string | null, code: string): string {
  return `${parentPath ?? ""}${PATH_SEPARATOR}${code}`;
}

/** True when `path` is `ancestorPath` itself or lies below it. */
export function isWithinPath(path: string, ancestorPath: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}${PATH_SEPARATOR}`);
}

/** Moves `path` from under `oldPrefix` to under `newPrefix` (used when a code changes). */
export function rebasePath(path: string, oldPrefix: string, newPrefix: string): string {
  if (!isWithinPath(path, oldPrefix)) {
    throw new Error(`"${path}" no está dentro de "${oldPrefix}"`);
  }
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}

// Sin "/" (separador de la ruta) ni "%" o "_" (comodines de LIKE).
const locationCodeSchema = z
  .string({ error: "El código es obligatorio" })
  .trim()
  .toUpperCase()
  .min(1, "El código es obligatorio")
  .max(30, "El código no puede superar 30 caracteres")
  .regex(/^[A-Z0-9][A-Z0-9-]*$/, "El código solo puede contener letras, números y '-'");

const locationNameSchema = z
  .string({ error: "El nombre es obligatorio" })
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(100, "El nombre no puede superar 100 caracteres");

export const createLocationSchema = z.object({
  name: locationNameSchema,
  code: locationCodeSchema,
  type: z.enum(LOCATION_TYPES, { error: "Tipo de ubicación no válido" }),
  parentId: z.string().min(1).nullable(),
});

export const updateLocationSchema = z.object({
  id: z.string().min(1),
  name: locationNameSchema,
  code: locationCodeSchema,
});

export const deleteLocationSchema = z.object({ id: z.string().min(1) });

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export type FlatLocation = {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  parentId: string | null;
  path: string;
};

export type LocationNode<T extends FlatLocation = FlatLocation> = T & {
  children: LocationNode<T>[];
};

/** Builds the nested tree from a flat list, siblings sorted by name (es). */
export function buildLocationTree<T extends FlatLocation>(
  locations: readonly T[],
): LocationNode<T>[] {
  const nodes = new Map<string, LocationNode<T>>();
  for (const location of locations) {
    nodes.set(location.id, { ...location, children: [] });
  }

  const roots: LocationNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byName = (a: LocationNode<T>, b: LocationNode<T>) =>
    a.name.localeCompare(b.name, "es", { numeric: true });
  const sortDeep = (list: LocationNode<T>[]) => {
    list.sort(byName);
    for (const node of list) {
      sortDeep(node.children);
    }
  };
  sortDeep(roots);
  return roots;
}
