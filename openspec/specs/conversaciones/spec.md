# Conversaciones — Specification

## Purpose

Una conversación es una sesión de atención con un contacto por un canal (`SPEC.md` §6). Este dominio
decide, para cada mensaje entrante ya normalizado por `canales`, si lo atiende el bot, un humano, o
nadie (kill switch); agrupa ráfagas de mensajes en un solo turno; protege ese turno contra que el bot
escriba por encima de un humano; y es el único punto por el que sale cualquier respuesta al cliente.
Es la parte del sistema donde un bug se ve directamente de cara al cliente: el peor resultado posible
es un cliente que escribe y nadie le responde.

## Requirements

### Requirement: R5 — Único punto de salida que relee el estado antes de cada mensaje

Toda respuesta al cliente MUST pasar por un único punto de salida que, antes de enviar **cada**
mensaje de una secuencia, relee el estado de la conversación y, si no es `bot`, MUST abortar el resto
de la secuencia sin enviar los mensajes restantes.

Fase que lo implementa: 04, 05

#### Scenario: El estado cambia a humano mientras se envía una secuencia de varios mensajes

- Dado que una secuencia de varios mensajes está en curso de envío para una conversación en estado
  `bot`,
- Cuando el estado cambia a `humano` antes de enviar uno de los mensajes siguientes de la secuencia,
- Entonces el punto único de salida aborta el resto de la secuencia sin enviar los mensajes
  restantes.

#### Scenario: El estado sigue en bot durante todo el envío

- Dado que una secuencia de varios mensajes está en curso de envío para una conversación en estado
  `bot`,
- Cuando el estado sigue en `bot` durante todo el envío,
- Entonces se envían todos los mensajes de la secuencia en orden.

### Requirement: R6 — Máquina de estados bot/handoff_pendiente/humano/pausado

El sistema MUST modelar el estado de atención de una conversación con exactamente los estados `bot`,
`handoff_pendiente`, `humano` y `pausado`. El sistema MUST rechazar, lanzando una excepción, cualquier
transición hacia `bot` cuyo origen no sea `ttl`, `admin`, `chatwoot_pending` o `chatwoot_resolved`, y
cualquier transición hacia `pausado` cuyo origen no sea `admin`. El LLM MUST NOT devolver una
conversación al estado `bot` bajo ninguna circunstancia: no existe ningún origen de transición
disponible para el agente que resulte en `bot`.

Fase que lo implementa: 05

#### Scenario: Un origen no permitido no puede devolver la conversación a bot

- Dado una conversación en estado `humano`,
- Cuando se intenta transicionarla a `bot` con un origen distinto de `ttl`, `admin`,
  `chatwoot_pending` o `chatwoot_resolved`,
- Entonces la transición lanza una excepción y el estado de la conversación no cambia.

#### Scenario: Un origen no permitido no puede llevar la conversación a pausado

- Dado una conversación en estado `bot`,
- Cuando se intenta transicionarla a `pausado` con un origen distinto de `admin`,
- Entonces la transición lanza una excepción y el estado de la conversación no cambia.

#### Scenario: Un origen permitido devuelve la conversación a bot

- Dado una conversación en estado `humano`,
- Cuando se transiciona a `bot` con origen `chatwoot_resolved`,
- Entonces la conversación queda en estado `bot`.

### Requirement: R7 — El control humano es un préstamo con vencimiento

Todo estado que silencia al bot MUST vencer automáticamente sin intervención humana: `humano` tras
`HUMANO_TTL_HORAS` sin ningún mensaje del asesor, y `handoff_pendiente` tras `HANDOFF_TTL_MIN` sin que
nadie lo recoja. Al vencer, el sistema MUST devolver la conversación a `bot` con origen `ttl` y MUST
NOT enviar ningún mensaje al cliente en ese momento. El sistema MUST evitar dejar a un cliente sin
ninguna respuesta, ni del bot ni de una persona.

Fase que lo implementa: 05

#### Scenario: humano vence sin actividad del asesor

- Dado una conversación en estado `humano` cuyo vencimiento (`HUMANO_TTL_HORAS` desde el último
  mensaje del asesor) ya pasó,
- Cuando corre el barrido de vencimientos,
- Entonces la conversación vuelve a `bot` con origen `ttl` y no se envía ningún mensaje al cliente.

#### Scenario: handoff_pendiente vence sin ser recogido

- Dado una conversación en estado `handoff_pendiente` cuyo vencimiento (`HANDOFF_TTL_MIN` desde que
  entró a ese estado) ya pasó, sin que ningún asesor haya escrito,
- Cuando corre el barrido de vencimientos,
- Entonces la conversación vuelve a `bot` con origen `ttl` y no se envía ningún mensaje al cliente.

#### Scenario: Un mensaje del asesor renueva la ventana de humano

- Dado una conversación en estado `humano`,
- Cuando llega un nuevo eco humano para esa conversación antes de que venza `HUMANO_TTL_HORAS`,
- Entonces el vencimiento se recalcula desde ese mensaje y la conversación permanece en `humano`.

#### Scenario: El asesor resuelve la conversación

- Dado que el asesor resuelve la conversación desde la bandeja (Chatwoot),
- Cuando ese cambio de estado llega como evento de canal,
- Entonces la conversación transiciona a `bot` con origen `chatwoot_resolved`, sin esperar el
  vencimiento del plazo.

### Requirement: R8 — Tres capas contra la sobreescritura bot/humano, más un lock por conversación

El sistema MUST implementar tres capas de defensa para que el bot nunca escriba por encima de un
humano: (1) un debounce cuyo job por conversación se reemplaza con cada mensaje nuevo del cliente,
(2) al recibir un eco humano, cancelar el job diferido pendiente de esa conversación y vaciar su
buffer, y (3) la relectura de estado del punto único de salida (R5). Además, el sistema MUST impedir
con un lock que dos procesamientos de la misma conversación corran en paralelo.

Fase que lo implementa: 05

#### Scenario: Eco humano durante la ventana de debounce cancela el job

- Dado un mensaje del cliente acumulado en el buffer de una conversación, con su job de debounce
  todavía pendiente,
- Cuando llega un eco humano para esa misma conversación antes de que el job corra,
- Entonces el job diferido se cancela, el buffer se vacía y no se envía ningún mensaje al cliente.

#### Scenario: Dos procesamientos de la misma conversación no corren en paralelo

- Dado que el procesamiento del turno de una conversación ya tiene el lock adquirido,
- Cuando otro job intenta procesar la misma conversación al mismo tiempo,
- Entonces el segundo job no adquiere el lock y no genera ninguna respuesta duplicada.

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

### Requirement: CNV1 — Una ráfaga de mensajes produce una sola invocación del generador de respuesta

El debounce MUST agrupar los mensajes de una misma ráfaga del cliente (varios mensajes seguidos
dentro de la ventana `DEBOUNCE_MS`) para que produzcan una sola invocación del generador de
respuesta, no una por mensaje.

Fase que lo implementa: 05

#### Scenario: Cuatro mensajes del cliente en 3 segundos producen una sola invocación

- Dado que un contacto en estado `bot` envía cuatro mensajes seguidos dentro de una ventana de 3
  segundos,
- Cuando el debounce agrupa la ráfaga y el job corre,
- Entonces el generador de respuesta se invoca exactamente una vez para los cuatro mensajes.

### Requirement: CNV2 — El estado humano no genera llamadas al generador de respuesta

Mientras una conversación esté en estado `humano`, los mensajes entrantes MUST registrarse pero
MUST NOT invocar el generador de respuesta ni producir ninguna respuesta al cliente.

Fase que lo implementa: 05

#### Scenario: Tres mensajes entrantes en estado humano no generan ninguna respuesta

- Dado una conversación en estado `humano`,
- Cuando el contacto envía tres mensajes seguidos,
- Entonces los tres mensajes quedan registrados, el generador de respuesta no se invoca ninguna vez
  y no se envía ninguna respuesta al cliente.

### Requirement: CNV3 — Aviso único de espera en handoff_pendiente

Si el cliente escribe en estado `handoff_pendiente` después de que pasó `HANDOFF_ESPERA_MIN` sin eco
humano, el sistema MUST enviar como máximo un único mensaje de espera por esa entrada a
`handoff_pendiente`, y MUST NOT enviar un segundo aunque el cliente siga escribiendo.

Fase que lo implementa: 05

#### Scenario: El primer mensaje del cliente tras la espera recibe un único aviso

- Dado una conversación en `handoff_pendiente` desde antes de `HANDOFF_ESPERA_MIN`, sin eco humano,
- Cuando el cliente escribe después de que pasó `HANDOFF_ESPERA_MIN`,
- Entonces se envía exactamente un mensaje de espera al cliente.

#### Scenario: Un segundo mensaje del cliente no repite el aviso

- Dado una conversación en `handoff_pendiente` que ya envió su único mensaje de espera,
- Cuando el cliente vuelve a escribir sin que haya llegado eco humano,
- Entonces no se envía ningún mensaje adicional.

### Requirement: CNV4 — El interruptor global apagado silencia al bot sin dejar de registrar

Cuando el interruptor global (`bot:activo`) está apagado, un mensaje entrante MUST registrarse pero
MUST NOT generar ninguna llamada al generador de respuesta ni ninguna respuesta al cliente.

Fase que lo implementa: 05 (lectura); 09 (escritura, endpoint administrativo)

#### Scenario: Con el interruptor apagado, el mensaje se registra sin generar respuesta

- Dado el interruptor global en estado apagado,
- Cuando llega un mensaje de un contacto en estado `bot`,
- Entonces el mensaje se registra y no se genera ninguna respuesta.

### Requirement: CNV5 — El consumidor de eventos de canal traduce cada tipo de evento a su transición

`conversaciones` MUST registrarse como el consumidor de `CONSUMIDOR_EVENTOS_CANAL` y MUST traducir
cada tipo de `EventoCanal` a la acción correspondiente: un mensaje entrante al buffer con debounce,
un mensaje humano (eco) a la transición a `humano` con cancelación del job y vaciado del buffer, y un
cambio de estado de la conversación en Chatwoot a la transición equivalente (`pending` → `bot`,
`resolved` → `bot`, `open` sobre una conversación en `bot` → `humano`).

Fase que lo implementa: 05

#### Scenario: Un evento de estado "pending" sobre una conversación en manos humanas la devuelve al bot

- Dado una conversación en estado `humano`,
- Cuando llega un evento de canal de tipo `estado-conversacion` con `status: pending`,
- Entonces la conversación transiciona a `bot` con origen `chatwoot_pending`.

#### Scenario: Un evento de estado "open" sobre una conversación en bot equivale a un eco humano

- Dado una conversación en estado `bot`,
- Cuando llega un evento de canal de tipo `estado-conversacion` con `status: open`,
- Entonces la conversación transiciona a `humano` con origen `eco_humano`.

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

### Requirement: CNV10 — Los pasos de imagen salen por el punto único de salida

Un paso de respuesta de tipo imagen (clave de objeto y leyenda opcional) MUST salir por el mismo
punto único de salida que el texto (R5), en el orden en que el generador lo devolvió, con el mismo
estado requerido `bot` y la misma relectura por paso (CNV9). Si el canal del turno no admite imagen
(capacidades, CNV7), el paso de imagen MUST omitirse sin enviar nada en su lugar.

Fase que lo implementa: 07b

#### Scenario: Un texto seguido de un collage sale como dos mensajes en orden

- Dado una respuesta con un paso de texto y un paso de imagen,
- Cuando se envía por el punto único de salida,
- Entonces se encola primero el mensaje de texto y después el de imagen, ambos con estado requerido
  `bot`.

#### Scenario: Un canal que no admite imagen omite el paso de imagen

- Dado un turno cuyo canal no admite imagen y una respuesta con texto e imagen,
- Cuando se envía,
- Entonces solo se encola el mensaje de texto.
