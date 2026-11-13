# Buscador de Cables

[![CI](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml)

Aplicación web para localizar y gestionar los cables de una planta industrial: búsqueda por
código KKS (ej. `99XAT10W2005`), filtros (ubicación, color, sección, longitud, estado...), ficha completa,
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
- GitHub CLI (`gh`) con sesión iniciada, para abrir los Pull Requests (desde la fase 4.5)

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
