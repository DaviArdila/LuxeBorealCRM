# Delta for Notificaciones

El aviso al asesor deja de depender de un cambio de estado. Hay dos familias: el **aviso de traspaso** (la conversación pasó a
`handoff_pendiente`: fallas del bot y tope de turnos) y el **aviso sin traspaso** (el bot sigue atendiendo: pidió una persona,
audio repetido, lead caliente). Los dos usan el mismo encolado, el mismo texto plano sin datos personales y el mismo enlace a
Chatwoot (NTF1, NTF5). Se agrega el motivo `pide-asesor`.

## RENAMED Requirements

- FROM: `### Requirement: NTF3 — El aviso se envía después de confirmar el cambio de estado`
- TO: `### Requirement: NTF3 — El aviso se envía después de confirmar lo que lo origina`

## MODIFIED Requirements

### Requirement: NTF3 — El aviso se envía después de confirmar lo que lo origina

El aviso de un **traspaso** MUST encolarse solo después de que la transición de la conversación quedó confirmada en la base
(nunca antes), y MUST NOT encolarse si la transición falla o la conversación ya no está en el estado esperado. El aviso **sin
traspaso** (NTF8) MUST encolarse solo después de que los pasos de la respuesta del turno quedaron encolados, y MUST NOT
encolarse si la conversación ya pasó a `humano` (CNV13).

(Previously: el requisito exigía confirmar siempre una transición de estado, porque todo aviso la tenía.)

Fase que lo implementa: 08; 12d (avisos sin traspaso)

#### Scenario: La notificación de un traspaso se envía después de confirmar el estado

- Dado un traspaso por tope de turnos,
- Cuando se ejecuta la derivación,
- Entonces la conversación ya está en `handoff_pendiente` cuando el aviso entra al outbox.

#### Scenario: Una transición fallida no avisa

- Dado que la transición a `handoff_pendiente` no se pudo aplicar,
- Cuando se procesa el traspaso,
- Entonces no se encola ningún aviso.

#### Scenario: El aviso sin traspaso entra al outbox después de la respuesta

- Dado una respuesta con un paso de texto y un aviso `pide-asesor`,
- Cuando se procesa el turno,
- Entonces el paso de texto está encolado antes que la fila de outbox `notificacion.telegram`.

#### Scenario: Un aviso sin traspaso no se encola si un asesor ya tomó la conversación

- Dado una conversación que pasó a `humano` mientras el generador corría,
- Cuando se procesa la respuesta con aviso,
- Entonces no se encola ningún aviso.

### Requirement: NTF6 — Todo traspaso a una persona avisa, con su motivo

Cuando una conversación pasa a una persona por **cualquier** motivo de handoff (`tope-turnos`, `fallo-llm`, `techo-gasto`,
`argumentos-invalidos`, `plazo-agotado`), el sistema MUST encolar un aviso al asesor **después** de confirmar la transición
(NTF3). Cada motivo MUST decirse con un texto propio en claro. Estos avisos MUST avisar una sola vez por instancia de traspaso
(conversación, motivo y versión de la conversación) y MUST NOT crear un lead.

(Previously: la lista incluía `lead-caliente`, `pide-persona` y `audio-repetido`, que ahora avisan sin traspasar (NTF8); los dos
primeros seguían el camino de leads.)

Fase que lo implementa: 08d; 12d (la lista de motivos de traspaso baja a cinco)

#### Scenario: El tope de turnos avisa

- Dado una conversación que llega al tope de turnos y pasa a `handoff_pendiente`,
- Cuando la transición queda confirmada,
- Entonces hay una fila de outbox `notificacion.telegram` cuyo texto dice que el bot llegó al tope de turnos y trae
  el enlace de la conversación.

#### Scenario: Cada motivo tiene su texto

- Dado un traspaso por falla del LLM y otro por techo de gasto,
- Cuando se arman los avisos,
- Entonces los dos textos son distintos y ninguno contiene teléfono ni nombre del cliente.

#### Scenario: Un reintento del mismo traspaso no duplica el aviso

- Dado un traspaso por tope de turnos ya avisado,
- Cuando el mismo evento de handoff se procesa de nuevo,
- Entonces no se encola un segundo aviso.

#### Scenario: Un traspaso posterior, con otra versión de la conversación, avisa de nuevo

- Dado una conversación que vuelve a `bot` y llega otra vez al tope de turnos,
- Cuando pasa a un asesor por segunda vez,
- Entonces se encola un aviso nuevo.

#### Scenario: Una transición fallida de un traspaso no avisa

- Dado un traspaso cuya transición falla o cuya conversación ya no está en el estado esperado,
- Cuando se intenta avisar,
- Entonces no se encola ningún aviso.

## ADDED Requirements

### Requirement: NTF8 — El aviso sin traspaso llega una vez por motivo, también fuera de horario

Cuando la respuesta de un turno trae un aviso con motivo `pide-persona`, `pide-asesor` o `audio-repetido`, el sistema MUST
encolar un aviso al asesor con el enlace de la conversación (NTF5) y un texto propio en claro por motivo, sin datos
personales (NTF1) y sin crear un lead. MUST encolarse una sola vez por conversación **y motivo** mientras el asesor no la tome
(CNV14: `pide-persona` y `pide-asesor` cuentan como el mismo motivo) y con una clave de idempotencia del outbox por
conversación, versión y motivo; un aviso de otro motivo MUST encolarse aunque ya haya uno. El aviso con motivo `lead-caliente` MUST seguir
el camino de leads (R11, NTF2). Un aviso sin traspaso MUST encolarse dentro y fuera del horario de atención. No MUST depender de la ventana de 24
horas por contacto (NTF2).

Fase que lo implementa: 12d

#### Scenario: Pedir una persona avisa y el texto lo dice

- Dado un turno con aviso `pide-persona`,
- Cuando se encola el aviso,
- Entonces hay una fila de outbox `notificacion.telegram` cuyo texto dice que el cliente pidió hablar con una persona y trae el enlace de la conversación.

#### Scenario: La herramienta derivar_a_asesor tiene su propio texto

- Dado un turno con aviso `pide-asesor` y otro con `pide-persona`,
- Cuando se arman los avisos,
- Entonces los textos son distintos y ninguno contiene teléfono, nombre ni el motivo que escribió el modelo.

#### Scenario: El audio repetido avisa sin traspasar

- Dado un turno con aviso `audio-repetido`,
- Cuando se encola el aviso,
- Entonces el texto dice que el cliente insiste con audios y la conversación sigue en `bot`.

#### Scenario: Fuera de horario el aviso también sale

- Dado un turno fuera del horario de atención con aviso `pide-asesor`,
- Cuando se procesa el turno,
- Entonces se encola el aviso igual que dentro de horario.

#### Scenario: Un segundo aviso del mismo motivo no se encola

- Dado una conversación con un aviso `pide-persona` ya encolado y su marca puesta,
- Cuando un turno posterior trae un aviso `pide-asesor`,
- Entonces no se encola un segundo aviso.

#### Scenario: Un aviso de otro motivo sí se encola

- Dado una conversación con un aviso `pide-persona` ya encolado y su marca puesta,
- Cuando un turno posterior trae un aviso `audio-repetido`,
- Entonces se encola un aviso nuevo cuyo texto dice que el cliente insiste con audios.

#### Scenario: Pasada la toma del asesor se puede avisar otra vez

- Dado una conversación avisada que pasó a `humano` y volvió a `bot`,
- Cuando un turno trae un aviso `pide-asesor`,
- Entonces se encola un aviso nuevo.

#### Scenario: El aviso sin traspaso no consume la ventana de leads

- Dado un contacto sin leads avisados y un aviso `pide-persona`,
- Cuando se encola el aviso,
- Entonces el contacto sigue sin `notificado_en` y un lead caliente posterior se avisa sin esperar 24 horas.

#### Scenario: Un fallo del encolado no pierde el turno

- Dado que el encolado del aviso falla,
- Cuando se procesa el turno con aviso,
- Entonces la respuesta al cliente ya está encolada, se registra un `warn` sin datos del cliente y el siguiente aviso reintenta.
