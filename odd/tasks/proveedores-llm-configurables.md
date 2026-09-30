# Proveedores de LLM configurables

- Objetivo: poder configurar cualquier proveedor de LLM con su propia clave (OpenAI, Anthropic, Google,
  otros) y conectarse directo, sin pasar por OpenRouter, sin romper el comportamiento actual.
- Problema: OpenRouter cobra comisión (ADR-0002 la aceptó como costo) y `llm.module.ts` enlaza fijo
  `AdaptadorOpenRouter`; el usuario no quiere pagar ese intermediario.
- Alcance autorizado (2026-09-30): documentación + implementación por tareas de
  `openspec/changes/proveedores-llm-configurables/tasks.md` (T1-T4, T8, T9; T10 manual). ADR-0019
  aceptado. Push, PR y merge siguen siendo decisión del usuario.
- Restricciones: R1/R2/R14 sin cambio; puerto y gateway sin cambio de contrato; OpenRouter sigue por
  defecto; nada de precios inventados (los pone el usuario); rama `docs/proveedores-llm-directos`.
- TDD: no aplica a documentación. Para la implementación: **estricto**, fuente
  CLAUDE.md del proyecto, runner Vitest (`npm test`, `npm run test:integracion`).
- Documentos: ADR `docs/adr/0019-proveedores-llm-configurables.md`; change
  `openspec/changes/proveedores-llm-configurables/`; preguntas P37-P40 en `docs/PREGUNTAS_ABIERTAS.md` (P40 abierta).

## Tareas de documentación

- [x] D1 — ADR-0019 (redactado como propuesta; aceptado el 2026-09-30). Ruta: delegada (escritor único)
- [x] D2 — Change de OpenSpec: proposal, delta de `llm`, design y tasks. Ruta: delegada
- [x] D3 — Preguntas P37-P40 en `PREGUNTAS_ABIERTAS.md`. Ruta: delegada
- [x] D4 — Este documento de seguimiento. Ruta: delegada
- [x] D5 — El usuario aceptó el ADR-0019 y resolvió P37-P39 (2026-09-30); P40 sigue abierta y solo bloquea T10. Ruta: usuario

## Tareas de implementación (D5 hecha; T5-T7 pospuestas)

Detalle, slices y RED de cada una en `openspec/changes/proveedores-llm-configurables/tasks.md`.

- [ ] T1 — Resolución de modelo (`resolver-modelo.ts`) y verificación de paquetes `@ai-sdk/*`. Ruta: inline
- [ ] T2 — Configuración por proveedor. Ruta: delegada
- [ ] T3 — Adaptador genérico con OpenRouter como proveedor. Ruta: delegada
- [ ] T4 — Proveedor `openai` (único directo inicial, P37). Ruta: delegada
- [~] T5 — pospuesta (P37: solo OpenAI): proveedor `anthropic`
- [~] T6 — pospuesta (P37: solo OpenAI): proveedor `google`
- [~] T7 — pospuesta (P37: solo OpenAI): proveedor `compatible`
- [ ] T8 — Enrutador, cableado, fronteras y fallback. Ruta: delegada
- [ ] T9 — Documentación y matiz de ADR-0002/0014 (obligatorio: ADR aceptado). Ruta: inline
- [ ] T10 — `[manual]` corrida real de evals con la clave de OpenAI del usuario; espera P40. Ruta: manual

Slices (ver `tasks.md`): PR1 T1+T2, PR2 T3, PR3 T4, PR4 T8+T9; T10 manual tras el PR4.

Evidencia de ruta por tarea: las de 2+ archivos no triviales se delegan a un escritor (regla de
escritura); T1 y T9 son de un archivo y quedan inline.

## Criterios de aceptación

- Sin configuración nueva, el comportamiento es idéntico al actual.
- Un modelo con prefijo se llama directo y su fila de `uso_llm` lleva ese proveedor.
- Producción exige la clave solo de los proveedores usados.
- Cada escenario LLM11 (modificado) y LLM15-LLM24 tiene su test `<ID> — <título>`.
- `npm run verify` en verde al cerrar cada slice; la corrida real de evals queda registrada.

## Checks

| Etapa | Check |
|---|---|
| Documentación | Relectura estructural; rutas y enlaces citados existen; sin colisión de ADR-0019, LLM15+ ni P37+ |
| Implementación | RED observado → GREEN → REFACTOR por tarea; `npm run verify` por slice; `npm run fronteras` |
| Evals | Corrida real `[manual]` (T10), no en CI |

## Progreso

- 2026-09-30: redactados ADR-0019, change (proposal, delta, design, tasks) y P37-P40. Sin commit.
  Verificación: relectura y comprobación de rutas; ningún archivo de `src/`, `test/` o `prisma/`
  modificado.

- 2026-09-30: el usuario aprobó el ADR-0019 y eligió OpenAI como primer proveedor directo (P37);
  P38 y P39 resueltas con la recomendación. P40 sigue abierta (solo bloquea T10). T5-T7 pospuestas.
  La documentación anterior quedó en el commit `e8080bb`; ADR, índice, preguntas y change se
  actualizaron después (sin commit todavía).

## Próximo paso

T1: resolución de modelo (`resolver-modelo.ts`) y verificación de paquetes `@ai-sdk/*` contra `ai`
7.0.122. P40 se responde antes de T10.
