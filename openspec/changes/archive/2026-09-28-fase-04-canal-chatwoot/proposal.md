# Proposal: Fase 04 — Canal Chatwoot

- Change: `fase-04-canal-chatwoot` · Fase de la hoja de ruta: **04** (`docs/fases/README.md`)
- Rama: `fase-04-canal-chatwoot` · Fecha: 2026-09-26 · Estado: **en borrador** (proposal, specs,
  design y tasks pendientes de aprobación del usuario)
- Depende de: **Fase 00a, 00b y 01, cerradas** (plataforma: config, reloj, Prisma, Redis, errores
  RFC 9457, pipeline OpenAPI; esquema v1 con `evento_entrante` y `outbox` ya migrados). **No**
  depende de la Fase 03.
- Insumo principal: exploración de esta sesión (2026-09-26) sobre `../ChatLuxeCRM`
  (`webhook/*`, `chatwoot/*`, `docs/CHATWOOT.md`) contrastada con Chatwoot v4.17.1 real;
  `docs/migracion/inventario.md` líneas 37-40, 56, 63 y 85; ADR-0004, ADR-0005;
  `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3; `docs/analisis/05-multicanal.md`;
  `MODELO_DATOS.md` §7; `openspec/specs/canales/spec.md` (esqueleto R3/R4).
  *(Nota de proceso: el agente `sdd-explore` no tuvo Engram disponible; el resumen de la exploración
  llegó en el encargo de esta proposal y se verificó contra los archivos citados. Una corrección
  respecto a ese resumen: las tablas `evento_entrante` y `outbox` **ya existen** en
  `prisma/schema.prisma:392-419` y en la migración `20260925210822_esquema_v1` — Fase 01, PER2. Esta
  fase no las crea; las usa.)*

## Intent

Hoy el sistema no recibe ni envía nada: no hay módulo `canales`, no hay colas (solo un cliente
`ioredis` crudo) y las tablas de inbox/outbox de ADR-0004 existen vacías y sin código que las use.
Sin esta fase, las Fases 05 (conversaciones) y 07 (agente) no tienen por dónde recibir un mensaje ni
por dónde responder.

El prototipo resuelve la entrada y la salida, pero con dos defectos de fondo: el webhook hace trabajo
de negocio dentro del request y marca el dedupe **antes** de procesar (**A8**: un proceso que cae
tras el 200 pierde el evento para siempre), y el dominio habla directamente el idioma de Chatwoot
(**A9**). Esta fase porta lo que sí funciona (firma, parseo, cliente HTTP, idempotencia por paso B5)
sobre el inbox/outbox de **ADR-0004** y detrás de un puerto de canal (**ADR-0005**).

Éxito = la verificación de salida de la fila 04 de `docs/fases/README.md`: **evento firmado →
registro en inbox → procesado una vez; envío con reintento → cero duplicados; fixtures de contrato
= payloads reales de Chatwoot (anonimizados)**.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Inbox de eventos | Tabla `evento_entrante` con payload **redactado**, `UNIQUE(origen, id_externo)` como dedupe, procesador BullMQ con reintentos que marca `procesado_en`/`error`; el contenido se relee de la API de Chatwoot al reprocesar | **ADR-0004** (aceptada); `MODELO_DATOS.md` §7; esquema ya migrado (PER2) |
| Outbox de efectos externos | Tabla `outbox`, insertada en la misma transacción que el cambio de negocio; publicador con reintento y backoff; idempotencia por paso del envío (B5) | **ADR-0004** (aceptada) |
| Plataforma de canales | Chatwoot es el **único** adaptador de canal; el agente es agnóstico al canal y lee un perfil de capacidades | **ADR-0005** (aceptada); `docs/analisis/05-multicanal.md` |
| Horario y festivos (P13 del doc 04) | **Se mantiene la tabla propia** (`excepcion_horario`, Fase 02); no se delega horario a Chatwoot, que no tiene calendario de festivos fiable. El puerto `Horario` (`src/modulos/horario/puertos/horario.ts`) **no se toca** | Decisión del usuario, esta sesión (2026-09-26) |
| Auto-resolver de Chatwoot | Queda **apagado** por defecto: su umbral único por cuenta y solo sobre `open` no sustituye los dos TTL de la FSM (Fase 05). Esta fase solo garantiza que `conversation_status_changed` (incluido un `resolved`) llegue limpio al inbox; no decide política de auto-resolución | Exploración de esta sesión; se documenta al cerrar el doc 04 |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas de autoría | Preflight de esta sesión |
| Review | RDD por commit de unidad de trabajo **y `judgment-day` obligatorio antes de cerrar** (04 está en la lista 04/05/06/10) | Regla 6 de `docs/fases/README.md`; skill `luxeboreal-fases` §6.2 |
| Clave de idempotencia en `outbox` (Q4 original) | **Se agrega `clave_idempotencia text` con `UNIQUE`** (migración aditiva sobre la tabla ya existente, ej. `<conversacion>:<respuesta>:<paso>`); `MODELO_DATOS.md` §7 se actualiza | Decisión del usuario, esta sesión (2026-09-26) |

## Scope

### In Scope

1. **Controlador de webhook con ACK rápido** (`canales/interfaz`): recibe el POST de Chatwoot,
   valida la firma sobre el **body crudo** antes de cualquier lógica (**R3**), inserta el evento
   redactado en `evento_entrante` y responde 2xx. Objetivo: < 500 ms (SPEC.md §5), con margen amplio
   frente al límite de 5 s de Chatwoot (tras el cual reintenta 3 veces y reabre la conversación con
   nota de error). Firma inválida o ausente → 401 sin registrar el payload. Endpoint etiquetado
   `internal` (**API8**) con el contrato regenerado en el mismo commit.
2. **Verificación de firma y parseo** (portados, puros): `X-Chatwoot-Signature: sha256=<hex
   HMAC-SHA256(secret, "<timestamp>.<body_crudo>")>` + `X-Chatwoot-Timestamp`, comparación en tiempo
   constante. El parseo normaliza `message_created` (`incoming`/`outgoing`) y
   `conversation_status_changed` (`status` en la raíz) a un tipo propio del dominio; cualquier otro
   evento se ignora con 2xx (no se registra).
3. **Inbox con dedupe y procesamiento una sola vez** (**R4**): un duplicado choca con
   `UNIQUE(origen, id_externo)` y se ignora con 2xx; un procesador BullMQ consume el evento con
   reintentos, marca `procesado_en` al éxito o `error`/`intentos` al fallo. En esta fase el
   procesador entrega el evento normalizado a un **puerto de consumo** cuyo único consumidor es un
   registrador (skill `luxeboreal-fases` §4: "primero la entrada con un procesador que solo
   registra"); la Fase 05 conecta la máquina de estados detrás del mismo puerto.
4. **Redacción del payload** (**R14**, P15): `evento_entrante.payload` guarda ids, tipo de evento y
   metadatos (incluido `chatwoot_contact_id` y `conversation.channel`), **nunca** el texto del
   mensaje, adjuntos, teléfono completo ni otros datos personales.
5. **Puerto de canal de salida + adaptador Chatwoot**: el dominio envía "mensaje a la conversación X"
   con tipos propios (**A9**); el adaptador traduce a `POST …/conversations/{id}/messages`,
   `POST …/toggle_status` y `POST …/labels` con header `api_access_token`. Cliente HTTP portado del
   prototipo; reintento con backoff en 429/5xx, fallo inmediato en 4xx (número de reintentos: ver
   Q1).
6. **Outbox y publicador idempotente** (**R4**, B5): los envíos y efectos hacia Chatwoot se insertan
   en `outbox`; un job los publica con reintento y backoff respetando `proximo_intento`; una
   secuencia de varios mensajes que falla a mitad y se reintenta retoma desde el primer paso no
   enviado, sin duplicar lo ya enviado. Reemplaza las claves Redis `enviado:<id>:<paso>` del
   prototipo.
7. **Perfil de capacidades por canal**: función pura que, a partir de `conversation.channel`,
   devuelve el perfil del borrador de `docs/analisis/05-multicanal.md` (ventana de respuesta, costo
   por mensaje, si trae teléfono, adjuntos, límites de listas/botones). Solo se llena la columna de
   **WhatsApp**; el resto de canales devuelve un perfil explícito de "no soportado" en vez de
   adivinar valores "por verificar".
8. **BullMQ** (`@nestjs/bullmq`) sobre el Redis existente: registro de colas del inbox y del outbox,
   con cierre ordenado (**PLT5**).
9. **Fixtures de contrato**: payloads reales de Chatwoot (`message_created` incoming/outgoing,
   `conversation_status_changed` incluido `resolved`, un evento ignorado) **anonimizados**, usados
   por los tests de firma/parseo/controlador (procedencia: ver Q3).
10. **Entorno local de Chatwoot**: `scripts/chatwoot-*.sh` e `infra/chatwoot/` del prototipo movidos
    a `infra/` (inventario línea 56); variables `CHATWOOT_*` en `.env.example` y en el esquema Zod de
    configuración (**PLT1**).
11. **Cierre de los "?" del doc 04**: `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3 queda
    actualizado con P13 (tabla propia) y el auto-resolver (apagado, sin política en esta fase).
12. **Skill `whatsapp-meta-conventions`** copiada a `.claude/skills/` (inventario línea 85) y
    registro regenerado.

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Máquina de estados bot/humano, debounce, lock, eco humano, relectura de estado antes de enviar (parte de **R5** que depende de la FSM) | 05 | Fila 05 de `docs/fases/README.md`; esta fase deja el puerto de salida único, la 05 le agrega la relectura del estado |
| Escritura de `contacto` a partir de `chatwoot_contact_id` | 05 | El evento normalizado ya expone el id (inventario línea 63); persistirlo lo decide el consumidor |
| Cualquier cambio al puerto `Horario` o delegar horario a Chatwoot | — | P13 decidido: tabla propia |
| Política de auto-resolución de Chatwoot | 05 | Depende de los TTL de la FSM |
| Indicador "escribiendo…"/leído, plantillas y campañas de WhatsApp | 08 | Llamada directa a Meta, no a Chatwoot (inventario) |
| Notificaciones a Telegram vía outbox | 08 | Mismo outbox, otro `tipo`; se agrega cuando exista `notificaciones/` |
| Purga de `evento_entrante` a los 30 días | 09 | Operación periódica (`MODELO_DATOS.md` §7); sin datos reales antes del corte |
| Columnas de Instagram/Messenger/Widget del perfil de capacidades | — | Solo WhatsApp se implementa hoy (doc 05); agregar un canal es llenar una columna |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `webhook/verifySignature.ts`, `parseEvent.ts` | **Conservar** | `canales/chatwoot/entrada` | Probado con Chatwoot real; puro y sin estado |
| `webhook/router.ts`, `webhook/dedupe.ts` | **Rediseñar** | Controlador + inbox `evento_entrante` | **A8**: trabajo de negocio en el request y dedupe antes de procesar; el dedupe Redis (`msg:<id>`) se reemplaza por el único de ADR-0004 |
| `chatwoot/enviarMensaje.ts`, `idempotencia.ts` | **Rediseñar** | Puerto de salida + adaptador Chatwoot + `outbox` | B5 se conserva (idempotencia por paso); **A9** (el dominio no habla Chatwoot); Redis `enviado:<id>:<paso>` → `outbox` (ADR-0004) |
| `chatwoot/chatwootClient.*` | **Conservar** | `canales/chatwoot/infraestructura` | Cliente HTTP ya correcto |
| `scripts/chatwoot-*.sh`, `infra/chatwoot/` | **Conservar** | `infra/` | Entorno local; movido de 00a a 04 |
| Indicador "escribiendo…" (Meta directo) | **Posponer** | Fase 08 | Ver Out of Scope |

## Capabilities

### New Capabilities

- Ninguna. Los requisitos nuevos caben en dominios ya existentes.

### Modified Capabilities

- `canales`: el esqueleto actual (R3, R4 con escenarios genéricos) se expande con escenarios
  concretos y requisitos nuevos con prefijo propio (sugerido `CAN#`): ACK rápido, eventos
  ignorados, dedupe por `(origen, id_externo)`, redacción del payload, reintentos del procesador,
  envío por outbox con idempotencia por paso, reintento/fallo según código HTTP, perfil de
  capacidades por canal.
- `conversaciones`: **sin delta en esta fase (recomendación)**. R5 declara "Fase que lo implementa:
  04, 05", pero sus dos escenarios dependen del estado de la conversación (Fase 05). La Fase 04
  construye el punto único de salida; si `sdd-spec` considera que la existencia del punto único es
  observable por sí sola, puede agregar un escenario a R5 sin tocar los existentes.

## Approach

1. **Puro primero**: firma, parseo/normalización, redacción del payload y perfil de capacidades como
   funciones puras con sus tests y los fixtures de contrato.
2. **Inbox**: repositorio de `evento_entrante` (Postgres real en integración), controlador con body
   crudo y ACK, dedupe por el único. Cómo obtener el body crudo en NestJS 12 queda para `sdd-design`
   (la vía nativa `NestFactory.create(..., { rawBody: true })` + `req.rawBody` es la candidata; la
   skill `luxeboreal-arquitectura` aún no fija convención y el prototipo usa `express.raw()`).
3. **Colas**: `@nestjs/bullmq`, procesador del inbox con reintentos y puerto de consumo con el
   consumidor registrador.
4. **Salida**: puerto de canal, adaptador Chatwoot con su cliente HTTP, `plataforma/outbox`
   (estructura prevista en la skill §1) con publicador, backoff y reanudación por paso.
5. **Infra y documentación**: entorno local de Chatwoot, `.env.example`, doc 04 §3, skill de Meta.
6. **Cierre**: `judgment-day` sobre el rango de commits de la fase antes de `sdd-verify`.

Decisiones que `sdd-design` debe resolver (no de producto): dónde vive el puerto de salida
(`conversaciones/salida` según el inventario, o `canales` exportando el puerto hasta que exista
`conversaciones` en la Fase 05, respetando `sin-ciclos`); cómo se expresa la clave de idempotencia
por paso sobre el esquema actual de `outbox` (ver Q4); política de backoff concreta.

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) firma + parseo +
redacción + fixtures, (b) controlador + inbox + dedupe (+ contrato OpenAPI), (c) BullMQ + procesador
del inbox, (d) puerto de salida + adaptador Chatwoot + cliente HTTP, (e) outbox + publicador
idempotente, (f) perfil de capacidades + infra local + cierre documental.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `src/modulos/canales/` | New | Entrada (firma, parseo, controlador), adaptador Chatwoot, perfil de capacidades |
| `src/modulos/conversaciones/` (según design) | New | Puerto de salida único, si `sdd-design` lo ubica aquí |
| `src/plataforma/outbox/` | New | Repositorio y publicador del outbox |
| `src/plataforma/colas/` o equivalente (según design) | New | Registro de BullMQ sobre el Redis existente |
| `src/main.ts` | Modified | Body crudo para el webhook |
| `src/plataforma/config/` | Modified | Variables `CHATWOOT_*` validadas con Zod |
| `package.json` | Modified | `bullmq`, `@nestjs/bullmq` |
| `openapi/openapi.json`, `openapi/openapi.interno.json` | Modified | Endpoint del webhook (`internal`) |
| `test/fixtures/chatwoot/` | New | Payloads reales anonimizados |
| `infra/chatwoot/`, `scripts/` | New | Entorno local de Chatwoot portado |
| `.env.example` | Modified | `CHATWOOT_*` |
| `docs/analisis/04-chatwoot-delegar-vs-construir.md` | Modified | Cierre de los "?" |
| `.claude/skills/whatsapp-meta-conventions/`, `.atl/skill-registry.md` | New / Modified | Skill copiada |
| `prisma/schema.prisma`, `MODELO_DATOS.md` | Modified | Columna `clave_idempotencia UNIQUE` en `outbox` (Q4 aprobada por el usuario) |
| `openspec/specs/canales/` | Modified (al archivar) | Delta fusionado |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modified | Al archivar |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El body crudo se pierde si un parser global de JSON corre antes de la firma, y toda firma falla (o peor, se valida sobre JSON re-serializado) | Media | Test de integración con un fixture firmado de verdad; `sdd-design` fija la vía nativa y la documenta en la skill |
| Un reintento del publicador duplica un mensaje ya entregado al cliente (Chatwoot aceptó pero la respuesta se perdió) | Media | Idempotencia por paso (B5) con marca persistida antes de avanzar; escenario explícito en la spec; es uno de los focos de `judgment-day` |
| El procesador falla y el evento queda sin procesar sin que nadie lo note | Media | `error`/`intentos` visibles en la tabla; la alerta se decide en Q1 |
| Presupuesto de ~400 líneas por slice con varios adaptadores e infraestructura nueva | Alta | Seis slices del Approach; si una lo supera por naturaleza, `size:exception` citando esta fila |
| No existen capturas reales de payloads y hay que grabarlas contra la instancia local | Media | Q3; la tarea de captura se agrega a `tasks.md` si hace falta |
| Migración aditiva de `clave_idempotencia` en `outbox` (Q4, ya aprobada) sobre una tabla que ya tiene filas de la Fase 01 | Baja | Columna nullable-por-defecto-de-migración o backfill trivial (la tabla está vacía en desarrollo); `sdd-design` fija el detalle exacto |

## Rollback Plan

- Todo vive en la rama `fase-04-canal-chatwoot`, slices apilados (`stacked-to-main`). Revertir = no
  fusionar la cadena, o `git revert` del commit de la slice afectada.
- No hay datos en producción ni webhooks de Chatwoot de producción apuntando a este servicio (el
  corte es la Fase 10); P7 sigue aplicando.
- Las tablas `evento_entrante`/`outbox` ya existen desde la Fase 01; revertir el código no requiere
  migración. Si se aprueba Q4, su migración es aditiva y se revierte con una migración inversa
  (nunca editando la aplicada).
- Quitar BullMQ deja el Redis existente intacto; el health check (**PLT4**) no depende de las colas.

## Dependencies

- Fases 00a, 00b y 01 cerradas.
- Docker con Postgres + Redis (Testcontainers) para integración.
- Instancia local de Chatwoot (v4.17.1) para grabar fixtures y probar a mano el webhook real; los
  tests automatizados no dependen de ella.
- Paquetes nuevos: `bullmq`, `@nestjs/bullmq`.

## Preguntas abiertas

**Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase** (P13 ya está decidido). Q4
(cambio de esquema) también quedó decidida por el usuario esta sesión — ver "Decisiones ya tomadas".
Las siguientes siguen abiertas; cada una trae una recomendación que el usuario acepta o veta al
aprobar. Mientras no se decidan, `sdd-spec` y `sdd-design` avanzan con la recomendación marcada como
provisional.

| # | Pregunta | Recomendación | Efecto si se acepta |
|---|---|---|---|
| Q1 | Ante caída o errores de la API de Chatwoot al enviar: ¿cuántos reintentos antes de marcar el `outbox` como error para revisión manual? ¿Hay alerta? | **Reintentar en 429/5xx y errores de red con backoff exponencial; 4xx falla de inmediato.** El prototipo hace 2 reintentos dentro del request; con outbox el costo de reintentar es bajo, así que se proponen **5 intentos** con backoff acotado (del orden de minutos en total), luego `error` visible en la tabla. **Sin alerta externa en esta fase**: solo log `error` estructurado; la alerta (Telegram/Sentry) llega con `notificaciones/` en la Fase 08 | Los valores quedan como configuración (**R15**), no constantes |
| Q2 | ¿Qué límite de tamaño de payload se valida en el webhook? | **Límite del body HTTP de 1 MB en la ruta del webhook, rechazo con 413.** Como `evento_entrante.payload` se guarda redactado (sin texto ni adjuntos), el tamaño persistido ya es pequeño; el riesgo real es solo el body entrante. Chatwoot envía los adjuntos como URLs, no como binario | Un solo límite en la frontera HTTP; ninguna validación de tamaño sobre el payload guardado |
| Q3 | ¿Existen capturas JSON reales de payloads de Chatwoot en el prototipo para los fixtures de contrato? | **No se verificó que existan.** Recomendación: tarea explícita de captura contra la instancia local de Chatwoot (un evento por tipo del Scope 9), anonimizadas y versionadas con su procedencia documentada; si aparecen capturas en el prototipo, se reutilizan tras anonimizarlas | Posible tarea extra en `tasks.md` |

**Q4 (decidida, ya no está abierta)**: `outbox` no tenía columna ni único para la clave de
idempotencia por paso (B5); el usuario aprobó agregar `clave_idempotencia text UNIQUE` (migración
aditiva) — ver "Decisiones ya tomadas".

## Success Criteria

- [ ] Un evento con firma válida queda en `evento_entrante` redactado y el webhook responde 2xx en
      < 500 ms (medido en test de integración).
- [ ] Un evento con firma inválida o ausente recibe 401 y no deja ninguna fila.
- [ ] El mismo evento enviado dos veces produce una sola fila y una sola ejecución del consumidor.
- [ ] Un evento cuyo consumidor falla se reintenta y, al agotar los reintentos, queda con `error` y
      `intentos` visibles; nunca se pierde.
- [ ] Un envío de varios mensajes que falla a mitad y se reintenta no duplica ningún mensaje ya
      enviado (cero duplicados, contra un Chatwoot falso en integración).
- [ ] Un 4xx de Chatwoot no se reintenta; un 429/5xx sí, con backoff.
- [ ] El perfil de capacidades de WhatsApp devuelve los valores del doc 05; un canal no soportado
      devuelve un perfil explícito de "no soportado".
- [ ] Los tests de firma/parseo usan payloads reales anonimizados, sin datos personales.
- [ ] `payload` guardado no contiene texto de mensaje, adjuntos ni teléfono completo (**R14**).
- [ ] `npm run verify` y `npm run test:e2e` en verde; contrato OpenAPI regenerado sin deriva.
- [ ] Cada escenario del delta de `canales` tiene su test nombrado `<id> — <título>` y pasa.
- [ ] `judgment-day` corrido sobre el rango de commits de la fase, con veredicto en
      `verify-report.md`.
