import "server-only";
import { prisma } from "@cables/db";
import {
  normalizeCableCode,
  normalizeTrayCode,
  parseCableSearch,
  parseTraySearch,
  type ConnectionStatus,
  type InstallationStatus,
  type TrayKind,
} from "@cables/shared";
import { equipmentHref, locationHref } from "@/lib/links";
import { escapeLike } from "@/server/like";
import { searchCables } from "@/server/cables/search";
import { searchEquipment } from "@/server/equipment/service";
import { searchTrays } from "@/server/trays/service";

/** Longest text the box accepts; codes are far shorter. */
export const QUICK_SEARCH_MAX = 80;
/** Results per kind: enough to recognise what is looked for, without a long list. */
export const QUICK_SEARCH_LIMIT = 5;
/** Shorter texts match too much to be useful while typing. */
export const QUICK_SEARCH_MIN = 2;

export type QuickSearchResults = {
  cables: {
    id: string;
    code: string;
    description: string | null;
    installationStatus: InstallationStatus;
    connectionStatus: ConnectionStatus;
  }[];
  cablesTotal: number;
  /** No code contained the text: the cables shown have similar codes. */
  cablesFuzzy: boolean;
  trays: { code: string; kind: TrayKind; building: string | null }[];
  traysTotal: number;
  equipment: { equipment: string; cables: number }[];
  locations: { id: string; name: string; code: string }[];
  /** The text is exactly one code: where «Buscar» goes straight away. */
  exact: string | null;
};

const EMPTY: QuickSearchResults = {
  cables: [],
  cablesTotal: 0,
  cablesFuzzy: false,
  trays: [],
  traysTotal: 0,
  equipment: [],
  locations: [],
  exact: null,
};

/**
 * One box for everything: cables (code, equipment or description, with the typo fallback of
 * the cable search), trays, equipment and locations, a few of each. Each kind reuses its own
 * search, so the results are the same as on its page. Everything is read-only and every
 * signed-in user may see it; the caller checks the session.
 */
export async function quickSearch(raw: string): Promise<QuickSearchResults> {
  const text = raw.trim().slice(0, QUICK_SEARCH_MAX);
  if (text.length < QUICK_SEARCH_MIN) return EMPTY;

  const [cables, trays, equipment, locations] = await Promise.all([
    searchCables(parseCableSearch({ q: text }), QUICK_SEARCH_LIMIT),
    searchTrays(parseTraySearch({ q: text }), QUICK_SEARCH_LIMIT),
    searchEquipment(text),
    prisma.location.findMany({
      where: {
        OR: [
          { name: { contains: escapeLike(text), mode: "insensitive" } },
          { code: { contains: escapeLike(text), mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, code: true },
      orderBy: { path: "asc" },
      take: QUICK_SEARCH_LIMIT,
    }),
  ]);

  const cableCode = normalizeCableCode(text);
  const trayCode = normalizeTrayCode(text);
  const exactCable = cables.fuzzy
    ? undefined
    : cables.items.find((cable) => cable.code === cableCode);
  const exactTray = trays.items.find((tray) => tray.code === trayCode);
  const exactEquipment = equipment.find(
    (item) => item.equipment.toUpperCase() === text.toUpperCase(),
  );

  return {
    cables: cables.items.map((cable) => ({
      id: cable.id,
      code: cable.code,
      description: cable.description,
      installationStatus: cable.installationStatus,
      connectionStatus: cable.connectionStatus,
    })),
    cablesTotal: cables.total,
    cablesFuzzy: cables.fuzzy ?? false,
    trays: trays.items.map((tray) => ({
      code: tray.code,
      kind: tray.kind,
      building: tray.building,
    })),
    traysTotal: trays.total,
    equipment: equipment.slice(0, QUICK_SEARCH_LIMIT),
    locations,
    exact: exactCable
      ? `/cables/${exactCable.id}`
      : exactTray
        ? `/trays/${encodeURIComponent(exactTray.code)}`
        : exactEquipment
          ? equipmentHref(exactEquipment.equipment)
          : locations.length === 1 && locations[0]!.code.toUpperCase() === text.toUpperCase()
            ? locationHref(locations[0]!.id)
            : null,
  };
}
