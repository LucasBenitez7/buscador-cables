import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/client";

const PASSWORD_MIN_LENGTH = 10;

/**
 * Crea el administrador inicial si no existe. Las credenciales vienen de
 * SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD y SEED_ADMIN_NAME (ver .env.example).
 *
 * Los datos de ejemplo (ubicaciones y ~5.000 cables) se añaden en la fase 2.
 */
async function main() {
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
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

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
