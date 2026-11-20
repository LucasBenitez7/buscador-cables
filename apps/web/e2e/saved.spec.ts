import { expect, test } from "@playwright/test";
import { CABLES, SEARCH_QUERY, storageStatePath } from "./support/data";
import { openCable } from "./support/cables";

// Cualquier rol guarda: se prueba con el de solo lectura.
test.use({ storageState: storageStatePath("viewer") });

test("se guarda un cable desde su ficha en una carpeta nueva y se quita de ella", async ({
  page,
}) => {
  const folder = `Ficha ${Date.now()}`;
  await openCable(page, CABLES.search.code);

  await page.getByRole("button", { name: "Añadir a carpetas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Añadir ${CABLES.search.code} a carpetas` });
  await dialog.getByLabel("Nueva carpeta").fill(folder);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`1 cable en «${folder}».`)).toBeVisible();

  // Al volver a abrirlo, la carpeta sale marcada.
  await page.getByRole("button", { name: "Añadir a carpetas", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: folder })).toBeChecked();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Guardados" })
    .click();
  const card = page.getByRole("listitem").filter({ hasText: folder });
  await expect(card).toContainText("1 cable");
  await card.getByRole("link", { name: folder }).click();
  await expect(page.getByRole("heading", { level: 1, name: folder })).toBeVisible();
  await expect(page.getByRole("link", { name: CABLES.search.code })).toBeVisible();

  await page.getByRole("button", { name: "Seleccionar" }).click();
  await page.getByText("Seleccionar todas (1)").click();
  await page
    .getByRole("region", { name: "Elegidos" })
    .getByRole("button", { name: "Quitar" })
    .click();
  await expect(page.getByText("Esta carpeta está vacía.")).toBeVisible();

  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("button", { name: "Borrar carpeta" }).click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole("link", { name: folder })).toHaveCount(0);
});

test("se guardan de golpe los cables elegidos en el buscador", async ({ page }) => {
  const folder = `Buscador ${Date.now()}`;
  await page.goto(`/cables?q=${SEARCH_QUERY}`);
  await page.getByRole("button", { name: "Seleccionar" }).click();
  await page.getByText("Seleccionar todas (2)").click();

  const bar = page.getByRole("region", { name: "Elegidos" });
  await bar.getByRole("button", { name: "Añadir a carpetas" }).click();
  const dialog = page.getByRole("dialog", { name: "Añadir 2 cables a carpetas" });
  await dialog.getByLabel("Nueva carpeta").fill(folder);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await expect(bar.getByText(`2 cables en «${folder}».`)).toBeVisible();

  await page.goto("/saved");
  await expect(page.getByRole("listitem").filter({ hasText: folder })).toContainText("2 cables");
});
