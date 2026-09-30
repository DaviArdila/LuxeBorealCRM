# Tasks: proveedores-llm-configurables

- Modo TDD: **estricto** (fuente: CLAUDE.md del proyecto) · Runner: Vitest (`npm test`,
  `npm run test:integracion`) · Verificación por tarea: test enfocado; `npm run verify` al cerrar cada
  slice.
- Entrega: `auto-chain`, cadena `stacked-to-main`. Pronóstico: ~900-1 200 líneas cambiadas →
  **4 PRs apilados**, cada uno ≤400 líneas (T5-T7 pospuestas, P37: solo OpenAI). El presupuesto nunca se cumple
  borrando tests ni comentarios.
- Review requerida: **RDD** (sin judgment-day: no es una fase de las de la regla 6). Native
  `gentle-ai review` por commit de unidad de trabajo cuando RDD esté activo.
- Ramas: `proveedores-llm-pK-<tema>`, apiladas sobre la anterior.
- ADR-0019 aceptado y P37-P40 resueltas (2026-09-30). P40: gasto de la corrida real autorizado, límite de 2 USD.

## Slices

| PR | Rama | Tareas | Contenido | Depende de |
|---|---|---|---|---|
| 1 | `proveedores-llm-p1-resolucion-config` | T1 + T2 | Resolver puro y configuración | — |
| 2 | `proveedores-llm-p2-adaptador-generico` | T3 | Adaptador genérico + OpenRouter como proveedor | PR 1 |
| 3 | `proveedores-llm-p3-openai` | T4 | Proveedor OpenAI directo | PR 2 |
| 4 | `proveedores-llm-p4-enrutador-docs` | T8 + T9 | Enrutador cableado, fronteras, fallback y docs | PR 3 |

T10 `[manual]` corre después del PR 4, cuando el usuario ponga su clave (P40 resuelta: límite de 2 USD). T5-T7 quedan pospuestas: si se retoman, serán
slices nuevos después del PR 4.

## Tareas

- [x] **T1 — Resolución de modelo (LLM15, LLM16).** `dominio/resolver-modelo.ts`: `resolverModelo`
  y lista de proveedores registrados. **Antes de escribir código: verificar** los nombres y versiones
  de los paquetes `@ai-sdk/*` compatibles con `ai` 7.0.122 y anotarlos en `design.md` D7. RED: ids sin
  prefijo, con prefijo, con `/`, con sufijo `:free`, prefijo desconocido. Ruta prevista: inline.
- [x] **T2 — Configuración (LLM16, LLM17, LLM19, LLM24).** `esquema.ts`: variables por proveedor,
  prefijos válidos, clave exigida en producción solo al proveedor usado, precio por modelo; `.env.example`.
  RED: los 5 escenarios de config y que el valor de una clave nunca salga en el error. Ruta:
  delegada (escritor).
- [x] **T3 — Adaptador genérico con OpenRouter (LLM11, LLM15, LLM22).** `adaptador-ai-sdk.ts` +
  `proveedores/openrouter.ts` (mover, no reescribir) y `resolverModelo` en el gateway para el
  `proveedor` de la fila. RED: fila con `proveedor` real; el test de integración de OpenRouter sigue en
  verde sin cambios (no regresión). Ruta: delegada.
- [x] **T4 — Proveedor `openai` (LLM18, LLM22, LLM23), único proveedor directo inicial (P37).** Archivo de proveedor + dependencia con versión
  exacta. RED: normalización de uso con caché, 429/503 reintentables, 401 no reintentable, metadatos
  idénticos; servidor HTTP falso. **Verificar** contra la API el reporte de caché y el id directo del modelo
  (`gpt-5.6-luna` es el candidato; los precios los carga el usuario). Ruta: delegada.
- [~] **T5 — pospuesta (P37: solo OpenAI).** Proveedor `anthropic` (LLM18, LLM22, LLM23). Igual que T4;
  **verificar** cómo reporta la caché de lectura y de escritura. Ruta prevista: delegada.
- [~] **T6 — pospuesta (P37: solo OpenAI).** Proveedor `google` (LLM18, LLM22, LLM23). Igual que T4;
  **verificar** el nombre del env del SDK y los metadatos de razonamiento (B7). Ruta prevista: delegada.
- [~] **T7 — pospuesta (P37: solo OpenAI).** Proveedor `compatible` (LLM18, LLM22). Endpoint tipo OpenAI
  con `baseURL` y clave por entorno; URL obligatoria si se usa. Ruta prevista: delegada.
- [ ] **T8 — Enrutador, cableado y fronteras (LLM15, LLM20, LLM21).** `adaptador-enrutador.ts`,
  fábrica en `llm.module.ts` que instancia solo los proveedores usados (hoy OpenRouter y OpenAI; no
  depende de T5-T7, el registro admite sumar otros después), regla `@ai-sdk/` en
  `.dependency-cruiser.cjs`, `modo-evals.ts`. RED: prefijo enruta al proveedor correcto; caída de un
  proveedor deriva al siguiente; con todo caído, `proveedor-caido`; `npm run fronteras` rechaza un
  import fuera de infraestructura. Ruta: delegada.
- [ ] **T9 — Documentación.** `.env.example` con ejemplos de perfil (sin claves ni precios inventados),
  nota en `CLAUDE.md` si cambia algún comando, y matiz de ADR-0002 y ADR-0014 (**obligatorio**: el
  ADR-0019 se aceptó el 2026-09-30); índice de ADR. Solo documentación: sin cambios de producción, sin riesgo de
  presupuesto. Ruta: inline.
- [ ] **T10 — `[manual]` Corrida real de evals.** El usuario ejecuta `EVALS_MODO=real` con la clave de
  OpenAI y el modelo elegido (P37; gasto autorizado con P40: límite de 2 USD en la consola de OpenAI); se registra el resultado y el gasto en
  `verify-report.md`. Nada pasa a modelo principal sin esta corrida. No corre en CI. Ruta: manual.

## Cierre

Al cerrar: `sdd-archive` fusiona el delta en `openspec/specs/llm/spec.md` (LLM11 modificado; LLM15-LLM24
añadidos), se archiva el change y se actualiza `docs/migracion/inventario.md` solo si aplica. El ADR-0019 ya figura
como aceptado en `docs/adr/README.md`. Este trabajo no es una fase:
`docs/fases/README.md` no se toca. El seguimiento vive en
`odd/tasks/proveedores-llm-configurables.md`.
