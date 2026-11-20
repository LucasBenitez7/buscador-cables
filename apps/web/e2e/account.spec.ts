import { expect, test } from "@playwright/test";
import { ACCOUNT_USER, PASSWORD, USERS, storageStatePath } from "./support/data";
import { clearMailbox, linkFromLatestEmail } from "./support/mailpit";
import { signIn, submitLogin } from "./support/auth";

test.describe.configure({ mode: "serial" });

test("«Mi cuenta»: cada uno cambia su nombre y su contraseña", async ({ page, browser }) => {
  await clearMailbox();
  // Otra sesión abierta, en otro dispositivo: al cambiar la contraseña se cierra.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, ACCOUNT_USER.email);
  await signIn(page, ACCOUNT_USER.email);

  // Desde el menú con su nombre.
  await page.getByRole("button", { name: `Menú de ${ACCOUNT_USER.name}` }).click();
  await page.getByRole("menuitem", { name: "Mi cuenta" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible();
  await expect(page.getByText(ACCOUNT_USER.email)).toBeVisible();

  // Un correo no vale como nombre; un nombre de verdad sí, y se ve en la cabecera.
  const name = page.getByLabel("Nombre y apellidos");
  await name.fill("cuenta@e2e.test");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByText("Escribe tu nombre y apellidos, no tu correo")).toBeVisible();
  await name.fill("Marta Cuenta Nueva");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByText("Nombre guardado.")).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Marta Cuenta Nueva");

  // La contraseña actual equivocada no la cambia.
  const newPassword = "Otra-Clave-Segura-2";
  await page.getByLabel("Contraseña actual", { exact: true }).fill("no-es-la-clave-1");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(newPassword);
  await page.getByLabel("Repite la nueva", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText("La contraseña actual no es correcta.")).toBeVisible();

  await page.getByLabel("Contraseña actual", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  // Regresión: se quedaba sin sesión y acababa en el inicio, sin el mensaje.
  await expect(
    page.getByText("Contraseña cambiada. Se han cerrado tus otras sesiones."),
  ).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/account");
  // Sigue dentro, la otra sesión ya no vale y le llega el aviso por correo.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible();
  await otherPage.goto("/account");
  await expect(otherPage).toHaveURL((url) => url.pathname === "/login");
  await other.close();
  await linkFromLatestEmail(ACCOUNT_USER.email, /tu contraseña ha cambiado/);

  // La antigua ya no entra; la nueva sí.
  await page.context().clearCookies();
  await submitLogin(page, ACCOUNT_USER.email);
  await expect(page.getByRole("alert")).toBeVisible();
  await signIn(page, ACCOUNT_USER.email, newPassword);
});

test.describe("el administrador", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("ve la ficha de cada persona con su correo y el cambio de nombre, sin poder editarlo", async ({
    page,
  }) => {
    await page.goto("/admin/users?q=cuenta%40e2e.test");
    await page.getByRole("link", { name: "Marta Cuenta Nueva" }).first().click();

    await expect(page.getByRole("heading", { level: 1, name: "Marta Cuenta Nueva" })).toBeVisible();
    await expect(page.getByText(ACCOUNT_USER.email).first()).toBeVisible();
    await expect(
      page.getByText(
        "Marta Cuenta Nueva cambió su nombre de «Marta Cuenta» a «Marta Cuenta Nueva»",
      ),
    ).toBeVisible();
    // El nombre solo lo cambia su dueño.
    await expect(page.getByLabel("Nombre y apellidos")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver su actividad" })).toHaveAttribute(
      "href",
      /\/activity\?actor=/,
    );
    expect(USERS.admin.email).not.toBe(ACCOUNT_USER.email);
  });
});
