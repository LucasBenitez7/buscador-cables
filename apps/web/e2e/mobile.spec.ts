import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";

// Proyecto "mobile" (Pixel 7): cómo se usa la app en planta, con el móvil.
test.use({ storageState: storageStatePath("technician") });

test("el menú se abre, marca la sección actual y se cierra al navegar", async ({ page }) => {
  await page.goto("/cables");
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();

  await page.getByRole("button", { name: "Abrir menú" }).click();
  const menu = page.getByRole("dialog", { name: "Menú" });
  await expect(menu.getByRole("link", { name: "Cables" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

  await menu.getByRole("link", { name: "Mi actividad" }).click();
  await expect(page.getByRole("heading", { name: "Mi actividad" })).toBeVisible();
  await expect(menu).toBeHidden();
});

test("los filtros se despliegan y los resultados son tarjetas", async ({ page }) => {
  await page.goto("/cables");
  await expect(page.getByLabel("Tipo")).toBeHidden();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByLabel("Tipo")).toBeVisible();

  await page.getByLabel("Código, equipo o descripción").fill(CABLES.mobile.code);
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page.getByRole("table")).toBeHidden();
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: CABLES.mobile.code, exact: true }),
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Enrollado");
});

test("registra una acción desde la tarjeta sin abrir la ficha", async ({ page }) => {
  const { code } = CABLES.mobile;
  await page.goto(`/cables?q=${code}`);
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: code, exact: true }),
  });

  await card.getByRole("button", { name: "Acción" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Registrar acción · ${code}`);
  await dialog.getByRole("button", { name: "Mover" }).click();
  await dialog.getByLabel("Nuevo sitio").selectOption({ label: "Planta E2E › Almacén" });
  await dialog.getByRole("button", { name: "Mover" }).click();

  await expect(dialog).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(`Movimiento registrado en ${code}: movido.`);
});
