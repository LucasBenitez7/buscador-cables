import { expect, type Locator, type Page } from "@playwright/test";

/** Abre la ficha de un cable buscándolo por su código, como haría un usuario. */
export async function openCable(page: Page, code: string) {
  await page.goto(`/cables?q=${encodeURIComponent(code)}`);
  await page.getByRole("link", { name: code, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();
}

/** Cabecera de la ficha, donde están el código y las etiquetas de estado. */
export const cableHeader = (page: Page) => page.locator("article > header");

/**
 * Abre el diálogo de una acción desde la ficha, rellena lo que haga falta con `fill` y la
 * registra. Espera a que el diálogo se cierre, que es cuando el servidor la ha guardado.
 */
export async function runAction(
  page: Page,
  action: string,
  fill: (dialog: Locator) => Promise<unknown> = async () => {},
) {
  await page
    .getByRole("region", { name: "Acciones" })
    .getByRole("button", { name: action, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  // `exact`: "Conectar" no debe encontrar también "Desconectar".
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
