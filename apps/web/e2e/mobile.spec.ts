import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { openActions, openCable } from "./support/cables";

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
  await expect(card).toContainText("No tendido");
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
  await dialog.getByRole("button", { name: "Tender", exact: true }).click();
  await dialog.getByRole("button", { name: "Tender", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(`Movimiento registrado en ${code}: tendido.`);
});

test("la ficha empieza por lo que se usa en campo y las acciones están abajo", async ({ page }) => {
  const { code } = CABLES.waiting;
  await openCable(page, code);

  // Pestañas grandes y, debajo, el recorrido; lo secundario empieza plegado.
  const tabs = page.getByRole("navigation", { name: "Vista del cable" });
  await expect(tabs.getByRole("link", { name: "Recorrido" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("list", { name: "Tramos del recorrido" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Origen" })).toBeHidden();

  // La barra de acciones queda fija abajo, dentro de la pantalla, y se despliega.
  const toggle = page.getByRole("button", { name: "Registrar acción" });
  await expect(toggle).toBeInViewport();
  const actions = await openActions(page);
  await expect(actions.getByRole("button", { name: "Timbrar", exact: true })).toBeInViewport();
  await actions.getByRole("button", { name: "Cerrar" }).click();
  await expect(actions.getByRole("button", { name: "Timbrar", exact: true })).toBeHidden();
});
