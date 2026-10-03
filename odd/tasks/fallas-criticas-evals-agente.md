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
- [x] **T4b** La guarda de dinero acepta como rastro las cifras que escribió el cliente en el turno (hallazgo R4
      de la revisión nativa); extracción de `motivoDeHandoff` en `contenido-llm.ts`. Ruta: delegada.
- [x] **T7** Cierre: casos `soloGuionado` (f781f9f), change `fix-fallas-criticas-evals-agente` con delta de `agente`
      (71bd811) y guía `docs/operacion/dinero-sin-rastro-y-evals-reales.md` (73eaa90). Ruta: delegada.
      La corrida real de 2026-10-02 quedó REPROBADA (2 críticas en `r2-sin-cobertura`): la aceptación de
      0 críticas **no se cumple**; la causa de esas 2 no está investigada.

Orden: T1 → T2 → T3 → T6 → T4 → T5 → T7. T4 va después de T1 por riesgo de falsos positivos.

## Aceptación

- `npm run lint`, `typecheck`, `fronteras`, tests `unit`, `integracion`, `e2e` y `evals` guionadas en verde.
- Corrida real: 0 críticas con `gpt-6-luna`, o la causa de cada crítica restante explicada con evidencia.
- Ninguna regla de R1/R2 depende solo del prompt.

## Progreso

| Tarea | Ruta | Commit | Revisión nativa |
|---|---|---|---|
| T1 | delegada | 3ef526d | aprobada (rango T1-T6, riesgo alto) |
| T2 | delegada | faff942 | idem |
| T3 | delegada | 484d0d2 | idem |
| T6 | delegada | 26bc1ae | idem |
| T4 | delegada | a21bd8a | idem |
| T5 | delegada | a689986 | idem |
| T4b | delegada | 674d35d | aprobada (rango T4b-T7, riesgo medio) |
| T7 | delegada | f781f9f, 71bd811, 73eaa90 | idem |

Revisión nativa: T1-T6 aprobada con 0 hallazgos bloqueantes y 3 informativos (el falso positivo por cifra del
cliente se corrigió en T4b); T4b-T7 aprobada con 1 informativo (R3: falta una prueba con dos mensajes de la
ráfaga, cada uno con su cifra; trabajo posterior, no bloquea).

## Entrega

Estrategia: `auto-chain`, cadena `stacked-to-main`. Tres PRs apilados sobre `main` (la cadena 08d ya entró):

| PR | Rama | Contiene | Líneas |
|---|---|---|---|
| 1/3 | `fix/agente-fallas-criticas-evals-p1` | T1-T3: arnés, casos y parser de montos | 266 |
| 2/3 | `fix/agente-fallas-criticas-evals-p2` | T6, T4, T5: regla de cita literal, guarda de dinero, mensaje literal | 515 |
| 3/3 | `fix/agente-fallas-criticas-evals-p3` | T4b y T7: cifra del cliente, arnés real, specs y guía | 568 |

**Excepción de tamaño (~400 líneas).** El PR 2/3 pasa por el renombrado de los tres prompts de `v2` a `v3`
(`VERSION_PROMPT` es una sola constante, así que `estilo` y `turno` se mueven con `reglas`) y el 3/3 lleva
documentación (specs y guía). Partirlos separaría una guarda de su prueba. Cada uno ya pasó revisión nativa.

## Pendiente

- Decisión del dueño: ¿un cliente que pide envío a un destino sin cobertura debe pasar a un asesor como lead
  caliente? Causa de las 2 críticas de `r2-sin-cobertura` en la corrida real del 2026-10-02.
- Repetir la corrida real cuando se decida; no hay evidencia de que el bot esté listo para clientes.
- Carrera intermitente en `MarcaMensajeProcesado.conectarSiHaceFalta` (no cubre `connecting`/`reconnecting` con
  `enableOfflineQueue: false`): falló una vez en CI (`CNV12`), hipótesis sin reproducir.
