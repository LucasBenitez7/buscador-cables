import path from "node:path";
import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { cableHeader, openCable } from "./support/cables";

/**
 * Excel inventado: un cable que cambia, uno que contradice lo tendido en la web, uno nuevo y
 * una fila «Check» que no se usa.
 */
const EXCEL = path.join(__dirname, "__fixtures__", "estado-electrico_16.11.26.xlsx");

test.describe("supervisora", () => {
  test.use({ storageState: storageStatePath("supervisor") });

  test("sube el Excel del día, revisa la vista previa y lo aplica", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Excel del día", level: 1 })).toBeVisible();

    await page.getByLabel("Archivo").setInputFiles(EXCEL);
    await expect(page.getByText("3 cables")).toBeVisible();
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
