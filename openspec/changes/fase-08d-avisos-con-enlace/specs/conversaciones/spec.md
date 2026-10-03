# Delta for Conversaciones

## ADDED Requirements

### Requirement: CNV12 — La conversación recuerda que el cliente espera mientras está bajo control humano

Cuando llega un mensaje del cliente a una conversación en `humano` o `handoff_pendiente`, `conversaciones` MUST
registrar que el cliente espera, con el instante del **primer** mensaje sin respuesta de esa espera, y MUST NOT
sobrescribirlo con mensajes posteriores. La marca MUST borrarse cuando un asesor escribe (eco humano), cuando la
conversación vuelve a `bot` o se resuelve. `conversaciones` MUST exponer a los módulos de arriba, por un
registro de observadores (mismo patrón que el de handoff, D7 de la Fase 08), las esperas que superan
`ESPERA_CLIENTE_MIN` minutos, sin importarlos. Registrar o consultar la espera MUST NOT frenar ni alterar el
procesamiento del mensaje (si falla, se registra un `warn` y el mensaje sigue su camino). La marca MUST NOT guardar
el contenido del mensaje (R14).

Fase que lo implementa: 08d

#### Scenario: El primer mensaje sin respuesta abre la espera

- Dado una conversación en `humano`,
- Cuando el cliente escribe a las 10:00 y otra vez a las 10:03 sin que un asesor responda,
- Entonces la espera queda registrada con el instante 10:00.

#### Scenario: El eco humano cierra la espera

- Dado una espera abierta,
- Cuando un asesor escribe en la conversación,
- Entonces la marca de espera se borra.

#### Scenario: Volver a bot cierra la espera

- Dado una espera abierta y una conversación que vence a `bot` con origen `ttl`,
- Cuando se confirma la transición,
- Entonces la marca de espera se borra.

#### Scenario: Una conversación en bot no abre espera

- Dado una conversación en estado `bot`,
- Cuando el cliente escribe,
- Entonces no se registra ninguna espera.

#### Scenario: Un fallo al registrar la espera no pierde el mensaje

- Dado que el almacén de la marca falla,
- Cuando el cliente escribe en `humano`,
- Entonces el mensaje se procesa igual y queda un `warn` sin datos del cliente.

#### Scenario: La marca no guarda el contenido

- Dado un mensaje del cliente en `humano`,
- Cuando se registra la espera,
- Entonces la marca contiene solo el identificador de la conversación y el instante, sin el texto.
