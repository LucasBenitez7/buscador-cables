import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, RECOVERY_USER, USERS } from "./support/data";
import { signIn, submitLogin } from "./support/auth";
import { resetRateLimits } from "./support/db";
import { linkFromLatestEmail } from "./support/mailpit";

async function register(page: Page, name: string, email: string) {
  resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Nombre y apellidos").fill(name);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repite la contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("status")).toContainText(`Te hemos enviado un correo a ${email}`);
}

const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}@e2e.test`;

test("registro, confirmación por correo y entrada con el rol de consulta", async ({ page }) => {
  const email = uniqueEmail("nuevo");
  await register(page, "Nico Nuevo", email);

  await page.goto(await linkFromLatestEmail(email, /confirma tu correo/));
  await expect(page.getByText("Correo confirmado. Tu cuenta ya está activa.")).toBeVisible();
  await page.getByRole("link", { name: "Entrar en la aplicación" }).click();

  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  const header = page.getByRole("banner");
  await expect(header).toContainText("Nico Nuevo");
  await expect(header).toContainText("Consulta");
  // Una cuenta nueva solo consulta: no puede dar de alta cables.
  await page.goto("/cables");
  await expect(page.getByRole("link", { name: "Nuevo cable" })).toHaveCount(0);
});

test("una cuenta sin confirmar no entra y recibe un enlace nuevo", async ({ page }) => {
  const email = uniqueEmail("pendiente");
  await register(page, "Paula Pendiente", email);

  await submitLogin(page, email);

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Tu correo aún no está confirmado. Te hemos enviado un enlace nuevo.",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("una contraseña incorrecta no deja entrar", async ({ page }) => {
  await submitLogin(page, USERS.admin.email, "no-es-la-clave-1");

  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Correo o contraseña incorrectos.",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("cerrar sesión vuelve al login y protege las páginas", async ({ page }) => {
  // Sesión propia: cerrar la guardada en `auth.setup.ts` rompería los demás tests.
  await signIn(page, USERS.technician.email);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/cables");
  await expect(page).toHaveURL(/\/login\?next=%2Fcables/);
});

test("recuperar la contraseña por correo y entrar con la nueva", async ({ page }) => {
  const newPassword = "Otra-Clave-Segura-2";
  resetRateLimits();
  await page.goto("/login");
  await page.getByRole("link", { name: "He olvidado mi contraseña" }).click();
  // El login también tiene "Correo electrónico": hay que esperar a la página nueva.
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Correo electrónico").fill(RECOVERY_USER.email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si el correo está registrado");

  await page.goto(await linkFromLatestEmail(RECOVERY_USER.email, /restablecer contraseña/));
  await page.getByLabel("Nueva contraseña").fill(newPassword);
  await page.getByLabel("Repite la contraseña").fill(newPassword);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();

  await expect(page).toHaveURL(/\/login\?reset=ok/);
  await expect(page.getByText("Contraseña actualizada. Ya puedes entrar.")).toBeVisible();

  await submitLogin(page, RECOVERY_USER.email);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Correo o contraseña incorrectos.",
  );

  await signIn(page, RECOVERY_USER.email, newPassword);
  await expect(page.getByRole("banner")).toContainText(RECOVERY_USER.name);
});
