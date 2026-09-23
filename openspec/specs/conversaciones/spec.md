# Conversaciones — Specification

## Purpose

Gobierna quién tiene el control de una conversación (bot o humano), cómo ese control cambia de
manos sin pisarse, y los límites de costo por conversación. Es la parte del sistema donde un bug se
ve directamente de cara al cliente: el peor resultado posible es un cliente que escribe y nadie le
responde.

## Requirements

### Requirement: R5 — Punto único de salida

Toda salida al cliente MUST pasar por un único punto que relee el estado de la conversación justo
antes de enviar cada mensaje y MUST abortar el envío si el bot ya no tiene el control.

Fase que lo implementa: 04, 05

#### Scenario: Envío normal con el bot en control

- Dado que la conversación está en estado `bot`,
- Cuando se envía un mensaje generado por el agente,
- Entonces el punto único de salida relee el estado justo antes de enviar y, si sigue siendo `bot`,
  envía el mensaje.

#### Scenario: El estado cambia mientras se generaba la respuesta

- Dado que la conversación cambió a `humano` mientras el LLM generaba una respuesta,
- Cuando el punto de salida va a enviar esa respuesta,
- Entonces relee el estado, detecta que ya no es `bot`, aborta el resto de la secuencia de envío y
  lo registra a nivel informativo.

### Requirement: R6 — Máquina de estados y control del LLM

La conversación MUST tener un estado entre `bot`, `handoff_pendiente`, `humano` y `pausado`. El LLM
MUST NOT devolver una conversación al estado `bot` bajo ninguna circunstancia.

Fase que lo implementa: 05

#### Scenario: El LLM no puede reactivar el bot

- Dado que la conversación está en `handoff_pendiente` o en `humano`,
- Cuando el LLM genera una respuesta o una llamada a herramienta,
- Entonces no existe ninguna vía por la que esa respuesta cambie el estado a `bot`.

#### Scenario: Solo mecanismos autorizados devuelven el control al bot

- Dado que vence el temporizador correspondiente, un administrador usa el endpoint admin, o (según
  el canal) un asesor libera la conversación desde la bandeja,
- Cuando ocurre ese evento,
- Entonces el estado de la conversación vuelve a `bot`.

### Requirement: R7 — El control humano es un préstamo con vencimiento

Todo estado que silencia al bot (`handoff_pendiente` sin recoger, `humano` sin actividad del
asesor) MUST vencer, o liberarse al resolverse en la bandeja. El sistema MUST evitar dejar a un
cliente sin ninguna respuesta, ni del bot ni de una persona.

Fase que lo implementa: 05

#### Scenario: `handoff_pendiente` vence sin que nadie lo recoja

- Dado que la conversación entra en `handoff_pendiente` y nadie la recoge dentro del plazo
  configurado,
- Cuando vence ese plazo,
- Entonces la conversación vuelve a `bot` automáticamente.

#### Scenario: `humano` vence por inactividad del asesor

- Dado que la conversación está en `humano` y el asesor no responde dentro del plazo configurado
  desde su último mensaje,
- Cuando vence ese plazo,
- Entonces la conversación vuelve a `bot`.

#### Scenario: El asesor resuelve la conversación

- Dado que el asesor resuelve la conversación desde la bandeja,
- Cuando eso ocurre,
- Entonces el control se libera y la conversación vuelve a `bot`.

### Requirement: R8 — Tres capas contra la sobreescritura bot/humano

El sistema MUST implementar tres capas independientes contra la carrera entre el bot y un asesor
humano: retardo deliberado (debounce) antes de procesar, cancelación al detectar un eco humano, y
una guardia que relee el estado en el punto de envío (R5). El sistema MUST además usar un lock por
conversación para impedir procesamiento paralelo del mismo contacto.

Fase que lo implementa: 05

#### Scenario: Varios mensajes seguidos del cliente se agrupan

- Dado que el cliente manda varios mensajes seguidos,
- Cuando llegan dentro de la ventana de debounce configurada,
- Entonces se agrupan en un solo procesamiento y el reloj de espera se reinicia con cada mensaje
  nuevo.

#### Scenario: Eco humano cancela el procesamiento pendiente

- Dado que llega un eco humano (un asesor escribió desde la bandeja) para una conversación con un
  job diferido pendiente,
- Cuando se detecta el eco,
- Entonces el estado cambia a `humano`, se cancela el job diferido y se vacía el buffer acumulado.

#### Scenario: Lock por conversación impide procesamiento paralelo

- Dado que dos eventos del mismo contacto podrían procesarse en paralelo,
- Cuando se intenta procesar el segundo antes de que termine el primero,
- Entonces el lock por conversación lo impide.

### Requirement: R13 — Límites de costo por conversación

Donde el canal cobra por mensaje saliente, el sistema MUST agrupar cada respuesta en el **menor
número posible** de mensajes salientes (una ficha = un mensaje de texto; una foto cuenta como un
mensaje; collage por defecto). Además MUST aplicar un tope configurable de turnos por conversación
y un rate limit configurable por contacto, y MUST registrar el costo estimado de cada llamada al LLM
en `uso_llm` para controlar el techo de gasto mensual (techo del negocio: 20 USD/mes entre VPS, LLM
y Meta). El techo se hace cumplir también con un límite de gasto configurado en la consola del
proveedor de LLM (operación, Fase 09). El comportamiento del bot al alcanzar el techo desde el
código está pendiente de decisión (P17).

Fase que lo implementa: 05, 06, 07

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

- Dado que una conversación alcanza el tope de turnos configurado,
- Cuando se alcanza ese tope,
- Entonces la conversación deriva a humano.

#### Scenario: Rate limit por contacto

- Dado que un contacto supera el rate limit configurado de mensajes por hora o por día,
- Cuando se supera ese límite,
- Entonces se aplica el freno correspondiente (los valores concretos de los límites son
  configurables, no constantes en el código).

#### Scenario: Costo de cada llamada al LLM registrado

- Dado que el agente hace una llamada al LLM durante un turno,
- Cuando la llamada termina (con éxito o con error),
- Entonces queda una fila en `uso_llm` con proveedor, modelo, tokens de entrada, salida y caché,
  costo estimado en USD, latencia y resultado, que permite sumar el gasto del mes.
