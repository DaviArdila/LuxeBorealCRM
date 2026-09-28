# Design: Fase 06 — Pasarela LLM

- Change: `fase-06-pasarela-llm` · Fecha: 2026-09-28 · Estado: diseño propuesto
- Proposal: `proposal.md` (Q1–Q4 aprobadas por el usuario: techo 10 USD/mes, aviso 80 % por log
  `warn`, clave `mensaje_techo_gasto`, nivel 2 directo pospuesto)
- Specs: `specs/llm/spec.md` (LLM1–LLM13, 27 escenarios) + `specs/conversaciones/spec.md` (delta R13)
- ADRs: [0001](docs/adr/0001-monolito-modular-nestjs.md) (aceptada), [0002](docs/adr/0002-pasarela-llm.md)
  (aceptada), [0013](docs/adr/0013-cortacircuitos-en-memoria-pasarela-llm.md) (propuesta, D5)

## Technical Approach

Se construye el módulo nuevo `src/modulos/llm/` con las tres capas que ya decidió ADR-0002:
`LlmPort` (tipos propios, token `LLM_PORT`) → `LlmGateway` (aplicación: techo, timeout, reintento,
fallback nivel 1 iterado en el gateway, circuit breaker, registro en `uso_llm`) → adaptador AI SDK
sobre OpenRouter (único lugar donde existen `ai` y `@openrouter/ai-sdk-provider`). El cálculo de
costo estimado vive en `dominio/` como función pura con aritmética entera (micro-USD); el LLM nunca
calcula nada (**R2**). El módulo **no** se registra en `AppModule` ni se conecta a `ProcesarTurno`:
el *binding* `GENERADOR_RESPUESTA → AgenteEco` queda intacto (la Fase 07 lo reemplaza). Sin
endpoints nuevos, sin eventos de dominio, sin cambio de esquema salvo un índice aditivo en
`uso_llm` (D10).

Decisiones con números que este diseño cierra: Q5 (timeout 15 s + presupuesto total derivado del
lock), forma exacta de `LlmPort` (D1), fallback iterado en el gateway en vez del parámetro `models`
de OpenRouter (D2), reintento acotado con backoff (D4), circuit breaker en memoria con umbral 5 /
ventana 60 s / 1 sonda (D5 → ADR-0013), tabla de costo propia que decide el techo y costo del
proveedor solo como referencia (D6), gasto mensual consultado por llamada sin caché (D7),
`metadatosProveedor: unknown` en dos niveles (D8), techo con chequeo previo + fila observable en
`parametro` (D9), estrategia de pruebas por nivel con fakes + simulador local (D11) y variables
exactas por perfil (D12).

## Architecture Decisions

### Decision D1: forma exacta de LlmPort — systemPrompt como parámetro separado

**Choice**: `LlmPort.generar(solicitud)` donde `solicitud = { perfil, mensajes, systemPrompt?,
herramientas?, conversacionId? }`. `systemPrompt` es un parámetro aparte, no el primer mensaje del
historial (ver contrato en §Interfaces / Contracts).

**Alternatives considered**: (a) `systemPrompt` como primer mensaje `{ rol: 'sistema', ... }` dentro
de `mensajes`; (b) sin `systemPrompt` (cada llamador lo incrusta en sus mensajes).

**Rationale**: conserva la idea del prototipo (`src/llm/tipos.ts:48-54`,
`generar({ mensajes, systemPrompt, tools })` — **B7**); mapea 1:1 al parámetro `system` de
`generateText` del AI SDK sin mensajes sintéticos que contaminen la contabilidad de tokens del
historial; y deja el prefijo estable para caché de prompts (ADR-0002) bajo control del llamador
(Fase 07), no del gateway. La alternativa (b) dispersaría el prompt de sistema por cada llamador.

### Decision D2: fallback nivel 1 iterado en el gateway, sin el parámetro server-side models de OpenRouter

**Choice**: el gateway recorre la lista de modelos del perfil en orden y hace **una llamada al
adaptador por modelo con un solo id de modelo**; cada intento deja su propia fila en `uso_llm`.
El parámetro `models` (fallback del lado de OpenRouter) no se usa en el camino primario.

**Alternatives considered**: delegar el fallback a OpenRouter pasando la lista completa en `models`
y haciendo una sola llamada (lo que ADR-0002 describe como nivel 1).

**Rationale**: los escenarios LLM5 («el llamador recibe respuesta del siguiente modelo… y `uso_llm`
registra el intento fallido y el exitoso») y LLM6 (fila por llamada con su modelo) **exigen**
observabilidad por intento (**R13**). Con fallback server-side, un intento fallido interno de
OpenRouter es invisible para el gateway: no hay fila auditable ni atribución de costo por modelo.
La iteración en el gateway además hace el fallback determinista y testeable sin gastar (D11). No es
un ADR nuevo porque no contradice ADR-0002 (el gateway sigue siendo el dueño de la resiliencia,
skill §6) y la spec ya fuerza la observabilidad por intento; queda registrado aquí como
aclaración de diseño.

### Decision D3: timeout del perfil conversacion 15 s + presupuesto total derivado del lock (Q5)

**Choice**: `LLM_CONVERSACION_TIMEOUT_MS = 15000` por defecto. Arranque falla
(`ConfiguracionInvalidaError`, PLT1) si `LLM_CONVERSACION_TIMEOUT_MS >= LOCK_TURNO_TTL_S * 1000`.
Además el gateway impone un **presupuesto total** por invocación derivado en runtime:

```
presupuestoTotal = LOCK_TURNO_TTL_S − 5 s          (con defaults: 30 − 5 = 25 s)
timeoutEfectivo(intento) = min(timeoutPerfil, restanteDelPresupuesto)
solo se reintenta si restanteDelPresupuesto > 2 s
```

**Alternatives considered**: (a) solo timeout por intento sin presupuesto global; (b) subir
`LOCK_TURNO_TTL_S` a 60+ s para dar aire al LLM.

**Rationale** (aritmética): con 15 s por intento y hasta 2 reintentos por modelo, una invocación
podría durar 15 + ~1 + 15 + ~2 + 15 ≈ 48 s > 30 s del lock sin heartbeat heredado de la Fase 05
(riesgo ya anotado en la proposal). La alternativa (a) deja que el lock expire a mitad de turno
(duplicación de procesamiento, R8). La alternativa (b) retrasa todos los turnos humanos/bot solo
para cubrir el peor caso del LLM; el TTL del lock lo reevalúa la Fase 07 con latencias reales
(riesgo de la proposal). Camino feliz típico: intento 1 falla rápido (429 en 0,3 s) + backoff ~1 s
→ intento 2 con ~23 s restantes → timeout efectivo 15 s intacto. Peor caso: dos timeouts completos
consumen 15 + 1 + 9 ≈ 25 s y el tercer intento no se lanza (restante < 2 s); el lock (30 s) nunca
expira durante el gateway, con 5 s de margen para el `INSERT` en `uso_llm` y la liberación.

### Decision D4: reintento — 2 por modelo, backoff exponencial acotado, solo fallos reintentables

**Choice**: ante 429, 5xx, timeout, aborto o error de conexión, hasta **2 reintentos** (3 intentos
por modelo, como el prototipo §3.6 pero **incluyendo timeouts**, que `geminiClient` no reintentaba —
**A7**, causa de los fallos del 2026-09-22). Espera `min(base · 2^reintento + jitter, max)` con
`LLM_REINTENTO_BASE_MS = 500`, `LLM_REINTENTO_MAX_MS = 2000`, jitter uniforme 0–200 ms
(`Math.random` en el gateway, documentado). Ante cualquier otro 4xx no se reintenta contra el mismo
modelo: se pasa al siguiente (LLM4). Secuencia de esperas: ~0,5–0,7 s, ~1,0–1,2 s.

**Alternatives considered**: reintento global (2 en total entre todos los modelos) en vez de por
modelo.

**Rationale**: el reintento por modelo respeta la semántica de LLM4 («si el tercer intento también
falla… sin un cuarto intento») y un 429 transitorio del primer modelo no consume el presupuesto de
resiliencia del segundo; el presupuesto total D3 ya acota el peor caso agregado.

### Decision D5: circuit breaker por modelo — umbral 5, ventana 60 s, 1 sonda, estado en memoria

**Choice**: el gateway lleva un circuito por id de modelo: tras **5 fallos consecutivos de
proveedor** (timeout, 5xx, 429, aborto, conexión — **excluye** 4xx no reintentables y
`techo-alcanzado`, que no son fallo del proveedor) deja de llamar a ese modelo durante **60 s**;
pasada la ventana permite **1 llamada de prueba** (semi-abierto): si tiene éxito cierra, si falla
reabre 60 s. El estado vive en un `Map` en memoria del proceso gateway (singleton). Transiciones
como funciones puras en `dominio/` sobre `(estado, ahora: Date)`; el `Clock` se inyecta en el borde.

**Alternatives considered**: estado en Redis (`llm:cb:<modelo>`) compartido entre instancias.

**Rationale**: despliegue de un solo proceso en un solo VPS (ADR-0001, ADR-0006): con una instancia
no hay nada que compartir y Redis añadiría latencia + un modo de fallo más al camino crítico del
turno. Alternativa real con consecuencia duradera (si algún día hay N réplicas, cada una aprende
por su cuenta) → **ADR-0013** (estado `propuesta`).

### Decision D6: costo estimado con tabla propia; el costo reportado por OpenRouter nunca decide el techo

**Choice**: los precios viven en `LLM_PRECIOS_USD_JSON` (USD por 1 M de tokens:
`{ entrada, salida, cache }` por id de modelo; fuente: páginas de precio de OpenRouter capturadas
al desplegar — ADR-0002 cita `openrouter.ai/openai/gpt-5.6-luna`; `sdd-tasks` fija los valores).
El gateway calcula `costoEstimadoUsd` con **aritmética entera en micro-USD** (función pura
`calcularCostoEstimado` en `dominio/`, testeable sin infraestructura):

```
costoMicroUsd = redondeo((tE·pE + tS·pS + tC·pC) / 1e6)   // p* en micro-USD por 1 M
costoEstimadoUsd = costoMicroUsd / 1e6                   // Decimal(12,6) en uso_llm
```

`tC` (tokens de caché) se lee de `usageAccounting` de OpenRouter (`usage: { include: true }` en el
modelo) vía `providerMetadata.openrouter.usage.promptTokensDetails.cachedTokens` con fallback a
`inputTokenDetails.cacheReadTokens`, default 0 si ausente. El `cost` que reporta OpenRouter se
guarda solo como referencia en el log de éxito (nunca en `uso_llm`, nunca decide el techo).
Arranque valida que **todo modelo de los perfiles existe en la tabla** (falla en boot si falta);
un modelo sin precio en runtime registra costo 0 + `warn` `precio-desconocido` sin tumbar la
respuesta (nunca-perder > nunca-duplicar).

**Alternatives considered**: usar directamente el `cost` de OpenRouter para `uso_llm` y el techo.

**Rationale**: **R2** (el LLM nunca calcula; el proveedor menos: un número omitido o erróneo del
proveedor desactivaría el techo **R13** por la puerta de atrás). La tabla propia es dato versionado
(**R15**), auditable y funciona incluso si OpenRouter omite el accounting.

### Decision D7: gasto mensual consultado al repositorio en cada llamada, sin caché

**Choice**: cada `generar()` hace `SUM(costoEstimadoUsd) WHERE creado >= inicioMesUTC(clock.ahora())`
(1 query agregada sobre el índice D10) antes de llamar al proveedor. Sin caché de corta vida.

**Alternatives considered**: caché del gasto en memoria/Redis con TTL de minutos.

**Rationale** (números): el techo es un límite de dinero (**R13**); una caché obsoleta permite gastar
por encima del techo. El costo de la query es 1 agregado indexado por llamada — con el rate limit
de 20/h por contacto y el volumen de un solo negocio, incluso 1 000 turnos/día × 1 agregado de
< 5 ms es trivial, y la escritura en `uso_llm` ya cuesta 1 `INSERT` por llamada: el `SELECT` no
cambia el orden de costo. Mes en **UTC** (determinista con `ClockFalso`; el desfase con
América/Bogotá es ±5 h solo en el borde del día 1, inmaterial para un techo de 10 USD — queda
documentado, no silenciado).

### Decision D8: metadatosProveedor opacos en dos niveles, tipo unknown, nunca leídos ni logueados

**Choice**: `RespuestaLlm.metadatosProveedor?: unknown` (respuesta completa, p. ej.
`providerMetadata.openrouter.usage` para referencia) y
`LlamadaHerramienta.metadatosProveedor?: unknown` por llamada (caso `thoughtSignature` de Gemini
del prototipo `src/llm/tipos.ts:5-12` — **B7**). El gateway los transporta byte a byte; ninguna
rama los inspecciona; los logs nunca los emiten (**R14**).

**Alternatives considered**: tipar los metadatos (`Record<string, unknown>` con campos conocidos).

**Rationale**: tiparlos acoplaría el puerto a un proveedor concreto y tentaría a decidir por su
contenido (prohibido por ADR-0002 y LLM2). `unknown` lo hace estructuralmente imposible.

### Decision D9: techo con chequeo previo, aviso 80 % idempotente por mes y fila observable en parametro

**Choice**: orden del gateway: (1) si `NODE_ENV=test` se salta el techo (LLM7); (2) gasto mensual
(D7) ≥ techo → devuelve `techo-alcanzado` **sin llamar al proveedor** + fila `uso_llm`
(`proveedor='pasarela'`, `modelo='techo-alcanzado'`, costo 0, `exito=false`) — auditoría
nunca-perder; (3) gasto ≥ 80 % y sin aviso este mes → `warn` estructurado
`{ mes, gastoUsd, techoUsd }` (sin contenido ni PII, **R14**) + upsert de `parametro`
`llm_estado_techo = { mes, gastoUsd, techoUsd, avisoEmitido: true, bloqueado: false }`; la lectura
del parámetro ocurre **solo** cuando el gasto ya cruzó el 80 % (el camino feliz no paga una query
extra); (4) al primer bloqueo del mes se marca `bloqueado: true` (fila observable que pide LLM9).
El texto de cortesía vive en `parametro.mensaje_techo_gasto` con default provisional embebido en
el repositorio (patrón `RepositorioParametroConversacionesPrisma`); el gateway **no** lo lee — lo
consume la Fase 07/08. El lector (`obtenerMensajeTechoGasto()`) se implementa en esta fase para
satisfacer LLM9 segundo escenario.

**Alternatives considered**: aviso por evento de dominio + suscriptor de notificaciones.

**Rationale**: `notificaciones/` llega en la Fase 08 (proposal, Q2 aprobada: log `warn` + fila
observable, sin Telegram); un evento sin consumidor sería ceremonia muerta. La fila `parametro`
hace el «una sola vez por mes» durable ante reinicios sin esquema nuevo.

### Decision D10: esquema — solo índice aditivo @@index([creado]) en uso_llm

**Choice**: `prisma/schema.prisma` (`UsoLlm`) agrega `@@index([creado])`; `MODELO_DATOS.md` §7 se
actualiza **primero** (`openspec/config.yaml` §design). Migración aditiva generada, sin bloque
`[manual]`. Sin columnas nuevas: el agregado mensual filtra por `creado` y agrupa en memoria
(resultado pequeño); un índice compuesto `(creado, modelo)` no se justifica con este volumen.

**Alternatives considered**: (a) sin índice (full scan); (b) índice compuesto `(creado, modelo)`.

**Rationale**: el agregado D7 corre en cada llamada al LLM; con (a) el costo crece con la tabla
completa cada mes. Con (b) se paga un índice más ancho sin filtro adicional que lo aproveche
(el `WHERE` es solo por fecha). `@@index([creado])` es el punto justo.

### Decision D11: pruebas — fakes en el gateway, simulador OpenRouter local para el adaptador, T1 primero

**Choice**: (a) gateway (timeout/reintento/fallback/CB/techo): tests unitarios con
`FakeAdaptadorLlm` programable por modelo (falla N veces / responde / tarda X ms con `ClockFalso`
+ `AbortSignal` real), repositorio `uso_llm` en memoria y logger espía — deterministas, sin red,
sin gastar; (b) adaptador: integración contra **simulador OpenRouter local** (HTTP en `localhost`
con respuestas fijas del formato chat/completions + `usage` accounting) usando el override
`baseURL` de `createOpenRouter` — verifica el mapeo real tipos-propios ↔ AI SDK (incluido
`usage: { include: true }`) sin API key ni gasto; (c) repositorio `uso_llm`: integración contra
Postgres real (Testcontainers): best-effort, agregado mensual, índice; (d) **T1 del plan**:
procedimiento de compatibilidad `ai` + `@openrouter/ai-sdk-provider` con NestJS 12 ESM (enmienda
ADR-0001): `npm install` sin `ERESOLVE` (peerDeps contra `^12`), compilación `tsc`/`nest build`
con `import from 'ai'` bajo `"type": "module"`, spec que corre `generateText` contra el simulador
local, tabla de versiones fijadas en `tasks.md`; si falla se avisa al usuario y el fallback es
adaptador con `fetch` directo a OpenRouter (rediseño, no degradación silenciosa).

**Alternatives considered**: solo fakes (sin simulador) o solo simulador (sin fakes).

**Rationale**: los fakes no prueban el mapeo contra el SDK real (riesgo: deriva de versiones del
AI SDK); el simulador no da determinismo barato para las 27 combinaciones de resiliencia. Cada
nivel prueba lo suyo (skill §7). Corridas manuales contra OpenRouter real solo bajo demanda, con
clave nunca commiteada (proposal §Dependencies).

### Decision D12: configuración por perfil en variables planas + JSON validado con Zod

**Choice** (nombres exactos, unidades `MS` en milisegundos salvo CB/techo):

| Variable | Default | Rango / regla |
|---|---|---|
| `LLM_CONVERSACION_MODELOS` | `openai/gpt-5.6-luna` | CSV, ≥ 1 (respaldos concretos los elige la Fase 07 con evals, ADR-0002) |
| `LLM_CONVERSACION_TIMEOUT_MS` | `15000` | 1000–60000 y `< LOCK_TURNO_TTL_S·1000` (Q5, LLM3) |
| `LLM_CONVERSACION_MAX_TOKENS` | `400` | 1–8000 (heredado prototipo §7) |
| `LLM_CONVERSACION_MAX_REINTENTOS` | `2` | 0–2 (LLM4) |
| `LLM_EVALS_MODELOS` | `openai/gpt-5.6-luna` | CSV, ≥ 1 |
| `LLM_EVALS_TIMEOUT_MS` | `30000` | 1000–120000 (sin presión del lock) |
| `LLM_EVALS_MAX_TOKENS` | `400` | 1–8000 |
| `LLM_EVALS_MAX_REINTENTOS` | `2` | 0–2 |
| `LLM_TECHO_MENSUAL_USD` | `10` | > 0 (Q1 aprobada) |
| `LLM_UMBRAL_AVISO_PCT` | `80` | 1–99 (Q2 aprobada) |
| `LLM_PRECIOS_USD_JSON` | JSON con Luna 0,20/1,20/caché 0,02 por 1 M (ADR-0002; valores a refrescar en T-apply) | record modelo → `{ entrada, salida, cache }` ≥ 0; debe cubrir todos los modelos de ambos perfiles |
| `LLM_REINTENTO_BASE_MS` / `LLM_REINTENTO_MAX_MS` | `500` / `2000` | base ≤ max (D4) |
| `LLM_CB_UMBRAL_FALLOS` / `LLM_CB_VENTANA_S` | `5` / `60` | ≥ 2 / ≥ 10 (D5) |
| `OPENROUTER_API_KEY` | `''` | obligatorio no vacío en `production` (patrón `CHATWOOT_BOT_TOKEN`); los tests usan el simulador local |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | override al simulador en tests |

**Alternatives considered**: un solo JSON `LLM_PERFILES_JSON` con todo.

**Rationale**: el repo usa variables planas con defaults (`esquema.ts`: `LOCK_TURNO_TTL_S`,
`RATE_LIMIT_*`); un JSON monolítico impide cambiar un timeout sin reescribir todo y oscurece el
error de arranque (PLT1: el error nombra la variable, nunca el valor). Solo precios (tabla por
modelo) y nada más van en JSON.

### Decision D13: validación de argumentos de herramientas en el gateway como transporte, sin ejecutar

**Choice**: función pura `validarLlamadasHerramienta(llamadas, definiciones)` en `dominio/`: valida
cada `argumentos` contra el Zod de su definición; las válidas pasan intactas; las inválidas **no**
se corrigen ni se sustituyen por `{}` (antipatrón `xaiClient` — **A7**): se devuelven en
`RespuestaLlm.llamadasInvalidas[]` con su causa para que el bucle de la Fase 07 las reporte al
modelo como error de herramienta (LLM2). El gateway no ejecuta nada, no filtra, no reordena, no
recalcula valores (**R1/R2**).

**Alternatives considered**: no validar en Fase 06 (dejarlo todo a la 07).

**Rationale**: el escenario LLM2 «Argumentos inválidos devuelven error de herramienta, nunca objeto
vacío» es Fase 06 (base). Validar esquema ≠ interpretar contenido: es comprobación de forma, no
cálculo sobre datos del negocio, luego es compatible con **R2**.

## Data Flow

```
llamador (Fase 07; en Fase 06 solo tests)
  │ SolicitudGeneracion { perfil, mensajes, systemPrompt?, herramientas?, conversacionId? }
  ▼
LlmGateway.generar()  [aplicacion, @Injectable, implementa LlmPort]
  │ 1. techo: gastoMensual() → >= techo? → ErrorPasarelaLlm('techo-alcanzado') [sin proveedor]
  │ 2. aviso 80 % (warn + parametro llm_estado_techo, solo al cruzar)
  │ 3. por modelo del perfil en orden:
  │      circuito abierto? → siguiente (registra fila 'pasarela/circuito-abierto')
  │      adaptador.generar(modelo, solicitud, abort)   [1 intento, sin reintentos propios]
  │      reintentable y quedan reintentos y presupuesto (D3)? → backoff → mismo modelo
  │      no-reintentable? → siguiente modelo
  │ 4. todos fallaron → mapea último error (red total sin HTTP → 'proveedor-caido')
  │ 5. valida llamadasHerramienta (D13) → RespuestaLlm
  │ 6. SIEMPRE: fila uso_llm por intento + fila 'pasarela' si nunca hubo proveedor (D9/LLM6)
  ▼
AdaptadorOpenRouter [infraestructura, único import de 'ai' y '@openrouter/ai-sdk-provider']
  │ generateText({ model: openrouter(modelId, { usage: { include: true } }),
  │   system, messages, tools, maxOutputTokens, abortSignal }) — doGenerate 1 vez
  ▼ OpenRouter (o simulador local vía OPENROUTER_BASE_URL en tests)

Arranque: ConfiguracionModule valida LLM_* (PLT1) → LlmModule compone
(GATEWAY ← adaptador, repos, CLOCK, CONFIGURACION). LlmModule NO se importa en AppModule.
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modulos/llm/puertos/llm-port.ts` | Create | `LLM_PORT`, `LlmPort`, tipos propios (solicitud/respuesta/mensajes/herramientas/uso/códigos de error). Sin tipos del SDK |
| `src/modulos/llm/dominio/error-pasarela-llm.ts` | Create | `ErrorPasarelaLlm` con `codigo: 'timeout' \| 'no-reintentable' \| 'circuito-abierto' \| 'techo-alcanzado' \| 'proveedor-caido'` (LLM1) |
| `src/modulos/llm/dominio/calcular-costo.ts` | Create | `calcularCostoEstimado` pura en micro-USD + `inicioMesUTC` (D6/D7) |
| `src/modulos/llm/dominio/validar-llamadas.ts` | Create | `validarLlamadasHerramienta` pura (D13, LLM2) |
| `src/modulos/llm/dominio/estado-circuito.ts` | Create | Máquina pura del circuit breaker (D5): `debeLlamar / registrarExito / registrarFallo` sobre `(estado, ahora)` |
| `src/modulos/llm/puertos/repositorio-uso-llm.ts` | Create | `REPOSITORIO_USO_LLM` + `registrarUso` / `gastoMensual(desde)` / `gastoMensualPorModelo(desde)` (LLM13) |
| `src/modulos/llm/puertos/repositorio-parametro-llm.ts` | Create | `REPOSITORIO_PARAMETRO_LLM` + `obtenerMensajeTechoGasto` / `leerEstadoTecho` / `guardarEstadoTecho` (D9, patrón conversaciones D13) |
| `src/modulos/llm/puertos/adaptador-llm.ts` | Create | Puerto interno (NO exportado en el barril): `generarConModelo` de un solo intento + error interno `AdaptadorLlmError` con clase reintentable/no-reintentable |
| `src/modulos/llm/aplicacion/llm-gateway.ts` | Create | `LlmGateway implements LlmPort`: techo → aviso → CB → intentos/backoff → fallback → validación → registro (D2–D5, D7, D9) |
| `src/modulos/llm/infraestructura/adaptador-openrouter.ts` | Create | Único archivo que importa `ai` y `@openrouter/ai-sdk-provider`; mapeo tipos-propios ↔ AI SDK; `usage: { include: true }`; abort; sin reintentos (LLM11) |
| `src/modulos/llm/infraestructura/prisma/repositorio-uso-llm-prisma.ts` | Create | Prisma sobre `uso_llm`: `registrarUso` best-effort (nunca lanza al gateway: el fallo se loguea y se sigue — LLM13), agregados por mes |
| `src/modulos/llm/infraestructura/prisma/repositorio-parametro-llm-prisma.ts` | Create | Lee `parametro` (`llm_estado_techo`, `mensaje_techo_gasto` + default provisional); «no configurado» nunca lanza |
| `src/modulos/llm/llm.module.ts` | Create | Composición: `LLM_PORT → LlmGateway`; internos no exportados. No registrado en `AppModule` (Fase 07) |
| `src/modulos/llm/index.ts` | Create | Barril: `LlmModule`, `LLM_PORT`, tipos del puerto. Nada de `infraestructura/` ni del puerto interno |
| `src/plataforma/config/esquema.ts` | Modify | Variables D12 + `superRefine`: `OPENROUTER_API_KEY` en production, timeout conversacion < lock, modelos ⊆ precios (PLT1, LLM12, R15) |
| `.env.example` | Modify | Documenta cada `LLM_*` / `OPENROUTER_*` sin secretos |
| `prisma/schema.prisma` | Modify | `UsoLlm`: `@@index([creado])` (D10) + migración aditiva |
| `MODELO_DATOS.md` | Modify | §7 `uso_llm`: índice por `creado` (primero aquí, `openspec/config.yaml` §design) |
| `.dependency-cruiser.cjs` | Modify | Regla 13 `ai-solo-en-infraestructura-llm`: `ai`/`@openrouter/*` solo desde `src/modulos/llm/infraestructura/` (LLM11) |
| `test/fronteras/dependency-cruiser.spec.ts` | Modify | Fixture que viola la regla 13 (patrón de las 12 reglas) |
| `test/fakes/puerto-llm-falso.ts` | Create | `FakePuertoLlm` (éxito/error programables, fallback observable, modelo usado visible) para Fases 06–07 (proposal §Affected Areas) |
| `docs/adr/0013-cortacircuitos-en-memoria-pasarela-llm.md` | Create | ADR propuesta (D5) + índice en `docs/adr/README.md` |
| `src/modulos/conversaciones/**` | Sin cambio | `GENERADOR_RESPUESTA → AgenteEco` intacto (criterio de éxito) |
| `openapi/openapi*.json` | Sin cambio | Sin endpoints: `contrato:deriva` sigue verde sin regenerar |

## Interfaces / Contracts

```typescript
// src/modulos/llm/puertos/llm-port.ts — único contrato que conoce el llamador (LLM1, R1/R2)
export const LLM_PORT = Symbol('LLM_PORT');

export type RolMensajeLlm = 'usuario' | 'asistente';

export interface MensajeLlm {
  readonly rol: RolMensajeLlm;
  readonly texto?: string;
  /** Solo si rol === 'asistente' y el modelo llamó herramientas. */
  readonly llamadasHerramienta?: readonly LlamadaHerramienta[];
  /** Turno sintético de vuelta de tools (lo construye el bucle de la Fase 07). */
  readonly resultadosHerramienta?: readonly ResultadoHerramienta[];
}

export interface LlamadaHerramienta {
  readonly id: string;
  readonly nombre: string;
  readonly argumentos: unknown;
  /** Opaco ida y vuelta (p. ej. thoughtSignature); el gateway nunca lo lee (D8, B7). */
  readonly metadatosProveedor?: unknown;
}

export interface ResultadoHerramienta {
  readonly idLlamada: string;
  readonly nombre: string;
  readonly resultado: unknown;
  readonly esError: boolean;
}

export interface DefinicionHerramienta {
  readonly nombre: string;
  readonly descripcion: string;
  /** Zod (fuente) — el adaptador la entrega al AI SDK; el gateway no la interpreta (LLM2). */
  readonly esquema: z.ZodType<unknown>;
  readonly esquemaJson: Record<string, unknown>;
}

export type PerfilLlm = 'conversacion' | 'evals';

export interface SolicitudGeneracion {
  readonly perfil: PerfilLlm;
  readonly mensajes: readonly MensajeLlm[];
  /** Parámetro separado, nunca primer mensaje (D1). */
  readonly systemPrompt?: string;
  readonly herramientas?: readonly DefinicionHerramienta[];
  readonly conversacionId?: string;
}

export interface UsoReportado {
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly tokensCache: number;
}

export interface LlamadaInvalida {
  readonly llamada: LlamadaHerramienta;
  readonly causa: string; // mensaje de validación, sin datos del negocio
}

export interface RespuestaGeneracion {
  readonly texto?: string;
  readonly llamadasHerramienta?: readonly LlamadaHerramienta[]; // solo válidas (D13)
  /** Inválidas: el bucle (Fase 07) las devuelve al modelo como error de tool (LLM2). */
  readonly llamadasInvalidas?: readonly LlamadaInvalida[];
  readonly uso?: UsoReportado;
  /** Opaco (p. ej. usage accounting de OpenRouter como referencia); nunca se lee (D8). */
  readonly metadatosProveedor?: unknown;
}

export type CodigoErrorPasarela =
  | 'timeout'
  | 'no-reintentable'
  | 'circuito-abierto'
  | 'techo-alcanzado'
  | 'proveedor-caido';

export interface LlmPort {
  generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion>;
}
```

```typescript
// Error tipado (dominio/error-pasarela-llm.ts) — observable sin inspeccionar texto (LLM1)
export class ErrorPasarelaLlm extends Error {
  readonly codigo: CodigoErrorPasarela;
  readonly modelo?: string; // último modelo intentado, si hubo proveedor
  constructor(codigo: CodigoErrorPasarela, modelo?: string) { /* ... */ }
}
```

```typescript
// Puerto interno del adaptador (NO sale del módulo — LLM11)
export const ADAPTADOR_LLM = Symbol('ADAPTADOR_LLM');
export interface AdaptadorLlm {
  /** Exactamente UN intento contra el proveedor; nunca reintenta (restricción ADR-0002). */
  generarConModelo(
    modelo: string,
    solicitud: SolicitudGeneracion,
    limite: { maxTokens: number; abort: AbortSignal },
  ): Promise<{ texto?: string; llamadas?: LlamadaHerramienta[]; uso: UsoReportado; metadatos?: unknown }>;
}
```

Mapeo de errores del adaptador (HTTP OpenRouter / AI SDK → clase interna): 429/5xx/timeout/
aborto/sin-respuesta → `reintentable`; 400/401/403/404/422/`TypeValidation`/`NoSuchModel` →
`no-reintentable`. El gateway traduce a `CodigoErrorPasarela` con la precedencia: `techo-alcanzado`
(chequeo previo) > `circuito-abierto` (todos los modelos abiertos) > `proveedor-caido` (todos los
intentos sin respuesta HTTP) > último error (`timeout` / `no-reintentable`).

TSDoc solo en lo exportado por `llm.module.ts`/`index.ts` (`LlmPort`, `LLM_PORT`, casos de uso):
nada en `dominio/` ni `infraestructura/` (skill §11).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `calcularCostoEstimado` (micro-USD exactos, caché, ceros), `inicioMesUTC`, máquina del circuito (umbral/ventana/sonda con `ClockFalso`), `validarLlamadas` (válida pasa intacta; inválida → `llamadasInvalidas`, nunca `{}`) | Vitest `unit` junto al código; nombres `<LLM#> — <título exacto del escenario>` |
| Unit | `LlmGateway`: 2 reintentos solo 429/5xx/timeout, 4xx→siguiente modelo, fallback registra fallido+exitoso, CB abre y deja pasar sonda, techo bloquea sin proveedor, test-salta-techo, aviso 80 % una vez/mes, timeout < TTL, logs sin contenido/PII (logger real espiado) | `FakeAdaptadorLlm` programable por modelo + repos en memoria + `ClockFalso`; `AbortSignal` real para timeouts |
| Integration | Adaptador OpenRouter: mapeo mensajes/system/tools/`maxOutputTokens`, `usageAccounting` con caché, error 429/400→clase correcta, 1 solo intento (contador en el simulador) | Simulador HTTP local + `OPENROUTER_BASE_URL` override (`createOpenRouter({ baseURL })` lo soporta); sin key real, sin gastar |
| Integration | `RepositorioUsoLlmPrisma`: escritura éxito+error, best-effort (falla la BD → la respuesta igual se entrega + log), agregado mensual solo-mes-actual por proveedor/modelo, usa el índice | Postgres real vía Testcontainers (arnés `base-por-worker`) |
| Fronteras | Regla 13 `ai-solo-en-infraestructura-llm` + fixture violadora; resto de fronteras intactas | `npm run fronteras` (parte de `npm run verify`) |
| Contrato | Sin cambio: `contrato:deriva` verde sin regenerar (no hay endpoints) | `npm run verify` |
| E2E | Ninguno en esta fase (módulo no cableado; el e2e con LLM falso llega en la 07) | Explícito, no olvidado |

Cobertura: umbral 80 % líneas (`vitest.config.ts` ↔ `config.yaml` verify) sobre `unit`+`integracion`.

## Threat Matrix

N/A — sin borde de ruteo, comandos shell, subprocesos, automatización VCS/PR, clasificación de
archivos ejecutables ni integración de procesos: el gateway es una llamada HTTPS saliente a
OpenRouter vía AI SDK dentro del proceso NestJS, con abortos por `AbortSignal`. No se fabrica
ninguna tarea de este punto.

## Migration / Rollout

- Esquema: una migración aditiva (`@@index([creado])` en `uso_llm`); reversa = migración inversa,
  nunca edición. `MODELO_DATOS.md` §7 primero.
- Rollout sin riesgo por construcción (proposal §Rollback Plan): `llm` no se registra en `AppModule`
  ni toca `ProcesarTurno`; no fusionar = revertir. Las `LLM_*` en `.env.example` son inertes sin el
  módulo. Sin datos en producción (P7, corte en Fase 10).
- Review requerida: **RDD + judgment-day** (06 está en 04/05/06/10) antes de `sdd-verify`.

## Open Questions

- [ ] Texto definitivo de `mensaje_techo_gasto` (negocio; el default provisional embebido es
  «Estamos con alta demanda en este momento. Te derivo con un asesor que te atiende enseguida.»).
  No bloquea: el mecanismo (D9) funciona con el provisional.
- [ ] Modelos de respaldo concretos → los elige la Fase 07 con las evals (ADR-0002; ya decidido).
- [ ] Refrescar `LLM_PRECIOS_USD_JSON` contra las páginas de OpenRouter al implementar (T-apply).
