/**
 * Escapes the wildcards of SQL `LIKE` ("%", "_") and its escape character, so text typed
 * by a user matches literally. Tray codes contain "_" as part of the code.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
