# Instrucciones para agentes de IA

Lee antes de trabajar: `docs/PLAN.md`, `docs/ARQUITECTURA.md` y `CONTRIBUTING.md`.

## Reglas

1. Trabaja solo en ramas `feat/*`, `fix/*`, `chore/*` o `docs/*` creadas desde `dev`. Nunca hagas commit en `main` ni en `dev`. **Cada fase tiene una sola rama `feat/fN-<nombre>` y un solo PR**: todo el trabajo de la fase va en ella (commits separados) y se mergea en `dev` al terminar la fase. No partas una fase en varias ramas.
2. Desde la fase 4.5, toda rama entra en `dev` por Pull Request: `pnpm check`, `git push -u origin <rama>`, `gh pr create --base dev`, esperar a que el CI esté en verde y, **tras pedir confirmación al usuario**, `gh pr merge --merge --delete-branch` (merge commit, nunca squash ni rebase). Si el CI falla, corrígelo con commits nuevos en la misma rama. Nunca hagas push directo a `dev` ni a `main`, ni force-push. Hasta que exista el remoto (bloque 1 de la fase 4.5) se mergea en local con `git merge --no-ff` en `dev`. Detalle en `CONTRIBUTING.md`.
3. Nunca mergees en `main` ni abras PRs contra `main`: eso solo se hace al final del proyecto o cuando el usuario lo pida. Crea tags de versión (`vX.Y.Z`) solo cuando el usuario lo pida, pide confirmación antes de publicarlos y nunca muevas ni borres un tag publicado (ver "Tags de versión" en `CONTRIBUTING.md`). Si un comando de git está prohibido por la configuración de permisos, no busques otro comando que logre lo mismo: pregunta.
4. Antes de dar una tarea por terminada, ejecuta `pnpm check` y asegúrate de que todo pasa. Los E2E empiezan en la fase 6: hasta entonces no se escriben ni se ejecutan en CI.
5. Toda funcionalidad lleva tests. Todo bug corregido lleva un test que lo reproduce.
6. Sigue Conventional Commits en inglés (`feat(cables): ...`), también en el título de los PR.
7. Código en inglés y textos de la UI / documentación en español.
8. Respeta la arquitectura: lógica de negocio en `apps/web/src/server` y `packages/*`; los componentes cliente nunca acceden a la base de datos.
9. Valida siempre la entrada con Zod y comprueba sesión y rol en el servidor.
10. No añadas dependencias nuevas sin justificarlo.
11. No metas secretos en el código; usa `.env` y actualiza `.env.example`. El repo es público.
    Los datos reales del cliente (PDFs, Excel, lo que se extrae de ellos) van solo en
    `private-data/`, que git ignora: nunca en el código, los tests, la documentación ni los
    commits, y tampoco el nombre del cliente. Los tests usan datos inventados.
12. La UI es solo oscura: usa los tokens del tema (`bg-background`, `bg-card`, `text-foreground`, `bg-primary`, `text-success`…). Nunca fondos blancos ni colores fijos de Tailwind (`bg-white`, `text-black`, `text-emerald-600`). Paleta en `docs/ARQUITECTURA.md`.
13. Al terminar una tarea, marca su casilla en `docs/PLAN.md`.

## Comandos (a partir de la fase 0)

En Windows PowerShell usa `pnpm.cmd` / `npm.cmd` si la política de ejecución bloquea los `.ps1`.

| Comando                   | Acción                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `docker compose up -d`    | Levanta Postgres + Mailpit                                    |
| `pnpm dev`                | Arranca la app en http://localhost:3000                       |
| `pnpm check`              | Lint + typecheck + tests unitarios/integración                |
| `pnpm test:e2e`           | Tests E2E con Playwright                                      |
| `pnpm db:migrate`         | Crea/aplica migraciones de Prisma                             |
| `pnpm db:seed`            | Carga datos de ejemplo                                        |
| `pnpm db:studio`          | Abre Prisma Studio                                            |
| `pnpm db:check`           | Falla si `schema.prisma` no coincide con las migraciones      |
| `pnpm data:extract`       | Lee los PDFs de `private-data/source/` (datos reales, fase 7) |
| `gh pr create --base dev` | Abre el PR de la rama actual contra `dev` (desde la fase 4.5) |
| `gh pr checks --watch`    | Sigue el CI del PR hasta que termina                          |
