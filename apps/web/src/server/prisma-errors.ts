import "server-only";
import { Prisma } from "@cables/db";

/** True when Prisma failed with the given known error code ("P2002", "P2003", "P2025"…). */
export function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** A unique index rejected the write: somebody else took that code, name or email first. */
export const isUniqueViolation = (error: unknown) => isPrismaError(error, "P2002");

/** A foreign key rejected the write: the row is still referenced, or its target is gone. */
export const isForeignKeyViolation = (error: unknown) => isPrismaError(error, "P2003");
