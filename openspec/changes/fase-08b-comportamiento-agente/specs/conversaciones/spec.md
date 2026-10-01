# Delta for Conversaciones

## MODIFIED Requirements

### Requirement: R13 — Límites de costo por conversación

Donde el canal cobra por mensaje saliente, el sistema MUST agrupar cada respuesta en el **menor
número posible** de mensajes salientes (una ficha = un mensaje de texto; una foto cuenta como un
mensaje; **por defecto una sola foto**, la portada, y otras solo si el cliente las pide). Además MUST
aplicar un tope configurable de turnos del bot por sesión de la conversación (una sesión empieza cada vez
que la conversación entra en `bot`; P29) y, al alcanzarlo, MUST derivar a humano; MUST descartar un
mensaje entrante que supere el límite configurado de mensajes por hora o por día para ese contacto (el
mensaje se registra, pero no genera ninguna respuesta), y MUST registrar el costo estimado de cada llamada
al LLM en `uso_llm` para controlar el techo de gasto mensual (techo del negocio: 20 USD/mes entre VPS,
LLM y Meta). El techo se hace cumplir también con un límite de gasto configurado en la consola del
proveedor de LLM (operación, Fase 09). Al alcanzar el techo desde el código, el turno deriva a humano con
el texto `mensaje_techo_gasto` (P17, Fase 07b).

(Previously: «collage por defecto»; la agrupación de fotos en un collage deja de ser el comportamiento
por defecto y pasa a ser opcional del importador.)

Fase que lo implementa: 05 (parcial: rate limit por contacto), 06 (costo por llamada al LLM), 07a (tope de
turnos), 07b (agrupación de mensajes), 07c (evals), 08b (una foto por defecto)

#### Scenario: Respuesta agrupada en el mínimo de mensajes

- Dado que la conversación es por un canal donde el mensaje saliente cuesta,
- Cuando el bot responde con la ficha de un producto,
- Entonces la ficha sale como **un solo** mensaje de texto, no fragmentada en varios.

#### Scenario: Una sola foto por defecto

- Dado que el bot va a enviar fotos de un producto en un canal donde el mensaje saliente cuesta,
- Cuando el cliente no pidió un ángulo concreto,
- Entonces el bot envía una sola foto (la portada) y no todas las del producto.

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
