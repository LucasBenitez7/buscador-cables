import { prisma } from "../src/client";

async function main() {
  // Los datos de ejemplo (ubicaciones y ~5.000 cables) se añaden en la fase 2.
  await prisma.$queryRaw`SELECT 1`;
  console.warn("Seed: nada que sembrar todavía (fase 0).");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
