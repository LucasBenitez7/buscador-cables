import { describe, expect, it } from "vitest";
import { reelKey } from "./excel-reels";
import {
  createPullReelFinder,
  createReelMatcher,
  excelKindOfLevel,
  parseReelsSearch,
  pendingByReel,
  pullCableCode,
  reelState,
  reelTotals,
  reelsQuery,
  type ReelCable,
  type ReelRef,
} from "./reels";

// Datos inventados: ni las bobinas ni los cables son del proyecto.
const REELS: ReelRef[] = [
  { id: "e26", kind: "ELECTRICAL", drum: "EX99026", tag: "26" },
  { id: "e154", kind: "ELECTRICAL", drum: null, tag: "154" },
  { id: "e155", kind: "ELECTRICAL", drum: null, tag: "155" },
  // Instrumentación también numera desde 1: su «26» es otra bobina.
  { id: "i26", kind: "INSTRUMENTATION", drum: "EJ0026", tag: "26" },
  // Un drum entregado en dos trozos.
  { id: "i3", kind: "INSTRUMENTATION", drum: "EJ0003", tag: "3" },
  { id: "i3b", kind: "INSTRUMENTATION", drum: "EJ0003", tag: "3B" },
  { id: "fo", kind: "INSTRUMENTATION", drum: "EJLOT7", tag: "EJLOT7" },
];

const match = createReelMatcher(REELS);

function cable(values: Partial<ReelCable> & { code: string }): ReelCable {
  return {
    id: values.code,
    kind: "ELECTRICAL",
    installationStatus: "NOT_LAID",
    plannedReel: null,
    lengthM: null,
    cablesPerCircuit: null,
    ...values,
  };
}

const KEYED = REELS.map((reel) => ({ ...reel, key: reelKey(reel.kind, reel) }));

describe("excelKindOfLevel", () => {
  it("is instrumentation for L1 and electrical for the rest", () => {
    expect(excelKindOfLevel("L1")).toBe("INSTRUMENTATION");
    expect(excelKindOfLevel("L3")).toBe("ELECTRICAL");
    expect(excelKindOfLevel(null)).toBeNull();
  });
});

describe("createReelMatcher", () => {
  it("finds the electrical reel by its tag and never one of the other file", () => {
    expect(match("ELECTRICAL", "26")).toEqual([{ name: "26", reelIds: ["e26"] }]);
    expect(match("INSTRUMENTATION", "26")).toEqual([{ name: "26", reelIds: ["i26"] }]);
    expect(match(null, "26")).toEqual([]);
  });

  it("finds the instrumentation reel by its drum, in any case", () => {
    expect(match("INSTRUMENTATION", "ej0026")).toEqual([{ name: "EJ0026", reelIds: ["i26"] }]);
  });

  it("gives every reel a cable names", () => {
    expect(match("ELECTRICAL", "155 / 154")).toEqual([
      { name: "155", reelIds: ["e155"] },
      { name: "154", reelIds: ["e154"] },
    ]);
  });

  it("gives both pieces of a drum, since the name does not tell which", () => {
    expect(match("INSTRUMENTATION", "EJ0003")).toEqual([
      { name: "EJ0003", reelIds: ["i3", "i3b"] },
    ]);
  });

  it("reads a planned piece «…A» as its drum when nothing has that name", () => {
    expect(match("INSTRUMENTATION", "EJLOT7C")).toEqual([{ name: "EJLOT7C", reelIds: ["fo"] }]);
    // Solo en instrumentación: en el eléctrico «26A» no es la 26.
    expect(match("ELECTRICAL", "26A")).toEqual([{ name: "26A", reelIds: [] }]);
  });

  it("gives nothing for a name that is not a reel", () => {
    expect(match("INSTRUMENTATION", "CABLE SUPPLIED BY OTHERS")).toEqual([]);
    expect(match("ELECTRICAL", "999")).toEqual([{ name: "999", reelIds: [] }]);
  });
});

describe("createPullReelFinder", () => {
  const find = createPullReelFinder(KEYED);

  it("finds the reel of a pulling by its key, within its own file", () => {
    expect(find({ kind: "ELECTRICAL", tag: "26", drum: null })).toBe("e26");
    expect(find({ kind: "INSTRUMENTATION", tag: "26", drum: "EJ0026" })).toBe("i26");
    // Las dos piezas de un drum: el número de almacén dice cuál es.
    expect(find({ kind: "INSTRUMENTATION", tag: "3B", drum: "EJ0003" })).toBe("i3b");
  });

  it("falls back on the only reel with its tag, or with its drum", () => {
    expect(find({ kind: "INSTRUMENTATION", tag: "26", drum: null })).toBe("i26");
    expect(find({ kind: "INSTRUMENTATION", tag: null, drum: "EJ0026" })).toBe("i26");
  });

  it("does not guess between two pieces of one drum", () => {
    expect(find({ kind: "INSTRUMENTATION", tag: null, drum: "EJ0003" })).toBeNull();
  });

  it("reads a piece of a lot as the lot, only in instrumentation", () => {
    expect(find({ kind: "INSTRUMENTATION", tag: "EJLOT7A", drum: null })).toBe("fo");
    expect(find({ kind: "ELECTRICAL", tag: "26A", drum: null })).toBeNull();
  });

  it("finds nothing for a reel that is not in the Excel", () => {
    expect(find({ kind: "ELECTRICAL", tag: "999", drum: null })).toBeNull();
  });
});

describe("pullCableCode", () => {
  // 99XAA03W001 sigue con su copia sin tramo: la tirada va a su tramo, no a la copia.
  const codes = new Set([
    "99XAA01W001.1",
    "99XAA01W001.2",
    "99XAA02W001",
    "99XAA03W001",
    "99XAA03W001.2",
  ]);
  const exists = (code: string) => codes.has(code);

  it("is the section of its circuit, or else the cable with its code", () => {
    expect(pullCableCode({ code: "99XAA01W001", circuit: 2 }, exists)).toBe("99XAA01W001.2");
    expect(pullCableCode({ code: "99XAA03W001", circuit: 2 }, exists)).toBe("99XAA03W001.2");
    expect(pullCableCode({ code: "99XAA02W001", circuit: 1 }, exists)).toBe("99XAA02W001");
  });

  it("is none when the web has neither", () => {
    expect(pullCableCode({ code: "99XAA01W001", circuit: 3 }, exists)).toBeNull();
    expect(pullCableCode({ code: "99XAA01W001", circuit: null }, exists)).toBeNull();
  });
});

describe("pendingByReel and reelTotals", () => {
  it("lists the cables still to lay that are planned for the reel, with their parallel cables", () => {
    const pending = pendingByReel(
      match,
      [
        cable({ code: "99XAA05W001.1", plannedReel: "26", lengthM: 30, cablesPerCircuit: 3 }),
        cable({
          code: "99XAA06W001",
          installationStatus: "UNVERIFIED",
          plannedReel: "26",
          lengthM: 7,
        }),
        // Tendido, retirado o a medias: no está pendiente.
        cable({ code: "99XAA07W001", installationStatus: "LAID", plannedReel: "26" }),
        cable({ code: "99XAA08W001", installationStatus: "RETIRED", plannedReel: "26" }),
        cable({ code: "99XAA09W001", installationStatus: "PARTIALLY_LAID", plannedReel: "26" }),
        // El Excel ya apunta su tirada aunque la web no lo tenga tendido.
        cable({ code: "99XAA10W001", plannedReel: "26", lengthM: 5 }),
        // Sin bobina estimada.
        cable({ code: "99XAA11W001", lengthM: 5 }),
      ],
      new Set(["99XAA10W001"]),
    );

    const entries = pending.get("e26") ?? [];
    expect(entries.map((item) => [item.cable.code, item.pulls, item.metres])).toEqual([
      ["99XAA05W001.1", 3, 90],
      ["99XAA06W001", 1, 7],
    ]);
    expect(pending.size).toBe(1);
    expect(reelTotals([], entries)).toEqual({
      pulls: 0,
      usedM: 0,
      withoutMetres: 0,
      pendingPulls: 4,
      pendingM: 97,
    });
  });

  it("marks a pending cable planned for a drum in two pieces in both", () => {
    const pending = pendingByReel(
      match,
      [cable({ code: "99XAB01-W8001", kind: "INSTRUMENTATION", plannedReel: "EJ0003A" })],
      new Set(),
    );

    expect(pending.get("i3")?.[0]?.sharedName).toBe(true);
    expect(pending.get("i3b")?.[0]?.sharedName).toBe(true);
  });

  it("adds the metres of the pullings and counts apart the ones without", () => {
    expect(reelTotals([{ pulledM: 55 }, { pulledM: 52.5 }, { pulledM: null }], [])).toEqual({
      pulls: 3,
      usedM: 107.5,
      withoutMetres: 1,
      pendingPulls: 0,
      pendingM: 0,
    });
  });
});

describe("reelState", () => {
  it("is to check below zero, used up at zero and with metres above", () => {
    expect(reelState(-42)).toBe("review");
    expect(reelState(0)).toBe("empty");
    expect(reelState(94)).toBe("available");
    expect(reelState(null)).toBeNull();
  });
});

describe("parseReelsSearch", () => {
  it("keeps what it knows and drops the rest", () => {
    expect(
      parseReelsSearch({ q: " ej ", kind: "ELECTRICAL", state: "review", size: "100" }),
    ).toEqual({
      q: "ej",
      kind: "ELECTRICAL",
      state: "review",
      sort: undefined,
      page: undefined,
      size: 100,
    });
    expect(parseReelsSearch({ kind: "OTHER", state: "x", size: "7", page: "0" })).toEqual({
      q: undefined,
      kind: undefined,
      state: undefined,
      sort: undefined,
      page: undefined,
      size: undefined,
    });
  });

  it("writes the links without the defaults", () => {
    const search = parseReelsSearch({ q: "ej", sort: "pending", page: "2" });
    expect(reelsQuery(search)).toBe("?q=ej&sort=pending&page=2");
    expect(reelsQuery(search, { page: undefined, sort: "name", size: 50 })).toBe("?q=ej");
  });
});
