/** Página a la que lleva el enlace del correo de confirmación. */
export const VERIFY_EMAIL_PATH = "/verify-email";

// Rutas accesibles sin sesión. Todo lo demás requiere sesión.
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  VERIFY_EMAIL_PATH,
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Origen ficticio para resolver rutas: si el resultado sale de él, no era una ruta interna. */
const INTERNAL_ORIGIN = "http://internal.invalid";

/** Caracteres de control (tabulador, saltos de línea…): los navegadores los quitan de las URL. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a same-origin path for the post-login redirect, or "/" when the value
 * is missing or could point to another site.
 *
 * The value is resolved like a browser would, instead of inspected as text: browsers drop
 * tabs and line breaks from URLs, so "/\t/evil.example" becomes "//evil.example" (another
 * site) although it starts with a single slash.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.includes("\\") || hasControlCharacter(value)) {
    return "/";
  }
  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== INTERNAL_ORIGIN) {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
