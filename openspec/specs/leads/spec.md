# Leads — Specification

## Purpose

Cubre la calificación de interés de compra (lead) y todo lo que pasa alrededor de un lead caliente:
la captura de datos cuando no hay nadie despierto, y el aviso al asesor. La calificación es híbrida
—el LLM propone, una escala determinista confirma— para que el modelo no derive por entusiasmo.

## Requirements

### Requirement: R9 — Calificación de lead caliente

Un lead se considera caliente cuando el LLM lo propone **y** una escala determinista lo confirma
(≥1 señal fuerte o ≥2 señales débiles). La señal "pide hablar con una persona" MUST derivar la
conversación de inmediato, sin pasar por la evaluación del LLM. Sin cobertura de envío para el
destino del cliente no hay lead.

Fase que lo implementa: 08

#### Scenario: El LLM propone pero la escala determinista no confirma

- Dado que el LLM llama a `marcar_lead_caliente` con temperatura "caliente",
- Cuando el backend evalúa la conversación,
- Entonces solo deriva si se cumple además el criterio determinista (≥1 señal fuerte o ≥2 señales
  débiles); si no se cumple, no deriva aunque el LLM lo haya propuesto.

#### Scenario: Petición explícita de hablar con una persona

- Dado que el cliente pide explícitamente hablar con una persona,
- Cuando se detecta esa señal,
- Entonces la conversación deriva de inmediato, sin pasar por la evaluación del LLM.

#### Scenario: Sin cobertura de envío no hay lead

- Dado que `cotizar_envio` devuelve `cobertura: false` para el destino del cliente,
- Cuando se evalúa el turno,
- Entonces no se marca como lead.

### Requirement: R10 — Fuera de horario: atención continua con captura de datos

Fuera del horario de atención configurado, el bot MUST seguir atendiendo al cliente, MUST capturar
los datos del cliente antes de avisar del lead, y MUST NOT aparcar la conversación esperando a un
asesor.

Fase que lo implementa: 08

#### Scenario: Handoff fuera de horario dispara la captura de datos

- Dado que la conversación entraría en `handoff_pendiente` y el sistema está fuera del horario de
  atención configurado,
- Cuando el bot detecta esa condición,
- Entonces sigue el guion de captura de datos antes de avisar del lead, en vez de derivar de
  inmediato.

#### Scenario: La conversación sigue atendida tras avisar el lead capturado fuera de horario

- Dado que el bot ya avisó el lead capturado fuera de horario,
- Cuando el cliente escribe de nuevo,
- Entonces el bot le sigue respondiendo con normalidad; la conversación no queda aparcada.

### Requirement: R11 — Notificación de lead al asesor

El sistema MUST notificar al grupo de Telegram como máximo 1 vez por contacto cada 24 horas, MUST
enviar la notificación después de confirmar el cambio de estado (nunca antes), y MUST reintentar el
envío hasta entregarse.

Fase que lo implementa: 08

#### Scenario: Ventana de 24 horas por contacto

- Dado que un contacto ya generó una notificación de lead en las últimas 24 horas,
- Cuando se detecta un nuevo lead caliente para ese contacto,
- Entonces no se envía una segunda notificación dentro de esa ventana.

#### Scenario: La notificación se envía después de confirmar el estado

- Dado que el cambio de estado de la conversación se confirmó en la base de datos,
- Cuando se envía la notificación al grupo de Telegram,
- Entonces esa notificación se envía después de esa confirmación, nunca antes.

#### Scenario: Reintento ante fallo de entrega

- Dado que la llamada a la API de notificación falla,
- Cuando ocurre el fallo,
- Entonces el sistema reintenta con backoff hasta entregarse, sin perder el lead en silencio.

### Requirement: LDS1 — Escala determinista con vocabulario cerrado de señales

La calificación MUST usar un vocabulario **cerrado** de señales, cada una fuerte o débil, y una función
pura que confirma un lead cuando hay al menos una señal fuerte o al menos dos débiles distintas. Una
señal fuera del vocabulario MUST ignorarse (no cuenta) y MUST NOT hacer fallar el turno. La escala
MUST NOT leer la temperatura que propuso el LLM: esa temperatura solo se guarda.

Fase que lo implementa: 08

#### Scenario: Una señal fuerte confirma el lead

- Dado un turno con la señal fuerte `pide_pagar`,
- Cuando se evalúa la escala,
- Entonces el lead se confirma.

#### Scenario: Dos señales débiles distintas confirman el lead

- Dado un turno con las señales débiles `pregunta_precio` y `pide_fotos`,
- Cuando se evalúa la escala,
- Entonces el lead se confirma.

#### Scenario: Una sola señal débil no confirma

- Dado un turno con solo la señal débil `pregunta_precio`, aunque el LLM haya propuesto "caliente",
- Cuando se evalúa la escala,
- Entonces el lead no se confirma.

#### Scenario: La misma señal débil repetida cuenta una vez

- Dado un turno con `pregunta_precio` dos veces,
- Cuando se evalúa la escala,
- Entonces cuenta como una sola señal débil y no confirma.

#### Scenario: Una señal desconocida se ignora

- Dado un turno con la señal inventada `esta_emocionado` y ninguna otra,
- Cuando se evalúa la escala,
- Entonces no confirma y el turno no falla.

### Requirement: LDS2 — Un lead evaluado se guarda y se deriva una sola vez por conversación

Cada propuesta de `marcar_lead_caliente` MUST guardarse como una fila de `lead` con su temperatura, sus
señales válidas y un resumen sin datos personales, y `derivado` MUST valer `true` solo si la escala la
confirmó. Una conversación MUST tener como máximo un lead abierto: una propuesta posterior MUST
actualizar ese lead en vez de crear otro, y una vez `derivado` MUST NOT volver a derivarse. Sin
cobertura de envío en el turno, MUST NOT crearse el lead (R9).

Fase que lo implementa: 08

#### Scenario: La propuesta confirmada crea un lead derivado

- Dado un turno con `pide_pagar` y la propuesta "caliente",
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces existe un lead con `derivado = true` para el contacto y la conversación, y el modelo recibe
  `derivado: true`.

#### Scenario: La propuesta no confirmada se guarda sin derivar

- Dado un turno con solo `pregunta_precio`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces existe un lead con `derivado = false` y el modelo recibe `derivado: false` con un motivo.

#### Scenario: Una segunda propuesta actualiza el lead existente

- Dado un lead abierto no derivado de la conversación,
- Cuando el modelo propone de nuevo con nuevas señales,
- Entonces sigue habiendo un solo lead, con las señales unidas.

#### Scenario: Un lead ya derivado no se deriva otra vez

- Dado un lead ya derivado de la conversación,
- Cuando el modelo vuelve a proponer "caliente",
- Entonces no se crea un segundo lead ni una segunda derivación.

#### Scenario: Sin cobertura no se crea el lead

- Dado un turno en el que `cotizar_envio` dejó el efecto `sin-cobertura`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces no se crea ningún lead.

#### Scenario: El resumen no lleva datos personales

- Dado un resumen con un teléfono y un correo,
- Cuando se guarda el lead,
- Entonces la fila guarda el resumen con esos datos reemplazados y ningún log los contiene.

### Requirement: LDS3 — Pedir hablar con una persona deriva de inmediato, sin el LLM

Antes de llamar al LLM, el agente MUST detectar con reglas deterministas que el cliente pide hablar con
una persona (asesor, humano, agente) o rechaza hablar con un bot, y en ese caso MUST derivar en ese
mismo turno, sin consultar al LLM, registrando un lead derivado con la señal `pide_persona`. Un mensaje
que solo menciona la palabra ("asesor") sin pedirlo MUST NOT derivar.

Fase que lo implementa: 08

#### Scenario: Petición explícita de hablar con una persona

- Dado el mensaje "quiero hablar con un asesor",
- Cuando se procesa el turno dentro del horario de atención,
- Entonces el turno termina en handoff con motivo `pide-persona` y el LLM no recibe ninguna llamada.

#### Scenario: Rechazar hablar con un bot también deriva

- Dado el mensaje "no quiero hablar con un robot, pásame con alguien",
- Cuando se procesa el turno,
- Entonces deriva con motivo `pide-persona`.

#### Scenario: Mencionar la palabra no es pedirla

- Dado el mensaje "¿el asesor de ustedes atiende los sábados?",
- Cuando se procesa el turno,
- Entonces el turno sigue al LLM y no deriva.

#### Scenario: Pedir una persona sin cobertura sigue derivando

- Dado un cliente cuyo destino no tiene cobertura que pide hablar con una persona,
- Cuando se procesa el turno,
- Entonces deriva (pedir una persona no es un lead comercial: R9 solo excluye el lead).

### Requirement: LDS4 — Fuera de horario el bot captura los datos y sigue atendiendo

Si un lead confirmado o una petición de persona ocurre fuera del horario de atención, el sistema MUST
NOT pasar la conversación a `handoff_pendiente`: MUST indicarle al modelo que pida los datos que falten
(nombre completo, teléfono de contacto, dirección y localidad) y MUST avisar al asesor solo cuando
`guardar_datos_contacto` los haya guardado. El lead MUST quedar con `capturado_fuera_horario = true` y la
conversación en `bot`, y el cliente MUST seguir recibiendo respuestas.

Fase que lo implementa: 08

#### Scenario: Handoff fuera de horario dispara la captura de datos

- Dado un lead confirmado fuera del horario de atención,
- Cuando se arma el siguiente turno,
- Entonces las instrucciones del turno piden los datos del cliente y la conversación sigue en `bot`.

#### Scenario: Con los datos guardados se avisa y el lead queda capturado

- Dado un lead pendiente de captura fuera de horario,
- Cuando el modelo guarda los datos del contacto,
- Entonces el lead queda con `capturado_fuera_horario = true` y se encola el aviso al asesor.

#### Scenario: La conversación sigue atendida tras avisar el lead capturado

- Dado un lead ya capturado y avisado fuera de horario,
- Cuando el cliente escribe de nuevo,
- Entonces el bot le responde con normalidad y la conversación no queda aparcada.

#### Scenario: Dentro de horario no se captura, se deriva

- Dado un lead confirmado dentro del horario de atención,
- Cuando se procesa el turno,
- Entonces el turno termina en handoff con motivo `lead-caliente`.

### Requirement: LDS5 — Un lead derivado que nadie atiende se recuerda una vez

Un lead derivado, en estado `nuevo`, que lleva más de `LEADS_RECORDATORIO_MIN` minutos sin atenderse
MUST generar un solo recordatorio al asesor, marcado en `lead.recordatorio_en`; un job repetible lo
revisa y MUST NOT repetirlo.

Fase que lo implementa: 08

#### Scenario: Recordatorio a un lead sin atender

- Dado un lead derivado hace más de `LEADS_RECORDATORIO_MIN` minutos que sigue en `nuevo`,
- Cuando corre el barrido,
- Entonces se encola un recordatorio y `recordatorio_en` queda marcado.

#### Scenario: Un lead ya atendido no se recuerda

- Dado un lead derivado que ya pasó a `en_atencion`,
- Cuando corre el barrido,
- Entonces no se encola ningún recordatorio.

#### Scenario: El recordatorio no se repite

- Dado un lead con `recordatorio_en` marcado,
- Cuando el barrido corre otra vez,
- Entonces no se encola un segundo recordatorio.
