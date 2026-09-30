# Proposal: Proveedores de LLM configurables (conexión directa)

- Change: `proveedores-llm-configurables` (mantenimiento posterior a la Fase 08, no es una fase) ·
  Fecha: 2026-09-30 · Estado: **spec en revisión** (redactada, pendiente de aprobación del usuario)
- Depende de: Fase 06 (pasarela LLM) y 07c (evals). Toca `modulos/llm`, `plataforma/config` y la
  regla de fronteras. No toca esquema Prisma ni contrato HTTP.
- Decisión de fondo: `docs/adr/0019-proveedores-llm-configurables.md` (**propuesta**).

## Intent

OpenRouter cobra una comisión (aceptada como costo en ADR-0002) y hoy es el único camino:
`llm.module.ts` enlaza fijo `AdaptadorOpenRouter`. El usuario quiere configurar cualquier proveedor
con su propia clave (OpenAI, Anthropic, Google, otros) y conectarse directo. El gateway ya depende de
un puerto, así que el cambio es de composición y de un adaptador por proveedor.

## Alcance

### Dentro

1. Prefijo `<proveedor>:<modelo>` en los ids de modelo; sin prefijo = OpenRouter (D2).
2. Registro de proveedores y un enrutador que implementa `AdaptadorLlm` (D1, D3).
3. Adaptador genérico sobre `ai` con el OpenRouter actual como primer proveedor, sin cambio de
   comportamiento (D1).
4. Proveedores directos que el usuario elija (P37): candidatos OpenAI, Anthropic, Google y un
   endpoint compatible con OpenAI con `baseURL` propia.
5. Claves por proveedor, validadas en producción solo si el proveedor se usa (D4).
6. El `proveedor` real en cada fila de `uso_llm` (hoy es la constante `'openrouter'`).
7. Fronteras: la regla `ai-solo-en-infraestructura-llm` cubre `@ai-sdk/`.
8. Delta de la spec `llm` (LLM15-LLM24 nuevos y LLM11 modificado).

### Fuera de alcance

| Qué | Dónde |
|---|---|
| Elegir proveedores y modelos concretos, y sus precios | Decisión del usuario (P37); los precios los pone él |
| Implementar el nivel 2 (`ULTIMO_RECURSO_LLM`) | Sigue pospuesto (Q4 de la Fase 06); el fallback entre proveedores se logra mezclando prefijos |
| Guardar las claves en base de datos o editarlas desde el CRM | Solo si el usuario lo pide (P39); hoy son entorno |
| Cambios en `LlmPort`, el gateway (resiliencia, techo), R1/R2 | Sin cambio |
| Pantalla de selección de proveedor | Fase 11/14 |
| Cambiar el modelo principal | Se decide con las evals (P37, T10) |

## Qué se migra del prototipo

No aplica: el prototipo no tenía pasarela con proveedores intercambiables.

## Capabilities

### New / Modified Capabilities

- `llm`: LLM15-LLM24 nuevos; **LLM11 modificado** (el aislamiento de SDK pasa de «OpenRouter» a
  «todo SDK de proveedor»).

## Approach

Diez tareas con TDD estricto (`tasks.md`): función pura de resolución, configuración, adaptador
genérico con OpenRouter, un proveedor por tarea, cableado y fronteras, documentación y una corrida
real de evals `[manual]`. Los proveedores de T4-T7 se implementan **solo si P37 los incluye**.

## Areas afectadas

| Área | Impacto |
|---|---|
| `src/modulos/llm/dominio/` | Nuevo `resolver-modelo.ts` |
| `src/modulos/llm/infraestructura/` | Adaptador genérico, enrutador y un archivo por proveedor |
| `src/modulos/llm/aplicacion/llm-gateway.ts` | El `proveedor` de la fila sale del id resuelto |
| `src/modulos/llm/llm.module.ts` | Enlaza el enrutador en lugar del adaptador fijo |
| `src/plataforma/config/esquema.ts`, `.env.example` | Variables por proveedor |
| `.dependency-cruiser.cjs`, `package.json` | Regla de fronteras y dependencias `@ai-sdk/*` |
| `test/evals/soporte/modo-evals.ts` | Deja de exigir solo `OPENROUTER_API_KEY` |
| `prisma/`, `openapi/` | Sin cambio (`uso_llm.proveedor` ya es texto) |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cada proveedor reporta la caché distinto y el costo estimado queda mal | Normalización por adaptador con test por proveedor (LLM18); verificación contra la API real en T1/T4-T7 |
| Un id `openai/...` de OpenRouter se confunde con un proveedor directo | Prefijo `:` y solo proveedores registrados cuentan (LLM16) |
| Cambiar de modelo empeora al agente | Nada pasa a principal sin evals (T10); OpenRouter sigue por defecto |
| Una clave mal escrita solo se descubre en producción | Validación de arranque por proveedor usado (LLM17) |
| El SDK cambia entre versiones (`ai` 7.0.122) | Las APIs no se dan por sabidas: se verifican en T1 y se fijan versiones exactas |
| Datos de clientes a un proveedor con condiciones que el usuario no revisó (R14) | P37 pide aceptar cada proveedor; ningún proveedor se activa sin configuración explícita |

## Plan de rollback

OpenRouter sigue siendo el valor por defecto: **sin configuración nueva el comportamiento es idéntico
al actual**. Para volver atrás basta quitar los prefijos y las claves nuevas del entorno. Sin migración
ni datos que deshacer; las filas de `uso_llm` con otro `proveedor` siguen siendo válidas. En última
instancia, revertir los PRs.

## Preguntas abiertas bloqueantes

Detalle y recomendación de cada una en `docs/PREGUNTAS_ABIERTAS.md`.

| # | Pregunta | Bloquea |
|---|---|---|
| P37 | ¿Qué proveedores y modelos concretos, y se aceptan sus condiciones de datos (R14)? | T4-T7 (qué adaptadores) y T10 |
| P38 | ¿OpenRouter queda como respaldo o se reemplaza del todo? | T8 (perfiles de ejemplo) y el fallback |
| P39 | ¿La clave vive en `.env` o en base de datos? | T2 (si es base, el alcance crece) |
| P40 | ¿Se autoriza el gasto de la corrida real de evals con la clave del proveedor directo y con qué límite? | T10 `[manual]` |

T1-T3 y T8-T9 no dependen de las respuestas.

## Criterios de éxito

- [ ] Sin cambios de entorno, el sistema se comporta exactamente como hoy (OpenRouter).
- [ ] Un modelo con prefijo se llama directo, y su fila de `uso_llm` lleva ese proveedor.
- [ ] Sin la clave de un proveedor usado, producción no arranca y el error nombra la variable.
- [ ] `npm run verify` en verde; cada escenario nuevo o modificado tiene su test `<ID> — <título>`.
- [ ] La corrida real de evals del modelo elegido queda registrada (T10).
