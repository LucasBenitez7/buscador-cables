import { expect, test, type Page } from "@playwright/test";
import { CABLES, SEARCH_QUERY, TRAYS, storageStatePath } from "./support/data";

test.use({ storageState: storageStatePath("viewer") });

/**
 * El diálogo de impresión no se puede manejar desde Playwright: se sustituye `window.print`
 * por una función que guarda la hoja que se iba a imprimir.
 */
async function capturePrint(page: Page) {
  await page.addInitScript(() => {
    const target = window as unknown as { printed?: { title: string; codes: string[] } };
    window.print = () => {
      const sheet = document.querySelector("[data-print-sheet]");
      target.printed = {
        title: sheet?.querySelector("h1")?.textContent ?? "",
        codes: [...(sheet?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? ""),
      };
      window.dispatchEvent(new Event("afterprint"));
    };
  });
}

test("en el buscador se eligen cables, se copian sus códigos y se imprimen", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await capturePrint(page);
  await page.goto(`/cables?q=${SEARCH_QUERY}`);
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: CABLES.search.code, exact: true })).toBeVisible();

  // Sin «Seleccionar», la lista no tiene casillas.
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Seleccionar" }).click();
  const bar = page.getByRole("region", { name: "Elegidos" });
  await expect(bar.getByRole("status")).toHaveText("Ninguno elegido");
  await expect(bar.getByRole("button", { name: "Copiar" })).toBeDisabled();

  await table.getByRole("checkbox", { name: `Elegir ${CABLES.searchSibling.code}` }).check();
  await expect(bar.getByRole("status")).toHaveText("1 elegido");

  await page.getByText("Seleccionar todas (2)").click();
  await expect(bar.getByRole("status")).toHaveText("2 elegidos");

  await bar.getByRole("button", { name: "Copiar" }).click();
  await expect(bar.getByRole("button", { name: "Copiado" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // Uno por línea. El portapapeles del sistema puede cambiar el fin de línea (\r\n en Windows).
  expect(
    copied
      .split(/\r?\n/)
      .map((line) => line.trim())
      .sort(),
  ).toEqual([CABLES.search.code, CABLES.searchSibling.code].sort());

  await bar.getByRole("button", { name: "Imprimir" }).click();
  const printed = await page.evaluate(
    () => (window as unknown as { printed?: { title: string; codes: string[] } }).printed,
  );
  expect(printed?.title).toBe("Cables");
  expect(printed?.codes.sort()).toEqual([CABLES.search.code, CABLES.searchSibling.code].sort());

  await bar.getByRole("button", { name: "Cancelar" }).click();
  await expect(bar).toHaveCount(0);
  await expect(table.getByRole("checkbox")).toHaveCount(0);
});

test("las bandejas se ordenan por menos cables, respetando los filtros", async ({ page }) => {
  await page.goto("/trays?q=99UX");
  await page.getByLabel("Orden").selectOption({ label: "Menos cables primero" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/sort=cables-asc/);
  await expect(page).toHaveURL(/q=99UX/);

  const counts = await page
    .getByRole("listitem")
    .filter({ hasText: /^\s*99UX/ })
    .getByText(/^\d+ cables?/)
    .allTextContents();
  const numbers = counts.map((text) => Number.parseInt(text, 10));
  expect(numbers.length).toBeGreaterThanOrEqual(TRAYS.length);
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
});

test("en una ficha con dos listas solo se elige en una a la vez", async ({ page }) => {
  await page.goto(`/trays/${CABLES.waiting.looseTray}`);

  const waiting = page.locator("#esperando");
  const passing = page.locator("#pasan");
  await waiting.getByRole("button", { name: "Seleccionar" }).click();
  await waiting.getByText(/^Seleccionar todas/).click();
  await expect(page.getByRole("region", { name: "Elegidos" }).getByRole("status")).toHaveText(
    "1 elegido",
  );

  await passing.getByRole("button", { name: "Seleccionar" }).click();
  await expect(page.getByRole("region", { name: "Elegidos" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Elegidos" }).getByRole("status")).toHaveText(
    "Ninguno elegido",
  );
  await expect(waiting.getByRole("checkbox")).toHaveCount(0);
});
