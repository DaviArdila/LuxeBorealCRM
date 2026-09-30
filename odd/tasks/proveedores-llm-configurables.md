# Proveedores de LLM configurables

- Objetivo: poder configurar cualquier proveedor de LLM con su propia clave (OpenAI, Anthropic, Google,
  otros) y conectarse directo, sin pasar por OpenRouter, sin romper el comportamiento actual.
- Problema: OpenRouter cobra comisión (ADR-0002 la aceptó como costo) y `llm.module.ts` enlaza fijo
  `AdaptadorOpenRouter`; el usuario no quiere pagar ese intermediario.
- Alcance autorizado: **solo documentación por ahora** (ADR-0019 en estado `propuesta`, el change de
  OpenSpec y estas preguntas). No se toca `src/`, `test/` ni `prisma/`. Sin commit ni push hasta que el
  usuario lo pida.
- Restricciones: R1/R2/R14 sin cambio; puerto y gateway sin cambio de contrato; OpenRouter sigue por
  defecto; nada de precios inventados (los pone el usuario); rama `docs/proveedores-llm-directos`.
- TDD: no aplica a esta etapa (documentación). Para la implementación: **estricto**, fuente
  CLAUDE.md del proyecto, runner Vitest (`npm test`, `npm run test:integracion`).
- Documentos: ADR `docs/adr/0019-proveedores-llm-configurables.md`; change
  `openspec/changes/proveedores-llm-configurables/`; preguntas P37-P40 en `docs/PREGUNTAS_ABIERTAS.md`.

## Tareas de documentación

- [x] D1 — ADR-0019 en estado `propuesta`. Ruta: delegada (escritor único)
- [x] D2 — Change de OpenSpec: proposal, delta de `llm`, design y tasks. Ruta: delegada
- [x] D3 — Preguntas P37-P40 en `PREGUNTAS_ABIERTAS.md`. Ruta: delegada
- [x] D4 — Este documento de seguimiento. Ruta: delegada
- [ ] D5 — El usuario revisa y responde P37-P40 y acepta o ajusta el ADR-0019. Ruta: usuario

## Tareas de implementación (bloqueadas hasta D5)

Detalle, slices y RED de cada una en `openspec/changes/proveedores-llm-configurables/tasks.md`.

- [ ] T1 — Resolución de modelo (`resolver-modelo.ts`) y verificación de paquetes `@ai-sdk/*`. Ruta: inline
- [ ] T2 — Configuración por proveedor. Ruta: delegada
- [ ] T3 — Adaptador genérico con OpenRouter como proveedor. Ruta: delegada
- [ ] T4 — Proveedor `openai` (si P37 lo incluye). Ruta: delegada
- [ ] T5 — Proveedor `anthropic` (si P37 lo incluye). Ruta: delegada
- [ ] T6 — Proveedor `google` (si P37 lo incluye). Ruta: delegada
- [ ] T7 — Proveedor `compatible` (si P37 lo incluye). Ruta: delegada
- [ ] T8 — Enrutador, cableado, fronteras y fallback. Ruta: delegada
- [ ] T9 — Documentación y matiz de ADR-0002/0014 si se aceptó. Ruta: inline
- [ ] T10 — `[manual]` corrida real de evals con la clave del usuario. Ruta: manual

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
| Documentación (ahora) | Relectura estructural; rutas y enlaces citados existen; sin colisión de ADR-0019, LLM15+ ni P37+ |
| Implementación | RED observado → GREEN → REFACTOR por tarea; `npm run verify` por slice; `npm run fronteras` |
| Evals | Corrida real `[manual]` (T10), no en CI |

## Progreso

- 2026-09-30: redactados ADR-0019, change (proposal, delta, design, tasks) y P37-P40. Sin commit.
  Verificación: relectura y comprobación de rutas; ningún archivo de `src/`, `test/` o `prisma/`
  modificado.

## Próximo paso

El usuario responde P37-P40 (proveedores y modelos, respaldo con OpenRouter, dónde vive la clave, gasto
de evals) y decide sobre el ADR-0019. Después: commit de esta documentación en la rama y arranque de T1.
