# 0002. Pasarela de LLM: puerto propio + AI SDK sobre OpenRouter, GPT-5.6 Luna como principal

- Estado: aceptada
- Fecha: 2026-09-22

## Contexto

El prototipo tiene una interfaz `LlmClient` correcta y dos clientes escritos a mano (Gemini con SDK,
xAI con `fetch`), cada uno con su mapeo de mensajes, su reintento copiado y variables propias. Gemini
no reintenta timeouts (causa de fallos reales el 2026-09-22); xAI convierte argumentos inválidos en
`{}` en silencio. No hay fallback entre proveedores, ni registro de costo, ni evals. El usuario quiere
un modelo pequeño y barato como principal y poder cambiar de modelo si uno se cae (P6).

## Alternativas

1. Seguir con clientes a mano por proveedor.
2. AI SDK (`ai`) detrás del puerto propio, con proveedores directos.
3. AI SDK detrás del puerto propio, con **OpenRouter** como proveedor (una API para todos los modelos,
   fallback entre modelos del lado del servidor).
4. Proxy LiteLLM autoalojado.

Comparación en `docs/analisis/02-investigacion.md` §3.

## Decisión

- **Capas**: `LlmPort` (tipos propios, en el dominio del agente) → `LlmGateway` (timeout, reintento,
  circuit breaker, registro de uso y costo en `uso_llm`, trazas) → un adaptador sobre el AI SDK con
  `@openrouter/ai-sdk-provider`.
- **Modelo principal**: `openai/gpt-5.6-luna` (0,20 USD entrada / 1,20 USD salida por millón de
  tokens; soporta tools y salida estructurada; lectura de caché a 0,02).
- **Respaldo en dos niveles**:
  1. OpenRouter: parámetro `models` con la lista en orden de prioridad; si todos los proveedores del
     primero fallan (caída, límite de uso, moderación), OpenRouter prueba el siguiente.
  2. Gateway propio: si OpenRouter entero falla, un proveedor directo configurado como último recurso
     (opcional, se decide en la Fase 06).
- **Configuración por perfil** (`conversacion`, `evals`): lista de modelos, timeout, `max_tokens`,
  reintentos. Cambiar de modelo es cambiar configuración y correr las evals.
- **Caché de prompts**: prefijo estable (reglas + herramientas + catálogo) antes de lo variable.

## Consecuencias

- Una sola clave y una sola factura (OpenRouter); cambiar de modelo no requiere cuentas nuevas.
- Costo aceptado: la comisión y la latencia extra de OpenRouter, y que los datos pasan por un
  tercero más.
- Los modelos de respaldo concretos se eligen en la Fase 07 con las evals (un modelo de otra empresa
  como segundo, para no caer con el mismo proveedor).
- Prohibido: importar SDKs de proveedores fuera de `modulos/llm/infraestructura`; reintentos dentro
  de adaptadores; convertir en silencio argumentos de herramientas inválidos.

## Fuentes

- [GPT-5.6 Luna — OpenAI](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [GPT-5.6 Luna — OpenRouter](https://openrouter.ai/openai/gpt-5.6-luna)
- [Model fallbacks — OpenRouter](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [OpenRouter provider para el AI SDK](https://github.com/OpenRouterTeam/ai-sdk-provider)
