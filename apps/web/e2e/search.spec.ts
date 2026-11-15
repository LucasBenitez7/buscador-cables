import { expect, test } from "@playwright/test";
import { CABLES, SEARCH_QUERY, storageStatePath } from "./support/data";

test.use({ storageState: storageStatePath("technician") });

test("buscar, filtrar, abrir la ficha y volver con los filtros puestos", async ({ page }) => {
  const { search, searchSibling } = CABLES;
  await page.goto("/cables");

  // Como lo escribiría alguien en planta: sin guion y en minúsculas.
  await page.getByLabel("Código, equipo o descripción").fill(SEARCH_QUERY);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(new RegExp(`q=${SEARCH_QUERY}`));
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: search.code, exact: true })).toBeVisible();
  await expect(table.getByRole("link", { name: searchSibling.code, exact: true })).toBeVisible();

  await page.getByLabel("Instalación").selectOption({ label: "Tendido" });
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/installation=LAID/);
  await expect(page.getByText("1 cable", { exact: true })).toBeVisible();
  await expect(table.getByRole("link", { name: searchSibling.code, exact: true })).toHaveCount(0);

  await table.getByRole("link", { name: search.code, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: search.code })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`q=${SEARCH_QUERY}`));
  await expect(page).toHaveURL(/installation=LAID/);
  await expect(page.getByLabel("Código, equipo o descripción")).toHaveValue(SEARCH_QUERY);
  await expect(page.getByLabel("Instalación")).toHaveValue("LAID");
  await expect(page.getByText("1 cable", { exact: true })).toBeVisible();
});

test("ordenar por código en un sentido y en el otro", async ({ page }) => {
  await page.goto(`/cables?q=${SEARCH_QUERY}&sort=code&dir=asc`);
  const table = page.getByRole("table");
  const codeHeader = table.getByRole("columnheader", { name: "Código" });
  const codes = table.locator("tbody tr td:first-child a");

  await expect(codeHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(codes).toHaveText([CABLES.search.code, CABLES.searchSibling.code]);

  await codeHeader.getByRole("link").click();
  await expect(codeHeader).toHaveAttribute("aria-sort", "descending");
  await expect(codes).toHaveText([CABLES.searchSibling.code, CABLES.search.code]);
});

test("limpiar quita todos los filtros", async ({ page }) => {
  await page.goto(`/cables?q=${SEARCH_QUERY}&installation=LAID`);

  await page.getByRole("button", { name: "Limpiar filtros" }).click();

  await expect(page).toHaveURL(/\/cables$/);
  await expect(page.getByLabel("Código, equipo o descripción")).toHaveValue("");
});
