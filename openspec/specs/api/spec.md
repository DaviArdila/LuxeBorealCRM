# API — Specification

## Purpose

Gobierna el contrato de la API pública del back office: cómo se genera, cómo se versiona, qué
convenciones sigue cada endpoint y qué queda fuera del documento público. La decisión de fondo
(OpenAPI 3.1 code-first con el soporte nativo de Standard Schema de NestJS 12 + Scalar; enmienda
2026-09-23) está en `docs/adr/0008-contrato-api-openapi.md`; esta spec define el comportamiento
observable que cada fase con endpoints debe cumplir.

## Requirements

### Requirement: API1 — Contrato OpenAPI generado desde el código

El sistema MUST generar `openapi/openapi.json` a partir de los esquemas zod de cada endpoint, usando
el soporte nativo de Standard Schema de NestJS 12 (`StandardSchemaValidationPipe` + conversión nativa
de `@nestjs/swagger`); el documento commiteado en git MUST coincidir exactamente con el que el código
genera en el momento del build. `openapi/openapi.json` MUST NOT editarse a mano.

Fase que lo implementa: 00b (pipeline y convenciones)

#### Scenario: El contrato generado coincide con el commiteado

- Dado que el repositorio tiene un `openapi/openapi.json` commiteado,
- Cuando CI regenera el documento a partir del código actual,
- Entonces el documento generado es idéntico byte a byte al commiteado y el build pasa; si difieren,
  el build falla.

La generación MUST ser determinista: orden de claves estable, formato fijo (indentación y fin de
línea) y sin valores que dependan del momento o del entorno (fechas, rutas absolutas, hostnames,
variables de entorno). Así el chequeo de deriva solo falla cuando cambió la API de verdad.

#### Scenario: Generar dos veces sin cambios produce el mismo documento

- Dado que el código no cambió,
- Cuando el documento se genera dos veces, en máquinas o momentos distintos,
- Entonces ambos resultados son idénticos byte a byte.

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

Toda respuesta de error MUST usar el formato `application/problem+json` de RFC 9457 y MUST incluir
un código de error propio estable (distinto del `status` HTTP) que el cliente pueda usar para
distinguir el tipo de error sin parsear el mensaje.

Fase que lo implementa: 00b (convención), cada fase con endpoints

#### Scenario: Error de validación en formato problem+json

- Dado que un request llega con un payload inválido,
- Cuando el servidor rechaza el request,
- Entonces responde con `Content-Type: application/problem+json` y un cuerpo que incluye un código
  de error propio estable, además del `status` HTTP.

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
permitida. El mecanismo de autenticación (tipo de token o sesión) se decide en la Fase 11; esta
spec solo exige que la verificación de rol ocurra en el servidor, no fija cómo se autentica.

Fase que lo implementa: 11

#### Scenario: Rol insuficiente rechazado en el servidor

- Dado un usuario autenticado con rol `asesor` que llama un endpoint reservado a `admin`,
- Cuando hace el request,
- Entonces el servidor lo rechaza con `403` en problem+json, sin depender de que el cliente no
  hubiera mostrado la opción.

#### Scenario: Request sin autenticar rechazado

- Dado un request a un endpoint protegido sin credenciales, o con credenciales inválidas o vencidas,
- Cuando llega al servidor,
- Entonces el servidor responde `401` en problem+json, con un código de error propio distinto del
  de rol insuficiente (`403`), y no ejecuta la operación.

### Requirement: API8 — Endpoints internos fuera del documento público

Los endpoints internos (health check operativo, webhook de Chatwoot, kill switch de administración)
MUST etiquetarse `internal` y MUST excluirse del documento OpenAPI público servido en `/docs` y del
`openapi/openapi.json` distribuido al cliente de back office. `GET /health` MUST excluirse del
documento público aunque no lleve el prefijo `/api/v1` (API2): es una ruta operativa para
orquestadores de infraestructura, no un recurso del contrato de negocio.

Fase que lo implementa: 00b (exclusión de `/health` del documento público, cuando exista el pipeline
OpenAPI; en 00a solo aplican la ruta sin versión de API2 y la intención de etiquetarla `internal`),
04 (webhook), 09 (kill switch)

(Previously: la lista de endpoints internos no incluía `/health`; se agrega en 00a al introducirse
el health check.)

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

### Requirement: API9 — Documentación interactiva no accesible públicamente en producción

La interfaz Scalar (`/docs`) MUST estar protegida por autenticación o desactivada en producción; MUST NOT
ser accesible sin protección para cualquiera que conozca la URL.

Fase que lo implementa: 00b (pipeline), 09 (endurecimiento en producción)

#### Scenario: /docs protegido en producción

- Dado el servicio desplegado en producción,
- Cuando alguien sin sesión autenticada visita `/docs`,
- Entonces no puede ver la documentación interactiva (queda detrás de autenticación o desactivada).

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
