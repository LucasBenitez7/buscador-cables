import { expect, test, type Page } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { openCable } from "./support/cables";

const nav = (page: Page) => page.getByRole("navigation", { name: "Principal" });

test.describe("consulta", () => {
  test.use({ storageState: storageStatePath("viewer") });

  test("solo ve: ni alta, ni edición, ni acciones", async ({ page }) => {
    await page.goto("/cables");
    await expect(page.getByRole("link", { name: "Nuevo cable" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Actividad", exact: true })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Usuarios" })).toHaveCount(0);

    await openCable(page, CABLES.search.code);
    await expect(page.getByRole("link", { name: "Editar datos" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Acciones" })).toHaveCount(0);
  });

  test("las páginas sin permiso llevan al inicio", async ({ page }) => {
    for (const path of ["/cables/new", "/activity", "/admin/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    }
  });
});

test.describe("técnico", () => {
  test.use({ storageState: storageStatePath("technician") });

  test("ve su actividad pero no la de todos", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page).getByRole("link", { name: "Mi actividad" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Actividad", exact: true })).toHaveCount(0);

    await page.goto("/activity");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("administrador", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("ve todas las secciones y marca la actual", async ({ page }) => {
    await page.goto("/cables");
    const links = nav(page).getByRole("link");
    await expect(links).toHaveText([
      "Inicio",
      "Cables",
      "Bandejas",
      "Ubicaciones",
      "Mi actividad",
      "Actividad",
      "Catálogos",
      "Usuarios",
    ]);
    await expect(nav(page).getByRole("link", { name: "Cables" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav(page).getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
