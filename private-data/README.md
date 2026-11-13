# Datos privados del proyecto

Aquí van los documentos reales del cliente (PDFs con los cables, las bandejas y el estado del
proyecto) y los archivos intermedios que se extraen de ellos.

**Nada de esta carpeta se sube a git, salvo este README.** El repositorio es público: los
datos reales no pueden aparecer en el código, en los tests, en la documentación ni en los
mensajes de commit. Tampoco el nombre del cliente.

- Copia los PDFs en `private-data/source/`.
- La extracción deja los datos normalizados en `private-data/extracted/`.
- Los tests usan datos inventados en carpetas `__fixtures__`, nunca estos.

Comprueba que no se ha colado nada antes de hacer commit:

```bash
git status --ignored private-data
```
