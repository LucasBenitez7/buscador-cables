import { expect, test } from "@playwright/test";
import { CABLES, USERS, storageStatePath } from "./support/data";
import { cableHeader, openCable, runAction } from "./support/cables";

const STORE = "Planta E2E › Almacén";
const YARD = "Planta E2E › Patio";

test.describe("técnico", () => {
  test.use({ storageState: storageStatePath("technician") });

  test("tiende, conecta los dos extremos, enrolla y mueve un cable", async ({ page }) => {
    const { code } = CABLES.actions;
    await openCable(page, code);
    const badges = cableHeader(page);
    const notice = page.getByRole("region", { name: "Acciones" }).getByRole("status");

    await runAction(page, "Tender");
    await expect(notice).toHaveText(`Movimiento registrado en ${code}: tendido.`);
    await expect(badges).toContainText("Tendido");

    await runAction(page, "Conectar", (dialog) => dialog.getByLabel("Extremo de origen").check());
    await expect(badges).toContainText("Solo origen");

    // El diálogo propone el extremo que falta.
    await runAction(page, "Conectar", (dialog) =>
      expect(dialog.getByLabel("Extremo de destino")).toBeChecked(),
    );
    await expect(badges).toContainText("Conectado");

    await runAction(page, "Enrollar", (dialog) =>
      dialog.getByLabel("Dónde queda enrollado").selectOption({ label: YARD }),
    );
    await expect(badges).toContainText("Enrollado");
    await expect(page.getByText(`Ahora está en: ${YARD}`)).toBeVisible();

    await runAction(page, "Mover", async (dialog) => {
      await dialog.getByLabel("Nuevo sitio").selectOption({ label: STORE });
      await dialog.getByLabel("Nota (opcional)").fill("Vuelve al almacén hasta la parada");
    });
    await expect(page.getByText(`Ahora está en: ${STORE}`)).toBeVisible();

    // Historial, del más reciente al más antiguo.
    const mine = page.getByRole("listitem").filter({ hasText: USERS.technician.name });
    await expect(mine).toHaveCount(5);
    await expect(mine.nth(0)).toContainText("Movido");
    await expect(mine.nth(0)).toContainText("“Vuelve al almacén hasta la parada”");
    await expect(mine.nth(1)).toContainText("Enrollado");
    await expect(mine.nth(2)).toContainText("Conectado");
    await expect(mine.nth(4)).toContainText("Tendido");

    await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Mi actividad" })
      .click();
    await expect(page.getByRole("heading", { name: "Mi actividad" })).toBeVisible();
    await expect(page.getByRole("link", { name: code, exact: true })).toHaveCount(5);
  });

  test("avisa si otra persona registró un movimiento a la vez", async ({ page, context }) => {
    await openCable(page, CABLES.concurrency.code);
    const other = await context.newPage();
    await other.goto(page.url());

    await runAction(other, "Tender");
    await expect(cableHeader(other)).toContainText("Tendido");

    await page
      .getByRole("region", { name: "Acciones" })
      .getByRole("button", { name: "Tender", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Tender", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Otra persona ha registrado un movimiento en este cable mientras tanto.",
    );
  });

  test("tiende un cable a medias, conecta la punta que llegó y termina de tenderlo", async ({
    page,
  }) => {
    const { code } = CABLES.partial;
    await openCable(page, code);
    const badges = cableHeader(page);

    // La bandeja tiene que estar en el recorrido del cable.
    await page
      .getByRole("region", { name: "Acciones" })
      .getByRole("button", { name: "Tender a medias", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Bandeja donde espera la punta").fill("99UXB00L22001");
    await dialog.getByRole("button", { name: "Tender a medias", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "La bandeja 99UXB00L22001 no está en el recorrido del cable.",
    );
    await dialog.getByLabel("Bandeja donde espera la punta").fill("99uxa00l22051");
    await dialog.getByRole("button", { name: "Tender a medias", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(badges).toContainText("Tendido parcial");

    // Solo se puede conectar la punta que llegó: el diálogo la propone.
    await runAction(page, "Conectar", (dialog) =>
      expect(dialog.getByLabel("Extremo de origen")).toBeChecked(),
    );
    await expect(badges).toContainText("Solo origen");

    await runAction(page, "Tender");
    await expect(badges).toContainText("Tendido");
    await expect(badges).toContainText("Solo origen");

    const mine = page.getByRole("listitem").filter({ hasText: USERS.technician.name });
    await expect(mine.nth(0)).toContainText("terminó de tender el cable");
    await expect(mine.nth(2)).toContainText(
      "tendió el cable a medias: la punta de destino espera en la bandeja 99UXA00L22051",
    );
  });

  test("un técnico no puede retirar ni corregir", async ({ page }) => {
    await openCable(page, CABLES.search.code);
    const actions = page.getByRole("region", { name: "Acciones" });

    await expect(actions.getByRole("button", { name: "Desconectar" })).toBeEnabled();
    await expect(actions.getByRole("button", { name: "Retirar" })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Corregir" })).toHaveCount(0);
  });
});

test.describe("supervisor", () => {
  test.use({ storageState: storageStatePath("supervisor") });

  test("retira un cable y corrige la retirada", async ({ page }) => {
    const { code } = CABLES.supervisor;
    await openCable(page, code);
    const badges = cableHeader(page);

    await runAction(page, "Retirar", (dialog) =>
      dialog.getByLabel("Motivo").fill("Se daña al abrir la zanja"),
    );
    await expect(badges).toContainText("Retirado");

    await runAction(page, "Corregir", async (dialog) => {
      const event = dialog.getByLabel("Movimiento que corriges");
      const retired = event.locator("option", { hasText: /^Retirado · / });
      await event.selectOption((await retired.getAttribute("value"))!);
      await dialog.getByLabel("Estado de instalación correcto").selectOption({ label: "Tendido" });
      await dialog.getByLabel("Estado de conexión correcto").selectOption({ label: "Conectado" });
      await dialog.getByLabel("Motivo").fill("Se retiró el cable equivocado");
    });
    await expect(badges).toContainText("Tendido");
    await expect(badges).toContainText("Conectado");

    const mine = page.getByRole("listitem").filter({ hasText: USERS.supervisor.name });
    await expect(mine).toHaveCount(2);
    await expect(mine.first()).toContainText("Corrección");
    await expect(mine.first()).toContainText("“Se retiró el cable equivocado”");

    await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Actividad", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Actividad reciente" })).toBeVisible();
    const entries = page.getByRole("listitem").filter({ hasText: USERS.supervisor.name });
    await expect(entries.filter({ hasText: code })).toHaveCount(2);
  });
});
