<div align="center">

<img src="apps/web/public/brand/logo.svg" alt="" width="96" height="96">

# Buscador de Cables

**Cada cable de la planta: dónde está, por dónde va y en qué estado.**

Aplicación web para localizar, seguir y registrar el trabajo con los cables de una planta
industrial, con sus bandejas y los planos de recorrido.

[![CI](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml)
[![CodeQL](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/codeql.yml)
[![Seguridad](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/security.yml/badge.svg?branch=dev)](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/LucasBenitez7/buscador-cables/badge)](https://scorecard.dev/viewer/?uri=github.com/LucasBenitez7/buscador-cables)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)

</div>

---

## Qué hace

|                         |                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔎 **Buscador**         | Por código, equipo o descripción, tolerante a guiones y mayúsculas, con filtros por ubicación, tipo, sección, longitud, estado, nivel, equipo y bandeja. |
| 🧾 **Ficha del cable**  | Origen y destino, datos técnicos, recorrido por bandejas y el historial completo de quién hizo qué y cuándo.                                             |
| 🗺️ **Planos**           | Cada hoja en teselas con zoom (también con dos dedos o teclado), la bandeja marcada y el recorrido del cable numerado sobre el plano.                    |
| 🛠️ **Trabajo en campo** | Tender (también a medias, indicando dónde quedó la punta), enrollar, mover, conectar, desconectar y timbrar, desde el móvil.                             |
| 👥 **Roles y cuentas**  | Consulta, Técnico, Supervisor y Administrador. Registro con aprobación eligiendo el rol, avisos por correo y auditoría de cuentas inmutable.             |
| 📈 **Inicio por rol**   | Avance de la obra, actividad propia o del equipo y lo pendiente de aprobar.                                                                              |

## Stack

| Capa          | Tecnología                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Web           | [Next.js](https://nextjs.org) 16 (App Router, Server Actions), React 19, Tailwind CSS 4, shadcn/ui        |
| Datos         | PostgreSQL + [Prisma](https://www.prisma.io) 7, búsqueda con `pg_trgm`                                    |
| Autenticación | [Better Auth](https://www.better-auth.com): sesiones, verificación de correo, límite de intentos          |
| Planos        | pdf.js + sharp (teselas Deep Zoom) y [OpenSeadragon](https://openseadragon.github.io)                     |
| Validación    | [Zod](https://zod.dev), compartido entre cliente, servidor y carga de datos                               |
| Tests         | Vitest + Testing Library (unitarios e integración contra Postgres) y Playwright (E2E, escritorio y móvil) |
| Producción    | Vercel · Railway (PostgreSQL) · Cloudflare R2 (planos) · Resend (correo)                                  |

## Estructura

```text
apps/
  web/            Aplicación Next.js (páginas, acciones y servicios del servidor)
packages/
  db/             Esquema de Prisma, migraciones y seed
  shared/         Tipos, validación (Zod), roles y reglas de negocio compartidas
  data/           Extracción de los PDF del proyecto, teselas de los planos y carga
  config/         ESLint y TypeScript comunes
docs/             Plan, arquitectura, manuales y registro de revisiones
```

La lógica de negocio vive en `apps/web/src/server` y en `packages/*`; los componentes de
cliente nunca acceden a la base de datos. Detalle en [ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Empezar en local

Requisitos: **Node.js 24** (mínimo 22), **pnpm** (`corepack enable`) y **Docker**.

```bash
cp .env.example .env      # y define BETTER_AUTH_SECRET (comando en el propio fichero)
pnpm install
docker compose up -d      # PostgreSQL + Mailpit
pnpm db:migrate
pnpm db:seed              # administrador y ~4.500 cables de ejemplo inventados
pnpm dev
```

- Aplicación: <http://localhost:3000> (usuario del seed en `.env.example`)
- Correos de prueba (Mailpit): <http://localhost:8025>

## Comandos

| Comando                                                           | Qué hace                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                                        | Arranca la aplicación                                                                                              |
| `pnpm check`                                                      | Formato, lint, tipos y tests unitarios y de integración                                                            |
| `pnpm test:e2e`                                                   | Tests E2E con Playwright                                                                                           |
| `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:studio`             | Base de datos                                                                                                      |
| `pnpm data:extract` → `data:render` → `data:upload` → `data:load` | Datos reales del proyecto: leer los PDF, dibujar los planos, subirlos y cargarlos ([guía](docs/DATOS-PROYECTO.md)) |

## Calidad y seguridad

- **Cada PR a `dev`** pasa formato, lint, tipos, más de 800 tests con umbral de cobertura,
  E2E en escritorio y móvil, Conventional Commits, CodeQL, revisión de dependencias,
  búsqueda de secretos en todo el historial y `pnpm audit`.
- **En la aplicación:** validación con Zod y comprobación de sesión y rol en el servidor, CSP
  con nonce por petición, límite de intentos por IP y por cuenta, cuentas con aprobación,
  historial y auditoría inmutables por trigger, planos servidos solo con sesión.
- **Datos del cliente:** nunca en el repositorio. Los tests y el seed usan datos inventados,
  y un test falla si aparece un código con forma real.
- Cómo avisar de una vulnerabilidad: [SECURITY.md](SECURITY.md).

## Documentación

|                                              |                                                         |
| -------------------------------------------- | ------------------------------------------------------- |
| [Manual de usuario](docs/MANUAL-USUARIO.md)  | Cómo se usa la aplicación, rol por rol                  |
| [Manual de despliegue](docs/DESPLIEGUE.md)   | Producción paso a paso, copias de seguridad y día a día |
| [Arquitectura](docs/ARQUITECTURA.md)         | Modelo de datos, seguridad, correos y avisos            |
| [Datos del proyecto](docs/DATOS-PROYECTO.md) | Extracción de los PDF y carga                           |
| [Plan](docs/PLAN.md)                         | Fases del proyecto y su estado                          |
| [Revisiones](docs/REVISIONES.md)             | Revisiones de código y lo que queda pendiente           |
| [Cómo contribuir](CONTRIBUTING.md)           | Ramas, commits, PR y tests                              |

## Contribuir

Ramas `feat/*`, `fix/*`, `chore/*` o `docs/*` desde `dev`, commits en
[Conventional Commits](https://www.conventionalcommits.org/es/) y Pull Request a `dev` con el
CI en verde. `main` es producción: recibe `dev` por PR. Todo en
[CONTRIBUTING.md](CONTRIBUTING.md).
