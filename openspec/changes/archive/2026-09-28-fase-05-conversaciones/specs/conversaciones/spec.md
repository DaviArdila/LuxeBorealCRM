# Conversaciones — Specification

## Purpose

Una conversación es una sesión de atención con un contacto por un canal (`SPEC.md` §6). Este dominio
decide, para cada mensaje entrante ya normalizado por `canales`, si lo atiende el bot, un humano, o
nadie (kill switch); agrupa ráfagas de mensajes en un solo turno; protege ese turno contra que el bot
escriba por encima de un humano; y es el único punto por el que sale cualquier respuesta al cliente.

## Requirements

### Requirement: R5 — Único punto de salida que relee el estado antes de cada mensaje

Toda respuesta al cliente MUST pasar por un único punto de salida que, antes de enviar **cada**
mensaje de una secuencia, relee el estado de la conversación y, si no es `bot`, MUST abortar el resto
de la secuencia sin enviar los mensajes restantes.

Fase que lo implementa: 05

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
cualquier transición hacia `pausado` cuyo origen no sea `admin`.

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
NOT enviar ningún mensaje al cliente en ese momento.

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

### Requirement: R13 — Rate limit por contacto (parcial)

El sistema MUST descartar un mensaje entrante que supere el límite configurado de mensajes por hora o
por día para ese contacto: el mensaje se registra, pero no genera ninguna respuesta.

Fase que lo implementa: 05 (parcial; tope de turnos y techo mensual de gasto son de la Fase 06/07)

#### Scenario: Se supera el límite de mensajes por hora

- Dado un contacto que ya alcanzó `RATE_LIMIT_POR_HORA` mensajes en la hora en curso,
- Cuando envía un mensaje adicional dentro de esa misma hora,
- Entonces el mensaje se registra y no se genera ninguna respuesta.

#### Scenario: Se supera el límite de mensajes por día

- Dado un contacto que ya alcanzó `RATE_LIMIT_POR_DIA` mensajes en el día en curso,
- Cuando envía un mensaje adicional dentro de ese mismo día,
- Entonces el mensaje se registra y no se genera ninguna respuesta.

### Requirement: CNV1 — Una ráfaga de mensajes produce una sola invocación del generador de respuesta

El debounce MUST agrupar los mensajes de una misma ráfaga del cliente (varios mensajes seguidos
dentro de la ventana `DEBOUNCE_MS`) para que produzcan una sola invocación del generador de
respuesta, no una por mensaje.

#### Scenario: Cuatro mensajes del cliente en 3 segundos producen una sola invocación

- Dado que un contacto en estado `bot` envía cuatro mensajes seguidos dentro de una ventana de 3
  segundos,
- Cuando el debounce agrupa la ráfaga y el job corre,
- Entonces el generador de respuesta se invoca exactamente una vez para los cuatro mensajes.

### Requirement: CNV2 — El estado humano no genera llamadas al generador de respuesta

Mientras una conversación esté en estado `humano`, los mensajes entrantes MUST registrarse pero
MUST NOT invocar el generador de respuesta ni producir ninguna respuesta al cliente.

#### Scenario: Tres mensajes entrantes en estado humano no generan ninguna respuesta

- Dado una conversación en estado `humano`,
- Cuando el contacto envía tres mensajes seguidos,
- Entonces los tres mensajes quedan registrados, el generador de respuesta no se invoca ninguna vez
  y no se envía ninguna respuesta al cliente.

### Requirement: CNV3 — Aviso único de espera en handoff_pendiente

Si el cliente escribe en estado `handoff_pendiente` después de que pasó `HANDOFF_ESPERA_MIN` sin eco
humano, el sistema MUST enviar como máximo un único mensaje de espera por esa entrada a
`handoff_pendiente`, y MUST NOT enviar un segundo aunque el cliente siga escribiendo.

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

#### Scenario: Un evento de estado "pending" sobre una conversación en manos humanas la devuelve al bot

- Dado una conversación en estado `humano`,
- Cuando llega un evento de canal de tipo `estado-conversacion` con `status: pending`,
- Entonces la conversación transiciona a `bot` con origen `chatwoot_pending`.

#### Scenario: Un evento de estado "open" sobre una conversación en bot equivale a un eco humano

- Dado una conversación en estado `bot`,
- Cuando llega un evento de canal de tipo `estado-conversacion` con `status: open`,
- Entonces la conversación transiciona a `humano` con origen `eco_humano`.

### Requirement: CNV6 — El agente eco responde con el texto del último mensaje del turno

El *stand-in* del generador de respuesta ("agente eco") MUST responder con un único paso cuyo texto
es el del último mensaje del turno, sin producir ningún `handoff`.

#### Scenario: El agente eco reenvía el texto del último mensaje del turno

- Dado un turno con varios mensajes acumulados en el buffer,
- Cuando el agente eco genera la respuesta,
- Entonces el resultado tiene un único paso cuyo texto es el del último mensaje del turno y no
  produce ningún `handoff`.
