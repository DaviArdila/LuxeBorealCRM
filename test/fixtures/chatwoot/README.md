# Fixtures de Chatwoot

Payloads **reales**, capturados el **2026-09-26** contra una instancia local de **Chatwoot
v4.17.1** (Docker, `../ChatLuxeCRM/infra/chatwoot/docker-compose.yml`, proyecto
`chatwoot-local`), cuenta de prueba `1`, inbox `1` (canal `Channel::Api`, "WhatsApp (pruebas)").
Insumo de T1 de `openspec/changes/fase-04-canal-chatwoot/tasks.md`.

## Cómo se capturaron

1. Se creó un contacto y una conversación de prueba en la cuenta vía la API de administración
   (`api_access_token` del token de administrador).
2. Se apuntó temporalmente el `outgoing_url` del Agent Bot (`AgentBot#1`, "ChatLuxeCRM bot") a un
   receptor HTTP local ad-hoc (no versionado, fuera del repositorio) que guardó cada request
   entrante (headers + body crudo) tal como Chatwoot los envía.
3. Se disparó cada tipo de evento con llamadas reales a la API de Chatwoot (mensajes entrantes/
   salientes, nota privada, cambios de estado de la conversación).
4. Se restauró el `outgoing_url` original del Agent Bot al terminar.

## Anonimización

Sobre el body capturado se reemplazó, por texto exacto, antes de versionar:

- El teléfono real del contacto de prueba (`573009998877` / `+573009998877`) → `573001112233` /
  `+573001112233` (mismo formato, número ficticio).
- El nombre del contacto de prueba (`Cliente Prueba Fixture`) → `Cliente Ejemplo`.
- El `pubsub_token` de `contact_inbox` (token de sesión del widget, no aplica a este canal pero
  Chatwoot lo incluye igual) → `token-pubsub-anonimizado`.
- El dominio público de los `data_url`/`thumb_url` de adjuntos → `chatwoot.ejemplo.local`.

No se tocó nada más: nombres de eventos, ids numéricos (mensaje, conversación, contacto, cuenta,
inbox), `message_type`, `status`, `content_attributes`, timestamps y el nombre de la cuenta de
prueba (`Luna SAS`, cuenta de desarrollo, no es dato personal de un cliente) se dejan tal como
Chatwoot los produjo, para que los tests validen la forma real del payload.

## Archivos

| Archivo | Evento real | Notas |
|---|---|---|
| `mensaje-creado-entrante-texto.json` | `message_created`, `message_type: incoming` | Mensaje de texto del contacto (cliente) |
| `mensaje-creado-entrante-adjunto.json` | `message_created`, `message_type: incoming` | Con un adjunto de imagen (`attachments[0].file_type: "image"`) |
| `mensaje-creado-saliente-humano.json` | `message_created`, `message_type: outgoing` | Enviado con el token del administrador; `sender.type: "user"` (asesor humano) |
| `mensaje-creado-nota-privada.json` | `message_created`, `message_type: outgoing`, `private: true` | Nota interna; Chatwoot **sí** dispara el webhook para notas privadas (confirmado empíricamente; la traducción del evento debe filtrarla explícitamente, D4) |
| `mensaje-creado-saliente-bot.json` | `message_created`, `message_type: outgoing` | Enviado con el token del propio Agent Bot; `sender.type: "agent_bot"`; incluye `content_attributes.luxe_clave` (ver "Verificación D13" abajo) |
| `conversacion-estado-open.json` | `conversation_status_changed` | `status: "open"` en la raíz |
| `conversacion-estado-pending.json` | `conversation_status_changed` | `status: "pending"` en la raíz |
| `conversacion-estado-resolved.json` | `conversation_status_changed` | `status: "resolved"` en la raíz |
| `evento-ignorado-conversacion-actualizada.json` | `conversation_updated` | Evento real que el Agent Bot también recibe pero que `traducirEvento` (D4) debe ignorar — no es `message_created` ni `conversation_status_changed` |

No hay un fixture de "firma inválida" ni de "cuerpo demasiado grande": esos casos se construyen en
los tests (T2/T3) modificando la cabecera o el tamaño del body de estos mismos fixtures, no
capturando un evento real distinto.

## Verificación D13 (resultado real, no asumido)

Contra esta misma instancia (Chatwoot v4.17.1 local), usando el token del propio Agent Bot:

1. Se envió un mensaje `outgoing` con `content_attributes: { luxe_clave: "prueba-d13" }` vía
   `POST /api/v1/accounts/1/conversations/1/messages`. La respuesta de creación ya incluía el
   `content_attributes` intacto.
2. Se releyó la conversación con `GET /api/v1/accounts/1/conversations/1/messages` (petición nueva,
   sin reutilizar la respuesta de creación): el mensaje devuelto trae
   `content_attributes: { "luxe_clave": "prueba-d13" }` exactamente igual. **`content_attributes`
   sí sobrevive y vuelve tal cual en el `GET`.**
3. Se repitió el mismo `POST` con el mismo `content_attributes.luxe_clave`: Chatwoot **no** rechazó
   la petición ni la deduplicó — creó un **segundo** mensaje (id distinto) con la misma marca. Es
   decir: **Chatwoot no deduplica por `content_attributes` de forma nativa.** La reconciliación de
   D13 (`existeMensajeConMarca`, T7) depende enteramente de que **nuestro propio** adaptador
   consulte el `GET` antes de decidir hacer el segundo `POST` — no hay ninguna garantía del lado de
   Chatwoot que la reemplace.
4. Este inbox de prueba es un canal `Channel::Api` ("WhatsApp (pruebas)"), no el canal real de
   WhatsApp Cloud: no existe un envío real a WhatsApp que observar desde esta instancia local. El
   punto 3 es la evidencia disponible más cercana (Chatwoot no reconoce duplicados por marca), y es
   consistente con lo que D13 ya anticipaba como plan: la deduplicación es responsabilidad del
   adaptador, no de Chatwoot.

**Conclusión para T7**: T7 construye la reconciliación completa de D13 tal como está diseñada
(`existeMensajeConMarca` antes de reenviar cuando `intento > 1`), porque el paso 2 confirma que la
marca persiste y es consultable. El punto 3 no descarta la reconciliación — al contrario, explica
por qué es necesaria: sin ella, un reintento duplicaría el mensaje de verdad.

## Verificación de `X-Chatwoot-Delivery` en `conversation_status_changed`

Los tres cambios de estado capturados (`open`, `pending`, `resolved`) llegaron con la cabecera
`X-Chatwoot-Delivery` presente (un UUID distinto en cada entrega), igual que todos los demás
eventos del Agent Bot. Confirmado tanto empíricamente (headers capturados) como en el código fuente
de Chatwoot v4.17.1 (`app/listeners/agent_bot_listener.rb`, línea ~88: todo evento de
`AgentBotListener` se dispara con `delivery_id: SecureRandom.uuid`, sin condición). El dedupe de
`conversation_status_changed` en `traducirEvento` (D4) puede usar `X-Chatwoot-Delivery` como primera
opción, tal como el diseño ya asumía.

## Firma

Las cabeceras `X-Chatwoot-Signature`/`X-Chatwoot-Timestamp` capturadas en la instancia real firman
el body **original** (con los datos reales, antes de anonimizar); no se conservan en estos archivos
porque no serían válidas contra el body anonimizado. Los tests firman estos fixtures ya
anonimizados con `firmarComoChatwoot` (`test/soporte/chatwoot.ts`) usando el secreto de prueba, no
reutilizan ninguna firma capturada.
