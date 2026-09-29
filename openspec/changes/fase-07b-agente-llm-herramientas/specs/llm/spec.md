# Delta for LLM

## ADDED Requirements

### Requirement: LLM14 — El llamador puede acotar el tiempo de una generación

`SolicitudGeneracion` MUST aceptar un campo opcional `plazoMs` (milisegundos restantes del turno de
quien llama, ADR-0018). El gateway MUST usar como presupuesto total de esa invocación el menor entre su
propio presupuesto (derivado de `LOCK_TURNO_TTL_S`, D3 de la Fase 06) y `plazoMs`, aplicando la misma
regla de no reintentar con 2 segundos o menos. Sin `plazoMs`, el comportamiento MUST ser idéntico al
de la Fase 06. Un `plazoMs` de 0 o negativo MUST devolver el error tipado `timeout` sin llamar al
proveedor.

Fase que lo implementa: 07b

#### Scenario: LLM14 — Un plazo menor que el presupuesto propio acota el intento

- Dado un gateway con presupuesto propio de 25 segundos y timeout de perfil de 15 segundos,
- Cuando se pide una generación con `plazoMs` de 8 000,
- Entonces el intento recibe como máximo 8 segundos y no se reintenta si quedan 2 segundos o menos.

#### Scenario: LLM14 — Un plazo agotado no llama al proveedor

- Dado una solicitud con `plazoMs` igual a 0,
- Cuando se pide la generación,
- Entonces el gateway devuelve el error tipado `timeout` sin ninguna llamada al proveedor.
