# Delta for Conversaciones

Derivar deja de ser un cambio de estado. Un turno puede pedir **avisar al asesor** (`aviso`) sin tocar la máquina de
estados (R6): la conversación sigue en `bot` y el bot sigue respondiendo hasta que el asesor abre o escribe en Chatwoot
(CNV5). El traspaso a `handoff_pendiente` queda solo para cuando el bot no puede seguir: falla del modelo, techo de gasto,
argumentos inválidos, plazo agotado y tope de turnos.

## RENAMED Requirements

- FROM: `### Requirement: CNV11 — El handoff por petición de persona y por lead lo ejecuta conversaciones`
- TO: `### Requirement: CNV11 — El aviso por petición de persona, por lead y por audio repetido lo ejecuta conversaciones sin traspaso`

## MODIFIED Requirements

### Requirement: CNV3 — Aviso único de espera en handoff_pendiente

Si el cliente escribe en estado `handoff_pendiente` después de que pasó `HANDOFF_ESPERA_MIN` sin eco
humano, el sistema MUST enviar (con el texto del caso del sistema `mensaje_espera_handoff`, «Espera del asesor») como máximo un único mensaje de espera por esa entrada a
`handoff_pendiente`, y MUST NOT enviar un segundo aunque el cliente siga escribiendo. La conversación MUST entrar a
`handoff_pendiente` solo por un handoff (CNV8: `fallo-llm`, `techo-gasto`, `argumentos-invalidos`, `plazo-agotado` o
`tope-turnos`); un aviso al asesor (CNV13) MUST NOT producir este mensaje porque la conversación sigue en `bot`.

(Previously: `handoff_pendiente` también lo alcanzaban pedir una persona, el audio repetido y el lead caliente.)

Fase que lo implementa: 05; 12d (qué motivos llegan a `handoff_pendiente`)

#### Scenario: El primer mensaje del cliente tras la espera recibe un único aviso

- Dado una conversación en `handoff_pendiente` desde antes de `HANDOFF_ESPERA_MIN`, sin eco humano,
- Cuando el cliente escribe después de que pasó `HANDOFF_ESPERA_MIN`,
- Entonces se envía exactamente un mensaje de espera al cliente.

#### Scenario: Un segundo mensaje del cliente no repite el aviso

- Dado una conversación en `handoff_pendiente` que ya envió su único mensaje de espera,
- Cuando el cliente vuelve a escribir sin que haya llegado eco humano,
- Entonces no se envía ningún mensaje adicional.

#### Scenario: Un asesor avisado con la conversación en bot no genera mensaje de espera

- Dado una conversación en `bot` cuyo asesor ya fue avisado por una petición de persona,
- Cuando el cliente escribe pasados `HANDOFF_ESPERA_MIN` minutos,
- Entonces el bot responde como en cualquier turno y no se envía el mensaje de espera.

### Requirement: CNV8 — El handoff que pide el generador lo ejecuta conversaciones, con espejo en el canal

Cuando el generador devuelve un `handoff` con su motivo, `conversaciones` MUST enviar primero los
pasos de la respuesta por el punto único de salida (R5) y después transicionar la conversación a
`handoff_pendiente` (origen `regla_handoff_explicita` para todo motivo), cancelar el job diferido y vaciar el buffer. Los
motivos de handoff MUST ser solo `fallo-llm`, `techo-gasto`, `argumentos-invalidos`, `plazo-agotado` y `tope-turnos`; los
motivos de aviso (`lead-caliente`, `pide-persona`, `pide-asesor`, `audio-repetido`) MUST NOT transicionar (CNV13). Una
respuesta sin pasos MUST NOT enviar ningún mensaje. Toda transición MUST espejarse en el canal por el outbox: a
`handoff_pendiente` o `humano` → estado `abierta`; a `bot` con origen `ttl` o `admin` → estado `pendiente`; con origen
`chatwoot_pending` o `chatwoot_resolved` no se espeja (el cambio vino del propio canal). El evento de
estado que el canal devuelve por ese espejo MUST ser un no-op.

(Previously: el handoff también cubría `audio-repetido`, `lead-caliente` y `pide-persona`, con origen `lead_caliente` para el
último de ellos.)

Fase que lo implementa: 07a; 12d (motivos de handoff reducidos a cinco)

#### Scenario: El generador pide handoff y la conversación queda esperando a un asesor

- Dado una conversación en `bot` y un generador que responde un paso de texto y un `handoff` con
  motivo `tope-turnos`,
- Cuando se procesa el turno,
- Entonces se encola ese paso, la conversación queda en `handoff_pendiente` con vencimiento a
  `HANDOFF_TTL_MIN` y se encola el cambio de estado `abierta` en el canal.

#### Scenario: Una falla del modelo sigue llevando a handoff pendiente

- Dado una conversación en `bot` y un generador que responde con el texto de falla y un `handoff` con motivo `fallo-llm`,
- Cuando se procesa el turno,
- Entonces la conversación queda en `handoff_pendiente` y se encola el cambio de estado `abierta` en el canal.

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

### Requirement: CNV11 — El aviso por petición de persona, por lead y por audio repetido lo ejecuta conversaciones sin traspaso

`conversaciones` MUST aceptar en la respuesta del turno un `aviso` con uno de los motivos `pide-persona`, `pide-asesor`,
`lead-caliente` o `audio-repetido`. Un `aviso` MUST NOT transicionar la conversación ni espejar un estado en el canal
(CNV13). El motivo `lead-caliente` MUST agregar la etiqueta `lead-caliente` en el canal. Los pasos de la respuesta MUST
quedar encolados antes de que se avise al asesor.

(Previously: `pide-persona` y `lead-caliente` llevaban la conversación a `handoff_pendiente`, con el aviso encolado tras
confirmar esa transición (NTF3).)

Fase que lo implementa: 08; 12d (aviso sin traspaso)

#### Scenario: Petición de persona avisa y la conversación sigue en bot

- Dado una respuesta del generador con un paso de texto y aviso `pide-persona`,
- Cuando `conversaciones` la procesa,
- Entonces el paso se encola, el asesor es avisado y la conversación sigue en `bot`.

#### Scenario: Lead caliente agrega su etiqueta sin traspasar

- Dado una respuesta del generador con aviso `lead-caliente`,
- Cuando `conversaciones` la procesa,
- Entonces la conversación sigue en `bot` y el canal recibe la etiqueta `lead-caliente`.

#### Scenario: El aviso se encola después de los pasos de la respuesta

- Dado una respuesta con un paso de texto y aviso `audio-repetido`,
- Cuando `conversaciones` la procesa,
- Entonces el paso queda encolado antes de que se encole el aviso al asesor.

#### Scenario: Una respuesta con aviso y handoff ejecuta solo el handoff

- Dado una respuesta del generador con aviso `pide-persona` y handoff `fallo-llm`,
- Cuando `conversaciones` la procesa,
- Entonces la conversación queda en `handoff_pendiente` y el asesor recibe un solo aviso, el del traspaso por falla del modelo.

### Requirement: CNV12 — La conversación recuerda que el cliente espera mientras está bajo control humano

Cuando llega un mensaje del cliente a una conversación en `humano` o `handoff_pendiente`, `conversaciones` MUST
registrar que el cliente espera, con el instante del **primer** mensaje sin respuesta de esa espera, y MUST NOT
sobrescribirlo con mensajes posteriores. Un mensaje del cliente a una conversación en `bot` MUST NOT abrir una espera,
aunque el asesor ya haya sido avisado (CNV14): el bot responde. La marca MUST borrarse cuando un asesor escribe (eco humano), cuando la
conversación vuelve a `bot` o se resuelve. `conversaciones` MUST exponer a los módulos de arriba, por un
registro de observadores (mismo patrón que el de handoff, D7 de la Fase 08), las esperas que superan
`ESPERA_CLIENTE_MIN` minutos, sin importarlos. Registrar o consultar la espera MUST NOT frenar ni alterar el
procesamiento del mensaje (si falla, se registra un `warn` y el mensaje sigue su camino). La marca MUST NOT guardar
el contenido del mensaje (R14).

(Previously: el requisito no decía qué pasa con un asesor avisado y la conversación en `bot`, porque avisar implicaba
dejar de ser `bot`.)

Fase que lo implementa: 08d; 12d (aclara el caso del asesor avisado)

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

#### Scenario: Un asesor avisado con la conversación en bot tampoco abre espera

- Dado una conversación en `bot` cuyo asesor ya fue avisado,
- Cuando el cliente escribe y el bot responde,
- Entonces no se registra ninguna espera y no se encola un aviso de cliente esperando.

#### Scenario: Un fallo al registrar la espera no pierde el mensaje

- Dado que el almacén de la marca falla,
- Cuando el cliente escribe en `humano`,
- Entonces el mensaje se procesa igual y queda un `warn` sin datos del cliente.

#### Scenario: La marca no guarda el contenido

- Dado un mensaje del cliente en `humano`,
- Cuando se registra la espera,
- Entonces la marca contiene solo el identificador de la conversación y el instante, sin el texto.

## ADDED Requirements

### Requirement: CNV13 — Un aviso al asesor no cambia el estado de la conversación

Cuando la respuesta del generador trae un `aviso` y no trae `handoff`, `conversaciones` MUST enviar los pasos de la respuesta
por el punto único de salida (R5), MUST avisar a los observadores de aviso (mismo patrón de registro que los de handoff,
sin importar a `notificaciones` ni a `leads`) y MUST dejar la conversación en `bot`: sin transición, sin espejo de estado en
el canal, sin cancelar el job diferido y sin vaciar el buffer. El turno siguiente MUST procesarse con normalidad. Si un
asesor tomó la conversación mientras el generador corría (eco humano), `conversaciones` MUST NOT avisar. Un fallo de un
observador MUST registrarse con un `warn` sin datos del cliente y MUST NOT perder la respuesta ya encolada.

Fase que lo implementa: 12d

#### Scenario: Avisar deja la conversación en bot

- Dado una conversación en `bot` y un generador que responde un paso de texto y un aviso `pide-asesor`,
- Cuando se procesa el turno,
- Entonces el paso se encola, se notifica a los observadores de aviso y la conversación sigue en `bot` sin ningún cambio de estado en el canal.

#### Scenario: El siguiente mensaje del cliente se atiende con normalidad

- Dado una conversación en `bot` cuyo asesor fue avisado en el turno anterior,
- Cuando el cliente envía otro mensaje,
- Entonces el generador de respuesta se invoca y el bot responde.

#### Scenario: Un asesor que ya tomó la conversación no recibe un aviso de más

- Dado una conversación en `bot` y un generador que tarda en responder con un aviso `pide-persona`,
- Cuando un asesor escribe antes de que termine el turno y la conversación pasa a `humano`,
- Entonces no se notifica a los observadores de aviso.

#### Scenario: Un fallo del observador no pierde la respuesta

- Dado un observador de aviso que lanza un error,
- Cuando se procesa un turno con aviso,
- Entonces el paso de texto ya quedó encolado, se registra un `warn` sin datos del cliente y la conversación sigue en `bot`.

### Requirement: CNV14 — Un aviso por motivo mientras el asesor no tome la conversación

`conversaciones` MUST llevar en Redis una marca «asesor avisado» por **conversación y motivo** (mismo patrón que la marca de
espera, CNV12) y MUST adquirirla de forma atómica (`SET NX` sobre el par) antes de notificar a los observadores de aviso. Los
motivos de la marca son tres: el cliente pide una persona (`pide-persona`, de la política, y `pide-asesor`, de la herramienta
`derivar_a_asesor`, cuentan como el mismo motivo), `lead-caliente` y `audio-repetido`. Con la marca de un motivo puesta, un
`aviso` posterior **del mismo motivo** MUST NOT notificar de nuevo; un aviso de **otro** motivo MUST notificar. Las marcas de
todos los motivos MUST borrarse cuando la conversación pasa a `humano` (eco humano u `open`) y cuando vuelve a `bot` desde
`humano` o `handoff_pendiente`: dentro de una misma sesión bot, un motivo avisa una sola vez. Si un observador falla, la marca de
ese motivo MUST liberarse para que el turno siguiente pueda reintentar. Si Redis falla, `conversaciones` MUST avisar sin marca y
registrar un `warn`: es preferible un aviso repetido a uno perdido. La marca MUST NOT guardar el contenido del mensaje (R14).

Fase que lo implementa: 12d

#### Scenario: Dos avisos del mismo motivo notifican una sola vez

- Dado una conversación en `bot` con un aviso `pide-persona` ya notificado,
- Cuando el siguiente turno trae un aviso `pide-asesor`,
- Entonces no se notifica de nuevo, porque los dos son el mismo motivo, y la respuesta del turno se envía igual.

#### Scenario: Un motivo distinto avisa aunque ya haya otro aviso

- Dado una conversación en `bot` con un aviso `pide-asesor` ya notificado,
- Cuando un turno posterior trae un aviso `lead-caliente`,
- Entonces se notifica a los observadores de aviso con el motivo `lead-caliente`.

#### Scenario: Dos turnos simultáneos con el mismo motivo avisan una sola vez

- Dado dos respuestas con aviso `pide-persona` procesadas a la vez para la misma conversación,
- Cuando ambas intentan adquirir la marca de ese motivo,
- Entonces solo una notifica a los observadores.

#### Scenario: El eco humano borra las marcas de todos los motivos

- Dado una conversación con las marcas de `pide-asesor` y `audio-repetido`,
- Cuando un asesor escribe y la conversación pasa a `humano`,
- Entonces las dos marcas se borran.

#### Scenario: Volver a bot borra la marca y permite avisar otra vez

- Dado una conversación en `humano` que vuelve a `bot` con origen `ttl`,
- Cuando un turno posterior trae un aviso `pide-persona`,
- Entonces se notifica a los observadores de aviso.

#### Scenario: Un observador que falla libera la marca

- Dado un observador de aviso que lanza un error en el primer intento de un aviso `audio-repetido`,
- Cuando llega un segundo turno con el mismo aviso,
- Entonces la marca de ese motivo no está puesta y el segundo turno vuelve a notificar.

#### Scenario: Sin Redis se avisa igual

- Dado que Redis no responde,
- Cuando un turno trae un aviso,
- Entonces se notifica a los observadores, se registra un `warn` y la respuesta del turno se envía.

#### Scenario: La marca de aviso no guarda el contenido

- Dado un turno con aviso `pide-asesor`,
- Cuando se escribe la marca,
- Entonces contiene solo el identificador de la conversación y el motivo, sin el texto del mensaje.

### Requirement: CNV15 — El agente puede saber si el asesor ya fue avisado

`conversaciones` MUST exportar un puerto de solo lectura que diga si el asesor de una conversación ya fue avisado (la marca
de CNV14 de **cualquier** motivo), para que el contexto del turno del agente lo use (AGT28) sin importar la infraestructura de Redis de
`conversaciones`. Si la consulta falla, MUST responder «no avisado» y registrar un `warn` sin datos del cliente; el turno
MUST continuar.

Fase que lo implementa: 12d

#### Scenario: El puerto responde que el asesor ya fue avisado

- Dado una conversación con la marca «asesor avisado»,
- Cuando el agente consulta el puerto,
- Entonces responde que ya fue avisado.

#### Scenario: Sin marca el puerto responde que no

- Dado una conversación sin la marca,
- Cuando el agente consulta el puerto,
- Entonces responde que no ha sido avisado.

#### Scenario: Un fallo de la consulta no rompe el turno

- Dado que Redis falla,
- Cuando el agente consulta el puerto,
- Entonces recibe «no avisado», queda un `warn` sin datos del cliente y el turno continúa.
