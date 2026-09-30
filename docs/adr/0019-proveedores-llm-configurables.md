# 0019. Proveedores de LLM configurables: conexión directa además de OpenRouter

- Estado: propuesta
- Fecha: 2026-09-30

## Resumen

Hoy la pasarela solo habla con OpenRouter, que cobra una comisión. Se propone poder elegir el
proveedor **por modelo, con configuración**: cada modelo del perfil puede llevar un prefijo de
proveedor y se conecta directo con su clave. Sin prefijo sigue siendo OpenRouter, así que **nada cambia
hasta que el usuario configure algo nuevo**. Recomendación: **alternativa D** (híbrido).

## Contexto

- ADR-0002 eligió OpenRouter y aceptó como costo «la comisión y la latencia extra de OpenRouter» y
  un tercero más en el camino de los datos. El usuario ahora quiere evitar esa comisión. La cuantía
  no está medida en el repo: **a verificar** con la factura real antes de dar por buena la ganancia.
- `src/modulos/llm/llm.module.ts` enlaza fijo `ADAPTADOR_LLM → AdaptadorOpenRouter`.
- `AdaptadorOpenRouter` es el único archivo que importa `ai` y `@openrouter/ai-sdk-provider` (LLM11).
  Lee la caché de un metadato propio de OpenRouter (`openrouter.usage.promptTokensDetails`) y pide
  `usage: { include: true }`.
- El gateway (`llm-gateway.ts`) ya depende del puerto `AdaptadorLlm`, no de OpenRouter. Pero fija el
  texto `'openrouter'` como `proveedor` de cada fila de `uso_llm`.
- La configuración solo conoce `OPENROUTER_API_KEY` y `OPENROUTER_BASE_URL`; los precios salen de
  `LLM_PRECIOS_USD_JSON` por id de modelo.
- ADR-0002 y ADR-0014 nombran un «respaldo nivel 2: proveedor directo, opcional» que **no está
  implementado**: existe solo el punto de extensión `ULTIMO_RECURSO_LLM`.
- Los ids de OpenRouter ya llevan una barra (`openai/gpt-5.6-luna`), por eso `proveedor/modelo` sería
  ambiguo (ver Decisión, punto 2).

## Alternativas

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | Mantener solo OpenRouter | Cero trabajo; una clave; fallback multi-proveedor con una cuenta | La comisión sigue; el usuario ya dijo que no la quiere |
| B | Un adaptador directo por proveedor (OpenAI, Anthropic, Google…), elegido por configuración, sobre el AI SDK | Sin comisión; metadatos completos de cada proveedor (caché, razonamiento); sin intermediario para los datos | Un paquete `@ai-sdk/*` y un archivo por proveedor; cada uno con su forma de reportar la caché |
| C | Un solo adaptador «compatible con OpenAI» con `baseURL` y clave configurables | Lo más barato de construir; sirve a OpenAI y a muchos otros que exponen ese formato | Pierde lo propio de cada proveedor (p. ej. caché explícita de Anthropic, firmas de razonamiento de Gemini); el reporte de caché depende de cada servicio |
| D | B + C: adaptadores nativos para los proveedores elegidos y el genérico para el resto | Directo donde importa, genérico donde basta; se agrega un proveedor sin tocar el gateway | Un poco más de superficie que C solo |

## Decisión (propuesta: alternativa D)

1. **Un registro de proveedores** en `modulos/llm/infraestructura/`. Cada proveedor es un archivo que
   es el único que importa su SDK (extiende LLM11). El mapeo de mensajes y herramientas, el
   `generateText` y la clasificación de errores viven una sola vez en un adaptador genérico sobre `ai`.
2. **Prefijo `<proveedor>:<modelo>`** en los ids de `LLM_*_MODELOS` y en `LLM_PRECIOS_USD_JSON`
   (p. ej. `openai:gpt-5.6-luna`). Se propone `:` y no `/` porque los ids de OpenRouter ya contienen
   `/`. Solo cuenta como prefijo un proveedor **registrado**; un id **sin prefijo** es OpenRouter, como
   hoy. Un prefijo desconocido es error de arranque.
3. **Un enrutador** implementa el mismo puerto `AdaptadorLlm` y delega según el prefijo. El gateway y
   `LlmPort` no cambian de forma; el gateway solo deja de fijar `'openrouter'` y toma el proveedor del
   id resuelto por una función pura.
4. **Secretos por proveedor** (`OPENAI_API_KEY`, etc.), validados en producción **solo** para los
   proveedores que algún perfil usa.
5. **Costo desde `LLM_PRECIOS_USD_JSON`** con el id completo; el `cost` que devuelva un proveedor nunca
   decide (R2, R13).
6. **El fallback entre proveedores es el del gateway** (ADR-0014): un perfil puede mezclar prefijos y el
   gateway ya itera los modelos en orden. El nivel 2 (`ULTIMO_RECURSO_LLM`) sigue sin implementarse.

Los proveedores y modelos concretos, si OpenRouter queda como respaldo y dónde vive la clave son
**decisión del usuario** (P37-P40 en `docs/PREGUNTAS_ABIERTAS.md`); este ADR no las toma.

## Qué NO cambia

| Se mantiene | Por qué |
|---|---|
| Puerto `LlmPort` y `AdaptadorLlm` (`generarConModelo`) | El cambio es de composición, no de contrato |
| Gateway: timeout, reintento, circuito, techo, `uso_llm` | Siguen siendo del gateway (ADR-0002, ADR-0013, ADR-0014) |
| R1 y R2 | El gateway sigue transportando herramientas sin interpretarlas ni calcular dinero |
| Reintentos solo en el gateway | Ningún adaptador nuevo reintenta |
| OpenRouter como valor por defecto | Sin configuración nueva, el comportamiento es idéntico al actual |

## Consecuencias

| Tema | Efecto |
|---|---|
| Caché y uso | Cada proveedor reporta la caché a su manera; cada adaptador la normaliza a `UsoReportado` (`tokensEntrada` sin la caché, `tokensSalida`, `tokensCache`). Cómo la expone cada SDK: **a verificar en T1/T4-T7** |
| Precios | Hay que cargar el precio de cada modelo nuevo en `LLM_PRECIOS_USD_JSON`; ya es obligatorio para arrancar. Los precios no se inventan: los pone el usuario |
| Prefijo | Ver Decisión, punto 2. Los ids de OpenRouter existentes no se tocan |
| Secretos | Una clave por proveedor usado; nunca en logs; sin clave del proveedor usado no se arranca en producción |
| Evals | Cada modelo nuevo se valida con las evals antes de ser principal; la corrida real gasta con la clave del usuario (`[manual]`) |
| Fallback | Con OpenRouter, una clave daba acceso a todos los modelos de respaldo. Directo, cada respaldo de otro proveedor pide su propia cuenta y clave. El respaldo entre proveedores se logra mezclando prefijos en el perfil |
| Circuito | Sigue siendo por modelo (ADR-0013): la caída de un proveedor abre el circuito de cada uno de sus modelos por separado |
| Datos y R14 | Se quita un intermediario, pero cada proveedor directo tiene sus propias condiciones de retención y uso de datos: el usuario decide cuáles acepta (P37). Los logs siguen sin contenido ni PII |
| Fronteras | La regla `ai-solo-en-infraestructura-llm` de `.dependency-cruiser.cjs` se amplía a `@ai-sdk/` |
| ADR-0002 y ADR-0014 | **No se editan ahora.** Al aceptar este ADR se matizarán (0002: «costo aceptado» y «nivel 2» ya no dependen solo de OpenRouter; 0014: el fallback nivel 1 puede cruzar proveedores), con la nota «matiza» que ya usa el índice |
| Reversión | Quitar la configuración nueva devuelve el comportamiento actual; el código de OpenRouter no se elimina |

## Fuentes

- [0002](0002-pasarela-llm.md), [0013](0013-cortacircuitos-en-memoria-pasarela-llm.md),
  [0014](0014-fallback-llm-iterado-en-gateway.md).
- `src/modulos/llm/llm.module.ts`, `infraestructura/adaptador-openrouter.ts`, `puertos/adaptador-llm.ts`.
- `openspec/changes/proveedores-llm-configurables/` (proposal, spec, design, tasks).
- Documentación del AI SDK y de cada proveedor: **a verificar en T1** contra la versión instalada
  (`ai` 7.0.122).
