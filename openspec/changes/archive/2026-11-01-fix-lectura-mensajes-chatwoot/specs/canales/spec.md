# Delta for canales

## Purpose

Chatwoot responde 401 a un token de Agent Bot al listar mensajes, así que el texto entrante debe
leerse con un token de usuario agente; las salidas del bot siguen con el token del bot para no
salir como un humano (R6).

## MODIFIED Requirements

### Requirement: CAN6 — Puerto de canal de salida con tipos propios; el adaptador Chatwoot traduce a su API

El sistema MUST exponer un puerto de canal de salida cuyas operaciones se expresan en tipos propios del
dominio (enviar mensajes de texto o de imagen a una conversación, cambiar su estado, etiquetarla), sin
que quien lo invoca conozca el formato de la API de Chatwoot. Un mensaje de imagen MUST expresarse con
la clave del objeto en el almacenamiento (MED1) y una leyenda opcional, nunca con bytes ni URLs. El
adaptador Chatwoot MUST traducir cada operación a la llamada HTTP correspondiente con el header
`api_access_token` del Agent Bot: `POST .../conversations/{id}/messages` (JSON para texto;
`multipart/form-data` con el adjunto en `attachments[]` para imagen), `POST .../toggle_status` y
`POST .../labels`. La lectura de los mensajes de una conversación (`GET .../messages`: el texto
entrante y la reconciliación por marca) MUST hacerse con el token de un usuario agente
(`CHATWOOT_API_TOKEN_LECTURA`), porque Chatwoot responde 401 a un token de Agent Bot en ese endpoint;
ese token MUST NOT usarse para ninguna operación de escritura. Si no está configurado, la lectura
MUST caer al token del bot y el sistema MUST emitir un aviso de arranque, sin ningún valor de token.

(Previously: toda llamada, incluida la lectura de mensajes, usaba el token del Agent Bot.)

Fase que lo implementa: 04 (texto, estado, etiquetas); 07b (imagen); `fix-lectura-mensajes-chatwoot`
(token de lectura)

#### Scenario: Lectura con token de usuario

- Dado un Chatwoot que responde 401 a `GET .../messages` con el token del bot y 200 con el de un
  usuario agente, y `CHATWOOT_API_TOKEN_LECTURA` configurado,
- Cuando se lee el texto de un mensaje entrante,
- Entonces la llamada lleva el token de usuario y devuelve el texto del mensaje.

#### Scenario: Las salidas del bot no usan el token de usuario

- Dado `CHATWOOT_API_TOKEN_LECTURA` configurado,
- Cuando el adaptador envía un mensaje, cambia el estado o etiqueta una conversación,
- Entonces cada llamada lleva el token del Agent Bot.

#### Scenario: Sin token de lectura se avisa y se cae al token del bot

- Dado `CHATWOOT_API_TOKEN_LECTURA` ausente o vacío,
- Cuando arranca el cliente de Chatwoot,
- Entonces emite un único aviso que nombra la variable y la lectura usa el token del bot, sin que el
  aviso ni ningún error contengan el valor de un token.
