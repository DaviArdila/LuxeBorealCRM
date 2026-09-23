# Privacidad — Specification

## Purpose

Garantiza que el sistema no exponga datos personales del cliente por descuido: ni en logs, ni en lo
que persiste de los eventos entrantes, ni en el resumen que se genera de un lead. El contenido de
los mensajes no es responsabilidad de este sistema — vive en Chatwoot; aquí solo se guarda lo
mínimo, redactado.

## Requirements

### Requirement: R14 — Datos personales

El primer mensaje del bot MUST incluir un aviso de que es un asistente automatizado. Los logs MUST
NOT incluir contenido de mensajes, números de teléfono completos, cédula ni correo. El contenido de
los mensajes MUST NOT persistirse en la base propia (vive en Chatwoot): el inbox de eventos MUST
guardar el evento entrante **redactado** — solo ids, tipo de evento y metadatos, nunca el texto del
mensaje ni adjuntos. Al reprocesar un evento, el sistema MUST releer el contenido desde la API de
Chatwoot en vez de leerlo del payload persistido. El resumen de un lead (`lead.resumen`) MUST NOT
incluir datos personales (teléfono, cédula, correo ni dirección).

Fase que lo implementa: todas

#### Scenario: Aviso de asistente automatizado

- Dado que el bot inicia una conversación con un cliente nuevo,
- Cuando envía el primer mensaje,
- Entonces incluye el aviso parametrizado de que es un asistente automatizado y que los datos se
  usan para atender el pedido.

#### Scenario: El inbox guarda el evento redactado

- Dado que se registra un evento entrante en el inbox,
- Cuando se persiste,
- Entonces el payload guardado contiene solo ids, tipo de evento y metadatos — nunca el texto del
  mensaje, adjuntos ni datos personales.

#### Scenario: Reprocesar relee el contenido de Chatwoot

- Dado que un evento del inbox necesita reprocesarse,
- Cuando se reprocesa,
- Entonces el contenido se relee de la API de Chatwoot en vez de leerse del payload redactado que
  quedó persistido.

#### Scenario: El resumen de un lead no lleva datos personales

- Dado que se genera el resumen de un lead,
- Cuando se guarda,
- Entonces `lead.resumen` no incluye teléfono, cédula, correo ni dirección.

#### Scenario: Redacción en logs

- Dado que se escribe cualquier log del sistema,
- Cuando ese log incluiría contenido de mensajes, un número de teléfono completo, cédula o correo,
- Entonces esos datos se redactan (el número de teléfono se registra solo con sus últimos 4
  dígitos).
