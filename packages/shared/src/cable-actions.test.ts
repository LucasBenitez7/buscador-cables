import { describe, expect, it } from "vitest";
import {
  CABLE_FIELD_ACTIONS,
  applyCableAction,
  cableActionAvailability,
  cableActionSchema,
  canRunCableAction,
  toCableActionInput,
  validateCableState,
  type CableActionInput,
  type CableState,
} from "./cable-actions";
import { CABLE_ACTIONS } from "./cables";
import type { Role } from "./permissions";

const route = { originId: "origin", destinationId: "destination" };

const inStock: CableState = {
  installationStatus: "IN_STOCK",
  connectionStatus: "DISCONNECTED",
  currentLocationId: "store",
  ...route,
  deleted: false,
};
const coiled: CableState = {
  ...inStock,
  installationStatus: "COILED",
  currentLocationId: "site-a",
};
const laid: CableState = { ...inStock, installationStatus: "LAID", currentLocationId: null };
const connected: CableState = { ...laid, connectionStatus: "CONNECTED" };
const retired: CableState = { ...inStock, installationStatus: "RETIRED" };

function errorOf(state: CableState, input: CableActionInput) {
  const outcome = applyCableAction(state, input);
  return outcome.ok ? null : outcome.error;
}

function nextOf(state: CableState, input: CableActionInput) {
  const outcome = applyCableAction(state, input);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

describe("field actions", () => {
  it("are all CableAction members", () => {
    for (const action of CABLE_FIELD_ACTIONS) {
      expect(CABLE_ACTIONS).toContain(action);
    }
  });
});

describe("LAID (tender)", () => {
  it("lays a cable from stock or coiled, clearing its physical location", () => {
    for (const state of [inStock, coiled]) {
      const outcome = nextOf(state, { action: "LAID" });
      expect(outcome.next).toEqual({
        installationStatus: "LAID",
        connectionStatus: "DISCONNECTED",
        currentLocationId: null,
      });
      expect(outcome.changes.installationStatus).toEqual({
        from: state.installationStatus,
        to: "LAID",
      });
    }
  });

  it("needs origin and destination", () => {
    expect(errorOf({ ...inStock, destinationId: null }, { action: "LAID" })).toMatch(
      /origen y su destino/,
    );
  });

  it("rejects a cable already laid", () => {
    expect(errorOf(laid, { action: "LAID" })).toMatch(/ya está tendido/);
  });
});

describe("COILED (enrollar)", () => {
  it("coils a laid and connected cable, disconnecting it and recording the move", () => {
    const outcome = nextOf(connected, { action: "COILED", locationId: "site-b" });

    expect(outcome.next).toEqual({
      installationStatus: "COILED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: "site-b",
    });
    expect(outcome.changes.connectionStatus).toEqual({ from: "CONNECTED", to: "DISCONNECTED" });
    expect(outcome).toMatchObject({ fromLocationId: null, toLocationId: "site-b" });
  });

  it("points to Mover for a cable that is already coiled", () => {
    expect(errorOf(coiled, { action: "COILED", locationId: "site-b" })).toMatch(/usa Mover/);
  });
});

describe("CONNECTED / DISCONNECTED (conectar / desconectar)", () => {
  it("connects end by end until both are connected", () => {
    const origin = nextOf(laid, { action: "CONNECTED", end: "ORIGIN" });
    expect(origin.next.connectionStatus).toBe("ORIGIN_ONLY");

    const both = nextOf(
      { ...laid, connectionStatus: "ORIGIN_ONLY" },
      { action: "CONNECTED", end: "DESTINATION" },
    );
    expect(both.next.connectionStatus).toBe("CONNECTED");
  });

  it("connects both ends at once", () => {
    expect(nextOf(laid, { action: "CONNECTED", end: "BOTH" }).next.connectionStatus).toBe(
      "CONNECTED",
    );
  });

  it("only connects laid cables", () => {
    for (const state of [inStock, coiled]) {
      expect(errorOf(state, { action: "CONNECTED", end: "ORIGIN" })).toMatch(/tendido/);
    }
  });

  it("rejects connecting an end that is already connected", () => {
    expect(errorOf(connected, { action: "CONNECTED", end: "ORIGIN" })).toMatch(/ya está conectado/);
  });

  it("disconnects one end and leaves the other", () => {
    expect(nextOf(connected, { action: "DISCONNECTED", end: "ORIGIN" }).next.connectionStatus).toBe(
      "DESTINATION_ONLY",
    );
    expect(nextOf(connected, { action: "DISCONNECTED", end: "BOTH" }).next.connectionStatus).toBe(
      "DISCONNECTED",
    );
  });

  it("rejects disconnecting an end that is not connected", () => {
    expect(
      errorOf(
        { ...laid, connectionStatus: "ORIGIN_ONLY" },
        { action: "DISCONNECTED", end: "DESTINATION" },
      ),
    ).toMatch(/no está conectado/);
  });
});

describe("MOVED (mover)", () => {
  it("moves a cable in stock or coiled and records where from and to", () => {
    const outcome = nextOf(coiled, { action: "MOVED", locationId: "site-b" });

    expect(outcome.next.currentLocationId).toBe("site-b");
    expect(outcome.changes).toEqual({ currentLocationId: { from: "site-a", to: "site-b" } });
    expect(outcome).toMatchObject({ fromLocationId: "site-a", toLocationId: "site-b" });
  });

  it("does not move a laid cable", () => {
    expect(errorOf(laid, { action: "MOVED", locationId: "site-b" })).toMatch(/primero enróllalo/);
  });

  it("rejects moving to the same location", () => {
    expect(errorOf(coiled, { action: "MOVED", locationId: "site-a" })).toMatch(/ya está en esa/);
  });
});

describe("RETIRED (retirar)", () => {
  it("retires a connected cable and disconnects it in the same step", () => {
    const outcome = nextOf(connected, { action: "RETIRED" });

    expect(outcome.next).toEqual({
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: null,
    });
    expect(Object.keys(outcome.changes)).toEqual(["installationStatus", "connectionStatus"]);
  });

  it("keeps the location of a retired cable that was in stock", () => {
    expect(nextOf(inStock, { action: "RETIRED" }).next.currentLocationId).toBe("store");
  });

  it("blocks every other action on a retired cable", () => {
    const attempts: CableActionInput[] = [
      { action: "LAID" },
      { action: "COILED", locationId: "x" },
      { action: "CONNECTED", end: "BOTH" },
      { action: "MOVED", locationId: "x" },
      { action: "RETIRED" },
    ];
    for (const attempt of attempts) {
      expect(errorOf(retired, attempt), attempt.action).toMatch(/retirado/);
    }
  });
});

describe("CORRECTION (corregir)", () => {
  const correction = {
    action: "CORRECTION",
    correctsEventId: "event-1",
  } as const;

  it("sets the corrected state, also on a retired cable", () => {
    const outcome = nextOf(retired, {
      ...correction,
      installationStatus: "IN_STOCK",
      connectionStatus: "DISCONNECTED",
      currentLocationId: "store",
    });

    expect(outcome.next.installationStatus).toBe("IN_STOCK");
  });

  it("rejects incoherent target states", () => {
    expect(
      errorOf(inStock, {
        ...correction,
        installationStatus: "COILED",
        connectionStatus: "CONNECTED",
        currentLocationId: "site-a",
      }),
    ).toMatch(/Solo un cable tendido/);
    expect(
      errorOf(inStock, {
        ...correction,
        installationStatus: "COILED",
        connectionStatus: "DISCONNECTED",
        currentLocationId: null,
      }),
    ).toMatch(/Indica dónde está/);
  });

  it("rejects a correction that changes nothing", () => {
    expect(
      errorOf(inStock, {
        ...correction,
        installationStatus: "IN_STOCK",
        connectionStatus: "DISCONNECTED",
        currentLocationId: "store",
      }),
    ).toMatch(/no cambia nada/);
  });
});

describe("deleted cables", () => {
  it("accept no action at all", () => {
    expect(errorOf({ ...inStock, deleted: true }, { action: "MOVED", locationId: "x" })).toMatch(
      /dado de baja/,
    );
  });
});

describe("validateCableState", () => {
  it("rejects a laid cable that still has a physical location", () => {
    expect(
      validateCableState({
        installationStatus: "LAID",
        connectionStatus: "DISCONNECTED",
        currentLocationId: "store",
        ...route,
      }),
    ).toMatch(/no tiene ubicación física/);
  });
});

describe("permissions", () => {
  it("lets technicians do field work but not retire or correct", () => {
    expect(canRunCableAction("TECHNICIAN", "CONNECTED")).toBe(true);
    expect(canRunCableAction("TECHNICIAN", "MOVED")).toBe(true);
    expect(canRunCableAction("TECHNICIAN", "RETIRED")).toBe(false);
    expect(canRunCableAction("TECHNICIAN", "CORRECTION")).toBe(false);
  });

  it("lets supervisors and admins run every action and viewers none", () => {
    for (const action of CABLE_FIELD_ACTIONS) {
      expect(canRunCableAction("SUPERVISOR", action)).toBe(true);
      expect(canRunCableAction("ADMIN", action)).toBe(true);
      expect(canRunCableAction("VIEWER", action)).toBe(false);
    }
  });
});

describe("cableActionAvailability", () => {
  const byAction = (role: Role, state: CableState) =>
    Object.fromEntries(
      cableActionAvailability(role, state).map((item) => [item.action, item.disabledReason]),
    );

  it("shows nothing to viewers", () => {
    expect(cableActionAvailability("VIEWER", laid)).toEqual([]);
  });

  it("enables only what makes sense for a laid, disconnected cable", () => {
    const actions = byAction("TECHNICIAN", laid);

    expect(Object.keys(actions)).toEqual(["LAID", "COILED", "CONNECTED", "DISCONNECTED", "MOVED"]);
    expect(actions.CONNECTED).toBeNull();
    expect(actions.COILED).toBeNull();
    expect(actions.LAID).toMatch(/ya está tendido/);
    expect(actions.DISCONNECTED).toMatch(/no está conectado/);
    expect(actions.MOVED).toMatch(/primero enróllalo/);
  });

  it("enables connecting the missing end of a half-connected cable", () => {
    const actions = byAction("TECHNICIAN", { ...laid, connectionStatus: "ORIGIN_ONLY" });

    expect(actions.CONNECTED).toBeNull();
    expect(actions.DISCONNECTED).toBeNull();
  });

  it("lets a supervisor correct a retired cable but nothing else", () => {
    const actions = byAction("SUPERVISOR", retired);

    expect(actions.CORRECTION).toBeNull();
    expect(actions.RETIRED).toMatch(/retirado/);
    expect(actions.MOVED).toMatch(/retirado/);
  });
});

describe("cableActionSchema", () => {
  const base = { cableId: "c1", version: "3" };

  it("parses a move from FormData strings", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "MOVED",
      locationId: "site-b",
      notes: "  ",
    });

    expect(request).toEqual({
      cableId: "c1",
      version: 3,
      action: "MOVED",
      locationId: "site-b",
      notes: null,
    });
    expect(toCableActionInput(request)).toEqual({ action: "MOVED", locationId: "site-b" });
  });

  it("requires a reason to retire or correct", () => {
    const retire = cableActionSchema.safeParse({ ...base, action: "RETIRED", notes: " " });
    expect(retire.success).toBe(false);
    expect(retire.error?.issues[0]?.message).toBe("Indica el motivo");
  });

  it("requires the end to connect and the location to move", () => {
    expect(cableActionSchema.safeParse({ ...base, action: "CONNECTED" }).success).toBe(false);
    expect(cableActionSchema.safeParse({ ...base, action: "MOVED", locationId: "" }).success).toBe(
      false,
    );
  });

  it("rejects unknown actions and creation-only actions", () => {
    for (const action of ["CREATED", "DELETED", "HACK"]) {
      expect(cableActionSchema.safeParse({ ...base, action }).success, action).toBe(false);
    }
  });

  it("parses a correction with an optional location", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: "",
      notes: "Se marcó tendido por error",
    });

    expect(toCableActionInput(request)).toEqual({
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: null,
    });
  });
});
