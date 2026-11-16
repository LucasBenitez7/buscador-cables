# Política de seguridad

## Cómo avisar de una vulnerabilidad

No abras un issue público. Avisa en privado desde la pestaña **Security → Report a
vulnerability** de este repositorio (GitHub Security Advisories):
<https://github.com/LucasBenitez7/buscador-cables/security/advisories/new>.

Indica qué has encontrado, cómo reproducirlo y qué podría hacer alguien con ello.

## Plazos de respuesta y divulgación

- Confirmamos que hemos recibido el aviso en un máximo de **7 días**.
- Te contamos si lo damos por bueno y cómo lo vamos a corregir en un máximo de **30 días**.
- Publicamos la vulnerabilidad (un aviso de seguridad en GitHub, con tu nombre si quieres)
  cuando la corrección esté en producción. Te pedimos que no la hagas pública antes.

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
| Fuzzing de los analizadores      | `packages/shared/src/parsers.fuzz.test.ts` (fast-check, en `pnpm check`)       |
| Códigos reales del cliente       | `packages/shared/src/invented-codes.test.ts`                                   |

Las medidas de la propia aplicación (sesiones, roles, CSP, límite de intentos, auditoría…)
están en `docs/ARQUITECTURA.md`, sección «Seguridad».
