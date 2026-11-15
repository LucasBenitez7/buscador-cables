import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { createDrawingAccess } from "./access";

// El pase corto de las teselas (revisión F7.5, M2) no sobrevive a cerrar sesión.
describe("sign-out", () => {
  it("deletes the pass to the drawing tiles", async () => {
    const response = await auth.handler(
      new Request(new URL("/api/auth/sign-out", env.APP_URL), {
        method: "POST",
        headers: {
          Origin: env.APP_URL,
          Cookie: `drawing_access=${createDrawingAccess()}`,
        },
      }),
    );

    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/drawing_access=;[^\n]*Max-Age=0/i);
    expect(cookies).toMatch(/drawing_access=;[^\n]*Path=\/api\/drawings/i);
  });
});
