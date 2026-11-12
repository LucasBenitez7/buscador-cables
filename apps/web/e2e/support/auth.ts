import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "./data";
import { resetRateLimits } from "./db";

/** Rellena el login y lo envía, sin comprobar el resultado. */
export async function submitLogin(page: Page, email: string, password = PASSWORD) {
  // Los E2E entran muchas veces desde la misma IP: sin esto acabarían en el 429.
  resetRateLimits();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

/** Entra por la pantalla de login y espera al inicio. */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await submitLogin(page, email, password);
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
}
