import { randomUUID } from "node:crypto";
import { permissionsOfRole } from "@cables/shared";
import { prisma } from "@cables/db";
import { wiringEditSchema, type Role, type WiringEditInput } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { CableServiceError } from "./service";
import { editWiring } from "./wiring";

type Actor = { id: string; role: Role; permissions: readonly string[] };

let technician: Actor;
let viewer: Actor;
let cableId: string;

const wire = (position: number, label: string, originPoint: string, destinationPoint: string) => ({
  position,
  wire: label,
  originBlock: "X51",
  originPoint,
  destinationBlock: "JB-TB1",
  destinationPoint,
  pdfOriginBlock: "X51",
  pdfOriginPoint: originPoint,
  pdfDestinationBlock: "JB-TB1",
  pdfDestinationPoint: destinationPoint,
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "cable_event", "cable", "user" CASCADE');
  const [tech, view] = await Promise.all(
    (["TECHNICIAN", "VIEWER"] as const).map((role) =>
      prisma.user.create({
        data: { id: randomUUID(), name: role, email: `${role}@cables.test`, role },
      }),
    ),
  );
  technician = { id: tech!.id, role: "TECHNICIAN", ...permissionsOfRole("TECHNICIAN") };
  viewer = { id: view!.id, role: "VIEWER", ...permissionsOfRole("VIEWER") };
  const cable = await prisma.cable.create({
    data: {
      code: "99XAT10W2005",
      wires: {
        create: [wire(1, "BN", "11", "21"), wire(2, "BU", "12", "22"), wire(3, "SH", "PE", "PE")],
      },
    },
  });
  cableId = cable.id;
});

/** The table as the edit mode sends it: every wire, with the cells changed by `edits`. */
async function table(edits: Record<number, Partial<WiringEditInput["wires"][number]>> = {}) {
  const wires = await prisma.cableWire.findMany({
    where: { cableId },
    orderBy: { position: "asc" },
  });
  return wires.map((row) => ({
    position: row.position,
    originBlock: row.originBlock,
    originPoint: row.originPoint,
    destinationBlock: row.destinationBlock,
    destinationPoint: row.destinationPoint,
    ...edits[row.position],
  }));
}

const edit = async (input: Partial<WiringEditInput> & Pick<WiringEditInput, "wires">) =>
  wiringEditSchema.parse({ cableId, version: 1, ...input });

describe("editWiring", () => {
  it("saves the changed cells, keeps the list values and writes one event", async () => {
    const result = await editWiring(
      technician,
      await edit({
        wires: await table({ 1: { originPoint: "14" }, 2: { destinationBlock: "" } }),
        notes: "Renumerado",
      }),
    );

    expect(result).toEqual({ status: "saved", cableId, changedWires: 2 });
    const wires = await prisma.cableWire.findMany({
      where: { cableId },
      orderBy: { position: "asc" },
    });
    expect(wires.map((row) => [row.originPoint, row.pdfOriginPoint, row.destinationBlock])).toEqual(
      [
        ["14", "11", "JB-TB1"],
        ["12", "12", null],
        ["PE", "PE", "JB-TB1"],
      ],
    );
    const cable = await prisma.cable.findUniqueOrThrow({ where: { id: cableId } });
    expect(cable).toMatchObject({
      version: 2,
      lastAction: "WIRING_EDITED",
      lastActionById: technician.id,
    });
    const events = await prisma.cableEvent.findMany({ where: { cableId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "WIRING_EDITED",
      userId: technician.id,
      notes: "Renumerado",
      changes: {
        "wire.1.originPoint": { from: "11", to: "14", wire: "BN" },
        "wire.2.destinationBlock": { from: "JB-TB1", to: null, wire: "BU" },
      },
    });
  });

  it("writes nothing when no cell changed", async () => {
    expect(await editWiring(technician, await edit({ wires: await table() }))).toEqual({
      status: "unchanged",
      cableId,
    });
    expect(await prisma.cableEvent.count()).toBe(0);
  });

  it("asks to confirm two wires in one terminal, and saves once confirmed", async () => {
    const wires = await table({ 2: { originPoint: "11" } });

    const first = await editWiring(technician, await edit({ wires }));
    expect(first).toEqual({
      status: "duplicates",
      cableId,
      duplicates: [{ end: "origin", block: "X51", point: "11", wires: ["BN", "BU"] }],
    });
    expect(await prisma.cableEvent.count()).toBe(0);

    const second = await editWiring(technician, await edit({ wires, confirmDuplicates: true }));
    expect(second).toMatchObject({ status: "saved" });
  });

  it("refuses a stale screen: another version, or wires that are not the ones stored", async () => {
    await expect(
      editWiring(
        technician,
        await edit({ version: 2, wires: await table({ 1: { originPoint: "9" } }) }),
      ),
    ).rejects.toThrow(CableServiceError);

    const missing = (await table({ 1: { originPoint: "9" } })).slice(0, 2);
    await expect(editWiring(technician, await edit({ wires: missing }))).rejects.toThrow(
      /Otra persona ha cambiado este cable/,
    );
    const foreign = [...(await table()), { ...(await table())[0]!, position: 9 }];
    await expect(editWiring(technician, await edit({ wires: foreign }))).rejects.toThrow(
      CableServiceError,
    );
  });

  it("refuses users without the permission and cables that were deleted", async () => {
    await expect(
      editWiring(viewer, await edit({ wires: await table({ 1: { originPoint: "9" } }) })),
    ).rejects.toThrow(/permiso/);

    await prisma.cable.update({ where: { id: cableId }, data: { deletedAt: new Date() } });
    await expect(
      editWiring(technician, await edit({ wires: await table({ 1: { originPoint: "9" } }) })),
    ).rejects.toThrow(/dado de baja/);
  });
});
