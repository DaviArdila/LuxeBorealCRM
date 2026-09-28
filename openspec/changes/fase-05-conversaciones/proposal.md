# Proposal: Fase 05 — Conversaciones

- Change: `fase-05-conversaciones` · Fase de la hoja de ruta: **05** (`docs/fases/README.md`)
- Rama: `fase-05-conversaciones` · Fecha: 2026-09-28 · Estado: **aprobada** (proposal, specs, design
  y tasks aprobados por el usuario el 2026-09-28, incluidas Q1-Q3)
- Depende de: **Fase 00a, 00b, 01 y 04, cerradas** (plataforma: config, reloj, `plataforma/colas`
  con BullMQ, `PrismaService`; esquema v1 con la tabla `conversacion` y su columna `version` ya
  migrados desde la Fase 01, T2; módulo `canales` con `CONSUMIDOR_EVENTOS_CANAL`/
  `RegistroConsumidorEventosCanal`, `SALIDA_CANAL` y `EventoCanal` ya construidos y exportados por la
  Fase 04).
- Insumo principal: exploración de esta sesión (2026-09-28) sobre `../ChatLuxeCRM`
  (`estado/{maquinaEstados,esperaHandoff,estadoGlobal,buffer,lock,tipos}.ts`,
  `queue/{chatQueue,chatWorker,reactivacionQueue}.ts`, `rateLimit/rateLimiter.ts`,
  `webhook/router.ts`, `db/repositorios/estadoConversacion.ts`, `SPEC.md` §4 y §9 del prototipo)
  contrastada con `docs/migracion/inventario.md` (filas 41-46, 54, 61), `docs/analisis/01-analisis-chatluxecrm.md`
  (A1, A2, A3, A6, A8, A9), `openspec/specs/canales/spec.md` (R3-R4, CAN1-CAN8), el `verify-report.md`
  archivado de la Fase 04 (`sdd/fase-04-canal-chatwoot/verify-report`, hallazgo (4):
  `scripts/chatwoot-devolver-bot.sh` no portado porque depende de esta fase) y su `design.md`
  (D8, D9: `CONSUMIDOR_EVENTOS_CANAL`/`SALIDA_CANAL` ya dejan el puerto listo para que `conversaciones`
  se registre). Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase (P17 es de la
  Fase 06).
  *(Nota de proceso: la delegación a `sdd-explore` fue rechazada por un hook del entorno
  — `PreToolUse:Agent hook error: SDD child dispatch refused` — pese a confirmar el preflight
  canónico de sesión dos veces con `AskUserQuestion`. El usuario autorizó explorar y proponer sin
  delegar a sub-agentes para esta fase.)*

## Intent

Hoy `canales` (Fase 04) recibe y normaliza eventos de Chatwoot, pero el único consumidor registrado
es `ConsumidorRegistrador`, que solo loguea. No existe ningún módulo que decida si un mensaje se
atiende, quién lo atiende (bot o humano) ni por dónde sale la respuesta. Esta fase construye el
**corazón del producto** (B4 del análisis): la máquina de estados bot/humano, las tres capas contra
la sobreescritura (R8), el único punto de salida que relee el estado (R5) y el freno de costo por
contacto (R13, parcial).

El prototipo resuelve esto con un defecto de fondo (**A6**): Redis es la fuente de verdad y Postgres
un espejo escrito sin transacción, y una transición fuera del mapa válido solo emite un `warn` y se
permite igual. Esta fase invierte la fuente de verdad (Postgres, con bloqueo optimista por `version`,
ya migrada en la Fase 01) y hace que una transición inválida **lance**, tal como ya decidió el
análisis del prototipo.

Éxito = la verificación de salida de la fila 05 de `docs/fases/README.md`: **los tests 6-9 y 15 del
`SPEC.md` del prototipo §9 reescritos y en verde, con un "agente eco" como respuesta** (el motor real
con LLM y herramientas es la Fase 07; esta fase no lo adelanta).

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Fuente de verdad del estado | **Postgres** (tabla `conversacion`, bloqueo optimista con `version`); Redis solo para lo efímero (buffer, lock, contadores de rate limit) | ADR-0003 (aceptada); **A6**; `docs/migracion/inventario.md` línea 61 |
| Transición inválida | **Lanza** (`Error`), nunca un `warn` que deja pasar | **A6**; `docs/analisis/01-analisis-chatluxecrm.md` |
| Máquina de estados | 4 estados (`bot`, `handoff_pendiente`, `humano`, `pausado`); el LLM **nunca** puede llevar a `bot` (solo `ttl`, `admin`, `chatwoot_pending`, `chatwoot_resolved`); `pausado` solo desde `admin` | **R6** (`SPEC.md` §4); prototipo `maquinaEstados.ts:49-56` |
| Tres capas contra sobreescritura | (1) debounce con `jobId` fijo por conversación que cancela/reemplaza el job pendiente, (2) cancelar job + vaciar buffer al recibir eco humano o cambio de status en Chatwoot, (3) el punto único de salida relee el estado antes de **cada** mensaje y aborta si no es `bot` | **R8** (`SPEC.md` §4); prototipo §4.2 |
| Único punto de salida | `conversaciones/salida` envuelve el `SALIDA_CANAL` de la Fase 04 (D9 de su `design.md`) y agrega la relectura de estado; nadie más llama a `SALIDA_CANAL` | **R5**; `openspec/changes/archive/2026-09-28-fase-04-canal-chatwoot/design.md` D9 |
| Control humano es préstamo | `humano` vence tras `HUMANO_TTL_HORAS` sin mensaje del asesor (cada mensaje suyo renueva la ventana); `handoff_pendiente` vence tras `HANDOFF_TTL_MIN` si nadie lo recoge; un barrido repetible (BullMQ, mismo patrón que `plataforma/colas` de la Fase 04) devuelve ambos a `bot` con origen `ttl`, sin enviar nada al cliente | **R7** (`SPEC.md` §4); prototipo `reactivacionQueue.ts` |
| Aviso único en espera de handoff | Si pasan `HANDOFF_ESPERA_MIN` sin eco humano y el cliente vuelve a escribir en `handoff_pendiente`, se manda **como máximo un** mensaje de espera (parámetro `mensaje_espera_handoff`, R15) | Prototipo `esperaHandoff.ts`; SPEC.md §4.4 del prototipo |
| Motor real vs. stand-in | El generador de respuesta real (política, LLM, 6 herramientas — **A5**) es la Fase 07. Esta fase define un puerto propio (`GENERADOR_RESPUESTA` o equivalente, ver Approach) con un adaptador "agente eco" trivial (reenvía el texto del último mensaje del turno) para probar el pipeline completo sin adelantar trabajo de la Fase 06/07 (regla 3 de `docs/fases/README.md`) | Criterio de salida de la fila 05; skill `luxeboreal-fases` §4 (vertical primero, con un procesador que solo registra/ecoa) |
| Handoff-pendiente: mecanismo completo, disparo pospuesto | El estado `handoff_pendiente` (TTL + aviso de espera) se construye y prueba **directamente sobre la máquina de estados** en esta fase (llamando `transicionar` con el origen correspondiente); su disparo real (`marcar_lead_caliente`, "pide hablar con una persona") es de `leads/` y llega en la **Fase 08** — no se construye aquí | Regla 3 de `docs/fases/README.md` ("nada de adelantar fases futuras"); inventario línea 51 (`leads/*` → Fase 08) |
| Interruptor global (lectura) | El consumidor verifica el interruptor `bot:activo` antes de generar respuesta (si está apagado, el mensaje se registra pero no se atiende); el **endpoint** administrativo que lo enciende/apaga (`POST /admin/pausa`) es la **Fase 09** — hasta entonces el valor por defecto es `activo` | Inventario línea 41 (lectura, Fase 05) vs. línea 54 (`admin/`, Fase 09) |
| Contador de audio consecutivo | **Posponer.** Su único consumo (mensaje de cortesía al primer audio, derivar al segundo) es parte del manejo de mensajes no textuales (**R12**), que construye la Fase 07 junto con el resto del motor; construirlo ahora sin consumidor sería infraestructura a medias | Regla 2 de `docs/fases/README.md` ("nunca infraestructura a medias"); test 17 del prototipo (fuera del alcance de esta fase) |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas de autoría | Preflight de esta sesión |
| Review | RDD por commit de unidad de trabajo **y `judgment-day` obligatorio antes de cerrar** (05 está en la lista 04/05/06/10) | Regla 6 de `docs/fases/README.md`; skill `luxeboreal-fases` §6.2 |

## Scope

### In Scope

1. **Máquina de estados en Postgres** (`conversaciones/dominio`): repositorio sobre la tabla
   `conversacion` (ya migrada, Fase 01) con bloqueo optimista por `version`; `transicionar(id, destino,
   origen)` valida el mapa de transiciones y los orígenes permitidos hacia `bot`/`pausado` (**R6**) y
   **lanza** ante una transición inválida (**A6**); emite eventos de dominio
   (`ConversacionCedidaAHumano`, `ConversacionDevueltaAlBot`, …) en vez de importar colas/canal
   directamente (**A3**).
2. **Consumidor de eventos de canal**: `conversaciones` se registra como
   `CONSUMIDOR_EVENTOS_CANAL` (puerto que la Fase 04 dejó listo, D8 de su `design.md`) en
   `onModuleInit`. Traduce `mensaje-entrante` → registrar en el buffer + encolar con debounce (si el
   interruptor global está activo, el estado es `bot` y el rate limit lo permite); `mensaje-humano`
   (eco) → `transicionar(humano, eco_humano)`, cancelar el job diferido y vaciar el buffer (capa 2 de
   R8); `estado-conversacion` (`open`/`pending`/`resolved`) → las transiciones equivalentes del
   prototipo (`chatwoot_pending`, `chatwoot_resolved`, `eco_humano` vía `open` + estado `bot`).
3. **Debounce + lock** (`conversaciones/infraestructura/redis`, B6): buffer por conversación en
   Redis, job BullMQ con `jobId` fijo por conversación y `delay = DEBOUNCE_MS` que un mensaje nuevo
   reemplaza (reinicia el reloj); lock `SET … NX EX` que impide que dos jobs de la misma conversación
   corran en paralelo (**R8**, capa 1 + candado).
4. **Procesador del turno** (`conversaciones/aplicacion`, processor BullMQ): adquiere el lock, drena
   el buffer en bucle mientras el estado siga `bot`, invoca el puerto `GENERADOR_RESPUESTA` (ver
   Approach) y entrega el resultado al punto único de salida; libera el lock al terminar.
5. **"Agente eco"** (adaptador trivial de `GENERADOR_RESPUESTA`): responde con el texto del último
   mensaje del turno como único paso, sin handoff. Es el *stand-in* explícito hasta la Fase 07.
6. **Punto único de salida** (`conversaciones/salida`, **R5**): envuelve `SALIDA_CANAL` de la Fase 04;
   antes de cada mensaje de la secuencia relee el estado de la conversación y, si no es `bot`, aborta
   el resto (capa 3 de R8).
7. **Vencimientos** (**R7**): job repetible BullMQ (mismo patrón `plataforma/colas` de la Fase 04) que
   busca en `conversacion` los estados `humano`/`handoff_pendiente` con vencimiento pasado y los
   devuelve a `bot` con origen `ttl`, sin enviar nada al cliente.
8. **Aviso único de espera en `handoff_pendiente`**: si el cliente escribe después de
   `HANDOFF_ESPERA_MIN` sin eco humano, se manda un único mensaje (parámetro `mensaje_espera_handoff`,
   **R15**) por el punto único de salida; nunca un segundo.
9. **Rate limit por contacto** (`conversaciones/politicas`, **R13** parcial): contador en Redis
   (hora/día) que descarta el mensaje entrante (se registra, no se atiende) al superar el límite
   configurado.
10. **Lectura del interruptor global** (`bot:activo`): el consumidor la verifica antes de generar
    respuesta; sin el endpoint de la Fase 09, el valor por defecto es `activo`.
11. **Configuración nueva** (Zod, mismo patrón que `CHATWOOT_*`/`OUTBOX_*` de la Fase 04):
    `DEBOUNCE_MS`, `LOCK_TTL_S`, `HUMANO_TTL_HORAS`, `HANDOFF_TTL_MIN`, `HANDOFF_ESPERA_MIN`,
    `RATE_LIMIT_POR_HORA`, `RATE_LIMIT_POR_DIA`, `CONVERSACIONES_BARRIDO_MS`, con los valores ya
    calibrados del prototipo (`SPEC.md` §11 del prototipo) como default.

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Motor real (política, LLM, 6 herramientas), `A5` | 07 | Regla 3: no se adelanta trabajo de fases futuras; esta fase deja el puerto `GENERADOR_RESPUESTA` listo para que la Fase 07 lo implemente |
| Calificación y disparo real de `handoff_pendiente` (`marcar_lead_caliente`, "pide hablar con una persona") | 08 | Inventario línea 51 (`leads/*`); esta fase construye el estado y su vencimiento, no su disparo |
| Notificación a Telegram, recordatorio de leads sin atender | 08 | Inventario líneas 45, 52 |
| Modo fuera de horario (captura de datos antes de derivar) | 08 | Depende de la calificación de leads |
| Endpoint `POST /admin/pausa` (kill switch, escritura) | 09 | Inventario línea 54; esta fase solo lee el interruptor |
| Contador de audio consecutivo y su consumo (cortesía / derivar al segundo audio) | 07 | R12, mensajes no textuales — junto con el resto del motor |
| Indicador "escribiendo…" de Meta | 08 | Llamada directa a Meta, no a Chatwoot (inventario) |
| Historial de turnos para el LLM | 07 | P3: nunca en Postgres; se decide midiendo latencia |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `estado/maquinaEstados.ts`, `esperaHandoff.ts` | **Rediseñar** | `conversaciones/dominio` | **A6**: Postgres fuente de verdad (bloqueo optimista, no espejo sin transacción), transición inválida lanza; eventos de dominio en vez de importar `queue`/`chatwoot` directo (**A3**) |
| `estado/buffer.ts`, `lock.ts` | **Conservar** | `conversaciones/infraestructura/redis` | Ya correcto (efímero en Redis, B6); se adapta a *providers* de NestJS (**A1**: sin abrir Redis al importar) |
| `estado/contadorAudio.ts` | **Posponer** | — | Su consumo es de R12/Fase 07 (ver Decisiones ya tomadas) |
| `estado/estadoGlobal.ts` | **Rediseñar** (solo lectura) | `conversaciones` | El endpoint de escritura es `admin/`, Fase 09 |
| `queue/chatQueue.ts`, `chatWorker.ts` | **Rediseñar** | `conversaciones/aplicacion` (processor BullMQ) | Mismo debounce + lock (B6); **A8** ya lo resolvió la Fase 04 (el webhook no hace este trabajo dentro del request) |
| `queue/reactivacionQueue.ts` | **Rediseñar** | `conversaciones/aplicacion` (job repetible BullMQ) | Barrido de vencimientos (test 9); mismo patrón de `plataforma/colas` de la Fase 04 |
| `rateLimit/rateLimiter.ts` | **Conservar** | `conversaciones/politicas` | Misma lógica (INCR + EXPIRE hora/día); valores por configuración (**R15**), no `env` crudo (**A2**) |
| `webhook/router.ts` (decisión de estado/buffer/rate limit, líneas 23-99) | **Rediseñar** | `conversaciones` (consumidor de `CONSUMIDOR_EVENTOS_CANAL`) | **A8** ya resuelto por la Fase 04; esta fase construye el consumidor fuera del request HTTP |
| `chatwoot/enviarMensaje.ts` (guardia de relectura de estado) | **Rediseñar** | `conversaciones/salida` (envuelve `SALIDA_CANAL`) | **R5**; D9 de la Fase 04 deja el puerto listo, sin el guard de estado |
| `motor/motor.ts` (solo el contrato `pasos`/`handoff`, no la lógica) | **Posponer** (puerto + *stand-in*) | `conversaciones/aplicacion` (`GENERADOR_RESPUESTA` + "agente eco") | El motor real es **A5**/Fase 07; aquí solo el contrato y un adaptador trivial |
| `db/repositorios/estadoConversacion.ts` + tabla `estado_conversacion` | **Rediseñar** | `conversaciones/infraestructura` sobre la tabla `conversacion` (ya migrada) | **ADR-0003**; inventario línea 61 |

## Capabilities

### New Capabilities

- `conversaciones`: dominio nuevo (**R5, R6, R7, R8, R13 parcial**). Prefijo de requisito sugerido
  `CNV#` (a confirmar en `sdd-spec`, sin colisión con `CAN#` de `canales`).

### Modified Capabilities

- `canales`: sin delta de comportamiento; `conversaciones` pasa a ser el consumidor real de
  `CONSUMIDOR_EVENTOS_CANAL` (antes `ConsumidorRegistrador`) y el único llamador de `SALIDA_CANAL`.
  Si `sdd-design` decide una regla de fronteras nueva ("solo `conversaciones` importa `SALIDA_CANAL`",
  prevista en D9 de la Fase 04), se declara ahí, sin tocar requisitos de `canales/spec.md`.

## Approach

1. **Dominio puro primero**: mapa de transiciones, validación de orígenes, cálculo de vencimientos —
   funciones puras con `Clock` inyectado, sin Redis ni Prisma.
2. **Repositorio de `conversacion`** sobre el esquema ya migrado (bloqueo optimista por `version`).
3. **Redis efímero**: buffer, lock, contador de rate limit — *providers* de NestJS, sin abrir
   conexión al importar (**A1**).
4. **Consumidor**: registro en `CONSUMIDOR_EVENTOS_CANAL` (D8 de la Fase 04), traduce los tres tipos
   de `EventoCanal` a las transiciones/acciones correspondientes.
5. **Debounce + processor**: cola BullMQ (mismo `plataforma/colas` de la Fase 04), lock, bucle de
   drenado, puerto `GENERADOR_RESPUESTA` con el adaptador eco.
6. **Salida única**: `conversaciones/salida` envolviendo `SALIDA_CANAL` con la guardia de relectura.
7. **Vencimientos**: job repetible + parámetro `mensaje_espera_handoff`.
8. **Cierre**: `judgment-day` sobre el rango de commits de la fase antes de `sdd-verify`.

Decisiones que `sdd-design` debe resolver (no de producto): nombre exacto del puerto
`GENERADOR_RESPUESTA` y su contrato (`pasos`/`handoff` del prototipo vs. una forma propia); si
`mensaje_espera_handoff` vive en un repositorio de parámetros propio de `conversaciones` (mismo
patrón que `catalogo`, D4 de la Fase 02: sin módulo `configuracion` compartido) o en otro mecanismo;
formato exacto de la clave de lock/debounce sobre el id de conversación (no el número, por P1); cómo
se prueba `handoff_pendiente` sin un disparador real (llamando `transicionar` directamente desde el
test, ver Decisiones ya tomadas).

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) dominio FSM puro + tests,
(b) repositorio sobre `conversacion` + Redis efímero (buffer/lock/rate limit), (c) consumidor de
`CONSUMIDOR_EVENTOS_CANAL`, (d) debounce + processor + agente eco, (e) salida única (`conversaciones/salida`),
(f) vencimientos (barrido) + aviso de espera + cierre documental.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `src/modulos/conversaciones/` | New | Dominio FSM, aplicación (consumidor, processor, barrido), infraestructura (Prisma + Redis), puertos (`GENERADOR_RESPUESTA`, salida) |
| `src/modulos/canales/` | Modified (sin delta de spec) | `conversaciones` se registra como consumidor real; deja de usarse `ConsumidorRegistrador` en producción |
| `src/plataforma/config/` | Modified | Variables nuevas de FSM/debounce/rate limit validadas con Zod |
| `.dependency-cruiser.cjs` | Modified (posible) | Regla "solo `conversaciones` importa `SALIDA_CANAL`" si `sdd-design` la confirma |
| `prisma/schema.prisma`, `MODELO_DATOS.md` | Sin cambio esperado | La tabla `conversacion` y su `version` ya existen (Fase 01); a confirmar en `sdd-design` si algún campo falta (p. ej. `expiraHumanoEn`) |
| `test/fixtures/`, `test/soporte/` | New | Fixtures de `EventoCanal` para los tres tipos consumidos |
| `openspec/specs/conversaciones/` | New (al archivar) | Delta nuevo |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modified | Al archivar |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Carrera entre el debounce/lock y un eco humano que llega justo cuando el turno ya está generando la respuesta eco | Media | Es exactamente lo que prueban los tests 6 y 7; la guardia de relectura en el punto único de salida (capa 3, R5/R8) es el foco de `judgment-day` |
| Confundir "construir el estado `handoff_pendiente` completo" con "adelantar la Fase 08" | Media | Alcance explícito: se prueba llamando `transicionar` directamente, sin ninguna lógica de calificación de leads |
| Presupuesto de ~400 líneas por slice con dominio + infraestructura + processor + salida | Alta | Seis slices del Approach; si uno lo supera por naturaleza, `size:exception` citando esta fila |
| El bloqueo optimista (`version`) de `conversacion` no está diseñado todavía para esta fase (solo existe la columna) | Media | `sdd-design` fija la estrategia de reintento ante conflicto de versión antes de `sdd-tasks` |
| El "agente eco" se confunde con el motor real en tests futuros de la Fase 07 | Baja | Nombrar el puerto y el adaptador explícitamente como *stand-in* (TSDoc), sin lógica que sugiera política real |

## Rollback Plan

- Todo vive en la rama `fase-05-conversaciones`, slices apilados (`stacked-to-main`). Revertir = no
  fusionar la cadena, o `git revert` del commit de la slice afectada.
- La tabla `conversacion` ya existe desde la Fase 01; revertir el código de esta fase no requiere
  migración a menos que `sdd-design` agregue una columna (en cuyo caso su reversa es una migración
  aditiva inversa, nunca editando la aplicada).
- `canales` sigue funcionando con `ConsumidorRegistrador` si se revierte el registro de
  `conversaciones`; no hay dependencia dura en el otro sentido (**A3**, sin ciclos).
- No hay datos en producción ni tráfico real (el corte es la Fase 10); P7 sigue aplicando.

## Dependencies

- Fases 00a, 00b, 01 y 04 cerradas.
- Docker con Postgres + Redis (Testcontainers) para integración.
- Ningún paquete nuevo de producción (BullMQ ya está desde la Fase 04).

## Preguntas abiertas

**Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase.** El usuario aprobó las tres
preguntas siguientes el 2026-09-28, con la recomendación de cada una (ya no provisional):

| # | Pregunta | Recomendación | Efecto si se acepta |
|---|---|---|---|
| Q1 | ¿`mensaje_espera_handoff` usa un repositorio de parámetros propio de `conversaciones` (mismo patrón que `catalogo`, sin módulo `configuracion` compartido, D4 Fase 02) o se posterga con un texto fijo hasta que exista contenido real de negocio? | **Repositorio propio ahora**, con un valor default razonable editable sin tocar código (**R15**); no bloquea la fase por falta de copy definitivo del negocio | Un `parametro`-like propio de `conversaciones/infraestructura`, sin depender de `catalogo` |
| Q2 | ¿Los valores de TTL/debounce/rate-limit se calibran de nuevo o se mantienen los del prototipo (ya calibrados con uso real, `SPEC.md` §11 del prototipo)? | **Mantener los valores del prototipo** (`DEBOUNCE_MS=3000`, `HUMANO_TTL_HORAS=3`, `HANDOFF_TTL_MIN=45`, `HANDOFF_ESPERA_MIN=30`, `RATE_LIMIT_POR_HORA=20`, `RATE_LIMIT_POR_DIA=60`) como default de configuración Zod, ajustables sin tocar código | Sin recalibración; se puede ajustar después sin desplegar código nuevo |
| Q3 | ¿Qué exactamente responde el "agente eco"? | **Reenvía el texto del último mensaje del turno como único paso**, sin `handoff`; alcanza para probar debounce + lock + guardia de envío (tests 6, 7, 8, 15) sin construir nada del motor real | El puerto `GENERADOR_RESPUESTA` queda con un contrato mínimo que la Fase 07 reemplaza sin tocar el resto del pipeline |

## Success Criteria

- [ ] Test 6 (SPEC.md prototipo §9): eco humano **durante** la ventana de debounce → job cancelado,
      cero mensajes enviados.
- [ ] Test 7: eco humano **después** de generar la respuesta pero **antes** del envío → cero mensajes
      enviados (guardia de relectura, capa 3 de R8).
- [ ] Test 8: estado `humano` → tres mensajes entrantes → cero llamadas al generador de respuesta,
      cero respuestas, contacto/actividad registrados igual.
- [ ] Test 9: expiración de `HUMANO_TTL_HORAS` → el bot retoma solo sin actividad humana, sin enviar
      nada al cliente.
- [ ] Test 15: cuatro mensajes del cliente en 3 segundos → una sola invocación del generador de
      respuesta (debounce agrupa la ráfaga).
- [ ] Una transición fuera del mapa válido o con un origen no permitido hacia `bot`/`pausado` lanza
      (nunca un `warn` que deja pasar) — **R6**.
- [ ] `handoff_pendiente` vence tras `HANDOFF_TTL_MIN` sin que nadie lo recoja, probado llamando
      `transicionar` directamente — **R7**.
- [ ] Un mensaje entrante que supera el rate limit por hora o por día se registra pero no genera
      respuesta — **R13** (parcial).
- [ ] `npm run verify` y `npm run test:e2e` en verde; contrato OpenAPI regenerado sin deriva (si esta
      fase agrega algún endpoint interno; a confirmar en `sdd-design`).
- [ ] Cada escenario del delta de `conversaciones` tiene su test nombrado `<id> — <título>` y pasa.
- [ ] `judgment-day` corrido sobre el rango de commits de la fase, con veredicto en
      `verify-report.md`.
