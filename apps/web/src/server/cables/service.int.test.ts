import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { createCableSchema, parseCableSearch, updateCableSchema } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CableServiceError,
  createCable,
  deleteCable,
  getCableForEdit,
  getCableFormOptions,
  updateCable,
} from "./service";
import { searchCables } from "./search";

let actor: { id: string };
let refs: { typeId: string; colorId: string; origin: string; destination: string; store: string };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  actor = await prisma.user.create({
    data: { id: randomUUID(), name: "Tomás", email: "tomas@cables.test", role: "TECHNICIAN" },
  });
  const plant = await prisma.location.create({
    data: { name: "Norte", code: "N", type: "PLANT", path: "/N" },
  });
  const area = await prisma.location.create({
    data: { name: "Calderas", code: "N-CAL", type: "AREA", path: "/N/N-CAL", parentId: plant.id },
  });
  const [origin, destination, store] = await Promise.all(
    ["S1", "S2", "ALM"].map((code) =>
      prisma.location.create({
        data: {
          name: `Sitio ${code}`,
          code: `N-CAL-${code}`,
          type: "UNIT",
          path: `/N/N-CAL/N-CAL-${code}`,
          parentId: area.id,
        },
      }),
    ),
  );
  const type = await prisma.cableType.create({ data: { name: "Control" } });
  const color = await prisma.color.create({ data: { name: "Gris", hex: "#8E9196" } });
  refs = {
    typeId: type.id,
    colorId: color.id,
    origin: origin!.id,
    destination: destination!.id,
    store: store!.id,
  };
});

/** Same path as the real form: strings validated by the shared schema. */
function createInput(overrides: Record<string, string> = {}) {
  return createCableSchema.parse({
    code: "sh50",
    typeId: refs.typeId,
    colorId: refs.colorId,
    crossSectionMm2: "2,5",
    conductors: "3",
    lengthM: "120",
    originId: refs.origin,
    destinationId: refs.destination,
    installationStatus: "IN_STOCK",
    connectionStatus: "DISCONNECTED",
    currentLocationId: refs.store,
    ...overrides,
  });
}

async function editInput(id: string, overrides: Record<string, string> = {}) {
  const cable = await getCableForEdit(id);
  const asText = Object.fromEntries(
    Object.entries(cable ?? {}).map(([key, value]) => [key, value === null ? "" : String(value)]),
  );
  return updateCableSchema.parse({ ...asText, ...overrides });
}

describe("createCable", () => {
  it("creates the cable with its CREATED event and summary columns", async () => {
    const { id, code } = await createCable(actor, createInput());

    const cable = await prisma.cable.findUniqueOrThrow({ where: { id } });
    expect(code).toBe("SH-50");
    expect(cable).toMatchObject({
      installationStatus: "IN_STOCK",
      currentLocationId: refs.store,
      version: 1,
      lastAction: "CREATED",
      lastActionById: actor.id,
    });
    expect(cable.crossSectionMm2?.toNumber()).toBe(2.5);

    const [event] = await prisma.cableEvent.findMany({ where: { cableId: id } });
    expect(event).toMatchObject({ action: "CREATED", userId: actor.id, toLocationId: refs.store });
    expect(event?.changes).toMatchObject({
      code: { from: null, to: "SH-50" },
      crossSectionMm2: { from: null, to: 2.5 },
      installationStatus: { from: null, to: "IN_STOCK" },
    });
    expect(event?.createdAt.getTime()).toBe(cable.lastActionAt?.getTime());
  });

  it("does not keep a current location for a laid cable", async () => {
    const { id } = await createCable(
      actor,
      createInput({ installationStatus: "LAID", connectionStatus: "CONNECTED" }),
    );

    expect((await prisma.cable.findUniqueOrThrow({ where: { id } })).currentLocationId).toBeNull();
  });

  it("rejects duplicate codes, also from retired cables", async () => {
    await createCable(actor, createInput());
    await expect(createCable(actor, createInput({ code: "SH 50" }))).rejects.toThrow(
      new CableServiceError("Ya existe un cable con el código SH-50."),
    );

    await prisma.cable.updateMany({ data: { deletedAt: new Date() } });
    await expect(createCable(actor, createInput())).rejects.toThrow(/dado de baja/);
  });

  it("rejects references that no longer exist and writes nothing", async () => {
    await expect(createCable(actor, createInput({ colorId: "missing" }))).rejects.toThrow(
      "El color elegido ya no existe.",
    );
    await expect(createCable(actor, createInput({ originId: "missing" }))).rejects.toThrow(
      /ubicaciones elegidas/,
    );
    expect(await prisma.cable.count()).toBe(0);
    expect(await prisma.cableEvent.count()).toBe(0);
  });
});

describe("updateCable", () => {
  it("saves only the changes, bumps the version and records them", async () => {
    const { id } = await createCable(actor, createInput());

    const result = await updateCable(
      actor,
      await editInput(id, { lengthM: "125,5", notes: "Medido" }),
    );

    expect(result).toEqual({ changed: true });
    const cable = await prisma.cable.findUniqueOrThrow({ where: { id } });
    expect(cable.version).toBe(2);
    expect(cable.lengthM?.toNumber()).toBe(125.5);
    expect(cable.lastAction).toBe("UPDATED");
    const event = await prisma.cableEvent.findFirstOrThrow({
      where: { cableId: id, action: "UPDATED" },
    });
    expect(event.changes).toEqual({
      lengthM: { from: 120, to: 125.5 },
      notes: { from: null, to: "Medido" },
    });
  });

  it("does nothing when no field changed", async () => {
    const { id } = await createCable(actor, createInput());

    expect(await updateCable(actor, await editInput(id))).toEqual({ changed: false });
    expect((await prisma.cable.findUniqueOrThrow({ where: { id } })).version).toBe(1);
    expect(await prisma.cableEvent.count({ where: { action: "UPDATED" } })).toBe(0);
  });

  it("detects that someone else saved first", async () => {
    const { id } = await createCable(actor, createInput());
    const stale = await editInput(id, { notes: "Primera" });
    await updateCable(actor, await editInput(id, { notes: "Otra persona" }));

    await expect(updateCable(actor, stale)).rejects.toThrow(/Otra persona ha modificado/);
    expect((await prisma.cable.findUniqueOrThrow({ where: { id } })).notes).toBe("Otra persona");
  });

  it("rejects renaming to an existing code", async () => {
    const { id } = await createCable(actor, createInput());
    await createCable(actor, createInput({ code: "SH-51" }));

    await expect(updateCable(actor, await editInput(id, { code: "sh51" }))).rejects.toThrow(
      "Ya existe un cable con el código SH-51.",
    );
  });
});

describe("deleteCable", () => {
  it("soft deletes with a DELETED event and the reason", async () => {
    const { id } = await createCable(actor, createInput());

    await deleteCable(actor, { id, version: 1, reason: "Duplicado de SH-49" });

    const cable = await prisma.cable.findUniqueOrThrow({ where: { id } });
    expect(cable.deletedAt).not.toBeNull();
    expect(cable).toMatchObject({ version: 2, lastAction: "DELETED" });
    const event = await prisma.cableEvent.findFirstOrThrow({
      where: { cableId: id, action: "DELETED" },
    });
    expect(event.notes).toBe("Duplicado de SH-49");
    // Ya no se puede editar ni aparece en los listados.
    expect(await getCableForEdit(id)).toBeNull();
    expect((await searchCables(parseCableSearch({}))).total).toBe(0);
    await expect(deleteCable(actor, { id, version: 2, reason: "Otra vez" })).rejects.toThrow(
      /no existe o está dado de baja/,
    );
  });

  it("refuses a stale version", async () => {
    const { id } = await createCable(actor, createInput());
    await updateCable(actor, await editInput(id, { notes: "Cambio" }));

    await expect(deleteCable(actor, { id, version: 1, reason: "Error" })).rejects.toThrow(
      /Otra persona ha modificado/,
    );
    expect((await prisma.cable.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });
});

describe("queries", () => {
  it("offers catalogs and non-plant locations labelled with their route", async () => {
    const options = await getCableFormOptions();

    expect(options.cableTypes).toEqual([{ id: refs.typeId, label: "Control" }]);
    expect(options.locations.map((location) => location.label)).toEqual([
      "Norte › Calderas",
      "Norte › Calderas › Sitio ALM",
      "Norte › Calderas › Sitio S1",
      "Norte › Calderas › Sitio S2",
    ]);
  });
});
