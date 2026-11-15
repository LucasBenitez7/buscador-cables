import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

/**
 * Connections each instance of the app may open (revisión F7.5, M3). Deployed without a
 * server there are many instances at once and a small managed database has a few dozen
 * connections: each one gets few, and the database goes through its pooler (see
 * `.env.example`). Locally the default is enough.
 */
export const DEFAULT_POOL_MAX = 5;

export function poolMax(raw: string | undefined = process.env.DATABASE_POOL_MAX): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_POOL_MAX;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("DATABASE_POOL_MAX debe ser un número entero entre 1 y 100.");
  }
  return value;
}

export function createPrismaClient(connectionString: string, max = poolMax()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

// Reuse a single client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
  }
  return url;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient(getDatabaseUrl());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
