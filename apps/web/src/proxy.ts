import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/route-access";

/**
 * Comprobación optimista: solo mira si existe la cookie de sesión, sin consultar
 * la base de datos. La validación real se hace en cada página y acción del servidor
 * (ver `requireUser`, `requirePermission` y `authorize` en `server/session.ts`).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (!hasSession && !isPublicPath(pathname)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Excluye estáticos y assets de Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
