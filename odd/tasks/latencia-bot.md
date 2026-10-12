# Latencia del bot: menos vueltas al LLM y menos esperas en serie

Rama: `perf/latencia-bot`, desde `main` (trabajo fuera de fase, solo ODD). El dueño autorizó el alcance el
2026-10-12: los puntos 1, 3, 4 y 5 del análisis de latencia. Los puntos que tocan la calidad (esfuerzo de
razonamiento y debounce) quedan fuera.

**Estado: en curso.**

## Objetivo
Bajar el tiempo de respuesta por WhatsApp, hoy de 10 a 16 s, sin cambiar lo que el bot responde.

## Problema
Medido desde el código, sin telemetría de producción:
- **Las llamadas al LLM son el grueso del tiempo** (1.5–4 s cada una, de 2 a 4 por turno). Una pregunta de
  precio cuesta como mínimo 3 llamadas: `buscar_producto` → `obtener_ficha` → texto.
- **Las herramientas de un mismo paso corren en serie** (`servicio/src/modulos/agente/aplicacion/bucle-herramientas.ts:200-225`).
- **El caché de prompt del proveedor queda librado al azar**: no se pasa `prompt_cache_key`
  (`servicio/src/modulos/llm/infraestructura/adaptador-ai-sdk.ts`), y el orden del catálogo no desempata por `id`
  (`servicio/src/modulos/catalogo/dominio/producto.ts:101-106`).
- **Unos 17 viajes a Redis y Postgres, uno tras otro, antes de la primera llamada**
  (`armar-contexto-inicial.ts:51-67`, `ensamblar-prompt.ts:40-43`). El consentimiento se lee de 2 a 4 veces y el
  techo de gasto se consulta 2 veces antes de cada llamada (`llm-gateway.ts:158-183`).
- **No hay indicador de «escribiendo…»**: `indicadorEscribiendo` está declarado, pero nadie lo usa.

## Alcance
- T1: lecturas en paralelo y sin repetir antes del LLM y en la pasarela.
- T2: las herramientas de solo lectura de un mismo paso corren en paralelo.
- T3: si `buscar_producto` encuentra un único producto claro, devuelve su ficha en el mismo resultado.
- T4: `prompt_cache_key` estable y desempate del catálogo por `id`.
- T5: indicador de «escribiendo…» al empezar el turno, si Chatwoot lo reenvía a WhatsApp.

## Restricciones
- R1 y R2: el LLM nunca recibe precios para calcular. La ficha que devuelva `buscar_producto` es la misma que
  la de `obtener_ficha`, y el rastro de dinero (dinero sin rastro) la reconoce igual.
- No cambia el esquema de datos, ni el estilo, ni el modelo, ni el esfuerzo de razonamiento, ni el debounce.
- El techo de gasto sigue sin caché entre turnos (decisión vigente en `llm-gateway.ts:156`).
- Las herramientas que escriben (contacto, consentimiento, lead, derivar, fotos) mantienen su orden y corren en
  serie.
- Si cambia un comportamiento especificado, su spec de `openspec/specs/` se actualiza en el mismo commit.

## Tareas
- [x] T1 — Lecturas en paralelo antes del LLM (`Promise.all`), consentimiento y nombre en una sola lectura, techo
  (SUM y parámetro) en paralelo. Ruta: delegada (varios archivos no triviales).
- [x] T2 — Herramientas de solo lectura en paralelo dentro de un paso, conservando el orden de los resultados.
  Ruta: delegada.
- [x] T3 — `buscar_producto` con coincidencia única devuelve la ficha; spec del agente o del catálogo en el mismo
  commit. Ruta: delegada.
- [x] T4 — `prompt_cache_key` por proveedor y desempate del catálogo por `id`. Ruta: delegada.
- [x] T5 — Indicador de «escribiendo…» vía Chatwoot (solo si Chatwoot lo reenvía a WhatsApp Cloud; si no, se
  documenta el motivo y se omite). Ruta: delegada. **Omitida**: Chatwoot no lo reenvía (ver Progreso).
- [ ] T6 `[manual]` — El dueño prueba desde WhatsApp y compara los tiempos.

## Criterios de aceptación
- Una pregunta de precio sobre un producto inequívoco se resuelve con una llamada menos al LLM.
- Las respuestas y las evals guionadas no cambian (100 %).
- Ninguna herramienta que escribe corre en paralelo con otra.

## Verificación
Por tarea: RED → GREEN en Vitest (`unit`, e `integracion` cuando aplique). Antes del push, la batería completa
de `CLAUDE.md` en `servicio/`: lint, typecheck, fronteras, contrato:deriva, commits, unit, integracion, e2e y
evals.

## Entrega
Pronóstico: unas 400–600 líneas de autoría. Estrategia `auto-chain` con la cadena `stacked-to-main` si se
pasa del presupuesto.

## Progreso
Rama creada desde `main` (3787889).

| Tarea | Ruta | Commit | Qué quedó |
|---|---|---|---|
| T1 | delegada | `c722dc6` | Contexto inicial, prompt e historial en paralelo; el techo pide la suma del mes y el parámetro a la vez; la barrera deja el consentimiento en el estado del turno y lo reutilizan la petición de persona y el contexto. La puerta de las herramientas que escriben sigue leyendo de nuevo. |
| T2 | delegada | `d28ad67` | Las cuatro de consulta son concurrentes; las seguidas de un paso corren con `Promise.all`; las que escriben van de a una; resultados y efectos en el orden de las llamadas (AGT4). |
| T3 | delegada | `6cf5ac4` | Coincidencia clara = la búsqueda devuelve un único producto: ese resultado trae en `ficha` lo mismo que `obtener_ficha` (AGT8). El rastro de dinero ya serializa todo resultado de herramienta, así que la reconoce sin cambios. |
| T4 | delegada | `2125b78` | `claveCache` = `luxe-agente-<prompt>-e<estilo>` en cada llamada; OpenAI la recibe como `promptCacheKey` y OpenRouter como `prompt_cache_key` en el cuerpo; catálogo desempatado por id (AGT13, CAT4). |
| T5 | delegada | — | Omitida, ver abajo. |

**T5, por qué se omite.** En el código de Chatwoot (`develop`, 2026-10-12), `toggle_typing_status` solo despacha
`CONVERSATION_TYPING_ON/OFF` (`app/services/conversations/typing_status_manager.rb`), y los únicos que escuchan esos eventos
son `ActionCableListener` (el panel y el widget) y `WebhookListener`. Ningún servicio del canal WhatsApp los atiende, así que
el cliente de WhatsApp nunca vería los puntos. Mostrarlos exigiría llamar a la API de Meta directamente, fuera de Chatwoot
(ADR-0005).

**Riesgos a mirar en T6.** Con un solo resultado de búsqueda, el modelo ya tiene el precio antes de que el cliente lo pida
(puede mencionarlo antes). OpenRouter usa `prompt_cache_key` como llave de enrutamiento fijo, no como orden de caché: el
ahorro se ve en `uso_llm.tokens_cache`.

**Revisión nativa.** Corrió sobre el rango `3787889..aa5220d`. Riesgo medio; consentimiento otorgado.
Resultado: aprobada con una lente (confiabilidad), y la autoridad quedó consumida (`review-8aec9180fa1d70dd`).
Dejó tres observaciones no bloqueantes para trabajo posterior:
- el armado del contexto en `contenido-llm.ts:111-123` no tiene test;
- la instantánea del consentimiento en `politica-consentimiento.ts:70-71`;
- la promesa del techo en `llm-gateway.ts:164-165`, que no rechaza nunca por diseño.

## Siguiente paso
T6 por parte del dueño: probar desde WhatsApp y comparar los tiempos y `tokens_cache` en `uso_llm`.
