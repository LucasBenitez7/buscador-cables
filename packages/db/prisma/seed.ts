import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/client";
import { generateSeedData } from "./seed-data";

const PASSWORD_MIN_LENGTH = 10;
const CABLE_BATCH_SIZE = 1000;

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
 * Datos de ejemplo para desarrollo: dos plantas con su árbol de ubicaciones,
 * los catálogos y ~5.000 cables. Nunca en producción, y solo sobre una base sin
 * ubicaciones ni cables, para no mezclarlos con datos reales.
 */
async function seedSampleData() {
  if (process.env.NODE_ENV === "production") {
    console.warn("Seed: datos de ejemplo omitidos en producción.");
    return;
  }
  const [locations, cables] = await Promise.all([prisma.location.count(), prisma.cable.count()]);
  if (locations > 0 || cables > 0) {
    console.warn("Seed: ya hay ubicaciones o cables; no se cargan datos de ejemplo.");
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
      for (let index = 0; index < data.cables.length; index += CABLE_BATCH_SIZE) {
        await tx.cable.createMany({ data: data.cables.slice(index, index + CABLE_BATCH_SIZE) });
      }
    },
    { timeout: 120_000 },
  );

  console.warn(
    `Seed: ${data.locations.length} ubicaciones y ${data.cables.length} cables de ejemplo creados en ${Date.now() - started} ms.`,
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
