# 0029. Solo proveedores directos de LLM: se agrega Anthropic y se retira OpenRouter (matiza 0002 y 0019)

- Estado: propuesta
- Fecha: 2026-10-13

## Resumen

La pasarela trabaja solo con proveedores directos: **OpenAI** y **Anthropic**. Se agrega ya el proveedor `anthropic`
(id `anthropic:claude-haiku-5-5` para las pruebas) y, en el slice siguiente, se retira OpenRouter. Desde ese retiro,
un id de modelo sin prefijo de proveedor registrado es un **error de arranque**, no una llamada a OpenRouter.

| Slice | Qué cambia | Estado |
|---|---|---|
| 1 | Proveedor `anthropic`, `ANTHROPIC_API_KEY`, caché por punto de corte, esfuerzo `low` | este ADR |
| 2 | Retiro de OpenRouter: proveedor, dependencia, variables y tests; ids sin prefijo como error; valores por defecto `openai:gpt-6-luna` | hecho (T3 de `odd/tasks/proveedores-directos-llm.md`) |

## Contexto

- ADR-0019 dejó OpenRouter como valor por defecto y sumó OpenAI directo. Anthropic quedó pospuesto (P37).
- OpenRouter cobra una comisión sobre los tokens y es un intermediario más que ve los mensajes de los clientes (R14).
- El fallback entre modelos, el reintento y el circuito ya viven en el gateway (ADR-0013, ADR-0014): OpenRouter no
  aporta resiliencia que el proyecto no tenga.
- Hoy un id sin prefijo registrado va a OpenRouter sin aviso, incluido el valor por defecto `openai/gpt-5.6-luna`.
- Anthropic no tiene una clave de caché como `prompt_cache_key` de OpenAI: la caché se pide con un punto de corte
  `cache_control` en un bloque del prompt. El paquete `@ai-sdk/anthropic` 4.0.68 lo acepta en el mensaje de sistema.
- Claude Haiku 5.5 razona por defecto (esfuerzo `medium`) y ese razonamiento cuenta dentro de `max_tokens`, que en el
  perfil de conversación es 400. No acepta presupuesto de razonamiento (`budget_tokens`) ni `temperature` distinta de
  la de por defecto.

## Alternativas

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | Agregar Anthropic y retirar OpenRouter | Sin comisión; un intermediario menos; un id ambiguo deja de llamar a un tercero en silencio | Se pierde probar un modelo nuevo sin cuenta propia; retirar toca configuración, tests y documentos |
| B | Agregar Anthropic y dejar OpenRouter dormido (sin uso, pero disponible) | Probar modelos sigue a un cambio de configuración | Una dependencia, dos variables y su código se mantienen sin uso; el id sin prefijo sigue yendo a OpenRouter |
| C | Agregar Anthropic y mantener OpenRouter como valor por defecto | Ningún cambio para quien ya lo usa | La comisión sigue en el camino por defecto, que el dueño ya dijo que no quiere |

## Decisión

Se elige **A**:

1. El proveedor `anthropic` vive en `proveedores/anthropic.ts`, único archivo que importa `@ai-sdk/anthropic` (LLM20).
   La clave y la URL de la API se entregan explícitas, así el SDK no lee el entorno del proceso.
2. Cada llamada a Anthropic pide `effort: 'low'`. No se envía presupuesto de razonamiento ni `temperature`.
3. Con `claveCache`, el prompt de sistema lleva `cacheControl: { type: 'ephemeral' }`. La clave solo decide si se marca
   el punto de corte; nunca viaja al proveedor.
4. El uso sigue LLM18: la lectura de caché va a `tokensCache` y la escritura en caché queda dentro de `tokensEntrada`.
5. El precio sale de `LLM_PRECIOS_USD_JSON` (R2). El código no fija precios de Anthropic.
6. En el slice siguiente se retira OpenRouter y un id sin prefijo registrado pasa a ser error de arranque.
7. **Modelos vigentes (dueño, 2026-10-13):** por ahora el proyecto usa solo `openai:gpt-6-luna` y
   `anthropic:claude-haiku-5-5`; `gpt-5.6-luna` se retira. `openai:gpt-6-luna` es el valor por defecto de ambos
   perfiles y `LLM_PRECIOS_USD_JSON` lleva por defecto el precio de los dos. El precio de `gpt-6-luna` lo dio el dueño
   (0,10 / 0,50 / 0,01 USD por millón; la escritura en caché, 0,125, no se cobra aparte). **El dueño confirmó el
   2026-10-14** el precio de caché de Haiku: lectura 0,01 USD y escritura 0,125 (1,25 veces la entrada), esta última
   sin modelar en la tabla de precios.

## Consecuencias

- Gana: sin comisión de intermediario y un tercero menos con acceso a los datos de los clientes.
- Paga: probar un modelo de otro proveedor exige una cuenta y una clave propias con ese proveedor.
- Paga: la escritura en caché se registra al precio de entrada, aunque Anthropic la cobra a 1,25 veces. El costo
  registrado queda un poco por debajo del real; un precio propio de escritura queda fuera de alcance.
- Paga: el historial del dominio no guarda los bloques de razonamiento. En una vuelta de herramientas, el modelo sigue
  sin el razonamiento de la vuelta anterior; la API lo acepta.
- Obligatorio desde ahora: `ANTHROPIC_API_KEY` en production cuando un perfil usa `anthropic:` (LLM17).
- Desde el slice 2: prohibido un id de modelo sin prefijo de proveedor registrado. ADR-0002 y ADR-0019 quedan
  matizados en lo que dicen de OpenRouter.
