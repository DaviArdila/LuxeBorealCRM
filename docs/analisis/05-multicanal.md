# 05 · Multicanal: núcleo agnóstico, bordes con perfil de capacidades

- Fecha: 2026-09-22 · Estado: primera versión (responde P1)

## Respuesta corta

Sí, otros canales cambian el diseño, pero poco, porque **Chatwoot ya los normaliza**: WhatsApp,
Instagram y Messenger llegan al bot como el mismo evento del Agent Bot, y salen por la misma API.
El canal de origen viene en cada evento (`conversation.channel`: `Channel::Whatsapp`,
`Channel::Instagram`, `Channel::FacebookPage`, `Channel::WebWidget`…).

Por eso:

1. **El agente es agnóstico**: las reglas de negocio, las herramientas y el embudo no preguntan por
   el canal.
2. **Lo que sí cambia por canal** se concentra en un **perfil de capacidades** que el borde calcula
   a partir de `conversation.channel` y el agente consulta.
3. **La identidad** del cliente es el contacto de Chatwoot (`chatwoot_contact_id`), no el teléfono.

## Perfil de capacidades (primer borrador)

| Capacidad | WhatsApp | Instagram | Messenger | Widget web |
|---|---|---|---|---|
| Ventana para responder gratis/sin plantilla | 24 h | 24 h | 24 h | sin límite |
| Costo por mensaje saliente | sí (desde 1-oct-2026) | no | no | no |
| Indicador "escribiendo…" | sí, llamada directa a Meta | por verificar | por verificar | Chatwoot |
| Tenemos el teléfono | sí | no | no | solo si lo da |
| Cómo llega el producto de interés | SKU en el texto del enlace `wa.me` | respuesta a una publicación/historia | referencia de anuncio | página de origen |
| Límite de texto en listas/botones | 24 / 72 caracteres | por verificar | por verificar | — |
| Adjuntos | imagen, audio, ubicación, documento | imagen, audio | imagen, audio | imagen, archivo |

Consecuencias en el código (se detallan en la Fase 04 y la Fase 07):

- El número de mensajes por respuesta se optimiza **solo** donde cuesta (WhatsApp); en los demás
  se puede ser menos estricto.
- Pedir el teléfono en la captura de datos solo cuando el canal no lo trae.
- El contexto inicial (qué producto le interesa) se resuelve por canal en el borde.
- Hoy se implementa **solo WhatsApp**; el perfil existe desde el principio para que agregar un canal
  sea llenar una columna, no tocar el agente.

## Lo que no se construye

Una tabla propia de identidades por canal: Chatwoot ya une a la misma persona entre canales
(contacto con varios `contact_inbox` + fusión). Ver `04-chatwoot-delegar-vs-construir.md`.
