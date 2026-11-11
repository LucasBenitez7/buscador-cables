import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { createCableSchema, updateCableSchema } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getCableDetail } from "./detail";
import { createCable, deleteCable, getCableForEdit, updateCable } from "./service";

let actor: { id: string };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
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
      currentLocation: null,
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
      lastAction: { action: "CREATED", user: "Tomás Gil" },
      deleted: null,
    });
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
      { field: "Origen", from: "Norte › Calderas › Caldera 1", to: "Norte › Calderas › Caldera 2" },
      {
        field: "Destino",
        from: "Norte › Calderas › Caldera 2",
        to: "Norte › Calderas › Caldera 1",
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
