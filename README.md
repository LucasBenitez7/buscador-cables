# Buscador de Cables

Aplicación web para localizar y gestionar los cables de una planta industrial: búsqueda por
código (ej. `SH-50`), filtros (ubicación, color, sección, longitud, estado...), ficha completa,
estado de instalación (enrollado / tendido), estado de conexión y trazabilidad por usuario.

## Documentación

- [Plan y fases](docs/PLAN.md)
- [Arquitectura y modelo de datos](docs/ARQUITECTURA.md)
- [Reglas de trabajo (ramas, commits, tests)](CONTRIBUTING.md)
- [Instrucciones para agentes de IA](AGENTS.md)

## Requisitos

- Node.js 22+ (probado con 24)
- pnpm 9+ (`corepack enable`)
- Docker Desktop

## Puesta en marcha (disponible tras la fase 0)

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- App: http://localhost:3000
- Mailpit (emails de prueba): http://localhost:8025
