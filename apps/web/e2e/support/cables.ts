import { expect, type Locator, type Page } from "@playwright/test";

/** Abre la ficha de un cable buscándolo por su código, como haría un usuario. */
export async function openCable(page: Page, code: string) {
  await page.goto(`/cables?q=${encodeURIComponent(code)}`);
  await page.getByRole("link", { name: code, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: code })).toBeVisible();
}

/**
 * Despliega un bloque plegable de la ficha (Extremos, Datos del cable, Bornas, Historial…)
 * pulsando su barra, como haría un usuario. Si ya está abierto, lo deja como está.
 */
export async function openSection(page: Page, title: string | RegExp) {
  const section = page
    .locator("details")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) })
    .first();
  if (!(await section.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await section.locator("summary").click();
  }
  return section;
}

/** Cabecera de la ficha, donde están el código y las etiquetas de estado. */
export const cableHeader = (page: Page) => page.locator("article > header");

/**
 * La barra de acciones de la ficha, desplegada: las acciones están plegadas tras el botón
 * «Registrar acción», fijo abajo.
 */
export async function openActions(page: Page) {
  const actions = page.getByRole("region", { name: "Acciones" });
  const toggle = actions.getByRole("button", { name: "Registrar acción" });
  if (await toggle.isVisible()) await toggle.click();
  return actions;
}

/**
 * Abre el diálogo de una acción desde la ficha, rellena lo que haga falta con `fill` y la
 * registra. Espera a que el diálogo se cierre, que es cuando el servidor la ha guardado.
 */
export async function runAction(
  page: Page,
  action: string,
  fill: (dialog: Locator) => Promise<unknown> = async () => {},
) {
  const actions = await openActions(page);
  await actions.getByRole("button", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  // `exact`: "Conectar" no debe encontrar también "Desconectar".
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
