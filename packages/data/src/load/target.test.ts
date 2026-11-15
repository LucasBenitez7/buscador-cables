import { describe, expect, it } from "vitest";
import { describeTarget, signerProblem } from "./target";

// Revisión F0-F7 (B13): la carga escribía los datos del cliente en lo que dijera
// DATABASE_URL, sin enseñarlo, y la firmaba cualquier usuario.
describe("describeTarget", () => {
  it("says the database and the host, never the user or the password", () => {
    const target = describeTarget(
      "postgresql://cables:secreto@db.example:5432/cables?schema=public",
    );

    expect(target).toBe("cables en db.example:5432");
    expect(target).not.toContain("secreto");
  });

  it.each(["cables_test", "cables_e2e"])("refuses the %s database", (database) => {
    expect(() => describeTarget(`postgresql://cables:x@localhost:5433/${database}`)).toThrow(
      /es de tests y se vacía en cada ejecución/,
    );
  });

  it("refuses a URL without a database or that is not a URL", () => {
    expect(() => describeTarget("postgresql://cables:x@localhost:5433")).toThrow(
      /no indica el nombre/,
    );
    expect(() => describeTarget("cables")).toThrow(/no es una URL/);
  });
});

describe("signerProblem", () => {
  const email = "ada@planta.example";

  it("accepts an active user who can import", () => {
    expect(signerProblem(email, { active: true, canImport: true })).toBeNull();
  });

  it("refuses a user that does not exist, is deactivated or cannot import", () => {
    expect(signerProblem(email, null)).toMatch(/No existe ningún usuario/);
    expect(signerProblem(email, { active: false, canImport: true })).toMatch(/desactivada/);
    expect(signerProblem(email, { active: true, canImport: false })).toMatch(
      /supervisor o un administrador/,
    );
  });
});
