# 0014. Fallback nivel 1 de la pasarela LLM: iteración en el gateway, no el parámetro server-side de OpenRouter

- Estado: aceptada (2026-09-29)
- Fecha: 2026-09-28

## Contexto

ADR-0002 decidió el "Respaldo nivel 1" de la pasarela LLM como: "OpenRouter, parámetro `models` en
orden de prioridad" — una sola llamada del gateway con la lista completa de modelos, dejando que
OpenRouter pruebe internamente el siguiente proveedor si el primero falla.

Al diseñar la Fase 06 (`openspec/changes/fase-06-pasarela-llm/design.md`, Decision D2), los
escenarios de `specs/llm/spec.md` de esa fase exigen algo que el parámetro `models` no puede dar:

- LLM5 — "Caída del primer modelo deriva al siguiente sin intervención del llamador": exige que
  `uso_llm` registre **tanto el intento fallido como el exitoso**, cada uno con su modelo.
- LLM6 — "Llamada exitosa/fallida registra proveedor, modelo, tokens, costo, latencia y resultado":
  exige una fila por intento, no una fila agregada por la respuesta final.

Con el parámetro `models` del lado de OpenRouter, un intento fallido interno al primer modelo es
invisible para el gateway: no queda fila auditable de ese intento, y el costo/latencia no se puede
atribuir al modelo que realmente respondió (**R13**, techo de gasto por modelo/proveedor).

## Alternativas

1. Mantener el parámetro `models` server-side de OpenRouter tal como lo describe ADR-0002 (una sola
   llamada del gateway, fallback interno resuelto por el proveedor).
2. El gateway recorre la lista de modelos del perfil en orden y hace **una llamada al adaptador por
   modelo, con un solo id de modelo cada vez**; cada intento deja su propia fila en `uso_llm`.

## Decisión

Se adopta la alternativa 2. `LlmGateway` (capa de aplicación) itera los modelos del perfil en orden;
cada llamada al adaptador usa exactamente un id de modelo. El circuito por modelo (ADR-0013) y el
registro de uso/costo (**R13**) operan por intento. El parámetro `models` de OpenRouter no se usa en
el camino primario de esta fase.

Esta decisión **matiza únicamente la fila "Respaldo nivel 1"** de ADR-0002. El resto de esa decisión
sigue vigente sin cambio: las tres capas (`LlmPort` → `LlmGateway` → adaptador), el modelo principal,
el respaldo nivel 2 (proveedor directo, opcional), la configuración por perfil y las prohibiciones.

## Consecuencias

- Observabilidad completa por intento: una fila en `uso_llm` por cada modelo probado, con su propio
  costo, latencia y resultado — condición necesaria para LLM5, LLM6 y el techo de gasto (**R13**).
- El gateway sigue siendo el único dueño de la resiliencia (fallback, circuit breaker); no delega esa
  responsabilidad a OpenRouter, coherente con la capa `LlmGateway` que ya fijó ADR-0002.
- Costo: una llamada HTTP por modelo probado en vez de una sola llamada con lista; el presupuesto
  total por turno (D3 de `design.md`, derivado del TTL del lock) sigue acotando el peor caso.
- Queda prohibido pasar el parámetro `models` de OpenRouter como mecanismo de fallback en el camino
  primario del gateway.

## Fuentes

- `openspec/changes/fase-06-pasarela-llm/design.md`, Decision D2.
- `openspec/changes/fase-06-pasarela-llm/specs/llm/spec.md`, escenarios LLM5 y LLM6.
- [0002](0002-pasarela-llm.md) (matizada por este ADR en su fila "Respaldo nivel 1").
