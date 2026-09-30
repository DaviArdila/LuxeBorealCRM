# Design: Proveedores de LLM configurables

- Change: `proveedores-llm-configurables` · Fecha: 2026-09-30 · Estado: spec en revisión
- ADR: `docs/adr/0019-proveedores-llm-configurables.md` (propuesta). Referencias: ADR-0002, ADR-0013,
  ADR-0014, R1, R2, R13, R14, R15.
- Módulos tocados: `llm` (todo el cambio), `plataforma/config`. Ningún otro módulo importa nada nuevo:
  el barril `modulos/llm/index.ts` no cambia.

## Decisiones

### D1 — Adaptador genérico sobre `ai` + un archivo por proveedor

**Alternativas:** (a) una clase de adaptador por proveedor, duplicando mapeo y clasificación; (b) un
adaptador genérico que recibe una **fábrica de modelo** por proveedor. **Se elige (b).**

El adaptador genérico (`adaptador-ai-sdk.ts`) es el único que importa `ai`: mapea mensajes y
herramientas, llama a `generateText` con `maxRetries: 0` y clasifica errores (código actual de
`AdaptadorOpenRouter`, movido). Cada proveedor es un archivo que importa **solo su SDK** y expone
`ProveedorLlm` (D3). El código de `adaptador-openrouter.ts` se conserva como el archivo de proveedor
OpenRouter (con su `usage: { include: true }` y la lectura de `openrouter.usage`).

### D2 — Sintaxis del id: `<proveedor>:<modelo>`

**Alternativas:** (a) `proveedor/modelo`; (b) `proveedor:modelo`; (c) variable aparte
`LLM_PROVEEDOR` global.

- (a) choca con OpenRouter: `openai/gpt-5.6-luna` **ya** es un id válido de OpenRouter en la config y en
  `LLM_PRECIOS_USD_JSON`; interpretarlo como «proveedor `openai`» cambiaría el comportamiento actual.
- (c) obliga a un solo proveedor por proceso y elimina el fallback entre proveedores.
- **Se elige (b).** Regla (LLM16): el prefijo cuenta solo si es un proveedor registrado y no contiene
  `/`; se corta en la **primera** `:`. Sin prefijo → `openrouter`. Los sufijos de OpenRouter
  (`:free`, `:nitro`) no chocan porque su parte previa contiene `/`.
- Es una desviación consciente de la escritura `proveedor/modelo` que se comentó al pedir el cambio;
  se señala para que el usuario la confirme al revisar (no es una decisión de negocio).

Función pura `resolverModelo(id): { proveedor, modelo }` en `dominio/resolver-modelo.ts`; la usan el
enrutador y el gateway.

### D3 — Forma del proveedor y del enrutador

```ts
// puertos o infraestructura: interno del módulo, no sale en el barril
interface ProveedorLlm {
  readonly nombre: string;                       // 'openrouter' | 'openai' | ...
  crearModelo(modelo: string): unknown;          // LanguageModel del AI SDK (tipo exacto: a verificar en T1)
  normalizarUso(usoSdk, metadatos): UsoReportado; // LLM18
}
```

`AdaptadorEnrutador implements AdaptadorLlm`: `generarConModelo(id, ...)` resuelve con
`resolverModelo`, busca el proveedor en un `Map` y delega en `AdaptadorAiSdk`. Un proveedor sin
registrar en tiempo de ejecución es imposible: la config ya lo rechazó al arrancar (LLM16).

`AdaptadorAiSdk` recibe el `ProveedorLlm` en cada llamada; no guarda estado por proveedor.

### D4 — Configuración nueva

| Variable | Uso | Regla |
|---|---|---|
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | Sin cambio | Obligatoria en producción solo si un modelo la usa |
| `OPENAI_API_KEY` | Proveedor `openai` | Obligatoria en producción solo si un perfil usa `openai:` |
| `ANTHROPIC_API_KEY` | Proveedor `anthropic` | Ídem |
| `GOOGLE_API_KEY` | Proveedor `google` (nombre exacto del env del SDK: a verificar en T1) | Ídem |
| `LLM_COMPATIBLE_API_KEY`, `LLM_COMPATIBLE_BASE_URL` | Proveedor `compatible` (endpoint tipo OpenAI) | Ídem; la URL es obligatoria si se usa |

Los nombres de variable se confirman con P37 (solo existen las de los proveedores que el usuario
elija). `LLM_*_MODELOS` y `LLM_PRECIOS_USD_JSON` mantienen su forma; cambian los ids (con prefijo). En
`esquema.ts` el `superRefine` existente gana: (1) prefijos válidos (LLM16), (2) clave por proveedor
usado en producción (LLM17), (3) precio para cada modelo de perfil (ya existe, LLM19). `process.env`
sigue leyéndose solo en `plataforma/config`.

El listado de proveedores registrados se declara **una sola vez** en `dominio/` (constante) para que la
config y el enrutador no diverjan.

### D5 — El gateway y `uso_llm`

Cambio mínimo: reemplazar la constante `PROVEEDOR = 'openrouter'` de `llm-gateway.ts` por
`resolverModelo(modelo).proveedor` al armar cada fila (éxito o fallo). No hay cambio de esquema:
`uso_llm.proveedor` ya es texto. El costo sigue usando `LLM_PRECIOS_USD_JSON[modelo]` con el id
configurado completo (LLM19). El circuito sigue siendo por modelo (ADR-0013), sin cambio.

### D6 — Fallback entre proveedores

Sin código nuevo en el gateway: mezclar prefijos en `LLM_CONVERSACION_MODELOS` ya produce el recorrido
de LLM21 porque ADR-0014 itera por modelo. `ULTIMO_RECURSO_LLM` queda sin implementar. Riesgo
conocido: el circuito es por modelo, así que una caída total de un proveedor gasta hasta 5 fallos por
cada uno de sus modelos antes de abrirlos (acotado por el timeout y por el presupuesto del turno,
ADR-0018). No se cambia aquí; si molesta, se abre un ADR aparte (circuito por proveedor).

### D7 — Qué proveedores se implementan

**Alternativas:** implementar OpenAI, Anthropic y Google nativos + genérico; o solo el genérico
(alternativa C del ADR). **Se decide con P37.** El plan asume el híbrido (D del ADR): cada proveedor
elegido es una tarea (T4-T7) y solo se ejecuta si el usuario lo incluye. El paquete de cada uno se
instala con versión exacta y su API se verifica en T1/T4-T7 contra la documentación y la versión
instalada (`ai` 7.0.122); los nombres `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` y
`@ai-sdk/openai-compatible` son la expectativa y **se confirman en T1** (no se dan por sabidos).

### D8 — Uso y caché por proveedor

El AI SDK ya expone el uso normalizado (`usage.inputTokens`, `outputTokens`,
`inputTokenDetails.cacheReadTokens`), que el adaptador actual usa como respaldo. Se toma eso como base
común y cada `normalizarUso` solo añade lo propio del proveedor. **A verificar en cada tarea de
proveedor**, con una respuesta real o la documentación: si `inputTokens` incluye o no los tokens de
caché (el código actual asume que sí para OpenRouter y los resta). El test de LLM18 fija la semántica
de salida, no la del SDK.

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `llm/dominio/resolver-modelo.ts` (+spec) | Nuevo: `resolverModelo`, lista de proveedores registrados |
| `llm/infraestructura/adaptador-ai-sdk.ts` (+spec) | Nuevo: mapeo, `generateText`, clasificación (movido de `adaptador-openrouter.ts`) |
| `llm/infraestructura/proveedores/openrouter.ts` | Proveedor OpenRouter (reemplaza a `adaptador-openrouter.ts`) |
| `llm/infraestructura/proveedores/{openai,anthropic,google,compatible}.ts` | Uno por SDK, según P37 |
| `llm/infraestructura/adaptador-enrutador.ts` (+spec) | Nuevo: implementa `AdaptadorLlm`, delega por prefijo |
| `llm/aplicacion/llm-gateway.ts` (+spec) | `proveedor` de la fila desde `resolverModelo` |
| `llm/llm.module.ts` | Fábrica de `ADAPTADOR_LLM` con los proveedores configurados |
| `plataforma/config/esquema.ts` (+spec), `.env.example` | Variables y reglas de D4 |
| `.dependency-cruiser.cjs` | La regla `ai-solo-en-infraestructura-llm` añade `^@ai-sdk/` |
| `test/evals/soporte/modo-evals.ts` (+spec) | La clave exigida depende del proveedor del perfil |
| `test/integracion/llm/*` | El de OpenRouter se conserva como prueba de no regresión |
| `package.json` | Dependencias `@ai-sdk/*` con versión exacta |

## Fábrica en `llm.module.ts`

```ts
{
  provide: ADAPTADOR_LLM,
  inject: [CONFIGURACION],
  useFactory: (config) => new AdaptadorEnrutador(proveedoresUsados(config)),
}
```

`proveedoresUsados` instancia **solo** los proveedores que algún perfil referencia (con su clave), de
modo que un proveedor sin usar no necesita clave ni se construye.

## Estrategia de pruebas

TDD estricto, Vitest (`npm test`, `npm run test:integracion`). Unitarias con dobles para el resolver,
la config, el enrutador, la normalización de uso y la clasificación de errores. Integración: se
conserva `adaptador-openrouter.spec.ts` como no regresión; cada proveedor directo tiene un test contra
un servidor HTTP falso (sin red ni gasto). La única prueba con red real es la corrida de evals `[manual]`
de T10. Cada escenario nuevo o modificado tiene su test `<ID> — <título>`.

## Matriz de amenazas

| Amenaza | Control |
|---|---|
| Fuga de la clave por log o error | LLM24; los errores nombran la variable, nunca el valor; test con clave conocida |
| Datos de clientes a un proveedor no aprobado | Ningún proveedor se activa sin prefijo y clave explícitos; P37 |
| Prefijo mal escrito que envía a otro proveedor | Solo proveedores registrados; desconocido = no arranca (LLM16) |
| `baseURL` compatible apuntando a un host no confiable | Solo por entorno (no por datos del cliente); documentado en `.env.example`. Sin allowlist en esta versión |

No hay endpoints, cambios de esquema ni de contrato OpenAPI.
