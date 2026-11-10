import "server-only";
import { prisma } from "@cables/db";

export type HealthStatus = "ok" | "error";

export type HealthReport = {
  status: HealthStatus;
  database: HealthStatus;
  version: string;
  checkedAt: string;
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
    // `/api/health` es público: el detalle (host, usuario, motivo) solo va al log.
    console.error("Health check: la base de datos no responde", error);
    return { ...base, status: "error", database: "error" };
  }
}
