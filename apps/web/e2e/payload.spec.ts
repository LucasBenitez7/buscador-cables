import { expect, test } from "@playwright/test";
import { CABLES, LOCATIONS, storageStatePath } from "./support/data";

test.use({ storageState: storageStatePath("technician") });

// Revisión F0-F7 (C2): cada cable del buscador lleva dos diálogos de acciones (tarjeta y fila
// de la tabla) y todos reciben la lista de ubicaciones. Medido el 2026-11-13: React envía la
// lista una sola vez y los demás la referencian. Este test avisa si eso deja de ser así y la
// página empieza a crecer con cada cable.
test("la lista de ubicaciones viaja una vez, no una por cada cable del buscador", async ({
  page,
}) => {
  const response = await page.request.get("/cables");
  const html = await response.text();
  // La planta solo sale en las etiquetas de las ubicaciones ("Planta E2E › Calderas › …").
  const mentions = html.split(LOCATIONS.plant.name).length - 1;
  const dialogs = Object.keys(CABLES).length * 2;
  const labelsPerList = Object.keys(LOCATIONS).length - 1;

  expect(response.ok()).toBe(true);
  expect(mentions).toBeGreaterThan(0);
  // Una copia por diálogo serían `dialogs × labelsPerList` menciones (80 con estos datos).
  expect(mentions).toBeLessThan((dialogs * labelsPerList) / 2);
});
