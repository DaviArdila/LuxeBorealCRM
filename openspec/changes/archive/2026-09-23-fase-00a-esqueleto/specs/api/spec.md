# Delta for API

## MODIFIED Requirements

### Requirement: API2 — Versionado, idioma y nombres estables

Toda ruta pública MUST empezar con el prefijo `/api/v1`, con **una única excepción operativa
explícita**: `GET /health`, que MUST NOT llevar el prefijo de versión, porque Docker, Dokploy y
Uptime Kuma la consultan en una ruta fija conocida de antemano. Los recursos MUST nombrarse en
plural y en español (`/api/v1/ventas`, no `/api/v1/sales` ni `/api/v1/venta`). Cada operación MUST
tener un `operationId` estable que no cambia entre despliegues salvo que la operación cambie de
forma incompatible.

Fase que lo implementa: 00a (excepción de `/health`), 00b (convención), 11-14 (recursos concretos)

(Previously: no existía excepción al prefijo `/api/v1`; se agrega `GET /health` como única ruta
pública sin versión, decidido en 00a — Q1 de `openspec/changes/fase-00a-esqueleto/proposal.md`.)

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
- Cuando se expone o se documenta,
- Entonces su ruta es `/health`, sin el prefijo `/api/v1`, y es la única ruta pública del sistema
  que se documenta como excepción explícita a la regla de versionado.

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
