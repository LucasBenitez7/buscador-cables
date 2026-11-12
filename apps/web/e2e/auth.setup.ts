import { test as setup } from "@playwright/test";
import { USERS, storageStatePath, type UserKey } from "./support/data";
import { signIn } from "./support/auth";

// Una sesión por rol, guardada para que cada test empiece ya dentro.
for (const key of Object.keys(USERS) as UserKey[]) {
  setup(`inicia sesión como ${USERS[key].role}`, async ({ page }) => {
    await signIn(page, USERS[key].email);
    await page.context().storageState({ path: storageStatePath(key) });
  });
}
