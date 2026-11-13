# Datos reales del proyecto (fase 7)

Análisis de los tres PDFs del proyecto real, hecho el 2026-11-13 al empezar la fase 7.

> **Confidencialidad.** Este documento describe la _forma_ de los datos, nunca los datos.
> Todos los códigos de ejemplo son **inventados** (unidad `99`, edificios `UXA`, `UXB`…).
> Los PDFs y lo que se extrae de ellos viven en `private-data/`, que git ignora. No se
> nombra al cliente, a la planta ni a las empresas que firman los documentos.

## Las tres fuentes

| PDF                        | Contenido                                                                                              | Tamaño aproximado           |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| Listado de instrumentación | Cables **L1** (instrumentación, < 60 V). Una página por cable.                                         | ~2.700 págs., ~2.600 cables |
| Listado eléctrico          | Cables **L2** (BT fuerza y control), **L3** (BT unipolares) y **L4** (MT 10 kV). Una página por cable. | ~1.900 págs., ~1.860 cables |
| Planos de recorrido        | Planos de bandejas, tubos (conduits) y canalizaciones enterradas, con el código de cada tramo.         | ~110 planos A0/A1           |

Cada listado es la unión de varios sub-listados (uno por sistema o zona de la planta), cada uno
con su código de documento, su revisión y su índice. Hay páginas de portada, registro de
cambios e índice entre medias, que la extracción salta. En total: **~4.460 cables distintos y
~400 km de cable**.

Ningún PDF trae el estado en campo (tendido, conectado…): son documentos de ingeniería (lo que
_debería_ haber). El estado real lo registra la app con las acciones de la fase 5.

### Ficha de un cable de instrumentación (L1)

| Campo del PDF                  | Ejemplo inventado                    | Notas                                                |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------- |
| `CABLE ID`                     | `99XAB10A1-W8001`                    | Código del cable (KKS). Único.                       |
| Segunda línea del ID           | `99 CBLM-0001`                       | Número de marcado alternativo; solo en ~1 de cada 5. |
| `LOOP`                         | (casi siempre vacío)                 |                                                      |
| `REV.`                         | `02`                                 | Revisión del cable dentro del listado.               |
| `LEVEL`                        | `1`                                  | Siempre 1 en este listado.                           |
| `LENGTH (m)`                   | `137`                                | Metros, entero (alguno con decimal).                 |
| `CABLE TYPE`                   | `JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm`   | Texto libre; ~65 tipos distintos.                    |
| `DIAGRAM`                      | `XXX-DIA-0100_010`                   | Esquema donde aparece el cable.                      |
| `FROM` / `TO` → `Equipment ID` | `99XAB10CF002` → `99CJP11`           | Equipo de origen y de destino (KKS).                 |
| `FROM` / `TO` → `Gland`        | `M-20ARM`                            | Prensaestopas.                                       |
| `FROM` / `TO` → `Location`     | `99UXB16RA001`                       | Sala/local (KKS de edificio + sala). A veces `---`.  |
| `ROUTING`                      | `FIELD_TRAY`, bandejas…, `ROOM_TRAY` | Lista **ordenada** de bandejas por las que pasa.     |
| `INTERCONNECTION`              | hilo, color, regletero y borna       | De cada extremo. No se carga (ver propuesta).        |
| `Observations`                 | `Supplied by <proveedor>`            | Texto libre; en ~15 % de los cables.                 |

Casi la mitad de los cables L1 **no tienen bandejas** en el recorrido: son latiguillos o cables
locales (mismo equipo o misma sala en los dos extremos), de suministro externo (`NOTE 1`,
`INSIDE_CABINET`) o pendientes (`PENDING`).

### Ficha de un cable eléctrico (L2, L3, L4)

| Campo del PDF                      | Ejemplo inventado                       | Notas                                              |
| ---------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `CABLE ID`                         | `99XAT10W2005`                          | Código del cable (KKS). Único.                     |
| Segunda línea del ID               | `99 CBLC-0001`                          | Número alternativo; en ~1 de cada 4.               |
| `R.`                               | `3`, `2_RX00`, `03_RX01`                | Revisión.                                          |
| `SERVICE`                          | `MOTOR FEEDER FOR 99XAB10AP001`         | Para qué sirve el cable (puede ocupar dos líneas). |
| `SERVICE LEVEL`                    | `L2`, `L3`, `L4` (y `S2` en unos pocos) | Nivel de tensión.                                  |
| `LENGTH`                           | `142 m`, `85 m (PEND.)`                 | Algunas longitudes están pendientes.               |
| `CABLE TYPE`                       | `C0802` + `0,6/1 KV 8X2.5 MM2 CU`       | Código de tipo y descripción; ~65 tipos distintos. |
| `NUM. OF CIRCT.`                   | `1`, `1 de 2`                           | Circuitos con varios cables en paralelo.           |
| `CAB. PER CIRCT.`                  | `1`, `3`, `4`                           |                                                    |
| `COMPOSITION`                      | `CONTROL`, `3PH+N+PE`, `DC`             |                                                    |
| `FROM` / `TO` → `Equipment ID`     | `99XAT10GS600` → `99XAY10`              | Equipo de origen y de destino.                     |
| `FROM` / `TO` → `Cubicle`          | `GCB`                                   | Celda o cubículo del cuadro.                       |
| `FROM` / `TO` → `Function KKS`     | `=99XBA00GS101`                         |                                                    |
| `FROM` / `TO` → `Installation KKS` | `+99XBA01`                              | Dónde está instalado el equipo.                    |
| `ROUT`                             | bandejas, tubos y canalizaciones        | Lista **ordenada**; hasta ~45 tramos.              |
| `INTERCONNECTION`, `JUMPERS`       | hilo, bloque y punto de cada extremo    | No se carga (ver propuesta).                       |
| `Observations`                     | `Shields … connected to earthing …`     | En ~1 de cada 3 cables.                            |

En el recorrido aparecen, además de códigos de bandeja, marcas del fabricante
(`<PROVEEDOR>_TRAY_3`), `CONTIGUOUS PANEL` o `TRAM. VERTICAL`. Se guardan como pasos de
texto, sin bandeja asociada.

### Código de una bandeja (planos de recorrido)

Mismo esquema en los planos de instrumentación y en los eléctricos:

```
99  UXA  00  L  2  2  036
│   │    │   │  │  │  └─ número de orden (3-4 dígitos)
│   │    │   │  │  └──── cota/nivel de la bandeja dentro de su tensión (0-3)
│   │    │   │  └─────── nivel de tensión del cable: 1 instr., 2 BT, 3 BT unipolar, 4 MT
│   │    │   └────────── tipo: L escalera, W rejilla, S especial, C tubo (conduit), D canalización, T (sin definir en la leyenda)
│   │    └────────────── subzona (`00`, `01`, `09`, `_2`…)
│   └─────────────────── área/edificio (KKS)
└─────────────────────── unidad de la planta
```

- Los planos eléctricos dan, junto al código, el **tamaño**: `L600100300` = escalera de 600 mm
  de ancho, ala de 100 mm y radio de curvatura de 300 mm; `C025` = tubo de 25 mm; `D160` =
  canalización enterrada de 160 mm.
- Los planos de instrumentación dan el ancho y la cota (`U 600`, `U 5200`), pero el texto sale
  mezclado y no es fiable sin revisar el plano.
- Cada plano tiene número, hoja, área y cotas o planta (p. ej. "área 2.1, de la cota A a la cota B"). Una bandeja aparece en 1 a 8 hojas.

## Resultado del prototipo de extracción

Prototipo hecho el 2026-11-13 (fuera del repo) leyendo el texto con posiciones de cada página:
tarda ~1 minuto para las ~4.600 páginas. La extracción definitiva está en la sección siguiente.

- Todos los cables tienen código, longitud, tipo, nivel y extremos. El código de la cabecera
  coincide siempre con el del pie de página (sirve de comprobación).
- **~2.500 bandejas distintas** en los recorridos; el **~89 %** aparece en los planos. El resto
  son tramos que el plano no nombra igual o que no tienen plano en este paquete.
- **Duplicados**: una docena de cables aparecen dos veces en el mismo listado con datos
  idénticos, y uno aparece en dos sub-listados con distinta revisión. La carga se queda con la
  revisión más alta y lo anota en el informe.
- Unos pocos cables eléctricos no tienen recorrido, y una treintena tienen la longitud
  pendiente (`PEND.`).

## Extracción: `pnpm data:extract`

Paquete `packages/data`, en TypeScript con `pdfjs-dist` (lee el texto de cada página con su
posición; no dibuja nada).

1. Copia los PDFs en `private-data/source/` (con cualquier nombre).
2. Ejecuta `pnpm data:extract`. Cada página se reconoce por su contenido: ficha de
   instrumentación, ficha eléctrica, hoja de plano o nada (portadas, índices, registro de
   cambios). El orden y el nombre de los ficheros dan igual.
3. Revisa `private-data/extracted/report.md`.

Deja en `private-data/extracted/`:

| Fichero       | Contenido                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------ |
| `cables.json` | Un cable por código, validado con Zod (`projectCableSchema`): datos, extremos y recorrido. |
| `trays.json`  | Bandejas de los planos y de los recorridos, con tipo, tamaño y hojas de plano.             |
| `report.json` | Estadísticas y todos los avisos y errores, con fichero, página y código.                   |
| `report.md`   | El mismo informe, legible.                                                                 |

Reglas de la extracción:

- El código de la cabecera tiene que coincidir con el del pie de página; si no, la ficha se
  descarta (error).
- Nivel `S2`/`L2S` → `L2` (aviso). Longitud `0` o vacía → sin longitud (aviso); `(PEND.)` →
  longitud pendiente.
- Un cable repetido se queda con la revisión más alta (`3_RX00` > `3` > `2_RX01`), con aviso.
- Recorrido: `FIELD_TRAY` y `ROOM_TRAY` no son pasos, marcan el tramo de los siguientes. Un
  código de bandeja con una nota (`… (S)`) cuenta como bandeja. Lo demás se guarda como texto;
  si parece una bandeja mal escrita, con aviso.
- Bandejas: el tamaño que más se repite en los planos (aviso si hay varios); el título de la
  hoja sale del índice de cada plano; las bandejas que solo están en recorridos se crean sin
  plano (aviso con el total).
- Conductores, sección y tensión salen del texto del tipo con `parseCableSpec`.

Resultado con los PDFs reales (2026-11-13): ~4.460 cables, ~3.000 bandejas, ~37.000 tramos
de recorrido, 0 errores y ~50 avisos, en menos de un minuto y medio.

Los tests no usan los PDFs reales: generan en memoria PDFs inventados con la misma maquetación
(`packages/data/src/testing`).

## Carga: `pnpm data:load`

Lee `private-data/extracted/cables.json` y `trays.json` y los escribe en la base de datos de
`DATABASE_URL`. Hay que indicar quién firma la carga (`--as <correo>`; por defecto
`SEED_ADMIN_EMAIL`): tiene que ser una cuenta activa de supervisor o administrador. Se ejecuta
en local o en el entorno del cliente, nunca en CI.

Antes de escribir enseña a qué base va (nombre y servidor, sin contraseña) y se niega a cargar
en las bases de tests (`cables_test`, `cables_e2e`). Con `--dry-run` hace la carga entera
dentro de una transacción y la deshace: sirve para ver el resumen y los avisos sin cambiar
nada.

```bash
pnpm data:load -- --dry-run
```

- **Idempotente**: crea o actualiza por código. Repetirla con los mismos listados no cambia
  nada; con una revisión nueva, solo cambia lo que cambió.
- **Ubicaciones**: Planta (`99`) → grupo de edificios (`99UX`) → edificio (`99UXA`) → sala
  (`99UXA16RA001`), con el código como nombre (se pueden renombrar en "Ubicaciones": la carga
  no vuelve a cambiar los nombres). Si un código ya existe en otro sitio del árbol, no se usa y
  se avisa.
- **Cables nuevos**: entran _sin revisar_, con el evento de alta firmado por quien carga.
- **Cables que ya existen**: se actualizan solo los datos de ingeniería (los del listado), con
  un evento de edición. **Nunca** se tocan estado, conexión, ubicación física, punta suelta,
  notas ni "último movimiento". Los dados de baja no se tocan.
- **Lo corregido a mano en la app manda sobre el listado.** Si el último cambio de un campo
  (descripción, tipo, conductores, sección, tensión, longitud, origen o destino) lo hizo una
  persona desde el formulario de edición, la carga no lo sustituye y lo dice en los avisos:
  "Longitud (m) corregido en la app (150); el listado dice 142. No se cambia.". Tampoco quita
  la sala que alguien asignó a un extremo que el listado deja sin sala. Los eventos llevan su
  origen (`CableEvent.source`), así que una carga posterior que sí cambie el campo lo recupera.
- **Punta suelta fuera del recorrido**: si una revisión cambia el recorrido de un cable
  tendido a medias y la bandeja donde espera la punta ya no está en él, se avisa para
  revisarlo en campo. Lo registrado no se toca.
- **Tipos de cable**: se emparejan por nombre sin distinguir mayúsculas ni espacios repetidos
  y, si el tipo se renombró en "Catálogos", por su código. Renombrar un tipo no lo duplica.
  Un tipo sin código (instrumentación) que se renombre sí se crea de nuevo en la carga
  siguiente: el listado no da nada más con que reconocerlo.
- **Bandejas de un recorrido que no están cargadas**: el tramo se guarda con su texto, sin
  enlace, y se avisa.
- **Cables que ya no están en los listados**: se avisa, no se borran.
- Bandejas: se actualizan tipo, niveles, edificio, tamaño y hojas de plano; sus notas no.

## Dónde se ve en la app

- **Ficha del cable**: extremos (equipo, cubículo o prensaestopas, KKS, sala) y recorrido
  tramo a tramo. En un cable tendido a medias se ve lo tendido, la bandeja donde espera la punta
  suelta y lo que falta.
- **Buscador**: por código, equipo o nº alternativo; filtros de nivel, bandeja y "solo con la
  punta suelta".
- **Bandejas** (`/trays`): listado y ficha de cada bandeja, con sus planos, los cables que
  pasan y los que esperan en ella.

## Comparación con el modelo actual

| Concepto real                                                  | Modelo actual                              | Qué hace falta                                       |
| -------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| Código KKS del cable                                           | `Cable.code` (normalizado)                 | Nada: `normalizeCableCode` no altera los KKS.        |
| Servicio                                                       | `Cable.description`                        | Nada.                                                |
| Longitud                                                       | `Cable.lengthM`                            | Marcar "pendiente".                                  |
| Tipo de cable                                                  | `CableType` (nombre genérico)              | Añadir código (`C0802`) y usar la descripción real.  |
| Conductores y sección                                          | `conductors`, `crossSectionMm2`            | Se deducen del tipo (`8X2.5`) cuando se puede.       |
| Tensión nominal                                                | `voltageRating`                            | Se deduce del tipo (`0,6/1 KV`, `12/20KV`).          |
| Nivel L1-L4                                                    | —                                          | **Nuevo**.                                           |
| Equipo, cubículo/prensa, KKS y sala de cada extremo            | `origin`/`destination` → `Location`        | **Nuevo**: datos de cada extremo.                    |
| Recorrido por bandejas                                         | —                                          | **Nuevo**: bandejas y recorrido ordenado.            |
| Planos donde está cada bandeja                                 | —                                          | **Nuevo**.                                           |
| Revisión, documento y página origen                            | —                                          | **Nuevo**: para ir al PDF a comprobar.               |
| Nº alternativo, circuitos, composición, esquema, observaciones | `notes`                                    | **Nuevo** (campos propios, no en notas).             |
| Color, fabricante, diámetro exterior                           | `Color`, `Manufacturer`, `outerDiameterMm` | No vienen en los PDFs: quedan vacíos.                |
| Estado en campo                                                | estados y acciones de la fase 5            | Falta saber **hasta dónde llegó** un cable a medias. |

## Decisiones (2026-11-13)

Propuestas tras el análisis y aprobadas por el usuario el mismo día.

1. **Bandejas** (`Tray`): código único, tipo (escalera, rejilla, especial, tubo,
   canalización), nivel de tensión, cota, área, tamaño cuando el plano lo da, y las hojas de
   plano donde aparece (`TrayDrawing`: plano, hoja, título del área).
2. **Recorrido** (`CableRouteStep`): orden, bandeja (o texto si no es una bandeja) y tramo
   (`FIELD`/`ROOM` en instrumentación).
3. **Extremos del cable**: equipo, cubículo o prensaestopas, KKS de función e instalación y
   sala, en origen y en destino. Buscables por equipo ("todos los cables del cuadro X").
4. **Nuevos campos del cable**: nivel, número alternativo, revisión, circuito, composición,
   esquema, observaciones, longitud pendiente, documento y página de origen.
5. **Hasta dónde llegó el cable**: nuevo estado _tendido parcial_, que pide la bandeja del
   recorrido donde quedó la punta suelta. La ficha muestra el recorrido con lo tendido y lo que
   falta, y el buscador permite "cables con la punta suelta en la bandeja X". No se marca tramo a
   tramo: sería demasiado trabajo en campo.
6. **Pantallas**: ficha con recorrido y extremos; búsqueda por bandeja y por equipo; ficha de
   bandeja (qué cables pasan, cuáles esperan en ella, en qué planos está).
7. **Extracción en TypeScript** (`pnpm data:extract`) con `pdfjs-dist`, para usar el mismo
   lenguaje, Zod y Vitest que el resto del proyecto. Carga idempotente con `pnpm data:load`.
8. **Ubicaciones desde los KKS**: la carga rellena el árbol, que es estricto (Planta → Área →
   Unidad → Sitio), así: Planta = unidad de la planta (`99`); Área = grupo de edificios, las
   dos primeras letras del KKS de edificio (`99UX`); Unidad = edificio (`99UXA`); Sitio = sala
   (`99UXA16RA001`). El origen y el destino del cable apuntan a la sala o, si no hay sala, al
   edificio; el equipo exacto va en los campos de cada extremo. Un cable puede tener los dos
   extremos en la misma sala (muchos de instrumentación unen dos equipos de una sala), así que
   desde el 2026-11-13 el formulario ya no lo prohíbe.
9. **Datos de ejemplo**: el seed y los E2E pasan a generar datos inventados con la forma real
   (KKS, niveles, bandejas, recorridos y extremos) en lugar de los códigos `SH-50`.
10. **No se carga** el detalle de hilos y bornas (interconexión): es mucho volumen y no ayuda a
    encontrar el cable. Se puede añadir más adelante.

11. **Estado inicial**: los cables entran como _sin revisar_ (estado nuevo `UNVERIFIED`); el
    técnico registra en campo cómo los encuentra. Decidido el 2026-11-13.
