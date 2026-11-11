# Plan del proyecto — Buscador de Cables

Aplicación web para localizar y gestionar los cables de una planta industrial
(p. ej. una refinería o una central eléctrica). Cada cable (ej. `SH-50`) tiene su ficha con
ubicación (origen/destino), medidas, longitud, sección, color, estado de
instalación (enrollado / tendido), estado de conexión y el historial de quién
hizo qué y cuándo.

- Volumen estimado: ~5.000 cables (Postgres va sobrado; diseñado para escalar a 100k+).
- Usuarios con email + contraseña, sesiones, roles y recuperación de contraseña.
- Más adelante: modo sin conexión (PWA).

---

## Resumen de fases

| Fase | Nombre                            | Versión | Resultado principal                                   |
| ---- | --------------------------------- | ------- | ----------------------------------------------------- |
| 0    | Fundamentos del repositorio       | v0.1.0  | Monorepo, Docker local, lint, tests, CI funcionando   |
| 1    | Autenticación y usuarios          | v0.2.0  | Login, sesiones, roles, recuperación de contraseña    |
| 2    | Modelo de datos y ubicaciones     | v0.3.0  | Esquema Prisma, árbol de ubicaciones, catálogos, seed |
| 3    | Carga y edición de cables         | v0.4.0  | Formularios de alta/edición con validación            |
| 4    | Buscador y ficha del cable        | v0.5.0  | Búsqueda tolerante + filtros + ficha completa         |
| 5    | Estados y trazabilidad            | v0.6.0  | Tendido/enrollado, conectado, historial por usuario   |
| 6    | Importación / exportación y panel | v0.7.0  | CSV/Excel masivo, dashboard de estadísticas           |
| 7    | Modo sin conexión (PWA)           | v0.8.0  | Consulta offline + cola de cambios sincronizable      |
| 8    | Producción y endurecimiento       | v1.0.0  | Despliegue Vercel + Railway, seguridad, backups, docs |

**Total: 9 fases (0 a 8).** Al terminar la fase 8 se publica la **v1.0.0**.

Cada fase termina con todos los tests en verde en `dev`. Las versiones de la tabla son
orientativas: `dev` → `main` (y sus tags) solo se hace al final del proyecto o cuando lo decida
el responsable.

---

## Fase 0 — Fundamentos del repositorio (v0.1.0)

Objetivo: que cualquiera pueda clonar, ejecutar `pnpm dev` y tener todo funcionando.

- [x] Inicializar Git con ramas `main` y `dev`.
- [x] Monorepo con **pnpm workspaces** + **Turborepo**:
  - `apps/web` → Next.js (App Router, TypeScript estricto).
  - `packages/db` → Prisma (esquema, cliente, migraciones, seed).
  - `packages/shared` → esquemas Zod, tipos y utilidades compartidas.
  - `packages/config` → configuración compartida de ESLint, TypeScript y Prettier.
- [x] `docker-compose.yml` local: PostgreSQL 16 + Mailpit (correo de pruebas).
- [x] Tailwind CSS + shadcn/ui.
- [x] ESLint + Prettier + `tsc --noEmit`.
- [x] Vitest (unitarios/integración) y Playwright (E2E) con tests de ejemplo.
- [x] Husky + lint-staged + commitlint (Conventional Commits).
- [x] GitHub Actions: format → lint → typecheck → test → build en cada push/PR; el job de E2E solo en `dev` y `main` (ver "Política de E2E" en `CONTRIBUTING.md`).
- [x] `.env.example` documentado y validación de variables de entorno con Zod.
- [x] Página de estado con verificación de conexión a la base de datos y endpoint `/api/health`.

**Criterio de aceptación:** `pnpm install && docker compose up -d && pnpm dev` levanta la app;
`pnpm check` (lint + typecheck + tests) pasa en local y en CI. _(El CI se activará más
adelante; de momento solo hay verificación local.)_

## Fase 1 — Autenticación y usuarios (v0.2.0)

- [x] **Better Auth** con email + contraseña (sin Google/Apple), adaptador Prisma.
- [x] Sesiones en base de datos (cookie httpOnly, segura, SameSite=Lax).
- [x] Páginas: login, logout, "olvidé mi contraseña", "restablecer contraseña".
- [x] Recuperación de contraseña por email con token de un solo uso y caducidad (1 h).
  - Local: Mailpit. Producción: Resend (u otro SMTP).
- [x] Verificación de email (obligatoria para entrar; enlace de 24 h, se reenvía al intentar entrar).
- [x] Roles: `ADMIN`, `SUPERVISOR`, `TECHNICIAN`, `VIEWER`.
- [x] Registro abierto: cada usuario crea su cuenta con **su propio correo y contraseña**.
      Entra como `VIEWER` (solo consulta) y un `ADMIN` le asigna el rol. El ADMIN también
      puede dar de alta usuarios desde el panel. _(Cambio de decisión del 2026-11-10: antes
      el plan decía "sin registro público".)_
- [x] Panel de administración de usuarios (crear, desactivar, cambiar rol).
- [x] Middleware de protección de rutas + comprobación de permisos en servidor.
- [x] Rate limiting en login y recuperación de contraseña.
- [x] Tests: unitarios de permisos y de integración del servicio de usuarios.
- [ ] Tests E2E de registro, login, logout y recuperación de contraseña (aplazados, ver `CONTRIBUTING.md`).

## Fase 2 — Modelo de datos y ubicaciones (v0.3.0)

- [x] Esquema Prisma completo (ver `docs/ARQUITECTURA.md`). Borrados con `RESTRICT`, historial
      inmutable con trigger e índice trigram sobre el código.
- [x] Ubicaciones jerárquicas: Planta → Área → Unidad (ej. "Reactor X") → Sitio (ej. "Sitio XZ").
- [x] CRUD de ubicaciones (árbol navegable en `/locations`): crear, renombrar (también el
      código), mover a otro padre del mismo nivel con todo su subárbol, y eliminar.
- [x] Catálogos administrables: tipos de cable, colores, fabricantes (`/catalogs`).
- [x] Seed con datos realistas (~5.000 cables de ejemplo) para desarrollo y rendimiento.
- [x] Tests de integración contra Postgres real (base de datos de test en Docker).

## Fase 3 — Carga y edición de cables (v0.4.0)

El "apartado donde cargar el cable".

- [x] Formulario de alta: código (único, ej. `SH-50`), tipo, color, sección (mm²),
      nº de conductores, diámetro exterior (mm), longitud (m), tensión nominal,
      fabricante, ubicación de origen y de destino, notas.
- [x] Normalización del código (`sh50`, `SH 50`, `sh-50` → `SH-50`).
- [x] Edición y baja lógica (soft delete, nunca se borra realmente). La baja la hace un
      `ADMIN` y exige motivo. Cada alta, edición y baja queda en el historial (`CableEvent`), y
      la edición usa `version` para avisar si otra persona guardó antes.
- [x] Validación compartida cliente/servidor con Zod.
- [x] Permisos: solo `TECHNICIAN`+ puede crear o editar.
- [x] Tests: validaciones, Server Actions, servicio contra Postgres y formulario.
- [ ] Tests E2E de alta/edición (aplazados, ver `CONTRIBUTING.md`).

## Fase 4 — Buscador y ficha del cable (v0.5.0)

- [x] Búsqueda por código tolerante a errores (`pg_trgm`): "sh50" encuentra "SH-50". Primero
      por subcadena (con y sin guiones); si no hay coincidencias, códigos parecidos ("shh50").
- [x] Filtros: ubicación (incluye sububicaciones), tipo, color, sección/grosor,
      rango de longitud, estado de instalación, estado de conexión, fabricante.
- [x] Filtros reflejados en la URL (compartibles, botón atrás funciona).
- [x] Paginación en servidor y ordenación (código en orden natural, longitud, sección, fecha).
- [x] Ficha del cable: todos los datos, ruta origen → destino, estado y último movimiento
      (más el historial legible).
- [x] Índices en base de datos; objetivo < 200 ms por búsqueda con 5.000+ cables (medido:
      3-25 ms en base de datos y 35-90 ms la página completa).
- [x] Diseño responsive (uso desde tablet/móvil en planta).
- [x] Tests: consultas de búsqueda, filtros, ficha y componentes.
- [ ] Tests E2E de búsqueda → ficha (aplazados, ver `CONTRIBUTING.md`).

## Fase 5 — Acciones de usuario y trazabilidad (v0.6.0)

**Objetivo principal del login:** que cada usuario registre lo que hace sobre un cable
(lo conectó, lo movió a otro sitio, lo tendió, lo retiró…) y que todos puedan ver quién
hizo cada cosa y cuándo.

### Cómo funciona

1. El usuario abre la ficha del cable (o lo selecciona en la tabla) y pulsa una **acción**.
2. Se abre un diálogo corto con los datos de esa acción (ej. "Mover": sitio destino) y una nota opcional.
3. El servidor, en **una sola transacción**:
   - valida sesión, rol y que la acción es válida para el estado actual;
   - actualiza el cable (estado, ubicación…);
   - crea un `CableEvent` **inmutable** con usuario, fecha/hora, acción, valores antes/después y nota;
   - actualiza las columnas resumen del cable (`lastAction`, `lastActionBy`, `lastActionAt`).
4. Los eventos **nunca se editan ni se borran**. Si alguien se equivoca, se registra una
   acción de **corrección** (`CORRECTION`) que deja constancia de ambos.

### Acciones disponibles

| Acción      | Efecto en el cable                                                    | Datos que pide         |
| ----------- | --------------------------------------------------------------------- | ---------------------- |
| Tender      | `installationStatus = LAID`                                           | nota                   |
| Enrollar    | `installationStatus = COILED`, `connectionStatus = DISCONNECTED`      | ubicación actual, nota |
| Conectar    | `connectionStatus` = `ORIGIN_ONLY` / `DESTINATION_ONLY` / `CONNECTED` | extremo(s), nota       |
| Desconectar | `connectionStatus` = `DISCONNECTED` (o un solo extremo)               | extremo(s), nota       |
| Mover       | cambia `currentLocation` (y/o origen/destino)                         | nuevo sitio, nota      |
| Retirar     | `installationStatus = RETIRED`, desconectado                          | motivo (obligatorio)   |
| Corrección  | revierte/ajusta un dato, referencia al evento corregido               | motivo (obligatorio)   |

Reglas de transición (ej.): no se puede conectar un cable en almacén ni retirado; para
retirar hay que desconectar antes (o la propia acción lo hace y lo registra).

### Visibilidad

- **Todos los usuarios autenticados ven todo**: cables, historial completo y quién hizo cada acción.
- Permisos para **ejecutar** acciones:
  - `VIEWER`: solo consulta.
  - `TECHNICIAN`: tender, enrollar, conectar, desconectar, mover.
  - `SUPERVISOR`: lo anterior + retirar + correcciones.
  - `ADMIN`: todo + gestión de usuarios y catálogos.

### En la tabla de cables (buscador)

- Columnas: **Último movimiento** (ej. "Conectado"), **Por** (ej. "Juan Pérez"), **Fecha**.
- Columnas opcionales: "Conectado por", "Tendido por", "Retirado por".
- Filtros: **por usuario** ("cables que conectó Juan"), **por acción**, **por rango de fechas**.

### En la ficha del cable

- Línea de tiempo del historial: "03/02/2026 10:42 — Juan Pérez movió el cable de _Sitio XZ_ a _Reactor X_. Nota: …".

### Tareas

- [ ] Estado de instalación: `IN_STOCK` (en almacén), `COILED` (enrollado), `LAID` (tendido), `RETIRED` (retirado).
- [ ] Estado de conexión: `DISCONNECTED`, `ORIGIN_ONLY`, `DESTINATION_ONLY`, `CONNECTED`.
- [ ] Servicio de acciones (`server/cable-actions`) con máquina de estados y transacción única.
- [ ] `CableEvent` inmutable con `fromLocation`/`toLocation`, `changes` (antes/después) y nota.
- [ ] Columnas resumen en `Cable` (`lastAction`, `lastActionById`, `lastActionAt`) para la tabla.
- [ ] Botones de acción en la ficha y en la tabla, con diálogos.
- [ ] Columnas y filtros de "quién/qué/cuándo" en el buscador.
- [ ] Línea de tiempo del historial en la ficha.
- [ ] Página "Mi actividad": acciones del usuario actual.
- [ ] Página "Actividad reciente" (todas las acciones, filtrable) para supervisores.
- [ ] Control de concurrencia con `version` (si dos personas actúan a la vez, la segunda recibe aviso).
- [ ] Tests: máquina de estados, permisos por rol, transacción (cable + evento) y E2E de cada acción.

## Fase 6 — Importación / exportación y panel (v0.7.0)

- [ ] Importación masiva desde CSV/Excel con previsualización y validación fila a fila.
- [ ] Informe de errores descargable.
- [ ] Exportación de los resultados de búsqueda a CSV/Excel.
- [ ] Dashboard: totales por estado, por ubicación, cables pendientes de conectar.
- [ ] Generación de código QR por cable (para etiquetas en campo) — opcional.
- [ ] Tests: parser de importación con ficheros de ejemplo.

## Fase 7 — Modo sin conexión (PWA) (v0.8.0)

- [ ] PWA instalable (Serwist / service worker).
- [ ] Cacheo de la app y copia local de cables y ubicaciones en IndexedDB (Dexie).
- [ ] Búsqueda offline sobre los datos locales.
- [ ] Cola de cambios offline (cambios de estado) que se sincroniza al recuperar la conexión.
- [ ] Resolución de conflictos (el servidor manda, con aviso al usuario) usando `version`/`updatedAt`.
- [ ] Indicador visual de online/offline y de cambios pendientes.
- [ ] Tests: E2E con red desactivada en Playwright.

## Fase 8 — Producción y endurecimiento (v1.0.0)

- [ ] Despliegue: **Vercel** (web) + **Railway** (PostgreSQL gestionado).
      Alternativa preparada: `Dockerfile` de producción por si se requiere servidor propio/intranet.
- [ ] Migraciones automáticas en el despliegue (`prisma migrate deploy`).
- [ ] Cabeceras de seguridad, CSP, revisión OWASP básica.
- [ ] Registro de auditoría de acciones de administración.
- [ ] Backups automáticos de la base de datos y procedimiento de restauración probado.
- [ ] Monitorización de errores (Sentry) y logs.
- [ ] Manual de usuario y manual de despliegue.

---

## Entornos

| Entorno    | Web            | Base de datos        | Email   | Rama     |
| ---------- | -------------- | -------------------- | ------- | -------- |
| Local      | `pnpm dev`     | Postgres en Docker   | Mailpit | `feat/*` |
| Staging    | Vercel Preview | Railway (staging)    | Resend  | `dev`    |
| Producción | Vercel         | Railway (producción) | Resend  | `main`   |

El entorno de staging se conecta en cuanto termine la fase 1, para probar en real desde el principio.
