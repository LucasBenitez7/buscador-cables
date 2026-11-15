# Arquitectura

## Stack

| Capa               | Tecnología                                      | Motivo                                              |
| ------------------ | ----------------------------------------------- | --------------------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo                     | Paquetes compartidos, builds cacheados              |
| Frontend + Backend | Next.js (App Router) + TypeScript estricto      | Un solo despliegue; Server Actions / Route Handlers |
| UI                 | Tailwind CSS + shadcn/ui                        | Rápido, accesible y consistente                     |
| Base de datos      | PostgreSQL 16 (+ extensión `pg_trgm`)           | Robusta; búsqueda tolerante a errores               |
| ORM                | Prisma                                          | Migraciones y tipado                                |
| Validación         | Zod (compartido cliente/servidor)               | Una sola fuente de verdad                           |
| Autenticación      | Better Auth (email + contraseña)                | Sesiones, reset y verificación integrados           |
| Email              | Mailpit (local) / Resend (producción)           |                                                     |
| Tests              | Vitest + Testing Library + Playwright           | Unitarios, integración y E2E                        |
| Offline (fase 9)   | Serwist (service worker) + Dexie (IndexedDB)    | Mejora futura, fuera de la v1.0.0                   |
| Planos (fase 7.5)  | pdf.js + @napi-rs/canvas + sharp, OpenSeadragon | Teselas Deep Zoom servidas solo con sesión          |
| CI                 | GitHub Actions + CodeQL + Dependabot            | Gratis en repo público; activo desde la fase 4.5    |
| Despliegue         | Vercel + Railway + Cloudflare R2 + Resend       | Docker solo en local; ver `docs/DESPLIEGUE.md`      |

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
│       │   │       └── actions.ts    # Server Actions (capa fina); las consultas van en server/
│       │   ├── server/           # Lógica de negocio pura (services), permisos
│       │   └── lib/              # auth, env, utilidades
│       └── e2e/                  # Tests Playwright
├── packages/
│   ├── db/                       # Prisma: schema, migraciones, seed, cliente
│   ├── shared/                   # Esquemas Zod, tipos, constantes, normalizadores
│   ├── data/                     # Extracción (y carga) de los datos reales desde los PDFs
│   └── config/                   # eslint, tsconfig, prettier compartidos
├── docs/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

Regla de dependencias: `app` → `features` → `server` → `packages/db` y `packages/shared`.
`packages/data` usa `packages/shared` (y `packages/db` para la carga); la app no lo importa.
Nunca al revés. Los componentes cliente no acceden a la base de datos.

## Interfaz: tema oscuro

Decisión del 2026-11-11 (se aplica en la fase 4.5). La app tiene **un único tema, oscuro**:
nada de fondos blancos, sin modo claro ni selector de tema.

- Fondo: gris casi negro con un ligero tono azul, más agradable que el negro puro.
- Texto: gris muy claro, no blanco puro (cansa menos la vista).
- Acento: **azul** para botones, enlaces y foco.
- El **verde esmeralda queda reservado** para "conectado / correcto", el ámbar para estados
  intermedios y el rojo para errores y retirados. Por eso el acento no es verde: en la fase 5
  los estados se distinguen de los botones a simple vista.

Los tokens se definen en `apps/web/src/app/globals.css` (formato `oklch`, compatible con
shadcn/ui). Los valores hex son aproximados, solo de referencia.

| Token                  | Uso                               | `oklch`           | ≈ Hex     |
| ---------------------- | --------------------------------- | ----------------- | --------- |
| `--background`         | Fondo de la página                | `0.19 0.012 255`  | `#101419` |
| `--card`, `--popover`  | Tarjetas, diálogos, menús         | `0.225 0.014 255` | `#171c22` |
| `--muted`, `--accent`  | Filas alternas, hover, secundario | `0.27 0.016 255`  | `#21272e` |
| `--border`, `--input`  | Bordes y campos                   | `0.34 0.018 255`  | `#323941` |
| `--foreground`         | Texto principal                   | `0.93 0.008 255`  | `#e4e8ed` |
| `--muted-foreground`   | Texto secundario                  | `0.72 0.015 255`  | `#9ea5ae` |
| `--primary`, `--ring`  | Botones, enlaces, foco (azul)     | `0.70 0.14 245`   | `#46a6ef` |
| `--primary-foreground` | Texto sobre el azul               | `0.17 0.02 255`   | `#091018` |
| `--success` (nuevo)    | Conectado, activo, correcto       | `0.74 0.15 162`   | `#30c78d` |
| `--warning` (nuevo)    | Estados intermedios               | `0.80 0.14 80`    | `#edb345` |
| `--destructive`        | Errores, bajas, retirados         | `0.68 0.19 25`    | `#f75d59` |

Contraste calculado (WCAG): texto principal sobre el fondo 15:1; texto secundario 7,4:1;
azul sobre el fondo 7:1; texto sobre el botón azul 7,2:1; verde 8,5:1; ámbar 9,7:1; rojo
5,9:1. Todo supera el mínimo AA (4,5:1). Los valores finales se ajustan al aplicarlos si alguna
pantalla lo pide, sin bajar de AA.

Reglas:

- En los componentes, solo tokens (`bg-card`, `text-muted-foreground`, `text-success`…), nunca
  colores fijos de Tailwind (`bg-white`, `text-black`, `text-emerald-600`). Un test lo vigila.
- `color-scheme: dark` en `:root`, para que el navegador pinte oscuros los controles nativos
  (scroll, selectores de fecha, autocompletado).

## Modelo de datos

> La fuente de verdad es `packages/db/prisma/schema.prisma`; lo de abajo es el diseño
> original. Diferencias importantes: todas las referencias usan `ON DELETE RESTRICT`, la tabla
> `cable_event` rechaza `UPDATE` y `DELETE` mediante un trigger, y `cable.code` tiene un índice
> GIN trigram (`pg_trgm` lo crea la propia migración).

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
  CREATED UPDATED LAID COILED CONNECTED DISCONNECTED MOVED RETIRED CORRECTION DELETED
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

### Datos reales del proyecto (fase 7)

Añadido el 2026-11-13 para cargar los listados y planos del proyecto (estructura en
`docs/DATOS-PROYECTO.md`). Resumen; el detalle está en `schema.prisma`:

- `Cable` gana el **nivel** (`CableLevel`: `L1` instrumentación, `L2` BT, `L3` BT unipolar,
  `L4` MT), número alternativo, revisión, circuito, composición, esquema, longitud pendiente y
  el documento y la página de donde se cargó.
- **Extremos**: `originEquipment`, `originCubicle`, `originGland`, `originFunctionKks`,
  `originInstallationKks` y `originRoom` (y lo mismo con `destination…`). `originId` y
  `destinationId` siguen apuntando al árbol de ubicaciones (sala o edificio). Los equipos tienen
  índice trigram para buscarlos por subcadena.
- `Tray`: bandeja, tubo o canalización. Código único (`99UXA00L22036`), tipo (`TrayKind`),
  nivel de tensión y cota sacados del código, área, edificio y tamaño. `TrayDrawing` dice en qué
  hojas de plano aparece. El código se interpreta con `parseTrayCode` (`packages/shared`).
- `CableRouteStep`: recorrido **ordenado** de cada cable (`position` ≥ 1). Cada paso guarda el
  texto del listado y, si es una bandeja conocida, la bandeja; en instrumentación, además, el
  tramo (`FIELD` campo / `ROOM` sala).
- Estado `UNVERIFIED` (sin revisar): el estado con que entran los cables de los listados, que
  nadie ha comprobado en campo. Sin ubicación física; no se mueve ni se conecta hasta que alguien
  registra cómo está (tendido, tendido a medias, enrollado o retirado).
- Si un cable de los listados no tiene sala, el equipo de cada extremo cuenta como extremo
  conocido para poder tenderlo (`originId ?? originEquipment` al construir el estado).
- Estado `PARTIALLY_LAID` (tendido parcial) y acción del mismo nombre. `Cable.looseEnd`
  (`ORIGIN`/`DESTINATION`) y `Cable.looseEndTrayId` dicen qué punta quedó suelta y en qué
  bandeja espera; la restricción `cable_loose_end_check` exige que solo un cable tendido a
  medias los tenga. El historial guarda el código de la bandeja, no su id.
- `CableType.code`: código del tipo en el listado eléctrico (`C0802`). Los nombres de los tres
  catálogos son únicos sin distinguir mayúsculas (índice único sobre `lower(name)`).
- `CableEvent.source` (`APP` / `PROJECT_LOAD`): quién escribió el evento, una persona en la
  app o la carga de los listados. La carga lo usa para no pisar lo que alguien corrigió a mano.
- Los límites de longitud de los textos de un cable (`CABLE_TEXT_LIMITS` en `packages/shared`)
  son los mismos en el formulario y en la carga.

### Planos y timbrado (fase 7.5)

- `DrawingSheet`: hoja de los planos de recorrido (plano, hoja, título, página, tamaño en
  puntos, `imageKey` de sus teselas y `fingerprint`). `TrayDrawing.marks` (JSON validado con
  `drawingMarkSchema` de `packages/shared`) dice dónde está la bandeja en la hoja, y
  `TrayDrawing.sheetId` la enlaza con su `DrawingSheet`.
- Las teselas viven fuera de git (`DRAWINGS_DIR`, por defecto `private-data/drawings`).
  `apps/web/src/server/drawings/store.ts` es la única pieza que sabe dónde están: en local,
  esa carpeta; en producción (`DRAWINGS_S3_*`), un bucket privado de Cloudflare R2 que llena
  `pnpm data:upload` y que la app lee con peticiones firmadas (`aws4fetch`). Qué hojas hay lo
  dice el manifiesto del bucket, que cada instancia relee una vez por minuto. La ruta
  `GET /api/drawings/<clave>.dzi` y `…/<clave>_files/<nivel>/<x>_<y>.webp` solo acepta esas
  dos formas de ruta. El descriptor (`.dzi`) siempre comprueba la sesión y deja una cookie
  firmada de 10 minutos (`drawing_access`, `HttpOnly`, solo para `/api/drawings`, se borra al
  cerrar sesión); las teselas solo comprueban esa firma, sin consultar la base cada una
  (`server/drawings/access.ts`). Todo va con `Cache-Control: private, no-cache` y `ETag`: el
  navegador las guarda pero pregunta siempre, y el 304 llega después de comprobar el acceso.
  Si hay hojas cargadas sin imagen, el inicio del administrador lo avisa.
- El visor es OpenSeadragon (BSD), cargado solo en el navegador: zoom con rueda, dos dedos o
  teclado (flechas, + y −, 0; sin girar ni voltear), pantalla completa y marcas superpuestas
  en HTML. Es `role="application"`, con la ayuda de las teclas para los lectores de pantalla. Cada marca es un marco en coordenadas del
  plano (ajustado al texto que marca, con `w`/`h` guardados en la extracción); la flecha y el
  número van a tamaño fijo en pantalla.
- Enlaces: `apps/web/src/lib/links.ts` dice a dónde lleva cada cosa (ubicación → su página,
  equipo o nivel → el buscador filtrado, bandeja → su ficha), para que todas las páginas
  enlacen igual.
- `Cable.testStatus` (`NOT_TESTED`, `TESTED_OK`, `TESTED_FAILED`) y la acción `TESTED`
  ("Timbrar", permiso `cable:test` para técnico, supervisor y administrador). Es
  independiente del tendido y la conexión: tender, enrollar o mover no lo cambian; solo otro
  timbrado o una corrección. Un fallo exige una nota.
- Una punta suelta en una bandeja que no está en el recorrido previsto se acepta si quien la
  registra lo confirma (`confirmOffRoute`); las correcciones del supervisor no lo piden.

## Marca, cargas y avisos

- **Logo** (una lupa cuyo mango es un cable con su conector): `apps/web/public/brand/logo.svg`
  y, igual en código, `components/brand-logo.tsx` (con los tokens del tema). De él salen el
  favicon (`app/favicon.ico`, `app/icon.svg`), el icono de iPhone (`app/apple-icon.png`), los
  del manifiesto (`public/brand/logo-192.png`, `logo-512.png`), el de los correos
  (`public/brand/logo-email.png`) y la imagen al compartir el enlace
  (`app/opengraph-image.png` y `twitter-image.png`, 1200 × 630). Si cambia el logo, se
  regeneran las PNG desde el SVG con `sharp`. Todo esto es público: lo piden el navegador,
  los clientes de correo y WhatsApp o X sin sesión (`PUBLIC_PATHS`).
- **Cargas:** cada sección tiene su `loading.tsx` con el logo y un anillo que gira
  (`BrandLoader`, sin girar si se prefiere menos movimiento) y cajas translúcidas con la
  forma de la página (`Skeleton`, en `components/loading.tsx`).
- **Contraseñas:** todos los campos usan `PasswordInput`, con un ojo para ver lo escrito.
- **Lo pendiente, a la vista:** quien gestiona usuarios ve en el menú, junto a «Usuarios»,
  cuántas cuentas esperan aprobación, y un punto en el botón del menú del móvil. Además, el
  aviso del inicio y el de la página de Usuarios.

### Correos y avisos

Todos con el mismo aspecto (`lib/email-templates.ts`): logo y nombre arriba, tarjeta clara,
los datos importantes en una tabla, un botón y versión en texto. Quién recibe qué lo decide
`server/account-notifications.ts`:

| Qué pasa                                        | A quién                           | Qué lleva                                                |
| ----------------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| Alguien pide una cuenta                         | La persona                        | Enlace para confirmar el correo (24 h)                   |
| Confirma el correo y queda pendiente            | Los administradores activos       | Nombre, correo, cuándo la pidió, cuántas esperan, enlace |
| Intenta registrarse con un correo que ya existe | El dueño de ese correo            | Enlace para restablecer la contraseña                    |
| Un administrador aprueba la cuenta              | La persona                        | Bienvenida, su rol y qué puede hacer, enlace para entrar |
| Un administrador da de alta a alguien           | La persona                        | Bienvenida, rol, cómo cambiar la contraseña temporal     |
| Cambia el rol                                   | La persona                        | Rol de antes y de ahora y qué puede hacer                |
| Alguien pasa a ser administrador                | Los demás administradores activos | Quién, quién lo hizo, enlace a la auditoría              |
| Se desactiva o se reactiva una cuenta           | La persona                        | Qué significa y qué hacer                                |
| Pide restablecer la contraseña                  | La persona                        | Enlace (1 h, un solo uso)                                |
| La contraseña cambia                            | La persona                        | Aviso de seguridad: si no fue ella, qué hacer            |

**Sin correo, a propósito:** el trabajo de campo con los cables (tender, conectar, timbrar…)
está en la actividad y el historial: un correo por movimiento sería ruido. Tampoco los
inicios de sesión ni la limpieza diaria. Un administrador desactivado nunca recibe avisos.
Si un envío falla, el cambio se hace igual y el fallo queda en el log (`scope: "email"`).

## Seguridad

- Contraseñas con hash (gestionado por Better Auth, scrypt/argon2).
- Tokens de recuperación de un solo uso, con caducidad y almacenados con hash.
- La respuesta de "olvidé mi contraseña" es siempre la misma, exista o no el email (no revela usuarios).
- Cualquiera puede **pedir** una cuenta, con verificación de email obligatoria, pero no entra
  hasta que un administrador la **aprueba** en `/admin/users` (decisión del 2026-11-13: la app
  guarda los datos reales del cliente). La cuenta nueva es `VIEWER` e inactiva (lo fuerza un
  hook en el servidor, el cliente no puede elegir rol ni estado); `User.approvedAt` distingue
  "pendiente de aprobación" de "desactivada". Al confirmar el correo se avisa a los
  administradores, y al aprobarla, al usuario. El administrador elige el rol al aprobarla
  (nunca uno superior al suyo), con la guía de roles (`ROLE_DESCRIPTIONS`) a la vista.
  Registrarse con un correo que ya existe da la misma respuesta y solo avisa por correo al
  dueño real.
- Auditoría de cuentas: cada alta, aprobación, cambio de rol, desactivación o reactivación
  queda en `UserEvent` (quién, a quién, roles), en la misma transacción que el cambio. Un
  trigger rechaza `UPDATE` y `DELETE`, como en `cable_event`.
- Las cuentas pendientes o desactivadas no pueden abrir sesión (hook `session.create.before`).
- Nadie cambia su propio nombre, correo o imagen: el historial enseña el nombre actual de
  quien hizo cada cosa, así que `POST /api/auth/update-user` se rechaza (hook
  `user.update.before`). Los nombres los fija el registro o un administrador.
- Toda Server Action / Route Handler valida la sesión, el rol y la entrada (Zod) en el servidor.
  Los cargadores que comparten `generateMetadata` y la página pasan por `whenSignedIn`: el
  proxy solo comprueba que exista la cookie.
- Límite de intentos en los endpoints de autenticación, con contadores en base de datos (tabla
  `rateLimit`), en dos niveles:
  - **por IP**: 30 inicios de sesión por minuto (toda la planta comparte IP), 3 registros y 3
    peticiones de recuperación;
  - **por cuenta**: 10 contraseñas incorrectas seguidas bloquean ese correo 15 minutos, venga
    de la IP que venga, exista o no la cuenta (`server/login-throttle.ts`).

  La IP sale solo de las cabeceras de `AUTH_IP_HEADERS`, las que pone el proxy de delante
  sustituyendo lo que mande el cliente (en Vercel, `x-real-ip`). Cada día, Vercel Cron llama a
  `/api/cron/cleanup` (con `CRON_SECRET`), que borra tokens de verificación y sesiones
  caducados y contadores de más de un día.

- La redirección tras el login solo acepta rutas internas, resueltas como las resuelve el
  navegador (`safeNextPath`).
- Cabeceras en todas las rutas: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy` y `X-Robots-Tag: noindex, nofollow` (más `robots.txt`: herramienta
  interna).
- CSP completa en las páginas (`lib/csp.ts`, la pone el proxy): scripts solo de la propia app
  y con el nonce de cada petición (`strict-dynamic`), nada de otros sitios, `frame-ancestors
'none'`, `object-src 'none'`. Por eso todas las páginas se generan en cada petición (el
  layout raíz llama a `connection()`): una página estática no llevaría el nonce.
- Logs del servidor en JSON, una línea por evento (`server/log.ts`); los errores no
  controlados llegan por `onRequestError` (`instrumentation.ts`), con la ruta sin la query.
- La app usa en producción un usuario de la base sin propiedad de las tablas ni `TRUNCATE`
  (no puede saltarse los triggers); las migraciones van con otro (`DATABASE_URL_MIGRATE`).
- Ningún secreto en el repositorio; solo `.env.example`. El seed se niega a crear en
  producción el administrador con el correo o la contraseña de ejemplo.
