import { z } from "zod";
import { HIDDEN_CHARACTERS_MESSAGE, isCleanLine } from "./text";

/**
 * Guardados (fase 16): carpetas de una persona, de un solo nivel, con cables, bandejas y
 * equipos. Una misma cosa puede estar en varias carpetas.
 */
export const SAVED_KINDS = ["CABLE", "TRAY", "EQUIPMENT"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export const SAVED_KIND_LABELS: Record<SavedKind, { singular: string; plural: string }> = {
  CABLE: { singular: "cable", plural: "Cables" },
  TRAY: { singular: "bandeja", plural: "Bandejas" },
  EQUIPMENT: { singular: "equipo", plural: "Equipos" },
};

/** Most folders one person can have, and most things one folder can hold. */
export const SAVED_FOLDERS_MAX = 100;
export const SAVED_ITEMS_MAX = 5000;

const id = z.string().trim().min(1).max(40);

export const savedFolderNameSchema = z
  .string({ error: "El nombre es obligatorio" })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "El nombre es obligatorio")
      .max(60, "El nombre no puede superar 60 caracteres")
      .refine(isCleanLine, HIDDEN_CHARACTERS_MESSAGE),
  );

export const createSavedFolderSchema = z.object({ name: savedFolderNameSchema });
export const renameSavedFolderSchema = z.object({ id, name: savedFolderNameSchema });
export const deleteSavedFolderSchema = z.object({ id });

/** What is saved: the cable id, the tray code or the equipment tag. */
export const savedRefSchema = z.object({
  kind: z.enum(SAVED_KINDS),
  key: z.string().trim().min(1).max(120),
});
export type SavedRef = z.infer<typeof savedRefSchema>;

/**
 * Put things in folders and take them out of others (the «Guardar» dialog): `add` and
 * `remove` are folder ids; `newFolder`, a folder to create and add to at once.
 */
export const saveItemsSchema = z
  .object({
    refs: z.array(savedRefSchema).min(1, "No hay nada que guardar").max(SAVED_ITEMS_MAX),
    add: z.array(id).max(SAVED_FOLDERS_MAX).default([]),
    remove: z.array(id).max(SAVED_FOLDERS_MAX).default([]),
    newFolder: savedFolderNameSchema.optional(),
  })
  .refine((value) => value.add.length + value.remove.length > 0 || value.newFolder, {
    message: "Elige una carpeta",
  });
export type SaveItemsInput = z.input<typeof saveItemsSchema>;

/** Take things out of a folder, or move them to another one. */
export const moveSavedItemsSchema = z.object({
  folderId: id,
  itemIds: z.array(id).min(1, "No hay nada elegido").max(SAVED_ITEMS_MAX),
  /** Missing: they are taken out of the folder. */
  toFolderId: id.optional(),
});
