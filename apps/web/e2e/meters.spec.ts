import { expect, test } from "@playwright/test";
import { storageStatePath } from "./support/data";

test.use({ storageState: storageStatePath("supervisor") });

// Fase 17: la obra en metros, con sus pestañas. Las bobinas tienen su página desde la fase 18.
test("«Metros» enseña el avance y la desviación, y las bobinas van a su página", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Metros tendidos")).toBeVisible();
  await page.getByRole("link", { name: "Ver metros" }).click();

  await expect(page.getByRole("heading", { name: "Metros", level: 1 })).toBeVisible();
  await expect(page.getByText("Metros tendidos")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por nivel" })).toBeVisible();

  const tabs = page.getByLabel("Qué ver");
  await tabs.getByRole("link", { name: "Desviación" }).click();
  await expect(tabs.getByRole("link", { name: "Desviación" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await expect(tabs.getByRole("link", { name: "Bobinas" })).toHaveCount(0);

  // Los enlaces de antes a la pestaña llevan a la página de las bobinas.
  await page.goto("/meters?tab=bobinas");
  await expect(page).toHaveURL(/\/reels$/);
  await expect(page.getByRole("search", { name: "Buscar bobinas" })).toBeVisible();
});
