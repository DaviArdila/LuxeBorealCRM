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

Fuera del horario de atención configurado, el bot MUST seguir atendiendo al cliente y MUST NOT aparcar la conversación
esperando a un asesor. El aviso de un lead caliente MUST esperar a que los datos del cliente queden guardados, y el contexto
del turno MUST informar al modelo, como un hecho, que está fuera de horario, que el cliente mostró intención de compra y qué
datos faltan (LDS4). Qué pedir y cómo cerrar la captura lo define un caso de uso del dueño; el código no trae un guion. Una
petición explícita de una persona fuera de horario MUST avisar de inmediato (LDS4, NTF8).

(Previously: el requisito decía «antes de avisar del lead» sin distinguir la petición de persona, el escenario hablaba de una
conversación que «entraría en `handoff_pendiente`» y el código le daba al modelo un guion de captura.)

Fase que lo implementa: 08; 12d (aviso en lugar de traspaso; la captura se informa como hecho)

#### Scenario: Un lead caliente fuera de horario espera los datos antes del aviso

- Dado que la escala confirma un lead caliente y el sistema está fuera del horario de atención configurado,
- Cuando el bot detecta esa condición,
- Entonces el contexto del turno informa el hecho de la captura pendiente y el aviso del lead espera a que se guarden los datos, en vez de salir de inmediato.

#### Scenario: La conversación sigue atendida tras avisar el lead capturado fuera de horario

- Dado que el bot ya avisó el lead capturado fuera de horario,
- Cuando el cliente escribe de nuevo,
- Entonces el bot le sigue respondiendo con normalidad; la conversación no queda aparcada.

### Requirement: R11 — Notificación de lead al asesor

El sistema MUST notificar al grupo de Telegram como máximo 1 vez por contacto cada 24 horas, MUST
enviar la notificación después de que la respuesta del turno quedó encolada (y, cuando hubo un traspaso, después de
confirmar el cambio de estado), nunca antes, y MUST reintentar el envío hasta entregarse.

(Previously: la notificación esperaba siempre a la confirmación de un cambio de estado, porque todo lead caliente traspasaba la conversación.)

Fase que lo implementa: 08; 12d (el lead caliente avisa sin cambio de estado)

#### Scenario: Ventana de 24 horas por contacto

- Dado que un contacto ya generó una notificación de lead en las últimas 24 horas,
- Cuando se detecta un nuevo lead caliente para ese contacto,
- Entonces no se envía una segunda notificación dentro de esa ventana.

#### Scenario: La notificación se envía después de encolar la respuesta

- Dado un lead caliente confirmado en un turno que también responde al cliente,
- Cuando se envía la notificación al grupo de Telegram,
- Entonces esa notificación se encola después de la respuesta del turno, nunca antes.

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

### Requirement: LDS2 — Un lead evaluado se guarda y se avisa una sola vez por conversación

Cada propuesta de `marcar_lead_caliente` MUST guardarse como una fila de `lead` con su temperatura, sus
señales válidas y un resumen sin datos personales, **solo si el contacto aceptó el tratamiento de datos** (AGT26), y
`derivado` MUST valer `true` solo si la escala la confirmó. Una conversación MUST tener como máximo un lead abierto: una
propuesta posterior MUST actualizar ese lead en vez de crear otro, y una vez `derivado` MUST NOT volver a avisarse. Sin
cobertura de envío en el turno, MUST NOT crearse el lead (R9).

(Previously: no exigía el consentimiento y el texto decía «deriva» donde ahora se avisa.)

Fase que lo implementa: 08; 12d (puerta de consentimiento)

#### Scenario: La propuesta confirmada crea un lead derivado

- Dado un turno con `pide_pagar`, la propuesta "caliente" y un contacto que aceptó el tratamiento de datos,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces existe un lead con `derivado = true` para el contacto y la conversación, y el modelo recibe
  `derivado: true`.

#### Scenario: La propuesta no confirmada se guarda sin derivar

- Dado un turno con solo `pregunta_precio` y un contacto que aceptó,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces existe un lead con `derivado = false` y el modelo recibe `derivado: false` con un motivo.

#### Scenario: Una segunda propuesta actualiza el lead existente

- Dado un lead abierto no derivado de la conversación,
- Cuando el modelo propone de nuevo con nuevas señales,
- Entonces sigue habiendo un solo lead, con las señales unidas.

#### Scenario: Un lead ya derivado no se avisa otra vez

- Dado un lead ya derivado de la conversación,
- Cuando el modelo vuelve a proponer "caliente",
- Entonces no se crea un segundo lead ni un segundo aviso.

#### Scenario: Sin cobertura no se crea el lead

- Dado un turno en el que `cotizar_envio` dejó el efecto `sin-cobertura`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces no se crea ningún lead.

#### Scenario: Sin consentimiento no se crea el lead

- Dado un contacto que no aceptó el tratamiento de datos,
- Cuando el modelo llama `marcar_lead_caliente` con señales que la escala confirmaría,
- Entonces no se crea ningún lead, no se avisa y el modelo recibe `requiereConsentimiento: true`.

#### Scenario: El resumen no lleva datos personales

- Dado un resumen con un teléfono y un correo,
- Cuando se guarda el lead,
- Entonces la fila guarda el resumen con esos datos reemplazados y ningún log los contiene.

### Requirement: LDS3 — Pedir hablar con una persona avisa de inmediato, sin esperar al LLM

Antes de llamar al LLM, el agente MUST detectar con reglas deterministas que el cliente pide hablar con
una persona (asesor, humano, agente) o rechaza hablar con un bot, y en ese caso MUST avisar al asesor en ese mismo turno con
el motivo `pide-persona`, sin esperar al LLM ni traspasar la conversación; el turno MUST seguir al LLM para que el bot
responda. MUST registrar además un lead derivado con la señal `pide_persona` **solo si el contacto aceptó el tratamiento de
datos**; sin aceptación el aviso sale igual y no se registra el lead. Un mensaje que solo menciona la palabra ("asesor") sin
pedirlo MUST NOT avisar.

(Previously: derivaba la conversación a `handoff_pendiente` en ese mismo turno, con el texto de traspaso y sin consultar al LLM, y registraba el lead siempre.)

Fase que lo implementa: 08; 12d (avisa y sigue; el lead requiere consentimiento)

#### Scenario: Petición explícita de hablar con una persona

- Dado el mensaje "quiero hablar con un asesor" de un contacto que aceptó,
- Cuando se procesa el turno dentro del horario de atención,
- Entonces el turno trae un aviso `pide-persona`, la conversación sigue en `bot`, el LLM responde en el mismo turno y queda un lead derivado con la señal `pide_persona`.

#### Scenario: Rechazar hablar con un bot también avisa

- Dado el mensaje "no quiero hablar con un robot, pásame con alguien",
- Cuando se procesa el turno,
- Entonces avisa con motivo `pide-persona`.

#### Scenario: Mencionar la palabra no es pedirla

- Dado el mensaje "¿el asesor de ustedes atiende los sábados?",
- Cuando se procesa el turno,
- Entonces el turno sigue al LLM sin ningún aviso.

#### Scenario: Pedir una persona sin cobertura sigue avisando

- Dado un cliente cuyo destino no tiene cobertura que pide hablar con una persona,
- Cuando se procesa el turno,
- Entonces avisa (pedir una persona no es un lead comercial: R9 solo excluye el lead).

#### Scenario: Sin consentimiento el aviso sale y el lead no se registra

- Dado el mensaje "quiero hablar con un asesor" de un contacto que no aceptó el tratamiento de datos,
- Cuando se procesa el turno,
- Entonces el turno trae el aviso `pide-persona` y no existe ningún lead nuevo.

### Requirement: LDS4 — Fuera de horario el bot captura los datos y sigue atendiendo

Si un lead confirmado ocurre fuera del horario de atención, el sistema MUST NOT avisar de inmediato y MUST avisar al asesor
solo cuando `guardar_datos_contacto` haya guardado los datos (que a su vez exige el consentimiento, AGT26). Mientras tanto, el
contexto del turno y la respuesta de `marcar_lead_caliente` MUST informar al modelo **un solo hecho, con la misma redacción**:
fuera de horario, el cliente mostró intención de compra y faltan sus datos de contacto (nombre completo, teléfono de contacto,
dirección y localidad). Ese hecho MUST NOT ordenar qué pedir, en qué orden ni con qué texto despedirse: esa conducta la define
un caso de uso que crea el dueño (la guía de operación trae el ejemplo «Captura fuera de horario»; no se siembra). Si lo que
ocurre fuera de horario es una petición de persona, el sistema MUST avisar de inmediato con `pide-persona` (el asesor lo ve al
abrir) y el contexto MUST informar el mismo hecho; completar la captura MUST marcar el lead sin impedir su aviso propio. El
lead MUST quedar con `capturado_fuera_horario = true` y la conversación en `bot`, y el cliente MUST seguir recibiendo
respuestas.

(Previously: una petición de persona fuera de horario no avisaba hasta guardar los datos; el código le daba al modelo un guion de
captura —qué pedir y «despídete con este texto exacto»— con el caso del sistema `mensaje_captura_completa`, redactado distinto en
`armar-contexto-inicial.ts` y en `evaluar-propuesta-lead.ts`.)

Fase que lo implementa: 08; 12d (aviso inmediato de la petición de persona, consentimiento y captura informada como hecho)

#### Scenario: Un lead caliente fuera de horario informa el hecho y no avisa todavía

- Dado un lead confirmado fuera del horario de atención,
- Cuando se arma el siguiente turno,
- Entonces el contexto del turno dice que está fuera de horario, que el cliente mostró intención de compra y qué datos faltan, sin ordenar qué pedir; la conversación sigue en `bot` y todavía no se encola ningún aviso.

#### Scenario: Con los datos guardados se avisa y el lead queda capturado

- Dado un lead pendiente de captura fuera de horario y un contacto que aceptó,
- Cuando el modelo guarda los datos del contacto,
- Entonces el lead queda con `capturado_fuera_horario = true` y se encola el aviso al asesor.

#### Scenario: Una petición de persona fuera de horario avisa de inmediato

- Dado el mensaje "quiero hablar con un asesor" fuera del horario de atención,
- Cuando se procesa el turno,
- Entonces el turno trae el aviso `pide-persona`, el contexto informa que faltan los datos del cliente y la conversación sigue en `bot`.

#### Scenario: Sin consentimiento el contexto informa también el consentimiento pendiente

- Dado un lead pendiente de captura fuera de horario y un contacto sin respuesta de consentimiento,
- Cuando se arma el siguiente turno,
- Entonces el contexto trae el hecho de la captura pendiente y que el consentimiento está pendiente, y no ordena guardar datos.

#### Scenario: La conversación sigue atendida tras avisar el lead capturado

- Dado un lead ya capturado y avisado fuera de horario,
- Cuando el cliente escribe de nuevo,
- Entonces el bot responde con normalidad y la conversación no queda aparcada.

#### Scenario: Dentro de horario no se captura, se avisa

- Dado un lead confirmado dentro del horario de atención,
- Cuando se procesa el turno,
- Entonces el turno trae el aviso `lead-caliente`, conserva el texto del modelo y la conversación sigue en `bot`.

#### Scenario: El hecho de la captura es el mismo en el contexto y en la herramienta

- Dado un lead confirmado fuera de horario,
- Cuando `marcar_lead_caliente` responde al modelo y después se arma el siguiente turno,
- Entonces los dos textos dicen el mismo hecho con la misma redacción y ninguno contiene qué pedir, en qué orden ni un texto de despedida.

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
