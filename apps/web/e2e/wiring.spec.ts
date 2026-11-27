import { expect, test, type Page } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { openCable, openSection } from "./support/cables";

const { code } = CABLES.wiring;

/** Abre la pestaña Conexionado de la ficha del cable con tabla de hilos. */
async function openWiring(page: Page) {
  await openCable(page, code);
  await page
    .getByRole("navigation", { name: "Vista del cable" })
    .getByRole("link", { name: /Conexionado/ })
    .click();
  // La tabla de bornas empieza plegada: se usa menos que el plano.
  await openSection(page, /^Bornas/);
  await expect(page.getByRole("table", { name: /Hilos del cable/ })).toBeVisible();
}

test.describe("técnico", () => {
  test.use({ storageState: storageStatePath("technician") });

  test("corrige una borna, confirma la borna repetida y ve el cambio en la actividad", async ({
    page,
  }) => {
    await openWiring(page);
    const table = page.getByRole("table", { name: /Hilos del cable/ });
    await expect(table.getByRole("row", { name: /BN/ })).toContainText("X51");

    await page.getByRole("switch", { name: "Modo editar" }).click();
    await page.getByLabel("Borna de origen del hilo BU").fill("11");
    // `filter`: Next tiene su propio role="alert" oculto para anunciar la página.
    const warning = page.getByRole("alert").filter({ hasText: "Dos o más hilos" });
    await expect(warning).toContainText("Origen: el BN y el BU van a X51 · 11.");

    await page.getByLabel("Nota (opcional)").fill("Borna 12 dañada en campo");
    await page.getByRole("button", { name: "Guardar 1 hilo" }).click();
    await page.getByRole("button", { name: "Guardar igualmente" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Bornas guardadas" })).toHaveText(
      "Bornas guardadas: 1 hilo corregido.",
    );
    await expect(table.getByRole("row", { name: /BU/ })).toContainText("Listado: 12");
    await expect(page.getByText("1 corregido en campo")).toBeVisible();

    // Una sola línea en el historial, con su página de detalle.
    await openSection(page, /^Historial/);
    await expect(page.getByText("corrigió las bornas de 1 hilo en origen")).toBeVisible();
    await page.getByRole("link", { name: "Ver qué cambió" }).first().click();
    const detail = page.getByRole("table", { name: /Celdas cambiadas/ });
    await expect(detail.getByRole("row", { name: /BU/ })).toContainText("12");
    await expect(detail.getByRole("row", { name: /BU/ })).toContainText("11");
    await expect(page.getByText("“Borna 12 dañada en campo”")).toBeVisible();
  });

  test("ve el equipo con sus cables por regletero", async ({ page }) => {
    await page.goto("/equipment?q=99bmc");
    await page.getByRole("link", { name: "99BMC", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "99BMC" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Regletero X51/ })).toBeVisible();
    await expect(page.getByRole("link", { name: code })).toBeVisible();

    // Fase 19: dónde está, por la sala de sus cables; sin planos cargados en esta base.
    const where = page.locator("#donde");
    await expect(where.getByText("No aparece en los planos cargados.")).toBeVisible();
    await where.getByRole("link", { name: /Armario A$/ }).click();
    await expect(page).toHaveURL(/\/locations\/e2e-origin$/);
  });
});

test.describe("consulta", () => {
  test.use({ storageState: storageStatePath("viewer") });

  test("ve el conexionado pero no puede editarlo", async ({ page }) => {
    await openWiring(page);
    await expect(page.getByRole("switch", { name: "Modo editar" })).toHaveCount(0);
  });
});
