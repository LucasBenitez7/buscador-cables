import path from "node:path";
import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { cableHeader, openCable } from "./support/cables";

/** Excel inventado: un cable que cambia, uno nuevo y una fila «Check» que no se usa. */
const EXCEL = path.join(__dirname, "__fixtures__", "estado-electrico_16.11.26.xlsx");

test.describe("supervisora", () => {
  test.use({ storageState: storageStatePath("supervisor") });

  test("sube el Excel del día, revisa la vista previa y lo aplica", async ({ page }) => {
    await page.goto("/import");
    await expect(page.getByRole("heading", { name: "Excel del día", level: 1 })).toBeVisible();

    await page.getByLabel("Archivo").setInputFiles(EXCEL);
    await expect(page.getByText("2 cables")).toBeVisible();
    await expect(page.getByLabel("Fecha del Excel")).toHaveValue("2026-11-16");
    // La carga del proyecto es solo para administradores.
    await expect(page.getByLabel("Carga del proyecto")).toHaveCount(0);
    await page.getByRole("button", { name: "Preparar vista previa" }).click();

    await expect(
      page.getByRole("heading", { name: "Eléctrico · Excel del 16/11/2026" }),
    ).toBeVisible();
    const tabs = page.getByLabel("Qué trae el Excel");
    await expect(tabs.getByRole("link", { name: /Cambios/ })).toContainText("1");
    await expect(tabs.getByRole("link", { name: /Nuevos/ })).toContainText("1");
    await expect(page.getByRole("link", { name: CABLES.excel.code })).toBeVisible();

    await tabs.getByRole("link", { name: /Nuevos/ }).click();
    await expect(page.getByText("99XAE10W2999")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Aplicar/ }).click();
    await expect(page.getByText("Aplicado", { exact: true }).first()).toBeVisible();

    await openCable(page, CABLES.excel.code);
    await expect(cableHeader(page)).toContainText("Tendido");
    await expect(cableHeader(page)).toContainText("Solo origen");

    await page.goto("/import");
    await expect(page.getByText("Excel del 16/11/2026")).toBeVisible();
    await expect(page.getByText("Sin vista previa pendiente.").first()).toBeVisible();
  });
});
