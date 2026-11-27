"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import {
  ExcelImportError,
  addExcelPreviewPart,
  addExcelReelPullsPart,
  applyExcelBatch,
  cancelExcelUpload,
  discardExcelPreview,
  finishExcelPreview,
  setExcelRowsSelected,
  startExcelPreview,
  type ExcelBatchResult,
} from "@/server/excel-import/service";
import {
  decideDiscrepancies,
  decideDiscrepancy,
  markDiscrepanciesSeen,
  type DecideManyResult,
} from "@/server/excel-import/discrepancies";
import { logError } from "@/server/log";
import { authorize } from "@/server/session";

const IMPORT_PATH = "/import";

type Failure = { ok: false; message: string };

function fail(error: unknown): Failure {
  if (error instanceof ExcelImportError) return { ok: false, message: error.message };
  logError("import", "Error con el Excel del día", error);
  return { ok: false, message: "No se pudo completar la operación. Inténtalo de nuevo." };
}

/**
 * Every step re-checks the session and the permission, and the service validates its input
 * with Zod: what the browser read from the file is never trusted.
 */
async function run<T extends object>(
  work: (actor: Awaited<ReturnType<typeof authorize>> & { ok: true }) => Promise<T>,
): Promise<({ ok: true } & T) | Failure> {
  const auth = await authorize("import:run");
  if (!auth.ok) return auth;
  try {
    return { ok: true, ...(await work(auth)) };
  } catch (error) {
    return fail(error);
  }
}

/** First step of an upload: what the file is and how many rows will arrive. */
export async function startExcelUploadAction(input: unknown) {
  return run(async ({ user }) => ({ importId: await startExcelPreview(user, input) }));
}

/** One part of the rows (see `EXCEL_UPLOAD_CHUNK`). */
export async function addExcelPartAction(input: unknown) {
  return run(async ({ user }) => {
    await addExcelPreviewPart(user, input);
    return {};
  });
}

/** One part of the pullings of the reels (fase 18). */
export async function addExcelReelPullsAction(input: unknown) {
  return run(async ({ user }) => {
    await addExcelReelPullsPart(user, input);
    return {};
  });
}

export async function finishExcelUploadAction(importId: unknown) {
  return run(async ({ user }) => {
    const summary = await finishExcelPreview(user, String(importId));
    revalidatePath(IMPORT_PATH);
    return summary;
  });
}

/** «Cancelar» while the preview is being prepared. */
export async function cancelExcelUploadAction(importId: unknown) {
  return run(async ({ user }) => {
    await cancelExcelUpload(user, String(importId));
    revalidatePath(IMPORT_PATH);
    return {};
  });
}

/** Marks or unmarks rows; without `rowIds`, all of them. */
export async function setExcelRowsAction(input: unknown) {
  return run(async ({ user }) => {
    const count = await setExcelRowsSelected(user, input);
    revalidatePath(IMPORT_PATH, "layout");
    return { count };
  });
}

export async function discardExcelAction(importId: unknown): Promise<ActionResult> {
  const result = await run(async ({ user }) => {
    await discardExcelPreview(user, String(importId));
    revalidatePath(IMPORT_PATH, "layout");
    return {};
  });
  return result.ok ? { ok: true, message: "Vista previa descartada." } : result;
}

/** One batch; the screen calls it again until `done`. */
export async function applyExcelBatchAction(importId: unknown) {
  return run<ExcelBatchResult>(async ({ user }) => {
    const result = await applyExcelBatch(user, String(importId));
    if (result.done) revalidatePath("/", "layout");
    return result;
  });
}

/** «Mantener lo de la web» o «Aceptar lo del Excel» in «Pendientes de revisar». */
export async function decideDiscrepancyAction(input: unknown): Promise<ActionResult> {
  const auth = await authorize("cable:correct");
  if (!auth.ok) return auth;
  try {
    const message = await decideDiscrepancy(auth.user, input);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    return fail(error);
  }
}

/** Several at once, or all the pending ones a batch at a time (the screen asks again). */
export async function decideDiscrepanciesAction(input: unknown) {
  const auth = await authorize("cable:correct");
  if (!auth.ok) return auth;
  try {
    const result: DecideManyResult = await decideDiscrepancies(auth.user, input);
    revalidatePath("/", "layout");
    return { ok: true as const, ...result };
  } catch (error) {
    return fail(error);
  }
}

/** The person has opened «Pendientes de revisar»: the menu and the home page stop warning. */
export async function markDiscrepanciesSeenAction(): Promise<void> {
  const auth = await authorize("cable:correct");
  if (!auth.ok) return;
  // Only when the warnings change: otherwise the page would be rendered twice on every visit.
  if (await markDiscrepanciesSeen(auth.user.id)) revalidatePath("/", "layout");
}
