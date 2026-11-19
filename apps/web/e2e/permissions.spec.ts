import { expect, test, type Page } from "@playwright/test";
import { CABLES, USERS, storageStatePath } from "./support/data";
import { openCable } from "./support/cables";

const nav = (page: Page) => page.getByRole("navigation", { name: "Principal" });

test.describe("consulta", () => {
  test.use({ storageState: storageStatePath("viewer") });

  test("solo ve: ni alta, ni edición, ni acciones", async ({ page }) => {
    await page.goto("/cables");
    await expect(page.getByRole("link", { name: "Nuevo cable" })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Usuarios" })).toHaveCount(0);

    await openCable(page, CABLES.search.code);
    await expect(page.getByRole("link", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Acciones" })).toHaveCount(0);

    // «Actividad» la tiene (fase 17), pero solo la suya: sin elegir persona.
    await nav(page).getByRole("link", { name: "Actividad", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
    await expect(page.getByLabel("Quién")).toHaveCount(0);
  });

  test("las páginas sin permiso llevan al inicio", async ({ page }) => {
    // «Actividad» la tienen todos (cada uno ve la suya): ya no está en esta lista.
    for (const path of ["/cables/new", "/admin/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    }
  });
});

test.describe("técnico", () => {
  test.use({ storageState: storageStatePath("technician") });

  // Revisión F0-F7 (M1): Better Auth dejaba cambiarse el nombre, y el historial enseña el
  // nombre actual de quien hizo cada cosa.
  test("no puede cambiarse el nombre para firmar como otra persona", async ({ page }) => {
    await page.goto("/");
    const response = await page.request.post("/api/auth/update-user", {
      data: { name: "Ada Admin" },
      headers: { origin: new URL(page.url()).origin },
    });

    expect(response.status()).toBe(403);
    expect(((await response.json()) as { code?: string }).code).toBe("PROFILE_LOCKED");
    await page.reload();
    await expect(page.getByRole("banner")).toContainText(USERS.technician.name);
  });

  // Fase 17: una sola «Actividad»; quien no ve la de todos solo ve la suya, sin elegir persona.
  test("ve su actividad pero no la de todos", async ({ page }) => {
    await page.goto("/");
    await expect(nav(page).getByRole("link", { name: "Actividad", exact: true })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Mi actividad" })).toHaveCount(0);

    await page.goto(`/activity?actor=${encodeURIComponent("otra-persona")}`);
    await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
    await expect(page.getByText("Lo que has registrado tú en los cables.")).toBeVisible();
    await expect(page.getByLabel("Quién")).toHaveCount(0);

    // Los enlaces antiguos a «Mi actividad» siguen llevando a su actividad.
    await page.goto("/activity/me");
    await expect(page).toHaveURL(/\/activity$/);
  });
});

test.describe("administrador", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("ve la actividad de todos y los enlaces a «Mi actividad» le dejan en la suya", async ({
    page,
  }) => {
    await page.goto("/activity");
    await expect(page.getByLabel("Quién")).toBeVisible();

    await page.goto("/activity/me");
    await expect(page).toHaveURL(/\/activity\?actor=/);
    await expect(page.getByRole("heading", { name: "Actividad" })).toBeVisible();
  });

  test("ve todas las secciones y marca la actual", async ({ page }) => {
    await page.goto("/cables");
    const links = nav(page).getByRole("link");
    await expect(links).toHaveText([
      "Inicio",
      "Cables",
      "Bandejas",
      "Equipos",
      "Ubicaciones",
      "Guardados",
      "Actividad",
    ]);
    // La administración va en "Gestión" (con el número de cuentas pendientes, si las hay): la
    // fila cabe siempre. Ya no hay «Mi actividad» aparte (fase 17).
    await nav(page)
      .getByRole("button", { name: /^Gestión/ })
      .click();
    const manage = page.getByRole("menu");
    await expect(manage.getByRole("menuitem", { name: "Catálogos" })).toBeVisible();
    await expect(manage.getByRole("menuitem", { name: /^Usuarios/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: `Menú de ${USERS.admin.name}` }).click();
    await expect(page.getByRole("menuitem", { name: "Mi actividad" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Cerrar sesión" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav(page).getByRole("link", { name: "Cables" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav(page).getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
