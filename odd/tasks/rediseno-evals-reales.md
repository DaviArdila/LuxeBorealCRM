# Rediseño de las evals reales

Rama: `fix/evals-reales-diseno` (sobre `main` cdbdb2a). Trabajo fuera de fase (ODD). Ruta: delegada, un writer.

## Objetivo

Que la corrida real de las evals (`EVALS_MODO=real`) termine, imprima su resumen y mida al modelo contra el prompt y el
contrato de herramientas **vigentes**, no contra un guion. El modo guionado sigue igual y en 100 %.

## Problema (corridas reales del 2026-10-13)

`openai:gpt-5.6-luna` (5 críticas, 74,6 % no críticas) y `anthropic:claude-haiku-5-5` (3 críticas, 72,3 %) reprueban
con resultados idénticos en 24 de 32 casos. Una auditoría atribuye la mayoría de las fallas al diseño de las evals:

| # | Causa | Evidencia |
|---|---|---|
| 1 | Aserciones que contradicen el prompt: piden `consultar_caso` y su texto cuando el texto ya viaja en el prompt, y `obtener_ficha` cuando `buscar_producto` ya trae la ficha | `ensamblar-prompt.ts:35`, `indice.ts:9`, `consultar-caso.ts:29-30`, `buscar-producto.ts:28-30` |
| 2 | `textoLiteral` penaliza dos veces (falla si la herramienta no se llamó) y solo acepta herramientas como fuente | `aserciones.ts:113` |
| 3 | Premisas que solo existen en el guion | `lead-escala-no-confirmada`, los dos casos de consentimiento con datos (el teléfono solo está en el guion), `entrada-sku-inexistente` |
| 4 | `menciona` con frases exactas que una paráfrasis correcta no repite; «aproximad» y «transportadora» no salen de ninguna instrucción | casos `agt28`, `entrada-sku-inexistente`, `r2-cotizacion-con-cobertura` |
| 5 | El modo real corre todo en un solo `it` con `testTimeout: 180_000`; la corrida dura ~235 s, se corta y no imprime resumen | `agente.evals.ts:134-146`, `vitest.config.ts` |
| 6 | `test/evals/casos/dorado` no existe: el set dorado nunca corrió | solo se documenta |

## Alcance autorizado

`servicio/test/evals/**`, `servicio/vitest.config.ts`, este documento, `docs/operacion/dinero-sin-rastro-y-evals-reales.md`
y `docs/PREGUNTAS_ABIERTAS.md`.

## Restricciones

- Sin cambios a prompts, descripciones de herramientas, estilo ni comportamiento del bot: es decisión del dueño.
- `agt28-asesor-confirma-apartado` no se toca: su contradicción con R9 va como pregunta del dueño.
- No se inventan casos dorados. El modo real no se puede correr aquí (sin clave): se verifica guionado y unitario.
- Ediciones mínimas a `agente.evals.ts`, `modo-evals.ts` y `corrida-real.ts` (otro writer los toca para retirar OpenRouter).

## Tareas

| ID | Tarea | Ruta | Estado |
|---|---|---|---|
| T1 | Arnés real: un `it` por caso con plazo calculado, ejecución en serie, resumen siempre impreso, fallas por repetición | delegada (writer) | [x] |
| T2 | Aserciones alineadas con el contrato: `textoLiteral` con fuente `caso` y alternativas, sin doble penalización; `herramientasEsperadas` con alternativas; casos de uso y fichas | delegada (writer) | [x] |
| T3 | Premisas de guion (`soloGuionado` o mensaje reescrito) y `menciona` con alternativas | delegada (writer) | [x] |
| T4 | Pregunta del dueño sobre `agt28` y guía de evals reales | delegada (writer) | [x] |

## Criterios de aceptación

- [x] El modo real crea un `it` por caso con plazo `repeticiones × turnos × 2 × LOCK_TURNO_TTL_S + margen` y un `it` final
  que imprime el resumen aunque un caso falle o se corte.
- [x] Ningún caso exige `consultar_caso` para un texto que ya está en el prompt ni `obtener_ficha` cuando basta la ficha de
  `buscar_producto`; el único caso que ejercita la consulta es `caso-indice-grande`, con textos que no caben en el prompt.
- [x] `textoLiteral` no falla si su fuente no existe en el turno y acepta el texto del caso sembrado como fuente.
- [x] Los casos cuya premisa vive en el guion son `soloGuionado` o traen la premisa en el mensaje del cliente.
- [x] `npm run evals` (guionado) en verde y unitarios de `test/evals` con RED observado antes del GREEN.

## Comprobaciones

`npm run lint`, `typecheck`, `fronteras`, `commits`, `npm test`, `npm run evals` (guionado), dentro de `servicio/`.

## Progreso y evidencia

- T1: `plazo-real.ts` (plazo por caso), `iniciarCorridaReal` (sesión con casos en serie y `incompletos`), resumen con
  fallas por repetición, un `it` por caso en `agente.evals.ts`. RED observado: `plazo-real.spec.ts` (módulo inexistente) y
  2 pruebas nuevas de `resumen.spec.ts`; GREEN: `npx vitest run --project unit test/evals` 59 pasan. `npm run evals`
  guionado: 49 pasan, 35 omitidas (las del modo real), veredicto APROBADA 100 %. Commit: 077e36b.
- T2: `textoLiteral` con fuente `caso`, rutas con puntos y `algunaDe`, sin doble penalización; `herramientasEsperadas`
  con `algunaDe`; relleno largo (`casosDeRelleno`) para que `caso-indice-grande` sea el único que consulta. 15 casos
  ajustados (tabla en la guía). RED: 8 pruebas nuevas en `aserciones`, `esquema-caso` y `sembrar`; GREEN: 68 pasan.
  `npm run evals` guionado: 49 pasan, APROBADA 100 %. Commit: 9375d7d.
- T3: `lead-escala-no-confirmada` pasa a `soloGuionado`; teléfono en el mensaje de los dos casos de datos;
  `menciona` de `entrada-sku-inexistente` con alternativas; retirado `menciona` de `r2-cotizacion-con-cobertura`.
  Excepción TDD: solo datos de casos (JSON), sin RED posible; comprobación funcional: `npm run evals` guionado 49 pasan,
  34 omitidas, APROBADA 100 %. Commit: 7102d22.
- T4: P77 en `docs/PREGUNTAS_ABIERTAS.md` (agt28 frente a R9) y resumen de las corridas del 2026-10-13 en la guía.
  Solo documentos: lectura estructural. Commit: ver `git log` (T4).
- Cierre (en `servicio/`): `lint`, `typecheck`, `fronteras` (615 módulos) limpios; `commits`: 4 válidos; `npm test`: 211
  archivos, 1821 pasan; `npm run evals` (guionado): 49 pasan, 34 omitidas (modo real), APROBADA 100 %;
  `npm run test:integracion`: 71 archivos, 499 pasan. El modo real no se corrió (sin clave en esta máquina).
- Revisión nativa: no corrida por el writer; la decide el orquestador.

## Siguiente paso

Que el dueño corra la corrida real con su clave (comando en la guía) y responda la P77.
