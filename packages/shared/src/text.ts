/**
 * Checks for the free text that people type and others see later (names, notes, reasons).
 *
 * React escapes markup, so the risk is not HTML but characters nobody sees: line breaks and
 * other control characters in a one-line name, zero-width spaces that make two names look the
 * same, and the direction marks that show text backwards (a name or a note that reads
 * differently from what it stores).
 */

/** Control (Cc) and format (Cf) characters: invisible, never part of a one-line name. */
const HIDDEN_IN_LINE = /[\p{Cc}\p{Cf}]/u;

/**
 * In text with several lines: control characters other than tab and line breaks, and the
 * marks that change the direction of the text. Other format characters stay, because the
 * emoji people paste are joined with them.
 */
const HIDDEN_IN_TEXT = /\p{Bidi_Control}|(?![\t\n\r])\p{Cc}/u;

export const HIDDEN_CHARACTERS_MESSAGE = "El texto tiene caracteres no permitidos";

/** True when a one-line value (a name, a reason) has no invisible characters. */
export function isCleanLine(value: string): boolean {
  return !HIDDEN_IN_LINE.test(value);
}

/** True when a text of several lines (a note) has no control or direction characters. */
export function isCleanText(value: string): boolean {
  return !HIDDEN_IN_TEXT.test(value);
}
