/**
 * An underlined text link ("He olvidado mi contraseña", "Ver ficha"): the same hover, focus
 * ring and offset everywhere. Use it as the `className` of a `<Link>`.
 */
export const TEXT_LINK =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3";

/** The same link on its own line, at the size of the secondary text. */
export const TEXT_LINK_SM = `${TEXT_LINK} text-sm`;
