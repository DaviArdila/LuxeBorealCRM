# Proposal: Fase 06 — Pasarela LLM

- Change: `fase-06-pasarela-llm` · Fase de la hoja de ruta: **06** (`docs/fases/README.md`)
- Rama: `fase-06-pasarela-llm` · Fecha: 2026-09-28 · Estado: **spec en revisión** (proposal redactada,
  pendiente de respuestas bloqueantes Q1–Q4 antes de `sdd-spec`)
- Depende de: **Fases 00a, 00b, 01, 02, 03, 04 y 05, cerradas** (plataforma: config Zod, reloj, colas
  BullMQ, `PrismaService`, observabilidad con redacción; esquema v1 con la tabla `uso_llm` ya migrada
  desde la Fase 01; módulo `conversaciones` con `GENERADOR_RESPUESTA` + `AgenteEco` como *stand-in* y
  la advertencia heredada de su `verify-report.md`: `LockTurno` sin heartbeat con TTL 30 s frente a
  latencias reales de LLM)
- Insumo principal: exploración de esta sesión (Engram `sdd/fase-06-pasarela-llm/explore`, id 124)
  sobre `../ChatLuxeCRM` (`llm/*`, `motor/*`, `SPEC.md` §3.6 y §7 del prototipo) contrastada con
  `docs/migracion/inventario.md` (fila `llm/*` → Fase 06), `docs/analisis/01-analisis-chatluxecrm.md`
  (**A1, A2, A7**), `docs/analisis/02-investigacion.md` §3, `docs/adr/0002-pasarela-llm.md` (aceptada),
  `openspec/specs/{conversaciones,agente,privacidad,configuracion-negocio}/spec.md`
  (**R1, R2, R13, R14, R15**), `MODELO_DATOS.md` §7 (`uso_llm`), la fila 06 de `docs/fases/README.md`
  y `docs/PREGUNTAS_ABIERTAS.md` (**P17** bloqueante parcial, P6/P9 resueltas).

## Intent

El bot no puede razonar ni usar herramientas sin un LLM, pero hoy no existe ningún código de LLM en
este repo (`modulos/llm` no existe, `LlmPort` no existe, `ai`/`@openrouter/ai-sdk-provider` no están
en `package.json`, y `src/plataforma/config/esquema.ts` no tiene ninguna variable de LLM). El
prototipo resuelve esto con dos defectos de fondo: cada proveedor tiene **su propio cliente escrito
a mano con su reintento copiado** (**A7** — Gemini ni siquiera reintenta timeouts, causa de los
fallos reales del 2026-09-22 citada en ADR-0002), y la elección de proveedor/mock se hace **al
importar con flags `MOCK_*`** (**A1, A2**). No hay fallback entre modelos, ni registro de costo, ni
techo de gasto ejecutable.

Esta fase construye la **pasarela**: `LlmPort` (tipos propios) → `LlmGateway` (timeout, reintento,
circuit breaker, fallback por perfil, registro en `uso_llm`, techo P17) → adaptador AI SDK sobre
OpenRouter (GPT-5.6 Luna + respaldos), exactamente las capas que ya decidió ADR-0002. No adelanta el
motor: el *binding* de `GENERADOR_RESPUESTA` sigue en `AgenteEco` y el motor real (política,
herramientas, prompts) es la Fase 07.

Éxito = la verificación de salida de la fila 06 de `docs/fases/README.md`: **misma conversación
contra 2 modelos cambiando solo configuración; fallback probado; registro en `uso_llm`** — ejercido
directamente contra `LlmPort`, sin pasar todavía por el pipeline de turnos.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Capas | `LlmPort` (tipos propios) → `LlmGateway` (timeout, reintento, circuit breaker, uso/costo, trazas) → adaptador AI SDK + `@openrouter/ai-sdk-provider` | ADR-0002 (aceptada) |
| Modelo principal | `openai/gpt-5.6-luna` (0,20/1,20 USD por M; caché lectura 0,02) | ADR-0002; P6 resuelta |
| Respaldo nivel 1 | Gateway itera los modelos del perfil en orden, una llamada por modelo (no el parámetro server-side `models` de OpenRouter — corregido 2026-09-28, ver nota) | ADR-0014 (propuesta), matiza ADR-0002 |
| Respaldo nivel 2 (proveedor directo último recurso) | **Opcional; se decide en esta fase** → ver Q4 | ADR-0002 |
| Respaldos concretos | Se eligen en la Fase 07 con las evals (un modelo de otra empresa como segundo) | ADR-0002 |
| Configuración por perfil | `conversacion` / `evals`: lista de modelos, timeout, `max_tokens`, reintentos; cambiar de modelo = cambiar config + correr evals | ADR-0002; skill `luxeboreal-arquitectura` §6 |
| Prohibiciones | SDKs de proveedores fuera de `modulos/llm/infraestructura`; reintentos dentro de adaptadores; convertir en silencio argumentos de herramientas inválidos (→ error de tool al modelo) | ADR-0002 |
| Caché de prompts | Prefijo estable (reglas + herramientas + catálogo) antes que lo variable | ADR-0002; el prefijo real lo construye la Fase 07 |
| Tabla de costo | `uso_llm` ya existe en el esquema (Fase 01): `proveedor, modelo, tokens_entrada/salida/cache, costo_estimado_usd decimal(12,6), latencia_ms, exito`, `conversacion_id? SetNull` | `MODELO_DATOS.md` §7; ADR-0004; P9 resuelta |
| Techo del negocio | 20 USD/mes entre VPS, LLM y Meta; límite de la consola del proveedor como segundo freno | **R13** (`openspec/specs/conversaciones/spec.md`); P9 resuelta |
| Comportamiento al techo desde el código | **Pendiente de decisión** → ver Q1–Q3 (**P17**) | `docs/PREGUNTAS_ABIERTAS.md` P17 |
| R1/R2/R14/R15 | El gateway es agnóstico al contenido: transporta definiciones y llamadas de herramientas sin interpretarlas (nunca calcula dinero, nunca accede a datos); MUST NOT loguear prompts/respuestas enteras ni PII; textos al cliente y parámetros son datos (**R15**) | `openspec/specs/{agente,privacidad,configuracion-negocio}/spec.md` |
| Registro de costo | Se escribe **siempre** (éxito y error); ante duda, mejor fila duplicada auditable que turno sin costo (nunca-perder > nunca-duplicar) | *Learned* del `verify-report.md` de la Fase 05 |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas | Preflight de esta sesión |
| Review | RDD por commit **y `judgment-day` obligatorio antes de cerrar** (06 está en la lista 04/05/06/10) | Regla 6 de `docs/fases/README.md` |

> **Nota (2026-09-28)**: la fila "Respaldo nivel 1" de esta tabla decía originalmente "OpenRouter,
> parámetro `models` en orden de prioridad" citando solo ADR-0002. `sdd-design` (Decision D2)
> encontró que ese mecanismo no puede cumplir LLM5/LLM6 (fila por intento en `uso_llm`) y decidió
> que el gateway itera los modelos en vez de delegar en `models`. La fila de esta tabla se corrigió
> para reflejar esa decisión real; el resto de "Decisiones ya tomadas" no cambia. Detalle:
> `docs/adr/0014-fallback-llm-iterado-en-gateway.md` (propuesta).

## Scope

### In Scope

1. **`LlmPort` + tipos propios** (`modulos/llm/puertos`): mensajes, definición de herramientas
   (esquema Zod + JSON Schema, sin nombres concretos — el bucle no conoce nombres, §6 de la skill),
   respuesta (`texto?`, `llamadasHerramienta?`, `uso?`), error tipado de pasarela (timeout,
   no-reintentable, circuito abierto, techo alcanzado, OpenRouter caído). Conserva la idea correcta
   del prototipo (**B7**): el proveedor devuelve `metadatos` opacos que el llamador solo transporta.
2. **`LlmGateway`** (aplicación): timeout por perfil, reintento con backoff solo ante
   429/5xx/timeout/abort (nunca 4xx salvo 429; a diferencia del `geminiClient` del prototipo, los
   timeouts SÍ se reintentan), máximo 2 reintentos, circuit breaker, cadena de fallback por perfil,
   registro en `uso_llm` en éxito y en error, consulta de gasto mensual para el techo P17, trazas sin
   contenido (R14).
3. **Adaptador AI SDK sobre OpenRouter** (`modulos/llm/infraestructura`): único lugar donde aparecen
   `ai` y `@openrouter/ai-sdk-provider`; sin reintentos propios (restricción ADR-0002, no una opción).
4. **Configuración por perfil** (`conversacion`, `evals`) validada con Zod en `plataforma/config`:
   lista de modelos, timeout, `max_tokens`, reintentos, más `LLM_TECHO_MENSUAL_USD` y
   `LLM_UMBRAL_AVISO_PCT` una vez resueltas Q1–Q2. Primera tarea (T1): verificación de compatibilidad
   de `ai` + provider OpenRouter con NestJS 12 ESM (mismo procedimiento que BullMQ en la Fase 00a,
   enmienda ADR-0001).
5. **Repositorio `uso_llm`** (infraestructura de `llm`, sobre la tabla ya migrada): escritura
   idempotente-best-effort con el criterio nunca-perder > nunca-duplicar; lectura agregada de gasto
   mensual por proveedor/modelo para el techo y futuros reportes.
6. **Techo de gasto P17** (mecanismo; valores en Q1–Q3): al superar el umbral, aviso al equipo; al
   100 %, el gateway NO llama al LLM y devuelve el error tipado `techo-alcanzado` para que el turno
   derive a humano con el texto configurable (el consumo de ese error —handoff + texto— lo construye
   la Fase 07/08; esta fase deja el error y el texto-parámetro listos).
7. **Nivel 2 directo**: el gateway expone el punto de extensión (último recurso opcional); si Q4 sale
   "posponer", no se implementa ningún proveedor directo en esta fase.
8. **Cierre**: `judgment-day` sobre el rango de commits antes de `sdd-verify`; `verify-report.md` con
   la sección "Qué aprendimos que cambia las fases siguientes".

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Motor real (pipeline de políticas, bucle de herramientas, `A5`) | 07 | Regla 3 de `docs/fases/README.md`; el *binding* `GENERADOR_RESPUESTA` sigue en `AgenteEco` (CNV6) |
| Las 6 herramientas con efectos tipados y sus envoltorios | 07 | Inventario (`tools/*`); la lógica de `obtenerFicha`/`cotizarEnvio` ya migró en la Fase 02 |
| Prompts versionados (`agente/prompts/*.md`, prefijo estable) | 07 | Inventario (`motor/systemPrompt.ts`) |
| Historial de turnos para el LLM (Redis efímero vs. API Chatwoot) | 07 | P3: nunca en Postgres; se decide midiendo latencia |
| Modelos de respaldo concretos | 07 | ADR-0002: se eligen con las evals |
| Consumo del error de pasarela (handoff + texto de cortesía ante fallo del LLM) | 07 | El gateway devuelve el error tipado; el motor lo mapea (equivale al `mensaje_error_llm` del prototipo, como parámetro **R15**) |
| Tope de turnos, agrupación de mensajes, collage (R13 resto) | 07 | Fila R13: 05 parcial → 06 costo → 07 agrupación/tope |
| Contador de audio consecutivo (R12) | 07 | Ya pospuesto en la proposal de la Fase 05 |
| Calificación/disparo real de handoff, Telegram, recordatorios | 08 | Inventario (`leads/*`, `telegram/*`) |
| Límite de la consola del proveedor como segundo freno | 09 | Operación (R13); P9 resuelta |
| Endpoints nuevos | — | Esta fase no agrega ni cambia endpoints: sin deriva de contrato OpenAPI esperada (a confirmar en `sdd-design`) |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `llm/tipos.ts` (`LlmClient`: `generar({mensajes, systemPrompt, tools})`, `uso?`, `metadatosProveedor` opaco) | **Conservar** (idea) | `modulos/llm/puertos` (`LlmPort`, tipos propios) | **B7**: la interfaz es correcta; se reescribe la forma (token DI, sin tipos del SDK) |
| `llm/llmClient.ts` (fábrica `MOCK_LLM` / `LLM_PROVEEDOR`) | **Rediseñar** | Token DI + fakes en `test/fakes/` | **A2** (flags `MOCK_*` en producción, prohibidos por `config.yaml` §apply) + **A1** (elección al importar, sin DI) |
| `llm/geminiClient.ts` (SDK a mano, reintento solo 429/5xx, sin costo/fallback/circuit breaker) | **Rediseñar** | Adaptador AI SDK/OpenRouter + `LlmGateway` | **A7** (reintento copiado por proveedor); además no reintenta timeouts —causa de fallos 2026-09-22— y el gateway sí los reintenta |
| `llm/xaiClient.ts` (`fetch` a mano; args JSON inválidos → `{}` en silencio) | **Rediseñar** | Mismo adaptador + gateway | **A7**; la conversión silenciosa queda **prohibida** (ADR-0002: error de tool al modelo) |
| `llm/llmClient.mock.ts` + `helpers/llmClientTest.ts` (`vi.spyOn(llmClient, 'generar')`) | **Descartar** (forma) | Fakes inyectados por DI en `test/fakes/` | **A2**; los tests se reescriben en el nivel correcto, no se copian |
| `motor/motor.ts`, `bucleHerramientas.ts`, `enrutadorTipoMensaje.ts`, `contextoInicial.ts` | **Posponer** | `agente/`, Fase 07 | **A5** (políticas implícitas en `if`s); regla 3 |
| `motor/systemPrompt.ts` (REGLAS_BASE R1/R2, catálogo compacto, textos con defaults en código) | **Posponer** | `agente/prompts/*.md`, Fase 07 | Prefijo estable para caché (ADR-0002); los defaults en código se vuelven parámetros **R15** |
| `motor.ts:116` (texto `mensaje_error_llm` ante fallo) | **Posponer** (consumo) | Fase 07 mapea el error tipado del gateway a handoff + texto-parámetro | El gateway devuelve el error; no elige textos |
| `estado/historial.ts` (últimos turnos para el LLM) | **Posponer** | Fase 07 (Redis efímero o API Chatwoot) | P3; inventario |
| `SPEC.md` §3.6 del prototipo (backoff 429/5xx máx. 2, timeout 15 s) | **Rediseñar** | Resiliencia del gateway por perfil | Se conserva la política y se corrige el hueco (timeouts reintentables); el default exacto del timeout va en Q5 |
| `SPEC.md` §7 del prototipo (frenos: `max_tokens` 400, historial 6, rate 20/h 60/día, techo) | **Parcial** | `max_tokens` → perfil LLM (esta fase); rate → ya migrado Fase 05; historial/tope turnos → 07; techo → esta fase (P17) | Cada freno vive donde se ejecuta |
| Tests del prototipo de reintento/backoff de `gemini`/`xai` y `helpers/llmClientTest` | **Reescribir** | Tests unitarios del gateway (perfil falso) + integración del adaptador (OpenRouter simulado) | Regla de migración: reescribir, no copiar |
| `tests/motor/*`, `tests/tools/*`, resto de `tests/estado/*` | **Posponer** | Fase 07 | Necesitan motor y herramientas reales |
| `tests/queue/{debounce, idempotencia}`, `tests/rateLimit` | Ya migrados | Fase 05 | Solo se listan para no reclamarlos dos veces |

## Capabilities

### New Capabilities

- `llm`: dominio nuevo (**R13** escenario "Costo de cada llamada al LLM registrado"; base de R1/R2
  para la Fase 07). Prefijo de requisito sugerido `LLM#` (a confirmar en `sdd-spec`, sin colisión con
  `CAN#`/`CNV#`).

### Modified Capabilities

- `conversaciones`: el escenario R13 "Costo de cada llamada al LLM registrado" pasa a implementado
  por esta fase (el escritor es el gateway; `conversaciones` no cambia de comportamiento y su
  `spec.md` vigente no se toca salvo esa marca de fase). Si `sdd-spec` confirma que basta con eso,
  el delta es de trazabilidad, no de requisitos.

## Approach

1. **T1 — Compatibilidad primero**: `ai` + `@openrouter/ai-sdk-provider` bajo NestJS 12 ESM
   (enmienda ADR-0001, mismo procedimiento que BullMQ en la Fase 00a). Si falla, fallback a NestJS 11
   según ADR-0001 antes de escribir una línea de dominio.
2. **Puerto + dominio puro**: `LlmPort`, tipos de mensajes/herramientas/uso, error tipado, cálculo de
   costo estimado por modelo (tabla en config del perfil, nunca en el LLM — **R2**), agregación de
   gasto mensual. Funciones puras con `Clock` inyectado; `Date.now()` prohibido fuera de
   `plataforma/reloj`.
3. **Gateway**: timeout → reintento (429/5xx/timeout/abort, máx. 2, backoff) → siguiente modelo del
   perfil (nivel 1) → extensión nivel 2 (según Q4) → error tipado. `uso_llm` se escribe siempre.
4. **Adaptador OpenRouter**: mapeo tipos propios ↔ AI SDK; sin reintentos, sin log de contenido
   (**R14**: `redact` ya cubre la plataforma, pero el gateway nunca emite prompts/respuestas a logs).
5. **Configuración**: perfil `conversacion`/`evals` + (tras Q1–Q2) techo y umbral; `.env.example`
   documenta cada variable nueva (sin secretos reales).
6. **Techo P17**: implementación del mecanismo contra los valores aprobados en Q1–Q3; sin esas
   respuestas la spec **se detiene** (`config.yaml` §proposal).
7. **Cierre**: `judgment-day` sobre el rango de commits antes de `sdd-verify`.

Decisiones que `sdd-design` debe resolver (no de producto): forma exacta del `LlmPort` (¿`systemPrompt`
como parámetro o como primer mensaje del sistema?); tabla de costo estimado por modelo (fuente y
formato); estrategia de circuit breaker (ventana, umbral, semi-abierto) y su estado (memoria vs.
Redis); si la consulta de gasto mensual va por repositorio `uso_llm` en cada llamada o con caché de
corta vida; formato de `metadatosProveedor` opacos; cómo se prueba el fallback nivel 1 sin gastar
(servidor OpenRouter simulado vs. fakes del adaptador).

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) compat ESM + puerto y tipos
+ tests, (b) gateway (timeout/reintento/fallback/circuit breaker) + tests, (c) adaptador AI SDK +
config por perfil + tests, (d) repositorio `uso_llm` + gasto mensual + techo P17 + cierre documental.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `src/modulos/llm/` | New | Puertos (`LlmPort` + token), aplicación (`LlmGateway`), infraestructura (adaptador AI SDK/OpenRouter, repositorio `uso_llm`), `llm.module.ts` (exporta `LLM_PORT`; NO se registra aún en `AppModule` ni se conecta a `ProcesarTurno` — eso es Fase 07) |
| `src/plataforma/config/` | Modified | Variables `LLM_*` por perfil (`conversacion`/`evals`) + techo/umbral (tras Q1–Q2), validadas con Zod |
| `package.json` | Modified | Deps nuevas de producción: `ai`, `@openrouter/ai-sdk-provider` (versiones fijadas tras T1) |
| `.env.example` | Modified | Documenta cada variable `LLM_*` (sin valores reales; el `.env` real nunca se commitea) |
| `prisma/schema.prisma`, `MODELO_DATOS.md` | Sin cambio esperado | `uso_llm` ya existe desde la Fase 01; a confirmar en `sdd-design` si falta algún índice (p. ej. por `modelo, creado` para el agregado mensual) |
| `src/modulos/conversaciones/` | Sin cambio | El *binding* `GENERADOR_RESPUESTA → AgenteEco` queda intacto; la Fase 07 lo reemplaza |
| `test/fakes/` | New | Fake de `LlmPort` (éxito/error programables, fallback observable) para las Fases 06–07 |
| `openspec/specs/llm/` | New (al archivar) | Delta nuevo |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modified | Al archivar (fila `llm/*` → migrada) |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `ai` / provider OpenRouter incompatibles con NestJS 12 ESM | Media | T1 lo verifica antes que el dominio (procedimiento ADR-0001); fallback a NestJS 11 ya previsto en ADR-0001 |
| P17 sin respuesta detiene la spec (regla `config.yaml` §proposal) | Alta | Q1–Q3 con defaults propuestos en esta proposal; el resto de la fase (gateway, adaptador, costo) avanza en diseño igual, el techo se implementa al aprobarse |
| Timeout del perfil `conversacion` vs. `LOCK_TURNO_TTL_S=30 s` heredado de la Fase 05 (un LLM lento supera el lock del turno) | Media | El timeout por defecto MUST ser menor que el TTL del lock (ver Q5); `sdd-design` lo valida con números; la Fase 07 reevalúa el TTL con latencias reales |
| Slice del gateway supera las ~400 líneas (lógica + tests de resiliencia) | Media | Cuatro slices del Approach; `size:exception` citando esta fila si el slice (b) lo excede por naturaleza |
| Fuga de PII/contenido a logs o a `uso_llm` | Media | El gateway nunca loguea prompts/respuestas; `uso_llm` solo guarda conteos, modelo y latencia; foco explícito de `judgment-day` y de `sdd-verify` |
| OpenRouter como punto único de falla si Q4 sale "posponer" | Media | Error tipado `proveedor-caido` que la Fase 07 mapea a handoff (degradación visible, nunca silencio); Q4 deja la puerta abierta a reabrirlo con evidencia |
| Costo de probar contra el LLM real | Baja | Unit/integración siempre contra fakes y OpenRouter simulado; corrida manual con LLM real solo bajo demanda (mismo criterio que las evals de la Fase 07) |
| Defaults de la Fase 02 sin confirmar (recargo 0 %, mensaje fuera de cobertura) contaminan futuras evals | Baja (para esta fase) | No bloquea la pasarela (el gateway no interpreta contenido); se reitera el aviso en el `verify-report.md` para la Fase 07 |

## Rollback Plan

- Todo vive en la rama `fase-06-pasarela-llm`, slices apilados (`stacked-to-main`). Revertir = no
  fusionar la cadena, o `git revert` del commit de la slice afectada.
- **Impacto de reversa casi nulo por construcción**: el módulo `llm` no se registra en `AppModule`
  ni se conecta a `ProcesarTurno` en esta fase (`AgenteEco` sigue siendo el generador); revertir el
  código deja el sistema exactamente como estaba, sin comportamiento que apagar.
- Sin migración de esquema esperada (`uso_llm` existe desde la Fase 01); si `sdd-design` agrega un
  índice, su reversa es una migración aditiva inversa, nunca editando la aplicada.
- Las dependencias nuevas (`ai`, `@openrouter/ai-sdk-provider`) se retiran de `package.json` con la
  reversa; las variables `LLM_*` de `.env.example` son inertes sin el módulo.
- No hay datos en producción ni tráfico real (el corte es la Fase 10); P7 sigue aplicando.

## Dependencies

- Fases 00a, 00b, 01, 02, 03, 04 y 05 cerradas (verificadas: `archive/` las contiene todas).
- Docker con Postgres + Redis (Testcontainers) para integración.
- Paquetes nuevos `ai` + `@openrouter/ai-sdk-provider` (compat ESM a verificar en T1).
- Clave de OpenRouter solo para una eventual prueba manual puntual (no para CI); la pide `sdd-apply`
  si la necesita, nunca se commitea.

## Preguntas abiertas

**Q1–Q4 son bloqueantes**: sin Q1–Q3 no se puede especificar el techo P17, y sin Q4 no se cierra el
alcance del gateway. La proposal se detiene en esos puntos (`config.yaml` §proposal) y el resto del
diseño avanza igual.

| # | Pregunta | Recomendación | Efecto si se acepta |
|---|---|---|---|
| Q1 | **(P17)** ¿Cuál es el techo mensual de gasto de LLM en USD? Nótese que R13 fija 20 USD/mes para VPS+LLM+Meta juntos, no la porción del LLM | **10 USD/mes** como sub-presupuesto del LLM dentro de esos 20, configurable sin desplegar (`LLM_TECHO_MENSUAL_USD` + parámetro editable, **R15**); en `NODE_ENV=test` el techo se desactiva | El gateway compara el gasto mensual sumado de `uso_llm` contra este valor |
| Q2 | **(P17)** ¿A qué umbral se avisa al equipo, y por qué vía? | **80 %**, vía **log estructurado de severidad `warn` + fila observable** (el aviso a Telegram llega con `notificaciones/` en la Fase 08; no se adelanta) | El gateway emite el aviso una vez por mes al cruzar el umbral |
| Q3 | **(P17)** ¿Con qué texto se deriva a humano al llegar al 100 %, y con qué clave de parámetro? | Clave **`mensaje_techo_gasto`**, texto a definir por el negocio (default provisional: aviso de alta demanda + derivación a un asesor, editable sin desplegar, **R15**) | El gateway devuelve `techo-alcanzado` sin llamar al LLM; la Fase 07/08 lo consume con ese texto |
| Q4 | **(ADR-0002, nivel 2)** ¿Se implementa ahora un proveedor directo como último recurso ante caída total de OpenRouter, o se pospone dejando el punto de extensión? | **Posponer**: una sola clave/factura, el nivel 1 iterado en el gateway (ADR-0014) ya cubre caídas de proveedores individuales; ante caída total, error tipado → handoff en la Fase 07 | Alcance cerrado sin segundo proveedor; el gateway deja la interfaz del último recurso lista |
| Q5 | (No bloqueante, para `sdd-design`) ¿Timeout por defecto del perfil `conversacion`? El prototipo documenta 15 s (`SPEC.md` §3.6) pero el `.env` real usa 30 s, y el lock de turno de la Fase 05 expira a los 30 s | **15 s** (el valor documentado), con `max_tokens` y reintentos heredados del prototipo salvo que las evals de la Fase 07 digan otra cosa | El timeout MUST quedar por debajo de `LOCK_TURNO_TTL_S`; `sdd-design` lo fija con números |

## Success Criteria

- [ ] `LlmPort` existe con tipos propios; ningún SDK de proveedor fuera de
  `modulos/llm/infraestructura` (verificado por `npm run fronteras`).
- [ ] Misma conversación contra 2 modelos cambiando solo configuración (perfil), sin tocar código.
- [ ] Fallback nivel 1 probado: cae el primer modelo del perfil, el gateway responde con el
  siguiente sin intervención del llamador (ADR-0014).
- [ ] Cada llamada (éxito y error) deja su fila en `uso_llm` con proveedor, modelo, tokens,
  costo estimado, latencia y resultado — **R13**.
- [ ] Ante 429/5xx/timeout hay como máximo 2 reintentos con backoff; ante 4xx (salvo 429) no hay
  reintento; los adaptadores nunca reintentan por su cuenta.
- [ ] Techo P17 con los valores aprobados en Q1–Q3: aviso al 80 %, cero llamadas al LLM al 100 % y
  error tipado `techo-alcanzado`.
- [ ] Ningún log contiene prompts, respuestas ni PII — **R14** (verificado por test de redacción).
- [ ] `GENERADOR_RESPUESTA` sigue ligado a `AgenteEco`: el pipeline de la Fase 05 no cambia de
  comportamiento en esta fase.
- [ ] `npm run verify` en verde; cada escenario del delta `llm` tiene su test nombrado
  `<id> — <título>` y pasa.
- [ ] `judgment-day` corrido sobre el rango de commits de la fase, con veredicto en
  `verify-report.md`.
