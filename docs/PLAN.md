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

Cada fase termina con: todos los tests en verde → merge `dev` → `main` → tag de versión.

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
`pnpm check` (lint + typecheck + tests) pasa en local y en CI.

## Fase 1 — Autenticación y usuarios (v0.2.0)

- [ ] **Better Auth** con email + contraseña (sin Google/Apple), adaptador Prisma.
- [ ] Sesiones en base de datos (cookie httpOnly, segura, SameSite=Lax).
- [ ] Páginas: login, logout, "olvidé mi contraseña", "restablecer contraseña".
- [ ] Recuperación de contraseña por email con token de un solo uso y caducidad (1 h).
  - Local: Mailpit. Producción: Resend (u otro SMTP).
- [ ] Verificación de email.
- [ ] Roles: `ADMIN`, `SUPERVISOR`, `TECHNICIAN`, `VIEWER`.
- [ ] Sin registro público: el **ADMIN crea/invita usuarios** (entorno industrial).
- [ ] Panel de administración de usuarios (crear, desactivar, cambiar rol).
- [ ] Middleware de protección de rutas + comprobación de permisos en servidor.
- [ ] Rate limiting en login y recuperación de contraseña.
- [ ] Tests: unitarios de permisos, E2E de login, logout y recuperación de contraseña.

## Fase 2 — Modelo de datos y ubicaciones (v0.3.0)

- [ ] Esquema Prisma completo (ver `docs/ARQUITECTURA.md`).
- [ ] Ubicaciones jerárquicas: Planta → Área → Unidad (ej. "Reactor X") → Sitio (ej. "Sitio XZ").
- [ ] CRUD de ubicaciones (árbol navegable).
- [ ] Catálogos administrables: tipos de cable, colores, fabricantes.
- [ ] Seed con datos realistas (~5.000 cables de ejemplo) para desarrollo y rendimiento.
- [ ] Tests de integración contra Postgres real (base de datos de test en Docker).

## Fase 3 — Carga y edición de cables (v0.4.0)

El "apartado donde cargar el cable".

- [ ] Formulario de alta: código (único, ej. `SH-50`), tipo, color, sección (mm²),
      nº de conductores, diámetro exterior (mm), longitud (m), tensión nominal,
      fabricante, ubicación de origen y de destino, notas.
- [ ] Normalización del código (`sh50`, `SH 50`, `sh-50` → `SH-50`).
- [ ] Edición y baja lógica (soft delete, nunca se borra realmente).
- [ ] Validación compartida cliente/servidor con Zod.
- [ ] Permisos: solo `TECHNICIAN`+ puede crear o editar.
- [ ] Tests: validaciones, Server Actions y E2E de alta/edición.

## Fase 4 — Buscador y ficha del cable (v0.5.0)

- [ ] Búsqueda por código tolerante a errores (`pg_trgm`): "sh50" encuentra "SH-50".
- [ ] Filtros: ubicación (incluye sububicaciones), tipo, color, sección/grosor,
      rango de longitud, estado de instalación, estado de conexión, fabricante.
- [ ] Filtros reflejados en la URL (compartibles, botón atrás funciona).
- [ ] Paginación en servidor y ordenación.
- [ ] Ficha del cable: todos los datos, ruta origen → destino, estado y último movimiento.
- [ ] Índices en base de datos; objetivo < 200 ms por búsqueda con 5.000+ cables.
- [ ] Diseño responsive (uso desde tablet/móvil en planta).
- [ ] Tests: consultas de búsqueda, filtros y E2E de búsqueda → ficha.

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
