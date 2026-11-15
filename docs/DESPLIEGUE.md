# Manual de despliegue

Cómo poner en producción el Buscador de Cables y mantenerlo. Decidido en la fase 10
(2026-11-15):

| Pieza            | Servicio               | Por qué                                                             |
| ---------------- | ---------------------- | ------------------------------------------------------------------- |
| Web              | **Vercel**             | Next.js sin servidor que mantener; despliega solo desde `main`.     |
| Base de datos    | **Railway** (Postgres) | Postgres gestionado y barato.                                       |
| Planos (teselas) | **Cloudflare R2**      | Almacenamiento privado (API S3), 10 GB gratis, sin coste de salida. |
| Correo           | **Resend** (SMTP)      | Correos de confirmación, aprobación y contraseña.                   |
| Errores          | Logs de Vercel         | JSON por línea; Sentry, más adelante si hace falta.                 |

Las cuentas en estos servicios las crea el responsable del proyecto. Ninguna clave va en el
repositorio: todas van en las variables de entorno de cada servicio o en el `.env` local, que
git ignora.

> **Vercel Hobby es solo para uso no comercial.** Para la app de un cliente hace falta el plan
> Pro de Vercel. Railway funciona con el plan Hobby.

---

## 1. Antes de empezar

- `dev` en verde y llevado a `main` por PR (ver `CONTRIBUTING.md`). Producción sale de `main`.
- En local: los datos del cliente extraídos (`pnpm data:extract`) y los planos dibujados
  (`pnpm data:render`), todo en `private-data/`.
- Un dominio propio para la web y para el remitente de los correos (p. ej.
  `cables.ejemplo.com` y `no-reply@ejemplo.com`).

## 2. Base de datos (Railway)

1. En Railway: **New Project → Database → PostgreSQL**. Apunta su versión (Settings): las copias
   se hacen con un cliente de la misma versión.
2. En **Variables** de la base, copia `DATABASE_PUBLIC_URL`: es la URL del dueño de las tablas.
   La llamaremos **URL de migración**. Vercel no está en la red de Railway: siempre la pública.
3. Aplica las migraciones desde tu equipo (crea las tablas, el índice trigram y los triggers):

   ```bash
   DATABASE_URL="<URL de migración>" pnpm db:deploy
   ```

   En PowerShell: `$env:DATABASE_URL="<URL de migración>"; pnpm.cmd db:deploy`.

4. Crea el usuario con el que trabaja la app, **sin propiedad de las tablas ni `TRUNCATE`**: así
   no puede saltarse los triggers que protegen el historial. En la consola de datos de Railway
   (o con `psql "<URL de migración>"`), con una contraseña larga generada:

   ```sql
   CREATE ROLE cables_app LOGIN PASSWORD '<contraseña generada>';
   GRANT CONNECT ON DATABASE railway TO cables_app;
   GRANT USAGE ON SCHEMA public TO cables_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cables_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cables_app;
   -- Las tablas de migraciones futuras, igual:
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cables_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO cables_app;
   ```

   (`railway` y `postgres` son el nombre de la base y el usuario dueño que crea Railway; si
   cambian, usa los tuyos.) La **URL de la app** es la de migración con `cables_app` y su
   contraseña en lugar del usuario dueño.

## 3. Planos (Cloudflare R2)

1. En Cloudflare: **R2 → Create bucket**, por ejemplo `buscador-cables-planos`. Sin acceso
   público ni dominio: las teselas solo salen a través de la app, con sesión.
2. **R2 → Manage API tokens**: dos tokens limitados a ese bucket.
   - **Escritura** ("Object Read & Write"): para subir desde tu equipo. No sale de él.
   - **Lectura** ("Object Read only"): para la app en Vercel.
     Cada token da un _Access Key ID_ y un _Secret Access Key_. El endpoint es
     `https://<id de cuenta>.r2.cloudflarestorage.com`.
3. Sube las teselas (solo envía las hojas que cambiaron; el manifiesto va al final):

   ```bash
   DRAWINGS_S3_ENDPOINT="https://<id de cuenta>.r2.cloudflarestorage.com" \
   DRAWINGS_S3_BUCKET="buscador-cables-planos" \
   DRAWINGS_S3_ACCESS_KEY_ID="<id del token de escritura>" \
   DRAWINGS_S3_SECRET_ACCESS_KEY="<secreto del token de escritura>" \
   pnpm data:upload
   ```

   No dejes estas variables en tu `.env`: con ellas, también la app local leería del bucket.

## 4. Correo (Resend)

1. Crea la cuenta y **verifica el dominio** del remitente (registros DNS que indica Resend).
2. Crea una **API key** con permiso solo de envío.
3. SMTP: servidor `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña la API key.

## 5. Web (Vercel)

1. **Add New → Project** e importa el repositorio de GitHub.
2. **Root Directory: `apps/web`** (el resto lo dice `apps/web/vercel.json`: instala y compila
   desde la raíz del monorepo y aplica las migraciones antes de compilar).
3. **Settings → Git → Production Branch: `main`.**
4. **Settings → Environment Variables**, entorno _Production_:

   | Variable                        | Valor                                                |
   | ------------------------------- | ---------------------------------------------------- |
   | `DATABASE_URL`                  | URL de la app (`cables_app`)                         |
   | `DATABASE_URL_MIGRATE`          | URL de migración (dueño): solo la usa el build       |
   | `DATABASE_POOL_MAX`             | `3`                                                  |
   | `APP_URL`, `BETTER_AUTH_URL`    | `https://<tu dominio>`                               |
   | `BETTER_AUTH_SECRET`            | Nuevo, de 32+ caracteres (comando en `.env.example`) |
   | `CRON_SECRET`                   | Nuevo, de 32+ caracteres                             |
   | `AUTH_IP_HEADERS`               | `x-real-ip`                                          |
   | `SMTP_HOST`, `SMTP_PORT`        | `smtp.resend.com`, `465`                             |
   | `SMTP_USER`, `SMTP_PASSWORD`    | `resend`, la API key                                 |
   | `EMAIL_FROM`                    | `Buscador de Cables <no-reply@tu-dominio>`           |
   | `DRAWINGS_S3_ENDPOINT`          | `https://<id de cuenta>.r2.cloudflarestorage.com`    |
   | `DRAWINGS_S3_BUCKET`            | El bucket                                            |
   | `DRAWINGS_S3_ACCESS_KEY_ID`     | Del token de **lectura**                             |
   | `DRAWINGS_S3_SECRET_ACCESS_KEY` | Del token de **lectura**                             |

   `NODE_ENV` lo pone Vercel. Los secretos, nuevos: nunca los de local ni los de CI.

5. **Settings → Domains**: añade el dominio y crea el registro DNS que indique Vercel.
6. Despliega `main` (**Deployments → Redeploy**, o con el siguiente merge a `main`).
7. Los despliegues de otras ramas (Preview) fallan en las migraciones mientras no tengan su
   propia base: es lo esperado. Para un entorno de pruebas, crea otra base en Railway y pon
   sus variables en el entorno _Preview_.

## 6. Primer administrador y datos

1. Primer administrador, desde tu equipo y contra la URL de migración. Con
   `NODE_ENV=production` el seed solo crea el administrador (sin datos de ejemplo) y se niega a
   usar el correo o la contraseña de ejemplo de `.env.example`:

   ```bash
   NODE_ENV=production DATABASE_URL="<URL de migración>" \
   SEED_ADMIN_EMAIL="<tu correo>" SEED_ADMIN_PASSWORD="<contraseña larga>" SEED_ADMIN_NAME="<tu nombre>" \
   pnpm db:seed
   ```

2. Datos reales (cables, bandejas, recorridos y hojas de los planos). Primero en seco, para ver
   el resumen y los avisos sin escribir nada:

   ```bash
   DATABASE_URL="<URL de migración>" pnpm data:load --dry-run --as <correo del administrador>
   DATABASE_URL="<URL de migración>" pnpm data:load --as <correo del administrador>
   ```

## 7. Comprobar

- `https://<dominio>/api/health` responde `ok`.
- Entrar con el administrador; el inicio no avisa de hojas de planos sin imagen.
- Abrir una bandeja con plano: el plano se ve y se mueve.
- Pedir una cuenta desde otro correo: llega la confirmación, llega el aviso al administrador,
  aprobarla con un rol y que llegue el correo de cuenta aprobada.
- Vercel → **Settings → Cron Jobs**: `/api/cron/cleanup` aparece; ejecútalo una vez a mano y
  mira su línea en los logs.
- `https://<dominio>/robots.txt` prohíbe todo.

## 8. Día a día

**Publicar cambios.** `feat/*` → PR a `dev` → PR de `dev` a `main`. Vercel despliega `main`
solo, aplicando antes las migraciones nuevas. Si algo sale mal, **Deployments → Instant
Rollback** vuelve a la versión anterior (las migraciones del proyecto son aditivas: la versión
anterior funciona con la base nueva).

**Planos nuevos o revisados.** Sustituye el PDF en `private-data/source/` y repite
`pnpm data:extract` → `pnpm data:render` → `pnpm data:upload` → `pnpm data:load` (este último
contra la URL de migración). La app ve las hojas nuevas en menos de un minuto.

**Errores.** Vercel → **Logs**, filtrando por nivel `error`. Cada línea es un JSON con `scope`
(qué parte: `request`, `email`, `drawings`, `cron`…), el mensaje y la ruta (sin la query, que
puede llevar datos del cliente). Si hace falta más (avisos por correo, trazas agrupadas), se
añade Sentry.

**Limpieza.** Cada día a las 04:00 UTC Vercel Cron borra los tokens de correo caducados, las
sesiones caducadas y los contadores de intentos de más de un día.

## 9. Copias de seguridad

Si el plan de Railway incluye copias automáticas de la base, actívalas. Además, una copia
manual antes de cada carga de datos y cada semana, guardada fuera del repositorio (lleva datos
del cliente) y cifrada si sale de tu equipo. Con Docker, usando **la misma versión mayor que la
base** (`postgres:16-alpine` si Railway tiene la 16):

```bash
docker run --rm postgres:16-alpine pg_dump "<URL de migración>" --format=custom --no-owner > cables-AAAA-MM-DD.dump
```

**Restaurar** en una base vacía (nueva en Railway, o local para comprobar la copia):

```bash
docker run --rm -i postgres:16-alpine pg_restore --no-owner --dbname "<URL de la base vacía>" < cables-AAAA-MM-DD.dump
```

Después, crea otra vez el usuario `cables_app` (paso 2.4) y cambia las URL en Vercel.

Probado el 2026-11-15 con la base local: copia y restauración dan los mismos recuentos de
cables, bandejas, historial, usuarios y migraciones, con los triggers de inmutabilidad en su
sitio.

Las teselas no necesitan copia aparte: se regeneran desde los PDF con `pnpm data:render`.
