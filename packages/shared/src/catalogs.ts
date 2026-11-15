import { z } from "zod";

/**
 * Administrable catalogs used by the cable form: cable types ("Potencia",
 * "Control"…), colors (with an optional hex swatch) and manufacturers.
 */
export const CATALOG_KINDS = ["cableType", "color", "manufacturer"] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_LABELS: Record<CatalogKind, { singular: string; plural: string }> = {
  cableType: { singular: "Tipo de cable", plural: "Tipos de cable" },
  color: { singular: "Color", plural: "Colores" },
  manufacturer: { singular: "Fabricante", plural: "Fabricantes" },
};

const catalogNameSchema = z
  .string({ error: "El nombre es obligatorio" })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "El nombre es obligatorio")
      .max(80, "El nombre no puede superar 80 caracteres"),
  );

/** "#a1b2c3" → "#A1B2C3"; empty → null. Only meaningful for colors. */
const hexSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toUpperCase()))
  .pipe(
    z
      .string()
      .regex(/^#[0-9A-F]{6}$/, "El color debe tener el formato #RRGGBB")
      .nullable(),
  )
  .optional()
  .transform((value) => value ?? null);

const kindSchema = z.enum(CATALOG_KINDS, { error: "Catálogo no válido" });

export const createCatalogItemSchema = z.object({
  kind: kindSchema,
  name: catalogNameSchema,
  hex: hexSchema,
});

export const updateCatalogItemSchema = createCatalogItemSchema.extend({
  id: z.string().min(1),
});

export const deleteCatalogItemSchema = z.object({
  kind: kindSchema,
  id: z.string().min(1),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export type CatalogItem = {
  id: string;
  name: string;
  /** Solo para colores. */
  hex: string | null;
  /** Cables que lo usan, incluidos los dados de baja. */
  cableCount: number;
};
