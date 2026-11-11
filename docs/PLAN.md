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

| Fase | Nombre                        | Versión | Resultado principal                                   |
| ---- | ----------------------------- | ------- | ----------------------------------------------------- |
| 0    | Fundamentos del repositorio   | v0.1.0  | Monorepo, Docker local, lint, tests, CI funcionando   |
| 1    | Autenticación y usuarios      | v0.2.0  | Login, sesiones, roles, recuperación de contraseña    |
| 2    | Modelo de datos y ubicaciones | v0.3.0  | Esquema Prisma, árbol de ubicaciones, catálogos, seed |
| 3    | Carga y edición de cables     | v0.4.0  | Formularios de alta/edición con validación            |
| 4    | Buscador y ficha del cable    | v0.5.0  | Búsqueda tolerante + filtros + ficha completa         |
| 4.5  | CI, GitHub y Pull Requests    | v0.5.1  | Repo en GitHub, PRs a `dev` con CI, tema oscuro       |
| 5    | Estados y trazabilidad        | v0.6.0  | Tendido/enrollado, conectado, historial por usuario   |
| 6    | E2E, importación/exportación  | v0.7.0  | E2E de las fases 1-5, CSV/Excel masivo, dashboard     |
| 7    | Modo sin conexión (PWA)       | v0.8.0  | Consulta offline + cola de cambios sincronizable      |
| 8    | Producción y endurecimiento   | v1.0.0  | Despliegue Vercel + Railway, seguridad, backups, docs |

**Total: 10 fases (0 a 8, más la 4.5 añadida el 2026-11-11).** Al terminar la fase 8 se
publica la **v1.0.0**.

Cada fase termina con todos los tests en verde en `dev`. Desde la fase 4.5, todo llega a `dev`
por Pull Request y con el CI en verde. Las versiones de la tabla son orientativas: `dev` → `main`
(y sus tags) solo se hace al final del proyecto o cuando lo decida el responsable.

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
`pnpm check` (lint + typecheck + tests) pasa en local y en CI. _(El workflow existe desde la
fase 0, pero nunca se ha ejecutado: se activa en la fase 4.5.)_

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
- [ ] Tests E2E de registro, login, logout y recuperación de contraseña (aplazados a la fase 6).

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
- [ ] Tests E2E de alta/edición (aplazados a la fase 6).

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
- [ ] Tests E2E de búsqueda → ficha (aplazados a la fase 6).

## Fase 4.5 — CI, GitHub y Pull Requests (v0.5.1)

Fase añadida el 2026-11-11, antes de empezar la fase 5. Objetivo: que el código esté en GitHub
y que **nada llegue a `dev` sin un Pull Request con el CI en verde**. Los E2E no entran aquí:
empiezan en la fase 6.

### Decisiones (2026-11-11)

- Repositorio **público** en la cuenta de GitHub del responsable. Con cuenta gratuita, solo un
  repo público permite obligar a pasar el CI (protección de ramas) y trae gratis CodeQL, la
  revisión de dependencias y el bloqueo de secretos. El repo no contiene datos reales.
- Rama por defecto del repo: **`dev`** (los PR apuntan ahí sin tocar nada, y `main` va por
  detrás: está en la fase 1).
- Flujo: `feat/*`, `fix/*`, `chore/*` y `docs/*` → **PR a `dev`** → CI en verde → merge con
  **merge commit** (equivale a `--no-ff`) → se borra la rama. Detalle en `CONTRIBUTING.md`.
- `main` no cambia de regla: solo recibe `dev` al final del proyecto o cuando lo pida el
  responsable (también por PR `dev` → `main`).
- **Tema oscuro único** con acento azul; nunca fondos blancos. Paleta en
  `docs/ARQUITECTURA.md` → "Interfaz: tema oscuro".

### Orden de trabajo

1. Comprobaciones previas y primer push de `main` y `dev` (sin protección todavía).
2. `chore/ci-workflow`: arreglar y endurecer el CI principal. Es el primer PR: sirve para ver
   fallar y pasar el CI de verdad.
3. Protección de ramas. Va después del paso 2 porque GitHub solo deja marcar como obligatorio
   un check que ya se ha ejecutado alguna vez.
4. `chore/ci-security`: CodeQL, revisión de dependencias y Dependabot.
5. `feat/f4.5-dark-theme`: el tema oscuro, primer cambio de código por el flujo completo.

### 1 — Antes del primer push

- [x] Reescribir el historial antes de publicarlo (decisión del responsable): los 73 commits
      usan el correo noreply de GitHub en lugar del personal, y se quitan las menciones a una
      empresa real. Copia de seguridad previa en un `git bundle`.
- [x] Buscar secretos en el historial con `gitleaks`: ninguno en `dev` ni en `main`.
- [x] Crear el repo público, añadir el remoto `origin` y subir `main` y `dev`.
- [x] Ajustes del repo: rama por defecto `dev`; solo "merge commit" (squash y rebase
      desactivados); borrar la rama al mergear; alertas de Dependabot, secret scanning y push
      protection activados; token de Actions de solo lectura por defecto.

### 2 — CI principal (`.github/workflows/ci.yml`)

El workflow existía desde la fase 0 pero nunca se había ejecutado.

- [x] Primera ejecución y corrección. Falló como se esperaba: `pnpm/action-setup` recibía
      `version: 10` y el `package.json` declara `packageManager: pnpm@10.33.4`. Se quita
      `version` y la acción lee `packageManager`.
- [x] Disparadores: PR a `dev` y `main`, push a `dev` y `main`, y ejecución manual
      (`workflow_dispatch`). Sin `paths-ignore`: un check obligatorio que no llega a ejecutarse
      deja el PR bloqueado para siempre.
- [x] `permissions: contents: read` en el workflow (mínimo privilegio).
- [x] Job `check`: formato → migraciones → lint → typecheck → tests unitarios y de integración
      (Postgres 16 como servicio) → build.
- [x] Cobertura mínima como umbral de Vitest: `pnpm test` (y por tanto `pnpm check` y el CI)
      falla si baja. `packages/shared`: 80 % en todo (hoy 99 %). `server/`: 80 % en líneas,
      sentencias y funciones (hoy 90 %) y 75 % en ramas (hoy 79 %; objetivo, 80 %).
- [x] `pnpm db:check`: falla si `schema.prisma` no coincide con las migraciones (alguien cambió
      el esquema sin crear la migración). Probado con un campo sin migrar: sale con código 2.
- [x] Job `commitlint` sobre los commits del PR. El hook local se puede saltar con
      `--no-verify`; el CI no.
- [x] Caché de Turborepo y de `.next/cache` entre ejecuciones.
- [x] El job `e2e` solo se lanza a mano hasta la fase 6.
- [x] Plantilla de PR (`.github/pull_request_template.md`) con la Definición de Hecho.
- [x] Insignia del CI en el `README.md`.

### 3 — Protección de ramas (ruleset de GitHub)

- [x] Ruleset "Proteger dev y main" (activo desde el 2026-11-11): `dev` y `main` solo cambian
      por PR, con merge commit y con `check` y `commitlint` en verde. Sin force-push ni borrado,
      y sin excepciones (nadie puede saltárselo, tampoco el dueño del repo).
- [x] Sin aprobación obligatoria de otra persona: el equipo es de una persona y GitHub no deja
      aprobar tu propio PR, así que quedaría bloqueado.
- [x] Comprobado con la API de GitHub (`rules/branches/dev` y `main`): se aplican las cuatro
      reglas. El PR que documenta este bloque es el primero que pasa por ellas.
- [ ] Añadir CodeQL y la revisión de dependencias a los checks obligatorios cuando existan
      (bloque 4).

### 4 — Seguridad (`chore/ci-security`)

- [x] CodeQL (JavaScript/TypeScript, `.github/workflows/codeql.yml`) en cada PR y push a
      `dev`/`main` y los lunes. Resultados en la pestaña Security del repo.
- [x] Revisión de dependencias en cada PR (`dependency-review.yml`): falla si el PR añade una
      dependencia con una vulnerabilidad alta o crítica conocida.
- [x] Dependabot (`.github/dependabot.yml`): los lunes, PRs contra `dev` con las versiones
      menores y parches de npm agrupados (las mayores, una a una) y las GitHub Actions en un
      solo PR. Además, PRs automáticos de seguridad cuando hay parche.
- [x] Commitlint ignora los commits de Dependabot (sus notas de versión traen líneas de más de
      100 caracteres). Su cabecera ya sigue el formato: `chore(deps): …` y `ci(deps): …`.
- [x] Acciones de terceros fijadas por SHA, con la versión en un comentario. Dependabot propone
      los saltos de versión mayor (hay v6-v7 de casi todas) en PRs con su propio CI.
- [x] Alertas abiertas al subir el repo:
  - `minimatch` 10.2.6 (moderada, DoS): corregida con un override a la 11 en
    `pnpm-workspace.yaml`. Lint, typecheck y el CLI de shadcn funcionan.
  - `deepmerge` 4.3.1 (baja, prototype poisoning): sin versión corregida. Solo la usa el CLI de
    shadcn en desarrollo, nunca llega a la app. Queda abierta hasta que haya parche.

### 5 — Tema oscuro (`feat/f4.5-dark-theme`)

- [ ] Sustituir los tokens de `apps/web/src/app/globals.css` por la paleta oscura de
      `docs/ARQUITECTURA.md`. Un único tema: sin modo claro ni selector, y con
      `color-scheme: dark` para que los controles nativos también salgan oscuros.
- [ ] Tokens nuevos `success` y `warning` (para los estados de la fase 5).
- [ ] Quitar los colores fijos de Tailwind: `text-white` en `components/ui/badge.tsx` y
      `text-emerald-600` en `users-table.tsx` y `health-card.tsx`.
- [ ] Test que falla si aparece un color fijo (`bg-white`, `text-black`, `text-emerald-600`…)
      fuera de `globals.css`.
- [ ] Repasar todas las páginas (login, registro, buscador, ficha, formularios, ubicaciones,
      catálogos, usuarios, estado), también a 375 px, con contraste AA.
- Los correos (HTML) quedan fuera: cada cliente de correo aplica sus propios colores.

**Criterio de aceptación:** el código está en GitHub; un PR a `dev` ejecuta el CI y no se puede
mergear si falla; `dev` y `main` rechazan el push directo; CodeQL, la revisión de dependencias y
Dependabot funcionan; la app se ve solo en oscuro, sin ningún fondo blanco.

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
- [ ] Tests: máquina de estados, permisos por rol y transacción (cable + evento). Los E2E de
      cada acción se escriben al empezar la fase 6.

## Fase 6 — E2E, importación / exportación y panel (v0.7.0)

### Primero: tests E2E (decisión del 2026-11-11)

Los E2E empiezan aquí, con la app ya completa hasta la fase 5. A partir de esta fase, cada fase
cierra con sus E2E escritos y en verde en el CI.

- [ ] Flujos de la fase 1: registro, verificación de correo, login, logout y recuperación de
      contraseña (correo leído desde Mailpit).
- [ ] Flujos de la fase 3: alta, edición y baja de un cable, y el aviso de edición simultánea.
- [ ] Flujos de la fase 4: buscar → filtrar → abrir la ficha, y que los filtros sobrevivan al
      botón atrás.
- [ ] Flujos de la fase 5: cada acción (tender, enrollar, conectar, mover, retirar, corrección)
      y su reflejo en el historial.
- [ ] Permisos: un `VIEWER` no ve ni puede usar las acciones de edición.
- [ ] Activar el job `e2e` del CI. Recomendación: ejecutarlo en cada PR a `dev`. Como todo
      entra por PR, ejecutarlo solo tras el merge avisaría tarde.

### Importación / exportación y panel

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

El entorno de staging estaba previsto al terminar la fase 1, para probar en real desde el
principio. A 2026-11-11 sigue sin conectar: la fase 4.5 sube el código a GitHub, pero no
despliega nada.
