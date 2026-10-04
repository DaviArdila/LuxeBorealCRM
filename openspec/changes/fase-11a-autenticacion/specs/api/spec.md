# Delta for API

## MODIFIED Requirements

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

## ADDED Requirements

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
