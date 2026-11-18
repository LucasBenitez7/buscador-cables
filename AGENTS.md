# Instrucciones para agentes de IA

Lee antes de trabajar: `CONTRIBUTING.md` (ramas, PRs, releases, tests y estilo: es la única
fuente de las reglas de trabajo), `docs/PLAN.md` (fases y tareas) y `docs/ARQUITECTURA.md`.

## Reglas

1. Trabaja en una rama `feat/*`, `fix/*`, `chore/*` o `docs/*` creada desde `dev`. Una sola rama
   `feat/fN-<nombre>` y un solo PR por fase. Nunca commit ni push directo en `dev` ni en `main`.
2. Todo entra en `dev` por PR con el CI en verde, y **solo se mergea tras pedir confirmación al
   usuario** (merge commit, nunca squash ni rebase, nunca force-push).
3. `main` es producción. Solo recibe `dev` por un PR de release cuando el usuario lo pida. Tags
   y GitHub Releases: ver «Releases y tags» en `CONTRIBUTING.md`. Pide confirmación antes de
   publicar un tag y nunca muevas ni borres uno publicado.
4. Si un comando de git está prohibido por la configuración de permisos, no busques otro comando
   que logre lo mismo: pregunta.
5. Antes de dar una tarea por terminada, `pnpm check` en verde. Toda funcionalidad lleva tests y
   todo bug corregido, un test que lo reproduce.
6. Conventional Commits en inglés (`feat(cables): ...`), también en el título de los PR. Código en
   inglés; textos de la UI y documentación en español.
7. Arquitectura: lógica de negocio en `apps/web/src/server` y `packages/*`; los componentes
   cliente nunca acceden a la base de datos. Valida la entrada con Zod y comprueba sesión y
   permisos en el servidor.
8. No añadas dependencias nuevas sin justificarlo.
9. Sin secretos en el código: usa `.env` y actualiza `.env.example`. El repo es público. Los datos
   reales del cliente (PDFs, Excel, lo que se extrae de ellos) van solo en `private-data/`, que
   git ignora: nunca en el código, los tests, la documentación ni los commits, y tampoco el
   nombre del cliente. Los tests usan datos inventados.
10. La UI es solo oscura: usa los tokens del tema (`bg-background`, `bg-card`, `text-foreground`,
    `bg-primary`, `text-success`…). Nunca fondos blancos ni colores fijos de Tailwind
    (`bg-white`, `text-black`, `text-emerald-600`). Paleta en `docs/ARQUITECTURA.md`.
11. Al terminar una tarea, marca su casilla en `docs/PLAN.md`.

## Comandos

En Windows PowerShell usa `pnpm.cmd` / `npm.cmd` si la política de ejecución bloquea los `.ps1`.

| Comando                   | Acción                                                         |
| ------------------------- | -------------------------------------------------------------- |
| `docker compose up -d`    | Levanta Postgres + Mailpit                                     |
| `pnpm dev`                | Arranca la app en http://localhost:3000                        |
| `pnpm check`              | Lint + typecheck + tests unitarios/integración                 |
| `pnpm test:e2e`           | Tests E2E con Playwright                                       |
| `pnpm db:migrate`         | Crea/aplica migraciones de Prisma                              |
| `pnpm db:seed`            | Carga datos de ejemplo                                         |
| `pnpm db:studio`          | Abre Prisma Studio                                             |
| `pnpm db:check`           | Falla si `schema.prisma` no coincide con las migraciones       |
| `pnpm data:extract`       | Lee los PDFs de `private-data/source/` (datos reales)          |
| `pnpm data:render`        | Dibuja los planos en teselas en `private-data/drawings/`       |
| `pnpm data:load`          | Carga lo extraído en la base de datos (`--as <correo>`)        |
| `pnpm data:upload`        | Sube las teselas al bucket de producción (R2, `DRAWINGS_S3_*`) |
| `gh pr create --base dev` | Abre el PR de la rama actual contra `dev`                      |
| `gh pr checks --watch`    | Sigue el CI del PR hasta que termina                           |
