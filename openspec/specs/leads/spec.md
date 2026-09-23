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
