import { expect, test } from "@playwright/test";
import { storageStatePath } from "./support/data";

test.use({ storageState: storageStatePath("supervisor") });

// Fase 17: la obra en metros, con sus tres pestañas y la bobina que lleva a sus cables.
test("«Metros» enseña el avance, la desviación y las bobinas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Metros tendidos" }).click();

  await expect(page.getByRole("heading", { name: "Metros", level: 1 })).toBeVisible();
  await expect(page.getByText("Metros tendidos")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por nivel" })).toBeVisible();

  const tabs = page.getByLabel("Qué ver");
  await tabs.getByRole("link", { name: "Desviación" }).click();
  await expect(tabs.getByRole("link", { name: "Desviación" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await tabs.getByRole("link", { name: "Bobinas" }).click();
  await expect(page.getByRole("search", { name: "Buscar bobinas" })).toBeVisible();
});
