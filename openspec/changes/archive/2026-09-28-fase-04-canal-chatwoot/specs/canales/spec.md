# Canales Specification

## Purpose

Este delta expande el dominio `canales` (Fase 04, `docs/fases/README.md` fila 04) sobre el esqueleto
existente (`openspec/specs/canales/spec.md`: R3 y R4, con escenarios genéricos marcados
`Fase que lo implementa: 04`). **No modifica R3 ni R4**: agrega los requisitos concretos que le
faltaban al esqueleto con el prefijo nuevo `CAN#`, cubriendo el flujo completo de entrada (ACK, firma
ausente, evento desconocido, reintentos del procesador, redacción del payload) y de salida (puerto de
canal de salida, adaptador Chatwoot, reintento del publicador del outbox según el código HTTP, perfil
de capacidades) descrito en la proposal de esta fase. Usa el inbox/outbox de **ADR-0004** (tablas
`evento_entrante`/`outbox`, ya migradas en la Fase 01) y el puerto de canal único de **ADR-0005**
(Chatwoot como único adaptador de canal).

En esta fase el consumidor del inbox solo registra el evento normalizado (skill `luxeboreal-fases` §4:
"primero la entrada con un procesador que solo registra"); la Fase 05 conecta la máquina de estados
detrás del mismo puerto de consumo.

Fuera de esta spec (ver proposal, Out of Scope): la máquina de estados bot/humano y la relectura del
estado de la conversación antes de cada envío (parte de R5 que depende de la FSM de la Fase 05), la
escritura de `contacto` a partir de `chatwoot_contact_id`, cualquier cambio al puerto `Horario`, la
política de auto-resolución de Chatwoot, el indicador "escribiendo…"/plantillas y campañas de
WhatsApp, las notificaciones a Telegram vía outbox, la purga de `evento_entrante` a los 30 días, y las
columnas de canales distintos de WhatsApp en el perfil de capacidades.

No se agrega delta a `conversaciones`/R5 en esta fase: sus dos escenarios dependen del estado de la
conversación, y la máquina de estados que lo produce todavía no existe (Fase 05). Esta fase deja
construido el punto único de salida (CAN6) que R5 reutilizará.

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada test
de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título exacto de
los encabezados `#### Scenario:` de abajo, sin parafrasear.

## ADDED Requirements

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
dominio (enviar un mensaje a una conversación, cambiar su estado, etiquetarla), sin que quien lo invoca
conozca el formato de la API de Chatwoot. El adaptador Chatwoot MUST traducir cada operación a la
llamada HTTP correspondiente con el header `api_access_token`: `POST
.../conversations/{id}/messages`, `POST .../toggle_status` y `POST .../labels`.

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
