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
  test.use({ storageState: storageStatePath("technician") });

  test("muestra el inicio con el estado de la base de datos", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
    await expect(page.getByTestId("health-database")).toHaveAttribute("data-status", "ok");
  });
});
