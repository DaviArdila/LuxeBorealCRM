# 0004. Inbox de eventos entrantes y outbox de efectos externos

- Estado: aceptada (2026-09-23)
- Fecha: 2026-09-22

## Contexto

El webhook del prototipo marca el mensaje como procesado (dedupe) **antes** de procesarlo, hace la
lógica dentro del request y responde 200 tras un `Promise.race` de 1,5 s aunque siga trabajando
(`webhook/router.ts`). Si el proceso cae después del 200, el evento se pierde y la dedupe impide
recuperarlo. Del lado de salida, la notificación a Telegram tiene un mecanismo propio de reintento
(`lead.notificado_en = null` + job), y el espejo de status en Chatwoot es "mejor esfuerzo" sin
reintento.

## Alternativas

1. Mantener el procesamiento en el request.
2. Encolar el evento crudo en BullMQ y responder (la cola es el inbox; Redis persistente).
3. Tabla `evento_entrante` en Postgres (id externo único = dedupe) + job que la procesa.

## Decisión

**Inbox:** el controlador valida la firma, inserta el evento **redactado** en `evento_entrante`
(ids, tipo de evento y metadatos; nunca el texto del mensaje, adjuntos ni datos personales — R14,
P15) con `UNIQUE(origen, id_externo)` (un duplicado se ignora) y responde 200. Al reprocesar, el
contenido se relee de la API de Chatwoot. Un procesador BullMQ lo
consume con reintentos y marca `procesado_en`/`error`. **Outbox:** todo efecto externo que no se
puede perder (Telegram, status en Chatwoot, avisos) se inserta en `outbox` dentro de la misma
transacción que el cambio de negocio que lo provoca; un publicador lo envía con reintento y backoff.
El envío de mensajes al cliente conserva su idempotencia por paso (B5 del análisis).

## Consecuencias

- Ningún evento aceptado se pierde; los fallidos quedan visibles y reprocesables.
- Un mecanismo único de reintento para todos los efectos externos.
- Costo: dos tablas y un job; limpieza periódica de filas viejas.
- Obligatorio: los consumidores de inbox y outbox son idempotentes.

## Aclaración (Fase 04, 2026-09-26): contenido de mensaje en el outbox

La redacción "nunca el texto del mensaje, adjuntos ni datos personales" (R14, P15) de la sección
Decisión aplica al **inbox** (`evento_entrante`): ahí no hace falta el texto porque, al reprocesar,
se relee de la API de Chatwoot. El **outbox** es distinto: para un mensaje saliente, Chatwoot todavía
no tiene ese contenido, así que un reintento tras una caída necesita releerlo desde algún lado propio.
El usuario decide (2026-09-26) aceptar que el outbox guarde el texto en una columna efímera mientras
la fila está pendiente, borrada al enviarse o al fallar definitivamente — almacenamiento operativo
necesario para el reintento, no un log (R14 rige logging, no esta tabla). Sin mitigación adicional
(cifrado en reposo o purga forzada) por ahora; se puede revisitar si el volumen o el riesgo lo
justifican.
