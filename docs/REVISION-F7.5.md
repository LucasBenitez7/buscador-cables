# Revisión antes de desplegar (fase 7.5 y repasos de interfaz)

Revisión hecha el 2026-11-15 sobre `dev` (commit `dcec100`). Cubre lo que entró después de la
revisión de las fases 0 a 7 (`docs/REVISION-F0-F7.md`): los repasos de estilos, catálogos e
inicio (PR #30 y #31) y la fase 7.5, planos y trabajo en campo (PR #32). Son 123 ficheros y
unas 6.600 líneas.

Rama de trabajo para las correcciones: **`fix/review-f7.5`**. Las reglas son las de
`AGENTS.md`: un test que reproduzca cada bug, `pnpm check` en verde y un solo PR a `dev`.

Este documento no repite ningún código real. Donde hace falta señalar uno, da el fichero y la
línea.

## Resumen

| Gravedad   | Cuántos | Qué son                                                                    |
| ---------- | ------: | -------------------------------------------------------------------------- |
| Alta       |       2 | Códigos reales del cliente en el repo público; los planos no se despliegan |
| Media      |       4 | Recarga no idempotente, coste de las teselas, conexiones, caché compartida |
| Baja       |       8 | Documentación, heurísticas de las marcas, detalles del visor               |
| Despliegue |       9 | Lo que falta decidir o montar antes de publicar la web                     |

Comprobaciones automáticas en el momento de la revisión:

- `pnpm check`: en verde, 743 tests (shared 241, db 30, web 395, data 77).
- `pnpm db:check`: las migraciones coinciden con el esquema.
- `pnpm audit`: el mismo aviso bajo de siempre (`deepmerge`, solo en el CLI de shadcn).
- Sin `dangerouslySetInnerHTML`, `any`, `@ts-ignore` ni `console.log` en el código nuevo. Hay
  un `innerHTML` en el visor con un SVG fijo (sin datos) y un `eslint-disable` justificado.

"Confirmado" significa que se reprodujo ejecutando código; "leído", que sale de leer el código.

## Resultado (2026-11-15)

Corregido en `fix/review-f7.5`, cada cosa con su test (y, si era un bug, comprobado primero
en rojo). El texto de cada hallazgo se deja como estaba; aquí va lo que se hizo.

Comprobaciones al cerrar: `pnpm check` en verde (759 tests: shared 244, db 32, web 403, data 80) y el visor probado en la app con los planos locales (teselas, 304, teclado).

**Decisiones del responsable:**

| Hallazgo | Decisión                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| A1       | Los commits antiguos se quedan como están: no se reescribe el historial. Se corrigen los ficheros y un test lo vigila. |
| A2       | El almacenamiento de las teselas se elige al desplegar (tarea en la fase 10). Ahora, solo el aviso al administrador.   |
| M4       | Teselas con `private, no-cache` y `ETag`: el navegador pregunta siempre.                                               |
| B3       | El timbrado se mantiene al desconectar, enrollar o mover el cable, como estaba.                                        |

**Qué se hizo:**

| Hallazgo | Corrección                                                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1       | Los ejemplos usan la unidad `99`. `packages/shared/src/invented-codes.test.ts` revisa todos los ficheros versionados y falla con cualquier código con forma KKS de otra unidad (comprobado contra el código anterior: los encuentra todos). Turborepo lo vuelve a ejecutar cuando cambia cualquier fichero del repo. |
| A2       | El inicio del administrador avisa de cuántas hojas cargadas no tienen imagen. Tarea en la fase 10 de `docs/PLAN.md`.                                                                                                                                                                                                 |
| M1       | Las marcas se comparan con las claves ordenadas (`stableJson` en `load.ts`). Test: dos cargas de una bandeja con `w` y `h` dan `updated: 0`.                                                                                                                                                                         |
| M2       | El descriptor de cada hoja comprueba la sesión y deja una cookie firmada de 10 minutos (`HttpOnly`, solo para `/api/drawings`, se borra al cerrar sesión); las teselas solo comprueban la firma. Abrir una hoja pasa de una consulta de sesión por tesela a una por hoja. `DRAWINGS_DIR` se resuelve una vez.        |
| M3       | `DATABASE_POOL_MAX` (5 por defecto) limita las conexiones de cada instancia; `.env.example` explica el pooler y la URL directa para migrar.                                                                                                                                                                          |
| M4       | `Cache-Control: private, no-cache` con `ETag`: 304 solo después de comprobar el acceso.                                                                                                                                                                                                                              |
| B1       | `pnpm data:load --dry-run` en `docs/DATOS-PROYECTO.md`.                                                                                                                                                                                                                                                              |
| B2       | La ficha ya dice de qué tipo es la marca («Bandera de la sección…», «Solo en la tabla…»). Falta la comprobación en campo por muestreo: es del responsable.                                                                                                                                                           |
| B4       | Fase 10: planos, conexiones, `noindex`, registro público, correo real, primer administrador y el paso `dev` → `main`.                                                                                                                                                                                                |
| B5       | `DRAWINGS_DIR` y `DATABASE_POOL_MAX` en `globalEnv`.                                                                                                                                                                                                                                                                 |
| B6       | Los números del recorrido en orden y «Aquí» al final. Test.                                                                                                                                                                                                                                                          |
| B7       | Con los formatos que se leen hoy no puede pasar (el plano solo lleva letras, cifras y guiones; la hoja, cifras). Aun así, la carga se queda con la primera hoja y avisa de la otra en lugar de fallar entera, y `data:render` dibuja esa misma.                                                                      |
| B8       | La flecha usa el token del fondo. El visor es `role="application"` con la ayuda de sus teclas: flechas, «+» y «−» (también en teclado español, que OpenSeadragon no entendía) y 0; girar (R) y voltear (F) desactivados; anillo de foco.                                                                             |

**Encontrado al corregir:**

- Al probar M2 en la app, todas las hojas respondían 500: envolver la petición de Next.js en
  otra `NextRequest` falla dentro de Next, y los tests usaban una `Request` normal. Los tests
  usan ya `NextRequest`.
- La ayuda del teclado decía «+ y −», pero OpenSeadragon solo acerca con las teclas `=` y `-`
  de un teclado inglés. Se añadió «+» y «−» por el carácter, no por la tecla.

---

## Gravedad alta

### A1 — Hay códigos reales del cliente en el repositorio público

- [x] Sustituidos por códigos inventados
- [x] Decidido qué se hace con el historial (decisión)

**Dónde** (11 líneas con un código completo, más tres con códigos cortos):

- `apps/web/src/app/(app)/locations/page.tsx:21-23` — texto de ayuda de la página.
- `apps/web/src/features/search/components/search-filters.tsx:201` — `placeholder` del filtro.
- `apps/web/src/features/search/components/search.test.tsx:151` y `162`.
- `apps/web/src/server/cables/search.int.test.ts:168`, `172` y `180`.
- `apps/web/src/server/locations/service.ts:298` — comentario.
- `packages/shared/src/search.ts:72` — comentario.
- `packages/data/src/parse/drawing-marks.ts:148` — comentario.
- `packages/data/src/extract/locate.test.ts:98`.
- `docs/DATOS-PROYECTO.md:222`.

**Problema:** la regla 11 de `AGENTS.md` dice que los datos reales nunca van en el código, los
tests, la documentación ni los commits, y que los ejemplos usan la unidad inventada `99`. En
la fase 7.5 se colaron como ejemplos el número de unidad real, un grupo de edificios, un
edificio, una sala, un equipo y dos bandejas. Están en `dev`, publicados en GitHub, en tres
commits (`1a5f7e6`, `3cbbead`, `056687b`).

Son códigos KKS, que por sí solos no nombran a la empresa. Pero alguien del proyecto los
reconoce a la primera, y son justo lo que la regla quería evitar.

**Comprobado (confirmado):** se cotejaron los ficheros del repo con los ~13.700 códigos de la
base local (cables, equipos, salas, KKS, bandejas, ubicaciones, planos y documentos). Solo
aparecen esos. No hay ningún código de cable, número de plano ni de documento real.

**Qué hacer:**

1. Sustituirlos por equivalentes con la unidad `99`, como en el resto del repo. Los tests
   tienen que seguir probando lo mismo.
2. Añadir un test que falle si un ejemplo no usa la unidad inventada: por ejemplo, que ningún
   fichero versionado contenga un código con forma KKS cuya unidad no sea `99`. Así no vuelve
   a pasar sin que nadie lo vea.
3. **El historial (decisión del responsable).** Corregir los ficheros no borra los commits
   anteriores. Quitarlos de verdad exige reescribir el historial y forzar el push, que el
   ruleset de `dev` prohíbe sin excepciones: habría que desactivarlo un momento. La otra
   opción es aceptar que quedan en el historial. No lo decidas por tu cuenta.

### A2 — Los planos no funcionan tal cual en el despliegue previsto

- [x] Decidido dónde se guardan las teselas (decisión)
- [ ] Implementado y probado (fase 10; de momento, el aviso al administrador)

**Dónde:** `apps/web/src/server/drawings/store.ts` (lee de disco con `readFile` y `stat`),
`packages/data/src/render/render-sheets.ts` (escribe en `private-data/drawings/`).

**Problema:** las teselas son ficheros en el disco de la máquina que ejecuta la app. El plan
dice Vercel + Railway, y en Vercel no hay disco propio: las teselas no pueden ir en git (son
del cliente) ni generarse en el build. Desplegado así, `hasDrawingImage` devuelve siempre
`false` y las fichas de bandeja y de cable salen sin plano, sin ningún error que lo avise.
`docs/ARQUITECTURA.md` ya dice que en producción hará falta un almacenamiento privado, pero
la tarea **no está en la lista de la fase 10** de `docs/PLAN.md`.

**Comprobado (leído).**

**Opciones:**

1. **Almacenamiento privado de objetos** (S3, R2 o similar), con la app como intermediaria
   para que las teselas sigan pidiendo sesión. `store.ts` es la única pieza que cambia, y
   `data:render` necesita un paso para subirlas.
2. **Servidor propio** (el `Dockerfile` previsto como alternativa) con un volumen para
   `DRAWINGS_DIR`. Más sencillo de código, pero cambia el plan de despliegue entero.

Sea cual sea: añadir la tarea a la fase 10, y un aviso visible para el administrador cuando
hay hojas cargadas pero ninguna imagen, en lugar del silencio actual.

---

## Gravedad media

### M1 — Volver a cargar los mismos datos reescribe casi todas las bandejas

- [x] Corregido

**Dónde:** `packages/data/src/load/load.ts:454` (`sameSheets` compara con `JSON.stringify`).

**Problema:** las marcas de cada bandeja se guardan en una columna `jsonb`, y Postgres
devuelve las claves en otro orden (`h, w, x, y, kind`) del que produce la extracción
(`x, y, w, h, kind`). La comparación de texto nunca coincide, así que cada carga borra y
vuelve a crear las hojas de todas las bandejas que tienen marcas con tamaño, y el resumen las
cuenta como "actualizadas" aunque no haya cambiado nada. Es el mismo problema de orden de
claves que ya salió en la fase 5 con el historial.

Los tests no lo ven porque sus marcas solo tienen `x`, `y` y `kind`, que casualmente
conservan el orden.

**Comprobado (confirmado):** `pnpm data:load --dry-run` sobre la base local, con los mismos
datos ya cargados, da cero cables y cero hojas cambiados pero marca como actualizadas todas
las bandejas con marcas.

**Qué hacer:** comparar las marcas campo a campo (o normalizar el orden de las claves antes
de comparar). Test: cargar dos veces una bandeja con una marca que tenga `w` y `h` y exigir
`trays.updated === 0`.

### M2 — Cada tesela del plano consulta la sesión en la base de datos

- [x] Corregido

**Dónde:** `apps/web/src/app/api/drawings/[...path]/route.ts:12` (`getCurrentUser`).

**Problema:** abrir un plano pide decenas de teselas, y cada una hace una consulta de sesión
y de usuario. En local no se nota. Desplegado, cada tesela es una invocación de función más
una ida y vuelta a la base: el plano tarda en pintarse y, con varios técnicos a la vez,
compite por las conexiones (ver M3). `store.ts` además vuelve a validar todo el entorno con
Zod en cada petición.

**Comprobado (leído).**

**Qué hacer:** validar la sesión una vez y firmar el acceso a las teselas de esa hoja (un
token corto en la URL o una cookie firmada de pocos minutos), o activar la caché de sesión
en cookie de Better Auth solo para esta ruta. Leer `DRAWINGS_DIR` una vez al cargar el
módulo. Medir antes y después cuántas consultas hace abrir una hoja.

### M3 — Sin límite de conexiones a la base para un despliegue sin servidor

- [x] Corregido

**Dónde:** `packages/db/src/client.ts` (`new PrismaPg({ connectionString })`).

**Problema:** cada instancia de la app abre su propio grupo de conexiones con el tamaño por
defecto. En un despliegue sin servidor hay muchas instancias a la vez y una base gestionada
pequeña tiene pocas decenas de conexiones: se agotan justo cuando más gente la usa, y M2 lo
empeora.

**Comprobado (leído).**

**Qué hacer:** fijar un máximo pequeño por instancia y usar el pooler de la base (PgBouncer o
el que dé el proveedor), con la URL directa solo para las migraciones. Documentarlo en
`.env.example`.

### M4 — Las teselas quedan una hora en la caché del navegador

- [x] Decidido (decisión)
- [x] Corregido

**Dónde:** `apps/web/src/app/api/drawings/[...path]/route.ts:22`
(`Cache-Control: private, max-age=3600`).

**Problema:** en una tableta compartida en planta, después de cerrar sesión las teselas ya
vistas siguen en la caché del navegador durante una hora y se sirven sin volver a preguntar
al servidor. No afecta a otros equipos, solo a quien use ese mismo navegador.

**Comprobado (leído).**

**Qué hacer:** `private, no-cache` con `ETag` (el navegador revalida y el servidor comprueba
la sesión antes de responder 304), o aceptar el riesgo si los dispositivos son personales.

---

## Gravedad baja

### B1 — El comando de prueba documentado no funciona

- [x] Corregido

**Dónde:** `docs/DATOS-PROYECTO.md` (sección "Carga").

Dice `pnpm data:load -- --dry-run`. pnpm pasa el `--` tal cual y el comando falla con
"Unexpected argument". Lo correcto es `pnpm data:load --dry-run`. El error es de la revisión
anterior. **Comprobado (confirmado).**

### B2 — Las marcas de las bandejas dependen de heurísticas sin validar en campo

- [ ] Validado por muestreo (pendiente del responsable)

**Dónde:** `packages/data/src/parse/drawing-marks.ts` (`sectionFlags`, `isInTable`) y
`packages/data/src/extract/extract.ts` (`locateTrays`).

Cualquier número de tres cifras, horizontal y lejos del marco cuenta como bandera de sección,
y una bandeja que solo sale en una tabla hereda la bandera de otra hoja del mismo plano. Una
cota o una referencia de tres cifras puede colarse como bandera. Una marca equivocada manda a
un técnico al sitio que no es. **Qué hacer:** antes de fiarse en campo, comprobar a mano una
muestra de bandejas de cada tipo de plano (por código dibujado y por bandera) y anotar el
resultado. Mostrar en la ficha de qué tipo es la marca ("por la bandera de su sección") para
que quien la usa sepa cuánto fiarse.

### B3 — El timbrado sobrevive a desconectar y enrollar el cable

- [x] Confirmado con el responsable (decisión)

**Dónde:** `packages/shared/src/cable-actions.ts` (comentario "Laying, coiling or moving does
not undo a timbrado").

Un cable timbrado OK, luego desconectado, enrollado y vuelto a tender sigue constando como
"Timbrado". Está hecho a propósito, pero conviene confirmarlo: si en la práctica se vuelve a
timbrar tras reconectar, el estado debería volver a "Sin timbrar" al desconectar.

### B4 — La fase 10 no lista el almacenamiento de los planos ni `main`

- [x] Corregido

`docs/PLAN.md`, fase 10: falta la tarea de A2. Además `main` va 138 commits por detrás de
`dev` (sigue en la fase 1) y la tabla de entornos dice que producción sale de `main`: el paso
`dev` → `main` no figura como tarea.

### B5 — `DRAWINGS_DIR` no está en `turbo.json`

- [x] Corregido

Las demás variables de entorno están en `globalEnv`. Sin ella, Turborepo puede servir de
caché un resultado hecho con otra ruta.

### B6 — Etiquetas "Aquí" mezcladas con números al ordenar

- [x] Corregido

**Dónde:** `apps/web/src/server/drawings/route-sheets.ts:103-105`. Cuando una bandeja fuera
del recorrido comparte marca con una del recorrido, las etiquetas se ordenan con `Number()` y
"Aquí" da `NaN`: el orden resultante depende del motor. Caso raro; basta ordenar los números
y poner el texto al final. Test.

### B7 — Dos planos distintos pueden compartir clave de imagen

- [x] Corregido

**Dónde:** `packages/data/src/render/render-sheets.ts:34` (`sheetKey`). Todo lo que no es
letra, número, `_` o `-` se convierte en `-`, así que `A.1` y `A-1` dan la misma clave y
`imageKey` es único en la base: la carga fallaría. Con los datos actuales no ocurre.
**Qué hacer:** detectar la colisión en la extracción y avisar.

### B8 — Detalles del visor

- [x] Corregido

**Dónde:** `apps/web/src/features/drawings/components/drawing-viewer.tsx`.

- Línea 87: `stroke="black"` fijo en el SVG de la flecha; el resto usa tokens del tema.
- El contenedor del plano es `role="img"` pero se mueve con el ratón y los dedos, y no con el
  teclado: solo los botones de acercar y alejar son accesibles. Añadir desplazamiento con las
  flechas o declararlo como aplicación.

---

## Antes de desplegar

No son fallos del código: es lo que falta decidir o montar. Varias cosas ya están en la fase
10 de `docs/PLAN.md`; se repiten aquí para tener la lista completa en un sitio.

**2026-11-15:** todas están ya como tareas de la fase 10 de `docs/PLAN.md`; se marcan allí.

- [ ] **Dónde viven los planos** (A2). Sin esto, la fase 7.5 no se ve en producción.
- [ ] **Registro público.** Con la web en internet, cualquiera puede pedir cuenta. No entra
      sin aprobación, pero el formulario envía correos a la dirección que se escriba (3 por
      minuto e IP). Si todos los usuarios son conocidos, lo más seguro es cerrar el registro y
      dar las altas desde el panel.
- [ ] **Que la web no salga en buscadores.** No hay `robots.txt` ni cabecera `noindex`: la
      página de login acabaría indexada.
- [ ] **Cabeceras de IP de confianza** para el límite de intentos, según el proxy real.
- [ ] **CSP completa**, incluido lo que necesita el visor de planos.
- [ ] **Conexiones a la base** (M3) y **migraciones en el despliegue**: la migración
      `add_cable_event_source` necesita que el usuario sea dueño de la tabla.
- [ ] **Correo real**: proveedor SMTP, remitente con dominio propio y comprobar que llegan los
      avisos de cuenta pendiente y de cuenta aprobada.
- [ ] **Primer administrador**: `pnpm db:seed` con `NODE_ENV=production` y credenciales
      propias (el seed rechaza las de ejemplo). Las cuentas que crea un administrador siguen
      con una contraseña temporal que él conoce y sin obligar a cambiarla.
- [ ] **Copias de seguridad, registro de errores y auditoría** de las acciones de
      administración, ya previstos en la fase 10.

---

## Revisado y correcto

- **Servir las teselas:** la ruta solo acepta dos formas (`<clave>.dzi` y
  `<clave>_files/<nivel>/<x>_<y>.webp`) con expresiones cerradas, así que no se puede salir de
  la carpeta de planos; pide sesión válida y responde 404 a lo demás. Tiene tests.
- **Páginas nuevas:** `/locations/[id]` y el inicio comprueban la sesión, y los cargadores que
  comparte `generateMetadata` pasan por `whenSignedIn`.
- **Inicio por rol:** lo que un rol no puede ver no se consulta.
- **Timbrado y "fuera del recorrido":** validados con Zod en el servidor; el permiso
  `cable:test` se comprueba en la acción y en el servicio; una bandeja fuera del recorrido
  solo se acepta con la confirmación explícita.
- **Tamaño de página:** solo se aceptan los tamaños que ofrece cada lista.
- **Filtro por equipo:** consulta parametrizada, comparación exacta.
- **Visor:** las etiquetas se escriben con `textContent`; el único `innerHTML` es un SVG fijo.
- **Migraciones:** aditivas y coinciden con el esquema.
- **Datos privados:** `private-data/` sigue fuera de git, incluidas las teselas.
