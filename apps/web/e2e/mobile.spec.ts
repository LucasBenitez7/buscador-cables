import { expect, test } from "@playwright/test";
import { CABLES, SEARCH_QUERY, storageStatePath } from "./support/data";
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

  await menu.getByRole("link", { name: "Actividad", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
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

test("en las tarjetas se eligen cables y la barra de abajo los copia", async ({ page }) => {
  await page.goto(`/cables?q=${SEARCH_QUERY}`);
  await page.getByRole("button", { name: "Seleccionar" }).click();

  // La casilla está sobre la tarjeta: marcarla no abre el cable.
  await page.getByRole("checkbox", { name: `Elegir ${CABLES.search.code}` }).check();
  await expect(page).toHaveURL(/\/cables\?q=/);
  const bar = page.getByRole("region", { name: "Elegidos" });
  await expect(bar.getByRole("status")).toHaveText("1 elegido");
  await expect(bar.getByRole("button", { name: "Copiar" })).toBeInViewport();
  await expect(bar.getByRole("button", { name: "Imprimir" })).toBeInViewport();
});

// Regresión: en «Desviación», las tablas de la rejilla («Por nivel», «Por área») ensanchaban la
// página, y la de los 50 cables y la barra de arriba se veían cortadas.
test("«Metros» cabe en la pantalla y la cabecera de cada tabla se queda a la vista", async ({
  page,
}) => {
  for (const tab of ["avance", "desviacion"]) {
    await page.goto(`/meters?tab=${tab}`);
    await expect(page.getByRole("heading", { name: "Metros", level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `«${tab}» se sale de la pantalla`).toBeLessThanOrEqual(0);
  }

  // Cada tabla se desliza dentro de su caja, y su cabecera se pega arriba de esa caja: no puede
  // pegarse a la página desde una caja que se desliza de lado.
  for (const tab of ["desviacion"]) {
    await page.goto(`/meters?tab=${tab}`);
    const tables = page.locator("main table");
    await expect(tables.first()).toBeVisible();
    for (const table of await tables.all()) {
      const layout = await table.evaluate((element) => {
        const box = getComputedStyle(element.parentElement!);
        const header = getComputedStyle(element.querySelector("th")!);
        // La tarjeta recorta la cabecera (con fondo) a sus esquinas redondeadas.
        const card = getComputedStyle(element.closest("section")!);
        return {
          overflowY: box.overflowY,
          position: header.position,
          top: header.top,
          cardOverflow: card.overflow,
        };
      });
      expect(layout).toEqual({
        overflowY: "auto",
        position: "sticky",
        top: "0px",
        cardOverflow: "clip",
      });
    }
  }

  // Fase 18: «Bobinas» también cabe en el móvil.
  await page.goto("/reels");
  await expect(page.getByRole("searchbox", { name: "Bobina" })).toHaveAttribute(
    "placeholder",
    "Número, drum, solicitud o tipo de cable",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "«Bobinas» se sale de la pantalla").toBeLessThanOrEqual(0);
});
