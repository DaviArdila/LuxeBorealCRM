# Design: Leer los mensajes entrantes con un token de usuario

- Change: `fix-lectura-mensajes-chatwoot` · Fecha: 2026-09-30

## D1 — Una credencial por llamada, no una segunda instancia del cliente

`ClienteChatwoot.get(id, sufijo, credencial = 'bot')` con `credencial: 'bot' | 'lectura'`. Una sola
clase y un solo token de DI; cada operación declara qué token necesita. Escribir (`post`,
`postMultipart`) no admite credencial: siempre firma con el bot, así no se puede enviar por error como
un humano (R6). Se descartó una segunda instancia del cliente porque obligaba a un token de DI más y
duplicaba URL, timeout y traducción de fallos.

## D2 — Qué lee con `lectura`

Solo `GET .../messages`: el lector del texto entrante y `existeMensajeConMarca` (reconciliación de
D13, mismo endpoint y mismo 401 para un bot). `GET .../labels` sigue con el bot: no hay evidencia de
que lo rechace y las etiquetas son parte de la escritura del bot.

## D3 — Sin token de lectura

`CHATWOOT_API_TOKEN_LECTURA` es opcional (`z.string().optional()`, como `MINIO_URL_PUBLICA`, para no
obligar a cada configuración literal de los tests a declararla). Ausente o vacío, la lectura usa
`CHATWOOT_BOT_TOKEN` (comportamiento anterior) y el constructor del cliente emite un `warn` de Nest
`Logger`, una vez, que nombra la variable y el 401 pero jamás un valor. No se emite con
`NODE_ENV=test`, para no ensuciar la salida de los tests. Los fallos siguen sin incluir cuerpo ni
token (`FalloCanal` solo lleva método, ruta y status).

## D4 — Obligatoriedad en production

No se exige: aún no hay producción. Queda como pregunta al usuario, **P41**, con recomendación «sí»
(un `superRefine` igual al de `CHATWOOT_BOT_TOKEN`).

## D5 — Chatwoot falso realista

`ChatwootFalso.exigirTokensReales({ bot, lectura })` activa la autorización real: `GET .../messages`
solo con el token de lectura y cualquier otra operación solo con el del bot; lo demás ⇒ 401. Es
opt-in, así que los tests existentes no cambian.
