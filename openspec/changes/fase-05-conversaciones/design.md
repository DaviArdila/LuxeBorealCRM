# Design: Fase 05 — Conversaciones

- Change: `fase-05-conversaciones` · Fecha: 2026-09-28 · Rama: `fase-05-conversaciones`
- Insumos: `proposal.md` (decisiones tomadas; Q1-Q3 abiertas con recomendación, aplicadas aquí como
  default vetable), `specs/conversaciones/spec.md` (R5-R8, R13 parcial, CNV1-CNV6, en paralelo),
  ADR-0003 (Postgres fuente de verdad), `openspec/changes/archive/2026-09-28-fase-04-canal-chatwoot/design.md`
  (D8: `CONSUMIDOR_EVENTOS_CANAL`; D9: `SALIDA_CANAL`; D6: patrón de `plataforma/colas`), esquema real
  `prisma/schema.prisma:224-239` (`Conversacion`) y `:452-459` (`EstadoAtencion`), y del prototipo
  `../ChatLuxeCRM/src/estado/{maquinaEstados,esperaHandoff,estadoGlobal,buffer,lock,tipos}.ts`,
  `queue/{chatQueue,chatWorker,reactivacionQueue}.ts`, `rateLimit/rateLimiter.ts`.
- Endpoint nuevo: **ninguno**. Esta fase es puramente interna (consumidor + processor + barrido); no
  agrega rutas HTTP ni cambia el contrato OpenAPI.
- Esquema: **ninguna migración**. `Conversacion` (`prisma/schema.prisma:224-239`) ya tiene `estado`
  (`EstadoAtencion`: `bot`/`handoff_pendiente`/`humano`/`pausado`), `expiraControlEn` (nullable,
  sirve para el vencimiento de `humano` **y** de `handoff_pendiente`), `version` (bloqueo optimista)
  y `chatwootConversationId` (único) desde la Fase 01. Nada que agregar.
- Dependencias nuevas de producción: **ninguna**. BullMQ ya está desde la Fase 04.

## Resumen

1. **`modulos/conversaciones` (nuevo)** es dueño de la máquina de estados, el debounce/lock/buffer
   efímeros, el procesador del turno, el barrido de vencimientos y el punto único de salida. Se
   registra como consumidor de `CONSUMIDOR_EVENTOS_CANAL` (Fase 04) y es el único módulo que importa
   `SALIDA_CANAL`.
2. **A3 se resuelve por capas del propio módulo, no por un bus de eventos**: `dominio/` (la FSM pura)
   no importa `aplicacion/` ni `infraestructura/`; `aplicacion/` orquesta dominio + repositorio +
   colas + salida. No se instala `EventEmitter2` ni ningún bus: hoy no hay ningún otro módulo
   escuchando un cambio de estado (leads/notificaciones llegan en la Fase 08); construir eventos de
   dominio sin consumidor sería infraestructura a medias (regla 2 de `docs/fases/README.md`). Cuando
   la Fase 08 necesite reaccionar a un `ConversacionCedidaAHumano`, se agrega ahí.
3. **El generador de respuesta real (Fase 07) queda detrás de un puerto** (`GENERADOR_RESPUESTA`)
   con un contrato mínimo (`pasos`, sin `handoff`): esta fase no modela `handoff` porque nada lo
   produce ni lo consume todavía (CLAUDE.md: no diseñar para lo hipotético). El adaptador de esta
   fase es el "agente eco".
4. **R5 con outbox asíncrono**: dado que el generador de esta fase produce siempre un único paso
   (CNV6), "relee el estado antes de cada mensaje" se satisface releyendo el estado **una vez, justo
   antes de encolar** la (única) respuesta en `SALIDA_CANAL`. Ver D9 para la extensión que necesitará
   la Fase 07 cuando el generador real produzca secuencias de varios pasos.

## Architecture Decisions

### D1 — Estructura del módulo: la de la skill, sin submódulos

`conversaciones/{dominio,aplicacion,puertos,infraestructura}`, igual que `canales` (D1 de la Fase
04). `infraestructura/redis/` agrupa buffer, lock, contador de rate limit e interruptor global (todo
efímero); `infraestructura/prisma/` el repositorio de `Conversacion`.

### D2 — Repositorio de `Conversacion`: búsqueda por `chatwootConversationId`, bloqueo optimista con reintento

`REPOSITORIO_CONVERSACION` (`infraestructura/prisma/repositorio-conversacion-prisma.ts`):

- `obtenerPorConversacionCanal(chatwootConversationId): Promise<Conversacion | null>` — nunca por
  número/teléfono (**P1**); si no existe, `aplicacion/registrar-mensaje-entrante.ts` la crea en
  `bot` (requiere `contactoId`, ya resuelto por `canales` vía `EventoCanal.chatwootContactId` →
  `REPOSITORIO_CONTACTO` de la Fase 04/01).
- `transicionar(id, destino, origen, ahora)`: `UPDATE conversacion SET estado = $destino,
  expira_control_en = $expiraCalculado, version = version + 1, actualizado = $ahora WHERE id = $1 AND
  version = $versionLeida RETURNING *`. Cero filas ⇒ conflicto de versión ⇒ **releer y reintentar
  una vez** (recalcula la transición sobre el estado fresco); un segundo conflicto propaga el error
  (la probabilidad de dos escritores concurrentes sobre la misma conversación ya la reduce el lock de
  D7, así que un conflicto real es una señal, no algo que reintentar indefinidamente).
- `listarVencidas(ahora)`: `estado IN ('humano','handoff_pendiente') AND expira_control_en <= $ahora`
  (D11).

### D3 — Dominio FSM puro: función de transición, sin I/O

`dominio/maquina-estados.ts`: `calcularTransicion(actual: EstadoAtencion, destino: EstadoAtencion,
origen: OrigenTransicion, ahora: Date): { destino: EstadoAtencion; expiraControlEn: Date | null }` —
**lanza** `TransicionInvalida` si `destino === 'bot'` y `origen` no es `ttl`/`admin`/
`chatwoot_pending`/`chatwoot_resolved`, o si `destino === 'pausado'` y `origen !== 'admin'` (**R6**).
Sin mapa de "transiciones sugeridas" con solo `warn` (**A6**): las únicas reglas son las de origen, y
se aplican siempre. Calcula `expiraControlEn` con `CLOCK` inyectado (`HUMANO_TTL_HORAS` para
`humano`, `HANDOFF_TTL_MIN` para `handoff_pendiente`, `null` para `bot`/`pausado`).
`aplicacion/transicionar-conversacion.ts` llama a esta función y después al repositorio (D2); nunca
al revés.

### D4 — Origen `OrigenTransicion`: tipo cerrado, igual al prototipo

`ttl | admin | chatwoot_pending | chatwoot_resolved | eco_humano | regla_handoff_explicita |
lead_caliente`. Esta fase **produce** `ttl` (D11), `chatwoot_pending`/`chatwoot_resolved`/
`eco_humano` (D5); `admin`, `regla_handoff_explicita` y `lead_caliente` quedan declarados en el tipo
porque `dominio/` los valida (R6), pero ningún código de esta fase los dispara todavía (Fases 08/09).

### D5 — Consumidor de `CONSUMIDOR_EVENTOS_CANAL`: traduce los tres tipos de `EventoCanal`

`aplicacion/consumidor-conversaciones.ts` implementa `consumir(evento: EventoCanal)` y se registra
con `RegistroConsumidorEventosCanal.registrar(this)` en `onModuleInit` de `ConversacionesModule`
(D8 de la Fase 04 ya deja este puerto listo; hoy lo usa `ConsumidorRegistrador` por defecto).

| `evento.tipo` | Acción |
|---|---|
| `mensaje-entrante` | `ObtenerOCrearConversacion` → si interruptor global apagado o `rate limit` superado, solo registra (**CNV4**, **R13**); si `estado !== 'bot'`, solo registra; si no, `buffer.push` + `encolarConDebounce` (D6) |
| `mensaje-humano` (eco) | `transicionar(id, 'humano', 'eco_humano')` (D3) → cancela el job diferido y vacía el buffer (**R8** capa 2) → limpia la marca de "espera enviada" (D12) |
| `estado-conversacion` | `status: pending` sobre `humano`/`handoff_pendiente` → `transicionar(bot, chatwoot_pending)`; `status: resolved` sobre esos mismos → `transicionar(bot, chatwoot_resolved)`; `status: open` sobre `bot` → `transicionar(humano, eco_humano)` (**CNV5**) |

`ConsumidorConversaciones.consumir` MUST ser idempotente (contrato de `CONSUMIDOR_EVENTOS_CANAL`,
ADR-0004): una transición que no cambia nada (p. ej. `pending` repetido) es un no-op observable
(mismo estado, `version` sin incrementar innecesariamente — D3 puede devolver "sin cambios" cuando
`actual === destino`, sin tocar el repositorio).

### D6 — Debounce: BullMQ, `jobId` por `chatwootConversationId`, reemplazo con cada mensaje

`infraestructura/colas/cola-turno.ts`, cola `conversaciones-turno`. `encolarConDebounce(idConv)`
reproduce `chatQueue.ts` del prototipo (B6): `jobId = turno:<idConv>`, `delay: DEBOUNCE_MS`; si ya
existe un job con ese id y no está `active`, se quita y se vuelve a agregar (reinicia el reloj); si
está `active` (el processor ya lo tomó), se agrega un job de respaldo con id único para que alguien
vuelva a mirar el buffer cuando termine (mismo caso límite que el prototipo). `attempts: 2`, backoff
exponencial 2 s.

### D7 — Lock por conversación: `SET NX EX`, concurrencia del *worker* > 1

`infraestructura/redis/lock-turno.ts`: `SET turno:<idConv>:lock 1 NX EX LOCK_TTL_S` (default 30, igual
al prototipo). A diferencia de los *workers* de inbox/outbox de la Fase 04 (concurrencia 1, por
orden global), el `ProcesadorTurno` corre con concurrencia configurable (`CONVERSACIONES_CONCURRENCIA`,
default 10): conversaciones **distintas** deben procesarse en paralelo; el lock es lo que impide que
la **misma** conversación corra dos veces a la vez (**R8**).

### D8 — Procesador del turno: adquiere el lock, drena el buffer en bucle, libera al final

`aplicacion/procesar-turno.ts` (invocado por el `WorkerHost` de la cola `conversaciones-turno`),
reproduce `chatWorker.ts` (B6):

1. `lock.adquirir(idConv)`; si falla, y el buffer no está vacío, reencola con debounce (mismo caso de
   respaldo de D6) y termina sin error.
2. Bucle: relee `estado`; si no es `bot`, vacía el buffer y termina. Si es `bot`, `buffer.leerYVaciar`
   (atómico); si queda vacío, termina.
3. `GENERADOR_RESPUESTA.generar(mensajes)` (D9) → `EnviarRespuestaTurno` (D10).
4. `finally`: `lock.liberar(idConv)`.

Sin manejo de `handoff` (D4: nada lo produce todavía).

### D9 — Puerto `GENERADOR_RESPUESTA`: contrato mínimo; adaptador "agente eco"

```ts
interface RespuestaTurno { pasos: { paso: string; texto: string }[] }
interface GeneradorRespuesta { generar(mensajes: MensajeTurno[]): Promise<RespuestaTurno> }
```

`aplicacion/agente-eco.ts` (adaptador de esta fase, TSDoc explícito: *"stand-in temporal — la Fase 07
lo reemplaza"*): devuelve `{ pasos: [{ paso: 'eco-1', texto: mensajes.at(-1)!.texto ?? '' }] }`
(**CNV6**). Ningún otro módulo depende de este adaptador; solo el *binding* del *token* cambia en la
Fase 07.

**R5 y el outbox asíncrono**: `SALIDA_CANAL.enviarMensajes` (Fase 04) no envía sincrónicamente — encola
en `outbox` y un publicador asíncrono lo entrega, posiblemente segundos después y con reintentos. La
garantía "relee el estado antes de **cada** mensaje" (R5) exige un *hook* por paso en el momento del
envío real, que el outbox genérico no expone (D9 de la Fase 04: `plataforma/outbox` no conoce
módulos). Como el generador de esta fase produce **siempre un único paso** (D9 arriba), la relectura
de una sola vez, justo antes de encolar (D10), es exactamente "antes de cada mensaje" cuando solo hay
uno. **Queda anotado para la Fase 07**: si el generador real produce secuencias de varios pasos
(collage + texto, p. ej.), la relectura por-paso-en-el-momento-del-envío necesita o bien que el
publicador del outbox soporte una guarda por fila delegada a quien la encoló, o bien aceptar que la
guarda de encolado es la interpretación práctica de R5 bajo el modelo de entrega asíncrona — decisión
de esa fase, no de esta.

### D10 — Punto único de salida: relee el estado una vez, justo antes de encolar

`puertos/salida-conversacion.ts` (`ENVIAR_RESPUESTA_TURNO`), implementado en `aplicacion/`:
`enviar(idConv, idRespuesta, pasos)` → relee `estado` (lectura fresca, no la del inicio del turno) →
si no es `bot`, no encola nada (**R5**, capas 3+2 combinadas: si llegó un eco humano mientras el
generador corría, aquí se detiene) → si es `bot`, llama a `SALIDA_CANAL.enviarMensajes({ conversacion:
idConv, idRespuesta, mensajes: pasos })`. `idRespuesta` es el id del *job* del turno (estable entre
reintentos de ese mismo trabajo, como exige D11 de la Fase 04).

### D11 — Vencimientos: job repetible, mismo patrón que `plataforma/colas`

`infraestructura/colas/barrido-vencimientos.ts`: `programarBarridoRepetible(CONVERSACIONES_BARRIDO_MS)`
(default 300 000 ms = 5 min, igual al prototipo) registra un *job scheduler* de BullMQ (mismo
mecanismo que D6 de la Fase 04, `upsertJobScheduler`). `ejecutarBarrido()`: `listarVencidas(ahora)`
(D2) → por cada una, `transicionar(id, 'bot', 'ttl')` (D3) → **sin llamar a `ENVIAR_RESPUESTA_TURNO`**:
el retorno es silencioso (**R7**). Un conflicto de versión en una fila (alguien la tocó justo antes)
se salta sin reintentar: el próximo barrido (5 min después, o antes si algo la vuelve a marcar
vencida) la recoge.

### D12 — Aviso único de espera: marca efímera en Redis, limpiada en cualquier salida de `handoff_pendiente`

`infraestructura/redis/marca-espera-handoff.ts`: `handoff:<idConv>:espera-enviada`, `SET … NX EX
<HANDOFF_TTL_MIN en segundos>` (vive como máximo lo que puede vivir el propio episodio de
`handoff_pendiente`). El consumidor de `mensaje-entrante` sobre una conversación en
`handoff_pendiente`: si ya pasó `HANDOFF_ESPERA_MIN` desde que entró a ese estado
(`expiraControlEn - HANDOFF_TTL_MIN + HANDOFF_ESPERA_MIN`, o más simple, se guarda el instante de
entrada junto a la marca) y la marca no existe, la crea y envía el único mensaje de espera
(`ENVIAR_RESPUESTA_TURNO`, parámetro `mensaje_espera_handoff`, D13); si ya existe, no hace nada
(**CNV3**). Cualquier transición que saca a la conversación de `handoff_pendiente` (D3/D5) borra la
marca.

### D13 — `mensaje_espera_handoff`: repositorio de parámetros propio de `conversaciones` (Q1 de la proposal)

Sin módulo `configuracion` compartido (**D4 de la Fase 02**), igual que `catalogo` tiene el suyo:
`conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.ts` sobre la
misma tabla `parametro` (clave/valor, ya migrada), leyendo solo las claves que este módulo declara
(`mensaje_espera_handoff`, con un default embebido si la fila no existe — mismo patrón que
`RepositorioParametroCatalogoPrisma` de la Fase 02, hallazgo abierto ya documentado en
`docs/fases/README.md`). El texto real del negocio queda pendiente de que el usuario lo cargue, igual
que los demás parámetros de negocio (**R15**).

### D14 — Interruptor global (solo lectura): Redis con default `activo`, sin espejo en `parametro` todavía

`puertos/interruptor-global.ts` (`INTERRUPTOR_GLOBAL`), `infraestructura/redis/interruptor-global-redis.ts`:
`estaActivo(): Promise<boolean>` — `GET bot:activo`; clave ausente ⇒ `true` (**CNV4**). Sin espejo en
`parametro` (el prototipo lo tenía para sobrevivir un `FLUSHALL`): esta fase no tiene ningún escritor
real (el endpoint es de la Fase 09), así que el espejo se agrega ahí, junto con el endpoint que
escribe ambos. Los tests de esta fase escriben la clave de Redis directamente para probar **CNV4**.

### D16 — `LECTOR_MENSAJE_CANAL`: de dónde sale el texto real para el agente eco (decidido en `sdd-apply`, 2026-09-28)

Vacío detectado al implementar T4: `EventoCanal.mensaje-entrante` nunca trae el texto del mensaje
(R14/CAN5, decisión ya cerrada de la Fase 04), pero D9 exige que el agente eco reenvíe
`mensajes.at(-1)!.texto` (CNV6). Ninguna pieza existente resuelve esto. Decisión del usuario
(pregunta bloqueante durante `sdd-apply`): `canales` gana un puerto nuevo, de solo lectura,
**`LECTOR_MENSAJE_CANAL`** (`src/modulos/canales/puertos/lector-mensaje-canal.ts`):

```ts
interface LectorMensajeCanal {
  obtenerTexto(idConversacion: string, idMensaje: string): Promise<string | null>;
}
```

Adaptador `LectorMensajeCanalChatwoot` (`infraestructura/chatwoot/`): `ClienteChatwoot.get(idConversacion,
'messages')` (mismo endpoint que ya usa `existeMensajeConMarca` de `AdaptadorCanalChatwoot`), filtra
por `id` y devuelve `content`; `null` si no aparece o la respuesta no valida. Exportado del barril de
`canales` (`index.ts`) y registrado en `canales.module.ts`. El consumidor de `conversaciones` (T5) lo
inyecta y llama justo antes de empujar al buffer (D6): el buffer guarda el texto ya resuelto, nunca
solo el `idMensaje` — así el processor (T4) no depende de Chatwoot en el momento de generar la
respuesta, solo el consumidor al recibir el evento. El texto vive en memoria de proceso y en el
buffer efímero de Redis (mismo trato que el resto del turno, nunca en Postgres ni en un log, R14
sigue aplicando).

### D15 — Registro en `AppModule`

`ConversacionesModule` se registra en `AppModule`, después de `CanalesModule` (para que
`RegistroConsumidorEventosCanal` ya exista al llamar `registrar` en `onModuleInit`). Importa
`plataforma/{config,reloj,colas,prisma}` y el barril de `canales` (`CONSUMIDOR_EVENTOS_CANAL`,
`RegistroConsumidorEventosCanal`, `SALIDA_CANAL`, `EventoCanal`, `MensajeTurno`-equivalente). Regla de
fronteras nueva en `.dependency-cruiser.cjs`: **solo `modulos/conversaciones` puede importar
`SALIDA_CANAL`** desde `modulos/canales` (D9 de la Fase 04 lo previó; hasta ahora el único
"consumidor" era el test).

## Módulos y dependencias

| Módulo | Cambio | Importa de |
|---|---|---|
| `modulos/conversaciones` (**nuevo**) | Dominio FSM, aplicación (consumidor, processor, barrido, agente eco), infraestructura (Prisma + Redis + colas), puertos | `plataforma/{config,reloj,colas,prisma}`; barril de `modulos/canales` (`CONSUMIDOR_EVENTOS_CANAL`, `SALIDA_CANAL`, `EventoCanal`). Ningún otro módulo de negocio |
| `modulos/canales` | Sin cambio de comportamiento | `ConsumidorConversaciones` se registra en su puerto existente; nada nuevo que exportar |
| `AppModule` | Importa `ConversacionesModule` | — |
| `.dependency-cruiser.cjs` | Regla nueva: solo `conversaciones` importa `SALIDA_CANAL` | — |

## Puertos y adaptadores

| Puerto (token) | Interfaz (resumen) | Implementación | Exportado |
|---|---|---|---|
| `REPOSITORIO_CONVERSACION` | `obtenerPorConversacionCanal`, `transicionar`, `listarVencidas` | `RepositorioConversacionPrisma` | No |
| `GENERADOR_RESPUESTA` | `generar(mensajes): Promise<RespuestaTurno>` | `AgenteEco` (esta fase); Fase 07 cambia el *binding* | No |
| `ENVIAR_RESPUESTA_TURNO` | `enviar(idConv, idRespuesta, pasos)` | Envuelve `SALIDA_CANAL` con relectura de estado | No |
| `INTERRUPTOR_GLOBAL` | `estaActivo(): Promise<boolean>` | `InterruptorGlobalRedis` | No |
| `CONSUMIDOR_EVENTOS_CANAL` (de `canales`) | `consumir(evento)` | `ConsumidorConversaciones` (se registra, no exporta nada nuevo) | — |

## Configuración

Nuevas en `plataforma/config/esquema.ts`, con los defaults calibrados del prototipo (Q2 de la
proposal):

```ts
DEBOUNCE_MS: z.coerce.number().int().min(500).default(3000),
LOCK_TURNO_TTL_S: z.coerce.number().int().min(5).default(30),
HUMANO_TTL_HORAS: z.coerce.number().min(0.5).default(3),
HANDOFF_TTL_MIN: z.coerce.number().int().min(1).default(45),
HANDOFF_ESPERA_MIN: z.coerce.number().int().min(1).default(30),
RATE_LIMIT_POR_HORA: z.coerce.number().int().min(1).default(20),
RATE_LIMIT_POR_DIA: z.coerce.number().int().min(1).default(60),
CONVERSACIONES_BARRIDO_MS: z.coerce.number().int().min(10000).default(300000),
CONVERSACIONES_CONCURRENCIA: z.coerce.number().int().min(1).default(10),
```

## Data Flow

```
canales ─CONSUMIDOR_EVENTOS_CANAL.consumir(evento)─► ConsumidorConversaciones          [D5]
   ├─ mensaje-entrante ─► ¿interruptor activo? ¿rate limit? ¿estado bot? ─► buffer.push + debounce
   ├─ mensaje-humano   ─► transicionar(humano, eco_humano) ─► cancela job + vacía buffer + limpia marca espera
   └─ estado-conversacion ─► transicion equivalente (pending/resolved/open)            [CNV5]

cola conversaciones-turno ─► ProcesadorTurno                                          [D6-D8]
   ├─ lock.adquirir ─► drena buffer mientras estado==bot
   ├─ GENERADOR_RESPUESTA.generar(mensajes)  (Fase 05: AgenteEco)                      [D9]
   └─ ENVIAR_RESPUESTA_TURNO.enviar ─► relee estado ─► si bot: SALIDA_CANAL.enviarMensajes [D10]
                                                    └─ si no: no encola nada (R5)
   finally ─► lock.liberar

barrido-vencimientos (5 min) ─► listarVencidas ─► transicionar(bot, ttl) por cada una   [D11]
   (silencioso, sin ENVIAR_RESPUESTA_TURNO)
```

## File Changes

| Archivo | Acción | Slice | Descripción |
|---|---|---|---|
| `src/modulos/conversaciones/dominio/maquina-estados.ts` (+ spec) | Create | (a) | D3, D4: `calcularTransicion`, `OrigenTransicion` |
| `src/modulos/conversaciones/puertos/repositorio-conversacion.ts` | Create | (a) | Token + interfaz |
| `src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.ts` (+ spec integración) | Create | (b) | D2 |
| `src/modulos/conversaciones/aplicacion/transicionar-conversacion.ts` (+ spec) | Create | (b) | Orquesta D3 + D2, reintento de versión |
| `src/modulos/conversaciones/infraestructura/redis/{buffer-turno,lock-turno,contador-rate-limit,marca-espera-handoff,interruptor-global-redis}.ts` (+ specs) | Create | (b) | D7, D12, D14; rate limit (R13) |
| `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts` (+ spec) | Create | (c) | D5, CNV5 |
| `src/modulos/conversaciones/conversaciones.module.ts`, `index.ts`; `src/app.module.ts` | Create/Modify | (c) | D15; registro en `onModuleInit` |
| `src/modulos/conversaciones/infraestructura/colas/cola-turno.ts` (+ spec) | Create | (d) | D6 |
| `src/modulos/conversaciones/aplicacion/{procesar-turno,agente-eco}.ts` (+ specs) | Create | (d) | D8, D9, CNV1, CNV2, CNV6 |
| `src/modulos/conversaciones/puertos/salida-conversacion.ts`, `aplicacion/enviar-respuesta-turno.ts` (+ spec) | Create | (e) | D10, R5 |
| `.dependency-cruiser.cjs` | Modify | (e) | Regla `SALIDA_CANAL` solo desde `conversaciones` |
| `src/modulos/conversaciones/infraestructura/colas/barrido-vencimientos.ts` (+ spec) | Create | (f) | D11, R7 |
| `src/modulos/conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.ts` (+ spec) | Create | (f) | D13, CNV3 |
| `src/plataforma/config/esquema.ts` (+ spec) | Modify | (f) | Variables de la sección Configuración |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modify | (f) | Al archivar |
