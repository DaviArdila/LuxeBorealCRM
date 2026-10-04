# Cliente — Specification

## Purpose

Cubre el cliente web del back office (Angular, en `cliente/`): vive aislado del servidor y solo conoce el contrato
(cliente HTTP generado con verificación de deriva), comparte origen con la API en desarrollo, inicia y cierra sesión
con la cookie de la 11a, solo refleja los permisos que dice el servidor, agrega el encabezado anti-CSRF a toda
mutación, ofrece las pantallas «Estilo del bot» y «Mensajes fijos», y crece por áreas con fronteras que el lint
verifica (ADR-0022).

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
- Entonces el cliente navega a la pantalla de inicio y el menú muestra «Estilo del bot» y «Mensajes fijos».

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
- Entonces el menú no muestra «Estilo del bot» ni «Mensajes fijos» y la ruta lo lleva a la pantalla de inicio.

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

### Requirement: CLT7 — Pantalla «Estilo del bot»

La pantalla MUST mostrar la versión vigente, su origen (`base` o `archivo`) y el texto en un editor con contador de
caracteres sobre el máximo de 4.000 (AGT20). «Publicar» MUST pedir confirmación, llamar a `publicarEstilo` y mostrar la
versión nueva; un `422` MUST mostrar el motivo del servidor sin perder lo escrito. La pantalla MUST listar el historial
(versión, fecha y un extracto) con la opción de ver el texto completo y de restaurar una versión, previa confirmación.
Después de publicar o restaurar MUST recordar que un estilo nuevo exige una corrida real de evals antes de llegar a
clientes (EVL3). La pantalla MUST NOT validar el texto por su cuenta más allá del contador: la regla es del servidor.

Fase que lo implementa: 11b

#### Scenario: La pantalla muestra el estilo vigente

- Dado un estilo vigente en la versión 3 con origen `base`,
- Cuando un admin abre «Estilo del bot»,
- Entonces ve la versión 3, el origen `base` y el texto en el editor.

#### Scenario: Publicar muestra la versión nueva y el recordatorio de evals

- Dado un admin que edita el texto y confirma «Publicar»,
- Cuando el servidor responde `200` con la versión 4,
- Entonces la pantalla muestra la versión 4 y el recordatorio de correr las evals reales.

#### Scenario: Un rechazo del servidor muestra el motivo sin perder lo escrito

- Dado un texto que el servidor rechaza con `422` y el motivo «contiene un valor en pesos»,
- Cuando el admin pulsa «Publicar»,
- Entonces la pantalla muestra ese motivo y el editor conserva el texto escrito.

#### Scenario: Restaurar una versión del historial

- Dado un historial con la versión 1,
- Cuando el admin elige restaurarla y confirma,
- Entonces el cliente llama a `restaurarEstilo` con la versión 1 y muestra la versión nueva como vigente.

### Requirement: CLT8 — Pantalla «Mensajes fijos»

La pantalla MUST listar los mensajes de `listarMensajesFijos` con su descripción, su texto y su origen (`base` o
`respaldo`). Editar un mensaje MUST abrir un editor con contador sobre el máximo de 1.000 caracteres; «Guardar» MUST
llamar a `guardarMensajeFijo` y actualizar la fila con el origen `base` y la fecha nueva; un `422` MUST mostrar el
motivo del servidor sin perder lo escrito. La descripción de `aviso_datos` MUST advertir que es el aviso de asistente
automatizado que exige R14.

Fase que lo implementa: 11b

#### Scenario: La pantalla lista los mensajes con su origen

- Dado `mensaje_handoff` guardado en la base y `mensaje_techo_gasto` sin fila,
- Cuando un admin abre «Mensajes fijos»,
- Entonces ve los diez mensajes, `mensaje_handoff` marcado como editado y `mensaje_techo_gasto` como texto de respaldo.

#### Scenario: Guardar un mensaje actualiza la fila

- Dado un admin que edita `mensaje_handoff` y pulsa «Guardar»,
- Cuando el servidor responde `200`,
- Entonces la fila muestra el texto nuevo, el origen `base` y la fecha de la edición.

#### Scenario: Un mensaje inválido muestra el motivo sin perder lo escrito

- Dado un texto que el servidor rechaza con `422` y el código `mensaje-fijo-invalido`,
- Cuando el admin pulsa «Guardar»,
- Entonces la pantalla muestra el motivo y el editor conserva el texto escrito.

### Requirement: CLT9 — El cliente crece por áreas con fronteras verificadas

El cliente MUST organizarse en **áreas** de negocio bajo `src/app/areas/<area>/` (en esta fase solo `bot`, con «Estilo
del bot» y «Mensajes fijos»), más `nucleo/` (transversal sin pantallas), `compartido/` (interfaz sin dominio), `shell/`
(marco y menú) y el cliente generado. Cada área MUST declarar su título, roles, entradas del menú y un cargador de sus
rutas en un único archivo de definición, y MUST registrarse con una sola línea en `areas/registro/registro.ts`; el shell MUST
armar las rutas y el menú desde ese registro, filtrado por el rol de `obtenerSesionActual`. Las rutas de cada área MUST
cargarse en diferido. El lint del cliente MUST rechazar que un área importe de otra área, que `nucleo/` o
`compartido/` importen de un área y que el shell importe de un área algo distinto del registro.

Fase que lo implementa: 11b

#### Scenario: Un área registrada aparece en el menú de su rol

- Dado un área de prueba registrada en `areas/registro/registro.ts` con rol `admin` y una entrada de menú,
- Cuando un admin abre el cliente,
- Entonces el menú muestra esa entrada y su ruta abre la pantalla del área, sin cambios en el shell.

#### Scenario: El menú no muestra las áreas que el rol no puede usar

- Dado el área «Bot» con rol `admin` y un usuario `asesor`,
- Cuando el shell arma el menú,
- Entonces no aparece ninguna entrada del área «Bot».

#### Scenario: Un import entre áreas se rechaza

- Dado un archivo de `areas/bot/` que importa algo de otra área,
- Cuando corre el lint del cliente,
- Entonces falla y nombra el import prohibido.

#### Scenario: El código de un área no viaja en el arranque

- Dado el build de producción del cliente,
- Cuando se revisan sus archivos,
- Entonces las pantallas del área «Bot» quedan en un archivo aparte del bundle inicial, que solo se descarga al entrar
  al área.
