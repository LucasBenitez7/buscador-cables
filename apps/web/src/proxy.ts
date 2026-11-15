import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/csp";
import { isPublicPath } from "@/lib/route-access";

/**
 * Comprobación optimista: solo mira si existe la cookie de sesión, sin consultar
 * la base de datos. La validación real se hace en cada página y acción del servidor
 * (ver `requireUser`, `requirePermission` y `authorize` en `server/session.ts`).
 *
 * No redirige `/login` → `/` cuando hay cookie: la cookie puede pertenecer a una
 * sesión revocada o a una cuenta desactivada, y entonces `/` devolvería a `/login`
 * en un bucle infinito. Es la propia página de login la que valida la sesión.
 *
 * También pone la CSP con un nonce nuevo en cada petición: Next.js lo lee de la cabecera
 * de la petición y lo añade a sus scripts (por eso todas las páginas son dinámicas).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const policy = contentSecurityPolicy(createNonce(), process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Excluye estáticos y assets de Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
