import { describe, expect, it } from "vitest";
import { describeCableEvent, orderedChanges } from "./cable-history";
import type { CableAction } from "./cables";

const event = (
  action: CableAction,
  extra: Partial<Parameters<typeof describeCableEvent>[0]> = {},
) => describeCableEvent({ action, changes: {}, fromLocation: null, toLocation: null, ...extra });

const connection = (from: string, to: string) => ({ connectionStatus: { from, to } });

describe("describeCableEvent", () => {
  it("says which end was connected or disconnected", () => {
    expect(event("CONNECTED", { changes: connection("DISCONNECTED", "ORIGIN_ONLY") })).toBe(
      "conectó el extremo de origen",
    );
    expect(event("CONNECTED", { changes: connection("ORIGIN_ONLY", "CONNECTED") })).toBe(
      "conectó el extremo de destino",
    );
    expect(event("CONNECTED", { changes: connection("DISCONNECTED", "CONNECTED") })).toBe(
      "conectó los dos extremos",
    );
    expect(event("DISCONNECTED", { changes: connection("CONNECTED", "ORIGIN_ONLY") })).toBe(
      "desconectó el extremo de destino",
    );
  });

  it("falls back to a generic sentence when the change is missing", () => {
    expect(event("CONNECTED")).toBe("conectó el cable");
  });

  it("names the locations of moves and coils", () => {
    expect(event("MOVED", { fromLocation: "Almacén", toLocation: "Patio" })).toBe(
      "movió el cable de Almacén a Patio",
    );
    expect(event("MOVED", { toLocation: "Patio" })).toBe("movió el cable a Patio");
    expect(event("COILED", { toLocation: "Patio" })).toBe("enrolló el cable en Patio");
    expect(event("CREATED", { toLocation: "Almacén" })).toBe("dio de alta el cable en Almacén");
  });

  it("covers every other action", () => {
    expect(event("UPDATED")).toBe("editó los datos del cable");
    expect(event("LAID")).toBe("tendió el cable");
    expect(event("RETIRED")).toBe("retiró el cable");
    expect(event("CORRECTION")).toBe("corrigió un movimiento anterior");
    expect(event("DELETED")).toBe("dio de baja el cable");
    expect(event("COILED")).toBe("enrolló el cable");
    expect(event("MOVED")).toBe("movió el cable");
  });
});

describe("partial laying", () => {
  it("says which end waits in which tray", () => {
    expect(
      event("PARTIALLY_LAID", {
        changes: {
          installationStatus: { from: "COILED", to: "PARTIALLY_LAID" },
          looseEnd: { from: null, to: "DESTINATION" },
          looseEndTray: { from: null, to: "99UXA00L22036" },
        },
      }),
    ).toBe("tendió el cable a medias: la punta de destino espera en la bandeja 99UXA00L22036");
  });

  it("says where the loose end was taken", () => {
    expect(
      event("PARTIALLY_LAID", {
        changes: { looseEndTray: { from: "99UXA00L22036", to: "99UXA00L22051" } },
      }),
    ).toBe("llevó la punta suelta de la bandeja 99UXA00L22036 a la 99UXA00L22051");
  });

  it("falls back to a generic sentence without the tray", () => {
    expect(event("PARTIALLY_LAID")).toBe("tendió el cable a medias");
  });

  it("tells completing a partial laying from a plain laying", () => {
    expect(
      event("LAID", {
        changes: { installationStatus: { from: "PARTIALLY_LAID", to: "LAID" } },
      }),
    ).toBe("terminó de tender el cable");
    expect(event("LAID")).toBe("tendió el cable");
  });

  it("shows the loose end after the location", () => {
    const fields = orderedChanges({
      looseEndTray: { from: null, to: "T" },
      currentLocationId: { from: "a", to: null },
      looseEnd: { from: null, to: "ORIGIN" },
    }).map(([field]) => field);
    expect(fields).toEqual(["currentLocationId", "looseEnd", "looseEndTray"]);
  });
});

describe("orderedChanges", () => {
  // Regresión: Postgres guarda `jsonb` con otro orden de claves y la ficha los mostraba desordenados.
  it("orders the fields like the cable form, then the states", () => {
    const fields = orderedChanges({
      connectionStatus: { from: "CONNECTED", to: "DISCONNECTED" },
      currentLocationId: { from: null, to: "yard" },
      installationStatus: { from: "LAID", to: "COILED" },
      code: { from: "SH-5", to: "SH-50" },
      zeta: { from: 1, to: 2 },
    }).map(([field]) => field);

    expect(fields).toEqual([
      "code",
      "installationStatus",
      "connectionStatus",
      "currentLocationId",
      "zeta",
    ]);
  });

  it("returns nothing for values that are not objects", () => {
    expect(orderedChanges(null)).toEqual([]);
    expect(orderedChanges([1])).toEqual([]);
    expect(orderedChanges("x")).toEqual([]);
  });
});

describe("describeCableEvent: timbrado", () => {
  it("says whether the timbrado was correct or found a fault", () => {
    expect(
      describeCableEvent({
        action: "TESTED",
        changes: { testStatus: { from: "NOT_TESTED", to: "TESTED_OK" } },
        fromLocation: null,
        toLocation: null,
      }),
    ).toBe("timbró el cable: correcto");
    expect(
      describeCableEvent({
        action: "TESTED",
        changes: { testStatus: { from: "TESTED_OK", to: "TESTED_FAILED" } },
        fromLocation: null,
        toLocation: null,
      }),
    ).toBe("timbró el cable y encontró un fallo");
  });
});
