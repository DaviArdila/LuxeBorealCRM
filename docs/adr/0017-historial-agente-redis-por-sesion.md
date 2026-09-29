# 0017. Historial corto del agente en Redis, por sesión bot

- Estado: aceptada (2026-09-29)
- Fecha: 2026-09-29

## Contexto

El LLM necesita los últimos turnos para responder con sentido (el prototipo usaba 6 turnos,
`../ChatLuxeCRM/src/estado/historial.ts`, lista en Redis con TTL de 30 días por número). P3 prohíbe
guardar mensajes en Postgres; `docs/analisis/04-chatwoot-delegar-vs-construir.md` dejó para la Fase 07
elegir entre Redis propio y la API de Chatwoot "midiendo la latencia". El turno ya corre con un
presupuesto de 25 s frente a un lock de 30 s (ADR-0018).

## Alternativas

1. **API de Chatwoot en cada turno** (`GET …/conversations/{id}/messages`). Sin copia propia, e
   incluye lo que escribió el asesor. Cuesta una llamada HTTP más en el camino crítico de cada turno;
   si Chatwoot falla, el turno pierde el contexto; hay que filtrar notas privadas, adjuntos y mensajes
   de actividad; y no guarda las llamadas a herramientas.
2. **Reconstruir desde el buffer del turno**. No sirve: el buffer se vacía en cada turno.
3. **Redis del agente por sesión bot**: lista de pares usuario/asistente (solo texto final, nunca
   resultados de herramientas), clave `agente:<conversacionId>:v<version>:historial`, ventana de 6
   turnos, TTL `AGENTE_SESION_TTL_H`.

La latencia de la alternativa 1 **no se midió** en esta planeación (no hay instancia de Chatwoot
disponible desde el repo); la decisión no depende de ese número sino de la robustez y del contenido.

## Decisión

Alternativa 3. La sesión es `(conversacionId, version)`: la versión solo cambia al transicionar, así
que el historial arranca vacío cada vez que la conversación vuelve al bot desde un asesor (P29) y el
bot no mezcla el contexto previo al traspaso con lo que resolvió la persona.

## Consecuencias

- Cero llamadas extra a Chatwoot por turno; el turno funciona aunque Chatwoot responda lento.
- El contenido de los mensajes vive en Redis con TTL (efímero, ADR-0003), nunca en Postgres (P3) ni
  en logs (R14).
- El bot no ve lo que escribió el asesor. Si el uso real muestra que hace falta, se agrega la lectura
  de Chatwoot solo al **inicio** de una sesión nueva, no en cada turno.
- Queda prohibido guardar resultados de herramientas en el historial: los datos de dinero se piden de
  nuevo en el turno en que se citan (R1: todo dato citado se rastrea a una llamada del mismo turno).
