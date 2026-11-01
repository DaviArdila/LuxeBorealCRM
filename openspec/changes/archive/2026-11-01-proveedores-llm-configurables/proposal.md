# Proposal: Proveedores de LLM configurables (conexión directa)

- Change: `proveedores-llm-configurables` (mantenimiento posterior a la Fase 08, no es una fase) ·
  Fecha: 2026-09-30 · Estado: **aprobada** (ADR-0019 aceptado el 2026-09-30; alcance inicial OpenAI)
- Depende de: Fase 06 (pasarela LLM) y 07c (evals). Toca `modulos/llm`, `plataforma/config` y la
  regla de fronteras. No toca esquema Prisma ni contrato HTTP.
- Decisión de fondo: `docs/adr/0019-proveedores-llm-configurables.md` (**aceptada** el 2026-09-30).

## Intent

OpenRouter cobra una comisión (aceptada como costo en ADR-0002) y hoy es el único camino:
`llm.module.ts` enlaza fijo `AdaptadorOpenRouter`. El usuario quiere configurar cualquier proveedor
con su propia clave y conectarse directo. **Alcance inicial (P37, 2026-09-30): OpenAI**; Anthropic,
Google y el genérico compatible quedan pospuestos, no descartados. El gateway ya depende de
un puerto, así que el cambio es de composición y de un adaptador por proveedor.

## Alcance

### Dentro

1. Prefijo `<proveedor>:<modelo>` en los ids de modelo; sin prefijo = OpenRouter (D2).
2. Registro de proveedores y un enrutador que implementa `AdaptadorLlm` (D1, D3).
3. Adaptador genérico sobre `ai` con el OpenRouter actual como primer proveedor, sin cambio de
   comportamiento (D1).
4. Un proveedor directo: **OpenAI** (P37). El registro queda abierto para sumar otros después sin
   tocar el gateway.
5. Claves por proveedor, validadas en producción solo si el proveedor se usa (D4).
6. El `proveedor` real en cada fila de `uso_llm` (hoy es la constante `'openrouter'`).
7. Fronteras: la regla `ai-solo-en-infraestructura-llm` cubre `@ai-sdk/`.
8. Delta de la spec `llm` (LLM15-LLM24 nuevos y LLM11 modificado).

### Fuera de alcance

| Qué | Dónde |
|---|---|
| Proveedores Anthropic, Google y compatible con `baseURL` propia (T5-T7) | **Pospuestos** (P37: solo OpenAI por ahora); se retoman cuando el usuario los pida |
| Elegir el modelo de OpenAI y sus precios | `gpt-5.6-luna` sigue como candidato principal; su id directo y sus precios los carga el usuario (a verificar en T4) |
| Implementar el nivel 2 (`ULTIMO_RECURSO_LLM`) | Sigue pospuesto (Q4 de la Fase 06); el fallback entre proveedores se logra mezclando prefijos |
| Guardar las claves en base de datos o editarlas desde el CRM | Solo si el usuario lo pide más adelante (P39 resuelta: `.env`) |
| Cambios en `LlmPort`, el gateway (resiliencia, techo), R1/R2 | Sin cambio |
| Pantalla de selección de proveedor | Fase 11/14 |
| Cambiar el modelo principal | Se decide con las evals (T10) |

## Qué se migra del prototipo

No aplica: el prototipo no tenía pasarela con proveedores intercambiables.

## Capabilities

### New / Modified Capabilities

- `llm`: LLM15-LLM24 nuevos; **LLM11 modificado** (el aislamiento de SDK pasa de «OpenRouter» a
  «todo SDK de proveedor»).

## Approach

Diez tareas con TDD estricto (`tasks.md`): función pura de resolución, configuración, adaptador
genérico con OpenRouter, el proveedor OpenAI (T4), cableado y fronteras, documentación y una corrida
real de evals `[manual]`. T5-T7 (Anthropic, Google, compatible) quedan pospuestas (P37).

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
| Cada proveedor reporta la caché distinto y el costo estimado queda mal | Normalización por adaptador con test por proveedor (LLM18); verificación contra la API real en T1/T4 |
| Un id `openai/...` de OpenRouter se confunde con un proveedor directo | Prefijo `:` y solo proveedores registrados cuentan (LLM16) |
| Cambiar de modelo empeora al agente | Nada pasa a principal sin evals (T10); OpenRouter sigue por defecto |
| Una clave mal escrita solo se descubre en producción | Validación de arranque por proveedor usado (LLM17) |
| El SDK cambia entre versiones (`ai` 7.0.122) | Las APIs no se dan por sabidas: se verifican en T1 y se fijan versiones exactas |
| Datos de clientes a un proveedor con condiciones que el usuario no revisó (R14) | el usuario eligió OpenAI (P37); ningún proveedor se activa sin configuración explícita |

## Plan de rollback

OpenRouter sigue siendo el valor por defecto: **sin configuración nueva el comportamiento es idéntico
al actual**. Para volver atrás basta quitar los prefijos y las claves nuevas del entorno. Sin migración
ni datos que deshacer; las filas de `uso_llm` con otro `proveedor` siguen siendo válidas. En última
instancia, revertir los PRs.

## Preguntas

Detalle en `docs/PREGUNTAS_ABIERTAS.md`.

| # | Pregunta | Estado |
|---|---|---|
| P37 | ¿Qué proveedores y modelos concretos? | **Resuelta:** OpenAI, solo ese por ahora; `gpt-5.6-luna` como candidato |
| P38 | ¿OpenRouter queda como respaldo? | **Resuelta:** sí (recomendación aceptada al aprobar el ADR-0019) |
| P39 | ¿La clave vive en `.env` o en base de datos? | **Resuelta:** `.env` (recomendación aceptada al aprobar el ADR-0019) |
| P40 | ¿Se autoriza el gasto de la corrida real de evals con la clave de OpenAI y con qué límite? | **Resuelta (2026-09-30):** sí, con límite de 2 USD para la sesión (criterio de P32); T10 `[manual]` solo espera al usuario |

T1-T4, T8 y T9 no dependían de P40.

## Criterios de éxito

- [ ] Sin cambios de entorno, el sistema se comporta exactamente como hoy (OpenRouter).
- [ ] Un modelo con prefijo se llama directo, y su fila de `uso_llm` lleva ese proveedor.
- [ ] Sin la clave de un proveedor usado, producción no arranca y el error nombra la variable.
- [ ] `npm run verify` en verde; cada escenario nuevo o modificado tiene su test `<ID> — <título>`.
- [ ] La corrida real de evals del modelo de OpenAI elegido queda registrada (T10).
