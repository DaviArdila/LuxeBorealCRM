# Delta for API

## MODIFIED Requirements

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
