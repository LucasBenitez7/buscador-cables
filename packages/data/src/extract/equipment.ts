/**
 * Where each equipment is drawn on the routing drawings (fase 19): the plant codes written on
 * the sheets (`drawnTags`) against the equipment the cable lists name at their ends.
 *
 * A code drawn on a sheet is the equipment when it is the same tag. When no sheet has it, the
 * longest drawn code that starts the tag and is a whole equipment code is taken instead: the
 * lists add the part or the terminal box to the instrument («99LCA70CF001A1-B01»), and the
 * drawing writes only the instrument («99LCA70CF001A1»). Never a bare system («99LCA70»).
 */
import type { DrawnTag } from "../parse/drawing-marks";
import type { RawDrawingSheet } from "../parse/drawing-page";
import type { ProjectCable, ProjectEquipment } from "./schema";

type Sheet = Pick<RawDrawingSheet, "drawing" | "sheet" | "page" | "tags">;

/** A whole equipment code: unit, system, number, equipment letters and number. */
const EQUIPMENT_CODE = /^\d{2}[A-Z]{3}\d{2}[A-Z]{2}\d{3}/;
/** The shortest drawn code taken in place of a longer tag. */
const MIN_RELATED = 12;
/** Marks of one equipment on one sheet: more is a table or a legend, not the plan. */
const MAX_MARKS = 20;

/** «+99BMD04 », «99bmd04» → «99BMD04»: how a tag of the lists is compared. */
export function equipmentKey(tag: string): string | null {
  const key = tag.trim().toUpperCase().replace(/^[+=]/, "");
  // «99CJU04,99CJU15»: two equipment in one cell are neither.
  return key === "" || /[\s,;/]/.test(key) ? null : key;
}

export function buildEquipment(
  sheets: readonly Sheet[],
  cables: readonly Pick<ProjectCable, "origin" | "destination">[],
  titles: ReadonlyMap<string, string>,
): { equipment: ProjectEquipment[]; stats: { exact: number; related: number; total: number } } {
  const drawn = new Map<string, { sheet: Sheet; tag: DrawnTag }[]>();
  const seen = new Set<string>();
  for (const sheet of sheets) {
    if (!sheet.drawing) continue;
    const sheetKey = `${sheet.drawing}#${sheet.sheet ?? "?"}`;
    if (seen.has(sheetKey)) continue;
    seen.add(sheetKey);
    for (const tag of sheet.tags) {
      drawn.set(tag.tag, [...(drawn.get(tag.tag) ?? []), { sheet, tag }]);
    }
  }

  const tags = new Map<string, string>();
  for (const cable of cables) {
    for (const end of [cable.origin, cable.destination]) {
      const key = end.equipment ? equipmentKey(end.equipment) : null;
      if (key && !tags.has(key)) tags.set(key, end.equipment!.trim());
    }
  }

  const stats = { exact: 0, related: 0, total: tags.size };
  const equipment: ProjectEquipment[] = [];
  for (const [key, tag] of tags) {
    let found = drawn.get(key);
    let drawnAs = key;
    if (found) stats.exact += 1;
    else {
      for (let length = key.length - 1; length >= MIN_RELATED; length -= 1) {
        const prefix = key.slice(0, length);
        if (EQUIPMENT_CODE.test(prefix) && drawn.has(prefix)) {
          found = drawn.get(prefix);
          drawnAs = prefix;
          stats.related += 1;
          break;
        }
      }
    }
    if (!found) continue;
    const bySheet = new Map<string, ProjectEquipment["drawings"][number]>();
    for (const { sheet, tag: mark } of found) {
      const number = sheet.sheet ?? "?";
      const sheetKey = `${sheet.drawing}#${number}`;
      let entry = bySheet.get(sheetKey);
      if (!entry) {
        entry = {
          drawing: sheet.drawing!,
          sheet: number,
          title: titles.get(sheetKey) ?? null,
          sourcePage: sheet.page,
          drawnAs,
          marks: [],
        };
        bySheet.set(sheetKey, entry);
      }
      if (entry.marks.length < MAX_MARKS) {
        entry.marks.push({ x: mark.x, y: mark.y, w: mark.w, h: mark.h, kind: "label" });
      }
    }
    equipment.push({ tag, drawings: [...bySheet.values()] });
  }
  return { equipment, stats };
}
