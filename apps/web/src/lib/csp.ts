/**
 * Content Security Policy of the pages (fase 10). Scripts only from the app itself and with the
 * nonce of each request (`strict-dynamic` lets them load the chunks they need); nothing from
 * other sites. Styles allow inline: React and the drawing viewer set `style` attributes, and
 * an injected style cannot run code. `'unsafe-eval'` only in development (React uses it for
 * its error overlays).
 */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** A fresh, unguessable nonce for each request. */
export const createNonce = (): string => btoa(crypto.randomUUID());
