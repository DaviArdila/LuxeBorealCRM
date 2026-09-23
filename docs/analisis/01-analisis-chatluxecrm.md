# 01 · Análisis de arquitectura de ChatLuxeCRM (prototipo)

- Fecha: 2026-09-22
- Alcance: `../ChatLuxeCRM` completo (src, tests, prisma, docs, infra). ~5.200 líneas de TypeScript en
  `src/`, 199 tests de integración + 2 e2e, 8 ADR, SPEC v2.3.
- Propósito: saber qué hay, qué está bien, qué está mal y por qué, para decidir qué se migra a
  LuxeBorealCRM (NestJS) y cómo. El inventario de migración que sale de aquí está en
  `docs/migracion/inventario.md`.

> Resumen en una frase: **el prototipo funciona y tiene más disciplina que la mayoría de prototipos**
> (reglas de negocio explícitas, ADR, tests contra base real, idempotencia, máquina de estados),
> pero su "arquitectura" se sostiene con **convenciones escritas** y no con **estructura del código**:
> singletons que se crean al importar, módulos que se llaman en ambos sentidos, un orquestador que
> lo sabe todo y un dominio que habla el idioma de Chatwoot. Eso es lo que NestJS debe resolver.

---

## 1. Cómo está conformado hoy

```
Meta Cloud API ─▶ Chatwoot (dueño del webhook, bandeja humana)
                     │ Agent Bot webhook firmado
                     ▼
Express  POST /webhook/chatwoot ── firma, dedupe, decide estado, buffer ──▶ BullMQ "chat" (debounce)
                                                                             │
                                          chatWorker (lock por número) ◀─────┘
                                             │
                                             ▼
                               motor.generarRespuesta()  ── horario, no-textuales, captura,
                                             │               tope de turnos, system prompt
                                             ▼
                               bucleHerramientas ⇄ LlmClient (gemini | xai | mock)
                                             │        └─ 6 tools → repositorios → Prisma → Postgres
                                             ▼
                               enviarMensaje() idempotente → API Chatwoot
                               derivarAHumano() → máquina de estados → Chatwoot status + Telegram
```

Un solo proceso Node: Express + 3 workers BullMQ (chat, reactivación, leads) + jobs repetibles.
Estado caliente en Redis (estado bot/humano, buffer, historial, locks, dedupe, captura), durable en
Postgres (catálogo, contactos, leads, espejo del estado). 22 carpetas en `src/` organizadas por
feature.

### Lo que está bien y se conserva (como regla o como diseño)

| # | Acierto | Dónde | Por qué vale la pena conservarlo |
|---|---|---|---|
| B1 | El LLM nunca calcula dinero: las tools devuelven texto ya formateado | `tools/obtenerFicha.ts`, `lib/dinero.ts` | Es la guardia anti-alucinación más importante del sistema |
| B2 | El LLM solo accede a datos por 6 tools con Zod + JSON Schema | `tools/*` | Superficie cerrada, auditable |
| B3 | Calificación de leads híbrida: el LLM propone, una escala determinista decide | `leads/calificar.ts`, `marcarLeadCaliente.ts` | Evita derivaciones "por entusiasmo" del modelo |
| B4 | Máquina de estados bot/humano con vencimiento (ADR-008) y tres capas anti-sobreescritura | `estado/`, SPEC §4 | Es el corazón del producto; fue calibrada con uso real |
| B5 | Idempotencia de salida por paso (`enviado:<id>:<paso>`) | `chatwoot/enviarMensaje.ts` | Un reintento nunca duplica mensajes al cliente |
| B6 | Debounce por número + lock | `queue/chatQueue.ts`, `estado/lock.ts` | Agrupa ráfagas en una llamada al LLM |
| B7 | Interfaz `LlmClient` agnóstica de proveedor | `llm/tipos.ts` | La idea es correcta; la ejecución se mejora (§3, A7) |
| B8 | Reloj inyectable | `lib/tiempo.ts` | Hace testeables TTL, horario y debounce |
| B9 | Tests contra Postgres y Redis reales | ADR-007 | Detectan lo que un mock oculta (enums, locks, TTL) |
| B10 | ADR + SPEC + MODELO_DATOS como fuentes de verdad separadas | `docs/` | Base del método de documentación del proyecto nuevo |
| B11 | Nada de PII en logs (`enmascarar`) | `lib/numero.ts` | Requisito legal y de sentido común |
| B12 | Cálculo de envío por peso facturable, puro y testeado | `envios/calculo.ts` | Lógica de negocio limpia: se migra casi tal cual |

---

## 2. Antipatrones encontrados

Cada uno con evidencia concreta, impacto y la corrección que se propone en LuxeBorealCRM.
Severidad: **Alta** = bloquea escalar/testear o puede perder mensajes; **Media** = frena el cambio;
**Baja** = higiene.

### A1 · Efectos al importar y singletons globales — Alta

- **Evidencia:** `config/env.ts` lanza una excepción al importarse si falta una variable;
  `queue/connection.ts` abre la conexión a Redis al importarse (15 archivos la importan);
  `llm/llmClient.ts` elige el proveedor al importarse; `chatQueue` crea la `Queue` al importarse.
- **Impacto:** importar cualquier módulo arrastra Redis y el `.env`. Por eso **todo** test necesita
  Redis real, incluso los de lógica pura, y la suite tarda ~120 s en serie. No se puede tener dos
  configuraciones en el mismo proceso (p. ej. dos proveedores de LLM).
- **En NestJS:** todo es un *provider* construido por el contenedor de DI; la configuración se
  valida una vez en `ConfigModule` y se inyecta. Los módulos no abren conexiones al importarse.

### A2 · Variables de entorno como mecanismo de inyección (`MOCK_*`) — Media

- **Evidencia:** `MOCK_LLM`, `MOCK_CHATWOOT`, `MOCK_TELEGRAM`, `MOCK_META` eligen implementaciones
  dentro del código de producción (`llmClient.ts:22`, `chatwootClient.ts`, …).
- **Impacto:** el código de producción conoce a sus dobles de prueba; un error de configuración en
  producción activa un mock en silencio.
- **En NestJS:** un token de inyección por puerto (`LLM_PORT`, `CANAL_SALIDA`, `NOTIFICADOR`) y los
  tests hacen `overrideProvider(...)`. Los "modos de desarrollo" (sin Chatwoot, sin LLM) se
  resuelven con un módulo de *fakes* que solo se registra en `NODE_ENV=development|test`.

### A3 · Dependencias en ambos sentidos entre capas — Alta

- **Evidencia:** `estado/maquinaEstados.ts` importa `queue/chatQueue` (para cancelar jobs) y
  `chatwoot/chatwootClient` (para espejar status); `queue/chatWorker.ts` importa `estado`, `motor`,
  `leads`, `chatwoot` y `meta`; `motor/catalogoCompacto.ts` importa la conexión Redis de `queue/`.
  `docs/ARQUITECTURA.md` dibuja capas, pero el código no las respeta y nada lo verifica.
- **Impacto:** cambiar la cola o Chatwoot toca la máquina de estados; no hay forma de probar la
  máquina de estados sin cola ni Chatwoot.
- **En NestJS:** la máquina de estados **emite eventos de dominio** (`ConversacionCedidaAHumano`,
  `ConversacionDevueltaAlBot`); la cola y el canal **escuchan**. Fronteras verificadas en CI con
  `dependency-cruiser` (o `eslint-plugin-boundaries`).

### A4 · Estado mutable compartido entre tools y casos especiales en el bucle — Media

- **Evidencia:** `tools/tipos.ts:9` `EstadoTurno` lo mutan las tools (`turno.leadDerivadoId = …`,
  `sinCobertura`, `datosGuardados`) y lo lee el motor al final. `bucleHerramientas.ts:106-128`
  trata `enviar_fotos` con `if (llamada.nombre === "enviar_fotos")`, porque es la única tool que
  además produce mensajes salientes.
- **Impacto:** acoplamiento implícito; agregar una tool con efectos obliga a editar el bucle
  (viola abierto/cerrado). Mezcla tools de consulta con tools de comando.
- **En NestJS:** cada tool devuelve `{ paraElModelo, efectos[] }`. Los efectos son un tipo cerrado
  (`EnviarAdjunto`, `LeadConfirmado`, `SinCobertura`, `DatosCapturados`) que el orquestador
  aplica al final del turno. El bucle no conoce nombres de tools.

### A5 · Orquestador "dios" con política implícita — Media

- **Evidencia:** `motor/motor.ts` `generarRespuesta()` decide horario, mensajes no textuales,
  petición de persona, captura fuera de horario, tope de turnos, contexto, prompt, bucle, y
  cuatro salidas distintas de handoff/aviso; además repite textos por defecto en código
  (`motor.ts:31`, `:36`, `:116`, `systemPrompt.ts:25`, `:45`) que ya deberían venir de `parametro`.
- **Impacto:** el orden de las reglas es el orden de los `if`; cambiar una política es leer 160
  líneas. Los textos por defecto duplicados contradicen la regla 12 del propio CLAUDE.md.
- **En NestJS:** un *pipeline* de pasos explícitos (`PoliticaTurno[]`: no-textuales → kill switch →
  petición de persona → tope → agente), cada uno una clase pequeña y testeable que puede cortar el
  turno. Los textos viven en una sola fuente (tabla + semilla), sin copias en código.

### A6 · Máquina de estados que no se hace cumplir y doble escritura no atómica — Alta

- **Evidencia:** `maquinaEstados.ts:59-63` — una transición fuera del mapa válido solo emite un
  `warn` y **se permite igual**. `transicionar()` escribe Redis y luego Postgres sin transacción;
  Redis es la fuente de verdad y Postgres el espejo.
- **Impacto:** el mapa de transiciones es documentación, no una garantía. Si falla la escritura a
  Postgres, Redis y la base quedan distintos; si se pierde Redis, se reconstruye desde un espejo
  que puede estar atrasado.
- **En NestJS:** Postgres es la fuente de verdad del estado (una fila con `version` para bloqueo
  optimista); Redis queda para lo efímero (buffer, locks, dedupe). Con el volumen de este negocio
  la latencia extra es irrelevante (milisegundos). Una transición inválida **lanza**.

### A7 · Adaptadores de LLM con resiliencia duplicada e inconsistente — Media

- **Evidencia:** `geminiClient.ts:76-104` y `xaiClient.ts:97-147` copian la misma lógica de
  reintento, pero Gemini no reintenta timeouts (causa documentada de fallos reales en CLAUDE.md).
  `xaiClient.ts:41-49` convierte argumentos JSON inválidos en `{}` en silencio. Cada proveedor
  agrega sus variables al `env` global. Sin fallback a otro proveedor, sin registro de costo por
  turno, sin trazas de prompts.
- **Impacto:** cambiar de proveedor es escribir un cliente nuevo desde cero; un proveedor caído
  deriva todo a humano en vez de probar otro.
- **En NestJS:** ver `docs/analisis/02-investigacion.md` §3: puerto propio + un solo adaptador
  sobre el **AI SDK** (proveedores intercambiables por configuración, incluido OpenRouter),
  resiliencia (timeout, reintento, fallback, circuit breaker) implementada **una vez** alrededor del
  puerto, y registro de uso/costo por turno.

### A8 · El webhook hace trabajo de negocio y confirma antes de terminar — Alta

- **Evidencia:** `webhook/router.ts:23-100` decide transiciones de estado, registra contactos, aplica
  rate limit y encola, **dentro** del request; luego `Promise.race` con 1,5 s responde 200 aunque
  el procesamiento siga (`router.ts:136`). La dedupe marca el mensaje como procesado **antes** de
  procesarlo (`dedupe.marcarProcesadoSiNuevo`).
- **Impacto:** si el proceso se cae después del 200, el evento se pierde y la dedupe impide
  recuperarlo (entrega "como mucho una vez"). Contradice SPEC §1.3 ("el handler solo valida firma,
  deduplica, encola y responde").
- **En NestJS:** patrón *inbox*: el controlador valida firma, guarda el evento crudo (tabla
  `evento_entrante` con id único = dedupe) o lo encola, y responde 200. Un procesador lo consume
  con reintentos. Entrega "al menos una vez" + idempotencia = exactamente una vez efectiva.

### A9 · El dominio habla el idioma de Chatwoot — Media (Alta si se agregan canales)

- **Evidencia:** `motor/`, `tools/enviarFotos.ts` y `tools/tipos.ts` importan `PasoEnvio` de
  `chatwoot/tipos.ts`; `MensajeBuffer.wamid` es en realidad el id de Chatwoot (`estado/tipos.ts`);
  el contacto se identifica por número de teléfono en todo el sistema.
- **Impacto:** agregar Instagram, Messenger o un widget web obliga a tocar el motor. El nombre
  `wamid` para un id de Chatwoot ya confunde.
- **En NestJS:** `MensajeEntrante`/`MensajeSaliente` normalizados en el módulo `conversaciones`;
  `canales/chatwoot` es solo un adaptador. El contacto se identifica por un id propio con
  identidades por canal (ver `03-revision-esquema.md` §2.1).

### A10 · Sin apagado ordenado — Media

- **Evidencia:** no hay `process.on("SIGTERM")` en `src/`; los workers, Redis y Prisma no se cierran.
- **Impacto:** un deploy puede cortar un turno a mitad (el LLM respondió pero no se envió).
- **En NestJS:** `app.enableShutdownHooks()` + `OnApplicationShutdown` en cada módulo con recursos.

### A11 · Reglas propias incumplidas en el código — Baja

- **Evidencia:** `Date.now()` directo en `queue/chatQueue.ts:56,63`, `webhook/router.ts:97` y
  `webhook/verifySignature.ts:23` pese a la regla "el tiempo se lee de `obtenerReloj()`".
- **Impacto:** tests de tiempo frágiles; muestra que las reglas por convención se erosionan.
- **En NestJS:** `Clock` inyectado + regla de lint `no-restricted-syntax` para `Date.now`/`new Date()`
  fuera de `plataforma/reloj`.

### A12 · Pirámide de tests invertida — Media

- **Evidencia:** 199 tests, casi todos de integración contra Redis + Postgres, en serie
  (`fileParallelism: false`), `TRUNCATE` entre tests.
- **Impacto:** feedback lento; los tests de lógica pura pagan el costo de infraestructura (A1).
- **En NestJS:** dominio puro con tests unitarios (ms); integración con base aislada por worker
  (Testcontainers o una base por worker de Jest); e2e pocos y de flujo completo. Conservar la
  regla "contra Postgres real" para repositorios y máquina de estados.

### A13 · Documentación que acumula historia — Baja (pero afecta al proyecto nuevo)

- **Evidencia:** SPEC.md mezcla la regla actual con notas "v2.1 / v2.2 / v2.3"; README, CLAUDE.md y
  SPEC repiten el estado del proyecto; CLAUDE.md dice que el stack decidido es Anthropic y a la vez
  que se usa xAI.
- **Impacto:** hay que leer la historia para saber la regla vigente; las copias se desincronizan.
- **En LuxeBorealCRM:** SPEC describe solo lo vigente; la historia va a ADR y a `CHANGELOG`; el
  estado del proyecto vive en un solo lugar (`docs/fases/README.md`).

### A14 · Higiene del repositorio — Baja

- **Evidencia:** copia completa del repo en `.kilo/worktrees/periodic-pentagon/`; `data/sqlite/` y
  `prisma/data/sqlite/test.db` (restos de SQLite); `db.sql` suelto; media en disco local
  (`data/media/`), que impide más de una instancia.
- **En LuxeBorealCRM:** medios en almacenamiento de objetos (MinIO local / S3 o R2) detrás de un
  puerto `Almacenamiento`; repo sin artefactos.

---

## 3. Riesgos de producto (no de código) detectados

1. **Dependencia fuerte de Chatwoot** como bandeja y dueño del webhook de Meta. Es una buena
   decisión para empezar, pero conviene aislarla detrás de un puerto (A9) para no quedar atados.
2. **Historial de conversación solo en Redis con TTL** (decisión de privacidad, SPEC §8). Para un
   CRM puede hacer falta consultar conversaciones; hoy la fuente sería Chatwoot. Decisión abierta
   (`docs/PREGUNTAS_ABIERTAS.md`).
3. **Contacto = teléfono** como clave primaria. Bloquea multicanal (A9).
4. **Sin evaluación sistemática del agente**: los cambios de prompt o de modelo se validan a mano.
   Con varios proveedores posibles, hace falta un set de conversaciones de referencia (evals).

---

## 4. Conclusión para la migración

- **Reglas de negocio**: se conservan casi todas (B1-B6, B11, B12, SPEC §3-§7). Son el activo.
- **Estructura**: se rehace con módulos NestJS, DI, eventos de dominio y puertos/adaptadores (A1-A10).
- **Datos**: el esquema diseñado a mano se conserva como base; hay ajustes propuestos y preguntas
  en `03-revision-esquema.md`.
- **Estrategia**: *strangler fig* — el servicio nuevo reemplaza al viejo detrás del mismo webhook del
  Agent Bot de Chatwoot, fase a fase, con el prototipo como referencia de comportamiento. El corte
  final es cambiar la URL del Agent Bot (y se puede revertir en un minuto).
