import { expect, test } from "@playwright/test";
import { CABLES, storageStatePath } from "./support/data";
import { openCable } from "./support/cables";

test.use({ storageState: storageStatePath("viewer") });

test("la ficha muestra los extremos y hasta dónde llegó un cable tendido a medias", async ({
  page,
}) => {
  const { code, ends, looseTray } = CABLES.waiting;
  await openCable(page, code);

  await expect(page.getByRole("region", { name: "Origen" })).toContainText(ends[0]);
  const destination = page.getByRole("region", { name: "Destino" });
  await expect(destination).toContainText(ends[1]);
  await expect(destination).toContainText(`Punta suelta en ${looseTray}`);

  const steps = page.getByRole("list", { name: "Tramos del recorrido" });
  await expect(steps.getByRole("listitem")).toHaveCount(2);
  await expect(steps).toContainText("Aquí espera la punta de destino");
  await expect(page.getByText(/Tendido hasta la bandeja/)).toContainText(looseTray);
});

test("de la ficha a la bandeja, y de la bandeja al buscador", async ({ page }) => {
  const { code, looseTray } = CABLES.waiting;
  await openCable(page, code);

  await page
    .getByRole("list", { name: "Tramos del recorrido" })
    .getByRole("link", { name: looseTray })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: looseTray })).toBeVisible();
  const waiting = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Cables esperando aquí (1)" }) });
  await expect(waiting.getByRole("link", { name: code })).toBeVisible();
  await expect(waiting.getByText("Punta de destino suelta aquí")).toBeVisible();

  await page.getByRole("link", { name: "Ver y filtrar en el buscador" }).click();
  await expect(page).toHaveURL(new RegExp(`/cables\\?tray=${looseTray}`));
  await expect(page.getByLabel("Bandeja (código)")).toHaveValue(looseTray);
  await expect(
    page.getByRole("table").getByRole("link", { name: code, exact: true }),
  ).toBeVisible();
});

test("el listado de bandejas busca por código y dice cuántos cables esperan", async ({ page }) => {
  await page.goto("/trays");

  await page.getByLabel("Código de bandeja").fill("99uxb");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/trays\?q=99uxb/i);
  await expect(page.getByText("1 bandeja", { exact: true })).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: "99UXB00L22001" });
  await expect(card).toContainText("1 espera aquí");
});

test("el buscador encuentra un cable por el equipo y filtra por nivel", async ({ page }) => {
  const { code, ends } = CABLES.waiting;
  await page.goto("/cables");

  await page.getByLabel("Código, equipo o descripción").fill(ends[1].toLowerCase());
  await page.getByLabel("Nivel").selectOption("L2");
  await page.getByRole("button", { name: "Buscar" }).click();

  await expect(page).toHaveURL(/level=L2/);
  await expect(page.getByText("1 cable", { exact: true })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("link", { name: code, exact: true })).toBeVisible();
  await expect(table).toContainText(`Punta de destino en ${CABLES.waiting.looseTray}`);
});
