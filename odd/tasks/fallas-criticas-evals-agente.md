# Fallas críticas de las evals reales del agente

- Objetivo: que la corrida real de evals deje de reprobar por las críticas de R1/R2 y que R1/R2 se hagan
  cumplir con guardas deterministas, no solo con el prompt.
- Estado: **autorizada** por el usuario (2026-10-02, «procede») sobre el análisis de la sesión del mismo día.
  Rama: `fix/agente-fallas-criticas-evals` (sobre `fase-08d-avisos-con-enlace`, aún sin fusionar).
- Fuera de alcance: cambiar `escala-lead.ts` (decisión de negocio, ver D1); cambios de esquema de datos;
  `toolChoice`/`strict` del adaptador (sin evidencia de necesidad); push, PR y merge (decisión del usuario).
- TDD: **estricto**; fuente `CLAUDE.md` del proyecto; runner Vitest: `npm test` (unit),
  `npm run test:integracion`, `npm run evals` (guionadas).
- Corrida real (cuesta ~0.007 USD): `EVALS_MODO=real node --env-file=.env node_modules/vitest/vitest.mjs run
  --project evals --testTimeout=1200000`. Nunca leer ni imprimir el `.env` ni claves.
- Planificación: ~400 líneas de autoría por tarea como heurística, no como tope.

## Problema y evidencia

La corrida real con `openai:gpt-6-luna` dio REPROBADA: 4 críticas y 84.5 % de aserciones no críticas.
El análisis (fork de la sesión, 2026-10-02, ~0.05 USD) separó las causas:

| Falla | Causa raíz | Confianza |
|---|---|---|
| `dineroConRastro` x2 en `r1-dato-rastreado` | Arnés: `GrabadorLlm` lee `solicitud.mensajes.at(-1)`, pero el bucle pasa el mismo array mutable a todas las llamadas; solo ve la última ronda de herramientas | Alta |
| `dineroConRastro` x1 en `r2-precio` | Probablemente la misma; no reproducida | Media |
| Traspaso `lead-caliente` en `r2-recargo-sin-porcentaje` | `escala-lead.ts:12` marca `pregunta_medios_de_pago` como señal fuerte; el modelo la usa bien | Alta |
| `textoLiteral` (política, recargo) | El modelo parafrasea; una regla de cita literal bajó 2/3 a 0/3 | Media |
| 24 de 32 fallas no críticas | Casos mal escritos (un turno sin producto, ids SKU en vez de UUID, frases repetidas) | Alta |
| R1/R2 sin guarda | `contenido-llm.ts:102-106` solo hace `warn`; `auditar-dinero.ts` solo detecta montos con `$` | Alta |

## Decisiones

- **D1.** La escala de leads no cambia: `pregunta_medios_de_pago` sigue siendo señal fuerte. Se corrige el
  caso `r2-recargo-sin-porcentaje`. Revertible si el dueño decide otra cosa.
- **D2.** Solo `gpt-6-luna` como principal. El respaldo `gpt-5.6-luna` queda pendiente del precio real.

## Tareas

Ruta por tarea: **delegada** (un escritor), por el disparador de 2+ archivos no triviales.

- [x] **T1** Arnés: `GrabadorLlm` copia los resultados de herramientas al momento de cada llamada, con test.
- [x] **T2** Casos de eval corregidos (producto previo en los de un turno, UUID real en `r13-una-foto`,
      `textoAusente` sin frases del cliente, `r2-recargo-sin-porcentaje` según D1, giro del negocio en
      `saludo`).
- [x] **T3** `auditar-dinero.ts` detecta `COP`, «pesos», «mil» y miles con separador; valida el valor completo.
- [x] **T4** Guarda: `dinero-sin-rastro` bloquea (un reintento con mensaje correctivo; si persiste, traspaso
      con texto de cortesía).
- [x] **T5** Guarda: `mensaje_sin_cobertura` sale literal desde el backend.
- [x] **T6** Regla no negociable de cita literal en `reglas` (nueva versión del prompt) y evals guionadas.
- [ ] **T7** Cierre: corrida real contra el umbral, specs delta de `agente` y guía de operación.

Orden: T1 → T2 → T3 → T6 → T4 → T5 → T7. T4 va después de T1 por riesgo de falsos positivos.

## Aceptación

- `npm run lint`, `typecheck`, `fronteras`, tests `unit`, `integracion`, `e2e` y `evals` guionadas en verde.
- Corrida real: 0 críticas con `gpt-6-luna`, o la causa de cada crítica restante explicada con evidencia.
- Ninguna regla de R1/R2 depende solo del prompt.

## Progreso

| Tarea | Ruta | Commit | Revisión nativa |
|---|---|---|---|
| T1 | delegada | 3ef526d | no aplica (RDD no consultado) |
| T2 | delegada | faff942 | idem |
| T3 | delegada | 484d0d2 | idem |
| T6 | delegada | 26bc1ae | no aplica (RDD no consultado) |
| T4 | delegada | a21bd8a | idem |
| T5 | delegada | a689986 | idem |
| T7 | pendiente | — | — |

Siguiente paso: T7 (corrida real y specs delta). Para T7: la guarda de T4 reintenta una vez y traspasa como `fallo-llm`; el negativo de evals `neg-dinero` se reemplazó por dos casos guionados (la guarda lo hace inalcanzable por el agente; la detección sigue en `aserciones.spec`), así que la spec de `agente` (EVL2, «cada aserción con un negativo») y la de AGT/R1 deben reflejarlo; T5 añade el mensaje literal al final del texto; el prompt pasó a `v3` (reglas, estilo y turno). Nota: `test:integracion` falla en `prompts-build.spec.ts` por `spawnSync npx ENOENT` (entorno Windows), ajena a estos cambios.
