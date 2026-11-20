# Reglas de trabajo

## Ramas

```
main      ← producción y rama por defecto en GitHub. Solo recibe dev por un PR de release.
 └─ dev   ← desarrollo: todo el trabajo entra aquí. Solo cambia por PR con el CI en verde.
     ├─ feat/f<fase>-<nombre>        una por fase          ej. feat/f5-traceability
     ├─ fix/<descripcion>            corrección            ej. fix/search-empty-filter
     ├─ chore/<descripcion>          tooling, deps, config ej. chore/ci-cache
     └─ docs/<descripcion>           solo documentación
hotfix/<descripcion>                 sale de main, se mergea a main Y a dev
```

- Nunca se hace commit directo en `main` ni en `dev`.
- **La rama por defecto en GitHub es `main`** (producción), no `dev`. Por eso los PR se abren
  siempre con `--base dev`, y los workflows programados o manuales (como la copia de seguridad)
  solo se ejecutan con lo que ya está en `main`.
- **Una sola rama `feat/*` por fase** (decisión del 2026-11-12). Todo el trabajo de la fase
  (lógica, servidor, interfaz, tests y documentación) va en ella como commits separados, y se
  mergea en `dev` con un único PR al terminar la fase. Las ramas `fix/*`, `chore/*` y `docs/*`
  quedan para cambios sueltos fuera de una fase.
- Nombres de rama en inglés, en minúsculas y con guiones.

## Flujo con Pull Requests (desde la fase 4.5)

Toda rama llega a `dev` por un PR en GitHub, y solo se mergea con el CI en verde. Así cada
cambio se comprueba en una máquina limpia, no solo en la del autor.

```bash
# 1. Crear rama desde dev actualizado
git switch dev && git pull
git switch -c feat/f5-cable-actions

# 2. Trabajar con commits pequeños (Conventional Commits)

# 3. Antes de abrir el PR: traer lo último de dev y verificar en local
git fetch && git merge origin/dev         # merge, no rebase (la historia publicada no se reescribe)
pnpm check                                # lint + typecheck + unit + integración

# 4. Subir la rama y abrir el PR contra dev
git push -u origin feat/f5-cable-actions
gh pr create --base dev --fill            # la plantilla añade la Definición de Hecho

# 5. Esperar al CI. Si falla: se corrige con commits nuevos en la misma rama y se hace push.
gh pr checks --watch

# 6. Con el CI en verde: merge commit (equivale a --no-ff) y borrar la rama
gh pr merge --merge --delete-branch
git switch dev && git pull
```

Reglas del flujo:

- **Nunca push directo a `dev` ni a `main`.** GitHub lo rechaza (protección de ramas).
- **Solo "merge commit"**: ni squash ni rebase. Se conserva la historia de cada rama, igual que
  con `--no-ff`.
- **Sin force-push** en ramas con PR abierto. Para ponerse al día con `dev`, `git merge`.
- Un PR por rama: una fase entera o un cambio suelto. El título del PR sigue Conventional
  Commits. El PR de una fase se puede abrir pronto para ver el CI en cada push, pero solo se
  mergea cuando la fase está terminada.
- Los PR de Dependabot también van a `dev` y pasan el mismo CI.
- Un agente de IA abre el PR por su cuenta, pero **pide confirmación antes de mergearlo**.
- Si un comando de git está prohibido por la configuración de permisos, no se busca otro que
  logre lo mismo: se pregunta.

## CI (GitHub Actions)

| Workflow / herramienta | Cuándo                   | Qué comprueba                                                                   |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `ci.yml` → `check`     | PR y push a `dev`/`main` | Formato, lint, typecheck, tests, cobertura ≥ 80 %, migraciones al día, build    |
| `ci.yml` → commitlint  | PR                       | Que todos los commits del PR siguen Conventional Commits                        |
| `ci.yml` → `e2e`       | PR y push a `dev`/`main` | Playwright (escritorio y móvil) contra la app compilada, con Postgres y Mailpit |
| CodeQL                 | PR a `dev` y semanal     | Análisis estático de seguridad (JavaScript/TypeScript)                          |
| Dependency review      | PR                       | Que el PR no añade dependencias con vulnerabilidades altas o críticas conocidas |
| Dependabot             | Semanal                  | PRs agrupados con actualizaciones de npm y de GitHub Actions, contra `dev`      |
| `backup.yml`           | Diario y a mano          | Copia de la base de producción, comprobada, cifrada y subida a R2               |
| Secret scanning        | Cada push                | Bloquea el push si contiene un secreto reconocible (token, clave…)              |

Todos los checks obligatorios deben estar en verde para mergear.

### Cierre de fase

Una fase se da por cerrada **en `dev`** cuando se cumplen **todos** sus criterios de aceptación
de `docs/PLAN.md` y `pnpm check` está en verde en `dev`. Cerrar una fase no lleva por sí solo a
producción: eso es una release.

## Releases y tags

`main` es lo que está en producción (Vercel despliega desde `main`). Solo recibe `dev` por un PR
de release, **cuando el responsable lo pida**. Nadie, tampoco un agente, lo hace por su cuenta.

### Qué versión toca (SemVer)

| Cambio desde la última release                     | Versión | Ejemplo           |
| -------------------------------------------------- | ------- | ----------------- |
| Solo arreglos y mejoras pequeñas                   | parche  | `v1.2.2 → v1.2.3` |
| Una fase o funcionalidad nueva                     | menor   | `v1.2.3 → v1.3.0` |
| Algo que rompe (datos, permisos, forma de trabajo) | mayor   | `v1.3.0 → v2.0.0` |

La versión de cada fase en `docs/PLAN.md` es orientativa: manda lo que de verdad sale.

### Cómo se hace

```bash
# 1. PR de release (CI en verde y OK del responsable antes del merge)
gh pr create --base main --head dev --title "chore(release): vX.Y.Z"
gh pr merge --merge

# 2. Tag anotado sobre el commit de merge en main
git fetch
git tag -a vX.Y.Z origin/main -m "vX.Y.Z: <resumen en español>"

# 3. Publicar el tag (con el OK del responsable)
git push origin vX.Y.Z

# 4. GitHub Release con notas para quien usa la app
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes "..."
```

- Las notas de la release, en español, cuentan lo que cambia para quien usa la web (no la lista
  de commits). No hay CHANGELOG aparte: las GitHub Releases son el historial de versiones.
- **Un tag publicado no se mueve ni se borra**: quien ya lo descargó tendría otra versión. Si
  un tag es incorrecto, se publica una versión nueva.
- La versión de `package.json` no se usa (la app no se publica como paquete).

### Versiones publicadas

| Tag      | PR a `main` | Qué trae                                                           |
| -------- | ----------- | ------------------------------------------------------------------ |
| `v0.1.0` | —           | Fase 0: fundamentos del repositorio                                |
| `v0.2.0` | —           | Fase 1: autenticación y usuarios                                   |
| `v1.0.0` | #35         | Primer despliegue en producción (fases 2 a 10)                     |
| `v1.1.0` | #49         | Fase 11: conexionado (salió junto con la fase 12)                  |
| `v1.2.0` | #49         | Fase 12: roles y permisos desde la web                             |
| `v1.2.1` | #53         | Listas más claras, carga visible e historial desde el 17/11        |
| `v1.2.2` | #55         | Funciones en Frankfurt, barra de carga y «Cargando…» en la ficha   |
| `v1.2.3` | #59         | Copia de seguridad diaria de la base y reglas de trabajo ordenadas |
| `v1.6.0` | #66         | Fases 13 a 16: uso en campo, Excel del día, listados y guardados   |
| `v1.7.0` | #68         | Fase 17: repaso de la interfaz y metros                            |
| `v1.7.1` | #71         | Sesión semanal, listas sin saltos y repaso tras la fase 17         |
| `v1.8.0` | #74         | «Mi cuenta» y nada de correos como nombre                          |

Los PR #38, #43 y #51 llevaron mejoras a producción sin tag propio; quedan incluidas en la
versión siguiente.

## Commits — Conventional Commits (en inglés)

```
<type>(<scope>): <summary in imperative>

feat(auth): add password reset via email
fix(search): handle codes without hyphen
test(cables): cover state transitions
chore(deps): bump prisma to 6.x
```

Tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `perf`, `style`.
Scopes habituales: `auth`, `users`, `cables`, `locations`, `search`, `import`, `offline`, `db`, `ui`, `ci`.
commitlint lo valida automáticamente en cada commit.

## Tests — obligatorios

| Tipo        | Herramienta                | Qué cubre                                            | Cuándo          |
| ----------- | -------------------------- | ---------------------------------------------------- | --------------- |
| Unitario    | Vitest                     | Validaciones Zod, normalizadores, permisos, estados  | Siempre         |
| Integración | Vitest + Postgres (Docker) | Servicios y consultas contra base de datos real      | Siempre         |
| Componentes | Vitest + Testing Library   | Formularios y componentes con lógica                 | Siempre         |
| E2E         | Playwright                 | Flujos críticos: login, reset, buscar, alta, estados | Desde la fase 6 |

### Política de E2E

Los tests E2E son caros (levantan navegador + servidor + base de datos) y solo aportan
valor cuando hay un flujo de usuario completo que romper. Por eso:

- **Durante el día a día se trabaja con `pnpm check`** (unitarios, integración y componentes).
- **Los E2E empiezan en la fase 6 (decisión del 2026-11-11).** Desde el 2026-11-13 cubren los
  flujos de las fases 1 a 5 y el job `e2e` corre en cada PR a `dev` y en cada push a
  `dev`/`main`. Cada fase cierra con los E2E de sus flujos en verde.
- Excepción: si un bug afecta a un flujo ya cubierto por un E2E, se reproduce con un E2E.

### Cómo funcionan los E2E

- `pnpm test:e2e` (con `docker compose up -d`) compila la app y la arranca con `next start`
  en el puerto 3100, así que no choca con un `pnpm dev` abierto.
- Usan su propia base, `cables_e2e`, que se crea al lado de la de `DATABASE_URL`. Antes de
  cada ejecución `e2e/global-setup.ts` la migra, la vacía y carga datos conocidos
  (`e2e/support/data.ts`): un usuario por rol, ubicaciones, catálogos y un cable por test que
  lo modifica. Nunca toca la base de desarrollo ni la de integración.
- `e2e/auth.setup.ts` entra una vez con cada rol y guarda la sesión; los tests la reutilizan
  con `test.use({ storageState: storageStatePath("technician") })`.
- Los correos (confirmación, recuperación) se leen de Mailpit (`MAILPIT_URL`).
- Proyectos: `desktop` (Chrome, todos los specs menos `mobile.spec.ts`) y `mobile` (Pixel 7,
  `mobile.spec.ts`). Un test que cierra sesión o cambia la contraseña usa su propio usuario o
  su propia sesión, para no invalidar las guardadas.
- `pnpm --filter @cables/web test:e2e:ui` abre el modo interactivo de Playwright.

Reglas:

- Los tests de integración se nombran `*.int.test.ts` y usan la base `cables_test`
  (`DATABASE_URL_TEST`); las migraciones se aplican solas antes de ejecutarlos.
- Toda funcionalidad nueva incluye sus tests en la misma rama.
- Todo bug corregido incluye un test que lo reproduce.
- Cobertura mínima de `server/` y `packages/shared`: **80 %**. `pnpm test` mide la cobertura y
  falla si baja (umbrales en `vitest.config`). Excepción temporal: las ramas de `server/` tienen
  un mínimo del 75 % (2026-11-11: 79 %) hasta que se suban al 80 %.
- Si cambias `schema.prisma`, `pnpm db:check` comprueba que la migración existe (necesita las
  migraciones aplicadas en tu base local con `pnpm db:migrate`). El CI lo ejecuta siempre.
- No se mergea nada con tests fallando, saltados (`.skip`) u `.only`.

## Definición de "hecho" (Definition of Done)

- [ ] Cumple lo pedido en la tarea de `docs/PLAN.md`.
- [ ] `pnpm check` en verde (lint, typecheck, tests unitarios y de integración).
- [ ] PR a `dev` con todos los checks del CI en verde (desde la fase 4.5).
- [ ] `pnpm test:e2e` en verde **al cerrar la fase** (desde la fase 6).
- [ ] UI solo con los tokens del tema oscuro: ningún fondo blanco ni color fijo de Tailwind.
- [ ] Sin `console.log`, `any` injustificados ni código comentado.
- [ ] Migraciones de Prisma creadas y probadas si cambia el esquema.
- [ ] Permisos verificados en servidor.
- [ ] Documentación actualizada si cambia el comportamiento.
- [ ] Casilla marcada en `docs/PLAN.md`.

## Estilo de código

- TypeScript `strict`. Prohibido `any` salvo justificación en comentario.
- Código, nombres y commits en **inglés**; documentación y textos de la UI en **español**.
- Componentes en PascalCase, archivos en kebab-case (`cable-form.tsx`).
- Server Components por defecto; `"use client"` solo cuando haga falta.
- **UI solo en oscuro.** Colores siempre con los tokens del tema (`bg-background`, `bg-card`,
  `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-success`…). Prohibidos los
  fondos blancos y los colores fijos de Tailwind (`bg-white`, `text-black`, `text-emerald-600`).
  Paleta en `docs/ARQUITECTURA.md`.
- Validar siempre con Zod en el servidor, aunque también se valide en el cliente.
- Lógica de negocio en `server/` (sin dependencias de React ni de Next).
- Formato automático con Prettier: lo aplica `lint-staged` en el hook `pre-commit`.
- ESLint **no** corre en el hook (en un monorepo pnpm el binario no es resoluble desde la
  raíz); se ejecuta con `pnpm check` y en CI.

## Base de datos

- Cualquier cambio de esquema: `pnpm db:migrate --name <descripcion>`; nunca se edita una migración ya mergeada.
- Nunca `prisma db push` contra staging o producción.
- Borrado de cables siempre lógico (`deletedAt`).
