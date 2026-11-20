import { expect, test } from "@playwright/test";
import { storageStatePath } from "./support/data";

// Una tablet en vertical (fase 17): entre 640 y 767 px el botón de los filtros se veía, pero
// los filtros ya estaban abiertos y pulsarlo no los cerraba.
test.use({ storageState: storageStatePath("technician"), viewport: { width: 700, height: 900 } });

for (const path of ["/trays", "/equipment", "/locations"]) {
  test(`los filtros de ${path} se abren y se cierran con su botón`, async ({ page }) => {
    await page.goto(path);
    const button = page.getByRole("button", { name: /Más filtros/ });
    const panel = page.locator(`#${await button.getAttribute("aria-controls")}`);

    await expect(panel).toBeHidden();
    await button.click();
    await expect(panel).toBeVisible();
    await expect(page.getByRole("button", { name: /Menos filtros/ })).toBeVisible();
    await page.getByRole("button", { name: /Menos filtros/ }).click();
    await expect(panel).toBeHidden();
  });
}
