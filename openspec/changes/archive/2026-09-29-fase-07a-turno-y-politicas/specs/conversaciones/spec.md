# Delta for Conversaciones

## MODIFIED Requirements

### Requirement: CNV6 — El agente eco responde con el texto del último mensaje del turno

El *stand-in* del generador de respuesta ("agente eco") MUST responder con un único paso de texto cuyo
contenido es el del último mensaje del turno, sin producir ningún `handoff`. Sigue siendo el
generador por defecto de `ConversacionesModule` cuando no se compone otro (tests del propio módulo);
la aplicación completa usa el generador del módulo `agente` (ADR-0016). El contrato del puerto se
amplía en la Fase 07a (CNV7, CNV8) y el eco se adapta a esa firma sin cambiar su comportamiento.

(Previously: la Fase 07 reemplazaba el eco "sin cambiar el contrato del puerto"; ese contrato no
alcanzaba para el agente real — sin tipo de contenido, contexto, handoff ni imagen.)

Fase que lo implementa: 05 (stand-in); 07a (contrato ampliado y composición por `AppModule`)

#### Scenario: El agente eco reenvía el texto del último mensaje del turno

- Dado un turno con varios mensajes acumulados en el buffer,
- Cuando el agente eco genera la respuesta,
- Entonces el resultado tiene un único paso de texto cuyo contenido es el del último mensaje del turno
  y no produce ningún `handoff`.

### Requirement: R13 — Límites de costo por conversación

Donde el canal cobra por mensaje saliente, el sistema MUST agrupar cada respuesta en el **menor
número posible** de mensajes salientes (una ficha = un mensaje de texto; una foto cuenta como un
mensaje; collage por defecto). Además MUST aplicar un tope configurable de turnos del bot por sesión de
la conversación (una sesión empieza cada vez que la conversación entra en `bot`; P29) y, al
alcanzarlo, MUST derivar a humano; MUST descartar un mensaje entrante que supere el límite configurado
de mensajes por hora o por día para ese contacto (el mensaje se registra, pero no genera ninguna
respuesta), y MUST registrar el costo estimado de cada llamada al LLM en `uso_llm` para controlar el
techo de gasto mensual (techo del negocio: 20 USD/mes entre VPS, LLM y Meta). El techo se hace
cumplir también con un límite de gasto configurado en la consola del proveedor de LLM (operación,
Fase 09). Al alcanzar el techo desde el código, el turno deriva a humano con el texto
`mensaje_techo_gasto` (P17, Fase 07b).

(Previously: el tope de turnos era "por conversación" sin definir cuándo se reinicia, y el
comportamiento al techo figuraba como pendiente de P17, ya resuelta.)

Fase que lo implementa: 05 (parcial: rate limit por contacto), 06 (costo por llamada al LLM
registrado por el gateway — escenario «Costo de cada llamada al LLM registrado»), 07a (tope de
turnos), 07b (agrupación de mensajes, collage), 07c (evals de «Fotos agrupadas en collage por
defecto»)

#### Scenario: Respuesta agrupada en el mínimo de mensajes

- Dado que la conversación es por un canal donde el mensaje saliente cuesta,
- Cuando el bot responde con la ficha de un producto,
- Entonces la ficha sale como **un solo** mensaje de texto, no fragmentada en varios.

#### Scenario: Fotos agrupadas en collage por defecto

- Dado que el bot va a enviar fotos de un producto en un canal donde el mensaje saliente cuesta,
- Cuando responde,
- Entonces agrupa las fotos en un collage por defecto en vez de enviarlas como mensajes
  individuales.

#### Scenario: Tope de turnos alcanzado

- Dado que una sesión bot de una conversación ya tuvo `AGENTE_TOPE_TURNOS` turnos respondidos,
- Cuando el cliente escribe de nuevo en esa misma sesión,
- Entonces la conversación deriva a humano con el texto de handoff, sin llamar al generador de
  contenido.

#### Scenario: Una sesión nueva reinicia el conteo de turnos

- Dado una conversación que alcanzó el tope de turnos, pasó a humano y volvió a `bot`,
- Cuando el cliente escribe en esa nueva sesión,
- Entonces el bot responde con normalidad y el conteo de turnos arranca desde cero.

#### Scenario: Se supera el límite de mensajes por hora

- Dado un contacto que ya alcanzó `RATE_LIMIT_POR_HORA` mensajes en la hora en curso,
- Cuando envía un mensaje adicional dentro de esa misma hora,
- Entonces el mensaje se registra y no se genera ninguna respuesta.

#### Scenario: Se supera el límite de mensajes por día

- Dado un contacto que ya alcanzó `RATE_LIMIT_POR_DIA` mensajes en el día en curso,
- Cuando envía un mensaje adicional dentro de ese mismo día,
- Entonces el mensaje se registra y no se genera ninguna respuesta.

#### Scenario: Costo de cada llamada al LLM registrado

- Dado que el agente hace una llamada al LLM durante un turno,
- Cuando la llamada termina (con éxito o con error),
- Entonces queda una fila en `uso_llm` con proveedor, modelo, tokens de entrada, salida y caché,
  costo estimado en USD, latencia y resultado, que permite sumar el gasto del mes.

## ADDED Requirements

### Requirement: CNV7 — El generador recibe el contexto del turno y el tipo de cada mensaje

`conversaciones` MUST entregar al generador de respuesta, en cada turno, el contexto de la
conversación (id, id del contacto, canal, versión de la conversación y capacidades de salida del
canal) y cada mensaje con su tipo de contenido (`texto`, `imagen`, `audio`, `ubicacion`, `documento`,
`sticker`, `otro`). El texto de un mensaje MUST leerse de Chatwoot solo si su tipo es `texto`; para los
demás tipos el texto MUST ir vacío, sin llamar a Chatwoot. Las capacidades se calculan en el borde a
partir del perfil del canal (CAN8); un canal sin perfil soportado MUST recibir capacidades
conservadoras (el mensaje saliente cuesta, se admite imagen) en vez de ninguna.

Fase que lo implementa: 07a

#### Scenario: Un audio llega al generador con su tipo y sin leer texto de Chatwoot

- Dado una conversación en `bot` y un mensaje entrante de tipo `audio`,
- Cuando el turno llega al generador,
- Entonces el mensaje llega con tipo `audio` y texto vacío, y no hubo ninguna lectura del mensaje en
  Chatwoot.

#### Scenario: El contexto del turno identifica la conversación, el contacto y la sesión

- Dado una conversación de WhatsApp en `bot` con versión 2,
- Cuando el turno llega al generador,
- Entonces el contexto trae el id de la conversación, el id del contacto, el canal `whatsapp`, la
  versión 2 y capacidades donde el mensaje saliente cuesta.

#### Scenario: Un canal sin perfil soportado recibe capacidades conservadoras

- Dado una conversación del canal `otro`,
- Cuando el turno llega al generador,
- Entonces las capacidades indican que el mensaje saliente cuesta y que se admite imagen.

### Requirement: CNV8 — El handoff que pide el generador lo ejecuta conversaciones, con espejo en el canal

Cuando el generador devuelve un `handoff` con su motivo, `conversaciones` MUST enviar primero los
pasos de la respuesta por el punto único de salida (R5) y después transicionar la conversación a
`handoff_pendiente` (origen `lead_caliente` si el motivo es `lead-caliente`, `regla_handoff_explicita`
para cualquier otro), cancelar el job diferido y vaciar el buffer. Una respuesta sin pasos MUST NOT
enviar ningún mensaje. Toda transición MUST espejarse en el canal por el outbox: a `handoff_pendiente`
o `humano` → estado `abierta`; a `bot` con origen `ttl` o `admin` → estado `pendiente`; con origen
`chatwoot_pending` o `chatwoot_resolved` no se espeja (el cambio vino del propio canal). El evento de
estado que el canal devuelve por ese espejo MUST ser un no-op.

Fase que lo implementa: 07a

#### Scenario: El generador pide handoff y la conversación queda esperando a un asesor

- Dado una conversación en `bot` y un generador que responde un paso de texto y un `handoff` con
  motivo `audio-repetido`,
- Cuando se procesa el turno,
- Entonces se encola ese paso, la conversación queda en `handoff_pendiente` con vencimiento a
  `HANDOFF_TTL_MIN` y se encola el cambio de estado `abierta` en el canal.

#### Scenario: Una respuesta sin pasos no envía ningún mensaje

- Dado un generador que responde sin pasos y sin `handoff`,
- Cuando se procesa el turno,
- Entonces no se encola ningún mensaje y la conversación sigue en `bot`.

#### Scenario: La vuelta al bot por vencimiento se espeja como pendiente

- Dado una conversación en `humano` cuyo control venció,
- Cuando el barrido la devuelve a `bot` con origen `ttl`,
- Entonces se encola el cambio de estado `pendiente` en el canal.

#### Scenario: Una vuelta al bot que vino del canal no se espeja

- Dado una conversación en `humano`,
- Cuando llega el evento de canal `resuelta` y la conversación vuelve a `bot` con origen
  `chatwoot_resolved`,
- Entonces no se encola ningún cambio de estado en el canal.

#### Scenario: El eco del espejo abierta no vuelve a transicionar

- Dado una conversación que el agente dejó en `handoff_pendiente` y cuyo espejo `abierta` ya se
  publicó,
- Cuando llega el evento de canal `abierta` de esa misma conversación,
- Entonces la conversación sigue en `handoff_pendiente` sin ninguna transición nueva.

### Requirement: CNV9 — Cada paso se publica solo si la conversación sigue en el estado requerido

Cada paso de una respuesta del turno MUST llevar el estado de la conversación que requiere para
salir (`bot` para los pasos del turno, `handoff_pendiente` para el aviso de espera de CNV3). Al
publicar cada paso, el sistema MUST releer el estado de la conversación; si ya no es el requerido,
MUST NOT enviar ese paso y MUST abortar los pasos restantes de la misma secuencia (R5 por paso, no
por lote).

Fase que lo implementa: 07a

#### Scenario: La conversación pasa a humano entre dos pasos ya encolados

- Dado una respuesta de dos pasos encolada para una conversación en `bot`, con el primero ya
  publicado,
- Cuando la conversación pasa a `humano` antes de publicar el segundo,
- Entonces el segundo paso no se envía y queda marcado como secuencia abortada.

#### Scenario: El aviso de espera solo sale si la conversación sigue esperando

- Dado un aviso de espera encolado para una conversación en `handoff_pendiente`,
- Cuando un asesor toma la conversación antes de que el aviso se publique,
- Entonces el aviso no se envía.
