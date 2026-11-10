import { describe, expect, it } from "vitest";
import {
  changeRoleSchema,
  createUserSchema,
  setUserActiveSchema,
  validateActiveChange,
  validateCreateUser,
  validateRoleChange,
} from "./users";

const validUser = {
  name: "Ana Pérez",
  email: "Ana.Perez@Planta.example",
  role: "TECHNICIAN",
  password: "clave-segura-1",
} as const;

describe("createUserSchema", () => {
  it("normalizes the email and trims the name", () => {
    const parsed = createUserSchema.parse({ ...validUser, name: "  Ana Pérez  " });

    expect(parsed.email).toBe("ana.perez@planta.example");
    expect(parsed.name).toBe("Ana Pérez");
  });

  it("rejects a short password", () => {
    expect(createUserSchema.safeParse({ ...validUser, password: "corta" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(createUserSchema.safeParse({ ...validUser, role: "ROOT" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(createUserSchema.safeParse({ ...validUser, email: "no-es-correo" }).success).toBe(false);
  });
});

describe("changeRoleSchema and setUserActiveSchema", () => {
  it("accepts well-formed payloads", () => {
    expect(changeRoleSchema.safeParse({ userId: "u1", role: "VIEWER" }).success).toBe(true);
    expect(setUserActiveSchema.safeParse({ userId: "u1", active: false }).success).toBe(true);
  });

  it("rejects an empty user id", () => {
    expect(changeRoleSchema.safeParse({ userId: "", role: "VIEWER" }).success).toBe(false);
    expect(setUserActiveSchema.safeParse({ userId: "", active: true }).success).toBe(false);
  });
});

describe("validateCreateUser", () => {
  it("lets a supervisor create technicians but not supervisors", () => {
    expect(validateCreateUser({ actorId: "s", actorRole: "SUPERVISOR" }, "TECHNICIAN")).toBeNull();
    expect(
      validateCreateUser({ actorId: "s", actorRole: "SUPERVISOR" }, "SUPERVISOR"),
    ).not.toBeNull();
  });

  it("lets an admin create admins", () => {
    expect(validateCreateUser({ actorId: "a", actorRole: "ADMIN" }, "ADMIN")).toBeNull();
  });
});

describe("validateRoleChange", () => {
  const base = {
    actorId: "admin",
    actorRole: "ADMIN" as const,
    targetId: "other",
    targetRole: "TECHNICIAN" as const,
    newRole: "SUPERVISOR" as const,
    otherActiveAdmins: 1,
  };

  it("allows an admin to promote a technician", () => {
    expect(validateRoleChange(base)).toBeNull();
  });

  it("forbids changing your own role", () => {
    expect(validateRoleChange({ ...base, targetId: "admin" })).toMatch(/propio rol/);
  });

  it("forbids a supervisor from touching a supervisor", () => {
    expect(
      validateRoleChange({
        ...base,
        actorId: "s",
        actorRole: "SUPERVISOR",
        targetRole: "SUPERVISOR",
        newRole: "VIEWER",
      }),
    ).toMatch(/permiso/);
  });

  it("forbids a supervisor from promoting someone above them", () => {
    expect(
      validateRoleChange({
        ...base,
        actorId: "s",
        actorRole: "SUPERVISOR",
        targetRole: "VIEWER",
        newRole: "ADMIN",
      }),
    ).toMatch(/superior/);
  });

  it("keeps at least one active admin when demoting the last one", () => {
    expect(
      validateRoleChange({
        ...base,
        targetRole: "ADMIN",
        newRole: "VIEWER",
        otherActiveAdmins: 0,
      }),
    ).toMatch(/al menos un administrador/);
  });

  it("allows demoting an admin when another active admin exists", () => {
    expect(
      validateRoleChange({
        ...base,
        targetRole: "ADMIN",
        newRole: "VIEWER",
        otherActiveAdmins: 1,
      }),
    ).toBeNull();
  });
});

describe("validateActiveChange", () => {
  const base = {
    actorId: "admin",
    actorRole: "ADMIN" as const,
    targetId: "other",
    targetRole: "TECHNICIAN" as const,
    active: false,
    otherActiveAdmins: 1,
  };

  it("allows deactivating another technician", () => {
    expect(validateActiveChange(base)).toBeNull();
  });

  it("forbids deactivating yourself", () => {
    expect(validateActiveChange({ ...base, targetId: "admin" })).toMatch(/propia cuenta/);
  });

  it("forbids deactivating the last active admin", () => {
    expect(validateActiveChange({ ...base, targetRole: "ADMIN", otherActiveAdmins: 0 })).toMatch(
      /al menos un administrador/,
    );
  });

  it("allows reactivating anyone the actor can manage", () => {
    expect(validateActiveChange({ ...base, active: true })).toBeNull();
  });
});
