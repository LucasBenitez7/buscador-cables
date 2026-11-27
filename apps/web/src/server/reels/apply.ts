import "server-only";
import { Prisma } from "@cables/db";
import { excelReelsSchema, reelKey, type ExcelKind, type ExcelReel } from "@cables/shared";
import { logError } from "@/server/log";

type Db = Prisma.TransactionClient;

const decimal = (value: number | null) => (value === null ? null : new Prisma.Decimal(value));
const date = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00Z`));

function columns(reel: ExcelReel) {
  return {
    drum: reel.drum,
    tag: reel.tag,
    code: reel.code,
    request: reel.request,
    description: reel.description,
    voltage: reel.voltage,
    pickedUpOn: date(reel.pickedUpOn),
    receivedM: decimal(reel.receivedM),
    usedM: decimal(reel.usedM),
    remainingM: decimal(reel.remainingM),
    pulls: reel.pulls,
    pendingPulls: reel.pendingPulls,
    pendingM: decimal(reel.pendingM),
    otherM: decimal(reel.otherM),
    deliveredOn: date(reel.deliveredOn),
    deliveredM: decimal(reel.deliveredM),
    tracked: reel.tracked,
    pieces: reel.pieces,
  };
}

/**
 * The reels of an Excel once it is applied (fase 18): they replace the ones of its kind. A
 * reel keeps its id from one day to the next (its link does not change); one the Excel no
 * longer brings goes away. An Excel without the reel sheets (`reels` null) leaves them as they
 * were; the same with the pullings. Returns how many reels the kind has now, or null when
 * the reels did not change.
 */
export async function applyExcelReels(
  tx: Db,
  excel: {
    importId: string;
    kind: ExcelKind;
    excelDate: Date;
    reels: unknown;
    /** It brought its sheet of pullings: they replace the ones of the Excel before. */
    pullsRead: boolean;
  },
): Promise<number | null> {
  if (excel.pullsRead) {
    await tx.reelPull.deleteMany({
      where: { kind: excel.kind, importId: { not: excel.importId } },
    });
  }
  if (excel.reels === null || excel.reels === undefined) return null;
  // Validated when it arrived; checked again so that the database only ever gets a valid reel.
  // A preview saved before a change of the format does not stop the Excel: its reels stay.
  const parsed = excelReelsSchema.safeParse(excel.reels);
  if (!parsed.success) {
    logError("import", "Bobinas del Excel no válidas: se dejan las de antes", parsed.error);
    return null;
  }
  const reels = parsed.data;
  const byKey = new Map(reels.map((reel) => [reelKey(excel.kind, reel), reel]));
  const keys = [...byKey.keys()];

  await tx.reel.deleteMany({ where: { kind: excel.kind, key: { notIn: keys } } });
  const existing = new Set(
    (await tx.reel.findMany({ where: { kind: excel.kind }, select: { key: true } })).map(
      (reel) => reel.key,
    ),
  );
  const stamp = { importId: excel.importId, excelDate: excel.excelDate };
  await tx.reel.createMany({
    data: keys
      .filter((key) => !existing.has(key))
      .map((key) => ({ kind: excel.kind, key, ...stamp, ...columns(byKey.get(key)!) })),
  });
  for (const key of keys.filter((item) => existing.has(item))) {
    await tx.reel.update({
      where: { kind_key: { kind: excel.kind, key } },
      data: { ...stamp, ...columns(byKey.get(key)!) },
    });
  }
  return keys.length;
}
