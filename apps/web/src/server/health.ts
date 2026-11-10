import "server-only";
import { prisma } from "@cables/db";

export type HealthStatus = "ok" | "error";

export type HealthReport = {
  status: HealthStatus;
  database: HealthStatus;
  version: string;
  checkedAt: string;
  error?: string;
};

export async function getHealth(): Promise<HealthReport> {
  const base = {
    version: process.env.npm_package_version ?? "0.0.0",
    checkedAt: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ...base, status: "ok", database: "ok" };
  } catch (error) {
    return {
      ...base,
      status: "error",
      database: "error",
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
