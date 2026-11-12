import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { openCable } from "./support/cables";

test.use({ storageState: storageStatePath("admin") });

const ORIGIN = "Planta E2E › Calderas › Armario A";
const DESTINATION = "Planta E2E › Calderas › Bandeja B";
const STORE = "Planta E2E › Almacén";

test("alta, edición y baja de un cable", async ({ page }) => {
  await page.goto("/cables");
  await page.getByRole("link", { name: "Nuevo cable" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo cable" })).toBeVisible();

  // El código se normaliza al guardar y el formulario lo anuncia.
  await page.getByLabel("Código").fill("nb 77");
  await expect(page.getByText("Se guardará como NB-77")).toBeVisible();
  await page.getByLabel("Descripción").fill("Alimentación de la bomba de condensado");
  await page.getByLabel("Tipo").selectOption({ label: "Control" });
  await page.getByLabel("Fabricante").selectOption({ label: "Prysmian" });
  await page.getByLabel("Nº de conductores").fill("4");
  await page.getByLabel("Origen").selectOption({ label: ORIGIN });
  await page.getByLabel("Destino").selectOption({ label: DESTINATION });
  await page.getByLabel("Instalación").selectOption({ label: "En almacén" });
  await page.getByLabel("Dónde está ahora").selectOption({ label: STORE });
  await page.getByRole("button", { name: "Dar de alta" }).click();

  await expect(page).toHaveURL(/\/cables\/[^/]+\/edit\?created=1/);
  await expect(
    page.getByText("Cable dado de alta. Puedes seguir completando sus datos."),
  ).toBeVisible();

  await page.getByLabel("Longitud (m)").fill("85,5");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();

  await page.getByRole("link", { name: "Ver ficha" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "NB-77" })).toBeVisible();
  await expect(page.getByText("85,5 m")).toBeVisible();
  await expect(page.getByText(ORIGIN, { exact: true })).toBeVisible();
  const history = page.getByRole("listitem").filter({ hasText: "Ada Admin" });
  await expect(history).toHaveCount(2);
  await expect(history.first()).toContainText("Datos editados");

  // Baja: pide confirmación del navegador y un motivo.
  await page.getByRole("link", { name: "Editar datos" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("¿Dar de baja el cable NB-77?");
    void dialog.accept();
  });
  await page.getByLabel("Motivo de la baja").fill("Duplicado en la carga inicial");
  await page.getByRole("button", { name: "Dar de baja" }).click();

  await expect(page).toHaveURL(/\/cables\?deleted=NB-77/);
  await expect(page.getByText("Cable NB-77 dado de baja.")).toBeVisible();
  await page.getByLabel("Código o descripción").fill("NB-77");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("link", { name: "NB-77", exact: true })).toHaveCount(0);
});

test("avisa si otra persona ha editado el cable mientras tanto", async ({ page, context }) => {
  await openCable(page, CABLES.concurrency.code);
  await page.getByRole("link", { name: "Editar datos" }).click();
  const other = await context.newPage();
  await other.goto(page.url());

  await other.getByLabel("Descripción").fill("Cambio de la primera persona");
  await other.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(other.getByText("Cambios guardados.")).toBeVisible();

  await page.getByLabel("Descripción").fill("Cambio de la segunda persona");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Otra persona ha modificado este cable mientras lo editabas.",
  );

  // No se ha pisado lo que guardó la primera.
  await page.reload();
  await expect(page.getByLabel("Descripción")).toHaveValue("Cambio de la primera persona");
});
