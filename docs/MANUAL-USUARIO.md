# Manual de usuario

El Buscador de Cables sirve para encontrar cualquier cable de la planta, ver por dónde va y
registrar el trabajo que se hace con él: tenderlo, conectarlo, timbrarlo… Todo queda en su
historial con quién lo hizo y cuándo.

Funciona en el ordenador y en el móvil o la tableta, desde el navegador.

---

## Entrar

1. **Pedir una cuenta:** en la pantalla de entrada, «Crear cuenta», con tu nombre, tu correo y
   una contraseña de al menos 10 caracteres.
2. **Confirmar el correo:** llega un enlace. Ábrelo (caduca en 24 horas; si caduca, al intentar
   entrar se envía otro).
3. **Esperar la aprobación:** un administrador revisa la cuenta y le da un rol. Cuando la
   aprueba, llega otro correo y ya puedes entrar.

¿Olvidaste la contraseña? «He olvidado mi contraseña» en la entrada: llega un enlace para
poner otra (caduca en una hora). Tras 10 contraseñas incorrectas seguidas, la cuenta se bloquea
15 minutos.

## Qué puede hacer cada rol

Cada rol puede hacer también todo lo de los anteriores.

| Rol               | Para quién                   | Qué puede hacer                                                                                                            |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Consulta**      | Quien solo necesita mirar    | Buscar cables y ver su ficha, recorrido e historial; ver bandejas, ubicaciones y planos.                                   |
| **Técnico**       | Quien trabaja en campo       | Tender (también a medias), enrollar, mover, conectar, desconectar y timbrar; corregir bornas; dar de alta y editar cables. |
| **Supervisor**    | Quien coordina la obra       | Ver la actividad de todo el equipo; retirar cables y corregir su estado; ubicaciones y catálogos.                          |
| **Administrador** | Quien gestiona la aplicación | Aprobar cuentas, cambiar roles, desactivar cuentas, dar de alta usuarios y eliminar cables.                                |

La misma tabla está siempre a la vista en la página **Usuarios** del administrador.

## Correos que te llegan

Todos salen de la aplicación con su logo, y nunca hace falta responderlos:

- al pedir la cuenta, para confirmar tu correo;
- cuando la aprueban o te dan de alta: bienvenida con tu rol y lo que puedes hacer;
- si te cambian el rol, o desactivan o reactivan tu cuenta;
- al pedir una contraseña nueva, y un aviso cuando la contraseña cambia (si no fuiste tú,
  pide otra enseguida y avisa a un administrador).

Los administradores reciben además las cuentas pendientes de aprobar y cada administrador
nuevo.

## Inicio

Lo primero que ves: buscador rápido de cable y bandeja, y el avance de la obra (cables
tendidos, conectados y timbrados). Según el rol, también tu actividad reciente, el desglose por
estado, la actividad del equipo o las cuentas pendientes de aprobar.

## Buscar cables

**Cables** abre el buscador. Escribe el código o parte de él (no importan guiones ni
mayúsculas) y afina con los filtros: ubicación (incluye todo lo que contiene), tipo, color,
fabricante, sección, longitud, estado de instalación, conexión y timbrado, nivel, equipo
(exacto, en origen o destino) y bandeja. Los filtros quedan en la dirección de la página: se
puede guardar o compartir una búsqueda copiando el enlace.

Pulsa un código para abrir su **ficha**. Tiene dos pestañas, con las mismas acciones y el
mismo historial arriba y abajo:

- **Recorrido** (quien tiende): datos, origen y destino, recorrido por bandejas y el plano con
  el recorrido marcado.
- **Conexionado** (quien conecta): la tabla de hilos con el regletero y la borna de cada uno
  en origen y en destino, los puentes y la **hoja original del listado**, con zoom. En caso de
  duda, manda la hoja original.

El cable es el mismo en las dos: si alguien lo timbró, se ve timbrado también en Conexionado.
Conectar no exige haber timbrado antes, ni al revés.

## Conexionado: corregir bornas

Si en campo un hilo está en otro regletero o en otra borna que la del listado (técnico,
supervisor y administrador):

1. En la pestaña **Conexionado**, activa **Modo editar**.
2. Cambia solo las celdas que no coinciden. Lo cambiado se marca; si dos hilos de la misma
   punta quedan en la misma borna, la tabla lo marca en rojo y lo explica.
3. Escribe, si quieres, una nota (por qué cambia) y pulsa **Guardar**. Si hay bornas
   repetidas, la app pide confirmarlo con **Guardar igualmente**.

El listado no se pierde: debajo de cada celda corregida se ve «Listado: …», y el botón ↺ de la
fila la devuelve a lo que dice el listado. Se marca **por punta**, como siempre (Conectar
origen / destino), no hilo a hilo. Una revisión nueva del listado no pisa lo corregido en
campo.

## Equipos

**Equipos** busca un cuadro, caja o armario y abre su página: los cables que llegan a él,
agrupados por regletero, con sus bornas, el equipo del otro lado y si **esa punta** está
conectada. «Solo pendientes de conectar» deja los que faltan. Es la forma de trabajar armario
a armario. El código de un equipo, en cualquier ficha, lleva a su página.

## Registrar trabajo en un cable

En la ficha (o en el buscador), el botón de acciones ofrece lo que tu rol permite y lo que tiene
sentido en el estado actual del cable:

- **Tender**: el cable queda tendido de punta a punta.
- **Tender a medias**: queda una punta suelta. Indica en qué bandeja del recorrido se quedó
  (botones numerados); si está en una que no es del recorrido, se acepta confirmándolo.
- **Enrollar**, **Mover**.
- **Conectar** y **Desconectar**: por extremo (origen, destino o ambos).
- **Timbrar**: resultado correcto o con fallo. Un fallo pide una nota que diga qué falla.
- **Retirar** y **Corregir** (supervisor): siempre con el motivo.

Si otra persona cambió el cable mientras lo tenías abierto, la app lo avisa y no pisa su
cambio: recarga la página y repite la acción.

## Bandejas y planos

**Bandejas** lista las bandejas con sus cables. La ficha de una bandeja enseña el plano con la
bandeja marcada, qué cables pasan por ella y cuáles esperan con una punta suelta.

En el plano:

- Arrastra para moverte; rueda o dos dedos para acercar y alejar.
- Botones de la derecha: acercar, alejar, ver la hoja entera y pantalla completa.
- «Ir a la marca» y «Siguiente» saltan entre las marcas.
- Con el plano seleccionado, también con el teclado: flechas para moverlo, «+» y «−» para
  acercar o alejar y 0 para verlo entero.

Debajo del plano se dice de qué tipo es la marca: la bandeja dibujada con su código (la más
fiable), la bandera de su sección o solo la fila de la tabla de su sección.

## Ubicaciones

**Ubicaciones** muestra el árbol de la planta (planta → área → unidad → sala). Cada ubicación
tiene su página con lo que contiene, sus cables y sus bandejas.

## Actividad

- **Mi actividad**: todo lo que has registrado, por días.
- Una corrección de bornas ocupa **una línea** («corrigió las bornas de 3 hilos en origen»).
  «Ver qué cambió» abre su página con cada hilo, antes y después.
- **Actividad** (supervisor y administrador): lo de todo el equipo, con filtros por persona,
  acción y periodo.

## Administración

**Usuarios** (administrador). Si hay cuentas esperando, el menú lo dice: un número junto a
«Usuarios» (y un punto en el botón del menú en el móvil). También llega un correo a cada
administrador con los datos de la persona.

- **Cuentas pendientes** arriba. Elige su rol en el selector (debajo se resume qué podrá
  hacer) y pulsa «Aprobar como…». Aprueba solo a personas que conozcas.
- Cambiar el rol de una cuenta activa, desactivarla (cierra sus sesiones) o reactivarla.
- **Dar de alta un usuario** directamente, con una contraseña temporal que le comunicas; puede
  cambiarla con «He olvidado mi contraseña».
- **Cambios en las cuentas**: quién aprobó, cambió de rol o desactivó a quién y cuándo. No se
  puede editar ni borrar.

Nadie puede gestionar a alguien de su mismo rol o superior (salvo los administradores entre
sí), ni cambiarse el rol, ni desactivarse. Siempre queda al menos un administrador activo.

**Catálogos** (supervisor y administrador): tipos de cable, colores y fabricantes.

Si el inicio del administrador avisa de **hojas de los planos sin imagen**, hay planos cargados
cuyas teselas no están subidas: ver `docs/DESPLIEGUE.md`, «Planos nuevos o revisados».
