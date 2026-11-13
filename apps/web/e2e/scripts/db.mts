/**
 * Base de datos de los E2E. Se ejecuta con `tsx` (módulo ES), porque Playwright transforma sus
 * archivos a CommonJS y el cliente generado de Prisma solo funciona como módulo ES.
 *
 *   tsx e2e/scripts/db.mts prepare            crea `cables_e2e`, migra y carga los datos
 *   tsx e2e/scripts/db.mts reset-rate-limits  vacía los contadores de intentos de login
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "@cables/db";
import { hashPassword } from "better-auth/crypto";
import { CABLES, LOCATIONS, PASSWORD, RECOVERY_USER, TRAYS, USERS } from "../support/data";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPackage = path.resolve(here, "../../../../packages/db");
const prismaCli = path.join(dbPackage, "node_modules", "prisma", "build", "index.js");

const TABLES = [
  "cable_event",
  "cable",
  "tray",
  "location",
  "cable_type",
  "color",
  "manufacturer",
  "session",
  "account",
  "verification",
  "rateLimit",
  "user",
];

function e2eUrl(): string {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_e2e")) {
    throw new Error(`Los E2E solo pueden usar una base que termine en "_e2e" (recibido: ${url}).`);
  }
  return url;
}

async function prepare() {
  const url = e2eUrl();
  const name = new URL(url).pathname.slice(1);

  // Para crear la base hace falta conectarse a otra que ya exista: la de desarrollo.
  const admin = createPrismaClient(process.env.DATABASE_URL!);
  const exists = await admin.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM pg_database WHERE datname = ${name}`;
  if (exists.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  }
  await admin.$disconnect();

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const db = createPrismaClient(url);
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`);

  const password = await hashPassword(PASSWORD);
  const userIds: Record<string, string> = {};
  for (const [key, user] of [...Object.entries(USERS), ["recovery", RECOVERY_USER] as const]) {
    const id = randomUUID();
    userIds[key] = id;
    await db.user.create({
      data: {
        id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: true,
        approvedAt: new Date(),
        accounts: {
          create: { id: randomUUID(), accountId: id, providerId: "credential", password },
        },
      },
    });
  }

  const { plant, area, origin, destination, store, yard } = LOCATIONS;
  await db.location.createMany({
    data: [
      { ...plant, type: "PLANT", path: `/${plant.code}` },
      { ...area, type: "AREA", parentId: plant.id, path: `/${plant.code}/${area.code}` },
      {
        ...origin,
        type: "UNIT",
        parentId: area.id,
        path: `/${plant.code}/${area.code}/${origin.code}`,
      },
      {
        ...destination,
        type: "UNIT",
        parentId: area.id,
        path: `/${plant.code}/${area.code}/${destination.code}`,
      },
      { ...store, type: "AREA", parentId: plant.id, path: `/${plant.code}/${store.code}` },
      { ...yard, type: "AREA", parentId: plant.id, path: `/${plant.code}/${yard.code}` },
    ],
  });
  const [type, color, manufacturer] = await Promise.all([
    db.cableType.create({ data: { name: "Control" } }),
    db.color.create({ data: { name: "Gris", hex: "#8E9196" } }),
    db.manufacturer.create({ data: { name: "Prysmian" } }),
  ]);

  const trayIds = new Map<string, string>();
  for (const code of TRAYS) {
    const tray = await db.tray.create({ data: { code, kind: "LADDER", voltageLevel: 2 } });
    trayIds.set(code, tray.id);
  }

  const now = new Date();
  for (const cable of Object.values(CABLES)) {
    const route: readonly string[] = "route" in cable ? cable.route : [];
    const loose =
      "looseTray" in cable
        ? { looseEnd: cable.looseEnd, looseEndTrayId: trayIds.get(cable.looseTray)! }
        : {};
    await db.cable.create({
      data: {
        code: cable.code,
        level: cable.level,
        originEquipment: cable.ends[0],
        destinationEquipment: cable.ends[1],
        ...loose,
        typeId: type.id,
        colorId: color.id,
        manufacturerId: manufacturer.id,
        crossSectionMm2: 2.5,
        conductors: 3,
        lengthM: 120,
        originId: origin.id,
        destinationId: destination.id,
        installationStatus: cable.status,
        connectionStatus: cable.connection,
        currentLocationId:
          cable.status === "IN_STOCK" ? store.id : cable.status === "COILED" ? yard.id : null,
        lastAction: "CREATED",
        lastActionById: userIds.admin!,
        lastActionAt: now,
        routeSteps: {
          create: route.map((code, index) => ({
            position: index + 1,
            label: code,
            trayId: trayIds.get(code)!,
          })),
        },
        events: {
          create: {
            userId: userIds.admin!,
            action: "CREATED",
            changes: { installationStatus: { from: null, to: cable.status } },
            createdAt: now,
          },
        },
      },
    });
  }
  await db.$disconnect();
}

async function resetRateLimits() {
  const db = createPrismaClient(e2eUrl());
  await db.rateLimit.deleteMany();
  await db.$disconnect();
}

const command = process.argv[2];
if (command === "prepare") {
  await prepare();
} else if (command === "reset-rate-limits") {
  await resetRateLimits();
} else {
  throw new Error(`Comando desconocido: ${command}`);
}
