# Instrucciones para agentes de IA

Lee antes de trabajar: `docs/PLAN.md`, `docs/ARQUITECTURA.md` y `CONTRIBUTING.md`.

## Reglas

1. Trabaja solo en ramas `feat/*`, `fix/*`, `chore/*` o `docs/*` creadas desde `dev`. Nunca hagas commit en `main` ni en `dev`.
2. No hagas merge, push ni tag sin pedírselo antes al usuario.
3. Antes de dar una tarea por terminada, ejecuta `pnpm check` y asegúrate de que todo pasa. Los E2E (`pnpm test:e2e`) se escriben y ejecutan solo al cerrar cada fase, no en cada rama.
4. Toda funcionalidad lleva tests. Todo bug corregido lleva un test que lo reproduce.
5. Sigue Conventional Commits en inglés (`feat(cables): ...`).
6. Código en inglés y textos de la UI / documentación en español.
7. Respeta la arquitectura: lógica de negocio en `apps/web/src/server` y `packages/*`; los componentes cliente nunca acceden a la base de datos.
8. Valida siempre la entrada con Zod y comprueba sesión y rol en el servidor.
9. No añadas dependencias nuevas sin justificarlo.
10. No metas secretos en el código; usa `.env` y actualiza `.env.example`.
11. Al terminar una tarea, marca su casilla en `docs/PLAN.md`.

## Comandos (a partir de la fase 0)

En Windows PowerShell usa `pnpm.cmd` / `npm.cmd` si la política de ejecución bloquea los `.ps1`.

| Comando                | Acción                                         |
| ---------------------- | ---------------------------------------------- |
| `docker compose up -d` | Levanta Postgres + Mailpit                     |
| `pnpm dev`             | Arranca la app en http://localhost:3000        |
| `pnpm check`           | Lint + typecheck + tests unitarios/integración |
| `pnpm test:e2e`        | Tests E2E con Playwright                       |
| `pnpm db:migrate`      | Crea/aplica migraciones de Prisma              |
| `pnpm db:seed`         | Carga datos de ejemplo                         |
| `pnpm db:studio`       | Abre Prisma Studio                             |
