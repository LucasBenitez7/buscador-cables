import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import {
  createRoleSchema,
  permissionsOfRole,
  updateRoleSchema,
  type Permission,
} from "@cables/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RoleServiceError,
  createRole,
  deleteRole,
  getRole,
  getUserPermissions,
  listRoles,
  setUserGrants,
  updateRole,
} from "./service";

let admin: { id: string; permissions: readonly string[] };
let supervisor: { id: string; permissions: readonly string[] };

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "cable_event", "cable", "user_event", "user" CASCADE');
  // Solo quedan los cuatro roles de siempre: los de cada test se borran después.
  const [a, s] = await Promise.all(
    (["ADMIN", "SUPERVISOR"] as const).map((role) =>
      prisma.user.create({
        data: { id: randomUUID(), name: role, email: `${role}@cables.test`, role },
      }),
    ),
  );
  admin = { id: a!.id, ...permissionsOfRole("ADMIN") };
  supervisor = { id: s!.id, ...permissionsOfRole("SUPERVISOR") };
});

afterEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "user" CASCADE');
  await prisma.role.deleteMany({ where: { system: false } });
});

const form = (name: string, permissions: Permission[]) =>
  createRoleSchema.parse({ name, permissions });

describe("starting roles", () => {
  it("exist with the permissions they had in the code", async () => {
    const roles = await listRoles();
    expect(roles.map((role) => role.id)).toEqual(["ADMIN", "SUPERVISOR", "TECHNICIAN", "VIEWER"]);
    for (const role of roles) {
      expect([...role.permissions].sort()).toEqual(
        [...permissionsOfRole(role.id as "ADMIN").permissions].sort(),
      );
    }
    expect(roles.find((role) => role.id === "ADMIN")).toMatchObject({ locked: true, system: true });
  });
});

describe("createRole and updateRole", () => {
  it("creates a role, edits it and records both in the account changes", async () => {
    const role = await createRole(admin, form("Conexionista", ["cable:connect", "cable:test"]));
    expect(role.permissions).toEqual(["cable:read", "cable:connect", "cable:test"]);

    const updated = await updateRole(
      admin,
      updateRoleSchema.parse({
        id: role.id,
        version: role.version,
        name: "Conexionista",
        permissions: ["cable:connect", "cable:wiring"],
      }),
    );
    expect(updated).toMatchObject({ version: 2 });
    expect(updated.permissions).toContain("cable:wiring");

    const events = await prisma.userEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(events.map((event) => [event.action, event.roleId, event.details])).toEqual([
      ["ROLE_CREATED", role.id, { role: "Conexionista", added: role.permissions }],
      [
        "ROLE_UPDATED",
        role.id,
        { role: "Conexionista", added: ["cable:wiring"], removed: ["cable:test"] },
      ],
    ]);
  });

  it("refuses repeated names, stale versions and the administrator role", async () => {
    const role = await createRole(admin, form("Conexionista", ["cable:connect"]));
    await expect(createRole(admin, form("Conexionista", []))).rejects.toThrow(/Ya hay un rol/);

    const edit = { name: "Otro", permissions: ["cable:read" as const] };
    await expect(
      updateRole(admin, updateRoleSchema.parse({ ...edit, id: role.id, version: 9 })),
    ).rejects.toThrow(/Otra persona/);
    await expect(
      updateRole(admin, updateRoleSchema.parse({ ...edit, id: "ADMIN", version: 1 })),
    ).rejects.toThrow(/Administrador no se puede cambiar/);
  });

  it("refuses anyone who cannot manage roles, whatever they send", async () => {
    await expect(createRole(supervisor, form("Mio", ["cable:retire"]))).rejects.toThrow(
      RoleServiceError,
    );
    await expect(
      updateRole(
        supervisor,
        updateRoleSchema.parse({
          id: "SUPERVISOR",
          version: 1,
          name: "Supervisor",
          permissions: [],
        }),
      ),
    ).rejects.toThrow(/permiso/);
  });

  it("lets the database itself refuse account management outside the administrator role", async () => {
    await expect(
      prisma.role.update({
        where: { id: "SUPERVISOR" },
        data: { permissions: { push: "user:manage" } },
      }),
    ).rejects.toThrow(/Administrador/);
  });
});

describe("deleteRole", () => {
  it("deletes a role nobody has, and never a starting one or one in use", async () => {
    const empty = await createRole(admin, form("Temporal", []));
    const used = await createRole(admin, form("En uso", []));
    await prisma.user.create({
      data: { id: randomUUID(), name: "Ana", email: "ana@cables.test", role: used.id },
    });

    await deleteRole(admin, { id: empty.id, version: empty.version });
    expect(await getRole(empty.id)).toBeNull();
    await expect(deleteRole(admin, { id: used.id, version: used.version })).rejects.toThrow(
      /1 persona/,
    );
    await expect(deleteRole(admin, { id: "VIEWER", version: 1 })).rejects.toThrow(
      /no se pueden borrar/,
    );
    expect(await prisma.userEvent.count({ where: { action: "ROLE_DELETED" } })).toBe(1);
  });
});

describe("extra permissions", () => {
  it("adds extras only for that person, keeps out what the role already gives, and records it", async () => {
    const ana = await prisma.user.create({
      data: { id: randomUUID(), name: "Ana", email: "ana@cables.test", role: "TECHNICIAN" },
    });

    await setUserGrants(admin, { userId: ana.id, permissions: ["cable:retire", "cable:connect"] });
    let person = await getUserPermissions(ana.id);
    expect(person?.extras).toEqual(["cable:retire"]);
    expect(person?.effective).toContain("cable:retire");

    await setUserGrants(admin, { userId: ana.id, permissions: [] });
    person = await getUserPermissions(ana.id);
    expect(person?.extras).toEqual([]);

    const events = await prisma.userEvent.findMany({
      where: { action: "PERMISSIONS_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.details)).toEqual([
      { added: ["cable:retire"], removed: [] },
      { added: [], removed: ["cable:retire"] },
    ]);
  });

  it("never lets an extra be account or role management, not even written straight to the database", async () => {
    const ana = await prisma.user.create({
      data: { id: randomUUID(), name: "Ana", email: "ana@cables.test", role: "VIEWER" },
    });
    await expect(
      prisma.userPermissionGrant.create({
        data: { userId: ana.id, permission: "user:manage", grantedById: admin.id },
      }),
    ).rejects.toThrow(/no se da como permiso extra/);
    await expect(
      setUserGrants(supervisor, { userId: ana.id, permissions: ["cable:retire"] }),
    ).rejects.toThrow(/permiso/);
  });
});
