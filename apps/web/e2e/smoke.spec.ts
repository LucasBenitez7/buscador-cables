import { expect, test } from "@playwright/test";
import { storageStatePath } from "./support/data";

test.describe("sin sesión", () => {
  test("una página privada lleva al login y vuelve a ella después", async ({ page }) => {
    await page.goto("/cables");

    await expect(page).toHaveURL(/\/login\?next=%2Fcables/);
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("el endpoint de salud responde ok", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", database: "ok" });
  });
});

test.describe("con sesión", () => {
  test.describe("técnico", () => {
    test.use({ storageState: storageStatePath("technician") });

    test("muestra el avance de la obra sin los datos de administración", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Avance de la obra" })).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Tendidos" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Tu actividad reciente" })).toBeVisible();
      await expect(page.getByTestId("health-database")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Usuarios activos" })).toHaveCount(0);
    });
  });

  test.describe("administrador", () => {
    test.use({ storageState: storageStatePath("admin") });

    test("muestra el estado de la base de datos y los usuarios", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Usuarios activos" })).toBeVisible();
      await expect(page.getByTestId("health-database")).toHaveAttribute("data-status", "ok");
    });
  });
});
