# Tasks: Fase 07c — Evals del agente, set dorado y corrida real

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio: la
Fase 07 no está en la lista 04/05/06/10 (`docs/fases/README.md` regla 6, `CLAUDE.md` §Flujo de
trabajo).

TDD estricto (`openspec/config.yaml` `strict_tdd: true`): por tarea, RED observado → GREEN →
REFACTOR. Runner **Vitest**: `npm test` (proyecto `unit`: aserciones, umbral, anonimizador) y
`npm run evals` (proyecto `evals`, nuevo en T1: casos contra el agente con Testcontainers).
`npm run verify` al cerrar cada slice de PR. Las aserciones de R1/R2 (dinero, recargo) y el
anonimizador (R14) llevan transcripción completa del RED. Nunca se llama a OpenRouter real salvo en
las tareas `[manual]` marcadas, con la clave del usuario.

Rama: `fase-07c-evals` (desde `main` con 07b fusionada). Un commit de unidad de trabajo por tarea,
Conventional Commits, sin atribución de IA.

**Resultado: 5 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Arnés de evals: proyecto `evals`, `npm run evals`, LLM guionado, grabador y semilla
- [x] T2 — Aserciones deterministas con sus negativos + umbral por modo
- [ ] T3 — Casos sintéticos: 3 casos de entrada, R1, R2, R12, R13, políticas y handoff
- [ ] T4 — Modo real con costo visible + anonimizador del set dorado `[manual]` parcial
- [ ] T5 — Modelos de respaldo `[manual]` + cierre de 07c y de la Fase 07

## Mapeo de escenarios por tarea (11 EVL + 9 de cobertura)

| Tarea | Escenarios (título exacto) | # |
|---|---|---|
| T1 | EVL1 «El modo guionado no llama a ningún proveedor», «Dos corridas guionadas dan el mismo resultado» | 2 |
| T2 | EVL2 «Un monto sin rastro en herramientas hace fallar la aserción», «Un porcentaje de recargo hace fallar la aserción», «Un handoff no esperado hace fallar la aserción»; EVL3 «Una aserción crítica fallida en modo real reprueba la corrida», «El resto de aserciones tolera hasta un 10 % de fallos en modo real» | 5 |
| T3 | Cobertura por evals (mismo título que en `openspec/specs/agente/spec.md` y `conversaciones`): R1 «Todo dato citado se rastrea a una llamada de herramienta», «El cliente pregunta por una política del negocio», «Una política que no existe no se inventa»; R2 «El cliente pregunta el precio de un producto», «Cotización de envío con cobertura», «El recargo contra entrega se dice sin porcentaje», «Destino sin cobertura»; R12 «Ubicación entrante»; R13 «Fotos agrupadas en collage por defecto» | 9 |
| T4 | EVL4 «El modo real sin clave se niega sin llamar», «La corrida real imprime su costo» (este último, `[manual]`); EVL5 «Teléfonos, correos y cédulas se reemplazan por marcadores estables», «Un dato personal que sobrevive hace fallar el anonimizador» | 4 |
| T5 | Sin escenarios nuevos: la corrida real con los modelos elegidos alcanza el umbral de EVL3 | 0 |

Los casos que no son escenarios de una spec (los 3 casos de entrada, "la política no se cita cuando
no corresponde", "sin traspaso sin señal fuerte") llevan un título descriptivo propio con prefijo
`EVL1 — caso:`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1.300 de autoría (estimación de planeación; cada tarea anota su diff real) |
| 400-line budget risk | Medium: T3 puede superarlo por los JSON de casos (datos, no lógica; fila de Risks de `proposal.md`) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

| PR | Tareas | Estimado | Excepción anticipada | Comando enfocado | Rollback |
|---|---|---|---|---|---|
| PR1 | T1 | ~330 | No — preguntar si excede | `npm test -- test/evals` + `npm run evals` | Quitar el proyecto `evals`, el script y `test/evals/` |
| PR2 | T2 | ~300 | No — preguntar si excede | `npm test -- test/evals/soporte` + `npm run evals` | Revertir aserciones y umbral |
| PR3 | T3 | ~400 | Sí (fila de Risks: casos JSON) | `npm run evals` | Revertir los casos |
| PR4 | T4+T5 | ~270 + docs | No — preguntar si excede | `npm test -- scripts/evals` + `npm run evals` + `npm run verify` | Revertir anonimizador, modo real y el default de modelos |

Cada PR usa como base `main` tras fusionar el anterior (skill `chained-pr`). Ninguna tarea recorta
tests ni comentarios para entrar en el presupuesto.

---

## T1 — Arnés de evals: proyecto `evals`, `npm run evals`, LLM guionado, grabador y semilla

**Objetivo**: D1, D2, D3, D5, D7 (resumen) de `design.md`. Un caso guionado mínimo ("hola" → texto)
corre de punta a punta contra el agente de 07b sobre Postgres y Redis de prueba, y `npm run ci` lo
ejecuta.

**Archivos**: `vitest.config.ts` (proyecto `evals`; `unit` incluye `test/evals/**/*.spec.ts`),
`package.json` (`evals`; `ci` agrega `npm run evals`), `test/evals/soporte/{modo-evals,esquema-caso,
guion,grabador-llm,sembrar,componer-agente,resumen}.ts` (+specs), `test/evals/agente.evals.ts`,
`test/evals/casos/sinteticos/saludo.json`.

**RED → GREEN → REFACTOR**:
1. RED: «EVL1 — El modo guionado no llama a ningún proveedor» en `agente.evals.ts`, con
   `OPENROUTER_BASE_URL` apuntando a un `SimuladorOpenRouter` (`test/soporte/simulador-openrouter.ts`);
   `npm run evals` falla porque el proyecto no existe.
2. GREEN: proyecto, composición con `LLM_PORT` sobrescrito por `GrabadorLlm(FakePuertoLlm)`, semilla,
   esquema y el caso de saludo.
3. REFACTOR: «EVL1 — Dos corridas guionadas dan el mismo resultado» (el resumen de dos corridas en el
   mismo proceso es idéntico; sin tiempos, ordenado por `id`).

**Hecho cuando**: 2 escenarios en verde; `npm run ci` incluye `npm run evals` y sigue en verde; un
caso JSON inválido falla con un mensaje que nombra el archivo y el campo.

**Estado (cerrada)**: EVL1 (2) en verde en `agente.evals.ts` (3 tests con el caso `saludo`), más los
unitarios de `modo-evals`, `esquema-caso`, `guion` y `resumen` (15 tests). `npm run ci` corre
`npm run evals` después de `test:e2e`. Desviaciones: (1) `aserciones.ts` nace solo con `handoff`; el
resto llega en T2 con sus negativos. (2) El caso `saludo` ya declara `menciona`, que T2 empieza a
evaluar. (3) `GrabadorLlm` arma la grabación desde las respuestas del puerto y desde el último mensaje
de cada solicitud (las anteriores arrastran el historial del turno). (4) La semilla usa SKU fijos
(`SKU-EVAL-*`) y `sembrarBase` es idempotente.

**Review requerida**: RDD

## T2 — Aserciones deterministas con sus negativos + umbral por modo

**Objetivo**: D4, D7. Las ocho aserciones como funciones puras, cada una con un caso negativo
(`esperaFallo`), y `calcularVeredicto` con las constantes del umbral escritas en el código.

**Archivos**: `test/evals/soporte/{aserciones,umbral}.ts` (+specs),
`test/evals/casos/sinteticos/negativos/*.json` (uno por aserción), `test/evals/agente.evals.ts`
(evaluación de `esperaFallo` y test final de veredicto).

**RED → GREEN → REFACTOR**:
1. RED (transcripción completa): «EVL2 — Un monto sin rastro en herramientas hace fallar la aserción»
   y «EVL2 — Un porcentaje de recargo hace fallar la aserción» en `aserciones.spec.ts`; fallan porque
   las aserciones no existen.
2. GREEN: las ocho aserciones (`dineroConRastro` sobre `auditarDinero` de 07b), negativos, umbral;
   «EVL2 — Un handoff no esperado hace fallar la aserción» y los dos de EVL3 en `umbral.spec.ts`.
3. REFACTOR: un negativo que pasa por error (la aserción no detecta la violación) hace fallar
   `npm run evals` con el nombre del caso.

**Hecho cuando**: 5 escenarios en verde; cada aserción tiene al menos un negativo; el umbral de
`umbral.ts` coincide con EVL3.

**Estado (cerrada)**: EVL2 (3) y EVL3 (2) en verde (`aserciones.spec.ts`, `umbral.spec.ts`, 33 tests
unitarios de evals en total); las ocho aserciones tienen su negativo en
`casos/sinteticos/negativos/` y `agente.evals.ts` falla nombrando el caso si un negativo pasa. El
test final «EVL3 — veredicto de la corrida guionada» calcula el veredicto e imprime el resumen.

**Review requerida**: RDD

## T3 — Casos sintéticos: 3 casos de entrada, R1, R2, R12, R13, políticas y handoff

**Objetivo**: los casos que prueban el agente completo en modo guionado y que la corrida real
reutiliza. Cada guion es el comportamiento **correcto** del modelo; las aserciones lo comprueban.

| Caso | Aserciones principales |
|---|---|
| Entrada (a): SKU prellenado válido | Sin handoff; el texto nombra el producto; contexto con el producto (AGT12) |
| Entrada (b): mención genérica | `buscar_producto` + `obtener_ficha`; `dineroConRastro` |
| Entrada (c): SKU inexistente | Sin handoff; sin contexto de producto |
| R1 × 3 | `dineroConRastro`; `consultar_politica` + `textoLiteral`; política inexistente → `menciona: asesor`, `textoAusente` de otras políticas |
| R2 × 4 | Precio con rastro; `textoLiteral` del `rango_texto`; `recargoSinPorcentaje` + política literal; sin cobertura → sin montos |
| R12 «Ubicación entrante» | Sin `cotizar_envio` sin ciudad; `menciona: ciudad` |
| R13 «Fotos agrupadas en collage por defecto» | `enviar_fotos` con `modo: 'collage'`; `individuales` prohibido |
| Política no citada si no corresponde | Pregunta solo por un producto → `textoAusente` de la política de contra entrega |
| Sin traspaso sin señal fuerte | Cliente indeciso ("lo voy a pensar") → `handoff: prohibido`, `marcar_lead_caliente` prohibida |

**Archivos**: `test/evals/casos/sinteticos/*.json`, `test/evals/soporte/sembrar.ts` (productos y
políticas que piden los casos).

**RED → GREEN → REFACTOR**:
1. RED (transcripción completa): «R2 — El recargo contra entrega se dice sin porcentaje» con el guion
   correcto y la semilla sin `politica_contra_entrega`; falla `textoLiteral`.
2. GREEN: semilla completa y los 14 casos.
3. REFACTOR: los casos comparten la semilla base; cada uno declara solo lo que agrega.

**Hecho cuando**: 9 escenarios de cobertura + 5 casos propios en verde en modo guionado.

**Review requerida**: RDD

## T4 — Modo real con costo visible + anonimizador del set dorado

**Objetivo**: D6, D8. `EVALS_MODO=real` con perfil `evals`, 3 repeticiones, veredicto y costo;
anonimizador con su CLI; `.evals-crudo/` ignorado.

**Archivos**: `test/evals/soporte/{modo-evals,llm-con-perfil-evals,resumen}.ts` (+specs),
`scripts/evals/{anonimizador,anonimizar}.ts`, `scripts/evals/anonimizador.spec.ts`, `package.json`
(`evals:anonimizar`), `.gitignore`.

**RED → GREEN → REFACTOR**:
1. RED: «EVL4 — El modo real sin clave se niega sin llamar» (`modo-evals.spec.ts`) y, con transcripción
   completa, «EVL5 — Un dato personal que sobrevive hace fallar el anonimizador».
2. GREEN: modo real, decorador de perfil, costo desde `uso_llm`; anonimizador con marcadores estables
   («EVL5 — Teléfonos, correos y cédulas se reemplazan por marcadores estables»).
3. REFACTOR: el resumen del modo real reutiliza el de T1 y agrega costo y modelos.

**`[manual]`, después del GREEN** (requiere P32; clave de OpenRouter del usuario con límite de gasto en
su consola):
- Corrida real: `EVALS_MODO=real npm run evals`. Se anotan aquí veredicto, costo y modelos
  («EVL4 — La corrida real imprime su costo»). Si no alcanza el umbral, se ajusta el prompt
  (`reglas.v1.md` → `v2`) en una tarea nueva, nunca bajando el umbral.
- Set dorado (requiere P30): el usuario lee 20-30 conversaciones con `GET .../messages` hacia
  `.evals-crudo/`, las pasa por `npm run evals:anonimizar`, revisa cada caso, le pone aserciones y
  firma `revisadoPor`. Commit aparte de los JSON en `test/evals/casos/dorado/`.

**Hecho cuando**: 3 escenarios automáticos en verde; resultado `[manual]` anotado o marcado pendiente
con su pregunta bloqueante.

**Review requerida**: RDD (el commit del set dorado, además, revisión humana de cada JSON).

## T5 — Modelos de respaldo + cierre de 07c y de la Fase 07

**Objetivo**: D9 y cierre. Elegir el respaldo con evidencia, fijarlo en configuración y cerrar la fase.

**`[manual]` primero** (requiere P32): corrida real con `LLM_EVALS_MODELOS=<candidato>` por cada
candidato; tabla veredicto / costo / latencia p95 anotada aquí; el usuario elige.

**Archivos**: `src/plataforma/config/esquema.ts` (+spec), `.env.example`, `docs/adr/0002-pasarela-llm.md`
(enmienda), `CLAUDE.md` (comandos `evals`, `evals:anonimizar`), `docs/migracion/inventario.md`
(filas de la Fase 07), `docs/fases/README.md` (07c y Fase 07), `verify-report.md` de 07c.

**RED → GREEN → REFACTOR**:
1. RED: test de configuración: el default de `LLM_CONVERSACION_MODELOS` tiene dos modelos de empresas
   distintas y ambos tienen precio en `LLM_PRECIOS_USD_JSON`; falla con el default actual.
2. GREEN: defaults y `.env.example`.
3. REFACTOR: `npm run verify` y `npm run evals` completos.

**Cierre**: checklist §12 de `luxeboreal-arquitectura`; `verify-report.md` con el resultado de cada
escenario, la corrida real y "qué aprendimos"; la fila 07 del inventario (`llm/*` "modelos de
respaldo") marcada migrada. La Fase 07 queda cerrada cuando 07a, 07b y 07c están archivadas.

**Hecho cuando**: default fijado con evidencia aprobada por el usuario; docs al día.

**Review requerida**: RDD

## Tareas `[manual]`

| Tarea | Qué hace el usuario | Bloquea | Por qué no se automatiza |
|---|---|---|---|
| T4 | Corrida real con su clave y límite de gasto | P32 | Cuesta dinero y usa una credencial que nunca entra al repo |
| T4 | Leer, anonimizar y revisar las conversaciones del set dorado | P30 | Datos reales de clientes: exige autorización y revisión humana (**R14**) |
| T5 | Comparar candidatos con la corrida real y elegir | P32 | Decisión de costo y calidad del usuario (ADR-0002) |
