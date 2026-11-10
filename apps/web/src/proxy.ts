import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/route-access";

/**
 * Comprobación optimista: solo mira si existe la cookie de sesión, sin consultar
 * la base de datos. La validación real se hace en cada página y acción del servidor
 * (ver `requireUser`, `requirePermission` y `authorize` en `server/session.ts`).
 *
 * No redirige `/login` → `/` cuando hay cookie: la cookie puede pertenecer a una
 * sesión revocada o a una cuenta desactivada, y entonces `/` devolvería a `/login`
 * en un bucle infinito. Es la propia página de login la que valida la sesión.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Excluye estáticos y assets de Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
