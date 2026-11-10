import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
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
