# 0018. Presupuesto de tiempo del turno del agente: plazo compartido y tope de vueltas

- Estado: propuesta
- Fecha: 2026-09-29

## Contexto

El lock del turno dura `LOCK_TURNO_TTL_S = 30 s` y no tiene heartbeat (Fase 05). El gateway del LLM
ya limita **cada llamada** a `LOCK_TURNO_TTL_S − 5 s` (D3 de la Fase 06), pero el bucle de
herramientas hace varias llamadas por turno (buscar → ficha → cotizar → fotos → texto). Sin un plazo
del turno, seis vueltas podrían durar minutos: el lock vence a mitad de turno, otro job toma la
conversación y el cliente recibe respuestas duplicadas (R8). `SPEC.md` §5 pide además p95 < 20 s
desde el último mensaje.

## Alternativas

1. **Subir `LOCK_TURNO_TTL_S`** a 60-90 s. Fácil, pero un turno trabado bloquea la conversación más
   tiempo y el p95 se aleja del objetivo.
2. **Heartbeat del lock** (renovar mientras el turno trabaja). Resuelve el vencimiento, pero agrega
   piezas móviles (temporizador, carrera al liberar) y no acota la duración del turno.
3. **Plazo del turno compartido + tope de vueltas**: el turno arranca con
   `plazo = LOCK_TURNO_TTL_S − 5 s` (25 s con los valores actuales); cada llamada al LLM recibe el
   tiempo restante (`SolicitudGeneracion.plazoMs`, LLM14) y el gateway usa el menor entre su propio
   presupuesto y ese plazo; como máximo `AGENTE_MAX_VUELTAS = 5` llamadas; si el plazo o las vueltas
   se agotan sin texto final, el turno deriva a humano con `mensaje_error_llm`.

## Decisión

Alternativa 3. Sin heartbeat y sin cambiar el lock. El plazo se deriva de la configuración existente
(nunca una constante nueva que pueda desalinearse del lock).

## Consecuencias

- El lock nunca vence durante un turno; nunca hay respuestas duplicadas por esa causa.
- Un proveedor lento termina en traspaso a una persona, visible y con texto de cortesía, nunca en
  silencio.
- El número de vueltas y el plazo se ajustan con datos de la corrida manual (Fase 07c) cambiando
  configuración.
- Cambia el contrato de `LlmPort` de forma compatible (campo opcional `plazoMs`).
