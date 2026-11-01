# Proposal: Leer los mensajes entrantes con un token de usuario

- Change: `fix-lectura-mensajes-chatwoot` (mantenimiento, no es una fase) · Fecha: 2026-09-30 ·
  Estado: **implementado**, pendiente de archivar
- Depende de: Fases 04 (canal) y 05 (conversaciones). Toca `modulos/canales` y `plataforma/config`.

## Intent

Con un Chatwoot v4.17.1 real, el agente no responde nada. R14/CAN5 obliga a que el webhook no traiga
el texto, así que `LectorMensajeCanalChatwoot` lo relee con `GET .../conversations/{id}/messages`
usando `CHATWOOT_BOT_TOKEN`. Chatwoot responde **401** a un token de Agent Bot en ese endpoint (un
bot solo puede crear mensajes, cambiar el estado y etiquetar). El lector traga el error (su contrato
es «nunca lanza») y devuelve `null`: el texto llega vacío y el turno no produce respuesta. Un token de
usuario agente sí lista los mensajes (200).

Los tests de las fases 04 y 05 no lo vieron: su Chatwoot falso respondía 200 a cualquier token.

## Decisión del usuario (no se reabre)

Variable nueva **`CHATWOOT_API_TOKEN_LECTURA`** (token de acceso de un usuario agente), usada **solo**
para leer mensajes. El bot sigue escribiendo (mensajes, estado, etiquetas) con `CHATWOOT_BOT_TOKEN`:
si las salidas salieran con el token del usuario, los mensajes aparecerían como de un humano y
dispararían el eco humano (handoff), rompiendo R6.

## Scope

1. `ClienteChatwoot.get` acepta una credencial (`bot` por defecto, `lectura`); el lector y la
   reconciliación por marca (`existeMensajeConMarca`, mismo endpoint) piden `lectura`.
2. Sin token de lectura, la lectura cae a `CHATWOOT_BOT_TOKEN` y se emite un `warn` de arranque, una
   sola vez y sin valores.
3. El Chatwoot falso de los tests reproduce la autorización real (`exigirTokensReales`).
4. `.env.example` y delta de CAN6.

Fuera de alcance: guardar texto de clientes (R14 no cambia), cambiar cómo sale algún mensaje.

## Evidencia

- `GET .../messages` con el token del Agent Bot ⇒ 401; con el token de un usuario agente ⇒ 200
  (verificado contra Chatwoot v4.17.1 real, 2026-09-30).
- RED del test de integración nuevo antes del arreglo: `obtenerTexto` devolvía `null` con el servidor
  falso autorizando como el real.

## Preguntas abiertas

- **P41** (`docs/PREGUNTAS_ABIERTAS.md`): ¿hacer obligatorio `CHATWOOT_API_TOKEN_LECTURA` en
  production? Recomendación: sí. Hoy es opcional porque aún no hay producción.

## Rollback

Revertir el commit; sin migración ni datos. Sin la variable, el comportamiento es el anterior.
