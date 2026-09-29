# Proposal: Fase 07c — Evals del agente, set dorado y corrida real

- Change: `fase-07c-evals` · Fase de la hoja de ruta: **07c** (tercera de tres partes de la Fase 07) ·
  Rama: `fase-07c-evals`
- Fecha: 2026-09-29 · Estado: **spec en revisión**
- Depende de: **07b cerrada** (agente completo con LLM y herramientas).
- Análisis de la fase: `openspec/changes/fase-07a-turno-y-politicas/exploration.md`.

## Intent

Las reglas que más importan del agente (R1: solo datos de herramientas; R2: nunca calcular dinero,
recargo sin porcentaje, envío como rango; políticas citadas literal; no traspasar sin señal) dependen de
lo que **dice** el modelo, y eso no se prueba con un test unitario. El prototipo cambiaba prompt o modelo
"a mano" (riesgo 4 de `docs/analisis/01-analisis-chatluxecrm.md`). Esta parte construye las **evals**:
conversaciones de referencia con aserciones deterministas y un umbral explícito, que corren con un LLM
guionado en CI y con el LLM real bajo demanda, antes de cualquier cambio de modelo o de prompt. Además
cierra las decisiones que la Fase 06 dejó para aquí: los modelos de respaldo concretos (ADR-0002).

Éxito (fila 07 de `docs/fases/README.md`): evals de los 3 casos de entrada en verde con LLM simulado;
corrida manual con LLM real; set dorado construido con conversaciones reales anonimizadas, con umbral
explícito de aprobación.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Perfil `evals` | Ya existe (`LLM_EVALS_*`, Fase 06), con timeout de 30 s sin presión del lock | ADR-0002, LLM12 |
| Respaldo | "Un modelo de otra empresa como segundo" | ADR-0002 |
| Costo | Toda llamada real queda en `uso_llm` (el de la base de prueba de la corrida, que imprime su suma); el techo mensual de producción no la ve, así que el freno es el límite de gasto de la consola de OpenRouter | LLM6-LLM9, P17, P32 |
| Datos reales | Ningún dato personal en el repo ni en logs | **R14**, P7, P15 |
| Review | RDD; `judgment-day` no obligatorio | regla 6 |

## Scope

### In Scope

1. **Arnés de evals**: proyecto Vitest `evals`, `npm run evals` (modo guionado por defecto), casos en
   JSON, un LLM guionado que implementa `LlmPort`, el agente completo sobre base y Redis de prueba.
2. **Aserciones deterministas** con casos negativos que prueban que cada aserción sí detecta el fallo.
3. **Umbral de aprobación** explícito y configurable por modo.
4. **Casos sintéticos**: los 3 casos de entrada, R1, R2, políticas, ubicación, collage por defecto.
5. **Modo real** bajo demanda (perfil `evals`, clave del usuario), que imprime el costo de la corrida.
6. **Anonimizador** con test para el set dorado y la estructura del set.
7. `[manual]` extracción y anonimización de conversaciones reales; corrida real; elección de modelos de
   respaldo.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Evals de escala de leads, captura fuera de horario | 08 | Esas reglas llegan en la 08; sus casos se agregan al mismo arnés |
| Modo sombra con tráfico real | 10 | Fila 10 de la hoja de ruta |
| Tablero o historial de resultados de evals | Posterior | Se imprime un resumen; se reevalúa si hace falta |

## Qué se migra del prototipo

| Prototipo | Decisión | Motivo |
|---|---|---|
| `tests/motor/casosEntrada.test.ts` (3) | Rediseñar: se reescriben como casos de evals | Los 3 casos de entrada (SPEC prototipo §3.3) |
| Conversaciones reales en su Chatwoot | Rediseñar: se leen y anonimizan como casos del set dorado `[manual]` (P30); ningún dato se migra a la base | Set dorado; P7 prohíbe migrar datos, no construir fixtures anonimizados — por eso se pregunta |
| Validación "a mano" de prompts | Descartar | Riesgo 4 del análisis 01 |

## Capabilities

### Modified Capabilities

- `agente`: ADDED EVL1-EVL5; cubre con evals los escenarios de R1, R2, R12 (ubicación) y R13
  (collage) que dependen del modelo.

## Approach

Cinco tareas (detalle en `tasks.md`): arnés → aserciones y umbral → casos sintéticos → modo real y
anonimizador → modelos de respaldo y cierre. TDD estricto con Vitest (`npm test`, `npm run evals`).
Entrega en 4 PRs apilados (~1.300 líneas). Diseño en `design.md` (D1-D9).

## Affected Areas

| Área | Impacto |
|---|---|
| `vitest.config.ts`, `package.json` | Proyecto `evals`, script `evals`; `ci` corre el modo guionado |
| `test/evals/` | **Nuevo**: casos, soporte, specs |
| `scripts/evals/anonimizador.ts`, `anonimizar.ts` | **Nuevo**: lógica pura + CLI (`npm run evals:anonimizar`) |
| `.gitignore` | `.evals-crudo/` (conversaciones sin anonimizar, nunca se commitean) |
| `docs/adr/0002-pasarela-llm.md` | Enmienda con la elección de modelos de respaldo (T5) |
| `src/` | Sin cambios de comportamiento; solo configuración de modelos de respaldo (T5) |
| `CLAUDE.md` | Tabla de comandos: `npm run evals`, `npm run evals:anonimizar` |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El set dorado filtra datos personales al repo | Media | Anonimizador que falla si queda un patrón de PII (EVL5); revisión humana antes de commitear; P30 |
| Evals reales no deterministas dan falsos rojos | Media | Cada caso real corre 3 veces; umbral por aserción crítica (0 fallos) y resto (≥ 90 %) |
| El modo guionado da una falsa seguridad | Media | Documentado: el guionado prueba el arnés y las herramientas; el comportamiento del modelo solo lo prueba el modo real |
| Los JSON de casos sintéticos llevan PR3 (T3) por encima de ~400 líneas | Media | `size:exception` automática citando esta fila: son datos de casos, no lógica; ningún caso se recorta |
| Costo de la corrida real | Baja | ~30 casos × 3 × ~3 llamadas ≈ 0,20-0,50 USD con Luna; se imprime el costo; límite de gasto de OpenRouter (P32) |

## Rollback Plan

Revertir los PRs: no hay cambios de comportamiento en `src/`. La elección de modelos es configuración
(`LLM_CONVERSACION_MODELOS`) y vuelve al valor anterior cambiando la variable.

## Dependencies

- 07b cerrada.
- `[manual]`: clave de OpenRouter del usuario con límite de gasto (P32); acceso de lectura al Chatwoot
  del prototipo para extraer conversaciones (P30).

## Preguntas abiertas

| # | Pregunta | Bloquea | Recomendación |
|---|---|---|---|
| P30 | ¿Se autoriza extraer conversaciones reales del Chatwoot del prototipo para el set dorado, cuántas, quién las extrae y se commitean ya anonimizadas? | T4 `[manual]` (el resto avanza) | Sí: 20-30 conversaciones variadas, las lee el usuario con `GET` de la API de Chatwoot (solo lectura) hacia una carpeta ignorada por git, se anonimizan con el script y se revisan a mano antes de commitear |
| P32 | ¿Se autoriza el gasto de la corrida real y de la comparación de modelos, con qué límite en la consola de OpenRouter? | T4-T5 `[manual]` | Sí, con un límite de 2 USD para la sesión de evals, dentro del techo de 10 USD |

## Success Criteria

- [ ] `npm run evals` en verde en modo guionado, incluido en `npm run ci`.
- [ ] Cada aserción tiene un caso negativo que la hace fallar.
- [ ] Umbral escrito en el código y en esta spec.
- [ ] `[manual]` Corrida real con el resultado y el costo anotados en `tasks.md`.
- [ ] `[manual]` Set dorado anonimizado commiteado (si P30 lo autoriza).
- [ ] `[manual]` Modelos de respaldo elegidos con evidencia y fijados en configuración.
