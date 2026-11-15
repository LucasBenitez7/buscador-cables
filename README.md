# Buscador de Cables

[![CI](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/LucasBenitez7/buscador-cables/actions/workflows/ci.yml)

Aplicación web para localizar y gestionar los cables de una planta industrial: búsqueda por
código KKS (ej. `99XAT10W2005`), filtros (ubicación, color, sección, longitud, estado...), ficha completa,
estado de instalación (enrollado / tendido), estado de conexión y trazabilidad por usuario.

## Documentación

- [Plan y fases](docs/PLAN.md)
- [Manual de usuario](docs/MANUAL-USUARIO.md)
- [Manual de despliegue](docs/DESPLIEGUE.md)
- [Arquitectura y modelo de datos](docs/ARQUITECTURA.md)
- [Datos reales del proyecto (extracción y carga)](docs/DATOS-PROYECTO.md)
- [Registro de revisiones](docs/REVISIONES.md)
- [Reglas de trabajo (ramas, commits, tests)](CONTRIBUTING.md)
- [Instrucciones para agentes de IA](AGENTS.md)

## Requisitos

- Node.js 22+ (probado con 24)
- pnpm 9+ (`corepack enable`)
- Docker Desktop
- GitHub CLI (`gh`) con sesión iniciada, para abrir los Pull Requests (desde la fase 4.5)

## Puesta en marcha en local

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

## Producción

Vercel (web) + Railway (PostgreSQL) + Cloudflare R2 (planos) + Resend (correo). Se despliega
desde `main`; todo el proceso, en el [manual de despliegue](docs/DESPLIEGUE.md).
