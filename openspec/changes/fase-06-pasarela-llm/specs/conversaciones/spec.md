# Delta for conversaciones

## Purpose

Delta de trazabilidad de la Fase 06: el escenario «Costo de cada llamada al LLM registrado» de R13
pasa a implementado por esta fase (el escritor es el gateway de `llm`, especificado en
`specs/llm/spec.md` de este mismo change). `conversaciones` no cambia de comportamiento; ningún otro
requisito de este dominio se toca.

## MODIFIED Requirements

### Requirement: R13 — Límites de costo por conversación

Donde el canal cobra por mensaje saliente, el sistema MUST agrupar cada respuesta en el **menor
número posible** de mensajes salientes (una ficha = un mensaje de texto; una foto cuenta como un
mensaje; collage por defecto). Además MUST aplicar un tope configurable de turnos por conversación
y MUST descartar un mensaje entrante que supere el límite configurado de mensajes por hora o por día
para ese contacto (el mensaje se registra, pero no genera ninguna respuesta), y MUST registrar el
costo estimado de cada llamada al LLM en `uso_llm` para controlar el techo de gasto mensual (techo
del negocio: 20 USD/mes entre VPS, LLM y Meta). El techo se hace cumplir también con un límite de
gasto configurado en la consola del proveedor de LLM (operación, Fase 09). El comportamiento del bot
al alcanzar el techo desde el código está pendiente de decisión (P17).

(Previously: la línea de fase agrupaba 06 con el resto sin decir qué escenario implementa.)

Fase que lo implementa: 05 (parcial: rate limit por contacto), 06 (costo por llamada al LLM
registrado por el gateway — escenario «Costo de cada llamada al LLM registrado»), 07 (agrupación
de mensajes, collage, tope de turnos)

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
