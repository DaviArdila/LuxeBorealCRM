# Delta for Cliente (marco, menú y pantallas)

Dominio existente: `openspec/specs/cliente/spec.md` (CLT1-CLT9). Esta fase agrega un menú lateral con submódulos, un
patrón único de edición en ventana emergente y las pantallas de Casos de uso y Configuración. Al archivar, estos
requisitos se fusionan en `openspec/specs/cliente/spec.md`.

La carpeta se llama `cliente-shell` por su tema principal: el marco (shell) del cliente. El servidor decide el acceso de
verdad (API7); el menú solo refleja el rol.

## ADDED Requirements

### Requirement: SHL1 — El menú lateral se arma desde el registro de áreas y admite submódulos

El menú lateral MUST armarse desde el registro de áreas (CLT9). `EntradaDeMenu` MUST admitir una lista opcional de
`hijos` (entradas con su propio título, ruta y roles) para agrupar submódulos desplegables. Un grupo MUST desplegarse y
plegarse; una entrada sin hijos MUST navegar directo. Agregar un módulo futuro MUST seguir siendo una línea en
`areas/registro/registro.ts` y MUST NOT requerir cambios en el shell.

Fase que lo implementa: 12

#### Scenario: Un grupo con submódulos se despliega y se pliega

- Dado el grupo «Asistente» con las entradas «Casos de uso» y «Estilo del bot»,
- Cuando un admin pulsa el grupo,
- Entonces las dos entradas se muestran y al pulsarlo otra vez se ocultan.

#### Scenario: Una entrada sin hijos navega directo

- Dado una entrada de menú sin submódulos,
- Cuando un admin la pulsa,
- Entonces navega a su ruta sin desplegar nada.

#### Scenario: Un área nueva con submódulos aparece sin tocar el shell

- Dado un área de prueba con un grupo de dos hijos registrada con una línea en `registro.ts`,
- Cuando un admin abre el cliente,
- Entonces el menú muestra el grupo y sus dos hijos, sin cambios en `shell/`.

### Requirement: SHL2 — El menú marca dónde está el usuario

La entrada de la ruta activa MUST resaltarse y MUST llevar `aria-current="page"`. El grupo que contiene la ruta activa
MUST cargarse desplegado.

Fase que lo implementa: 12

#### Scenario: La entrada activa se resalta

- Dado que el usuario está en `/asistente/casos`,
- Cuando se muestra el menú,
- Entonces «Casos de uso» está resaltada y tiene `aria-current="page"`.

#### Scenario: El grupo de la ruta activa carga desplegado

- Dado que el usuario abre `/asistente/estilo` directamente,
- Cuando carga el cliente,
- Entonces el grupo «Asistente» está desplegado.

### Requirement: SHL3 — El menú oculta lo que el rol no puede usar, también en los submódulos

El menú MUST filtrar entradas e hijos por el rol de `obtenerSesionActual`. Un grupo sin ningún hijo visible MUST NOT
mostrarse. El servidor sigue respondiendo `403` a lo que el rol no puede usar.

Fase que lo implementa: 12

#### Scenario: Un asesor no ve los grupos de admin

- Dado un usuario con rol `asesor` y los grupos «Asistente» y «Configuración» solo para `admin`,
- Cuando el shell arma el menú,
- Entonces no aparece ninguno de los dos grupos.

#### Scenario: Un grupo con un solo hijo permitido muestra solo ese hijo

- Dado un grupo con un hijo para `asesor` y otro solo para `admin`,
- Cuando un asesor abre el cliente,
- Entonces el grupo muestra solo el hijo permitido.

### Requirement: SHL4 — El menú tiene modo compacto

El menú MUST poder alternar a un modo compacto que muestre solo íconos con el título como ayuda emergente (`tooltip`). La
preferencia MUST recordarse solo como conveniencia local del navegador y el cliente MUST funcionar si ese almacenamiento
falla o está bloqueado.

Fase que lo implementa: 12

#### Scenario: El modo compacto muestra solo íconos

- Dado el menú expandido,
- Cuando el usuario activa el modo compacto,
- Entonces solo se ven los íconos y cada uno tiene su título como `tooltip`.

#### Scenario: La preferencia se recuerda

- Dado el modo compacto activado,
- Cuando el usuario recarga el cliente,
- Entonces el menú vuelve a mostrarse compacto.

#### Scenario: Sin almacenamiento local el menú sigue funcionando

- Dado un navegador donde leer y escribir el almacenamiento lanza un error,
- Cuando el usuario alterna el modo compacto,
- Entonces el menú cambia de modo sin romper el cliente.

### Requirement: SHL5 — En un teléfono el menú es un cajón

En un ancho de teléfono el menú MUST estar cerrado y abrirse y cerrarse con un botón; MUST cerrarse al navegar a una
entrada, y la página MUST NOT tener scroll horizontal ni márgenes laterales menores de 16 px.

Fase que lo implementa: 12

#### Scenario: El cajón está cerrado al cargar en un teléfono

- Dado un ancho de 375 px,
- Cuando carga el cliente,
- Entonces el menú está cerrado y hay un botón para abrirlo.

#### Scenario: Navegar cierra el cajón

- Dado el cajón abierto en un teléfono,
- Cuando el usuario pulsa una entrada,
- Entonces navega a su pantalla y el cajón se cierra.

### Requirement: SHL6 — El pie del menú muestra al usuario y permite cerrar sesión

El pie del menú MUST mostrar el nombre y el rol del usuario de `obtenerSesionActual` y un botón de «Cerrar sesión» que
llama a `cerrarSesion` y lleva a `/entrar`.

Fase que lo implementa: 12

#### Scenario: El pie muestra nombre y rol

- Dado una sesión de un admin llamado «Ana»,
- Cuando se muestra el menú,
- Entonces el pie muestra «Ana» y el rol «admin».

#### Scenario: Cerrar sesión desde el pie

- Dado un usuario con sesión,
- Cuando pulsa «Cerrar sesión»,
- Entonces el cliente llama a `cerrarSesion` y navega a `/entrar`.

### Requirement: SHL7 — El menú se maneja con teclado

Los grupos MUST exponer `aria-expanded`, todas las entradas MUST alcanzarse con Tab y activarse con Enter o Espacio, y el
foco MUST ser visible.

Fase que lo implementa: 12

#### Scenario: Un grupo se despliega con el teclado

- Dado el foco sobre un grupo cerrado,
- Cuando el usuario pulsa Enter,
- Entonces el grupo se despliega y su `aria-expanded` pasa a verdadero.

#### Scenario: Las entradas se alcanzan con Tab

- Dado el menú desplegado,
- Cuando el usuario recorre con Tab,
- Entonces el foco pasa por cada entrada visible, en orden y con foco visible.

### Requirement: SHL8 — Editar siempre abre una ventana emergente

Las pantallas MUST mostrar la información en modo lectura. «Editar» y «Nuevo» MUST abrir una ventana emergente con el
formulario, implementada por un único componente compartido en `compartido/`, que MUST mostrar el contador de caracteres
cuando el campo tenga tope, los errores del servidor dentro de la misma ventana sin perder lo escrito, y los botones
«Guardar» y «Cancelar». Guardar con éxito MUST cerrar la ventana y refrescar la pantalla. Cerrar con cambios sin guardar
(Cancelar, Escape o clic fuera) MUST pedir confirmación; sin cambios MUST cerrar directo. El foco MUST entrar a la ventana
y volver al botón que la abrió. Ninguna pantalla MUST tener un formulario de edición fijo en la página.

Fase que lo implementa: 12

#### Scenario: Editar abre la ventana con el valor actual

- Dado una pantalla en modo lectura con un valor,
- Cuando el admin pulsa «Editar»,
- Entonces se abre una ventana con el formulario y el valor actual cargado.

#### Scenario: Un error del servidor se muestra dentro de la ventana sin perder lo escrito

- Dado un texto que el servidor rechaza con `422` y un motivo,
- Cuando el admin pulsa «Guardar»,
- Entonces la ventana sigue abierta, muestra el motivo y conserva el texto escrito.

#### Scenario: Guardar con éxito cierra la ventana y refresca

- Dado un guardado que el servidor acepta,
- Cuando el admin pulsa «Guardar»,
- Entonces la ventana se cierra y la pantalla muestra el valor nuevo.

#### Scenario: Cerrar con cambios sin guardar pide confirmación

- Dado una ventana con texto modificado,
- Cuando el admin pulsa Escape,
- Entonces aparece la pregunta de si descarta los cambios y la ventana no se cierra hasta confirmar.

#### Scenario: Cerrar sin cambios no pregunta

- Dado una ventana sin cambios,
- Cuando el admin pulsa «Cancelar»,
- Entonces la ventana se cierra sin preguntar.

#### Scenario: El foco entra a la ventana y vuelve al botón

- Dado el botón «Editar» con el foco,
- Cuando el admin abre y luego cierra la ventana,
- Entonces el foco entra al formulario y vuelve a «Editar».

#### Scenario: Ninguna pantalla edita en la página

- Dado el código de las áreas del cliente,
- Cuando corre el test de estructura,
- Entonces ninguna pantalla declara un formulario de edición fuera del componente de ventana emergente.

### Requirement: SHL9 — La pantalla «Estilo del bot» usa la ventana emergente y muestra quién publicó

La pantalla (ahora en el área `asistente`) MUST mostrar en modo lectura la versión vigente, su origen, quién la publicó y
el texto, y «Editar» MUST abrir la ventana de SHL8 con el editor y el contador sobre 4.000 caracteres; «Publicar» desde
la ventana MUST pedir confirmación y llamar a `publicarEstilo`. El historial MUST mostrar versión, fecha, autor y un
extracto, con ver el texto completo y restaurar previa confirmación. Después de publicar o restaurar MUST mantenerse el
recordatorio de evals reales (EVL3). La pantalla MUST aclarar que lo que el bot responde en cada situación va en
«Casos de uso». Sustituye a CLT7.

Fase que lo implementa: 12

#### Scenario: La pantalla muestra el vigente con su autor

- Dado un estilo vigente en la versión 3 publicado por «Ana»,
- Cuando un admin abre «Estilo del bot»,
- Entonces ve la versión 3, el origen, «Ana» y el texto en modo lectura.

#### Scenario: Publicar desde la ventana pide confirmación y muestra el recordatorio

- Dado una ventana de edición con un texto nuevo,
- Cuando el admin pulsa «Publicar» y confirma,
- Entonces el cliente llama a `publicarEstilo`, la ventana se cierra, la pantalla muestra la versión nueva y el recordatorio de evals reales.

#### Scenario: Un rechazo del servidor queda dentro de la ventana

- Dado un texto que el servidor rechaza con `422` y el motivo «contiene un valor en pesos»,
- Cuando el admin confirma «Publicar»,
- Entonces la ventana muestra el motivo y conserva el texto.

#### Scenario: Restaurar una versión del historial

- Dado un historial con la versión 1 de «Luis»,
- Cuando el admin la restaura y confirma,
- Entonces el cliente llama a `restaurarEstilo` con la versión 1 y la pantalla muestra la versión nueva como vigente.

#### Scenario: La pantalla remite a Casos de uso

- Dado la pantalla «Estilo del bot»,
- Cuando un admin la abre,
- Entonces ve el aviso de que las respuestas por situación se editan en «Casos de uso».

### Requirement: SHL10 — La pantalla «Casos de uso» reemplaza a «Mensajes fijos»

El área `asistente` MUST tener la pantalla «Casos de uso» (el área `bot` y «Mensajes fijos» desaparecen). MUST listar los
casos agrupados por categoría con un contador, con un buscador (retardo de 300 ms) que llama a `listarCasos` con `q` y con
filtros por categoría y por tipo. «Nuevo caso» y «Editar» MUST abrir la ventana de SHL8 con categoría, título, «cuándo
aplica», texto, modo y activo. Los casos del sistema MUST mostrar la etiqueta «Sistema», una descripción de cuándo se
envían y MUST NOT ofrecer «Borrar» ni «Desactivar». MUST permitir crear, renombrar, reordenar y borrar categorías; una
categoría con casos MUST mostrar el motivo del servidor y no borrarse. Un caso inactivo MUST verse atenuado con su
etiqueta. Con una lista vacía MUST mostrar un estado vacío con la acción de crear.

Fase que lo implementa: 12

#### Scenario: Los casos se agrupan por categoría

- Dado casos en las categorías «Sistema» y «Políticas»,
- Cuando un admin abre «Casos de uso»,
- Entonces ve cada categoría con su contador y sus casos.

#### Scenario: El buscador llama al servidor con retardo

- Dado la pantalla abierta,
- Cuando el admin escribe «garan»,
- Entonces tras 300 ms el cliente llama a `listarCasos` con `q=garan` y muestra solo lo que responde.

#### Scenario: Crear un caso desde la ventana

- Dado la ventana de «Nuevo caso» con categoría, título, «cuándo aplica» y texto,
- Cuando el admin guarda,
- Entonces el cliente llama a `crearCaso`, cierra la ventana y el caso aparece en su categoría.

#### Scenario: Un caso del sistema no se puede borrar ni desactivar

- Dado el caso `mensaje_handoff`,
- Cuando el admin lo ve,
- Entonces tiene la etiqueta «Sistema», su descripción, y no hay botones para borrarlo ni desactivarlo.

#### Scenario: Una categoría con casos no se borra

- Dado una categoría con casos y un `409 categoria-con-casos` del servidor,
- Cuando el admin intenta borrarla,
- Entonces la pantalla muestra el motivo y la categoría sigue.

#### Scenario: Gestionar categorías

- Dado la pantalla «Casos de uso»,
- Cuando el admin crea, renombra y reordena una categoría,
- Entonces el cliente llama a `crearCategoriaCaso`, `renombrarCategoriaCaso` y `ordenarCategoriasCaso` y refleja el resultado.

#### Scenario: Un caso inactivo se ve atenuado

- Dado un caso de intención inactivo,
- Cuando el admin abre la pantalla,
- Entonces el caso se ve atenuado con la etiqueta «Inactivo».

#### Scenario: Sin casos se muestra un estado vacío

- Dado un listado vacío,
- Cuando el admin abre la pantalla,
- Entonces ve un mensaje de que no hay casos y el botón «Nuevo caso».

### Requirement: SHL11 — Las pantallas de Configuración del negocio

El área `configuracion` MUST tener las pantallas «Horario», «Envíos» y «Gasto del LLM», solo para `admin`, cada una en modo
lectura con «Editar» que abre la ventana de SHL8. «Horario» MUST mostrar los siete días y las excepciones con alta y baja;
«Envíos», el recargo y el factor volumétrico; «Gasto del LLM», el techo editable y el estado y el gasto del mes solo de
lectura. Un `422` MUST mostrar el motivo de cada campo en la ventana. Tras guardar MUST mostrar que el cambio rige desde el
siguiente mensaje.

Fase que lo implementa: 12

#### Scenario: Editar el horario por día

- Dado la pantalla «Horario» con sus siete días,
- Cuando el admin edita el lunes y guarda,
- Entonces el cliente llama a `guardarHorario` y la pantalla muestra el lunes nuevo.

#### Scenario: Agregar y quitar una excepción

- Dado la pantalla «Horario»,
- Cuando el admin agrega una fecha con motivo y luego la quita,
- Entonces la excepción aparece mientras existe y desaparece al quitarla.

#### Scenario: Editar el recargo y el factor volumétrico

- Dado la pantalla «Envíos»,
- Cuando el admin cambia el recargo y guarda,
- Entonces el cliente llama a `guardarConfiguracionEnvios` y la pantalla muestra el valor nuevo y que rige desde el siguiente mensaje.

#### Scenario: El estado del techo es de solo lectura

- Dado la pantalla «Gasto del LLM»,
- Cuando el admin la abre,
- Entonces ve el techo editable, el estado y el gasto del mes sin controles para modificarlos.

#### Scenario: Un campo inválido muestra su motivo en la ventana

- Dado un `422` con el motivo del recargo,
- Cuando el admin guarda,
- Entonces la ventana muestra ese motivo junto al campo y conserva lo escrito.

#### Scenario: Un asesor no ve el área de configuración

- Dado un usuario con rol `asesor`,
- Cuando el shell arma el menú,
- Entonces no aparece el grupo «Configuración» y navegar a su ruta lo lleva a `/`.

## MODIFIED Requirements

### Requirement: CLT9 — El cliente crece por áreas con fronteras verificadas

Igual que CLT9 con dos cambios: las áreas de esta fase son `asistente` («Casos de uso» y «Estilo del bot») y
`configuracion` («Horario», «Envíos» y «Gasto del LLM»), y el menú sale del registro con submódulos (SHL1). El resto de
CLT9 (registro de una línea, rutas diferidas, fronteras por lint, el menú filtrado por rol) no cambia, y sus cuatro
escenarios siguen vigentes.

Fase que lo implementa: 11b, 12

## REMOVED Requirements

| Requisito | Reemplazado por |
|---|---|
| CLT7 — Pantalla «Estilo del bot» | SHL9 |
| CLT8 — Pantalla «Mensajes fijos» | SHL10 |
