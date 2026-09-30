# Tasks: proveedores-llm-configurables

- Modo TDD: **estricto** (fuente: CLAUDE.md del proyecto) · Runner: Vitest (`npm test`,
  `npm run test:integracion`) · Verificación por tarea: test enfocado; `npm run verify` al cerrar cada
  slice.
- Entrega: `auto-chain`, cadena `stacked-to-main`. Pronóstico: ~1 400-1 700 líneas cambiadas →
  **5 PRs apilados**, cada uno ≤400 líneas (T4-T7 dependen de P37). El presupuesto nunca se cumple
  borrando tests ni comentarios.
- Review requerida: **RDD** (sin judgment-day: no es una fase de las de la regla 6). Native
  `gentle-ai review` por commit de unidad de trabajo cuando RDD esté activo.
- Ramas: `proveedores-llm-pK-<tema>`, apiladas sobre la anterior.
- **Nada se implementa hasta que el usuario acepte el ADR-0019 y responda P37-P40.**

## Slices

| PR | Rama | Tareas | Contenido | Depende de |
|---|---|---|---|---|
| 1 | `proveedores-llm-p1-resolucion-config` | T1 + T2 | Resolver puro y configuración | P39 |
| 2 | `proveedores-llm-p2-adaptador-generico` | T3 | Adaptador genérico + OpenRouter como proveedor | PR 1 |
| 3 | `proveedores-llm-p3-openai-anthropic` | T4 + T5 | OpenAI y Anthropic directos | PR 2, P37 |
| 4 | `proveedores-llm-p4-google-compatible` | T6 + T7 | Google y endpoint compatible | PR 3, P37 |
| 5 | `proveedores-llm-p5-cableado-docs` | T8 + T9 | Enrutador cableado, fronteras, fallback y docs | PR 4 |

T10 `[manual]` corre después del PR 5. Si P37 excluye un proveedor, su tarea se omite y el slice se
fusiona con el vecino.

## Tareas

- [ ] **T1 — Resolución de modelo (LLM15, LLM16).** `dominio/resolver-modelo.ts`: `resolverModelo`
  y lista de proveedores registrados. **Antes de escribir código: verificar** los nombres y versiones
  de los paquetes `@ai-sdk/*` compatibles con `ai` 7.0.122 y anotarlos en `design.md` D7. RED: ids sin
  prefijo, con prefijo, con `/`, con sufijo `:free`, prefijo desconocido. Ruta prevista: inline.
- [ ] **T2 — Configuración (LLM16, LLM17, LLM19, LLM24).** `esquema.ts`: variables por proveedor,
  prefijos válidos, clave exigida en producción solo al proveedor usado, precio por modelo; `.env.example`.
  RED: los 5 escenarios de config y que el valor de una clave nunca salga en el error. Ruta:
  delegada (escritor).
- [ ] **T3 — Adaptador genérico con OpenRouter (LLM11, LLM15, LLM22).** `adaptador-ai-sdk.ts` +
  `proveedores/openrouter.ts` (mover, no reescribir) y `resolverModelo` en el gateway para el
  `proveedor` de la fila. RED: fila con `proveedor` real; el test de integración de OpenRouter sigue en
  verde sin cambios (no regresión). Ruta: delegada.
- [ ] **T4 — Proveedor `openai` (LLM18, LLM22, LLM23).** Archivo de proveedor + dependencia con versión
  exacta. RED: normalización de uso con caché, 429/503 reintentables, 401 no reintentable, metadatos
  idénticos; servidor HTTP falso. **Verificar** contra la API el reporte de caché. Solo si P37 lo
  incluye. Ruta: delegada.
- [ ] **T5 — Proveedor `anthropic` (LLM18, LLM22, LLM23).** Igual que T4; **verificar** cómo reporta la
  caché de lectura y de escritura. Solo si P37 lo incluye. Ruta: delegada.
- [ ] **T6 — Proveedor `google` (LLM18, LLM22, LLM23).** Igual que T4; **verificar** el nombre del env
  del SDK y los metadatos de razonamiento (B7). Solo si P37 lo incluye. Ruta: delegada.
- [ ] **T7 — Proveedor `compatible` (LLM18, LLM22).** Endpoint tipo OpenAI con `baseURL` y clave por
  entorno; URL obligatoria si se usa. Solo si P37 lo incluye. Ruta: delegada.
- [ ] **T8 — Enrutador, cableado y fronteras (LLM15, LLM20, LLM21).** `adaptador-enrutador.ts`,
  fábrica en `llm.module.ts` que instancia solo los proveedores usados, regla `@ai-sdk/` en
  `.dependency-cruiser.cjs`, `modo-evals.ts`. RED: prefijo enruta al proveedor correcto; caída de un
  proveedor deriva al siguiente; con todo caído, `proveedor-caido`; `npm run fronteras` rechaza un
  import fuera de infraestructura. Ruta: delegada.
- [ ] **T9 — Documentación.** `.env.example` con ejemplos de perfil (sin claves ni precios inventados),
  nota en `CLAUDE.md` si cambia algún comando, y matiz de ADR-0002 y ADR-0014 **solo si el usuario
  aceptó el ADR-0019**; índice de ADR. Solo documentación: sin cambios de producción, sin riesgo de
  presupuesto. Ruta: inline.
- [ ] **T10 — `[manual]` Corrida real de evals.** El usuario ejecuta `EVALS_MODO=real` con la clave del
  proveedor y el modelo elegidos (P37, autorizada con P40); se registra el resultado y el gasto en
  `verify-report.md`. Nada pasa a modelo principal sin esta corrida. No corre en CI. Ruta: manual.

## Cierre

Al cerrar: `sdd-archive` fusiona el delta en `openspec/specs/llm/spec.md` (LLM11 modificado; LLM15-LLM24
añadidos), se archiva el change y se actualiza `docs/migracion/inventario.md` solo si aplica. El estado
de la aceptación del ADR-0019 se refleja en `docs/adr/README.md`. Este trabajo no es una fase:
`docs/fases/README.md` no se toca. El seguimiento vive en
`odd/tasks/proveedores-llm-configurables.md`.
