import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import { getCableProgress, getDashboard } from "./service";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  await prisma.user.createMany({
    data: [
      {
        id: "admin",
        name: "Admin",
        email: "admin@cables.test",
        role: "ADMIN",
        approvedAt: new Date(),
      },
      {
        id: "sup",
        name: "Ana Ruiz",
        email: "ana@cables.test",
        role: "SUPERVISOR",
        approvedAt: new Date(),
      },
      {
        id: "tec",
        name: "Juan Pérez",
        email: "juan@cables.test",
        role: "TECHNICIAN",
        approvedAt: new Date(),
      },
      {
        id: "view",
        name: "Luis Gil",
        email: "luis@cables.test",
        role: "VIEWER",
        approvedAt: new Date(),
      },
      // Registrada y sin aprobar, y otra desactivada después de aprobarla.
      { id: "new", name: "Nueva", email: "nueva@cables.test", active: false },
      { id: "off", name: "Baja", email: "baja@cables.test", active: false, approvedAt: new Date() },
    ],
  });
  await prisma.tray.createMany({
    data: [
      { id: "t1", code: "99UXA00L22036", kind: "LADDER", voltageLevel: 2 },
      { code: "99UXA00C20101", kind: "CONDUIT", diameterMm: 25 },
    ],
  });
  await prisma.cable.createMany({
    data: [
      { id: "c1", code: "SH-1", installationStatus: "LAID", connectionStatus: "CONNECTED" },
      { id: "c2", code: "SH-2", installationStatus: "LAID", connectionStatus: "ORIGIN_ONLY" },
      {
        id: "c3",
        code: "SH-3",
        installationStatus: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        looseEndTrayId: "t1",
      },
      { id: "c4", code: "SH-4", installationStatus: "COILED", testStatus: "TESTED_FAILED" },
      // Dado de baja: no cuenta en nada.
      { id: "c5", code: "SH-5", installationStatus: "LAID", deletedAt: new Date() },
    ],
  });
  await prisma.cableEvent.createMany({
    data: [
      { id: "e1", cableId: "c1", userId: "tec", action: "LAID", changes: {} },
      { id: "e2", cableId: "c1", userId: "sup", action: "CONNECTED", changes: {} },
    ],
  });
});

describe("getCableProgress", () => {
  it("counts active cables by installation and connection status", async () => {
    const progress = await getCableProgress();

    expect(progress.total).toBe(4);
    expect(progress.laid).toBe(2);
    expect(progress.connected).toBe(1);
    expect(progress.installation).toMatchObject({
      LAID: 2,
      PARTIALLY_LAID: 1,
      COILED: 1,
      RETIRED: 0,
    });
    expect(progress.connection).toMatchObject({ CONNECTED: 1, ORIGIN_ONLY: 1, DISCONNECTED: 2 });
    expect(progress.tested).toBe(0);
    expect(progress.test).toEqual({ NOT_TESTED: 3, TESTED_OK: 0, TESTED_FAILED: 1 });
  });
});

describe("getDashboard", () => {
  it("shows a viewer only the progress of the works", async () => {
    const dashboard = await getDashboard({ id: "view", role: "VIEWER" });

    expect(dashboard.progress.total).toBe(4);
    expect(dashboard.myActivity).toBeNull();
    expect(dashboard.team).toBeNull();
    expect(dashboard.admin).toBeNull();
  });

  it("adds a technician's own latest actions, and nobody else's", async () => {
    const dashboard = await getDashboard({ id: "tec", role: "TECHNICIAN" });

    expect(dashboard.myActivity?.map((entry) => entry.id)).toEqual(["e1"]);
    expect(dashboard.team).toBeNull();
    expect(dashboard.admin).toBeNull();
  });

  it("adds the team summary for a supervisor, without the accounts", async () => {
    const dashboard = await getDashboard({ id: "sup", role: "SUPERVISOR" });

    expect(dashboard.team?.trays).toBe(2);
    expect(dashboard.team?.recentActivity).toHaveLength(2);
    expect(dashboard.admin).toBeNull();
  });

  it("adds accounts and system state for an administrator", async () => {
    const dashboard = await getDashboard({ id: "admin", role: "ADMIN" });

    expect(dashboard.admin).toEqual({
      pendingAccounts: 1,
      activeUsers: { ADMIN: 1, SUPERVISOR: 1, TECHNICIAN: 1, VIEWER: 1 },
      database: "ok",
    });
    expect(dashboard.team).not.toBeNull();
  });
});
