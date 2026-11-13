import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import type { Role } from "@cables/shared";
import { verifyPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/session";
import { UserServiceError, changeUserRole, createUser, listUsers, setUserActive } from "./service";

const PASSWORD = "clave-temporal-1";

async function insertUser(role: Role, overrides: { active?: boolean } = {}): Promise<CurrentUser> {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      id,
      name: `${role} ${id.slice(0, 4)}`,
      email: `${id}@cables.test`,
      role,
      active: overrides.active ?? true,
    },
  });
  return { id: user.id, name: user.name, email: user.email, role };
}

async function insertSession(userId: string): Promise<void> {
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

beforeEach(async () => {
  // Otros tests dejan cables y eventos que apuntan a usuarios (el historial usa RESTRICT):
  // se vacía todo lo que depende de "user". Sesiones y cuentas caen en cascada.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
});

describe("createUser", () => {
  it("creates the user with a credential account and a hashed password", async () => {
    const admin = await insertUser("ADMIN");

    const created = await createUser(admin, {
      name: "Ana Pérez",
      email: "ana@cables.test",
      role: "TECHNICIAN",
      password: PASSWORD,
    });

    expect(created).toMatchObject({ email: "ana@cables.test", role: "TECHNICIAN", active: true });
    const account = await prisma.account.findFirstOrThrow({ where: { userId: created.id } });
    expect(account.providerId).toBe("credential");
    expect(account.accountId).toBe(created.id);
    expect(account.password).not.toBe(PASSWORD);
    await expect(
      verifyPassword({ hash: account.password ?? "", password: PASSWORD }),
    ).resolves.toBe(true);
  });

  it("rejects an email that already exists", async () => {
    const admin = await insertUser("ADMIN");

    await expect(
      createUser(admin, { name: "Otro", email: admin.email, role: "VIEWER", password: PASSWORD }),
    ).rejects.toThrow(new UserServiceError("Ya existe un usuario con ese correo."));
  });

  // Regresión: dos altas simultáneas pasaban la comprobación previa y la segunda
  // fallaba con un error genérico de Prisma (P2002) en lugar del mensaje de duplicado.
  it("reports concurrent duplicates as a duplicate email, not as a crash", async () => {
    const admin = await insertUser("ADMIN");
    const input = { name: "Ana", email: "doble@cables.test", role: "VIEWER", password: PASSWORD };

    const results = await Promise.allSettled([
      createUser(admin, { ...input, role: "VIEWER" }),
      createUser(admin, { ...input, role: "VIEWER" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(UserServiceError);
    expect(await prisma.user.count({ where: { email: "doble@cables.test" } })).toBe(1);
  });

  it("does not let a supervisor create an admin", async () => {
    const supervisor = await insertUser("SUPERVISOR");

    await expect(
      createUser(supervisor, {
        name: "Jefe",
        email: "jefe@cables.test",
        role: "ADMIN",
        password: PASSWORD,
      }),
    ).rejects.toBeInstanceOf(UserServiceError);
    expect(await prisma.user.count({ where: { email: "jefe@cables.test" } })).toBe(0);
  });
});

describe("changeUserRole", () => {
  it("changes the role of a manageable user", async () => {
    const admin = await insertUser("ADMIN");
    const technician = await insertUser("TECHNICIAN");

    await changeUserRole(admin, { userId: technician.id, role: "SUPERVISOR" });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: technician.id } });
    expect(updated.role).toBe("SUPERVISOR");
  });

  it("fails for an unknown user", async () => {
    const admin = await insertUser("ADMIN");

    await expect(changeUserRole(admin, { userId: "missing", role: "VIEWER" })).rejects.toThrow(
      "El usuario no existe.",
    );
  });

  it("refuses to demote the last active admin", async () => {
    // El actor se desactivó entre medias (p. ej. otro admin lo hizo): el objetivo
    // es el único admin activo que queda.
    const actor = await insertUser("ADMIN", { active: false });
    const lastAdmin = await insertUser("ADMIN");

    await expect(changeUserRole(actor, { userId: lastAdmin.id, role: "VIEWER" })).rejects.toThrow(
      /al menos un administrador/,
    );
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: lastAdmin.id } });
    expect(unchanged.role).toBe("ADMIN");
  });
});

describe("setUserActive", () => {
  it("deactivates the user and closes all their sessions", async () => {
    const admin = await insertUser("ADMIN");
    const technician = await insertUser("TECHNICIAN");
    await insertSession(technician.id);
    await insertSession(technician.id);
    await insertSession(admin.id);

    await setUserActive(admin, { userId: technician.id, active: false });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: technician.id } });
    expect(updated.active).toBe(false);
    expect(await prisma.session.count({ where: { userId: technician.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(1);
  });

  it("reactivates a user", async () => {
    const admin = await insertUser("ADMIN");
    const viewer = await insertUser("VIEWER", { active: false });

    await setUserActive(admin, { userId: viewer.id, active: true });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } })).active).toBe(true);
  });

  it("refuses to deactivate yourself", async () => {
    const admin = await insertUser("ADMIN");
    await insertSession(admin.id);

    await expect(setUserActive(admin, { userId: admin.id, active: false })).rejects.toThrow(
      /propia cuenta/,
    );
    expect(await prisma.session.count({ where: { userId: admin.id } })).toBe(1);
  });

  it("refuses to deactivate the last active admin", async () => {
    const actor = await insertUser("ADMIN", { active: false });
    const lastAdmin = await insertUser("ADMIN");

    await expect(setUserActive(actor, { userId: lastAdmin.id, active: false })).rejects.toThrow(
      /al menos un administrador/,
    );
  });
});

describe("listUsers", () => {
  it("lists active users first, then by name", async () => {
    const id = () => randomUUID();
    await prisma.user.createMany({
      data: [
        { id: id(), name: "Zoe", email: "zoe@cables.test", role: "VIEWER" },
        { id: id(), name: "Ana", email: "ana@cables.test", role: "VIEWER", active: false },
        { id: id(), name: "Bea", email: "bea@cables.test", role: "TECHNICIAN" },
      ],
    });

    const users = await listUsers();

    expect(users.map((user) => user.name)).toEqual(["Bea", "Zoe", "Ana"]);
  });
});
