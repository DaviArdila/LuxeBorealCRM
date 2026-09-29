# Design: Fase 07c — Evals del agente, set dorado y corrida real

- Change: `fase-07c-evals` · Fecha: 2026-09-29 · Estado: diseño propuesto
- Proposal: `proposal.md` · Análisis de la fase: `../fase-07a-turno-y-politicas/exploration.md`
- Specs: `specs/agente/spec.md` (EVL1-EVL5 y la cobertura por evals de R1, R2, R12 «Ubicación
  entrante» y R13 «Fotos agrupadas en collage por defecto»)
- ADRs: [0002](../../../docs/adr/0002-pasarela-llm.md) (modelos de respaldo, D8),
  [0014](../../../docs/adr/0014-fallback-llm-iterado-en-gateway.md),
  [0016](../../../docs/adr/0016-composicion-agente-conversaciones.md) (**propuesta**),
  [0018](../../../docs/adr/0018-presupuesto-de-tiempo-del-turno.md) (**propuesta**, D6)
- Depende de: 07b cerrada. Todo lo que este diseño llama "el agente" es lo que deja 07b (tabla abajo).

## Technical Approach

Las evals son **tests de Vitest en un proyecto propio** (`evals`) que componen la aplicación real
(`AppModule`, Postgres y Redis de Testcontainers) y llaman directamente al generador del turno
(`GENERADOR_RESPUESTA`, que desde 07a resuelve al `MotorTurno` del agente). Lo único que se cambia es
el `LLM_PORT`: en modo guionado, un `FakePuertoLlm` alimentado por el guion del caso; en modo real, el
gateway de verdad forzado al perfil `evals`. En ambos modos un grabador envuelve el puerto y deja a la
vista las herramientas llamadas, sus resultados y el texto final. Las aserciones son funciones puras
sobre esa grabación; el umbral, otra función pura. `src/` no cambia salvo la configuración de modelos
de respaldo de T5.

### Qué deja 07b y cómo lo consume 07c

| Pieza de 07b | Uso en 07c |
|---|---|
| `GENERADOR_RESPUESTA → MotorTurno` con `ContenidoLlm` (07a D4, 07b) | Punto de entrada de cada turno de eval (D1) |
| `LLM_PORT` del barril de `llm`, perfil `conversacion` en `ContenidoLlm` | Se sobrescribe en el módulo de test (D2, D6) |
| Las 7 herramientas reales sobre `catalogo`, `horario`, `contacto` | Se ejecutan de verdad contra la base de prueba |
| `EfectoTurno` y `RespuestaTurno { pasos, handoff? }` | Handoff y pasos de imagen observables sin Chatwoot |
| `auditarDinero` (`src/modulos/agente/dominio/auditar-dinero.ts`, 07b D9) | Misma definición de "monto" en la aserción de dinero (D4) |
| Historial Redis por sesión (ADR-0017) | Casos de varios turnos usan la misma `(conversacionId, version)` |
| `reglas.v1.md` (regla de cuándo citar políticas, ubicación, collage) | Lo que las evals miden en modo real |

## Architecture Decisions

### Decision D1: las evals llaman al generador del turno, no al webhook

**Choice**: el arnés arma un `TestingModule` con `AppModule`, crea la conversación y el contacto con
Prisma, y por cada turno del caso construye una `SolicitudTurno` (contexto con `version` fija y
capacidades de WhatsApp) y llama `GENERADOR_RESPUESTA.generar`. Casos de varios turnos reutilizan la
misma conversación.

**Alternatives considered**: (a) por webhook firmado, como los e2e de 07a/07b: suma debounce, lock,
outbox y Chatwoot falso, más lento y con esperas por tiempo, y no mide nada que las evals necesiten;
(b) llamar solo a `ContenidoLlm` o al bucle: se saltaría las políticas (aviso de datos, tope, R12) que
también forman parte de lo que el cliente recibe.

**Rationale**: EVL1 pide el agente completo (pipeline, bucle, herramientas reales); el camino hasta
Chatwoot ya lo cubren los e2e de 07a y 07b.

### Decision D2: LLM guionado = `FakePuertoLlm` + guion JSON; grabador común a los dos modos

**Choice**: cada caso trae, por turno, un `guion` (lista de pasos: texto final, llamadas a
herramientas con argumentos, llamadas inválidas o un error de pasarela). `test/evals/soporte/guion.ts`
traduce el guion a `PasoLlmFalso` y lo encola en el `FakePuertoLlm` existente
(`test/fakes/puerto-llm-falso.ts`). `GrabadorLlm` (`test/evals/soporte/grabador-llm.ts`) implementa
`LlmPort` envolviendo el puerto efectivo y registra cada solicitud y respuesta; de ahí salen las
llamadas a herramientas (respuestas), sus resultados (`resultadosHerramienta` de la solicitud
siguiente) y el texto final. Un guion agotado es un error del caso, no un handoff.

**Alternatives considered**: (a) un doble nuevo con lógica condicional ("si el usuario dice X, llama
Y"): reimplementa un modelo malo y esconde errores del guion; (b) el `SimuladorOpenRouter` de la Fase 06:
prueba el adaptador, no el agente, y exigiría reescribir guiones en el formato de OpenRouter.

**Rationale**: reutiliza el doble que ya usan 06 y 07b; el grabador hace que las aserciones no dependan
del modo.

### Decision D3: un caso = un archivo JSON validado con Zod

**Choice**: `test/evals/casos/sinteticos/*.json` y `test/evals/casos/dorado/*.json`, validados por
`test/evals/soporte/esquema-caso.ts`:

| Campo | Contenido |
|---|---|
| `id`, `titulo` | El título del test: `<R# o EVL#> — <título exacto del escenario>` cuando cubre un escenario |
| `origen` | `sintetico` o `real-anonimizado` (con `revisadoPor` y `fecha`) |
| `semilla` | Productos, cobertura y políticas del caso sobre la semilla base (D5) |
| `contacto` | `nombre` opcional (cliente conocido) |
| `turnos[]` | `mensajes` (`tipoContenido`, `texto`), `guion` (solo sintéticos), `aserciones` |
| `esperaFallo` | Solo casos negativos: nombre de la aserción que MUST fallar (EVL2) |

Los casos del set dorado no tienen `guion`: solo corren en modo real.

**Alternatives considered**: casos en TypeScript (más cómodos de escribir, pero el set dorado lo
produce un script y lo revisa una persona: JSON es el formato común).

**Rationale**: agregar un caso no toca código; el esquema rechaza un caso mal escrito antes de correr.

### Decision D4: aserciones puras; cuatro son críticas

**Choice**: `test/evals/soporte/aserciones.ts` exporta una función por aserción,
`(grabacion, parametros) → { ok, detalle }`, donde `detalle` nunca incluye texto del cliente:

| Aserción | Qué comprueba | Crítica |
|---|---|---|
| `herramientasEsperadas` | Cada herramienta listada se llamó (con argumentos parciales si se declaran, p. ej. `modo: 'collage'`) | No |
| `herramientasProhibidas` | Ninguna herramienta listada se llamó | **Sí** |
| `dineroConRastro` | Todo monto en pesos del texto final aparece en un resultado de herramienta del mismo turno (usa `auditarDinero` de 07b) | **Sí** |
| `recargoSinPorcentaje` | Ningún texto del turno contiene un porcentaje (`\d+\s*%` o "por ciento") | **Sí** |
| `handoff` | `esperado` o `prohibido`; un handoff no esperado falla | **Sí** (si es `prohibido`) |
| `textoLiteral` | El texto devuelto por una herramienta (política, rango de envío) aparece sin cambios en el texto final | No |
| `textoAusente` | Un texto configurado (p. ej. la política de contra entrega) NO aparece | No |
| `menciona` | El texto final contiene una expresión (p. ej. `ciudad`, `asesor`) | No |

Cada aserción tiene al menos un caso negativo (guion que la viola, `esperaFallo`) en
`test/evals/casos/sinteticos/negativos/`.

**Alternatives considered**: un LLM juez que califique la respuesta (no determinista, cuesta y
necesita sus propias evals; se reevalúa si las aserciones textuales se quedan cortas).

**Rationale**: EVL2 exige determinismo; reutilizar `auditarDinero` evita dos definiciones de "monto"
que podrían divergir. El riesgo de compartir un defecto se cubre con los negativos propios de 07c.

### Decision D5: semilla fija por Prisma, sin importador ni MinIO

**Choice**: `test/evals/soporte/sembrar.ts` inserta con Prisma un catálogo pequeño y estable (4-6
productos con SKU, precio, fotos con claves ficticias y `clave_collage`, cobertura con una zona
excluida, tarifas, `politica_contra_entrega` y `politica_devoluciones`) antes de cada caso, sobre la
base por worker (`test/soporte/base-por-worker.setup.ts`). La imagen nunca se publica (D1 corta en
`RespuestaTurno`), así que las claves no necesitan objetos reales.

**Alternatives considered**: `npm run catalogo:importar -- --dir test/fixtures/catalogo`: arrastra
MinIO y el servidor de fotos a cada corrida sin que ninguna aserción lo use.

**Rationale**: corridas rápidas y reproducibles; la semilla es visible junto a los casos.

### Decision D6: modo real = gateway real con perfil `evals` y sin presión del lock

**Choice**: `EVALS_MODO=real` (variable del arnés, leída y validada con Zod en
`test/evals/soporte/modo-evals.ts`; no entra en `src/plataforma/config/esquema.ts` porque la
aplicación no la usa). En modo real:

1. Si `OPENROUTER_API_KEY` está vacía o `CI` es `true`, el arnés falla **antes** de componer la
   aplicación, con un mensaje que dice qué falta (EVL4).
2. `LlmConPerfilEvals` (`test/evals/soporte/llm-con-perfil-evals.ts`) envuelve el `LlmGateway` real y
   reescribe `perfil: 'evals'` en cada solicitud: modelos `LLM_EVALS_MODELOS`, timeout 30 s (LLM12).
3. La configuración del módulo de test sube `LOCK_TURNO_TTL_S` a 60, así el plazo del turno de
   ADR-0018 (`TTL − 5 s`) no recorta el timeout del perfil `evals`.
4. Cada caso corre **3 veces**, cada repetición en una conversación nueva.
5. Al terminar, imprime el costo sumado de `uso_llm` (`costo_estimado_usd` con `creado ≥` inicio de la
   corrida) y el modelo que respondió cada caso (`modelo` agrupado por `conversacion_id`).

`uso_llm` es el de la base de prueba de la corrida: esas llamadas **no** cuentan para el techo mensual
de producción. El freno real es el límite de gasto de la consola de OpenRouter (P32).

**Alternatives considered**: (a) un perfil `evals` elegido por configuración dentro de `ContenidoLlm`:
cambia `src/` para algo que solo necesita el arnés; (b) correr contra la base de desarrollo para que
el costo cuente en el techo: mezclaría conversaciones de prueba con datos de desarrollo.

**Rationale**: cero cambios de comportamiento en `src/`; el costo es visible por corrida.

### Decision D7: umbral como función pura, evaluada por un test final

**Choice**: `test/evals/soporte/umbral.ts`:

| Modo | Críticas | No críticas | Repeticiones |
|---|---|---|---|
| Guionado | 100 % | 100 % | 1 |
| Real | 100 % en cada repetición | ≥ 90 % del total | 3 |

`calcularVeredicto(resultados, modo) → { aprobada, criticasFallidas, porcentajeNoCriticas }`. En modo
guionado cada aserción es un `expect` dentro de su `it`: cualquier fallo deja el comando en rojo. En modo
real los casos registran resultados sin fallar solos, y un último `it` («EVL3 — veredicto de la
corrida») llama a `calcularVeredicto` y falla si no alcanza el umbral. El resumen (casos, aserciones,
veredicto; en modo real también costo y modelos) se imprime ordenado por `id` y sin tiempos, para que
dos corridas guionadas den el mismo texto (EVL1).

**Alternatives considered**: un runner propio fuera de Vitest (otro comando, otro reporte, sin
Testcontainers ni `base-por-worker` gratis).

**Rationale**: reutiliza el arnés de integración existente; el umbral se prueba sin LLM.

### Decision D8: set dorado desde Chatwoot, anonimizado por script y revisado a mano

**Choice**: flujo `[manual]` condicionado a P30:

1. El usuario lee las conversaciones del Chatwoot del prototipo con `GET
   /api/v1/accounts/{cuenta}/conversations/{id}/messages` (solo lectura, token suyo, nunca en el repo) y
   las guarda en `.evals-crudo/` (ignorado por git y excluido de `gitleaks` por no commitearse).
2. `npm run evals:anonimizar -- --entrada .evals-crudo/<archivo>.json --salida
   test/evals/casos/dorado/<id>.json` convierte los mensajes entrantes del cliente en turnos y
   reemplaza teléfonos, correos, cédulas, direcciones y nombres (del contacto de Chatwoot y de una lista
   que se pasa con `--nombres`) por marcadores estables `<TELEFONO_1>`, `<NOMBRE_1>`…
3. Una verificación final más amplia que el reemplazo (cualquier secuencia de ≥ 7 dígitos, cualquier
   `@`) hace fallar el script **sin escribir** el archivo (EVL5).
4. Una persona revisa cada caso, le agrega las aserciones (al menos las críticas y `handoff`) y firma
   `revisadoPor`.

Lógica pura en `scripts/evals/anonimizador.ts` (+ spec en el proyecto `unit`, que ya incluye
`scripts/**/*.spec.ts`); CLI en `scripts/evals/anonimizar.ts`.

**Alternatives considered**: (a) un extractor automático contra la API de Chatwoot: más código para una
tarea de una vez; (b) anonimizar a mano: sin garantía repetible (**R14**).

**Rationale**: la garantía de EVL5 vive en un test; el paso humano queda como control final.

### Decision D9: modelos de respaldo elegidos con la corrida real

**Choice**: T5 `[manual]` corre el modo real con `LLM_EVALS_MODELOS=<candidato>` para cada candidato
(al menos uno de otra empresa, ADR-0002), compara veredicto, costo y latencia p95, y presenta la tabla
al usuario. Con su aprobación: default de `LLM_CONVERSACION_MODELOS` (`src/plataforma/config/esquema.ts`)
y `.env.example` pasan a `luna,<respaldo>`, `LLM_PRECIOS_USD_JSON` incluye el precio del respaldo, y
ADR-0002 gana una enmienda con la evidencia.

**Alternatives considered**: elegir por reputación o precio sin evals (lo que la regla EVL3 prohíbe
para cualquier cambio de modelo).

**Rationale**: primera aplicación real de la regla "ningún cambio de modelo sin corrida que alcance el
umbral".

## Data Flow

```
npm run evals  (EVALS_MODO = guionado | real)
  modo-evals: valida modo, clave y CI  ── real sin clave → error, 0 llamadas
  Testcontainers (Postgres + Redis) → base por worker
  por cada caso (× 3 en real):
    sembrar.ts (Prisma) → conversación + contacto
    TestingModule(AppModule) con LLM_PORT = GrabadorLlm(FakePuertoLlm(guion) | LlmConPerfilEvals(LlmGateway))
    por cada turno:
      GENERADOR_RESPUESTA.generar(SolicitudTurno)  → MotorTurno → políticas → ContenidoLlm → bucle
        herramientas reales → catalogo / horario / contacto (base de prueba)
      ← RespuestaTurno { pasos, handoff? } + grabación (llamadas, resultados, texto final)
      aserciones(grabación) → resultados
  umbral(resultados, modo) → veredicto → resumen impreso (+ costo y modelos en real)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `vitest.config.ts` | Modify | Proyecto `evals` (`test/evals/**/*.evals.ts`, mismo `globalSetup` y `setupFiles` que integración, `maxConcurrency: 1`, `groupOrder` propio); `unit` incluye `test/evals/**/*.spec.ts` |
| `package.json` | Modify | `evals` (`vitest run --project evals`), `evals:anonimizar`; `ci` agrega `npm run evals` |
| `test/evals/soporte/{modo-evals,esquema-caso,guion,grabador-llm,llm-con-perfil-evals,sembrar,componer-agente,aserciones,umbral,resumen}.ts` | Create | D1-D7 |
| `test/evals/soporte/*.spec.ts` | Create | Unitarios de aserciones, umbral, esquema, guion, resumen |
| `test/evals/agente.evals.ts` | Create | Recorre los casos y el veredicto |
| `test/evals/casos/sinteticos/*.json`, `negativos/*.json` | Create | D3, D4 |
| `test/evals/casos/dorado/*.json` | Create (`[manual]`, P30) | D8 |
| `scripts/evals/{anonimizador,anonimizar}.ts`, `anonimizador.spec.ts` | Create | D8 |
| `.gitignore` | Modify | `.evals-crudo/` |
| `src/plataforma/config/esquema.ts`, `.env.example` | Modify (T5, `[manual]` previo) | D9 |
| `docs/adr/0002-pasarela-llm.md` | Modify (T5) | Enmienda con la evidencia de D9 |
| `CLAUDE.md` | Modify | Tabla de comandos: `npm run evals`, `npm run evals:anonimizar` |

## Interfaces / Contracts

```typescript
// test/evals/soporte/esquema-caso.ts (tipos inferidos del esquema Zod)
export type NombreAsercion =
  | 'herramientasEsperadas' | 'herramientasProhibidas' | 'dineroConRastro'
  | 'recargoSinPorcentaje' | 'handoff' | 'textoLiteral' | 'textoAusente' | 'menciona';

export interface TurnoCaso {
  readonly mensajes: readonly { tipoContenido: TipoContenidoTurno; texto: string }[];
  readonly guion?: readonly PasoGuion[];         // obligatorio si origen = 'sintetico'
  readonly aserciones: AsercionesTurno;
}

// test/evals/soporte/grabador-llm.ts
export interface GrabacionTurno {
  readonly llamadas: readonly { nombre: string; argumentos: unknown }[];
  readonly resultados: readonly { nombre: string; resultado: unknown; esError: boolean }[];
  readonly textoFinal: string;                    // pasos de texto de RespuestaTurno, unidos
  readonly handoff: MotivoHandoff | null;
}

// test/evals/soporte/umbral.ts
export const UMBRAL_NO_CRITICAS_REAL = 0.9;
export const REPETICIONES_REAL = 3;
export function calcularVeredicto(
  resultados: readonly ResultadoAsercion[], modo: 'guionado' | 'real',
): { aprobada: boolean; criticasFallidas: number; porcentajeNoCriticas: number };

// scripts/evals/anonimizador.ts
export function anonimizar(texto: string, nombres: readonly string[], tabla: TablaMarcadores): string;
/** Lanza ErrorDatoPersonalResidual si queda un teléfono, correo o cédula tras anonimizar. */
export function verificarSinDatosPersonales(texto: string): void;
```

`TipoContenidoTurno` y `MotivoHandoff` salen del barril de `conversaciones` (07a D1); `LlmPort` y
`LLM_PORT`, del barril de `llm`.

## Módulos y fronteras

Sin módulos nuevos ni cambios de fronteras en `src/`. El arnés vive en `test/evals/`, que
`npm run fronteras` no analiza (solo `src/` y `scripts/`), e importa barriles y `test/fakes/`, salvo
`auditarDinero` (dominio de `agente`), importado por ruta porque es una función pura y el barril de
`agente` no la exporta. `scripts/evals/` no importa nada de `src/` (regla
`scripts-solo-barriles-de-plataforma`). Sin eventos de dominio, sin esquema, sin endpoints: `openapi/` no cambia.

Configuración nueva: ninguna en la aplicación. Variables del arnés: `EVALS_MODO` (`guionado` por
defecto | `real`). T5 cambia solo defaults existentes (`LLM_CONVERSACION_MODELOS`,
`LLM_PRECIOS_USD_JSON`).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (`unit`) | Cada aserción con su caso que pasa y el que falla; umbral (EVL3 ambos escenarios); esquema de caso; guion → pasos; resumen sin tiempos | Funciones puras, `test/evals/soporte/*.spec.ts` |
| Unit (`unit`) | Anonimizador (EVL5 ambos escenarios) | `scripts/evals/anonimizador.spec.ts` |
| Evals guionado (`evals`) | Casos sintéticos, negativos, EVL1 (sin proveedor, determinismo), EVL4 «sin clave» | Testcontainers, `FakePuertoLlm`, `SimuladorOpenRouter` como centinela de red |
| Evals real `[manual]` | Casos sintéticos + set dorado × 3, costo y modelos (EVL4 «imprime su costo») | Clave del usuario, límite de gasto (P32) |

«EVL1 — El modo guionado no llama a ningún proveedor» apunta `OPENROUTER_BASE_URL` a un
`SimuladorOpenRouter` y exige `intentos === 0` y cero filas en `uso_llm` al terminar.

## Threat Matrix

| Amenaza | Aplica | Control |
|---|---|---|
| Datos personales del set dorado en el repo o en la salida de las evals | Sí | EVL5 (verificación final que falla sin escribir), revisión humana, `.evals-crudo/` ignorado; el resumen imprime ids y nombres de aserción, nunca texto |
| Clave de OpenRouter filtrada | Sí | Solo por entorno del usuario; `npm run secretos` en el hook; el modo real se niega en CI |
| Gasto descontrolado en modo real | Sí | 3 repeticiones fijas, `max_tokens` del perfil, costo impreso, límite de la consola (P32) |
| Shell, subprocesos, VCS | No | — |

## Migration / Rollout

Sin esquema. Rollout por la cadena de 4 PRs de `tasks.md`; revertir no afecta a producción (salvo T5,
que vuelve al valor anterior de `LLM_CONVERSACION_MODELOS`). Review: **RDD** por commit;
`judgment-day` **no** es obligatorio (regla 6: solo 04, 05, 06 y 10). Al cerrar 07c se cierra la
Fase 07 completa (T5).

## Open Questions

- [ ] P30 — extracción del set dorado (bloquea solo la parte `[manual]` de T4).
- [ ] P32 — gasto de la corrida real y de la comparación de modelos (bloquea las partes `[manual]` de
  T4 y T5).
