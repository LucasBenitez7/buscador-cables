# Reglas de trabajo

## Ramas

```
main      ← producción. Solo recibe dev al terminar el proyecto o cuando lo decida el responsable.
 └─ dev   ← integración. Siempre debe compilar y pasar los tests.
     ├─ feat/<fase>-<descripcion>    nueva funcionalidad   ej. feat/f1-password-reset
     ├─ fix/<descripcion>            corrección            ej. fix/search-empty-filter
     ├─ chore/<descripcion>          tooling, deps, config ej. chore/ci-cache
     └─ docs/<descripcion>           solo documentación
hotfix/<descripcion>                 sale de main, se mergea a main Y a dev
```

- Nunca se hace commit directo en `main` ni en `dev`.
- Una rama = una funcionalidad pequeña y concreta (idealmente 1–3 días de trabajo).
- Nombres de rama en inglés, en minúsculas y con guiones.

## Flujo (sin Pull Requests, merge directo)

```bash
# 1. Crear rama desde dev actualizado
git switch dev && git pull
git switch -c feat/f1-login

# 2. Trabajar con commits pequeños (Conventional Commits)

# 3. Antes de mergear: actualizar y verificar
git fetch && git rebase origin/dev        # o merge de dev si se prefiere
pnpm check                                # lint + typecheck + unit + integración
pnpm test:e2e                             # solo al cerrar fase (ver "Tests")

# 4. Merge a dev (siempre --no-ff para conservar la historia de la rama)
git switch dev
git merge --no-ff feat/f1-login
pnpm check                                # se vuelve a verificar ya en dev
git push
git branch -d feat/f1-login
```

### Cierre de fase

Una fase se da por cerrada **en `dev`** cuando se cumplen **todos** sus criterios de aceptación
de `docs/PLAN.md` y `pnpm check` está en verde en `dev`. Cerrar una fase **no** implica merge a
`main` (decisión del 2026-11-11).

### Merge a `main` (solo al final o cuando lo diga el responsable)

`main` recibe `dev` únicamente al terminar el proyecto o cuando el responsable lo pida
expresamente. Nadie (tampoco un agente) lo propone ni lo hace por su cuenta:

```bash
git switch main
git merge --no-ff dev -m "chore(release): merge dev into main"
git tag -a vX.Y.Z -m "…"      # el tag lo crea el responsable
```

> **De momento:** no hay remoto ni Pull Requests. Se trabaja en local con merges directos
> `feat/*` → `dev` (`--no-ff`), sin `git push`. El CI de GitHub Actions ya está configurado,
> pero se activará más adelante; hasta entonces `pnpm check` en local hace de CI.

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

| Tipo        | Herramienta                | Qué cubre                                            | Cuándo              |
| ----------- | -------------------------- | ---------------------------------------------------- | ------------------- |
| Unitario    | Vitest                     | Validaciones Zod, normalizadores, permisos, estados  | Siempre             |
| Integración | Vitest + Postgres (Docker) | Servicios y consultas contra base de datos real      | Siempre             |
| Componentes | Vitest + Testing Library   | Formularios y componentes con lógica                 | Siempre             |
| E2E         | Playwright                 | Flujos críticos: login, reset, buscar, alta, estados | Al cerrar cada fase |

### Política de E2E

Los tests E2E son caros (levantan navegador + servidor + base de datos) y solo aportan
valor cuando hay un flujo de usuario completo que romper. Por eso:

- **Durante el día a día se trabaja con `pnpm check`** (unitarios, integración y componentes).
- **Los E2E se escriben y ejecutan al cerrar cada fase**, sobre los flujos reales que esa
  fase entrega. La infraestructura ya está lista desde la fase 0 (`pnpm test:e2e`).
- **Aplazado de momento (decisión del 2026-11-10):** los E2E de las fases 1 en adelante se
  escribirán más adelante, junto con la activación del CI. Mientras tanto, cada flujo nuevo
  se prueba a mano contra la app arrancada y se anota en `docs/REVISIONES.md`.
- Excepción: si un bug afecta a un flujo ya cubierto por un E2E, se reproduce con un E2E.
- En CI, el job de E2E solo se ejecuta en `dev` y `main`, no en cada rama `feat/*`.

Reglas:

- Los tests de integración se nombran `*.int.test.ts` y usan la base `cables_test`
  (`DATABASE_URL_TEST`); las migraciones se aplican solas antes de ejecutarlos.
- Toda funcionalidad nueva incluye sus tests en la misma rama.
- Todo bug corregido incluye un test que lo reproduce.
- Cobertura mínima de `server/` y `packages/shared`: **80 %**.
- No se mergea nada con tests fallando, saltados (`.skip`) u `.only`.

## Definición de "hecho" (Definition of Done)

- [ ] Cumple lo pedido en la tarea de `docs/PLAN.md`.
- [ ] `pnpm check` en verde (lint, typecheck, tests unitarios y de integración).
- [ ] `pnpm test:e2e` en verde **al cerrar la fase** (no en cada rama; aplazado de momento).
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
- Validar siempre con Zod en el servidor, aunque también se valide en el cliente.
- Lógica de negocio en `server/` (sin dependencias de React ni de Next).
- Formato automático con Prettier: lo aplica `lint-staged` en el hook `pre-commit`.
- ESLint **no** corre en el hook (en un monorepo pnpm el binario no es resoluble desde la
  raíz); se ejecuta con `pnpm check` y en CI.

## Base de datos

- Cualquier cambio de esquema: `pnpm db:migrate --name <descripcion>`; nunca se edita una migración ya mergeada.
- Nunca `prisma db push` contra staging o producción.
- Borrado de cables siempre lógico (`deletedAt`).
