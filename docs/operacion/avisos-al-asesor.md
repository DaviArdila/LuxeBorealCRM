# Avisos al asesor por Telegram

**Resumen.** Cada vez que una conversación pasa a una persona, o un cliente espera una respuesta que nadie da, el bot
manda un aviso al grupo de Telegram con el motivo y **un enlace que abre esa conversación en Chatwoot**. Tocas el enlace,
se abre Chatwoot en el navegador del celular y escribes al cliente. El aviso nunca lleva teléfono, cédula, correo,
dirección ni el nombre del cliente. Decisión de fondo: [`fase-08d`](../../openspec/changes/archive/2026-10-01-fase-08d-avisos-con-enlace/proposal.md).

> Los comandos `npm run …` de esta guía se corren dentro de `servicio/` (o desde la raíz con
> `npm --prefix servicio run …`), y el `.env` es `servicio/.env` ([ADR-0023](../adr/0023-estructura-servicio-y-cliente.md)).

## Ruta rápida para que el enlace abra en el celular

1. Pon en tu `.env` la dirección por la que **tu celular** llega a Chatwoot:
   `CHATWOOT_URL_PUBLICA=https://chat.tudominio.co`. Si falta, el enlace usa `CHATWOOT_URL`, que en local es
   `http://localhost:3001` y el celular **no** abre.
2. Reinicia la aplicación.
3. Provoca un aviso (por ejemplo, escribe «quiero hablar con un asesor» desde un cliente de prueba) y toca el enlace en
   Telegram. Debe abrir la conversación en Chatwoot, con tu sesión iniciada.

## Qué avisos hay

| Aviso | Cuándo sale | Título que verás |
|---|---|---|
| Lead caliente | Una señal fuerte de compra, o dos débiles | `Lead caliente: un cliente necesita un asesor.` |
| Pidió una persona | El cliente pide hablar con alguien | `Lead caliente: un cliente necesita un asesor.` |
| Lead capturado fuera de horario | El cliente dejó sus datos fuera de horario | Añade `Dejó sus datos fuera de horario…` |
| Lead sin atender | Un lead derivado sigue en `nuevo` pasados 30 min | `Lead caliente sin atender: nadie lo ha recogido todavía.` |
| Traspaso por tope de turnos | La sesión llegó al tope de turnos (12 por defecto) | `Traspaso: el bot llegó al tope de turnos con un cliente.` |
| Traspaso por falla del LLM | El modelo falló | `Traspaso: el bot no pudo responder por una falla técnica.` |
| Traspaso por techo de gasto | Se agotó el techo mensual del LLM | `Traspaso: el bot dejó de responder por el techo de gasto.` |
| Traspaso por audios | El cliente insiste con audios | `Traspaso: el cliente insiste con audios y el bot no los procesa.` |
| Traspaso por consulta o plazo | Argumentos inválidos o plazo agotado | `Traspaso: el bot no pudo completar una consulta.` / `…se quedó sin tiempo para responder.` |
| Cliente esperando | Escribió con la conversación en manos humanas y nadie respondió en 10 min | `Cliente esperando: escribió hace 11 min y nadie ha respondido.` |

### Avisos sin traspaso (Fase 12d)

Un aviso ya no implica que el bot se calle. En estos avisos la conversación **sigue en `bot`**, el bot responde al cliente
y tú entras cuando quieras desde el enlace; en cuanto escribes en Chatwoot, la conversación pasa a `humano`.

| Aviso | Título que verás |
|---|---|
| Pidió una persona | `Aviso: el cliente pidió hablar con una persona.` |
| El bot pidió un asesor | `Aviso: el bot pidió que un asesor intervenga en esta conversación.` |
| Audios repetidos | `Aviso: el cliente insiste con audios y el bot no los procesa.` |

Los tres llevan debajo `El bot sigue atendiendo la conversación.` y la línea `Atender:`. El aviso de lead caliente sigue
su propio camino (ventana de 24 h por contacto) y, sin traspaso, solo etiqueta la conversación con `lead-caliente`.

Un aviso de lead trae además el **producto de interés** (por su nombre, nunca el SKU), las **señales** y un **resumen**.

## Un aviso de ejemplo

```
Traspaso: el bot llegó al tope de turnos con un cliente.
Un asesor debe continuar la conversación.
Atender: https://chat.tudominio.co/app/accounts/1/conversations/2
```

## Cuántas veces avisa

| Aviso | Límite |
|---|---|
| De lead | Uno por contacto cada 24 h (`LEADS_VENTANA_NOTIFICACION_H`) y un solo recordatorio a los 30 min |
| De traspaso | Uno por traspaso y motivo; otro motivo, o un traspaso posterior, avisa de nuevo |
| Sin traspaso | Uno por conversación y motivo mientras el bot atiende; «pidió una persona» y «el bot pidió un asesor» cuentan como el mismo motivo. Al escribir un asesor, o al volver la conversación al bot, el motivo vuelve a avisar |
| De cliente esperando | Uno por espera; se cancela si un asesor responde o la conversación vuelve al bot |

## Variables

| Variable | Defecto | Para qué |
|---|---|---|
| `CHATWOOT_URL_PUBLICA` | vacía | Base del enlace (la URL que abre tu celular). Cae en `CHATWOOT_URL` |
| `ESPERA_CLIENTE_MIN` | 10 | Minutos sin respuesta antes del aviso de cliente esperando |
| `ESPERA_CLIENTE_BARRIDO_MS` | 60000 | Cada cuánto se revisan los clientes que esperan |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | vacías | El bot y el grupo de Telegram; sin ellos los avisos no se entregan |

Para apagar solo el aviso de cliente esperando, sube `ESPERA_CLIENTE_MIN` a un valor muy alto.

## Si algo no funciona

| Síntoma | Qué mirar |
|---|---|
| El aviso llega sin la línea `Atender:` | La conversación no tiene identificador de Chatwoot: busca el `warn` `notificaciones.enlace-sin-identificador` |
| El enlace no abre en el celular | `CHATWOOT_URL_PUBLICA` vacía o apuntando a `localhost`; el celular necesita una dirección accesible (dominio o túnel) |
| El enlace abre otra conversación | Pendiente de confirmar con tu Chatwoot si usa el `id` o el `display_id` (P50); en una instalación nueva coinciden |
| No llega ningún aviso | `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, y que el bot esté en el grupo; mira la tabla `outbox` por filas `notificacion.telegram` con `error` |
| Llega un aviso por cada conversación al agotarse el techo de gasto | Es lo esperado: un aviso por conversación; si molesta, se agrupa en una fase posterior |

## Límites que conviene saber

- **Las marcas de «asesor avisado» viven en Redis** (una por conversación y motivo, con vencimiento de respaldo de 24 h). Si
  Redis falla o se reinicia, puede salir un aviso repetido; nunca uno perdido.
- **La marca de «cliente esperando» vive en Redis.** Si Redis se reinicia, las esperas abiertas se pierden. Es un aviso de
  apoyo: el traspaso ya avisó.
- **El aviso no interpreta el mensaje.** Un «gracias» del cliente también abre una espera; por eso es uno solo y con un
  tiempo configurable.
- **Los textos de los avisos son constantes del código**, no filas de `parametro`: son para el equipo, no para el cliente.
- **El bot no escribe primero al cliente.** Esa idea se descartó (ventana de 24 h de WhatsApp y plantillas de Meta).
