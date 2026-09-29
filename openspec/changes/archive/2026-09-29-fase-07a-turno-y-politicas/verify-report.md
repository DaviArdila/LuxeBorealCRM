# Verify report: Fase 07a — Contrato del turno y políticas deterministas

- Fecha: 2026-09-29 · Rama base de cierre: `main` tras el PR #21
- Change: `openspec/changes/archive/2026-09-29-fase-07a-turno-y-politicas/`
- PRs: #16 (T1), #18 (T2 + T3), #20 (T4 + T5), #21 (T6 + T7). Planeación: #15.

## Alcance verificado

Siete tareas, las siete `[x]` en `tasks.md`. Sin LLM: el agente responde con políticas
deterministas (R12, R13, R14) y un eco provisional del último texto. La 07a deja estable el contrato
entre `conversaciones` y `agente`, sobre el que construye la 07b.

## Checks ejecutados (comandos reales)

| Comando | Resultado |
|---|---|
| `npm run verify` (lint, typecheck, fronteras, deriva del contrato, unitarios e integración) | Verde: 145 archivos, 875 tests |
| `npm run test:e2e` | Verde: 3 archivos, 15 tests (6 nuevos del agente) |
| CI de GitHub (`npm run ci`) en cada PR | Verde en los cuatro PRs |

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| CNV6, CNV7, CNV8 | 5 + 4 | Unitarios e integración de `conversaciones` |
| CAN9, CNV9 | 4 | Publicador real + Postgres real |
| AGT1, AGT3 | 2 + 3 | Unitarios e integración del agente |
| R12 | 6 de 7 | Unitarios y e2e por webhook (la ubicación es de la 07b) |
| R13, AGT2 | 2 + 3 | Unitarios y e2e |

## Desviaciones de `design.md` (detalle en el propio `design.md`)

- `idOperacion` del espejo es `espejo-v<n>` (con `:` el outbox lanza).
- `ProcesarTurno` no cancela el job diferido (ciclo de DI); relee antes de transicionar.
- `conGenerador` devuelve una clase de módulo propia (Nest fusiona los `providers` del decorador).
- `admiteImagen` es una aproximación por `adjuntosEntrantes`.

## Pendientes abiertos

- P27 (ubicación entrante), sin respuesta: la 07b aplica la recomendación documentada, provisional.
- Optimización posible: no encolar `abierta` en cada transición `humano → humano`.

## Qué aprendimos que cambia las fases siguientes

1. **Los dobles ocultan defectos de cableado.** El e2e con Chatwoot falso por HTTP destapó tres
   bugs de la Fase 05 que ningún doble veía: se enviaba el UUID interno en vez del id de Chatwoot; el
   `idRespuesta` era el id del job (igual en todos los turnos) y el outbox deduplica por él, así que
   **solo salía la primera respuesta de cada conversación**; y el mensaje de handoff lo bloqueaba su
   propia guardia. Consecuencia para la 07b y la 07c: cada capacidad nueva de salida (imagen, historial,
   herramientas) lleva un e2e por webhook, no solo pruebas con dobles.
2. **El outbox valida formato.** `idOperacion`, `idRespuesta` y los ids de job deben cumplir
   `[A-Za-z0-9_-]{1,64}`; un id con `:` o largo pasa con dobles y lanza con el outbox real. La 07b, que
   agrega pasos de imagen al outbox, debe probar sus claves contra el outbox real.
3. **`requiereEstado` admite varios estados** separados por `|`; un mensaje cuya propia acción cambia el
   estado (handoff) debe declararlos todos.
4. **Los tests que comparten un recurso global se pisan.** La clave `bot:activo` se aisló por worker;
   cualquier clave global nueva de Redis o `parametro` en tests debe tener su variante por worker.
5. **Tamaño real frente a lo planeado:** la 07a pasó de ~2.000 a ~3.300 líneas por la configuración de
   prueba repetida en unos 34 archivos y los tres arreglos de la Fase 05. Para la 07b conviene una
   configuración de prueba compartida que evite tocar decenas de archivos por cada variable nueva.
