/** Result returned by every Server Action to the client. */
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/** Reads a text field from a FormData, returning "" for missing or file values. */
export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** First validation message of a failed Zod parse, in Spanish. */
export function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Datos no válidos.";
}
