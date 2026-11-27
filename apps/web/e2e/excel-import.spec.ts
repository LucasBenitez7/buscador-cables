import path from "node:path";
import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { cableHeader, openCable, openSection } from "./support/cables";

/**
 * Excel inventado: un cable que cambia, uno que contradice lo tendido en la web, uno nuevo y
 * una fila «Check» que no se usa; las bobinas estimadas, en su tabla total. Y sus bobinas (fase
 * 18): el seguimiento, la lista de almacén y la hoja de tiradas.
 */
const EXCEL = path.join(__dirname, "__fixtures__", "estado-electrico_16.11.26.xlsx");

test.describe("supervisora", () => {
  test.use({ storageState: storageStatePath("supervisor") });

  test("sube el Excel del día, revisa la vista previa y lo aplica", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Excel", level: 1 })).toBeVisible();

    await page.getByLabel("Archivo").setInputFiles(EXCEL);
    await expect(page.getByText("3 cables")).toBeVisible();
    await expect(page.getByText("· 3 bobinas")).toBeVisible();
    await expect(page.getByLabel("Fecha del Excel")).toHaveValue("2026-11-16");
    // La carga del proyecto ya se hizo (fase 17): la casilla no sale a nadie.
    await expect(page.getByLabel("Carga del proyecto")).toHaveCount(0);
    await page.getByRole("button", { name: "Preparar vista previa" }).click();

    await expect(
      page.getByRole("heading", { name: "Eléctrico · Excel del 16/11/2026" }),
    ).toBeVisible();
    const tabs = page.getByLabel("Qué trae el Excel");
    await expect(tabs.getByRole("link", { name: /Cambios/ })).toContainText("1");
    await expect(tabs.getByRole("link", { name: /Nuevos/ })).toContainText("1");
    await expect(tabs.getByRole("link", { name: /Discrepancias/ })).toContainText("1");
    await expect(page.getByRole("link", { name: CABLES.excel.code })).toBeVisible();

    await tabs.getByRole("link", { name: /Nuevos/ }).click();
    await expect(page.getByText("99XAE10W2999")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Aplicar/ }).click();
    await expect(page.getByText("Aplicado", { exact: true }).first()).toBeVisible();
    // Terminado: el siguiente Excel, a un clic.
    await expect(page.getByRole("link", { name: "Subir otro Excel" })).toHaveAttribute(
      "href",
      "/import",
    );

    await openCable(page, CABLES.excel.code);
    await expect(cableHeader(page)).toContainText("Tendido");
    await expect(cableHeader(page)).toContainText("Solo origen");
    // Las dos bobinas: la estimada (de la tabla total) y la que se usó.
    await openSection(page, "Datos del cable");
    const row = (label: string) => page.getByText(label, { exact: true }).locator("..");
    await expect(row("Bobina estimada")).toContainText("B-E2E-03");
    await expect(row("Bobina real")).toContainText("B-E2E-01 · EJ-DRUM 01 · En obra");

    // Fase 18: la bobina real lleva a su ficha, con sus metros y sus tiradas.
    await row("Bobina real").getByRole("link", { name: "B-E2E-01 · EJ-DRUM 01" }).click();
    await expect(page.getByRole("heading", { name: "B-E2E-01", level: 1 })).toBeVisible();
    await expect(page.getByText("Quedan 380 m")).toBeVisible();
    const pulls = page.getByRole("list", { name: "Tiradas" });
    await expect(pulls.getByRole("listitem")).toHaveCount(2);
    await expect(pulls.getByRole("link", { name: CABLES.excel.code })).toHaveCount(2);
    await expect(pulls).toContainText("de 500 m a 440 m");

    // La lista: todas las del Excel, y la que gastó más de lo que tenía, para revisar.
    await page.goto("/reels");
    await expect(page.getByText("3 bobinas")).toBeVisible();
    await page.goto("/reels?state=review");
    await expect(page.getByRole("link", { name: "B-E2E-04" })).toBeVisible();
    await expect(page.getByText("Faltan 10 m")).toBeVisible();
    // Sin seguimiento: lo que queda sale de sus tiradas.
    await page.goto("/reels?q=B-E2E-02");
    await expect(page.getByText("Quedan 220 m")).toBeVisible();

    await page.goto("/import");
    // El último aplicado, con el nombre de su archivo.
    await expect(page.getByRole("link", { name: "estado-electrico_16.11.26.xlsx" })).toBeVisible();
    await expect(page.getByText("Excel del 16/11/2026")).toBeVisible();
    await expect(page.getByText("Sin vista previa pendiente.").first()).toBeVisible();

    // La discrepancia no ha bloqueado nada: el inicio avisa y espera en «Pendientes de revisar».
    await page.goto("/");
    await expect(page.getByText(/1 discrepancia nueva pendiente/)).toBeVisible();
    await page.getByRole("link", { name: "Revisar", exact: true }).click();
    await expect(page).toHaveURL(/\/review$/);
    const pending = page.getByRole("listitem").filter({ hasText: CABLES.review.code });
    await expect(pending).toContainText("En la web");
    await expect(pending).toContainText("Excel del 16/11/2026");
    await expect(pending).toContainText("No tendido");
    // Se decide en bloque: «Seleccionar todas» y el botón de las marcadas.
    await page.getByLabel(/Seleccionar todas/).check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Mantener lo de la web (1)" }).click();
    await expect(page.getByRole("status")).toHaveText("1 decidida.");
    await expect(pending).toHaveCount(0);

    await page.getByRole("link", { name: /Revisadas/ }).click();
    const decided = page.getByRole("listitem").filter({ hasText: CABLES.review.code });
    await expect(decided).toContainText("Se mantuvo lo de la web");
    await expect(decided).toContainText("Sara Supervisora");

    await openCable(page, CABLES.review.code);
    await expect(cableHeader(page)).toContainText("Tendido");

    // Ya la ha visto: el inicio deja de avisar.
    await page.goto("/");
    await expect(page.getByText(/discrepancias? nuevas? pendientes?/)).toHaveCount(0);
  });
});
