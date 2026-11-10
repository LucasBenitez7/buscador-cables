-- Base de datos separada para los tests de integración y E2E.
CREATE DATABASE cables_test OWNER cables;

-- Extensiones necesarias (búsqueda tolerante a errores).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\c cables_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
