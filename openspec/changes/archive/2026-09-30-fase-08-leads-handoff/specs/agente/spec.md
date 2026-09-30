# Delta for Agente

## MODIFIED Requirements

### Requirement: AGT11 — marcar_lead_caliente registra la propuesta; la decisión es de la escala

`marcar_lead_caliente` MUST recibir `temperatura` (`tibio`/`caliente`), `senales` (del vocabulario
cerrado de LDS1), `resumen` e `id_producto` (o `null`), y MUST pasar la propuesta al puerto
`EVALUADOR_LEAD`, que decide si se deriva (**R9**: el LLM propone, la escala confirma). La
implementación de la Fase 08 MUST guardar el lead (LDS2) y MUST responder `derivado: true` solo si la
escala lo confirmó; un `derivado: true` MUST convertirse en un handoff con motivo `lead-caliente` (dentro
de horario) o en la captura de datos (fuera de horario, LDS4). Un turno con el efecto `sin-cobertura` MUST
responder `derivado: false` sin consultar la escala ni crear el lead.

Fase que lo implementa: 07b (herramienta y puerto); 08 (escala, `lead`, derivación)

#### Scenario: La propuesta confirmada por la escala deriva

- Dado un turno con `senales = ["pide_pagar"]` dentro del horario de atención,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: true` y el turno termina en handoff con motivo `lead-caliente`.

#### Scenario: La propuesta que la escala no confirma no deriva

- Dado un turno con `senales = ["pregunta_precio"]`,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: false` con un motivo y el turno no tiene handoff.

#### Scenario: Sin cobertura no se evalúa el lead

- Dado un turno en el que `cotizar_envio` dejó el efecto `sin-cobertura`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces el modelo recibe `derivado: false` y el evaluador no se consulta.

## ADDED Requirements

### Requirement: AGT14 — Política de petición de persona en el pipeline

El pipeline del turno MUST incluir, antes del contenido del LLM y después de las políticas de mensajes no
textuales y de tope de turnos, una política que aplica LDS3: si el texto pide una persona, responde con
el texto de handoff del horario y el motivo `pide-persona`; si no, deja pasar.

Fase que lo implementa: 08

#### Scenario: La política corta el pipeline antes del LLM

- Dado el mensaje "pásame con un humano",
- Cuando el motor recorre las políticas,
- Entonces responde con el texto de handoff y el motivo `pide-persona` sin llegar a `ContenidoLlm`.

#### Scenario: Un mensaje normal pasa al LLM

- Dado el mensaje "hola, busco un collar",
- Cuando el motor recorre las políticas,
- Entonces la política deja pasar y responde `ContenidoLlm`.
