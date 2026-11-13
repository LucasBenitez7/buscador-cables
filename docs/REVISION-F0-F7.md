# Revisión completa del proyecto (fases 0 a 7)

Revisión hecha el 2026-11-13 sobre `dev` (commit `8b7c653`, fase 7 cerrada). Rama de trabajo
para las correcciones: **`fix/review-f0-f7`**.

Este documento es la lista de trabajo: cada hallazgo tiene un identificador, dónde está, por
qué es un problema, cómo se comprobó y qué hay que hacer. Las casillas se marcan al corregir.

## Cómo trabajar esta lista

- Todo va en la rama `fix/review-f0-f7` (creada desde `dev`), con **un commit por hallazgo**
  (Conventional Commits en inglés) y un solo PR a `dev` al terminar.
- Cada bug corregido lleva **un test que lo reproduce** (regla 5 de `AGENTS.md`). Primero el
  test en rojo, después la corrección.
- Orden: primero **Alta**, después **Media**, después **Baja**. La sección "Calidad de código"
  es opcional y puede ir en commits `refactor:` aparte.
- Los hallazgos marcados **(decisión)** necesitan que el responsable elija antes de tocar
  código: pregunta, no elijas por tu cuenta.
- Al terminar: `pnpm check`, marcar las casillas de este fichero, añadir la entrada en
  `docs/REVISIONES.md` y abrir el PR. Los E2E existentes tienen que seguir en verde.
- Los ejemplos de este documento usan datos inventados (unidad `99`), como los tests. No
  copies aquí ni en los tests códigos de los datos reales.

## Resumen

| Gravedad | Cuántos | Qué son                                                                |
| -------- | ------: | ---------------------------------------------------------------------- |
| Alta     |       2 | Redirección abierta tras el login; registro abierto con datos reales   |
| Media    |       7 | Integridad del historial y del estado, carga de datos, búsqueda, login |
| Baja     |      19 | Validaciones, condiciones de carrera poco probables, avisos que faltan |
| Calidad  |       8 | Duplicación, rendimiento, tests que faltan, documentación              |

Estado de las comprobaciones automáticas en el momento de la revisión:

- `pnpm check`: en verde (545 tests: shared 214, db 24, web 268, data 39).
- `pnpm audit`: 1 aviso bajo (`deepmerge`, solo en el CLI de shadcn; ya anotado en la fase 4.5).
- Sin `dangerouslySetInnerHTML`, `eval`, `any`, `@ts-ignore`, `eslint-disable` ni `console.log`
  en el código de la app.

Cómo leer "Comprobado": **confirmado** significa que se reprodujo ejecutando código;
**leído** significa que sale de leer el código y falta reproducirlo con un test.

## Resultado (2026-11-13)

Todo lo alto, medio y bajo está corregido en `fix/review-f0-f7`, cada cosa con su test. El
texto de cada hallazgo se deja como estaba (qué pasaba y por qué); aquí va lo que se hizo.

Comprobaciones al cerrar: `pnpm check` en verde (649 tests: shared 225, db 30, web 334, data
60), `pnpm db:check` sin diferencias sobre una base nueva, y los 37 E2E en verde.

**Decisiones del responsable** (delegadas en la recomendación de la revisión):

| Hallazgo | Decisión                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2       | Aprobación por un administrador. La cuenta nueva queda pendiente (`User.approvedAt`); al confirmar el correo se avisa a los administradores y, al aprobarla en `/admin/users`, al usuario.                                                     |
| M3       | Lo corregido a mano en la app manda sobre el listado: la carga no lo sustituye y lo dice en los avisos. Para distinguirlo, cada evento lleva su origen (`CableEvent.source`).                                                                  |
| M7       | Se corrige ahora: 30 inicios de sesión por minuto e IP, y bloqueo por cuenta (10 contraseñas incorrectas seguidas, 15 minutos). El falseo de la IP con `X-Forwarded-For` sigue en la fase 10: depende del proxy que haya delante al desplegar. |

**Lo que cambia para quien usa la app:**

- Quien se registra ya no entra al confirmar el correo: espera a que un administrador lo
  apruebe. El panel de usuarios enseña primero las cuentas pendientes, con el botón "Aprobar".
- Nadie puede cambiarse el nombre; lo hace un administrador.
- Editar un cable tendido no deja quitarle el origen o el destino.
- `pnpm data:load` enseña a qué base escribe, exige que firme un supervisor o un
  administrador activo y admite `--dry-run`.

**Hay que aplicar tres migraciones** (`pnpm db:deploy`): `add_user_approved_at`,
`add_cable_event_source` y `catalog_names_unique_ignoring_case`. Son aditivas. La segunda
marca los eventos que ya escribió la carga; se probó sobre una base con eventos anteriores.
La tercera falla si ya hay dos nombres de catálogo que solo difieren en mayúsculas.

**Desviaciones respecto a lo propuesto:**

- **B15:** dar de alta un cable como "Sin revisar" se mantiene: un test lo cubría a propósito.
  Lo que se corrige es que ese estado no puede guardar una ubicación, ni en el alta ni en una
  corrección.
- **B9:** el historial sigue mostrando los 100 últimos movimientos, ahora diciendo cuántos hay
  en total. No se añadió paginación.
- **B10:** con la punta de origen suelta se toma la aparición de la bandeja más cercana al
  destino, no la primera. Con la de destino, la primera, como antes.
- **B19:** los filtros de "quién" solo listan a quien ha registrado algo. `/admin/users` sigue
  sin paginar.
- **M4:** un tipo de cable **sin código** (instrumentación) que se renombre en la app se
  vuelve a crear en la carga siguiente: el listado no da nada más con que reconocerlo.
- Los commits agrupan hallazgos que tocan los mismos ficheros en lugar de ir uno por uno.

**Calidad de código:**

- **C1, C5, C7 y C8:** hechos. De C1 quedan fuera `optionalNotes` (su mensaje es distinto del
  de `optionalText`) y los enlaces con otras variantes de clase.
- **C2:** medido con un E2E. React envía la lista de ubicaciones una sola vez y los demás
  diálogos la referencian, así que no hay nada que corregir; el test (`e2e/payload.spec.ts`)
  queda para avisar si deja de ser así.
- **C3:** no se cambia. La etiqueta de una ubicación es su ruta completa, así que hacen falta
  sus antecesores, y son cuatro consultas a tablas pequeñas.
- **C4:** sin cambios: con el volumen actual no hace falta. Queda anotado.
- **C6:** pasa a la fase 10 ("Registro de auditoría"), ya anotado en `docs/PLAN.md`.

---

## Gravedad alta

### A1 — Redirección abierta después de iniciar sesión

- [x] Corregido

**Dónde:** `apps/web/src/lib/route-access.ts:23` (`safeNextPath`), usado en
`apps/web/src/app/(auth)/login/page.tsx:13` y
`apps/web/src/features/auth/components/login-form.tsx:38`.

**Problema:** `safeNextPath` rechaza `//host`, `https://…` y `\`, pero acepta un tabulador o
un salto de línea después de la primera barra. Los navegadores (y `new URL`) quitan esos
caracteres antes de interpretar la URL, así que `/\t/evil.example` se convierte en
`//evil.example`, que es otro sitio. Un enlace como
`/login?next=/%09/evil.example` lleva a la víctima a un sitio externo justo después de
escribir su contraseña en la app real: es la base de un phishing creíble.

**Comprobado (confirmado en parte):**

- `safeNextPath("/\t/evil.example")` devuelve el valor sin cambios (empieza por `/`, no por
  `//`, y no tiene `\`).
- `new URL("/\t/evil.example", "http://localhost:3000").href` da `http://evil.example/`
  (ejecutado con Node).
- En el router de Next 16, `router.replace(href)` resuelve con `new URL(href, location.href)`
  y, si el origen es distinto, hace una navegación completa al sitio externo
  (`app-router-utils.js` → `isExternalURL`, `navigate-reducer.js` →
  `completeHardNavigation`). Leído en `node_modules`; falta el E2E en un navegador.

**Qué hacer:**

1. Validar resolviendo la URL, no mirando el texto: `new URL(value, "http://internal")` y
   exigir que el origen siga siendo `http://internal`; devolver solo
   `pathname + search + hash` del resultado. Rechazar además cualquier carácter de control
   (`/[\u0000-\u001f\u007f]/`).
2. Tests en `route-access.test.ts`: `/\t/evil.example`, `/\n/evil.example`,
   `/\r/evil.example`, `/%09/evil.example` ya decodificado, `/\\evil`, y que las rutas
   normales con query (`/cables?q=a&page=2`) siguen pasando.
3. Un E2E en `e2e/auth.spec.ts`: login con `?next=/%09/evil.example` termina en `/`.

### A2 — Registro abierto con los datos reales del cliente dentro (decisión)

- [x] Decidido por el responsable
- [x] Corregido

**Dónde:** `apps/web/src/lib/auth.ts:25-48` (registro abierto con verificación de correo),
`apps/web/src/server/auth-policy.ts:39` (toda cuenta nueva es `VIEWER` **activa**).

**Problema:** cualquiera que llegue a la URL y confirme un correo cualquiera entra como
`VIEWER` y puede leer **todo**: cables, equipos, salas, bandejas, recorridos, historial y los
nombres de todos los usuarios (`getSearchOptions` y los filtros). Esto ya estaba anotado como
"a tener en cuenta" en la revisión del registro (2026-11-10), cuando la app solo tenía datos
de ejemplo. Desde la fase 7 la app está pensada para cargar los datos confidenciales del
cliente, así que deja de ser una nota y pasa a ser el riesgo principal antes de desplegar.

**Comprobado (leído):** no hay lista de dominios, ni aprobación, ni invitación; el único
filtro es confirmar el correo.

**Opciones (elige el responsable):**

1. **Aprobación por un administrador (recomendada):** la cuenta nueva se crea con
   `active: false`; el usuario confirma su correo y ve "pendiente de aprobación"; un `ADMIN`
   la activa desde `/admin/users`. Reutiliza lo que ya existe (`assertAccountActive` bloquea
   el login de las cuentas inactivas). Falta un mensaje propio para "pendiente" y un aviso al
   admin.
2. **Lista de dominios permitidos:** variable `ALLOWED_EMAIL_DOMAINS` validada en
   `prepareSignUpUser`. Sencillo, pero no sirve si los técnicos usan correos personales.
3. **Cerrar el registro:** `disableSignUp` y solo altas desde el panel (o invitación por
   correo, pendiente desde la fase 1).

Sea cual sea, la respuesta del registro tiene que seguir siendo la misma exista o no el
correo, y hay que actualizar `docs/ARQUITECTURA.md` → Seguridad, los textos de
`/register` y `/admin/users`, y los E2E de registro.

---

## Gravedad media

### M1 — Un usuario puede cambiarse el nombre y firmar el historial como otra persona

- [x] Corregido

**Dónde:** `apps/web/src/lib/auth.ts` (no hay hook `user.update`); el historial muestra
`user.name` en `apps/web/src/server/cables/detail.ts:135` y
`apps/web/src/server/activity/service.ts`.

**Problema:** Better Auth expone por defecto `POST /api/auth/update-user`, que deja a
cualquier usuario con sesión cambiar su `name` (y `image`). Nuestro Zod solo valida el nombre
al **crear** la cuenta (`databaseHooks.user.create.before`). El historial y "Actividad" no
guardan el nombre: lo leen del usuario en cada consulta. Un técnico puede llamarse
"Juan Pérez", registrar movimientos y volver a su nombre; todo su historial, también el
antiguo, aparece mientras tanto firmado por otra persona. Tampoco hay límite de longitud ni
de caracteres en esa vía. El objetivo de la fase 5 es justo saber quién hizo cada cosa.

**Comprobado (leído):** la ruta `/update-user` está en `node_modules/better-auth/dist`;
`role` y `active` tienen `input: false` y no se pueden tocar por ahí (eso está bien). Falta
reproducirlo con un test de integración contra `auth.api.updateUser`.

**Qué hacer:**

1. Hook `databaseHooks.user.update.before` que rechace cambios de `name`, `email` e `image`
   hechos por el propio usuario (hoy la app no tiene pantalla de perfil). El cambio de
   nombre, si se quiere, que lo haga un `ADMIN` desde el panel con `signUpProfileSchema`.
2. Test: una sesión de técnico llama a `update-user` con otro nombre y recibe error; el
   nombre no cambia.
3. Valorar (mejora) mostrar el correo junto al nombre en "Actividad" para los supervisores:
   dos personas pueden registrarse con el mismo nombre.

### M2 — Editar un cable puede dejar su estado incoherente

- [x] Corregido

**Dónde:** `apps/web/src/server/cables/service.ts:202-256` (`updateCable`),
`packages/shared/src/cables.ts:283` (`updateCableSchema`).

**Problema:** la máquina de estados exige que un cable tendido (o tendido a medias) tenga
origen y destino (`validateCableState`), y las acciones lo comprueban. La edición no: el
formulario permite poner "Sin indicar" en origen o destino de un cable **tendido y
conectado**, y el servidor lo guarda. Queda un cable conectado por un extremo que no existe;
después, acciones como "Tender a medias" fallan con un mensaje que no explica el motivo.
Solo se salvan los cables de los listados, porque el equipo cuenta como extremo.

**Comprobado (leído):** `updateCable` no llama a `validateCableState` ni compara con
`installationStatus`.

**Qué hacer:** en `updateCable`, tras leer `current`, validar con `validateCableState` el
estado actual con el origen y destino nuevos (`input.originId ?? current.originEquipment`, y
lo mismo para destino) y devolver el error en español. Test de integración: quitar el origen
de un cable `LAID` sin equipo se rechaza; quitarlo de uno `IN_STOCK` se acepta; quitarlo de
uno `LAID` con `originEquipment` se acepta.

### M3 — `pnpm data:load` deshace en silencio lo que se editó en la app

- [x] Decidido el criterio (decisión)
- [x] Corregido

**Dónde:** `packages/data/src/load/load.ts:368-401` (`engineeringValues`) y `492-563`
(actualización de cables existentes).

**Problema:** la carga promete no tocar "lo registrado en campo", pero trata como datos de
ingeniería todo lo demás, incluido lo que el formulario de edición deja cambiar:

- **Origen y destino:** los cables eléctricos no traen sala, así que `originId` y
  `destinationId` salen `null` del listado (`load.ts:384` y `391`). Si alguien les asigna la
  sala a mano en la app, la siguiente carga los vuelve a dejar en `null`.
- **Longitud, tipo, descripción, tensión, sección, conductores:** si un técnico corrige la
  longitud real medida en campo, la siguiente carga restaura la del listado.
- Queda un evento `UPDATED` en el historial, pero nadie avisa de que se ha pisado una
  edición manual.
- **Punta suelta:** si el recorrido cambia en una revisión nueva y la bandeja donde espera
  la punta ya no está en él, el cable queda con una punta suelta fuera de su recorrido (la
  ficha deja de mostrar el avance) y la carga no lo avisa.

**Comprobado (leído).** Los tests de la carga cubren "no pisa el estado de campo", no las
ediciones del formulario.

**Qué hacer (propuesta, a confirmar):**

1. Nunca sustituir por `null` un `originId` / `destinationId` que ya tiene valor cuando el
   listado no trae sala.
2. Para el resto de campos: si el último cambio de ese campo en el historial lo hizo una
   persona desde la app (evento `UPDATED` que no viene de la carga), **no pisarlo** y añadir
   un aviso a `summary.issues` ("<código>: longitud editada en la app (142 → 150), el
   listado dice 142; no se cambia"). Para distinguir los eventos de la carga hace falta una
   marca fiable: hoy solo se reconocen por el texto de la nota. Opciones: un campo
   `source` en `CableEvent` (migración) o una clave dentro de `changes`.
3. Avisar en `summary.issues` de los cables tendidos a medias cuya bandeja de la punta
   suelta ya no está en el recorrido nuevo.
4. Tests de integración para los tres casos.

### M4 — La carga empareja los tipos de cable por nombre: renombrar uno lo duplica

- [x] Corregido

**Dónde:** `packages/data/src/load/load.ts:224-267` (`ensureCableTypes`), línea 374
(`typeIds.get(cable.typeName)`).

**Problema:** `/catalogs` deja a un supervisor renombrar un tipo de cable. En la siguiente
carga, el nombre del listado ya no existe: se crea un tipo nuevo con el nombre original, el
código (`C0802`) no se le puede poner porque lo tiene el renombrado ("queda sin código"), y
todos los cables del tipo pasan al tipo nuevo con un evento `UPDATED` cada uno. Además el
catálogo compara nombres sin distinguir mayúsculas y la carga los compara exactos.

**Comprobado (leído).**

**Qué hacer:** emparejar primero por `code` (cuando el listado lo trae) y después por nombre
sin distinguir mayúsculas ni espacios repetidos; no cambiar el nombre de un tipo ya
existente. Test: renombrar un tipo con código y recargar no crea tipos ni eventos.

### M5 — Los cables cargados con textos largos no se pueden editar

- [x] Corregido

**Dónde:** `packages/shared/src/cables.ts:214` y `222` (descripción ≤ 200, tensión ≤ 30)
frente a `packages/data/src/extract/schema.ts` (descripción ≤ 500, tensión ≤ 50).

**Problema:** la carga acepta descripciones de hasta 500 caracteres y tensiones de hasta 50;
el formulario de edición usa límites menores. Un cable cargado con una descripción de 250
caracteres no se puede guardar al editar **cualquier** otro campo: el formulario marca
"Descripción: máximo 200 caracteres" aunque nadie la haya tocado.

**Comprobado (confirmado):** `updateCableSchema.safeParse` con una descripción de 300
caracteres devuelve ese error.

**Qué hacer:** una sola fuente para los límites (constantes exportadas en
`packages/shared/src/cables.ts`) usada por el formulario y por `projectCableSchema`. Test
que compare los límites de ambos esquemas, como el que ya compara los enums.

### M6 — En la búsqueda de bandejas, `_` y `%` actúan como comodines

- [x] Corregido

**Dónde:** `apps/web/src/server/trays/service.ts:76` (`code: { contains: search.q }`).

**Problema:** Prisma no escapa los comodines de `LIKE` en `contains`. El `_` es parte normal
de los códigos de bandeja (relleno del área), así que buscar un trozo de código con `_`
devuelve también bandejas que no lo contienen, y buscar solo `_` las devuelve todas. El
buscador de cables sí lo hace bien (`likeContains` en `server/cables/search.ts:61`).

**Comprobado (confirmado):** en la base local, `contains: "_"` devuelve todas las bandejas,
no solo las que tienen `_` en el código.

**Qué hacer:** escapar `\`, `%` y `_` antes de pasar el texto a `contains` (o usar la misma
consulta SQL con `likeContains`). Test de integración: con `99UXA00L22036` y `99UX_00L22037`
(inventados), buscar `UX_` devuelve solo la segunda.

### M7 — El límite de intentos de login es por IP: bloquea a toda la planta a la vez

- [x] Decidido el criterio (decisión)
- [x] Corregido

**Dónde:** `apps/web/src/lib/auth-rate-limit.ts:14` (`/sign-in/email`: 5 por minuto e IP).

**Problema:** en una planta, todos salen a internet por la misma IP. Con 5 inicios de sesión
por minuto para **toda** la IP, el cambio de turno (o un compañero que falla la contraseña
varias veces) deja a los demás con "Demasiados intentos". A la vez, el límite no frena un
ataque repartido entre muchas IP contra una sola cuenta, y la IP se puede falsear con
`X-Forwarded-For` si no hay un proxy de confianza delante (esto último ya está anotado para
la fase 10).

**Comprobado (leído).**

**Qué hacer (propuesta):** subir el límite por IP (p. ej. 30/min) y añadir un límite por
cuenta (correo) con bloqueo temporal progresivo tras N fallos; revisar junto con la
configuración de `advanced.ipAddress` de Better Auth en la fase 10. Si se decide dejarlo para
la fase 10, anotarlo en `docs/PLAN.md` y marcar aquí "aplazado".

---

## Gravedad baja

### B1 — `generateMetadata` lee datos sin comprobar la sesión

- [x] Corregido

**Dónde:** `apps/web/src/app/(app)/cables/[id]/page.tsx:34-38` y
`apps/web/src/app/(app)/trays/[code]/page.tsx:21-28`.

`generateMetadata` llama a `getCableDetail` / `getTrayDetail` sin `requireUser()`. El proxy
solo mira que exista una cookie con el nombre correcto (vale cualquier valor), así que la
consulta se ejecuta para peticiones sin sesión válida y el código del cable o de la bandeja
puede ir en el `<title>`. El id del cable no se puede adivinar; el código de una bandeja sí.
**Qué hacer:** que el cargador compartido (`loadCable`, `loadTray`) haga
`await getCurrentUser()` y devuelva `null` sin sesión. Test de la función.

### B2 — La página de inicio no comprueba la sesión por sí misma

- [x] Corregido

**Dónde:** `apps/web/src/app/(app)/page.tsx`. Es la única página de `(app)` que confía solo
en el layout. En una navegación en cliente el layout no se vuelve a ejecutar. Hoy solo
muestra el estado de la base de datos, pero la fase 8 pondrá aquí el panel.
**Qué hacer:** `await requireUser()` como en el resto.

### B3 — `?deleted=` se muestra sin validar

- [x] Corregido

**Dónde:** `apps/web/src/app/(app)/cables/page.tsx:25` y `45-49`. Cualquier texto de la URL
aparece dentro de "Cable … dado de baja." React lo escapa (no es XSS), pero permite montar
un mensaje falso dentro de la app con un enlace. **Qué hacer:** aceptar solo valores que
cumplan el patrón de código de cable (máx. 50 caracteres) e ignorar el resto.

### B4 — "Nº de conductores" acepta `1e2` y `0x10`

- [x] Corregido

**Dónde:** `packages/shared/src/cables.ts:193-210`. Usa `Number(text)`.
**Comprobado (confirmado):** `"1e2"` se guarda como 100 y `"0x10"` como 16.
**Qué hacer:** exigir `/^\d+$/` antes de convertir. Test.

### B5 — Un correo con espacios alrededor se rechaza

- [x] Corregido

**Dónde:** `packages/shared/src/users.ts:13` (`z.email().trim().toLowerCase()`). En Zod 4 el
formato se comprueba antes del `trim`. **Comprobado (confirmado):** `"  Ana@Example.com "`
da "Introduce un correo válido". Pasa al pegar un correo copiado con un espacio.
**Qué hacer:** `z.string().trim().toLowerCase().pipe(z.email(...))`. Test.

### B6 — "Debe quedar un administrador" tiene una condición de carrera

- [x] Corregido

**Dónde:** `apps/web/src/server/users/service.ts:105-158`. `countOtherActiveAdmins` y la
escritura no van en la misma transacción. Dos administradores que se quitan el rol (o se
desactivan) el uno al otro a la vez pasan los dos la comprobación y no queda ninguno.
**Qué hacer:** hacer la comprobación y el `update` en una transacción que bloquee las filas
de administradores activos (`SELECT … FOR UPDATE`) o con aislamiento `Serializable` y
reintento. Test de integración con dos llamadas simultáneas (como el de altas simultáneas).

### B7 — Nombres de catálogo duplicados si se crean a la vez

- [x] Corregido

**Dónde:** `apps/web/src/server/catalogs/service.ts:111-144`. La unicidad sin distinguir
mayúsculas se comprueba con una lectura previa; el índice único de la base sí distingue.
"Rojo" y "rojo" creados a la vez entran los dos. **Qué hacer:** índice único sobre
`lower(name)` en las tres tablas (migración SQL manual) y traducir `P2002`.

### B8 — El número de cables de una bandeja no coincide entre el listado y la ficha

- [x] Corregido

**Dónde:** `apps/web/src/server/trays/service.ts:106` (cuenta **pasos** de recorrido) frente
a la línea 168 (cuenta **cables distintos**). Si un recorrido nombra dos veces la misma
bandeja, el listado dice un cable más que la ficha. **Qué hacer:** contar cables distintos
en el listado, o cambiar el texto a "tramos". Test.

### B9 — El historial de la ficha se corta en 100 sin avisar

- [x] Corregido

**Dónde:** `apps/web/src/server/cables/detail.ts:98` (`HISTORY_LIMIT`). Un cable con más de
100 eventos enseña los 100 últimos sin decir que hay más, y "Corregir" solo deja elegir
entre esos. **Qué hacer:** devolver el total y mostrar "Se muestran los 100 movimientos más
recientes de N" con enlace a "Actividad" filtrada por cable, o paginar.

### B10 — Recorridos que repiten bandeja

- [x] Corregido

**Dónde:** `apps/web/src/app/(app)/cables/[id]/page.tsx:110` → `routeTrays` sin deduplicar →
claves de React repetidas en el `<datalist>` de
`features/cables/components/cable-actions.tsx:523`; y `packages/shared/src/route.ts:30`
(`findIndex` toma la primera aparición). Con los datos actuales ningún recorrido repite
bandeja (comprobado en la base local), pero `server/trays/service.ts:155` ya contempla el
caso. **Qué hacer:** deduplicar `routeTrays`; documentar en `routeProgress` qué aparición se
usa y cubrirlo con un test.

### B11 — La extracción y la carga descartan cosas sin dejar aviso

- [x] Corregido

**Dónde:**

- `packages/data/src/extract/extract.ts:204`: las bandejas que no pasan `projectTraySchema`
  se filtran sin añadir nada a `issues` (por ejemplo, un tamaño `L000100300` da ancho 0 y
  tira la bandeja entera).
- `packages/data/src/load/load.ts:423`: un paso de recorrido cuya bandeja no está ni en
  `trays.json` ni en la base se guarda sin enlace (`trayId` null) y sin aviso.
- `packages/data/src/extract/extract.ts:86-101`: dos fichas del mismo cable con **la misma
  revisión y contenido distinto** se resuelven a favor de la primera, y el mensaje dice "se
  usa la revisión de …" como si una fuera más nueva. Lo mismo si la revisión no es numérica
  (`compareRevisions` devuelve empate).

**Qué hacer:** un aviso (o error) por cada caso en el informe; para el empate con contenido
distinto, severidad `error` y mensaje propio. Tests con fichas inventadas.

### B12 — Renombrar y mover ubicaciones leen fuera de la transacción

- [x] Corregido

**Dónde:** `apps/web/src/server/locations/service.ts:119-147` y `155-195`. La ruta antigua
se lee antes de abrir la transacción. Si dos supervisores renombran y mueven la misma rama a
la vez, las rutas materializadas de los descendientes pueden quedar con el prefijo viejo.
Poco probable, pero rompe el filtro por subárbol. **Qué hacer:** leer la ubicación dentro de
la transacción con `FOR UPDATE`. Test de concurrencia.

### B13 — `data:load` no enseña ni confirma la base de destino

- [x] Corregido

**Dónde:** `packages/data/src/cli/load.ts:25-41`. Escribe los datos del cliente en lo que
diga `DATABASE_URL`, sin mostrar a qué servidor y base va, y firma con cualquier usuario que
exista (aunque esté desactivado o sea `VIEWER`). **Qué hacer:** imprimir host y nombre de la
base (sin credenciales), negarse si la base es `cables_test` o `cables_e2e`, exigir que el
firmante esté activo y sea `SUPERVISOR` o `ADMIN` (tiene `import:run`), y añadir `--dry-run`
que solo muestre el resumen.

### B14 — El seed acepta la contraseña de ejemplo en producción

- [x] Corregido

**Dónde:** `packages/db/prisma/seed.ts:19-58`; `.env.example` trae
`SEED_ADMIN_PASSWORD=CambiaEstaClave1!`, que es pública. **Qué hacer:** con
`NODE_ENV=production`, rechazar esa contraseña (y `admin@cables.local`) con un mensaje claro.
De paso, usar `PASSWORD_MIN_LENGTH` de `@cables/shared` en lugar de la constante repetida.

### B15 — "Sin revisar" admite ubicación física y se puede elegir en el alta manual

- [x] Corregido

**Dónde:** `packages/shared/src/cable-actions.ts:166-196` (`validateCableState`) y
`apps/web/src/features/cables/components/cable-form.tsx:216`. La documentación dice que un
cable sin revisar no tiene ubicación física, pero una corrección puede dejarlo `UNVERIFIED`
con `currentLocationId`, y el formulario de alta ofrece "Sin revisar" (pensado solo para la
carga). **Qué hacer:** regla en `validateCableState` y quitar la opción del alta (o
confirmar con el responsable que se quiere permitir).

### B16 — Doble decodificación del código de bandeja en la URL

- [x] Comprobado
- [x] Corregido si hace falta

**Dónde:** `apps/web/src/app/(app)/trays/[code]/page.tsx:21-23`
(`decodeURIComponent(code)`). Si Next ya entrega el parámetro decodificado, un código con
`%` literal lanza `URIError` y la página responde con el error genérico en lugar de un 404.
**Qué hacer:** comprobar qué entrega Next 16 (leer `node_modules/next/dist/docs/`), y
envolver la decodificación para que un valor inválido acabe en `notFound()`. Test.

### B17 — El trigger de inmutabilidad no cubre `TRUNCATE`

- [x] Anotado para la fase 10

**Dónde:** migración `add_locations_catalogs_and_cables`. El trigger es
`BEFORE UPDATE OR DELETE … FOR EACH ROW`; un `TRUNCATE` vacía `cable_event` sin oposición.
Los tests dependen de `TRUNCATE`, así que la solución razonable es de despliegue: que el
usuario de base de datos de la app en producción no tenga permiso `TRUNCATE` ni sea el
dueño de las tablas. **Qué hacer:** añadirlo a la fase 10 en `docs/PLAN.md`.

### B18 — `.gitignore`: la excepción de `__fixtures__` es demasiado amplia

- [x] Corregido

**Dónde:** `.gitignore:34` (`!**/__fixtures__/**`). Anula **todas** las reglas anteriores
dentro de cualquier carpeta `__fixtures__`: un `.env`, un PDF real o un Excel copiados ahí
se subirían al repo público. Además `.claude/` no está ignorada y aparece como sin seguir
(un `git add -A` la subiría). **Qué hacer:** limitar la excepción a extensiones concretas
(`!**/__fixtures__/**/*.pdf`, etc.), e ignorar `.claude/` salvo lo que se quiera compartir.

### B19 — Los nombres de todos los usuarios llegan a cualquier `VIEWER`

- [x] Corregido (o cerrado con A2)

**Dónde:** `apps/web/src/server/cables/search.ts:339-352` (filtro "Quién") y
`apps/web/src/server/activity/service.ts:126-132`. Se envían todos los usuarios, también
los desactivados y los que nunca han registrado nada. Es coherente con "todos ven quién
hizo qué", pero con el registro abierto (A2) expone la plantilla a cualquiera.
**Qué hacer:** listar solo usuarios con algún evento. Además `/admin/users` no pagina.

### Otras notas menores

- [x] `packages/shared/src/cables.ts:185-186`: el mensaje dice "debe estar entre 0 y N" pero
      0 no se acepta ("mayor que 0 y como máximo N").
- [x] `docker-compose.yml` y `ci.yml` usan `axllent/mailpit:latest`: fijar una versión para
      que el CI no cambie solo.
- [x] `packages/data/src/cli/extract.ts:112`: lee todos los PDF en memoria a la vez antes de
      procesarlos; leerlos de uno en uno.
- [x] `packages/data/src/extract/report.ts`: el nombre del fichero en la tabla "Ficheros" no
      pasa por `cell()` (un `|` en el nombre rompe la tabla).
- [x] `apps/web/src/features/users/components/users-table.tsx:59`: el rol del selector se
      inicializa una vez; si otro administrador cambia el rol y la tabla se revalida, la fila
      sigue mostrando el antiguo hasta recargar. Usar `key={user.id + user.role}` o derivar.
- [x] `apps/web/src/features/auth/components/register-form.tsx:46`: enseña
      `signUpError.message` tal cual; los mensajes propios de Better Auth salen en inglés.
- [x] Tablas `verification` y `rateLimit`: nadie borra las filas caducadas (fase 10).

---

## Calidad de código y mejoras (opcional, commits `refactor:` / `perf:` / `test:`)

- [x] **C1 — Duplicación.**
  - El esquema `day` y la función que aplana `searchParams` están copiados en
    `packages/shared/src/search.ts` y `activity.ts`.
  - `versionSchema` está dos veces (`cables.ts` y `cable-actions.ts`); `optionalNotes`
    repite `optionalText`.
  - `isUniqueViolation` está en cuatro servicios (`users`, `cables`, `locations`,
    `catalogs`): moverlo a `server/prisma-errors.ts`.
  - `Section` e `Item` están duplicados en la ficha del cable y en la de la bandeja.
  - La clase larga de los enlaces de texto (la que empieza por `hover:text-primary`) se
    repite unas quince veces: un componente `TextLink`.
- [x] **C2 — El buscador pinta cada cable dos veces.** `search-results.tsx:78-139`
      (tarjetas) y `141-237` (tabla) montan dos `CableActions` por cable: 50 componentes cliente
      con su diálogo por página, y la lista de ubicaciones como prop de cada uno. Medir el
      tamaño de la respuesta de `/cables` con un rol que tenga acciones; si pesa, un solo
      diálogo por página que reciba el cable elegido.
- [ ] **C3 — `loadLookups()`** (`server/cables/detail.ts:113-129`) carga todas las
      ubicaciones y los tres catálogos en cada ficha y en cada página de actividad, aunque solo
      se usen unos pocos ids. Resolver solo los ids que aparecen en los eventos.
- [ ] **C4 — Índices de búsqueda.** `description`, `altCode` y `replace(code, '-', '')` se
      buscan con `ILIKE '%…%'` sin índice. Con ~4.500 cables va sobrado; si el volumen crece,
      índices trigram. El orden "natural" (`naturalCodeOrder`) estaba pensado para `SH-50` y
      con códigos que empiezan por dígitos equivale al orden alfabético: revisar si aporta.
- [x] **C5 — Tests que faltan.** `apps/web/src/features/users/actions.ts` es el único
      fichero de acciones sin test (cables, catálogos y ubicaciones lo tienen). Las CLIs de
      `packages/data` tampoco. El umbral de cobertura solo vigila `server/` y `shared`.
- [ ] **C6 — Cambios de rol y de estado de usuarios sin rastro.** No queda constancia de
      quién hizo administrador a quién. Está previsto en la fase 10 ("Registro de auditoría de
      acciones de administración"); con el registro abierto conviene no retrasarlo.
- [x] **C7 — Cabeceras de seguridad.** `next.config.ts` no define CSP, `X-Frame-Options` /
      `frame-ancestors`, `Referrer-Policy` ni `poweredByHeader: false`. Previsto en la fase 10;
      `frame-ancestors 'none'` y `poweredByHeader` se pueden adelantar sin riesgo.
- [x] **C8 — Documentación desfasada.** `docs/ARQUITECTURA.md` nombra `queries.ts` en cada
      feature (no existe) y enseña el modelo original. `docs/PLAN.md` y `docs/REVISIONES.md`
      dicen que los datos reales no están cargados en ninguna base: actualizar cuando proceda.

---

## Revisado y correcto

Para no repetir el trabajo: esto se miró y está bien.

- **Autorización:** las 14 Server Actions llaman a `authorize(<permiso>)` antes de leer la
  entrada, y todas las páginas menos la de inicio (B2) llaman a `requireUser` o
  `requirePermission`. `runCableActionAction` pide el permiso de cada acción concreta y el
  servicio lo vuelve a comprobar.
- **Validación:** toda entrada pasa por Zod en el servidor; los filtros de la URL ignoran
  los valores inválidos en lugar de fallar.
- **SQL:** todas las consultas crudas usan parámetros (`Prisma.sql`). Los dos `Prisma.raw`
  de `search.ts` solo reciben constantes (`ASC` / `DESC`). `$executeRawUnsafe` solo aparece
  en tests y en el script de los E2E, con valores fijos.
- **XSS:** sin `dangerouslySetInnerHTML`; el HTML de los correos escapa nombre y enlace; el
  color `hex` se valida con `#RRGGBB` antes de ir a un `style`.
- **Roles:** `role` y `active` tienen `input: false`; el registro fuerza `VIEWER`; nadie
  gestiona un rol igual o superior al suyo, ni se cambia el rol ni se desactiva a sí mismo.
  Al desactivar se borran las sesiones en la misma transacción, y `getCurrentUser` relee
  `active` y el rol en cada petición.
- **Concurrencia de cables:** edición, baja y acciones usan `version` dentro del `UPDATE`;
  el evento y el cable se escriben en la misma transacción.
- **Historial:** `cable_event` rechaza `UPDATE` y `DELETE` por trigger; todas las
  referencias son `RESTRICT`; la restricción `cable_loose_end_check` protege la punta suelta.
- **Secretos y datos del cliente:** `.env` nunca ha estado en el repo; `private-data/` está
  ignorada; los tests y el seed usan datos inventados. `/api/health` no devuelve el detalle
  del error.
- **CI:** acciones fijadas por SHA, permisos mínimos, comprobación de migraciones,
  commitlint, CodeQL y revisión de dependencias.
