# API — Specification

## Purpose

Gobierna el contrato de la API pública del back office: cómo se genera, cómo se versiona, qué
convenciones sigue cada endpoint y qué queda fuera del documento público. La decisión de fondo
(OpenAPI 3.1 code-first con el soporte nativo de Standard Schema de NestJS 12 + Scalar; enmienda
2026-09-23) está en `docs/adr/0008-contrato-api-openapi.md`; esta spec define el comportamiento
observable que cada fase con endpoints debe cumplir.

## Requirements

### Requirement: API1 — Contrato OpenAPI generado desde el código

(Reason: Modificado en 00b: el sistema genera dos documentos commiteados en git en vez de uno solo.)

El sistema MUST generar, en una sola construcción del documento OpenAPI, dos documentos commiteados
en git: `openapi/openapi.interno.json` (documento **interno**, completo: toda operación, incluida
cualquier etiquetada `internal` y `GET /health`) y `openapi/openapi.json` (documento **público**,
resultado de una función pura que retira del interno toda operación etiquetada `internal`, los *path
items* que quedan sin ninguna operación tras esa exclusión y los esquemas de `components.schemas` que
dejan de estar referenciados; ADR-0010). Ambos usan los esquemas zod de cada endpoint como única
fuente, mediante el soporte nativo de Standard Schema de NestJS 12 (`StandardSchemaValidationPipe` +
conversión nativa de `@nestjs/swagger`). Los dos documentos commiteados en git MUST coincidir
exactamente con los que el código genera en el momento del build; ninguno de los dos MUST editarse a
mano.

Fase que lo implementa: 00b (pipeline y convenciones)

#### Scenario: El contrato generado coincide con el commiteado

- Dado que el repositorio tiene `openapi/openapi.json` y `openapi/openapi.interno.json` commiteados,
- Cuando CI regenera ambos documentos a partir del código actual,
- Entonces cada documento generado es idéntico byte a byte al commiteado correspondiente y el build
  pasa; si alguno de los dos difiere, el build falla nombrando cuál.

La generación MUST ser determinista en ambos documentos: orden de claves estable, formato fijo
(indentación y fin de línea) y sin valores que dependan del momento o del entorno (fechas, rutas
absolutas, hostnames, variables de entorno). Así el chequeo de deriva solo falla cuando cambió la API
de verdad.

#### Scenario: Generar dos veces sin cambios produce el mismo documento

- Dado que el código no cambió,
- Cuando cada uno de los dos documentos se genera dos veces, en máquinas o momentos distintos,
- Entonces ambos resultados son idénticos byte a byte, documento por documento.

#### Scenario: El documento público se deriva del interno en una sola generación

- Dado el documento interno generado desde la app real,
- Cuando se deriva el documento público a partir de él,
- Entonces el público no contiene ninguna operación etiquetada `internal`, ningún *path item* que
  quede sin operaciones tras esa exclusión, ni ningún esquema de `components.schemas` que deje de
  estar referenciado, y ambos documentos provienen de la misma generación, no de dos caminos
  independientes que puedan divergir.

### Requirement: API2 — Versionado, idioma y nombres estables

Toda ruta pública MUST empezar con el prefijo `/api/v1`, con **una única excepción operativa
explícita**: `GET /health`, que MUST NOT llevar el prefijo de versión, porque Docker, Dokploy y
Uptime Kuma la consultan en una ruta fija conocida de antemano. Los recursos MUST nombrarse en
plural y en español (`/api/v1/ventas`, no `/api/v1/sales` ni `/api/v1/venta`). Cada operación MUST
tener un `operationId` estable que no cambia entre despliegues salvo que la operación cambie de
forma incompatible.

Fase que lo implementa: 00a (excepción de `/health`), 00b (convención), 11-14 (recursos concretos)

(Previously: no existía excepción al prefijo `/api/v1`; se agrega `GET /health` como única ruta
pública sin versión, decidido en 00a — Q1 de
`openspec/changes/archive/2026-09-23-fase-00a-esqueleto/proposal.md`.)

#### Scenario: Ruta con prefijo y nombre de recurso en español

- Dado un endpoint que expone ventas del negocio,
- Cuando se publica en el contrato,
- Entonces su ruta es `/api/v1/ventas` (prefijo de versión + recurso en plural español).

#### Scenario: operationId estable entre despliegues

- Dado un endpoint ya publicado con un `operationId`,
- Cuando se despliega una nueva versión del servicio sin cambiar el contrato de esa operación,
- Entonces el `operationId` en el documento generado es el mismo que en el despliegue anterior.

#### Scenario: `GET /health` es la única ruta pública sin el prefijo de versión

- Dado el endpoint de salud del servicio,
- Cuando se expone,
- Entonces su ruta es `/health`, sin el prefijo `/api/v1`, y es la única ruta del sistema que
  queda registrada en esta spec como excepción explícita a la regla de versionado — esto es
  independiente de si aparece o no en el documento OpenAPI público, que decide API8.

### Requirement: API3 — Convenciones JSON

Los cuerpos JSON de request y response MUST usar camelCase para las claves, identificadores en
formato UUID, fechas en ISO 8601 en UTC, y valores de dinero como enteros en pesos colombianos
(nunca decimales ni `Float`), coherente con la regla de dinero de la skill `luxeboreal-arquitectura`
§5.

Fase que lo implementa: 00b (convención), 12-13 (payloads de inventario y ventas)

#### Scenario: Dinero como entero, nunca decimal

- Dado un endpoint que devuelve el precio de una venta,
- Cuando construye el cuerpo de la respuesta,
- Entonces el precio es un entero en pesos colombianos, sin parte decimal ni tipo `Float`.

#### Scenario: Fecha en ISO 8601 UTC

- Dado un endpoint que devuelve una marca de tiempo (creación, actualización),
- Cuando construye el cuerpo de la respuesta,
- Entonces la fecha está en formato ISO 8601 con zona UTC.

### Requirement: API4 — Errores en formato RFC 9457

(Reason: Modificado en 00b: ampliado de validación a toda respuesta de error, con catálogo de códigos estable y exención de `/health`.)

Toda respuesta de error (de validación, de negocio o no manejada) MUST usar el formato
`application/problem+json` de RFC 9457 y MUST incluir un código de error propio, tomado de un
catálogo de códigos de error documentado y estable entre despliegues (ADR-0011), distinto del
`status` HTTP, que el cliente pueda usar para distinguir el tipo de error sin parsear el mensaje. Un
error no manejado por el código de la aplicación (una excepción no capturada) MUST también responder
en este formato, sin filtrar detalles internos (stack trace, mensaje interno de la excepción) al
cliente.

El endpoint operativo `GET /health` queda **exento** de este formato: MUST conservar el cuerpo propio
de su chequeo de salud (Terminus, PLT4) en vez de `application/problem+json`, porque responde a
orquestadores de infraestructura (Docker, Dokploy, Uptime Kuma) y no es un recurso del contrato de
negocio hacia el cliente de back office (API8).

Fase que lo implementa: 00b (convención, catálogo, errores no manejados, exención de `/health`), cada
fase con endpoints

#### Scenario: Error de validación en formato problem+json

- Dado que un request llega con un payload inválido,
- Cuando el servidor rechaza el request,
- Entonces responde con `Content-Type: application/problem+json` y un cuerpo que incluye un código de
  error propio estable del catálogo, además del `status` HTTP.

#### Scenario: Error no manejado no filtra detalles internos

- Dado una excepción no capturada por el código de la aplicación,
- Cuando el filtro global de errores la intercepta,
- Entonces responde con `Content-Type: application/problem+json`, un código de error propio del
  catálogo y `status` 500, sin incluir el stack trace ni el mensaje interno de la excepción en el
  cuerpo de la respuesta.

#### Scenario: El código de error se mantiene estable entre despliegues

- Dado un código de error ya documentado en el catálogo para un tipo de error concreto,
- Cuando se despliega una nueva versión del servicio sin cambiar el comportamiento de ese error,
- Entonces el código de error devuelto para ese mismo tipo de error es el mismo que en el despliegue
  anterior.

#### Scenario: `GET /health` queda exento de `application/problem+json`

- Dado que `GET /health` no puede confirmar que Postgres o Redis responden,
- Cuando responde con su código de error operativo (`503`, PLT4),
- Entonces el cuerpo de la respuesta sigue el formato propio del chequeo de salud (Terminus), no
  `application/problem+json`, y no incluye ningún código del catálogo de errores del cliente de back
  office.

### Requirement: API5 — Paginación por cursor y filtros explícitos

Todo endpoint que devuelve una colección MUST paginar por cursor (no por número de página) y MUST
exponer sus filtros como parámetros explícitos y documentados. Un endpoint MUST NOT diseñarse a la
medida de una pantalla concreta del cliente.

Fase que lo implementa: 12-14 (endpoints de colección concretos)

#### Scenario: Colección paginada por cursor

- Dado un endpoint que lista movimientos de inventario,
- Cuando el cliente pide una página siguiente,
- Entonces lo hace con un cursor devuelto por la respuesta anterior, no con un número de página.

### Requirement: API6 — Idempotencia en creación de ventas y movimientos de inventario

Los endpoints POST que crean una venta o un movimiento de inventario MUST exigir el header
`Idempotency-Key`. Reintentar el mismo request con la misma clave de idempotencia MUST devolver el
mismo resultado sin crear un segundo registro. Los casos de error siguen la práctica del borrador
IETF `draft-ietf-httpapi-idempotency-key-header-07` (expirado; se usa como referencia, no como
estándar), respondiendo siempre en formato problem+json (API4):

| Caso | Respuesta |
|---|---|
| Falta el header en un endpoint que lo exige | `400` |
| Misma clave con un contenido distinto al del request original | `422` |
| Misma clave mientras el request original todavía se procesa | `409` |

La clave es única por usuario y endpoint. El servidor compara el contenido del request con una huella
(hash del cuerpo normalizado) guardada junto a la clave. Las claves MUST conservarse por un tiempo
configurable (por defecto 24 h) y la política de expiración MUST publicarse en la documentación de
la API. Tras expirar, la misma clave cuenta como un request nuevo.

Fase que lo implementa: 12 (inventario), 13 (ventas)

#### Scenario: Reintento con la misma clave no duplica la venta

- Dado que un cliente crea una venta con un `Idempotency-Key` y la conexión se corta antes de
  recibir la respuesta,
- Cuando el cliente reintenta el mismo request con la misma clave,
- Entonces el servidor devuelve el resultado de la venta ya creada y no crea una segunda.

#### Scenario: Request sin clave de idempotencia rechazado

- Dado un endpoint que crea movimientos de inventario,
- Cuando llega un POST sin el header `Idempotency-Key`,
- Entonces el servidor responde `400` en problem+json y no crea nada.

#### Scenario: Clave reusada con otro contenido rechazada

- Dado que una venta se creó con una clave de idempotencia,
- Cuando llega otro POST con la misma clave pero con ítems distintos,
- Entonces el servidor responde `422` en problem+json y no crea ni modifica ninguna venta.

#### Scenario: Reintento mientras el original sigue en proceso

- Dado que un POST con cierta clave todavía se está procesando,
- Cuando llega un segundo POST con la misma clave,
- Entonces el servidor responde `409` en problem+json y al final existe una sola venta.

### Requirement: API7 — Autorización por rol

Cada endpoint MUST verificar en el servidor el rol del usuario autenticado (admin/asesor) antes de
ejecutar la operación; el cliente MUST NOT ser el único lugar que decide si una acción está
permitida. La autenticación MUST hacerse con la cookie de sesión `luxe_sesion` (ADR-0021,
`openspec/specs/usuarios/spec.md`): una petición sin sesión válida MUST responder `401` con el código
`peticion-no-autenticada`, y una petición con sesión pero sin el rol exigido MUST responder `403` con
el código `rol-insuficiente`. El rol MUST leerse de la base en cada petición, no de una copia guardada
en la sesión ni en el cliente.

(Previously: el mecanismo de autenticación quedaba sin decidir hasta la Fase 11; la spec solo exigía
que la verificación de rol ocurriera en el servidor.)

Fase que lo implementa: 11a

#### Scenario: Rol insuficiente rechazado en el servidor

- Dado un usuario autenticado con rol `asesor` que llama un endpoint reservado a `admin`,
- Cuando hace el request,
- Entonces el servidor lo rechaza con `403` en problem+json y el código `rol-insuficiente`, sin
  depender de que el cliente no hubiera mostrado la opción.

#### Scenario: Request sin autenticar rechazado

- Dado un request a un endpoint protegido sin credenciales, o con credenciales inválidas o vencidas,
- Cuando llega al servidor,
- Entonces el servidor responde `401` en problem+json, con el código `peticion-no-autenticada`
  (distinto de `rol-insuficiente`), y no ejecuta la operación.

### Requirement: API8 — Endpoints internos fuera del documento público

(Reason: Modificado en 00b: agregada la presencia en el documento interno commiteado para distinguir del público distribuido.)

Los endpoints internos (health check operativo, webhook de Chatwoot, kill switch de administración)
MUST etiquetarse `internal` y MUST excluirse del documento OpenAPI público servido en `/docs` y del
`openapi/openapi.json` distribuido al cliente de back office. Ese mismo endpoint MUST seguir presente,
con la etiqueta `internal`, en el documento OpenAPI **interno** commiteado
(`openapi/openapi.interno.json`, API1, ADR-0010): la exclusión es del documento público que se
distribuye, no del contrato completo que queda commiteado para lint y para el chequeo de deriva.
`GET /health` MUST excluirse del documento público aunque no lleve el prefijo `/api/v1` (API2): es una
ruta operativa para orquestadores de infraestructura, no un recurso del contrato de negocio.

Fase que lo implementa: 00b (exclusión de `/health` del documento público y su presencia en el
documento interno, cuando exista el pipeline OpenAPI; en 00a solo aplican la ruta sin versión de API2
y la intención de etiquetarla `internal`), 04 (webhook), 09 (kill switch)

#### Scenario: Webhook interno no aparece en el documento público

- Dado que el módulo de canales expone el webhook de Chatwoot,
- Cuando se genera el documento OpenAPI público,
- Entonces ese endpoint no aparece en él, aunque el endpoint siga funcionando.

#### Scenario: `GET /health` no aparece en el documento público

- Dado que el servicio expone `GET /health` para que Docker, Dokploy y Uptime Kuma comprueben sus
  dependencias,
- Cuando se genera el documento OpenAPI público servido en `/docs` y el `openapi/openapi.json`
  distribuido al cliente de back office,
- Entonces `GET /health` no aparece en ninguno de los dos, aunque el endpoint siga respondiendo
  normalmente.

#### Scenario: `GET /health` sí aparece en el documento interno, etiquetado `internal`

- Dado que el servicio expone `GET /health` como endpoint operativo,
- Cuando se genera el documento OpenAPI interno commiteado (`openapi/openapi.interno.json`),
- Entonces `GET /health` aparece en él con la etiqueta `internal`, documentado desde su esquema zod de
  respuesta.

## Nota — Requisitos implementados sin cambio de texto en esta fase

API2 (versionado, idioma y nombres estables, ya modificado en 00a con la excepción de `/health`), API3
(convenciones JSON) y API10 (detección de cambios incompatibles en CI) se **implementan** en la Fase
00b tal como ya están redactados en `openspec/specs/api/spec.md`: esta fase construye el pipeline y
los escenarios diferidos por el `verify-report.md` de 00a (los dos de API2), pero no cambia su
comportamiento observable. No llevan bloque `MODIFIED` en este delta (mismo criterio que aplicó 00a
con `privacidad`/R14).

API1 y API8 sí llevan bloque `MODIFIED`: el diseño de esta fase (D1, ADR-0010) separó el documento
**interno** (con `/health` y toda etiqueta `internal`) del documento **público** (sin ellos), y ambos
quedan commiteados en git. Esa separación es comportamiento observable del contrato — qué archivo
existe, qué contiene cada uno — y no solo un detalle de implementación, así que queda en los
requisitos, no solo en el código.
### Requirement: API9 — Documentación interactiva no accesible públicamente en producción

(Reason: Modificado en 00b: ampliado de protección en producción a protección en todo entorno distinto de desarrollo, y agregado rechazo de arranque.)

La interfaz Scalar (`/docs`) MUST estar protegida por autenticación o desactivada en cualquier entorno
que no sea desarrollo (incluye preproducción y producción); MUST NOT ser accesible sin protección para
cualquiera que conozca la URL fuera del entorno de desarrollo. Además, el proceso MUST rechazar
arrancar cuando la configuración combina `NODE_ENV=production` con la variable que habilita `/docs`
en verdadero (PLT1): la protección no depende únicamente de una comprobación en tiempo de ejecución
que alguien podría olvidar, sino de una validación de configuración que impide el arranque.

Fase que lo implementa: 00b (pipeline, rechazo de arranque), 09 (endurecimiento en producción)

#### Scenario: `/docs` accesible en desarrollo

- Dado el servicio corriendo en entorno de desarrollo,
- Cuando alguien visita `/docs`,
- Entonces puede ver la documentación interactiva sin autenticación adicional.

#### Scenario: `/docs` protegido fuera de desarrollo

- Dado el servicio desplegado en un entorno distinto de desarrollo (preproducción o producción),
- Cuando alguien sin sesión autenticada visita `/docs`,
- Entonces no puede ver la documentación interactiva (queda detrás de autenticación o desactivada).

#### Scenario: El proceso rechaza arrancar con `/docs` habilitado en producción

- Dado que la configuración fija `NODE_ENV=production` y la variable que habilita `/docs` en
  verdadero,
- Cuando el proceso intenta arrancar,
- Entonces la validación de configuración de arranque (PLT1) lo rechaza y el proceso no arranca, de
  modo que `/docs` no puede encenderse en producción ni por accidente.

### Requirement: API10 — Detección de cambios incompatibles en CI

CI MUST lintear el contrato generado con Spectral y MUST comparar el contrato de la rama contra
`main` con oasdiff; un cambio incompatible (breaking change) sin versión nueva (`/api/v2`) MUST
hacer fallar el build.

Fase que lo implementa: 00b (pipeline), cada fase con endpoints

#### Scenario: Cambio incompatible sin nueva versión bloquea el build

- Dado un PR que quita un campo de la respuesta de un endpoint ya publicado en `/api/v1`,
- Cuando CI compara el contrato de la rama contra `main` con oasdiff,
- Entonces detecta el cambio como incompatible y el build falla, salvo que el cambio se publique
  como `/api/v2`.

### Requirement: API11 — El contrato declara la autenticación por cookie

El documento OpenAPI MUST declarar el esquema de seguridad `cookieAuth` (`type: apiKey`, `in: cookie`,
`name: luxe_sesion`) y MUST aplicarlo a toda operación protegida. Las operaciones marcadas con
`@Publico()` MUST declarar `security: []`. Toda operación con método `POST`, `PUT`, `PATCH` o `DELETE`
bajo `/api/v1`, salvo el webhook de Chatwoot, MUST documentar el encabezado obligatorio `X-Luxe-Csrf`
(USR7). Las respuestas `401` y `403` de las operaciones protegidas MUST documentarse con
`application/problem+json`. El documento público y el interno MUST regenerarse en el mismo commit que
cambia la seguridad, y la verificación de deriva (API1) MUST quedar en verde.

Fase que lo implementa: 11a

#### Scenario: El documento público declara `cookieAuth`

- Dado el contrato generado,
- Cuando se lee `components.securitySchemes`,
- Entonces existe `cookieAuth` con `type: apiKey`, `in: cookie` y `name: luxe_sesion`.

#### Scenario: Una operación protegida exige la cookie en el contrato

- Dado la operación `obtenerSesionActual` (`GET /api/v1/auth/yo`),
- Cuando se lee en el contrato,
- Entonces declara `security: [{ cookieAuth: [] }]` y una respuesta `401` en problem+json.

#### Scenario: El inicio de sesión es público en el contrato

- Dado la operación `iniciarSesion` (`POST /api/v1/auth/sesion`),
- Cuando se lee en el contrato,
- Entonces declara `security: []` y el encabezado obligatorio `X-Luxe-Csrf`.
