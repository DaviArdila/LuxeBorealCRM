# Canales — Specification

## Purpose

Los eventos del cliente entran por el canal de mensajería (Chatwoot, que a su vez normaliza
WhatsApp y otros canales) y las respuestas salen por el mismo canal. Este dominio cubre las
garantías de seguridad y de entrega que valen para **todo** evento entrante y **todo** mensaje
saliente, sin importar el canal de origen (`docs/analisis/05-multicanal.md`).

## Requirements

### Requirement: R3 — Validación de firma antes de cualquier lógica

El sistema MUST validar la firma del evento entrante sobre el cuerpo (body) crudo antes de ejecutar
cualquier lógica de negocio. Si la firma es inválida, el sistema MUST responder 401 sin registrar el
payload.

Fase que lo implementa: 04

#### Scenario: Evento con firma válida

- Dado que llega un evento con firma válida,
- Cuando se procesa el webhook,
- Entonces se registra en el inbox de eventos y continúa el procesamiento.

#### Scenario: Evento con firma inválida

- Dado que llega un evento con firma inválida,
- Cuando se procesa el webhook,
- Entonces el sistema responde 401 y el payload no se registra.

### Requirement: R4 — Procesamiento y envío únicos

Cada mensaje entrante MUST procesarse una sola vez y cada mensaje saliente MUST enviarse una sola
vez, aunque haya reintentos del proveedor del canal o de la cola de trabajos.

Fase que lo implementa: 04

#### Scenario: Reintento del proveedor sobre un evento entrante

- Dado que el mismo evento entrante llega dos veces (reintento del proveedor del canal),
- Cuando se procesa,
- Entonces la lógica de negocio se ejecuta una sola vez (deduplicación por identificador externo del
  evento).

#### Scenario: Reintento de un job de envío tras un fallo

- Dado que un job de envío falla después de enviar el primer mensaje de una secuencia y se
  reintenta,
- Cuando se reanuda,
- Entonces retoma desde el primer paso no marcado como enviado, sin duplicar el mensaje ya enviado
  al cliente.

### Requirement: CAN1 — ACK del webhook en menos de 500 ms

El sistema MUST responder al webhook de Chatwoot en menos de 500 ms, desde que llega la petición hasta
que el evento queda insertado en `evento_entrante`, sin esperar a que el procesador BullMQ lo consuma
(SPEC.md §5; Chatwoot corta a los 5 s y, si no hay respuesta, reintenta 3 veces y reabre la
conversación con una nota de error).

#### Scenario: El webhook responde antes de 500 ms tras registrar el evento

- Dado un evento con firma válida y de un tipo reconocido,
- Cuando llega al webhook,
- Entonces el sistema responde con un código 2xx en menos de 500 ms, sin esperar a que el procesador
  del inbox lo consuma.

### Requirement: CAN2 — Firma ausente se rechaza igual que una firma inválida

El sistema MUST responder 401 sin registrar el payload cuando la petición no trae la cabecera
`X-Chatwoot-Signature` o `X-Chatwoot-Timestamp`, con el mismo tratamiento que una firma inválida (R3).

#### Scenario: Una petición sin cabecera de firma se rechaza sin registrar nada

- Dado que llega una petición al webhook sin la cabecera `X-Chatwoot-Signature`,
- Cuando se procesa el webhook,
- Entonces el sistema responde 401 y no queda ninguna fila nueva en `evento_entrante`.

### Requirement: CAN3 — Evento de tipo desconocido se ignora sin registrarse

El sistema MUST reconocer únicamente los eventos `message_created` (con `message_type`
`incoming`/`outgoing`) y `conversation_status_changed` (con `status` en la raíz del payload); MUST
responder 2xx sin insertar ninguna fila en `evento_entrante` cuando el evento recibido, con firma
válida, no es de ninguno de esos dos tipos.

#### Scenario: Un evento de un tipo distinto a los reconocidos se ignora sin registrarse

- Dado un evento con firma válida cuyo tipo no es `message_created` ni `conversation_status_changed`,
- Cuando se procesa el webhook,
- Entonces el sistema responde 2xx y no queda ninguna fila nueva en `evento_entrante`.

### Requirement: CAN4 — El procesador del inbox agota los reintentos sin perder el evento

Cuando el consumidor del evento normalizado falla, el procesador BullMQ del inbox MUST reintentarlo; al
agotar los reintentos configurados, MUST marcar la fila de `evento_entrante` con `error` e `intentos`
visibles, sin borrarla ni perder el evento.

#### Scenario: Un consumidor que falla siempre agota los reintentos con error e intentos visibles

- Dado un evento válido cuyo consumidor falla en cada intento,
- Cuando el procesador agota los reintentos configurados,
- Entonces la fila de `evento_entrante` queda con `error` e `intentos` visibles, y sigue existiendo en
  la tabla.

### Requirement: CAN5 — Redacción del payload del inbox (R14)

El sistema MUST guardar en `evento_entrante.payload` únicamente ids, tipo de evento y metadatos
(incluidos `chatwoot_contact_id` y `conversation.channel`); MUST NOT guardar el texto del mensaje,
adjuntos, teléfono completo ni ningún otro dato personal del contacto (R14, P15).

#### Scenario: Un evento con texto y adjuntos se registra sin ese contenido

- Dado un evento `message_created` cuyo payload de Chatwoot trae el texto del mensaje y un adjunto,
- Cuando se registra en el inbox,
- Entonces `evento_entrante.payload` no contiene el texto del mensaje ni el adjunto, solo ids, tipo de
  evento y metadatos.

#### Scenario: El teléfono completo del contacto nunca queda en el payload guardado

- Dado un evento cuyo payload de Chatwoot trae el número de teléfono completo del contacto,
- Cuando se registra en el inbox,
- Entonces `evento_entrante.payload` no contiene el teléfono completo del contacto.

### Requirement: CAN6 — Puerto de canal de salida con tipos propios; el adaptador Chatwoot traduce a su API

El sistema MUST exponer un puerto de canal de salida cuyas operaciones se expresan en tipos propios del
dominio (enviar mensajes de texto o de imagen a una conversación, cambiar su estado, etiquetarla), sin
que quien lo invoca conozca el formato de la API de Chatwoot. Un mensaje de imagen MUST expresarse con
la clave del objeto en el almacenamiento (MED1) y una leyenda opcional, nunca con bytes ni URLs. El
adaptador Chatwoot MUST traducir cada operación a la llamada HTTP correspondiente con el header
`api_access_token`: `POST .../conversations/{id}/messages` (JSON para texto; `multipart/form-data` con
el adjunto en `attachments[]` para imagen), `POST .../toggle_status` y `POST .../labels`.

(Previously: el puerto solo admitía mensajes de texto.)

Fase que lo implementa: 04 (texto, estado, etiquetas); 07b (imagen)

#### Scenario: Enviar un mensaje a través del puerto se traduce a la llamada de mensajes de Chatwoot

- Dado un mensaje dirigido a una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../conversations/{id}/messages` con el header `api_access_token`.

#### Scenario: Cambiar el estado de una conversación se traduce a la llamada de toggle_status

- Dado un cambio de estado de una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../toggle_status` con el header `api_access_token`.

#### Scenario: Etiquetar una conversación se traduce a la llamada de labels

- Dada una etiqueta dirigida a una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../labels` con el header `api_access_token`.

#### Scenario: Enviar una imagen sube el adjunto multipart con su leyenda

- Dado un mensaje de imagen con una clave de objeto guardada y una leyenda,
- Cuando el publicador lo procesa,
- Entonces se leen los bytes del almacenamiento y se realiza un `POST` multipart a
  `.../conversations/{id}/messages` con el archivo en `attachments[]` y la leyenda como contenido.
### Requirement: CAN7 — Reintento del publicador del outbox según el código HTTP de Chatwoot

El publicador del `outbox` MUST reintentar con backoff cuando la API de Chatwoot responde 429 o 5xx, o
ante un error de red, y MUST fallar de inmediato sin reintentar cuando responde un 4xx distinto de 429.
Cada fila del `outbox` MUST llevar su `clave_idempotencia` por paso (B5) para que un reintento no
duplique un efecto ya entregado al cliente.

#### Scenario: Un 429 o 5xx de Chatwoot se reintenta con backoff

- Dado un efecto en el `outbox` cuyo primer intento de envío a Chatwoot responde 429 o 5xx,
- Cuando el publicador lo reintenta,
- Entonces el reintento respeta `proximo_intento` con backoff, sin marcar la fila como `error`
  definitivo tras el primer fallo.

#### Scenario: Un 4xx de Chatwoot falla de inmediato sin reintentar

- Dado un efecto en el `outbox` cuyo envío a Chatwoot responde con un código 4xx distinto de 429,
- Cuando el publicador procesa esa fila,
- Entonces la fila queda marcada con `error` sin ningún reintento adicional.

### Requirement: CAN8 — Perfil de capacidades por canal

El sistema MUST exponer una función pura que, a partir de `conversation.channel`, devuelva el perfil de
capacidades del canal (ventana de respuesta, costo por mensaje saliente, si trae teléfono, adjuntos
soportados, límite de texto de listas/botones). Para WhatsApp MUST devolver los valores reales de
`docs/analisis/05-multicanal.md`; para cualquier otro canal MUST devolver un perfil explícito marcado
como no soportado, sin inventar valores "por verificar".

#### Scenario: El canal WhatsApp devuelve su perfil de capacidades real

- Dado un evento cuyo `conversation.channel` es de WhatsApp,
- Cuando se consulta su perfil de capacidades,
- Entonces el resultado trae los valores reales del canal (ventana de 24 h, costo por mensaje, tiene
  teléfono, límites de listas/botones de 24/72 caracteres).

#### Scenario: Un canal distinto de WhatsApp devuelve un perfil explícito de no soportado

- Dado un evento cuyo `conversation.channel` no es WhatsApp,
- Cuando se consulta su perfil de capacidades,
- Entonces el resultado es un perfil marcado explícitamente como no soportado, sin ningún valor
  inventado "por verificar".

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

### Requirement: CAN10 — Una imagen reintentada no se duplica

Cada mensaje de imagen MUST llevar su clave de idempotencia por paso (B5) hasta Chatwoot, y el
publicador MUST reconciliar antes de reintentar una imagen cuyo intento anterior no terminó con
certeza, igual que con el texto (D13 de la Fase 04). Si Chatwoot no conserva la marca en un mensaje
multipart, la marca MUST viajar en el nombre del archivo adjunto y la reconciliación MUST buscarla
ahí.

Fase que lo implementa: 07b

#### Scenario: Un reintento de una imagen ya creada no la envía otra vez

- Dado un mensaje de imagen cuyo primer intento creó el mensaje en Chatwoot pero no se marcó como
  enviado,
- Cuando el publicador lo reintenta,
- Entonces encuentra la marca en Chatwoot y marca la fila como enviada sin un segundo `POST`.
