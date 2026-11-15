// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const SESSION_COOKIE = "better-auth.session_token=abc.def";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("sends anonymous users to /login keeping the requested path", () => {
    const response = proxy(request("/admin/users?page=2"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin/users?page=2");
  });

  it("lets anonymous users reach public pages", () => {
    expect(proxy(request("/login")).headers.get("location")).toBeNull();
    expect(proxy(request("/api/auth/sign-in/email")).headers.get("location")).toBeNull();
  });

  it("lets requests with a session cookie through to protected pages", () => {
    expect(proxy(request("/admin/users", SESSION_COOKIE)).headers.get("location")).toBeNull();
  });

  // Regresión: con una cookie de una sesión revocada (cuenta desactivada,
  // contraseña restablecida en otro equipo…) el proxy mandaba /login → / y el
  // layout protegido devolvía / → /login, en un bucle infinito.
  it("does not redirect /login away when a (possibly stale) session cookie exists", () => {
    expect(proxy(request("/login", SESSION_COOKIE)).headers.get("location")).toBeNull();
  });

  // Fase 10: CSP completa con un nonce distinto en cada petición.
  it("sets a strict CSP with a fresh nonce, also on the request for Next.js", () => {
    const first = proxy(request("/login")).headers.get("Content-Security-Policy")!;
    const second = proxy(request("/login")).headers.get("Content-Security-Policy")!;
    const nonce = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];

    expect(first).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(first).toContain("frame-ancestors 'none'");
    expect(first).toContain("object-src 'none'");
    expect(first).not.toContain("unsafe-eval");
    expect(nonce(first)).not.toBe(nonce(second));
  });

  it("lets the daily cleanup and robots.txt through without a session", () => {
    expect(proxy(request("/api/cron/cleanup")).headers.get("location")).toBeNull();
    expect(proxy(request("/robots.txt")).headers.get("location")).toBeNull();
  });
});
