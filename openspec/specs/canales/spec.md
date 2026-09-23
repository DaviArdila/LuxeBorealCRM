# Canales — Specification

## Purpose

Los eventos del cliente entran por el canal de mensajería (Chatwoot, que a su vez normaliza
WhatsApp y otros canales) y las respuestas salen por el mismo canal. Este dominio cubre las
garantías de seguridad y de entrega que valen para **todo** evento entrante y **todo** mensaje
saliente, sin importar el canal de origen (`docs/analisis/05-multicanal.md`).

## Requirements

### Requirement: R3 — Validación de firma antes de cualquier lógica

El sistema MUST validar la firma del evento entrante sobre el cuerpo (body) crudo antes de ejecutar
cualquier lógica de negocio. Si la firma es inválida, el sistema MUST responder 401 sin registrar el
payload.

Fase que lo implementa: 04

#### Scenario: Evento con firma válida

- Dado que llega un evento con firma válida,
- Cuando se procesa el webhook,
- Entonces se registra en el inbox de eventos y continúa el procesamiento.

#### Scenario: Evento con firma inválida

- Dado que llega un evento con firma inválida,
- Cuando se procesa el webhook,
- Entonces el sistema responde 401 y el payload no se registra.

### Requirement: R4 — Procesamiento y envío únicos

Cada mensaje entrante MUST procesarse una sola vez y cada mensaje saliente MUST enviarse una sola
vez, aunque haya reintentos del proveedor del canal o de la cola de trabajos.

Fase que lo implementa: 04

#### Scenario: Reintento del proveedor sobre un evento entrante

- Dado que el mismo evento entrante llega dos veces (reintento del proveedor del canal),
- Cuando se procesa,
- Entonces la lógica de negocio se ejecuta una sola vez (deduplicación por identificador externo del
  evento).

#### Scenario: Reintento de un job de envío tras un fallo

- Dado que un job de envío falla después de enviar el primer mensaje de una secuencia y se
  reintenta,
- Cuando se reanuda,
- Entonces retoma desde el primer paso no marcado como enviado, sin duplicar el mensaje ya enviado
  al cliente.
