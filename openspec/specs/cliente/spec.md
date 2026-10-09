# Cliente — Specification

## Purpose

Cubre el cliente web del back office (Angular, en `cliente/`): vive aislado del servidor y solo conoce el contrato
(cliente HTTP generado con verificación de deriva), comparte origen con la API en desarrollo, inicia y cierra sesión
con la cookie de la 11a, solo refleja los permisos que dice el servidor, agrega el encabezado anti-CSRF a toda
mutación, ofrece un menú lateral con submódulos, un patrón único de edición en ventana emergente y las pantallas «Casos de uso»,
«Estilo del bot», «Horario», «Envíos» y «Gasto del LLM», y crece por áreas con fronteras que el lint verifica (ADR-0022,
ADR-0024).

## Requirements

### Requirement: CLT1 — El cliente vive en `cliente/`, aislado del servidor

El cliente de back office MUST vivir en `cliente/` con su propio `package.json`, su lockfile y su configuración de
lint y tests. El código de `cliente/` MUST NOT importar nada de `src/`, `scripts/` ni `test/`, y el código del servidor
MUST NOT importar nada de `cliente/`: su única dependencia es el contrato `openapi/openapi.json` (ADR-0008, ADR-0022).
El cliente MUST NOT guardar secretos ni tokens: la sesión es la cookie httpOnly de la 11a, que el código del cliente no
lee (doc 06, regla de seguridad).

Fase que lo implementa: 11b

#### Scenario: El cliente compila sin el servidor

- Dado `cliente/` con sus dependencias instaladas y sin las del servicio (`servicio/node_modules`),
- Cuando se corre el build de producción del cliente,
- Entonces termina con éxito.

#### Scenario: Un import del servidor desde el cliente se rechaza

- Dado un archivo de `cliente/src/` que importa algo de `../servicio/` (o de `src/`, `scripts/` o `test/` del servidor),
- Cuando corre el lint del cliente,
- Entonces falla y nombra el import prohibido.

### Requirement: CLT2 — Cliente HTTP generado desde el contrato, con verificación de deriva

El código que llama a la API MUST generarse con `ng-openapi-gen` desde `openapi/openapi.json` con
`npm run api:generar` (script del propio cliente, ADR-0023), en una carpeta del cliente que nadie edita a mano y que
se commitea. MUST existir una verificación (`npm run api:deriva`, parte del `ci` del cliente) que regenera en una
carpeta temporal y falla si el resultado difiere de lo commiteado. Las pantallas MUST llamar a la API solo a través de
ese código generado.

Fase que lo implementa: 11b

#### Scenario: El cliente generado coincide con el contrato

- Dado el contrato y el cliente generado commiteados juntos,
- Cuando se corre `npm run api:deriva` en `cliente/`,
- Entonces termina con éxito.

#### Scenario: Un endpoint nuevo sin regenerar el cliente se detecta

- Dado un cambio en `openapi/openapi.json` sin correr `npm run api:generar`,
- Cuando se corre `npm run api:deriva` en `cliente/`,
- Entonces falla y nombra los archivos que difieren.

### Requirement: CLT3 — En desarrollo el cliente y la API comparten origen

En desarrollo el servidor del cliente MUST reenviar `/api` a la API local con `proxy.conf.json`, de modo que el
navegador vea un solo origen y la cookie `SameSite=Strict` viaje sin CORS. La API MUST NOT habilitar CORS para el
origen del cliente.

Fase que lo implementa: 11b

#### Scenario: Iniciar sesión por el proxy deja una sesión usable

- Dado la API en su puerto local y el cliente en `http://localhost:4200` con el proxy,
- Cuando el dueño inicia sesión desde el cliente,
- Entonces la siguiente llamada a `/api/v1/auth/yo` desde el cliente responde `200` sin ninguna configuración de CORS.

### Requirement: CLT4 — Pantalla de inicio de sesión

La pantalla de inicio de sesión MUST pedir correo y contraseña y llamar a `iniciarSesion`. Con éxito MUST llevar a la
pantalla de inicio de su rol. Ante `credenciales-invalidas` MUST mostrar un único mensaje genérico («Correo o contraseña
incorrectos») que no distingue entre correo inexistente y contraseña errada; ante `demasiados-intentos` MUST decir que
espere y por cuánto, según `Retry-After`. MUST NOT guardar la contraseña ni el correo en `localStorage`,
`sessionStorage` ni en la URL.

Fase que lo implementa: 11b

#### Scenario: Un inicio de sesión correcto lleva al inicio

- Dado un admin con credenciales válidas,
- Cuando las envía desde la pantalla,
- Entonces el cliente navega a la pantalla de inicio y el menú muestra «Casos de uso» y «Estilo del bot».

#### Scenario: Credenciales inválidas muestran un mensaje genérico

- Dado una respuesta `401` con el código `credenciales-invalidas`,
- Cuando el cliente la recibe,
- Entonces muestra «Correo o contraseña incorrectos» y no dice si el correo existe.

#### Scenario: Demasiados intentos dice cuánto esperar

- Dado una respuesta `429` con `Retry-After: 600`,
- Cuando el cliente la recibe,
- Entonces muestra que espere 10 minutos y deshabilita el botón de envío durante ese tiempo.

#### Scenario: La contraseña no queda guardada en el navegador

- Dado un inicio de sesión, correcto o no,
- Cuando se inspeccionan `localStorage`, `sessionStorage` y la URL,
- Entonces no contienen la contraseña ni el correo.

### Requirement: CLT5 — La guardia de rutas solo refleja lo que dice el servidor

La guardia de rutas del cliente MUST decidir con la respuesta de `obtenerSesionActual` (`GET /api/v1/auth/yo`): sin
sesión MUST llevar a la pantalla de inicio de sesión y, con sesión, MUST ocultar las rutas que el rol no puede usar. El
cliente MUST NOT decidir permisos por su cuenta: una ruta oculta sigue protegida por el servidor (API7). Una respuesta
`401` a cualquier llamada MUST llevar a la pantalla de inicio de sesión; una `403` MUST mostrar un aviso de permiso
insuficiente sin cerrar la sesión. Cerrar sesión MUST llamar a `cerrarSesion` y volver al inicio de sesión.

Fase que lo implementa: 11b

#### Scenario: Sin sesión se va al inicio de sesión

- Dado que `GET /api/v1/auth/yo` responde `401`,
- Cuando alguien abre `/estilo` en el cliente,
- Entonces el cliente lo lleva a la pantalla de inicio de sesión.

#### Scenario: Un asesor no ve las pantallas de admin

- Dado que `GET /api/v1/auth/yo` responde rol `asesor`,
- Cuando el cliente arma el menú y alguien abre `/estilo` a mano,
- Entonces el menú no muestra «Casos de uso» ni «Estilo del bot» y la ruta lo lleva a la pantalla de inicio.

#### Scenario: Una sesión vencida a mitad de uso vuelve al inicio de sesión

- Dado un admin en la pantalla de estilo cuya sesión vence,
- Cuando la siguiente llamada responde `401`,
- Entonces el cliente lo lleva a la pantalla de inicio de sesión.

#### Scenario: Cerrar sesión vuelve al inicio de sesión

- Dado un admin con sesión,
- Cuando pulsa «Cerrar sesión»,
- Entonces el cliente llama a `cerrarSesion` y muestra la pantalla de inicio de sesión.

### Requirement: CLT6 — Toda mutación lleva el encabezado anti-CSRF

Un interceptor HTTP del cliente MUST agregar `X-Luxe-Csrf: 1` a toda petición `POST`, `PUT`, `PATCH` o `DELETE` hacia
`/api` (USR7), y MUST NOT agregarlo a las lecturas.

Fase que lo implementa: 11b

#### Scenario: Una publicación lleva el encabezado

- Dado el interceptor activo,
- Cuando el cliente llama a `publicarEstilo`,
- Entonces la petición `PUT` lleva `X-Luxe-Csrf: 1`.

#### Scenario: Una lectura no lleva el encabezado

- Dado el interceptor activo,
- Cuando el cliente llama a `obtenerEstilo`,
- Entonces la petición `GET` no lleva `X-Luxe-Csrf`.

### Requirement: CLT9 — El cliente crece por áreas con fronteras verificadas

El cliente MUST organizarse en **áreas** de negocio bajo `src/app/areas/<area>/` (`asistente`, con «Casos de uso» y «Estilo del bot»,
y `configuracion`, con «Horario», «Envíos» y «Gasto del LLM»; el menú sale del registro con submódulos, SHL1), más `nucleo/` (transversal sin pantallas), `compartido/` (interfaz sin dominio), `shell/`
(marco y menú) y el cliente generado. Cada área MUST declarar su título, roles, entradas del menú y un cargador de sus
rutas en un único archivo de definición, y MUST registrarse con una sola línea en `areas/registro/registro.ts`; el shell MUST
armar las rutas y el menú desde ese registro, filtrado por el rol de `obtenerSesionActual`. Las rutas de cada área MUST
cargarse en diferido. El lint del cliente MUST rechazar que un área importe de otra área, que `nucleo/` o
`compartido/` importen de un área y que el shell importe de un área algo distinto del registro.

Fase que lo implementa: 11b, 12

#### Scenario: Un área registrada aparece en el menú de su rol

- Dado un área de prueba registrada en `areas/registro/registro.ts` con rol `admin` y una entrada de menú,
- Cuando un admin abre el cliente,
- Entonces el menú muestra esa entrada y su ruta abre la pantalla del área, sin cambios en el shell.

#### Scenario: El menú no muestra las áreas que el rol no puede usar

- Dado el área «Asistente» con rol `admin` y un usuario `asesor`,
- Cuando el shell arma el menú,
- Entonces no aparece ninguna entrada del área «Asistente».

#### Scenario: Un import entre áreas se rechaza

- Dado un archivo de `areas/asistente/` que importa algo de otra área,
- Cuando corre el lint del cliente,
- Entonces falla y nombra el import prohibido.

#### Scenario: El código de un área no viaja en el arranque

- Dado el build de producción del cliente,
- Cuando se revisan sus archivos,
- Entonces las pantallas del área «Asistente» quedan en un archivo aparte del bundle inicial, que solo se descarga al entrar
  al área.

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
el texto, y «Editar» MUST abrir la ventana de SHL8 con el editor y el contador sobre 10.000 caracteres; «Publicar» desde
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
envían y MUST NOT ofrecer «Borrar» ni «Desactivar»; su ventana de edición MUST permitir cambiar el texto, la categoría, el
título y el «cuándo aplica», y MUST NOT ofrecer el modo ni el estado activo. MUST permitir crear, renombrar, reordenar y borrar categorías; una
categoría con casos MUST mostrar el motivo del servidor y no borrarse. Un caso inactivo MUST verse atenuado con su
etiqueta. Con una lista vacía MUST mostrar un estado vacío con la acción de crear.

(Previously: la ventana de un caso del sistema dejaba editables solo el texto y la categoría; el título y el «cuándo aplica»
estaban bloqueados aunque la API los aceptaba.)

Fase que lo implementa: 12; 12d (título y «cuándo aplica» editables en los casos del sistema)

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

- Dado el caso `mensaje_error_llm`,
- Cuando el admin lo ve,
- Entonces tiene la etiqueta «Sistema», su descripción, y no hay botones para borrarlo ni desactivarlo.

#### Scenario: El título de un caso del sistema se edita desde la ventana

- Dado la ventana de edición del caso del sistema «Audio recibido»,
- Cuando el admin cambia el título a «Audios» y guarda,
- Entonces el cliente llama a `editarCaso` con el título nuevo y la lista muestra «Audios».

#### Scenario: El «cuándo aplica» de un caso del sistema se edita desde la ventana

- Dado la ventana de edición del caso del sistema «Espera del asesor»,
- Cuando el admin cambia el «cuándo aplica» y guarda,
- Entonces el cliente llama a `editarCaso` con ese «cuándo aplica».

#### Scenario: El modo y el estado de un caso del sistema no se ofrecen

- Dado la ventana de edición de un caso del sistema,
- Cuando el admin la abre,
- Entonces no aparecen los controles de modo ni de activo, y la petición de `editarCaso` no los envía.

#### Scenario: Un título duplicado muestra el motivo del servidor

- Dado la ventana de un caso del sistema y un `409 caso-duplicado` del servidor,
- Cuando el admin guarda un título que ya existe,
- Entonces la ventana muestra el motivo y no se cierra.

#### Scenario: Los casos convertidos se pueden borrar y desactivar

- Dado el caso de intención «Contra entrega», que antes tenía clave del sistema,
- Cuando el admin lo ve,
- Entonces no tiene la etiqueta «Sistema» y sí ofrece «Borrar» y «Desactivar».

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

### Requirement: SHL12 — Ayuda de herramientas bajo «Cuándo aplica»

La ventana de un caso de intención («Nuevo caso» y «Editar») MUST mostrar bajo el campo «Cuándo aplica» una línea de ayuda
que diga que las fichas son sugerencias para redactar y que el bot decide cuándo usar cada capacidad, y una ficha por cada capacidad del bot, con su nombre en palabras simples: buscar productos, ver la ficha, cotizar el envío,
enviar fotos, guardar los datos del cliente, marcar un lead y avisar a un asesor. Tocar una ficha MUST agregar su frase al
final del texto del campo (por ejemplo «cuando haya que cotizar el envío»), separada del texto anterior, sin borrar lo
escrito. El contador de caracteres del campo MUST contar la frase agregada. La ventana de un caso del sistema MUST NOT mostrar
la ayuda. La ayuda MUST NOT agregar campos a la petición: `crearCaso` y `editarCaso` envían el «cuándo aplica» como el mismo
texto plano de siempre. Es solo una ayuda de redacción: no cambia el contrato, el esquema ni lo que recibe el modelo.

Fase que lo implementa: 12d

#### Scenario: Las fichas aparecen en un caso de intención

- Dado la ventana de «Nuevo caso»,
- Cuando el admin la abre,
- Entonces bajo «Cuándo aplica» ve la línea de ayuda, que dice que son sugerencias y que el bot decide, y las siete fichas: buscar productos, ver la ficha, cotizar el envío,
  enviar fotos, guardar los datos del cliente, marcar un lead y avisar a un asesor.

#### Scenario: Tocar una ficha agrega su frase al texto

- Dado la ventana de edición de un caso de intención con «Cuándo aplica» igual a «el cliente pregunta por envíos»,
- Cuando el admin toca la ficha «cotizar el envío»,
- Entonces el campo conserva «el cliente pregunta por envíos» y le agrega al final «cuando haya que cotizar el envío».

#### Scenario: El contador cuenta la frase agregada

- Dado un «Cuándo aplica» vacío en la ventana de un caso de intención,
- Cuando el admin toca una ficha,
- Entonces el contador muestra la longitud de la frase agregada sobre el máximo del campo.

#### Scenario: Un caso del sistema no muestra la ayuda

- Dado la ventana de edición del caso del sistema «Audio recibido»,
- Cuando el admin la abre,
- Entonces bajo «Cuándo aplica» no aparecen la línea de ayuda ni las fichas.

#### Scenario: La petición lleva solo el texto

- Dado un caso de intención en el que el admin tocó la ficha «avisar a un asesor»,
- Cuando guarda,
- Entonces el cliente llama a `editarCaso` con el «cuándo aplica» como texto plano que incluye la frase, y la petición no
  lleva ningún campo adicional.
