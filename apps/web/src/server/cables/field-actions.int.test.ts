import { randomUUID } from "node:crypto";
import { permissionsOfRole } from "@cables/shared";
import { prisma } from "@cables/db";
import { cableActionSchema, createCableSchema, type Role } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { runCableAction } from "./field-actions";
import { CableServiceError, createCable } from "./service";

type Actor = { id: string; role: Role; permissions: readonly string[] };

let technician: Actor;
let supervisor: Actor;
let places: { origin: string; destination: string; store: string; yard: string };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  const [tech, sup] = await Promise.all(
    [
      { name: "Tomás", role: "TECHNICIAN" as const },
      { name: "Sara", role: "SUPERVISOR" as const },
    ].map((user) =>
      prisma.user.create({
        data: {
          id: randomUUID(),
          name: user.name,
          email: `${user.name}@cables.test`,
          role: user.role,
        },
      }),
    ),
  );
  technician = { id: tech!.id, role: "TECHNICIAN", ...permissionsOfRole("TECHNICIAN") };
  supervisor = { id: sup!.id, role: "SUPERVISOR", ...permissionsOfRole("SUPERVISOR") };

  const plant = await prisma.location.create({
    data: { name: "Norte", code: "N", type: "PLANT", path: "/N" },
  });
  const [origin, destination, store, yard] = await Promise.all(
    ["S1", "S2", "ALM", "PATIO"].map((code) =>
      prisma.location.create({
        data: {
          name: code,
          code: `N-${code}`,
          type: "AREA",
          path: `/N/N-${code}`,
          parentId: plant.id,
        },
      }),
    ),
  );
  places = { origin: origin!.id, destination: destination!.id, store: store!.id, yard: yard!.id };
});

async function newCable(overrides: Record<string, string> = {}) {
  const input = createCableSchema.parse({
    code: "sh50",
    originId: places.origin,
    destinationId: places.destination,
    installationStatus: "NOT_LAID",
    connectionStatus: "DISCONNECTED",
    ...overrides,
  });
  return createCable(technician, input);
}

/** Same path as the dialogs: FormData strings validated by the shared schema. */
async function act(actor: Actor, cableId: string, fields: Record<string, string>) {
  const { version } = await prisma.cable.findUniqueOrThrow({ where: { id: cableId } });
  return runCableAction(
    actor,
    cableActionSchema.parse({ cableId, version: String(version), ...fields }),
  );
}

const cableOf = (id: string) => prisma.cable.findUniqueOrThrow({ where: { id } });
const lastEvent = (cableId: string) =>
  prisma.cableEvent.findFirstOrThrow({ where: { cableId }, orderBy: { createdAt: "desc" } });

describe("runCableAction", () => {
  it("lays a cable: new state, summary columns and an immutable event in one go", async () => {
    const { id } = await newCable();

    const result = await act(technician, id, { action: "LAID", notes: "Bandeja sur" });

    expect(result.message).toBe("Movimiento registrado en SH-50: tendido.");
    const cable = await cableOf(id);
    expect(cable).toMatchObject({
      installationStatus: "LAID",
      connectionStatus: "DISCONNECTED",
      version: 2,
      lastAction: "LAID",
      lastActionById: technician.id,
      installedById: technician.id,
    });
    expect(cable.lastActionAt).toEqual(cable.installedAt);
    expect(await lastEvent(id)).toMatchObject({
      action: "LAID",
      userId: technician.id,
      notes: "Bandeja sur",
      changes: { installationStatus: { from: "NOT_LAID", to: "LAID" } },
    });
  });

  it("connects end by end and records who connected it", async () => {
    const { id } = await newCable();
    await act(technician, id, { action: "LAID" });

    await act(technician, id, { action: "CONNECTED", end: "ORIGIN" });
    expect((await cableOf(id)).connectionStatus).toBe("ORIGIN_ONLY");

    await act(supervisor, id, { action: "CONNECTED", end: "DESTINATION" });
    const cable = await cableOf(id);
    expect(cable).toMatchObject({ connectionStatus: "CONNECTED", connectedById: supervisor.id });
  });

  // Fase 14: ya no se enrolla ni se mueve; la ubicación que tuviera el cable se conserva.
  it("keeps the old current location of a cable untouched", async () => {
    const { id } = await newCable();
    await prisma.cable.update({ where: { id }, data: { currentLocationId: places.store } });

    await act(technician, id, { action: "LAID" });

    expect(await cableOf(id)).toMatchObject({
      installationStatus: "LAID",
      currentLocationId: places.store,
    });
    expect((await lastEvent(id)).changes).toEqual({
      installationStatus: { from: "NOT_LAID", to: "LAID" },
    });
  });

  it("rejects an invalid transition without writing anything", async () => {
    const { id } = await newCable();

    await expect(act(technician, id, { action: "CONNECTED", end: "BOTH" })).rejects.toThrow(
      "Solo se puede conectar un cable tendido.",
    );
    expect(await prisma.cableEvent.count({ where: { cableId: id } })).toBe(1); // only CREATED
    expect((await cableOf(id)).version).toBe(1);
  });

  it("refuses a stale version: somebody else acted in between", async () => {
    const { id } = await newCable();
    const stale = cableActionSchema.parse({ cableId: id, version: "1", action: "LAID" });
    await act(technician, id, { action: "TESTED", result: "OK" });

    await expect(runCableAction(technician, stale)).rejects.toThrow(/Otra persona/);
    expect((await cableOf(id)).installationStatus).toBe("NOT_LAID");
  });

  it("lets only one of two simultaneous actions through", async () => {
    const { id } = await newCable();
    const request = (end: string) =>
      cableActionSchema.parse({
        cableId: id,
        version: "1",
        action: "PARTIALLY_LAID",
        looseEnd: end,
        trayCode: "99UXA00L22036",
        confirmOffRoute: "1",
      });
    await prisma.tray.create({ data: { code: "99UXA00L22036", kind: "LADDER" } });

    const results = await Promise.allSettled([
      runCableAction(technician, request("ORIGIN")),
      runCableAction(supervisor, request("DESTINATION")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" && rejected.reason).toBeInstanceOf(
      CableServiceError,
    );
    expect(
      await prisma.cableEvent.count({ where: { cableId: id, action: "PARTIALLY_LAID" } }),
    ).toBe(1);
    expect((await cableOf(id)).version).toBe(2);
  });

  it("does not let a technician retire a cable", async () => {
    const { id } = await newCable();

    await expect(act(technician, id, { action: "RETIRED", notes: "Dañado" })).rejects.toThrow(
      /permiso/,
    );
  });

  it("retires a cable and lets a supervisor correct it, linking both events", async () => {
    const { id } = await newCable();
    await act(supervisor, id, { action: "RETIRED", notes: "Cubierta dañada" });
    const retirement = await lastEvent(id);

    await act(supervisor, id, {
      action: "CORRECTION",
      correctsEventId: retirement.id,
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
      notes: "Era otro cable",
    });

    expect((await cableOf(id)).installationStatus).toBe("NOT_LAID");
    expect(await lastEvent(id)).toMatchObject({
      action: "CORRECTION",
      correctsEventId: retirement.id,
      notes: "Era otro cable",
    });
  });

  it("rejects correcting an event of another cable", async () => {
    const first = await newCable();
    const second = await newCable({ code: "sh51" });
    const otherEvent = await lastEvent(second.id);

    await expect(
      act(supervisor, first.id, {
        action: "CORRECTION",
        correctsEventId: otherEvent.id,
        installationStatus: "LAID",
        connectionStatus: "DISCONNECTED",
        notes: "Prueba",
      }),
    ).rejects.toThrow("El movimiento que quieres corregir no es de este cable.");
  });

  it("rejects actions on a deleted cable and on an unknown one", async () => {
    const { id } = await newCable();
    await prisma.cable.update({ where: { id }, data: { deletedAt: new Date() } });

    await expect(act(technician, id, { action: "LAID" })).rejects.toThrow(/dado de baja/);
    await expect(
      runCableAction(
        technician,
        cableActionSchema.parse({ cableId: "missing", version: "1", action: "LAID" }),
      ),
    ).rejects.toThrow("El cable no existe.");
  });
});

describe("runCableAction: cables loaded from the project lists", () => {
  it("lays an unverified cable whose ends are only known by their equipment", async () => {
    const cable = await prisma.cable.create({
      data: {
        code: "99XAT10W2005",
        installationStatus: "UNVERIFIED",
        originEquipment: "99BMA",
        destinationEquipment: "99XAT10AP001",
      },
    });

    await expect(act(technician, cable.id, { action: "CONNECTED", end: "BOTH" })).rejects.toThrow(
      /Solo se puede conectar un cable tendido/,
    );
    await act(technician, cable.id, { action: "LAID" });

    expect(await cableOf(cable.id)).toMatchObject({
      installationStatus: "LAID",
      originId: null,
      destinationId: null,
    });
    expect((await lastEvent(cable.id)).changes).toEqual({
      installationStatus: { from: "UNVERIFIED", to: "LAID" },
    });
  });
});

describe("runCableAction: partial laying", () => {
  async function routeThrough(cableId: string, codes: string[]) {
    for (const [index, code] of codes.entries()) {
      const tray = await prisma.tray.upsert({
        where: { code },
        create: { code, kind: "LADDER" },
        update: {},
      });
      await prisma.cableRouteStep.create({
        data: { cableId, position: index + 1, label: code, trayId: tray.id },
      });
    }
  }

  it("leaves the destination end waiting in a tray of the route", async () => {
    const { id } = await newCable();
    await routeThrough(id, ["99UXA00L22036", "99UXA00L22051"]);

    const result = await act(technician, id, {
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99uxa00l22051",
    });

    expect(result.message).toBe("Movimiento registrado en SH-50: tendido parcial.");
    const cable = await prisma.cable.findUniqueOrThrow({
      where: { id },
      include: { looseEndTray: { select: { code: true } } },
    });
    expect(cable).toMatchObject({
      installationStatus: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      looseEndTray: { code: "99UXA00L22051" },
      installedById: technician.id,
      lastAction: "PARTIALLY_LAID",
    });
    // The history stores the tray code, readable without a lookup.
    expect((await lastEvent(id)).changes).toMatchObject({
      installationStatus: { from: "NOT_LAID", to: "PARTIALLY_LAID" },
      looseEnd: { from: null, to: "DESTINATION" },
      looseEndTray: { from: null, to: "99UXA00L22051" },
    });
  });

  it("connects the end that arrived and then completes the laying", async () => {
    const { id } = await newCable();
    await routeThrough(id, ["99UXA00L22036"]);
    await act(technician, id, {
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99UXA00L22036",
    });
    await act(technician, id, { action: "CONNECTED", end: "ORIGIN" });

    await expect(act(technician, id, { action: "CONNECTED", end: "DESTINATION" })).rejects.toThrow(
      /sigue suelta en la bandeja 99UXA00L22036/,
    );

    await act(technician, id, { action: "LAID" });
    expect(await cableOf(id)).toMatchObject({
      installationStatus: "LAID",
      connectionStatus: "ORIGIN_ONLY",
      looseEnd: null,
      looseEndTrayId: null,
    });
  });

  it("rejects a tray that does not exist or is not on the route", async () => {
    const { id } = await newCable();
    await routeThrough(id, ["99UXA00L22036"]);
    await prisma.tray.create({ data: { code: "99UXB00L22001", kind: "LADDER" } });

    await expect(
      act(technician, id, { action: "PARTIALLY_LAID", looseEnd: "ORIGIN", trayCode: "99UXZ" }),
    ).rejects.toThrow("La bandeja 99UXZ no existe.");
    await expect(
      act(technician, id, {
        action: "PARTIALLY_LAID",
        looseEnd: "ORIGIN",
        trayCode: "99UXB00L22001",
      }),
    ).rejects.toThrow(
      "La bandeja 99UXB00L22001 no está en el recorrido previsto del cable. Si el cable está ahí, confírmalo.",
    );
    expect((await cableOf(id)).installationStatus).toBe("NOT_LAID");
  });

  it("accepts a tray off the planned route when the user confirms it", async () => {
    const { id } = await newCable();
    await routeThrough(id, ["99UXA00L22036"]);
    await prisma.tray.create({ data: { code: "99UXB00L22001", kind: "LADDER" } });

    await act(technician, id, {
      action: "PARTIALLY_LAID",
      looseEnd: "ORIGIN",
      trayCode: "99UXB00L22001",
      confirmOffRoute: "1",
    });

    const cable = await prisma.cable.findUniqueOrThrow({
      where: { id },
      include: { looseEndTray: true },
    });
    expect(cable).toMatchObject({
      installationStatus: "PARTIALLY_LAID",
      looseEnd: "ORIGIN",
      looseEndTray: { code: "99UXB00L22001" },
    });
  });

  it("records a timbrado with who and why, and keeps it when the cable is laid", async () => {
    const { id } = await newCable();

    await act(technician, id, { action: "TESTED", result: "FAILED", notes: "Conductor 3 abierto" });
    expect(await lastEvent(id)).toMatchObject({
      action: "TESTED",
      userId: technician.id,
      notes: "Conductor 3 abierto",
      changes: { testStatus: { from: "NOT_TESTED", to: "TESTED_FAILED" } },
    });

    await act(technician, id, { action: "TESTED", result: "OK" });
    expect(await cableOf(id)).toMatchObject({ testStatus: "TESTED_OK", lastAction: "TESTED" });
  });

  it("accepts any existing tray when the cable has no route", async () => {
    const { id } = await newCable();
    await prisma.tray.create({ data: { code: "99UXB00L22001", kind: "LADDER" } });

    await act(technician, id, {
      action: "PARTIALLY_LAID",
      looseEnd: "ORIGIN",
      trayCode: "99UXB00L22001",
    });

    expect((await cableOf(id)).looseEnd).toBe("ORIGIN");
  });

  it("is guarded by the database: a loose end needs the partial status", async () => {
    const { id } = await newCable();
    const tray = await prisma.tray.create({ data: { code: "99UXB00L22001", kind: "LADDER" } });

    await expect(
      prisma.cable.update({
        where: { id },
        data: { looseEnd: "ORIGIN", looseEndTrayId: tray.id },
      }),
    ).rejects.toThrow(/cable_loose_end_check/);
  });
});
