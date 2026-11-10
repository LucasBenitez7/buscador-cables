import { expect, test } from "@playwright/test";

test.describe("inicio", () => {
  test("muestra la portada con el estado de la base de datos", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Buscador de Cables");
    await expect(page.getByTestId("health-card")).toBeVisible();
    await expect(page.getByTestId("health-database")).toHaveAttribute("data-status", "ok");
  });
});

test.describe("endpoint de salud", () => {
  test("devuelve ok cuando la base de datos responde", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", database: "ok" });
  });
});
