import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/client";
import { generateSeedData } from "./seed-data";

const PASSWORD_MIN_LENGTH = 10;
const BATCH_SIZE = 1000;

async function inBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await write(rows.slice(index, index + BATCH_SIZE));
  }
}

/**
 * Crea el administrador inicial si no existe. Las credenciales vienen de
 * SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD y SEED_ADMIN_NAME (ver .env.example).
 */
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) {
    console.warn(
      "Seed: define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env para crear el admin.",
    );
    return;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    console.warn(`Seed: el usuario ${email} ya existe; no se modifica.`);
    return;
  }

  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      name,
      email,
      role: "ADMIN",
      emailVerified: true,
      approvedAt: new Date(),
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  console.warn(`Seed: administrador ${email} creado.`);
}

/**
 * Datos de ejemplo para desarrollo, inventados pero con la forma de los datos reales del
 * proyecto: árbol de ubicaciones por KKS, tipos de cable, bandejas con sus planos, ~4.500
 * cables L1-L4 con extremos y recorrido, y estados de campo variados. Nunca en producción, y
 * solo sobre una base sin ubicaciones, bandejas ni cables, para no mezclarlos con los reales.
 */
async function seedSampleData() {
  if (process.env.NODE_ENV === "production") {
    console.warn("Seed: datos de ejemplo omitidos en producción.");
    return;
  }
  const counts = await Promise.all([
    prisma.location.count(),
    prisma.tray.count(),
    prisma.cable.count(),
  ]);
  if (counts.some((count) => count > 0)) {
    console.warn("Seed: ya hay ubicaciones, bandejas o cables; no se cargan datos de ejemplo.");
    return;
  }

  const data = generateSeedData();
  const started = Date.now();
  await prisma.$transaction(
    async (tx) => {
      // Los padres van antes que los hijos en la lista.
      await tx.location.createMany({ data: data.locations });
      await tx.cableType.createMany({ data: data.cableTypes });
      await tx.color.createMany({ data: data.colors });
      await tx.manufacturer.createMany({ data: data.manufacturers });
      await tx.tray.createMany({ data: data.trays });
      await tx.trayDrawing.createMany({ data: data.trayDrawings });
      // Las bandejas van antes que los cables (punta suelta) y los cables antes que su recorrido.
      await inBatches(data.cables, (batch) => tx.cable.createMany({ data: batch }));
      await inBatches(data.routeSteps, (batch) => tx.cableRouteStep.createMany({ data: batch }));
    },
    { timeout: 120_000 },
  );

  console.warn(
    `Seed: ${data.locations.length} ubicaciones, ${data.trays.length} bandejas y ${data.cables.length} cables de ejemplo (${data.routeSteps.length} tramos de recorrido) creados en ${Date.now() - started} ms.`,
  );
}

async function main() {
  await seedAdmin();
  await seedSampleData();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
