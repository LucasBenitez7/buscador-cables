import { describe, expect, it } from "vitest";
import {
  changeRoleSchema,
  createUserSchema,
  setUserActiveSchema,
  signUpProfileSchema,
  signUpSchema,
  validateActiveChange,
  validateCreateUser,
  validateRoleChange,
} from "./users";
import { permissionsOfRole } from "./permissions";

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

  // Revisión F0-F7 (B5): el formato se comprobaba antes de quitar los espacios.
  it("accepts an email pasted with spaces around it", () => {
    const parsed = createUserSchema.parse({ ...validUser, email: "  Ana.Perez@Planta.example " });

    expect(parsed.email).toBe("ana.perez@planta.example");
  });

  it("rejects a short password", () => {
    expect(createUserSchema.safeParse({ ...validUser, password: "corta" }).success).toBe(false);
  });

  // Fase 12: el rol es un id (que el servidor busca en la base); aquí solo su forma.
  it("rejects a malformed role id", () => {
    expect(createUserSchema.safeParse({ ...validUser, role: "../ROOT" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...validUser, role: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(createUserSchema.safeParse({ ...validUser, email: "no-es-correo" }).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const valid = {
    name: "  Luis Gómez ",
    email: "Luis@Planta.example",
    password: "clave-segura-1",
    confirmPassword: "clave-segura-1",
  };

  it("normalizes name and email", () => {
    const parsed = signUpSchema.parse(valid);

    expect(parsed.name).toBe("Luis Gómez");
    expect(parsed.email).toBe("luis@planta.example");
  });

  it("rejects mismatched passwords on the confirmation field", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "otra-clave-12" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "corta",
      confirmPassword: "corta",
    });

    expect(result.success).toBe(false);
  });

  it("does not accept a role", () => {
    const parsed = signUpSchema.parse({ ...valid, role: "ADMIN" });

    expect(parsed).not.toHaveProperty("role");
  });
});

describe("signUpProfileSchema", () => {
  const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
  const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
  const COMBINING_ACUTE = String.fromCodePoint(0x301);
  const nameOf = (name: string) => signUpProfileSchema.safeParse({ name, email: "a@b.example" });
  const errorOf = (name: string) => nameOf(name).error?.issues[0]?.message;

  it("rejects a one-letter name", () => {
    expect(nameOf("A").success).toBe(false);
  });

  // Alguien se registró con su correo como nombre, y el historial lo enseñaba a todos.
  it("rejects an email as the name, with a message that says so", () => {
    expect(errorOf("luis@planta.example")).toBe("Escribe tu nombre y apellidos, no tu correo");
    expect(errorOf("Luis Gómez <luis@planta.example>")).toBe(
      "Escribe tu nombre y apellidos, no tu correo",
    );
  });

  it.each([
    "Luis 600 123 456",
    "https://planta.example",
    "<b>Luis</b>",
    `Lu${ZERO_WIDTH_SPACE}is Gómez`,
    `${RIGHT_TO_LEFT_OVERRIDE}zemóG siuL`,
    "Luis_Gómez",
  ])("rejects %j as a name", (name) => {
    expect(nameOf(name).success).toBe(false);
  });

  it("rejects a name without two letters", () => {
    expect(errorOf("A.")).toBe("El nombre debe tener al menos 2 letras");
    expect(errorOf("--")).toBe("El nombre debe tener al menos 2 letras");
  });

  it.each([
    "José María Núñez",
    "Ana O'Neill-García",
    "Mª Ángeles",
    "François Müller",
    "J. R. Pérez",
  ])("accepts the real name %j", (name) => {
    expect(nameOf(name).data?.name).toBe(name);
  });

  it("collapses spaces and line breaks, and joins accents written apart", () => {
    expect(nameOf("  Ana   Pérez ").data?.name).toBe("Ana Pérez");
    expect(nameOf("Luis\nGómez").data?.name).toBe("Luis Gómez");
    expect(nameOf(`Jose${COMBINING_ACUTE}`).data?.name).toBe("José");
  });

  it("applies the same rules to the accounts an administrator creates", () => {
    const result = createUserSchema.safeParse({ ...validUser, name: "ana@planta.example" });

    expect(result.success).toBe(false);
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

const admin = permissionsOfRole("ADMIN");
const supervisor = permissionsOfRole("SUPERVISOR");

// Fase 12: sin escalera de roles. Solo quien gestiona cuentas (el rol Administrador, y nadie
// más puede tenerlo) las toca.
describe("validateCreateUser", () => {
  it("lets only who manages accounts create users", () => {
    expect(validateCreateUser({ actorId: "a", actor: admin })).toBeNull();
    expect(validateCreateUser({ actorId: "s", actor: supervisor })).toMatch(/permiso/);
  });
});

describe("validateRoleChange", () => {
  const base = {
    actorId: "admin",
    actor: admin,
    targetId: "tec",
    targetRole: "TECHNICIAN",
    newRole: "SUPERVISOR",
    otherActiveAdmins: 0,
  };

  it("lets an admin change the role of someone else, to any role", () => {
    expect(validateRoleChange(base)).toBeNull();
    expect(validateRoleChange({ ...base, newRole: "rol-a-medida" })).toBeNull();
  });

  it("forbids changing your own role, and anyone without the permission", () => {
    expect(validateRoleChange({ ...base, targetId: "admin" })).toMatch(/propio rol/);
    expect(validateRoleChange({ ...base, actorId: "s", actor: supervisor })).toMatch(/permiso/);
  });

  it("keeps at least one active admin", () => {
    expect(
      validateRoleChange({ ...base, targetRole: "ADMIN", newRole: "VIEWER", otherActiveAdmins: 0 }),
    ).toMatch(/al menos un administrador/);
    expect(
      validateRoleChange({ ...base, targetRole: "ADMIN", newRole: "VIEWER", otherActiveAdmins: 1 }),
    ).toBeNull();
  });
});

describe("validateActiveChange", () => {
  const base = {
    actorId: "admin",
    actor: admin,
    targetId: "tec",
    targetRole: "TECHNICIAN",
    active: false,
    otherActiveAdmins: 0,
  };

  it("allows deactivating and reactivating someone else", () => {
    expect(validateActiveChange(base)).toBeNull();
    expect(validateActiveChange({ ...base, active: true })).toBeNull();
  });

  it("forbids deactivating yourself, the last admin, or acting without the permission", () => {
    expect(validateActiveChange({ ...base, targetId: "admin" })).toMatch(/propia cuenta/);
    expect(validateActiveChange({ ...base, targetRole: "ADMIN" })).toMatch(
      /al menos un administrador/,
    );
    expect(validateActiveChange({ ...base, actor: supervisor })).toMatch(/permiso/);
  });
});
