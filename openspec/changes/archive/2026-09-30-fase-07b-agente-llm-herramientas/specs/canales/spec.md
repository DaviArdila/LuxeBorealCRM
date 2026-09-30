# Delta for Canales

## MODIFIED Requirements

### Requirement: CAN6 — Puerto de canal de salida con tipos propios; el adaptador Chatwoot traduce a su API

El sistema MUST exponer un puerto de canal de salida cuyas operaciones se expresan en tipos propios del
dominio (enviar mensajes de texto o de imagen a una conversación, cambiar su estado, etiquetarla), sin
que quien lo invoca conozca el formato de la API de Chatwoot. Un mensaje de imagen MUST expresarse con
la clave del objeto en el almacenamiento (MED1) y una leyenda opcional, nunca con bytes ni URLs. El
adaptador Chatwoot MUST traducir cada operación a la llamada HTTP correspondiente con el header
`api_access_token`: `POST .../conversations/{id}/messages` (JSON para texto; `multipart/form-data` con
el adjunto en `attachments[]` para imagen), `POST .../toggle_status` y `POST .../labels`.

(Previously: el puerto solo admitía mensajes de texto.)

Fase que lo implementa: 04 (texto, estado, etiquetas); 07b (imagen)

#### Scenario: Enviar un mensaje a través del puerto se traduce a la llamada de mensajes de Chatwoot

- Dado un mensaje dirigido a una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../conversations/{id}/messages` con el header `api_access_token`.

#### Scenario: Cambiar el estado de una conversación se traduce a la llamada de toggle_status

- Dado un cambio de estado de una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../toggle_status` con el header `api_access_token`.

#### Scenario: Etiquetar una conversación se traduce a la llamada de labels

- Dada una etiqueta dirigida a una conversación mediante el puerto de canal de salida,
- Cuando el adaptador Chatwoot lo procesa,
- Entonces se realiza un `POST` a `.../labels` con el header `api_access_token`.

#### Scenario: Enviar una imagen sube el adjunto multipart con su leyenda

- Dado un mensaje de imagen con una clave de objeto guardada y una leyenda,
- Cuando el publicador lo procesa,
- Entonces se leen los bytes del almacenamiento y se realiza un `POST` multipart a
  `.../conversations/{id}/messages` con el archivo en `attachments[]` y la leyenda como contenido.

## ADDED Requirements

### Requirement: CAN10 — Una imagen reintentada no se duplica

Cada mensaje de imagen MUST llevar su clave de idempotencia por paso (B5) hasta Chatwoot, y el
publicador MUST reconciliar antes de reintentar una imagen cuyo intento anterior no terminó con
certeza, igual que con el texto (D13 de la Fase 04). Si Chatwoot no conserva la marca en un mensaje
multipart, la marca MUST viajar en el nombre del archivo adjunto y la reconciliación MUST buscarla
ahí.

Fase que lo implementa: 07b

#### Scenario: Un reintento de una imagen ya creada no la envía otra vez

- Dado un mensaje de imagen cuyo primer intento creó el mensaje en Chatwoot pero no se marcó como
  enviado,
- Cuando el publicador lo reintenta,
- Entonces encuentra la marca en Chatwoot y marca la fila como enviada sin un segundo `POST`.
