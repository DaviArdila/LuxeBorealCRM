# Proveedores directos de LLM: Anthropic y retiro de OpenRouter

## Objetivo

Trabajar solo con proveedores directos (OpenAI y Anthropic). Se agrega el proveedor `anthropic` para usar
Claude Haiku 5.5 (`anthropic:claude-haiku-5-5`) y se retira OpenRouter.

## Problema y por qué

- OpenRouter cobra una comisión sobre los tokens y suma un intermediario que ve los datos de los clientes.
- La resiliencia (fallback entre modelos, reintentos, circuito) ya vive en el gateway (ADR-0013, ADR-0014), así que
  OpenRouter no aporta nada que el proyecto no tenga.
- Hoy un id sin prefijo registrado va a OpenRouter sin aviso, incluido el valor por defecto `openai/gpt-5.6-luna`.

## Alcance autorizado (dueño, 2026-10-13)

- Agregar el proveedor `anthropic` con `ANTHROPIC_API_KEY`.
- Retirar OpenRouter por completo: proveedor, dependencia, variables y tests.
- Un id de modelo sin prefijo de proveedor registrado pasa a ser error de arranque.
- ADR-0029 en estado `propuesta`; P37 actualizada.

Fuera de alcance: Google y el genérico compatible con OpenAI; precio propio de escritura de caché.

## Restricciones

- Un solo archivo importa cada SDK de proveedor (LLM20); el adaptador genérico es el único que importa `ai`.
- R2: el costo sale de `LLM_PRECIOS_USD_JSON`, nunca del proveedor. R14: sin contenido en logs.
- TDD con Vitest: RED observado, luego GREEN.
- Haiku 5.5 razona por defecto y ese razonamiento cuenta en `max_tokens`: se pide esfuerzo `low`.

## Entrega

Estrategia `auto-chain`, cadena `stacked-to-main`. Pronóstico: ~350 líneas el slice 1, ~400 el slice 2.

| Slice | Rama | Tareas |
|---|---|---|
| 1 | `feat/proveedores-directos-llm` | T1, T2 |
| 2 | `feat/proveedores-directos-llm-p2-retiro-openrouter` | T3 |

## Tareas

- [ ] **T1. Proveedor `anthropic`.** Archivo `proveedores/anthropic.ts`, registro en la lista y en la fábrica,
  `ANTHROPIC_API_KEY` en la configuración y en las evals, regla de fronteras, caché por punto de corte en el prompt
  de sistema, normalización del uso y esfuerzo `low`. Ruta: delegada (escritor único, 2+ archivos no triviales).
- [ ] **T2. Documentación del slice 1.** ADR-0029, P37, spec de dominio `llm`, guía de evals reales.
  Ruta: dentro del mismo escritor de T1.
- [x] **T3. Retiro de OpenRouter.** Proveedor, dependencia, variables, tests, ids sin prefijo como error, valores
  por defecto `openai:gpt-5.6-luna`, ADR-0002/0019 reemplazados en parte, SPEC.md y CLAUDE.md. Ruta: delegada.

- [x] **T4. Modelos vigentes.** El dueño pide quitar `gpt-5.6-luna`: por ahora solo `openai:gpt-6-luna` (por defecto)
  y `anthropic:claude-haiku-5-5`. Defaults de código, precios por defecto de los dos modelos, tests y documentos vivos.
  Precio de `gpt-6-luna` dado por el dueño: 0,10 / 0,50 / 0,01 USD por millón (escritura en caché 0,125, sin cobrar aparte).
  El `cache` de Haiku (0,01) sigue **pendiente de confirmar**. Ruta: delegada (mismo escritor).

## Comprobaciones

`npm run lint`, `typecheck`, `fronteras`, `contrato:deriva`, `commits` y Vitest `unit`, `integracion`, `e2e`,
`evals` dentro de `servicio/`. Falla conocida en Windows: `test/integracion/agente/prompts-build.spec.ts`.

Manual con clave real (el dueño): `EVALS_MODO=real LLM_EVALS_MODELOS=anthropic:claude-haiku-5-5 npm run evals`.

## Progreso

- 2026-10-13: rama `feat/proveedores-directos-llm` creada desde `main` (`cdbdb2a`).
- 2026-10-13, T1 y T2 (ruta delegada: escritor único; disparador: 2+ archivos no triviales). Implementados sin
  commit: faltan dos líneas fuera de las superficies autorizadas (ver «Bloqueos»).
  - Dependencia: `@ai-sdk/anthropic` 4.0.68, exacta. Es la versión que comparte `@ai-sdk/provider` 4.0.19 y
    `provider-utils` 5.0.51 con `ai` 7.0.122; no conoce `claude-haiku-5-5` por nombre y le aplica las capacidades
    genéricas de `claude-*` (razonamiento adaptativo, sin parámetros de muestreo), que coinciden con Haiku 5.5.
  - Verificado en el código del paquete: `providerOptions.anthropic.effort` → `output_config.effort`;
    `providerOptions.anthropic.cacheControl` en el mensaje de sistema → `cache_control` del bloque de sistema;
    `inputTokens` = sin caché + escritura + lectura, y la lectura en `inputTokenDetails.cacheReadTokens`.
  - Contrato `ProveedorLlm`: dos campos opcionales, `opcionesFijas` y `opcionesDelSistemaConCache`; OpenAI y
    OpenRouter no cambian.
  - RED observado: 11 tests fallando (anthropic, adaptador, fábrica, fronteras, resolver, configuración, evals).
    GREEN: unitarios 1824/1825 (falla `env-example.spec.ts`, ver «Bloqueos»); integración `test/integracion/llm`
    64/64 (incluye `proveedor-anthropic.spec.ts`, escrito después del GREEN); evals guionadas 49 + 1 omitido.
  - Lint, fronteras y `contrato:deriva` en verde; `typecheck` falla solo en `scripts/generar-contrato.ts`.
- 2026-10-13, T3 (ruta delegada: escritor único en el worktree `retiro-openrouter`; disparador: 2+ archivos no
  triviales). Rama `feat/proveedores-directos-llm-p2-retiro-openrouter` sobre `0e9bc28`.
  - Commits: `c3a60af` refactor(test): simulador de anthropic compartido; `58df800` feat(llm)!: retira openrouter
    y exige prefijo de proveedor registrado; el commit de documentación de ADR y P6/P38 que sigue.
  - RED observado: 24 tests de `resolverModelo` y configuración, 1 del enrutador y 4 de `leerModoEvals`. GREEN después.
  - Decisión: un id sin prefijo registrado es error (LLM26, nueva en `openspec/specs/llm/spec.md`). Los tests que
    componen `LlmModule` cablean el `SimuladorOpenAi` por DI sobre `ADAPTADOR_LLM` (`test/soporte/adaptador-llm-simulado.ts`):
    la URL de un proveedor directo no es configuración. `simulador-openrouter.ts` se borró: hablaba `chat/completions`
    y el proveedor `openai` usa la API Responses.
  - Comprobaciones: lint, typecheck, fronteras, `contrato:deriva` y commits en verde; integración 496/496; e2e
    122/122; evals guionadas 49 + 1 omitido; unitarios 1819/1821 (fallan los 2 de `env-example.spec.ts`, ver
    «Bloqueos»). `npm uninstall` solo quitó `@openrouter/ai-sdk-provider` del lockfile (15 líneas).

## Bloqueos

| Archivo | Línea que falta | Por qué no se hizo |
|---|---|---|
| `servicio/.env.example` | `ANTHROPIC_API_KEY=` junto a `OPENAI_API_KEY=` | El permiso de la herramienta niega leer y editar el archivo |
| `servicio/scripts/generar-contrato.ts` | `ANTHROPIC_API_KEY: '',` junto a `OPENAI_API_KEY` | Fuera de las superficies autorizadas del escritor |
| `servicio/.env.example` (T3, T4) | Quitar `OPENROUTER_API_KEY` y `OPENROUTER_BASE_URL` con sus comentarios; `openai:gpt-6-luna` (con dos puntos) en ambos perfiles y en las claves de `LLM_PRECIOS_USD_JSON`, con los precios del dueño (ver el JSON exacto en el reporte de T4) | El permiso de la herramienta niega leer y editar el archivo |
| `servicio/src/plataforma/config/env-example.spec.ts:41` (T3) | Hecho en T4: espera `['openai:gpt-6-luna']` | — |

## Siguiente paso

Agregar las dos líneas de «Bloqueos», repetir `typecheck` y `npm test`, y hacer los dos commits del slice 1
(`feat(llm): proveedor anthropic directo` y `docs(adr): ADR-0029 proveedores directos de LLM`). Después, T3.
