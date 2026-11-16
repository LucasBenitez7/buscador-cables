# Política de seguridad

## Cómo avisar de una vulnerabilidad

No abras un issue público. Avisa en privado desde la pestaña **Security → Report a
vulnerability** de este repositorio (GitHub Security Advisories). Indica qué has encontrado,
cómo reproducirlo y qué podría hacer alguien con ello. Responderemos en cuanto podamos.

## Qué cubre

- La aplicación web (`apps/web`) y sus paquetes (`packages/*`).
- La configuración de despliegue y del CI de este repositorio.

Los datos del proyecto no están en el repositorio (ver `AGENTS.md`, regla 11): ningún
informe debe incluir datos de la aplicación desplegada.

## Lo que ya vigila el CI

| Comprobación                     | Dónde                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Análisis estático (CodeQL)       | `.github/workflows/codeql.yml`                                                 |
| Secretos en todo el historial    | `.github/workflows/security.yml` (gitleaks)                                    |
| Vulnerabilidades en dependencias | `security.yml` (`pnpm audit`), revisión de dependencias en cada PR, Dependabot |
| Prácticas del repositorio        | `.github/workflows/scorecard.yml` (OpenSSF Scorecard)                          |
| Códigos reales del cliente       | `packages/shared/src/invented-codes.test.ts`                                   |

Las medidas de la propia aplicación (sesiones, roles, CSP, límite de intentos, auditoría…)
están en `docs/ARQUITECTURA.md`, sección «Seguridad».
