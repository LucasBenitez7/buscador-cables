# Registro de revisiones

Revisiones de código hechas sobre el proyecto: qué se encontró, cómo se corrigió y qué queda
pendiente. Las entradas más recientes van arriba. Cada corrección tiene su propio commit
(Conventional Commits) y, si es un bug, un test que lo reproduce.

---

## 2026-11-10 — Fase 1 (rama `feat/f1-auth`)

**Alcance:** todo el trabajo de autenticación y usuarios, que estaba sin commitear, más la
configuración del repositorio (CI, dependencias, formato). Antes de corregir, el trabajo
existente se commiteó tal cual en tres commits (`shared`, `db` y `auth`) para que cada
corrección quede como un diff aislado.

### Bugs corregidos

| #   | Problema                                                                                                                                                                                                                                                                        | Corrección                                                                                                                                                                                                                                 | Test                                                    | Commit                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| 1   | **Bucle de redirección infinito.** El proxy mandaba `/login` → `/` si existía la cookie de sesión, y el layout protegido devolvía `/` → `/login` cuando la sesión estaba revocada (usuario desactivado, contraseña restablecida en otro equipo). El navegador quedaba en bucle. | El proxy ya no redirige `/login`; la página de login valida la sesión contra la base de datos. Además respeta `next` si el usuario ya ha iniciado sesión.                                                                                  | `proxy.test.ts`                                         | `fix(auth): stop redirect loop…`            |
| 2   | **Un usuario desactivado podía volver a iniciar sesión.** Better Auth no conoce el campo `active`: el login funcionaba y después el usuario rebotaba sin mensaje entre páginas.                                                                                                 | Hook `databaseHooks.session.create.before` → `assertAccountActive` rechaza con `403 ACCOUNT_DISABLED`. Solo se ejecuta tras verificar la contraseña, así que no revela si un correo existe. El login muestra "Tu cuenta está desactivada". | `server/auth-policy.test.ts`, `lib/auth-errors.test.ts` | `fix(auth): block sign-in for deactivated…` |
| 3   | **Inyección de HTML en los correos.** El nombre del usuario y el enlace se insertaban sin escapar en el HTML del correo de recuperación y de verificación.                                                                                                                      | `escapeHtml` en las plantillas.                                                                                                                                                                                                            | `lib/email-templates.test.ts`                           | `fix(auth): escape user data in email HTML` |
| 4   | **Correos que podían perderse en producción.** Se enviaban con `void sendEmail(...)`: en Vercel (serverless) la función puede congelarse al devolver la respuesta, antes de enviar el correo. Además el SMTP tenía `secure: false` fijo, incompatible con el puerto 465.        | Better Auth ejecuta el envío como tarea en segundo plano (`advanced.backgroundTasks`) a través de `after()` de Next.js. Se mantiene la mitigación de ataques por tiempos. `secure` se activa en el puerto 465.                             | Prueba manual (ver abajo)                               | `fix(auth): deliver auth emails reliably…`  |
| 5   | **El CI iba a fallar.** `lib/env.ts` exige `BETTER_AUTH_SECRET` (32+ caracteres), pero el workflow no lo definía: `pnpm build` y el servidor de los E2E no habrían arrancado.                                                                                                   | Secreto exclusivo de CI y `BETTER_AUTH_URL` en los jobs `check` y `e2e`.                                                                                                                                                                   | `pnpm build` local                                      | `fix(ci): provide BETTER_AUTH_SECRET…`      |
| 6   | **El selector de rol mostraba un rol falso.** Era un `<select>` no controlado: si el servidor rechazaba el cambio, seguía mostrando el rol rechazado.                                                                                                                           | Selector controlado que vuelve al rol real si la acción falla.                                                                                                                                                                             | `features/users/components/users-table.test.tsx`        | `fix(users): revert rejected role changes…` |
| 7   | **Altas simultáneas con el mismo correo** devolvían un error genérico (violación del índice único `P2002`).                                                                                                                                                                     | Se traduce a "Ya existe un usuario con ese correo".                                                                                                                                                                                        | `server/users/service.int.test.ts`                      | `fix(users): revert rejected role changes…` |
| 8   | **`/api/health` filtraba errores de la base de datos.** El endpoint es público y devolvía el `error.message` de la conexión (host, usuario, motivo). Encontrado al revisar la cobertura de `server/`.                                                                           | El detalle solo se registra en el log del servidor.                                                                                                                                                                                        | `server/health.test.ts`                                 | `fix(web): stop leaking database errors…`   |

### Mejoras y limpieza

- `perf(auth)`: `getCurrentUser` se envuelve en `cache()` de React. El layout y la página
  consultaban la sesión dos veces por petición.
- `chore(deps)`: se elimina `@better-auth/prisma-adapter` de `apps/web`. Ya viene como
  dependencia de `better-auth` en su misma versión, y el rango `^` podía desincronizarse.
- `chore(repo)`: `.prettierignore` ignora `.claude/settings.local.json`, un archivo local que
  git ya ignora pero que hacía fallar `pnpm format:check`.
- `style(web)`: se quitan los BOM UTF-8 de `proxy.ts` y `login/page.tsx` y se corrige un
  comentario obsoleto de `next.config.ts`.
- `.env.example` y `turbo.json` documentan `SMTP_USER` y `SMTP_PASSWORD`.

### Verificación

- `pnpm check` en verde tras las correcciones: 92 tests (shared 48, db 2, web 42). Tras el
  avance posterior (ver más abajo): 123 tests (shared 48, db 2, web 73).
- `pnpm build` correcto.
- Prueba manual contra `pnpm dev` (Postgres y Mailpit en Docker):
  - login de una cuenta desactivada → `403 ACCOUNT_DISABLED`;
  - contraseña incorrecta → `401` genérico, sin revelar nada;
  - cookie de sesión revocada en `/login` → `200`, sin bucle;
  - registro público → `403`;
  - "olvidé mi contraseña" → el correo llega a Mailpit y el nombre aparece escapado.

### Revisado y correcto (sin cambios)

- `prisma7.config.ts` es el nombre por defecto en Prisma 7.10, no un error.
- El paquete `cn` es el oficial de shadcn (sustituye a `clsx` + `tailwind-merge`).
- `safeNextPath` bloquea redirecciones abiertas (`//host`, `https://…`, `\`).
- Reglas de negocio de usuarios: nadie gestiona un rol igual o superior al suyo (salvo ADMIN),
  nadie cambia su propio rol ni se desactiva a sí mismo, y siempre queda un ADMIN activo.
- Al desactivar un usuario se borran sus sesiones en la misma transacción.

### Avance posterior a la revisión

- `feat(auth)`: **rate limiting en base de datos** (tabla `rateLimit`, migración
  `add_rate_limit_table`). En memoria, cada instancia serverless de Vercel tenía su propio
  contador y el límite apenas se aplicaba. Límites por IP y minuto: login 5, "olvidé mi
  contraseña" 3, restablecer contraseña 5. Comprobado con `next start`: el sexto login
  fallido devuelve `429` y otra IP no se ve afectada.
- `test(users)`: **tests de integración contra Postgres real.** Vitest de `apps/web` tiene
  ahora dos proyectos: `unit` (jsdom) e `integration` (Node, archivos `*.int.test.ts`, base
  `cables_test`, con salvaguarda que aborta si la base no es `cables_test`). Se comprobó que el
  test de altas simultáneas falla sin la corrección 7.
- `test(auth)`: tests de `server/session.ts` y `server/email.ts`. Cobertura de `server/`:
  **97 %** de líneas (antes ~9 % fuera de `server/users`).

> Nota para desarrollo local: tras aplicar una migración hay que **reiniciar `pnpm dev`**. El
> cliente de Prisma queda cacheado en `globalThis` y Better Auth falla con "Prisma schema
> mismatch" hasta reiniciar.

### Pendiente (no son bugs, son tareas abiertas)

- **Rama `main` sin la fase 0.** `dev` tiene la fase 0 mergeada, pero `main` sigue en el commit
  inicial y no existe el tag `v0.1.0`. Cerrar la fase requiere merge `dev` → `main` y tag, que
  solo se hacen con el visto bueno del usuario.
- **No hay remoto de git configurado**, así que el CI todavía no se ha ejecutado nunca.
- El correo de "olvidé mi contraseña" también se envía a cuentas desactivadas. No permite entrar
  (el bug 2 está corregido), así que se acepta.
- **Verificación de email** (casilla de la fase 1): el flujo está configurado, pero nunca se
  dispara, porque el admin crea las cuentas ya verificadas y con una contraseña temporal que
  él conoce. La propuesta es sustituirlo por una **invitación por correo**: el usuario fija su
  contraseña con un enlace de un solo uso, y eso verifica el correo. Es un cambio de diseño y
  queda pendiente de decisión.
- **E2E de la fase 1** (login, logout, recuperación): se escriben al cerrar la fase.
