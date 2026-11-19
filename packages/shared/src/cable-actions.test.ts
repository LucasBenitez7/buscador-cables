import { permissionsOfRole } from "./permissions";
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

const notLaid: CableState = {
  installationStatus: "NOT_LAID",
  connectionStatus: "DISCONNECTED",
  testStatus: "NOT_TESTED",
  looseEnd: null,
  looseEndTray: null,
  ...route,
  deleted: false,
};
const laid: CableState = { ...notLaid, installationStatus: "LAID" };
const connected: CableState = { ...laid, connectionStatus: "CONNECTED" };
const retired: CableState = { ...notLaid, installationStatus: "RETIRED" };

function errorOf(state: CableState, input: CableActionInput) {
  const outcome = applyCableAction(state, input);
  return outcome.ok ? null : outcome.error;
}

/** The part of a state an action can change. */
const stateValues = ({
  installationStatus,
  connectionStatus,
  testStatus,
  looseEnd,
  looseEndTray,
}: CableState) => ({
  installationStatus,
  connectionStatus,
  testStatus,
  looseEnd,
  looseEndTray,
});

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

  // Fase 14: ya no se enrolla ni se mueve un cable; los eventos antiguos los conservan.
  it("no longer offer coiling or moving a cable", () => {
    expect(CABLE_FIELD_ACTIONS).not.toContain("COILED");
    expect(CABLE_FIELD_ACTIONS).not.toContain("MOVED");
    expect(CABLE_ACTIONS).toContain("COILED");
    expect(CABLE_ACTIONS).toContain("MOVED");
    for (const action of ["COILED", "MOVED"]) {
      const request = { cableId: "c1", version: "1", action, locationId: "x" };
      expect(cableActionSchema.safeParse(request).success).toBe(false);
    }
  });
});

describe("LAID (tender)", () => {
  it("lays a cable that is not laid yet or has no data", () => {
    for (const state of [notLaid, { ...notLaid, installationStatus: "UNVERIFIED" as const }]) {
      const outcome = nextOf(state, { action: "LAID" });
      expect(outcome.next).toEqual({
        installationStatus: "LAID",
        connectionStatus: "DISCONNECTED",
        testStatus: "NOT_TESTED",
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
    expect(errorOf({ ...notLaid, destinationId: null }, { action: "LAID" })).toMatch(
      /origen y su destino/,
    );
  });

  it("rejects a cable already laid", () => {
    expect(errorOf(laid, { action: "LAID" })).toMatch(/ya está tendido/);
  });
});

describe("UNVERIFIED (sin revisar)", () => {
  // No data in any Excel: nobody has checked it yet.
  const unverified: CableState = { ...notLaid, installationStatus: "UNVERIFIED" };

  it("is a coherent state, never connected", () => {
    expect(validateCableState(unverified)).toBeNull();
    expect(validateCableState({ ...unverified, connectionStatus: "CONNECTED" })).toMatch(
      /Solo un cable tendido/,
    );
  });

  it("is registered as found: laid, partially laid or retired", () => {
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
    expect(nextOf(unverified, { action: "RETIRED" }).next.installationStatus).toBe("RETIRED");
  });

  it("cannot be connected before somebody lays it", () => {
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

  it("leaves one end waiting in a tray of a cable not laid yet", () => {
    for (const state of [notLaid]) {
      const outcome = nextOf(state, {
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: " 99uxa00l22036 ",
      });
      expect(outcome.next).toEqual({
        installationStatus: "PARTIALLY_LAID",
        connectionStatus: "DISCONNECTED",
        testStatus: "NOT_TESTED",
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
        { ...notLaid, destinationId: null },
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
      testStatus: "NOT_TESTED",
      looseEnd: null,
      looseEndTray: null,
    });
    expect(Object.keys(outcome.changes)).toEqual([
      "installationStatus",
      "looseEnd",
      "looseEndTray",
    ]);
  });

  it("clears the loose end when the cable is retired", () => {
    expect(nextOf(partial, { action: "RETIRED" }).next).toMatchObject({
      connectionStatus: "DISCONNECTED",
      looseEnd: null,
      looseEndTray: null,
    });
  });

  it("is offered to technicians with the reason when it cannot be used", () => {
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "PARTIALLY_LAID")).toBe(true);
    expect(canRunCableAction(permissionsOfRole("VIEWER"), "PARTIALLY_LAID")).toBe(false);

    const actions = Object.fromEntries(
      cableActionAvailability(permissionsOfRole("TECHNICIAN"), {
        ...laid,
        connectionStatus: "CONNECTED",
      }).map((item) => [item.action, item.disabledReason]),
    );
    expect(actions.PARTIALLY_LAID).toMatch(/desconéctala/);
    // A partially laid cable can move its loose end to another tray.
    const fromPartial = cableActionAvailability(permissionsOfRole("TECHNICIAN"), partial);
    expect(fromPartial.find((item) => item.action === "PARTIALLY_LAID")?.disabledReason).toBeNull();
  });
});

describe("validateCableState with a loose end", () => {
  const values = {
    installationStatus: "PARTIALLY_LAID",
    connectionStatus: "DISCONNECTED",
    testStatus: "NOT_TESTED",
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
    for (const state of [notLaid, { ...notLaid, installationStatus: "UNVERIFIED" as const }]) {
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

describe("RETIRED (retirar)", () => {
  it("retires a connected cable and disconnects it in the same step", () => {
    const outcome = nextOf(connected, { action: "RETIRED" });

    expect(outcome.next).toEqual({
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      testStatus: "NOT_TESTED",
      looseEnd: null,
      looseEndTray: null,
    });
    expect(Object.keys(outcome.changes)).toEqual(["installationStatus", "connectionStatus"]);
  });

  it("blocks every other action on a retired cable", () => {
    const attempts: CableActionInput[] = [
      { action: "LAID" },
      { action: "CONNECTED", end: "BOTH" },
      { action: "TESTED", result: "OK" },
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
    testStatus: "NOT_TESTED",
    looseEnd: null,
    looseEndTray: null,
  } as const;

  it("sets the corrected state, also on a retired cable", () => {
    const outcome = nextOf(retired, {
      ...correction,
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
    });

    expect(outcome.next.installationStatus).toBe("NOT_LAID");
  });

  it("can take a cable back to «Sin revisar»", () => {
    const outcome = nextOf(laid, {
      ...correction,
      installationStatus: "UNVERIFIED",
      connectionStatus: "DISCONNECTED",
    });

    expect(outcome.changes.installationStatus).toEqual({ from: "LAID", to: "UNVERIFIED" });
  });

  it("rejects incoherent target states", () => {
    expect(
      errorOf(notLaid, {
        ...correction,
        installationStatus: "NOT_LAID",
        connectionStatus: "CONNECTED",
      }),
    ).toMatch(/Solo un cable tendido/);
  });

  it("rejects a correction that changes nothing", () => {
    expect(
      errorOf(notLaid, {
        ...correction,
        installationStatus: "NOT_LAID",
        connectionStatus: "DISCONNECTED",
      }),
    ).toMatch(/no cambia nada/);
  });
});

describe("deleted cables", () => {
  it("accept no action at all", () => {
    expect(errorOf({ ...notLaid, deleted: true }, { action: "LAID" })).toMatch(/dado de baja/);
  });
});

describe("TESTED (timbrar)", () => {
  it("records a correct timbrado without touching the rest of the state", () => {
    const outcome = nextOf(notLaid, { action: "TESTED", result: "OK" });

    expect(outcome.next).toEqual({ ...stateValues(notLaid), testStatus: "TESTED_OK" });
    expect(outcome.changes).toEqual({
      testStatus: { from: "NOT_TESTED", to: "TESTED_OK" },
    });
  });

  it("records a failed one, and a new one replaces it", () => {
    const failed = { ...notLaid, testStatus: "TESTED_FAILED" as const };

    expect(nextOf(notLaid, { action: "TESTED", result: "FAILED" }).next.testStatus).toBe(
      "TESTED_FAILED",
    );
    expect(nextOf(failed, { action: "TESTED", result: "OK" }).next.testStatus).toBe("TESTED_OK");
  });

  it("refuses the same result twice, and keeps the timbrado when the cable is laid", () => {
    const tested = { ...notLaid, testStatus: "TESTED_OK" as const };

    expect(applyCableAction(tested, { action: "TESTED", result: "OK" })).toEqual({
      ok: false,
      error: "El cable ya consta como timbrado correctamente.",
    });
    expect(nextOf(tested, { action: "LAID" }).next.testStatus).toBe("TESTED_OK");
  });

  it("is a technician's action, not a viewer's", () => {
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "TESTED")).toBe(true);
    expect(canRunCableAction(permissionsOfRole("VIEWER"), "TESTED")).toBe(false);
  });

  it("requires a note saying what failed", () => {
    const request = { cableId: "c1", version: "1", action: "TESTED" };

    expect(cableActionSchema.safeParse({ ...request, result: "OK" }).success).toBe(true);
    const failed = cableActionSchema.safeParse({ ...request, result: "FAILED", notes: "" });
    expect(failed.success).toBe(false);
    expect(failed.error?.issues[0]).toMatchObject({ path: ["notes"], message: "Indica qué falló" });
    expect(
      cableActionSchema.safeParse({ ...request, result: "FAILED", notes: "Conductor 3 abierto" })
        .success,
    ).toBe(true);
  });
});

describe("permissions", () => {
  it("lets technicians do field work but not retire or correct", () => {
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "CONNECTED")).toBe(true);
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "LAID")).toBe(true);
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "RETIRED")).toBe(false);
    expect(canRunCableAction(permissionsOfRole("TECHNICIAN"), "CORRECTION")).toBe(false);
  });

  it("lets supervisors and admins run every action and viewers none", () => {
    for (const action of CABLE_FIELD_ACTIONS) {
      expect(canRunCableAction(permissionsOfRole("SUPERVISOR"), action)).toBe(true);
      expect(canRunCableAction(permissionsOfRole("ADMIN"), action)).toBe(true);
      expect(canRunCableAction(permissionsOfRole("VIEWER"), action)).toBe(false);
    }
  });
});

describe("cableActionAvailability", () => {
  const byAction = (role: Role, state: CableState) =>
    Object.fromEntries(
      cableActionAvailability(permissionsOfRole(role), state).map((item) => [
        item.action,
        item.disabledReason,
      ]),
    );

  it("shows nothing to viewers", () => {
    expect(cableActionAvailability(permissionsOfRole("VIEWER"), laid)).toEqual([]);
  });

  it("enables only what makes sense for a laid, disconnected cable", () => {
    const actions = byAction("TECHNICIAN", laid);

    expect(Object.keys(actions)).toEqual([
      "LAID",
      "PARTIALLY_LAID",
      "CONNECTED",
      "DISCONNECTED",
      "TESTED",
    ]);
    expect(actions.CONNECTED).toBeNull();
    expect(actions.TESTED).toBeNull();
    expect(actions.PARTIALLY_LAID).toBeNull();
    expect(actions.LAID).toMatch(/ya está tendido/);
    // Sin ningún extremo conectado, el motivo no habla de "ese extremo".
    expect(actions.DISCONNECTED).toBe("El cable no está conectado.");
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
    expect(actions.LAID).toMatch(/retirado/);
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
      testStatus: "NOT_TESTED",
      looseEnd: "DESTINATION",
      looseEndTray: "99UXA00L22036",
      notes: "La punta no llegó",
    });

    expect(toCableActionInput(request)).toMatchObject({
      looseEnd: "DESTINATION",
      looseEndTray: "99UXA00L22036",
    });
  });

  it("parses a connection from FormData strings", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "CONNECTED",
      end: "BOTH",
      notes: "  ",
    });

    expect(request).toEqual({
      cableId: "c1",
      version: 3,
      action: "CONNECTED",
      end: "BOTH",
      notes: null,
    });
    expect(toCableActionInput(request)).toEqual({ action: "CONNECTED", end: "BOTH" });
  });

  it("requires a reason to retire or correct", () => {
    const retire = cableActionSchema.safeParse({ ...base, action: "RETIRED", notes: " " });
    expect(retire.success).toBe(false);
    expect(retire.error?.issues[0]?.message).toBe("Indica el motivo");
  });

  it("requires the end to connect", () => {
    expect(cableActionSchema.safeParse({ ...base, action: "CONNECTED" }).success).toBe(false);
  });

  it("rejects unknown actions and creation-only actions", () => {
    for (const action of ["CREATED", "DELETED", "HACK"]) {
      expect(cableActionSchema.safeParse({ ...base, action }).success, action).toBe(false);
    }
  });

  it("parses a correction", () => {
    const request = cableActionSchema.parse({
      ...base,
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      testStatus: "TESTED_OK",
      notes: "Se marcó tendido por error",
    });

    expect(toCableActionInput(request)).toEqual({
      action: "CORRECTION",
      correctsEventId: "e1",
      installationStatus: "RETIRED",
      connectionStatus: "DISCONNECTED",
      testStatus: "TESTED_OK",
      looseEnd: null,
      looseEndTray: null,
    });
  });
});
