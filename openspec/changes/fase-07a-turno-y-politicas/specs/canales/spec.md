# Delta for Canales

## ADDED Requirements

### Requirement: CAN9 — Guardia de envío por paso antes de publicar un mensaje

El publicador de mensajes de `canales` MUST consultar, antes de enviar cada paso de una secuencia que
declara un estado requerido, una guardia de envío registrada por el módulo que encoló el mensaje
(`conversaciones`), sin que `canales` conozca la máquina de estados. Si la guardia niega el envío, el
paso MUST NOT enviarse y MUST tratarse como fallo permanente de ese paso: los pasos restantes de la
misma secuencia quedan abortados (mecanismo `abortarSecuencia` del outbox). Un paso sin estado
requerido y la ausencia de una guardia registrada MUST enviarse como hasta ahora (compatibilidad con
las Fases 04 y 05).

Fase que lo implementa: 07a

#### Scenario: La guardia niega el envío y la secuencia se aborta

- Dado una secuencia de dos pasos que requieren `bot` y una guardia que responde "no" para esa
  conversación,
- Cuando el publicador procesa el primer paso,
- Entonces no se llama a Chatwoot, ese paso queda con error y el segundo queda como secuencia
  abortada.

#### Scenario: Un paso sin estado requerido se envía sin consultar la guardia

- Dado un mensaje encolado sin estado requerido,
- Cuando el publicador lo procesa,
- Entonces se envía a Chatwoot sin consultar ninguna guardia.
