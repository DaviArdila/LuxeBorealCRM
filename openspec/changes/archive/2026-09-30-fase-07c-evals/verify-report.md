# Verify report: Fase 07c — Evals del agente, set dorado y corrida real

- Fecha: 2026-09-30 · Rama: `claude/loving-ramanujan-xipz09` (apilada sobre la 07b)
- Change: `openspec/changes/archive/2026-09-30-fase-07c-evals/`
- Commits de unidad de trabajo: T1 `1f0063e`; T2 `b18c7fb`; T3 `4b169de`; T4 `4f83dc3`; T5 pendiente;
  cierre documental en este commit.

## Alcance verificado

Cuatro de las cinco tareas `[x]`; **T5 (modelos de respaldo) queda pendiente `[manual]`**, igual que la
corrida real y el set dorado de T4. Lo automático está completo: el proyecto de evals, las ocho
aserciones con sus negativos, el umbral por modo, los 14 casos sintéticos, el modo real (probado contra
el simulador de OpenRouter) y el anonimizador. **No se llamó a OpenRouter real** ni se leyó ninguna
conversación real: faltan la clave del usuario con límite de gasto (P32) y su autorización sobre datos
reales (P30).

## Checks ejecutados (comandos reales)

Entorno: sin Docker; Postgres 16 y Redis locales con un `globalSetup` alterno fuera del repo (MinIO no
disponible).

| Comando | Resultado |
|---|---|
| `npm run lint` · `typecheck` · `fronteras` · `contrato:deriva` | Verde |
| `vitest --project unit` | 818 pasan; 7 fallan por necesitar Docker (los mismos de `main`) |
| `vitest --project integracion` (locales) | 222 pasan; 7 fallan por necesitar MinIO |
| `vitest --project e2e` (locales) | Verde: 23 tests |
| `vitest --project evals` (`npm run evals`, modo guionado, locales) | Verde: 27 pasan, 1 omitido (el modo real) |
| `EVALS_MODO=real npm run evals` sin clave | Falla antes de componer nada con «necesita OPENROUTER_API_KEY» |

Pendiente de confirmar en CI de GitHub (`npm run ci`, ahora con `npm run evals` en la secuencia).

## Escenarios de spec — cobertura real

| Requisito | Escenarios | Dónde se prueba |
|---|---|---|
| EVL1 | 2 | `agente.evals.ts` (centinela `SimuladorOpenRouter` con 0 intentos y 0 filas en `uso_llm`; dos corridas con el mismo resumen) |
| EVL2 | 3 | `aserciones.spec.ts` y ocho negativos que el arnés exige que fallen |
| EVL3 | 2 | `umbral.spec.ts` y el test «veredicto» de cada modo |
| EVL4 | 1 de 2 | «sin clave» (unitario y de punta a punta); «imprime su costo» contra el simulador; **contra el proveedor real, pendiente `[manual]`** |
| EVL5 | 2 | `anonimizador.spec.ts` y `anonimizar.spec.ts` |
| R1 ×3, R2 ×4, R12 «Ubicación entrante», R13 «Fotos agrupadas en collage por defecto» | 9 | Casos guionados con el título exacto del escenario |

## Límites conocidos

- El modo guionado prueba el arnés, las aserciones y las herramientas reales, **no** lo que dice un
  modelo real: eso solo lo mide la corrida real pendiente. Comprobado por mutación que un guion que
  viola una aserción crítica hace fallar el caso.
- R13 «collage por defecto» solo puede exigir que se llame `enviar_fotos` con `modo: collage`; no
  prohíbe que un modelo real llame además a `individuales`.
- El anonimizador falla cerrado: una cifra de 7 o más dígitos (p. ej. un presupuesto) se trata como dato
  personal y obliga a reescribir ese fragmento a mano.

## Pendientes abiertos

- `[manual]` corrida real (P32), set dorado de 20-30 conversaciones (P30) y elección del modelo de
  respaldo con su enmienda de ADR-0002 (T5). La Fase 07 queda funcionalmente completa en código y
  evals guionadas; **el respaldo de modelos sigue sin fijarse** y la aprobación con LLM real sigue sin
  correrse.

## Qué aprendimos que cambia las fases siguientes

1. Las evals reutilizan `AppModule` completo con solo `LLM_PORT` sustituido: la Fase 08 agrega sus
   casos (escala de leads, captura fuera de horario) al mismo arnés sin infraestructura nueva.
2. La corrida real iguala el perfil de conversación al de `evals` en la configuración de prueba en vez
   de decorar el gateway: cero cambios en `src/`.
3. Un caso real anonimizado no carga hasta que una persona complete `revisadoPor` y `fecha`: el control
   humano de R14 queda impuesto por el propio esquema.
