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
  looseEnd: null,
  looseEndTray: null,
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
        looseEnd: null,
        looseEndTray: null,
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

describe("UNVERIFIED (sin revisar)", () => {
  // Loaded from the project lists: nobody has checked it yet, and it has no physical location.
  const unverified: CableState = {
    ...inStock,
    installationStatus: "UNVERIFIED",
    currentLocationId: null,
  };

  it("is a coherent state without a location", () => {
    expect(validateCableState(unverified)).toBeNull();
    expect(validateCableState({ ...unverified, connectionStatus: "CONNECTED" })).toMatch(
      /Solo un cable tendido/,
    );
  });

  // Revisión F0-F7 (B15): una corrección podía dejarlo "sin revisar" y con ubicación.
  it("cannot have a physical location", () => {
    expect(validateCableState({ ...unverified, currentLocationId: "store" })).toMatch(
      /Un cable sin revisar no tiene ubicación/,
    );
    const outcome = applyCableAction(inStock, {
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "UNVERIFIED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: inStock.currentLocationId,
      looseEnd: null,
      looseEndTray: null,
    });
    expect(outcome.ok).toBe(false);
  });

  it("is registered as found: laid, partially laid, coiled or retired", () => {
    expect(nextOf(unverified, { action: "LAID" }).changes.installationStatus).toEqual({
      from: "UNVERIFIED",
      to: "LAID",
    });
    expect(
      nextOf(unverified, {
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: "99UXA00L22036",
      }).next.installationStatus,
    ).toBe("PARTIALLY_LAID");
    expect(nextOf(unverified, { action: "COILED", locationId: "site-a" }).next).toMatchObject({
      installationStatus: "COILED",
      currentLocationId: "site-a",
    });
    expect(nextOf(unverified, { action: "RETIRED" }).next.currentLocationId).toBeNull();
  });

  it("cannot be moved or connected before somebody checks it", () => {
    expect(errorOf(unverified, { action: "MOVED", locationId: "site-a" })).toMatch(
      /registra primero cómo está/,
    );
    expect(errorOf(unverified, { action: "CONNECTED", end: "ORIGIN" })).toMatch(
      /Solo se puede conectar un cable tendido/,
    );
  });

  it("can be laid when only the equipment of each end is known", () => {
    // The server passes the equipment tag when the list gives no room.
    const fromLists = { ...unverified, originId: "99BMA", destinationId: "99XAB10AP001" };
    expect(nextOf(fromLists, { action: "LAID" }).next.installationStatus).toBe("LAID");
  });
});

describe("PARTIALLY_LAID (tender a medias)", () => {
  const partial: CableState = {
    ...laid,
    installationStatus: "PARTIALLY_LAID",
    connectionStatus: "ORIGIN_ONLY",
    looseEnd: "DESTINATION",
    looseEndTray: "99UXA00L22036",
  };

  it("leaves one end waiting in a tray, from stock or coiled", () => {
    for (const state of [inStock, coiled]) {
      const outcome = nextOf(state, {
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: " 99uxa00l22036 ",
      });
      expect(outcome.next).toEqual({
        installationStatus: "PARTIALLY_LAID",
        connectionStatus: "DISCONNECTED",
        currentLocationId: null,
        looseEnd: "DESTINATION",
        looseEndTray: "99UXA00L22036",
      });
      expect(outcome.changes.looseEndTray).toEqual({ from: null, to: "99UXA00L22036" });
    }
  });

  it("pulls back the free end of a laid cable that is connected only at the other end", () => {
    const outcome = nextOf(
      { ...laid, connectionStatus: "ORIGIN_ONLY" },
      { action: "PARTIALLY_LAID", looseEnd: "DESTINATION", trayCode: "99UXA00L22036" },
    );

    expect(outcome.next.connectionStatus).toBe("ORIGIN_ONLY");
  });

  it("refuses to leave a connected end loose", () => {
    expect(
      errorOf(
        { ...laid, connectionStatus: "ORIGIN_ONLY" },
        { action: "PARTIALLY_LAID", looseEnd: "ORIGIN", trayCode: "99UXA00L22036" },
      ),
    ).toBe("La punta de origen está conectada: desconéctala antes de dejarla suelta.");
  });

  it("moves the loose end to another tray, and rejects the same tray", () => {
    const outcome = nextOf(partial, {
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99UXA00L22051",
    });
    expect(Object.keys(outcome.changes)).toEqual(["looseEndTray"]);

    expect(
      errorOf(partial, {
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: "99UXA00L22036",
      }),
    ).toMatch(/no cambia nada/);
  });

  it("needs origin and destination, like laying", () => {
    expect(
      errorOf(
        { ...inStock, destinationId: null },
        { action: "PARTIALLY_LAID", looseEnd: "DESTINATION", trayCode: "99UXA00L22036" },
      ),
    ).toMatch(/origen y su destino/);
  });

  it("connects only the end that arrived", () => {
    const outcome = nextOf(
      { ...partial, connectionStatus: "DISCONNECTED" },
      { action: "CONNECTED", end: "ORIGIN" },
    );
    expect(outcome.next.connectionStatus).toBe("ORIGIN_ONLY");

    for (const end of ["DESTINATION", "BOTH"] as const) {
      expect(errorOf(partial, { action: "CONNECTED", end })).toBe(
        "La punta de destino sigue suelta en la bandeja 99UXA00L22036: termina de tender el cable antes de conectarla.",
      );
    }
  });

  it("completes the laying, keeping the end already connected", () => {
    const outcome = nextOf(partial, { action: "LAID" });

    expect(outcome.next).toEqual({
      installationStatus: "LAID",
      connectionStatus: "ORIGIN_ONLY",
      currentLocationId: null,
      looseEnd: null,
      looseEndTray: null,
    });
    expect(Object.keys(outcome.changes)).toEqual([
      "installationStatus",
      "looseEnd",
      "looseEndTray",
    ]);
  });

  it("clears the loose end when the cable is coiled or retired", () => {
    for (const input of [
      { action: "COILED", locationId: "site-a" },
      { action: "RETIRED" },
    ] as const) {
      const outcome = nextOf(partial, input);
      expect(outcome.next).toMatchObject({
        connectionStatus: "DISCONNECTED",
        looseEnd: null,
        looseEndTray: null,
      });
    }
    expect(nextOf(partial, { action: "RETIRED" }).next.currentLocationId).toBeNull();
  });

  it("is not moved like a cable in stock", () => {
    expect(errorOf(partial, { action: "MOVED", locationId: "site-a" })).toMatch(
      /primero enróllalo/,
    );
  });

  it("is offered to technicians with the reason when it cannot be used", () => {
    expect(canRunCableAction("TECHNICIAN", "PARTIALLY_LAID")).toBe(true);
    expect(canRunCableAction("VIEWER", "PARTIALLY_LAID")).toBe(false);

    const actions = Object.fromEntries(
      cableActionAvailability("TECHNICIAN", { ...laid, connectionStatus: "CONNECTED" }).map(
        (item) => [item.action, item.disabledReason],
      ),
    );
    expect(actions.PARTIALLY_LAID).toMatch(/desconéctala/);
    // A partially laid cable can move its loose end to another tray.
    const fromPartial = cableActionAvailability("TECHNICIAN", partial);
    expect(fromPartial.find((item) => item.action === "PARTIALLY_LAID")?.disabledReason).toBeNull();
  });
});

describe("validateCableState with a loose end", () => {
  const values = {
    installationStatus: "PARTIALLY_LAID",
    connectionStatus: "DISCONNECTED",
    currentLocationId: null,
    looseEnd: "DESTINATION",
    looseEndTray: "99UXA00L22036",
    ...route,
  } as const;

  it("accepts a partially laid cable with its loose end and tray", () => {
    expect(validateCableState(values)).toBeNull();
  });

  it("requires the loose end and the tray of a partially laid cable", () => {
    expect(validateCableState({ ...values, looseEndTray: null })).toMatch(/qué punta/);
    expect(validateCableState({ ...values, looseEnd: null })).toMatch(/qué punta/);
  });

  it("rejects a loose end that is connected", () => {
    expect(validateCableState({ ...values, connectionStatus: "CONNECTED" })).toMatch(
      /No se puede conectar la punta de destino/,
    );
  });

  it("rejects a loose end on a cable that is not partially laid", () => {
    expect(validateCableState({ ...values, installationStatus: "LAID" })).toMatch(
      /Solo un cable tendido a medias/,
    );
  });
});

describe("COILED (enrollar)", () => {
  it("coils a laid and connected cable, disconnecting it and recording the move", () => {
    const outcome = nextOf(connected, { action: "COILED", locationId: "site-b" });

    expect(outcome.next).toEqual({
      installationStatus: "COILED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: "site-b",
      looseEnd: null,
      looseEndTray: null,
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
      looseEnd: null,
      looseEndTray: null,
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
    looseEnd: null,
    looseEndTray: null,
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
        looseEnd: null,
        looseEndTray: null,
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

    expect(Object.keys(actions)).toEqual([
      "LAID",
      "PARTIALLY_LAID",
      "COILED",
      "CONNECTED",
      "DISCONNECTED",
      "MOVED",
    ]);
    expect(actions.CONNECTED).toBeNull();
    expect(actions.PARTIALLY_LAID).toBeNull();
    expect(actions.COILED).toBeNull();
    expect(actions.LAID).toMatch(/ya está tendido/);
    // Sin ningún extremo conectado, el motivo no habla de "ese extremo".
    expect(actions.DISCONNECTED).toBe("El cable no está conectado.");
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

  it("parses a partial laying and normalizes the tray code", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: " 99uxa00l22036 ",
    });

    expect(toCableActionInput(request)).toEqual({
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99UXA00L22036",
    });
  });

  it("requires the loose end and a valid tray code for a partial laying", () => {
    const result = cableActionSchema.safeParse({
      ...base,
      action: "PARTIALLY_LAID",
      trayCode: "bandeja 1; drop",
    });

    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message);
    expect(messages).toContain("Elige qué punta queda suelta");
    expect(messages).toContain("El código de bandeja solo admite letras, números, '_', '-' y '.'");
  });

  it("parses a correction to a partially laid state", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "PARTIALLY_LAID",
      connectionStatus: "ORIGIN_ONLY",
      currentLocationId: "",
      looseEnd: "DESTINATION",
      looseEndTray: "99UXA00L22036",
      notes: "La punta no llegó",
    });

    expect(toCableActionInput(request)).toMatchObject({
      looseEnd: "DESTINATION",
      looseEndTray: "99UXA00L22036",
    });
  });

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
      looseEnd: null,
      looseEndTray: null,
    });
  });
});
