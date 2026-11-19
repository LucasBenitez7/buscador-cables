import { randomUUID } from "node:crypto";
import { permissionsOfRole } from "@cables/shared";
import { prisma } from "@cables/db";
import { cableActionSchema, createCableSchema, updateCableSchema } from "@cables/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HISTORY_LIMIT, getCableDetail } from "./detail";
import { runCableAction } from "./field-actions";
import { createCable, deleteCable, getCableForEdit, updateCable } from "./service";

let actor: { id: string };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  actor = await prisma.user.create({
    data: { id: randomUUID(), name: "Tomás Gil", email: "tomas@cables.test", role: "ADMIN" },
  });
  await prisma.location.createMany({
    data: [
      { id: "n", name: "Norte", code: "N", type: "PLANT", path: "/N" },
      { id: "cal", name: "Calderas", code: "CAL", type: "AREA", path: "/N/CAL", parentId: "n" },
      { id: "c1", name: "Caldera 1", code: "C1", type: "UNIT", path: "/N/CAL/C1", parentId: "cal" },
      { id: "c2", name: "Caldera 2", code: "C2", type: "UNIT", path: "/N/CAL/C2", parentId: "cal" },
    ],
  });
  await prisma.cableType.create({ data: { id: "t", name: "Control" } });
  await prisma.color.create({ data: { id: "g", name: "Gris", hex: "#8E9196" } });
});

async function newCable() {
  return createCable(
    actor,
    createCableSchema.parse({
      code: "sh50",
      typeId: "t",
      colorId: "g",
      crossSectionMm2: "2,5",
      lengthM: "120",
      originId: "c1",
      destinationId: "c2",
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
    }),
  );
}

describe("getCableDetail", () => {
  it("returns every field with names and full routes", async () => {
    const { id } = await newCable();

    const detail = await getCableDetail(id);

    expect(detail).toMatchObject({
      code: "SH-50",
      type: "Control",
      color: { name: "Gris", hex: "#8E9196" },
      crossSectionMm2: 2.5,
      lengthM: 120,
      origin: "Norte › Calderas › Caldera 1",
      destination: "Norte › Calderas › Caldera 2",
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
      lastAction: { action: "CREATED", user: "Tomás Gil" },
      deleted: null,
    });
  });

  // Revisión F0-F7 (B9): el historial se cortaba en los 100 últimos sin decir que había más.
  it("says how many events there are when it only returns the latest", async () => {
    const { id } = await newCable();
    await prisma.cableEvent.createMany({
      data: Array.from({ length: HISTORY_LIMIT + 4 }, (_, index) => ({
        cableId: id,
        userId: actor.id,
        action: "UPDATED" as const,
        changes: { notes: { from: null, to: `nota ${index}` } },
        createdAt: new Date(Date.UTC(2026, 10, 13, 8, 0, index)),
      })),
    });

    const detail = await getCableDetail(id);

    expect(detail?.history).toHaveLength(HISTORY_LIMIT);
    // The CREATED event of `newCable` plus the ones above.
    expect(detail?.historyTotal).toBe(HISTORY_LIMIT + 5);
  });

  it("returns a readable history, newest first", async () => {
    const { id } = await newCable();
    const cable = await getCableForEdit(id);
    await updateCable(
      actor,
      updateCableSchema.parse({
        ...Object.fromEntries(
          Object.entries(cable ?? {}).map(([key, value]) => [
            key,
            value === null ? "" : String(value),
          ]),
        ),
        lengthM: "125,5",
        destinationId: "c1",
        originId: "c2",
      }),
    );

    const detail = await getCableDetail(id);
    const [update, creation] = detail?.history ?? [];

    expect(update).toMatchObject({ action: "UPDATED", user: "Tomás Gil" });
    expect(update?.changes).toEqual([
      { field: "Longitud (m)", from: "120", to: "125,5" },
      // Las ubicaciones enlazan a sus cables en el buscador.
      {
        field: "Origen",
        from: "Norte › Calderas › Caldera 1",
        to: "Norte › Calderas › Caldera 2",
        fromHref: "/cables?location=c1",
        toHref: "/cables?location=c2",
      },
      {
        field: "Destino",
        from: "Norte › Calderas › Caldera 2",
        to: "Norte › Calderas › Caldera 1",
        fromHref: "/cables?location=c2",
        toHref: "/cables?location=c1",
      },
    ]);
    expect(creation?.action).toBe("CREATED");
    expect(creation?.changes).toEqual(
      expect.arrayContaining([
        { field: "Tipo", from: "—", to: "Control" },
        { field: "Sección (mm²)", from: "—", to: "2,5" },
        { field: "Estado de instalación", from: "—", to: "Tendido" },
      ]),
    );
  });

  it("tells each field action as a sentence with its changes in a stable order", async () => {
    const { id } = await newCable();
    const supervisor = { id: actor.id, ...permissionsOfRole("ADMIN") };
    const run = async (fields: Record<string, string>) => {
      const { version } = await prisma.cable.findUniqueOrThrow({ where: { id } });
      await runCableAction(
        supervisor,
        cableActionSchema.parse({ cableId: id, version: String(version), ...fields }),
      );
    };
    await run({ action: "DISCONNECTED", end: "BOTH" });
    // Un «Enrollado» de antes de la fase 14: ya no se registra, pero el historial lo cuenta.
    // Los cambios se guardan desordenados a propósito (jsonb también los desordenaba).
    const coiled = await prisma.cableEvent.create({
      data: {
        cableId: id,
        userId: actor.id,
        action: "COILED",
        toLocationId: "c1",
        changes: {
          currentLocationId: { from: null, to: "c1" },
          installationStatus: { from: "LAID", to: "COILED" },
        },
      },
    });
    await run({
      action: "CORRECTION",
      correctsEventId: coiled.id,
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
      notes: "No llegó a tenderse",
    });

    const [correction, coil, disconnection] = (await getCableDetail(id))?.history ?? [];

    expect(disconnection?.summary).toBe("desconectó los dos extremos");
    expect(coil?.summary).toBe("enrolló el cable en Norte › Calderas › Caldera 1");
    // Regresión: jsonb desordenaba los cambios; ahora siguen el orden del formulario.
    expect(coil?.changes).toEqual([
      { field: "Estado de instalación", from: "Tendido", to: "Enrollado" },
      expect.objectContaining({ field: "Ubicación actual", to: "Norte › Calderas › Caldera 1" }),
    ]);
    expect(correction).toMatchObject({
      summary: "corrigió un movimiento anterior",
      corrects: expect.stringMatching(/^Enrollado · /),
      notes: "No llegó a tenderse",
    });
    expect(correction?.changes).toContainEqual(
      expect.objectContaining({ field: "Estado de instalación", to: "No tendido" }),
    );
  });

  it("keeps retired cables reachable with who, when and why", async () => {
    const { id } = await newCable();
    await deleteCable(actor, { id, version: 1, reason: "Duplicado" });

    const detail = await getCableDetail(id);

    expect(detail?.deleted).toMatchObject({ user: "Tomás Gil", reason: "Duplicado" });
    expect(detail?.history[0]?.action).toBe("DELETED");
  });

  it("returns null for unknown cables", async () => {
    expect(await getCableDetail("missing")).toBeNull();
  });
});

describe("getCableDetail: route and loose end", () => {
  it("returns the planned route in order and the loose end, readable in the history", async () => {
    const created = await createCable(
      actor,
      createCableSchema.parse({
        code: "99XAT10W2005",
        originId: "c1",
        destinationId: "c2",
        installationStatus: "NOT_LAID",
        connectionStatus: "DISCONNECTED",
      }),
    );
    const tray = await prisma.tray.create({ data: { code: "99UXA00L22036", kind: "LADDER" } });
    await prisma.cableRouteStep.createMany({
      data: [
        { cableId: created.id, position: 2, label: "CONTIGUOUS PANEL" },
        { cableId: created.id, position: 1, label: tray.code, trayId: tray.id },
      ],
    });
    await runCableAction(
      { id: actor.id, ...permissionsOfRole("ADMIN") },
      cableActionSchema.parse({
        cableId: created.id,
        version: "1",
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: tray.code,
      }),
    );

    const detail = await getCableDetail(created.id);

    expect(detail?.route).toEqual([
      { position: 1, label: "99UXA00L22036", trayCode: "99UXA00L22036", section: null },
      { position: 2, label: "CONTIGUOUS PANEL", trayCode: null, section: null },
    ]);
    expect(detail?.state).toMatchObject({
      installationStatus: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      looseEndTray: "99UXA00L22036",
    });
    const [event] = detail!.history;
    expect(event?.changes).toEqual(
      expect.arrayContaining([
        { field: "Punta suelta", from: "—", to: "Destino" },
        {
          field: "Bandeja de la punta suelta",
          from: "—",
          to: "99UXA00L22036",
          toHref: "/trays/99UXA00L22036",
        },
      ]),
    );
  });
});

describe("getCableDetail: data from the project lists", () => {
  it("returns the level, both ends and where the data comes from", async () => {
    const cable = await prisma.cable.create({
      data: {
        code: "99XAB10T1-W8001",
        installationStatus: "UNVERIFIED",
        level: "L1",
        altCode: "99 CBLM-0112",
        revision: "2",
        lengthM: 137,
        lengthPending: true,
        circuit: "1 de 2",
        cablesPerCircuit: 3,
        diagram: "EJ-ICO-DIA-0100_010",
        sourceDocument: "EJ-ICO-LST-0100",
        sourcePage: 8,
        originEquipment: "99XAB10CT001",
        originGland: "M-20ARM",
        originRoom: "99UYC14RA001",
        destinationEquipment: "99CXJ11",
        destinationRoom: "99UXB23RA052",
        destinationId: "c2",
      },
    });

    const detail = await getCableDetail(cable.id);

    expect(detail).toMatchObject({
      level: "L1",
      altCode: "99 CBLM-0112",
      revision: "2",
      lengthM: 137,
      lengthPending: true,
      circuit: "1 de 2",
      cablesPerCircuit: 3,
      diagram: "EJ-ICO-DIA-0100_010",
      source: { document: "EJ-ICO-LST-0100", page: 8 },
      ends: {
        origin: {
          equipment: "99XAB10CT001",
          gland: "M-20ARM",
          room: "99UYC14RA001",
          location: null,
        },
        destination: {
          equipment: "99CXJ11",
          room: "99UXB23RA052",
          location: "Norte › Calderas › Caldera 2",
        },
      },
      // Without a room in the tree, the equipment is the known end of the state machine.
      state: { originId: "99XAB10CT001", destinationId: "c2" },
      route: [],
    });
  });
});

describe("getCableDetail: history filters", () => {
  it("filters the history by action and person, orders it, and still counts it all", async () => {
    const { id } = await newCable();
    const other = await prisma.user.create({
      data: { id: randomUUID(), name: "Ana Ruiz", email: "ana@cables.test", role: "TECHNICIAN" },
    });
    await prisma.cableEvent.createMany({
      data: [
        {
          cableId: id,
          userId: other.id,
          action: "TESTED",
          changes: { testStatus: { from: "NOT_TESTED", to: "TESTED_OK" } },
          createdAt: new Date("2026-11-20T10:00:00Z"),
        },
        {
          cableId: id,
          userId: actor.id,
          action: "TESTED",
          changes: { testStatus: { from: "TESTED_OK", to: "TESTED_FAILED" } },
          createdAt: new Date("2026-11-21T10:00:00Z"),
        },
      ],
    });

    const all = await getCableDetail(id);
    expect(all).toMatchObject({ historyTotal: 3, historyAll: 3 });
    expect(all?.historyPeople.map((person) => person.label)).toEqual(["Ana Ruiz", "Tomás Gil"]);

    const tested = await getCableDetail(id, { action: "TESTED" });
    expect(tested).toMatchObject({ historyTotal: 2, historyAll: 3 });
    expect(tested?.history.map((entry) => entry.user)).toEqual(["Tomás Gil", "Ana Ruiz"]);

    const oldest = await getCableDetail(id, { action: "TESTED", sort: "oldest" });
    expect(oldest?.history.map((entry) => entry.user)).toEqual(["Ana Ruiz", "Tomás Gil"]);

    const byAna = await getCableDetail(id, { person: other.id });
    expect(byAna?.history.map((entry) => entry.action)).toEqual(["TESTED"]);
  });
});

describe("getCableDetail: load of the project in the history", () => {
  it("never shows nor counts the entries written by the load of the project", async () => {
    const { id } = await newCable();
    await prisma.cableEvent.create({
      data: {
        cableId: id,
        userId: actor.id,
        action: "UPDATED",
        source: "PROJECT_LOAD",
        changes: { revision: { from: "2", to: "3" } },
        createdAt: new Date("2026-11-20T10:00:00Z"),
      },
    });

    const people = await getCableDetail(id);
    expect(people).toMatchObject({ historyTotal: 1, historyAll: 1 });
    expect(people?.history.map((entry) => entry.action)).toEqual(["CREATED"]);

    const everything = await getCableDetail(id, { origin: "all" });
    expect(everything?.history.map((entry) => entry.action)).toEqual(["CREATED"]);
  });

  it("hides the last action written by the load of the project", async () => {
    const { id } = await newCable();
    await prisma.cable.update({
      where: { id },
      data: {
        lastAction: "LAID",
        lastActionAt: new Date("2026-11-20T10:00:00Z"),
        lastActionSource: "PROJECT_LOAD",
      },
    });

    expect((await getCableDetail(id))?.lastAction).toBeNull();
  });
});

// El corte se fija a partir de ahora mismo: los eventos que crea `newCable` (con la hora real)
// quedan antes del corte y no se muestran; el que se crea con fecha posterior sí.
describe("getCableDetail: history start", () => {
  const DAY = 24 * 60 * 60 * 1000;
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.HISTORY_START;
    process.env.HISTORY_START = new Date(Date.now() + DAY).toISOString();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.HISTORY_START;
    else process.env.HISTORY_START = saved;
  });

  it("does not show the history, the counts, the people or the last action from before it", async () => {
    const { id } = await newCable();
    const after = new Date(Date.now() + 2 * DAY);
    await prisma.cableEvent.create({
      data: {
        cableId: id,
        userId: actor.id,
        action: "UPDATED",
        changes: { notes: { from: null, to: "tras el corte" } },
        createdAt: after,
      },
    });

    const detail = await getCableDetail(id);

    expect(detail?.history.map((entry) => entry.action)).toEqual(["UPDATED"]);
    expect(detail).toMatchObject({
      historyTotal: 1,
      historyAll: 1,
      historyPeople: [{ id: actor.id, label: "Tomás Gil" }],
      lastAction: null,
    });
  });

  it("shows no history at all when everything is from before the start", async () => {
    const { id } = await newCable();

    const detail = await getCableDetail(id);

    expect(detail).toMatchObject({
      history: [],
      historyTotal: 0,
      historyAll: 0,
      historyPeople: [],
    });
  });
});
