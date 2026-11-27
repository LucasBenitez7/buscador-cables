# Datos privados del proyecto

Aquí van los documentos reales del cliente (PDFs con los cables, las bandejas y el estado del
proyecto) y los archivos intermedios que se extraen de ellos.

**Nada de esta carpeta se sube a git, salvo este README.** El repositorio es público: los
datos reales no pueden aparecer en el código, en los tests, en la documentación ni en los
mensajes de commit. Tampoco el nombre del cliente.

- `source/`: solo los PDFs vigentes que leen los comandos (listados y plano de recorridos).
  En `source/redmarks/`, los planos escaneados con las red marks de calidad, uno por plano y
  con su número al principio del nombre.
  `pnpm data:extract` lee todos los PDF de aquí: no dejes versiones viejas ni otros PDF.
- `extracted/`: lo que deja la extracción (datos normalizados e informe).
- `drawings/`: las teselas de los planos y las hojas de cada cable (`pnpm data:render`).
- `excel/`: los Excel del día más recientes y otros Excel de consulta.
- `nuevos/`: documentos recibidos que todavía no usa la web.
- `archivo/`: versiones anteriores de los PDF, de los Excel y de las extracciones, con su fecha.
- Los tests usan datos inventados en carpetas `__fixtures__`, nunca estos.

Comprueba que no se ha colado nada antes de hacer commit:

```bash
git status --ignored private-data
```
