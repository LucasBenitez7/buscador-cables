// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth } from "./health";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@cables/db", () => ({ prisma: { $queryRaw: queryRaw } }));

describe("getHealth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryRaw.mockReset();
  });

  it("reports ok when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(getHealth()).resolves.toMatchObject({ status: "ok", database: "ok" });
  });

  // Regresión: el endpoint público devolvía el mensaje de error de la conexión
  // (host, usuario, motivo), útil para un atacante.
  it("reports the failure without leaking the database error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(
      new Error('password authentication failed for user "cables" at db.internal:5432'),
    );

    const report = await getHealth();

    expect(report).toMatchObject({ status: "error", database: "error" });
    expect(JSON.stringify(report)).not.toMatch(/cables|db\.internal|password/);
    expect(consoleError).toHaveBeenCalled();
  });
});
