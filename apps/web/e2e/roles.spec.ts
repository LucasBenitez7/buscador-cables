import { expect, test } from "@playwright/test";
import { storageStatePath } from "./support/data";

// Fase 12: roles y permisos desde la web. Un nombre propio por ejecución: la base de los E2E
// se crea de nuevo en cada pasada, pero así el test no choca consigo mismo al repetirse.
const ROLE = `Conexionista E2E ${Date.now()}`;

test.describe("administrador", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("crea un rol copiando otro, lo edita y queda en los cambios de las cuentas", async ({
    page,
  }) => {
    await page.goto("/admin/roles");
    await expect(page.getByRole("heading", { level: 1, name: "Roles y permisos" })).toBeVisible();
    await page.getByRole("link", { name: "Crear rol" }).click();

    await page.getByLabel("Empezar copiando").selectOption({ label: "Técnico" });
    await page.getByRole("button", { name: "Copiar" }).click();
    await page.getByLabel("Nombre").fill(ROLE);
    // Un conexionista no tiende: se quita "Tender cables".
    await page.getByLabel(/Tender cables/).uncheck();
    // La gestión de cuentas y de roles no se ofrece fuera del rol Administrador.
    await expect(page.getByLabel(/Gestionar cuentas/)).toHaveCount(0);
    await page.getByRole("button", { name: "Crear rol" }).click();

    await expect(page.getByRole("heading", { level: 1, name: ROLE })).toBeVisible();
    await expect(page.getByLabel(/Tender cables/)).not.toBeChecked();
    await expect(page.getByLabel(/Corregir bornas/)).toBeChecked();

    await page.goto("/admin/users");
    await expect(
      page.getByRole("region", { name: "Qué puede hacer cada rol" }).getByText(ROLE),
    ).toBeVisible();

    await page.goto("/admin/users/events?action=ROLE_CREATED");
    await expect(page.getByText(`creó el rol ${ROLE}`)).toBeVisible();
  });

  test("el rol Administrador se ve pero no se puede cambiar", async ({ page }) => {
    await page.goto("/admin/roles/ADMIN");
    await expect(page.getByText(/no se puede cambiar/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
    await expect(page.getByLabel(/Gestionar cuentas/)).toBeDisabled();
  });
});

for (const user of ["viewer", "technician"] as const) {
  test.describe(user, () => {
    test.use({ storageState: storageStatePath(user) });

    test("no ve roles, permisos ni cambios de cuentas", async ({ page }) => {
      for (const path of ["/admin/roles", "/admin/roles/new", "/admin/users/events"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/$/);
      }
      await expect(page.getByRole("button", { name: /^Gestión/ })).toHaveCount(0);
    });
  });
}
