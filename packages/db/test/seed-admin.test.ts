import { describe, expect, it } from "vitest";
import { EXAMPLE_ADMIN, seedAdminProblem } from "../prisma/seed-admin";

const own = { email: "ada@planta.example", password: "Una-Clave-Propia-9" };

// Revisión F0-F7 (B14): el seed creaba en producción el administrador con la contraseña de
// ejemplo de .env.example, que es pública.
describe("seedAdminProblem", () => {
  it("accepts the example credentials on a developer's machine", () => {
    expect(seedAdminProblem({ ...EXAMPLE_ADMIN, production: false })).toBeNull();
  });

  it("refuses the example password in production", () => {
    expect(
      seedAdminProblem({ ...own, password: EXAMPLE_ADMIN.password, production: true }),
    ).toMatch(/contraseña de ejemplo/);
  });

  it("refuses the example email in production", () => {
    expect(seedAdminProblem({ ...own, email: EXAMPLE_ADMIN.email, production: true })).toMatch(
      /correo de ejemplo/,
    );
  });

  it("accepts credentials of your own in production", () => {
    expect(seedAdminProblem({ ...own, production: true })).toBeNull();
  });

  it("refuses a short password everywhere", () => {
    expect(seedAdminProblem({ ...own, password: "corta", production: false })).toMatch(
      /al menos 10 caracteres/,
    );
  });

  it("matches the example values of .env.example", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(new URL("../../../.env.example", import.meta.url), "utf8");

    expect(example).toContain(`SEED_ADMIN_EMAIL=${EXAMPLE_ADMIN.email}`);
    expect(example).toContain(`SEED_ADMIN_PASSWORD=${EXAMPLE_ADMIN.password}`);
  });
});
