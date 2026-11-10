# Arquitectura

## Stack

| Capa               | Tecnología                                   | Motivo                                              |
| ------------------ | -------------------------------------------- | --------------------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo                  | Paquetes compartidos, builds cacheados              |
| Frontend + Backend | Next.js (App Router) + TypeScript estricto   | Un solo despliegue; Server Actions / Route Handlers |
| UI                 | Tailwind CSS + shadcn/ui                     | Rápido, accesible y consistente                     |
| Base de datos      | PostgreSQL 16 (+ extensión `pg_trgm`)        | Robusta; búsqueda tolerante a errores               |
| ORM                | Prisma                                       | Migraciones y tipado                                |
| Validación         | Zod (compartido cliente/servidor)            | Una sola fuente de verdad                           |
| Autenticación      | Better Auth (email + contraseña)             | Sesiones, reset y verificación integrados           |
| Email              | Mailpit (local) / Resend (producción)        |                                                     |
| Tests              | Vitest + Testing Library + Playwright        | Unitarios, integración y E2E                        |
| Offline (fase 7)   | Serwist (service worker) + Dexie (IndexedDB) |                                                     |
| CI                 | GitHub Actions                               |                                                     |
| Despliegue         | Vercel + Railway                             | Docker solo en local (y opcional en producción)     |

### ¿Por qué Next.js "puro" y no una API separada?

Con ~5.000 cables y un único cliente web, una API separada añade complejidad sin beneficio.
La lógica de negocio se aísla en `apps/web/src/server/` y en `packages/*`, sin depender de Next,
así que si en el futuro hace falta una API independiente (app móvil nativa, integraciones),
se crea `apps/api` reutilizando los mismos paquetes.

## Estructura del monorepo

```
buscador-cables/
├── apps/
│   └── web/                      # Next.js
│       ├── src/
│       │   ├── app/              # Rutas (App Router)
│       │   │   ├── (auth)/       # login, forgot-password, reset-password
│       │   │   ├── (app)/        # rutas protegidas: cables, locations, admin
│       │   │   └── api/          # Route Handlers (auth, import/export)
│       │   ├── components/       # UI reutilizable
│       │   ├── features/         # Módulos por dominio (cables, locations, users)
│       │   │   └── cables/
│       │   │       ├── components/
│       │   │       ├── actions.ts    # Server Actions (capa fina)
│       │   │       └── queries.ts
│       │   ├── server/           # Lógica de negocio pura (services), permisos
│       │   └── lib/              # auth, env, utilidades
│       └── e2e/                  # Tests Playwright
├── packages/
│   ├── db/                       # Prisma: schema, migraciones, seed, cliente
│   ├── shared/                   # Esquemas Zod, tipos, constantes, normalizadores
│   └── config/                   # eslint, tsconfig, prettier compartidos
├── docs/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

Regla de dependencias: `app` → `features` → `server` → `packages/db` y `packages/shared`.
Nunca al revés. Los componentes cliente no acceden a la base de datos.

## Modelo de datos (borrador)

```prisma
enum Role { ADMIN SUPERVISOR TECHNICIAN VIEWER }

enum InstallationStatus { IN_STOCK COILED LAID RETIRED }        // almacén, enrollado, tendido, retirado
enum ConnectionStatus  { DISCONNECTED ORIGIN_ONLY DESTINATION_ONLY CONNECTED }
enum LocationType      { PLANT AREA UNIT SITE }                // central, área, reactor/unidad, sitio

model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  role      Role     @default(VIEWER)
  active    Boolean  @default(true)
  // + tablas de sesión/cuenta/verificación que genera Better Auth
  events    CableEvent[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Location {
  id       String       @id @default(cuid())
  name     String                       // "Reactor X", "Sitio XZ"
  code     String       @unique         // "R-X", "S-XZ"
  type     LocationType
  parentId String?
  parent   Location?    @relation("LocationTree", fields: [parentId], references: [id])
  children Location[]   @relation("LocationTree")
  path     String                       // materializado: "/PLANTA/AREA-1/R-X" para filtrar subárbol
  cablesFrom Cable[]    @relation("CableOrigin")
  cablesTo   Cable[]    @relation("CableDestination")
  cablesAt   Cable[]    @relation("CableCurrent")
}

model CableType    { id String @id @default(cuid()) name String @unique  cables Cable[] }   // "Potencia", "Control", "Instrumentación"...
model Color        { id String @id @default(cuid()) name String @unique  hex String?  cables Cable[] }
model Manufacturer { id String @id @default(cuid()) name String @unique  cables Cable[] }

model Cable {
  id                 String   @id @default(cuid())
  code               String   @unique            // normalizado: "SH-50"
  description        String?
  typeId             String?
  colorId            String?
  manufacturerId     String?
  conductors         Int?                         // nº de conductores
  crossSectionMm2    Decimal? @db.Decimal(8, 2)  // sección
  outerDiameterMm    Decimal? @db.Decimal(8, 2)  // grosor
  lengthM            Decimal? @db.Decimal(10, 2) // longitud
  voltageRating      String?                      // "0,6/1 kV"
  originId           String?                      // de dónde sale
  destinationId      String?                      // a dónde llega
  currentLocationId  String?                      // dónde está físicamente (si está enrollado/almacén)
  installationStatus InstallationStatus @default(IN_STOCK)
  connectionStatus   ConnectionStatus   @default(DISCONNECTED)
  // Columnas resumen (desnormalizadas) para mostrar/filtrar en la tabla sin joins pesados.
  // Se actualizan en la misma transacción que crea el CableEvent.
  lastAction         CableAction?
  lastActionById     String?
  lastActionAt       DateTime?
  installedById      String?                      // quién lo tendió por última vez
  installedAt        DateTime?
  connectedById      String?                      // quién lo conectó por última vez
  connectedAt        DateTime?
  notes              String?
  version            Int      @default(1)         // control de concurrencia / sync offline
  deletedAt          DateTime?                    // baja lógica
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  events             CableEvent[]

  @@index([installationStatus, connectionStatus])
  @@index([originId]) @@index([destinationId]) @@index([currentLocationId])
  // + índice GIN trigram sobre code (migración SQL manual)
}

enum CableAction {
  CREATED UPDATED LAID COILED CONNECTED DISCONNECTED MOVED RETIRED CORRECTION
}

// Registro INMUTABLE de lo que hace cada usuario sobre un cable (nunca se edita ni se borra).
model CableEvent {
  id                String      @id @default(cuid())
  cableId           String
  userId            String                  // quién lo hizo
  action            CableAction
  fromLocationId    String?                 // para MOVED
  toLocationId      String?
  changes           Json                    // { campo: { from, to } }
  notes             String?
  correctsEventId   String?                 // para CORRECTION: evento que corrige
  clientCreatedAt   DateTime?               // hora real en campo (acciones hechas offline)
  createdAt         DateTime    @default(now())

  @@index([cableId, createdAt])
  @@index([userId, createdAt])
  @@index([action, createdAt])
}
```

## Seguridad

- Contraseñas con hash (gestionado por Better Auth, scrypt/argon2).
- Tokens de recuperación de un solo uso, con caducidad y almacenados con hash.
- La respuesta de "olvidé mi contraseña" es siempre la misma, exista o no el email (no revela usuarios).
- Toda Server Action / Route Handler valida la sesión, el rol y la entrada (Zod) en el servidor.
- Rate limiting en endpoints de autenticación.
- Ningún secreto en el repositorio; solo `.env.example`.
