---
name: whatsapp-meta-conventions
description: Conocimiento específico de la API de Meta Cloud (WhatsApp Business) necesario al escribir código de webhook, envío de mensajes, coexistencia, plantillas o manejo de media. Úsalo siempre que el archivo tocado esté bajo src/whatsapp/, src/webhook/, src/workers/, src/media/, cuando se registre o edite una plantilla de Meta, o cuando se toque la máquina de estados bot/humano.
---

# Convenciones de Meta Cloud API (WhatsApp Business)

> **Nota (v2.1, 2026-09-16)**: este servicio ya no habla con Meta directo. Chatwoot es dueño del
> webhook y del envío (ver `docs/CHATWOOT.md`); lo de abajo sigue siendo válido para entender qué
> hace Chatwoot por debajo (firma, media, ventana de 24 h, plantillas, costos), pero la sección de
> coexistencia quedó descartada: el número es nuevo y dedicado a Cloud API.

## Coexistencia (un solo número compartido entre app y API)

Este proyecto usa **Coexistence**: el mismo número lo usan la WhatsApp Business App (atención
manual) y la Cloud API (el bot).

- Los mensajes enviados desde la app llegan al webhook del número como evento
  **`smb_message_echoes`**. Ese evento es el disparador para pausar el bot (SPEC.md §4.2).
- Los mensajes enviados por la API aparecen automáticamente en la app, sin acción extra.
- Los mensajes enviados desde la app son gratis, pero **no abren ni extienden la ventana de 24 h**
  de la Cloud API. Si un humano responde desde la app y después el bot necesita escribir fuera de
  esa ventana, hará falta plantilla.
- La app debe abrirse al menos una vez cada 13 días o la cuenta se desactiva.
- Dispositivos companion no soportados (Windows, WearOS, y en algunos casos Web) **no generan eco**:
  el bot no se entera de que un humano respondió. Regla operativa: responder desde el celular
  principal.
- La insignia azul (OBA) no está soportada en coexistencia; la alternativa es Meta Verified.
- No desinstalar la app de WhatsApp Business: desconecta la cuenta.
- Los echoes son visibilidad best-effort, no un archivo completo de la conversación. No usarlos como
  única fuente de verdad del historial.

## Timeout y ACK del webhook

Meta espera un 200 en pocos segundos; si no llega, considera el evento fallido y lo reintenta,
generando duplicados. El handler HTTP solo debe: (a) validar firma, (b) deduplicar por `wamid`,
(c) encolar, (d) responder 200. Cualquier lógica de negocio va al worker de la cola.

## Deduplicación

Cada mensaje trae un `id` (wamid) único. Guardar los wamids procesados en Redis con TTL de 7 días;
si el wamid ya existe, descartar el evento silenciosamente (log a nivel debug, no error).

Ojo: la dedupe por wamid protege contra reenvíos de Meta, **no** contra reintentos de la cola. Para
eso está la clave de idempotencia de envío (SPEC.md §3.4).

## Validación de firma

Todo request al webhook valida `X-Hub-Signature-256` con HMAC-SHA256 usando el App Secret sobre el
**body crudo** (antes de cualquier parseo JSON — el middleware de body-parsing debe conservar el
buffer original). Rechazar con 401 si no coincide, sin loguear el payload rechazado.

## Entrada por enlace wa.me vs. referral

- El objeto `referral` (con `source_type`, `source_id`, `ctwa_clid`) solo llega en conversaciones
  iniciadas desde **anuncios Click-to-WhatsApp o botones CTA de Página**.
- La **ventana gratuita de entrada de 72 h** aplica únicamente a esos mismos orígenes.
- Un enlace `wa.me/<numero>?text=...` desde una publicación de Marketplace **no** genera referral ni
  ventana de 72 h: es una conversación de servicio normal con ventana de 24 h. El único contexto
  disponible es el texto prellenado, y el usuario puede borrarlo.

## Precios (estado a septiembre de 2026)

- Desde el 1-jul-2025 el cobro es **por mensaje**, no por conversación.
- Desde el **1-oct-2026** se cobran también los **mensajes de servicio** (respuestas libres dentro de
  la ventana de 24 h) y las plantillas Utility enviadas dentro de la ventana. Hay **1.000 mensajes de
  servicio gratis al mes por número**, sin acumulación.
- Los mensajes de servicio se tarifan como las plantillas utility/auth del país del destinatario.
  Colombia está entre los mercados más baratos.
- Consecuencia de diseño: **cada mensaje saliente cuesta, y una foto es un mensaje**. Agrupar.
- Los negocios sin método de pago cargado antes del 30-sep-2026 dejan de tener entrega de mensajes de
  servicio desde el 1 de octubre.
- Meta actualiza tarifas por trimestre. Verificar la tabla vigente antes de estimar costos.

## Plantillas de notificación (HSM)

- Registrar la plantilla de "lead caliente" bajo categoría **Utility**, no Marketing: es una
  notificación transaccional de servicio. Categoría incorrecta implica revisión más estricta y mayor
  costo por envío.
- Las plantillas Utility/Auth se pueden enviar sin restricción de ventana de 24 h; las de Marketing
  tienen reglas adicionales de opt-in.
- Cambios de texto en una plantilla ya aprobada requieren nueva aprobación (1-2 días). No editar
  plantillas en producción sin plan de contingencia con el texto anterior.

## Expiración de media IDs

Los media IDs expiran a los ~30 días. No asumir que un media ID guardado sigue siendo válido: siempre
verificar `fecha_ultima_resubida` antes de usarlo y, si tiene más de 25 días, resubir el archivo
original (guardado localmente, nunca solo el media ID) y actualizar el registro.

## Listas interactivas — límites de caracteres

- Máximo 10 filas (`rows`) por lista.
- Título de fila: máximo 24 caracteres.
- Descripción de fila: máximo 72 caracteres.
- Título de sección: máximo 24 caracteres.

Cualquier función que construya un payload de lista debe validar estos límites y truncar o fallar
explícitamente. Nunca enviar un payload que Meta vaya a rechazar silenciosamente.

## Token permanente vs temporal

Usar siempre un token de larga duración generado vía System User en Meta Business Manager. El token
temporal de la app expira en 24 h y no sirve para producción.
