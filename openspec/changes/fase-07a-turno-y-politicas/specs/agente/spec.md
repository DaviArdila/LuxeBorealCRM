# Delta for Agente

## MODIFIED Requirements

### Requirement: R12 — Mensajes entrantes no textuales

El sistema MUST manejar los mensajes entrantes que no son texto según su tipo, decidido por el turno
completo (después del debounce): si la ráfaga trae al menos un mensaje de texto, el turno sigue el
flujo normal con el texto (P28); si no trae texto, decide el tipo del último mensaje. Un audio SHALL
pedir texto al cliente; un segundo audio consecutivo en la misma sesión de la conversación MUST
derivar la conversación a humano (un mensaje de texto reinicia la cuenta); una imagen SHALL pedir que
el cliente la describa en texto o mencione el SKU, sin procesarla; una ubicación MUST entrar al flujo
normal como una ubicación compartida, sin geocodificarla, para que el bot pida la ciudad y el
departamento y cotice (P27); cualquier otro tipo (sticker, tarjeta de contacto, documento, etc.) MUST
ignorarse sin responder, sin consumir turno ni tokens.

(Previously: el segundo audio se contaba "del mismo contacto" en el requisito y "en la misma
conversación" en el escenario; la ubicación "poblaba ciudad/departamento del contacto", algo que el
prototipo nunca implementó y que exige geocodificación inversa; no se definía qué pasa con una
ráfaga mixta.)

Fase que lo implementa: 07a (audio, imagen, ignorar, ráfaga mixta); 07b (ubicación en el flujo del
LLM)

#### Scenario: Primer audio del cliente

- Dado que el cliente envía un mensaje de audio,
- Cuando llega el mensaje,
- Entonces el bot pide texto con una excusa amable, sin llamar al LLM.

#### Scenario: Segundo audio consecutivo

- Dado que el cliente ya envió un audio antes en la misma sesión de la conversación y envía un
  segundo audio,
- Cuando llega el segundo audio,
- Entonces la conversación deriva a humano.

#### Scenario: Un texto entre dos audios reinicia la cuenta

- Dado que el cliente envió un audio, luego un texto, y luego otro audio,
- Cuando llega el segundo audio,
- Entonces el bot vuelve a pedir texto y la conversación no deriva.

#### Scenario: Imagen entrante

- Dado que el cliente envía una imagen,
- Cuando llega el mensaje,
- Entonces el bot pide que la describa en texto o mencione el SKU, sin procesar la imagen.

#### Scenario: Ubicación entrante

- Dado que el cliente envía su ubicación,
- Cuando llega el mensaje,
- Entonces el turno sigue el flujo normal con una ubicación compartida y el bot pide la ciudad y el
  departamento para cotizar el envío.

#### Scenario: Tipo no manejado

- Dado que el cliente envía un sticker u otro tipo no manejado,
- Cuando llega el mensaje,
- Entonces se ignora silenciosamente, sin consumir turno ni tokens.

#### Scenario: Ráfaga con texto y audio sigue el flujo del texto

- Dado que el cliente envía un texto y un audio dentro de la misma ráfaga,
- Cuando se procesa el turno,
- Entonces el turno sigue el flujo normal con el texto y no se pide texto por el audio.

## ADDED Requirements

### Requirement: AGT1 — Pipeline de políticas del turno en orden explícito

El agente MUST decidir cada turno recorriendo una lista ordenada de políticas, cada una una pieza
separada que puede responder y cortar el turno o dejar pasar al siguiente: (1) mensajes no textuales
(R12), (2) tope de turnos (R13), (3) generación de contenido (eco provisional en 07a, LLM en 07b). El
aviso de datos (AGT2) se aplica sobre la respuesta que produzca cualquier política. Un turno que
ninguna política responde MUST terminar sin pasos. Agregar una política MUST NOT exigir cambiar las
demás (A5).

Fase que lo implementa: 07a

#### Scenario: Una política que responde corta el resto del pipeline

- Dado un turno con un solo mensaje de audio,
- Cuando el pipeline lo procesa,
- Entonces responde la política de no textuales y ni el tope de turnos ni la generación de contenido
  se consultan.

#### Scenario: Un turno de texto llega hasta la generación de contenido

- Dado un turno de texto en una sesión que no alcanzó el tope,
- Cuando el pipeline lo procesa,
- Entonces la respuesta la produce la generación de contenido.

### Requirement: AGT2 — Aviso de asistente automatizado en el primer turno de la conversación

La primera respuesta del bot en una conversación (sesión inicial, sin turnos previos) MUST empezar
con el texto del parámetro `aviso_datos`, dentro del **mismo** primer mensaje de texto de esa
respuesta (sin agregar un mensaje saliente, R13). Las respuestas siguientes, y las de sesiones
posteriores de la misma conversación, MUST NOT repetirlo. Implementa el escenario «Aviso de asistente
automatizado» de **R14** de forma determinista, sin depender de que el modelo lo recuerde.

Fase que lo implementa: 07a

#### Scenario: La primera respuesta de la conversación lleva el aviso en el mismo mensaje

- Dado una conversación nueva y un turno de texto,
- Cuando el bot responde con un mensaje de texto,
- Entonces ese único mensaje empieza con el texto de `aviso_datos` seguido de la respuesta.

#### Scenario: La segunda respuesta no repite el aviso

- Dado una conversación cuyo primer turno ya se respondió,
- Cuando el bot responde el segundo turno,
- Entonces la respuesta no contiene el texto de `aviso_datos`.

#### Scenario: Una respuesta vacía no genera un mensaje solo para el aviso

- Dado una conversación nueva cuyo primer turno es un sticker,
- Cuando el turno se ignora,
- Entonces no se envía ningún mensaje y el aviso queda para la primera respuesta real.

### Requirement: AGT3 — Los textos fijos del agente son parámetros del negocio

Los textos que el agente envía sin pasar por el LLM MUST leerse de `parametro` (R15):
`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `aviso_datos`, `mensaje_handoff` (dentro
del horario de atención) y `mensaje_handoff_fuera_horario` (fuera de él, según el puerto `HORARIO`).
Si una clave no existe o está vacía, MUST usarse un texto de respaldo definido en un solo lugar del
código del agente (patrón de las Fases 05 y 06), nunca repetido en varios archivos.

Fase que lo implementa: 07a

#### Scenario: Un texto configurado por el negocio reemplaza al de respaldo

- Dado el parámetro `mensaje_pedir_texto_audio` con un texto configurado,
- Cuando el cliente envía un audio,
- Entonces el bot responde exactamente ese texto.

#### Scenario: Sin el parámetro se usa el texto de respaldo

- Dado que no existe el parámetro `mensaje_imagen_no_procesada`,
- Cuando el cliente envía una imagen,
- Entonces el bot responde el texto de respaldo del agente.

#### Scenario: Fuera de horario el handoff usa su propio texto

- Dado que el sistema está fuera del horario de atención y la conversación alcanza el tope de turnos,
- Cuando el bot deriva,
- Entonces el mensaje que envía es el de `mensaje_handoff_fuera_horario`, no el de `mensaje_handoff`.
