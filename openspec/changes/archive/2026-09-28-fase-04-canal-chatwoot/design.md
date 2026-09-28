# Design: Fase 04 — Canal Chatwoot

- Change: `fase-04-canal-chatwoot` · Fecha: 2026-09-26 · Rama: `fase-04-canal-chatwoot`
- Insumos: `proposal.md` (decisiones tomadas; Q1-Q3 abiertas con recomendación, aplicadas aquí como
  default vetable), `specs/canales/spec.md` (CAN1-CAN8, en paralelo), ADR-0004 (inbox/outbox),
  ADR-0005 (Chatwoot único adaptador), `MODELO_DATOS.md` §7, `prisma/schema.prisma:387-419`,
  `docs/analisis/05-multicanal.md`, código real de `src/main.ts`, `src/configurar-aplicacion.ts`,
  `src/plataforma/redis/redis.module.ts`, `src/plataforma/config/esquema.ts`,
  `src/plataforma/observabilidad/rutas-redaccion.ts`, `.dependency-cruiser.cjs`,
  `scripts/generar-contrato.ts`, `test/e2e/aplicacion.e2e-spec.ts`, y del prototipo
  `../ChatLuxeCRM/src/webhook/{verifySignature,parseEvent,router,tipos}.ts`,
  `src/chatwoot/{enviarMensaje,idempotencia,chatwootClient*,tipos}.ts`, `src/server.ts`.
- Endpoint nuevo: **uno**, `POST /api/v1/webhooks/chatwoot`, etiquetado `internal` (API8).
- Esquema: **una migración aditiva** (`outbox.clave_idempotencia`, Q4 aprobada). Ninguna tabla nueva.
- Dependencias nuevas de producción: `bullmq`, `@nestjs/bullmq`.

## Resumen

1. **`modulos/canales` (nuevo)** es dueño de la entrada (webhook, firma, traducción/redacción, inbox
   `evento_entrante`, procesador) y del puerto de salida `SALIDA_CANAL` con su adaptador Chatwoot. El
   dominio de `canales` no conoce el formato de Chatwoot (A9): todo lo que dice `Channel::`,
   `message_type` o `api_access_token` vive en `infraestructura/chatwoot/`.
2. **`plataforma/colas` (nuevo)** registra BullMQ sobre el mismo servidor Redis (`REDIS_URL`), con
   conexiones propias de BullMQ y cierre ordenado antes de que Prisma/Redis se desconecten (PLT5).
3. **`plataforma/outbox` (nuevo, previsto por la skill §1)** es un outbox **genérico**: sobre
   (`grupo`, `orden`, `datos`, `efimero`), reclamo con *lease* y `FOR UPDATE SKIP LOCKED`, orden
   estricto por grupo, backoff y un registro de manejadores por `tipo` (plataforma no conoce módulos).
4. **Idempotencia por paso (B5) = clave única en `outbox` + inserción `ON CONFLICT DO NOTHING` +
   marca de enviado por fila + reconciliación antes de reintentar un mensaje**. Reemplaza las claves
   Redis `enviado:<id>:<paso>` del prototipo.
5. **Body crudo por la vía nativa de NestJS 12** (`rawBody: true`), sin desmontar el parser JSON
   global.

## Architecture Decisions

### D1 — Estructura del módulo `canales`: la de la skill, con el adaptador en `infraestructura/chatwoot/`

La proposal y el inventario nombran destinos `canales/chatwoot/entrada` y
`canales/chatwoot/infraestructura`. **Se sigue la estructura de la skill §1** (`dominio/`,
`aplicacion/`, `puertos/`, `infraestructura/`, `interfaz/`) y lo específico de Chatwoot se agrupa en
`infraestructura/chatwoot/`:

- La firma y la traducción del payload son **puras**, pero hablan el formato de Chatwoot y usan `zod`
  y `node:crypto`: la regla `dominio-aislado` las prohíbe en `dominio/` (mismo hallazgo que D12 de la
  Fase 03 con `sharp`), y A9 exige que el dominio no conozca Chatwoot.
- Un segundo adaptador de canal (si ADR-0005 cambiara) sería `infraestructura/<otro>/`, sin tocar
  `dominio/`, `puertos/` ni `aplicacion/`.

**Alternativa descartada**: `canales/chatwoot/{entrada,salida}` como submódulos con su propia
estructura interna. Rompe la regla de "un módulo = una estructura" que usan `catalogo`, `medios`,
`geografia` y `horario`, y obligaría a reescribir los patrones de `dependency-cruiser` que capturan
`modulos/<m>/<capa>/`.

### D2 — Body crudo: `rawBody: true` nativo de NestJS 12; límite JSON global de 1 MB

**Elección**:

- `src/configurar-aplicacion.ts` exporta `OPCIONES_APLICACION = { rawBody: true } as const`.
  `main.ts` crea la app con `{ bufferLogs: true, ...OPCIONES_APLICACION }`; el e2e
  (`createNestApplication(OPCIONES_APLICACION)`) usa la misma constante para probar el mismo cableado
  que producción. `scripts/generar-contrato.ts` y `test/contrato/soporte.ts` no la necesitan (no
  envían cuerpos), pero la usan igual por uniformidad.
- `configurarAplicacion` recibe `NestExpressApplication` (hoy `INestApplication`) y llama
  `app.useBodyParser('json', { limit: '1mb' })` (Q2). El parser JSON sigue siendo global: **todos**
  los endpoints siguen recibiendo el cuerpo parseado; además, cada petición JSON conserva
  `req.rawBody: Buffer`.
- El controlador del webhook lee `req.rawBody` (tipo `RawBodyRequest<Request>`) solo en la guardia de
  firma (D3).
- Errores del parser (`entity.too.large` → 413, `entity.parse.failed` → 400) ocurren en middleware,
  antes del enrutado de Nest. `configurarAplicacion` registra, justo después del parser, un
  middleware de error `traducirErrorDeCuerpo` que responde `application/problem+json` con los
  códigos nuevos `carga-demasiado-grande` (413) y `validacion-fallida` (400) del catálogo RFC 9457
  (ADR-0011). Si el RED test demuestra que el `FiltroProblemJson` global ya recibe esos errores, el
  middleware se omite y la tarea lo deja anotado.

**Impacto global en `main.ts`**: sí cambia (una opción de creación y un límite). Efectos sobre los
demás endpoints: (a) conservan el JSON parseado sin cambio de comportamiento; (b) el límite pasa de
100 kB (default de Express) a 1 MB para toda la app; (c) cada petición JSON retiene su buffer crudo
hasta terminar (costo de memoria despreciable con el tráfico de un solo negocio). Hoy solo existen
`GET /health` y `/docs`, así que el impacto observable es nulo.

**Alternativa descartada**: `express.raw({ type: 'application/json', limit: '1mb' })` montado solo en
la ruta del webhook (patrón de `../ChatLuxeCRM/src/server.ts:21`). En NestJS los parsers globales se
registran al iniciar la app, **antes** que cualquier middleware de módulo: cuando `express.raw`
llegara a correr, el stream ya estaría consumido y `req._body` marcado, y la firma se validaría sobre
nada (el riesgo nº 1 de la proposal). Para que funcionara habría que crear la app con
`bodyParser: false` y volver a montar a mano el parser JSON para el resto de rutas: más código global,
no menos, y un segundo mecanismo que la skill tendría que documentar.

**Consecuencia sobre Q2**: el límite de 1 MB queda **global**, no solo en la ruta del webhook (la vía
nativa no admite límites por ruta sin desmontar el parser global). Vetable en Open Questions.

**Orden observable**: el parser corre antes que la guardia de firma. Un cuerpo que no es JSON
recibe 400 aunque no traiga firma; nunca se registra nada (no llega al controlador). R3/CAN2 se
cumplen para todo cuerpo JSON, que es lo único que Chatwoot envía.

### D3 — Firma validada en una guardia, antes de pipes y del controlador

`interfaz/guardia-firma-chatwoot.ts` (`CanActivate`) llama a la función pura portada
`verificarFirmaChatwoot` (`infraestructura/chatwoot/verificar-firma.ts`, firma idéntica al prototipo
salvo que `ahoraSegundos` es **obligatorio** y lo aporta `CLOCK`, nunca `Date.now()`):

- `X-Chatwoot-Signature: sha256=<hex HMAC-SHA256(secreto, "<timestamp>.<body crudo>")>` +
  `X-Chatwoot-Timestamp` (segundos Unix), comparación con `timingSafeEqual`.
- Falta cualquiera de las dos cabeceras, prefijo distinto de `sha256=`, timestamp no numérico o fuera
  de `CHATWOOT_WEBHOOK_TOLERANCIA_S` (default 300, anti-replay), longitud distinta, o **secreto
  vacío** → `false` (falla cerrada: un despliegue sin secreto rechaza todo, nunca acepta todo).
- `false` → `ErrorDeAplicacion('firma-invalida')` → 401 `problem+json` (código nuevo en
  `CATALOGO_CODIGOS`). La guardia no loguea cuerpo ni cabeceras de firma; `req.body` ya está
  redactado en `RUTAS_HTTP`.

Las guardias de NestJS corren después del middleware y **antes** de pipes, interceptores y handler:
ninguna lógica de negocio ni validación de esquema ve un evento sin firma válida (R3).

`firmarComoChatwoot` se porta a `test/soporte/chatwoot.ts` (solo lo usan tests y el script de
fixtures; no es código de producción).

### D4 — Traducción = redacción por lista blanca; el payload guardado es un `EventoCanal` versionado

`infraestructura/chatwoot/traducir-evento.ts` porta el esquema `zod` de `parseEvent.ts` (con
`looseObject`, zod 4) y produce **directamente** el tipo propio `EventoCanal` (dominio), que es a la
vez lo que se guarda en `evento_entrante.payload` y lo que recibe el consumidor. La redacción no es
una lista negra que borra campos del JSON de Chatwoot: es una **lista blanca** — solo sobreviven los
campos que `EventoCanal` declara, todos ids, enums y metadatos (CAN5, R14, P15).

| Evento Chatwoot | Condición | Resultado | `id_externo` |
|---|---|---|---|
| `message_created` | `message_type` `incoming`/`0`, no `private` | `mensaje-entrante` | `mensaje:<message.id>` |
| `message_created` | `outgoing`/`1`, remitente humano (portado de `esRemitenteHumano`) | `mensaje-humano` (eco, Fase 05) | `mensaje:<message.id>` |
| `message_created` | `outgoing` del bot, nota privada, otro `message_type`, sin conversación | ignorado, 200, sin fila | — |
| `conversation_status_changed` | `status` en la raíz y `id` de conversación | `estado-conversacion` | `estado:<conversationId>:<status>:<X-Chatwoot-Delivery ?? X-Chatwoot-Timestamp>` |
| cualquier otro / payload que no cumple el esquema | — | ignorado, 200, sin fila (CAN3) | — |

`origen` siempre `'chatwoot'`. Qué **no** se guarda nunca: `content`, `attachments` (solo el tipo
del primero, mapeado a `TipoContenido`), coordenadas, `phone_number`, `identifier`, `name`, `email`,
`source_id` de `contact_inbox` (es el teléfono) y el `source_id` del mensaje (**el `wamid` de Meta
codifica el número del destinatario**, así que tampoco entra; la Fase 08 lo relee de la API de
Chatwoot cuando necesite el indicador "escribiendo…"). Sí se guarda: ids de mensaje, conversación,
inbox y contacto (`chatwootContactId`, requisito de CAN5), el `conversation.channel` crudo y su
`CanalOrigen` mapeado, y el nombre del evento de Chatwoot (trazabilidad).

**Identidad por conversación, no por teléfono (P1)**: el prototipo derivaba un `numero` y buscaba la
conversación por él; aquí el evento trae `conversacion.idExterno` y la salida usa ese id
directamente. `extraerNumero` no se porta.

**Por qué el consumidor no recibe el texto**: el procesador lee el evento **de la tabla** (redactada),
no del request. Un solo camino (primera vez = reproceso) y cero contenido en Redis o Postgres. La
lectura del contenido del mensaje es una capacidad de la Fase 05/07 (puerto de lectura sobre `GET
…/conversations/{id}/messages`, como ya prevé `MODELO_DATOS.md` §7).

**Dedupe de `conversation_status_changed`**: Chatwoot no trae id propio del evento. Se usa
`X-Chatwoot-Delivery` si llega (a confirmar con las capturas de Q3) y el timestamp firmado si no. Un
duplicado que se cuele es inocuo: el consumidor es idempotente por contrato (ADR-0004) y "poner el
estado X" es idempotente por naturaleza.

### D5 — Registro en el inbox y ACK: Postgres es la verdad, la cola es solo el disparador

`aplicacion/registrar-evento-entrante.ts`:

1. `REPOSITORIO_EVENTO_ENTRANTE.registrar({ origen, idExterno, payload })` hace `create`; un `P2002`
   sobre `(origen, id_externo)` se traduce a `{ resultado: 'duplicado' }` (R4, CAN dedupe).
2. Si es nuevo, `COLA_EVENTOS_ENTRANTES.encolar(id)` con `jobId = id` y un **tope de 200 ms**
   (`Promise.race`): si Redis está caído o lento, se loguea `warn` sin PII y se sigue. La fila ya está
   confirmada en Postgres; el barrido de D7 la encola después.
3. Responde `200 { estado: 'registrado' | 'duplicado' | 'ignorado' }` (esquema zod,
   `respuestaDesdeZod`).

Presupuesto de latencia (CAN1, < 500 ms): parser + HMAC (< 1 ms), un `INSERT` (ms), un `XADD` de
BullMQ (ms) acotado a 200 ms. El test de integración mide el tiempo total contra Postgres/Redis reales.

**Alternativa descartada**: encolar el evento completo en BullMQ como inbox (alternativa 2 de
ADR-0004) — ya rechazada por el ADR aceptado.

### D6 — `plataforma/colas`: BullMQ con conexiones propias sobre el mismo `REDIS_URL`

**Elección**: `ColasModule` = `BullModule.forRootAsync({ inject: [CONFIGURACION], useFactory })` con
`connection: opcionesConexionColas(REDIS_URL)` (función pura: parsea `redis://`/`rediss://` a
`host/port/username/password/db/tls` de `ioredis`, con `maxRetriesPerRequest: null`, requisito de
BullMQ para *workers*) y `prefix: COLAS_PREFIJO` (default `luxe:colas`; los tests usan
`prefijoRedisDePrueba()` para aislar workers de Vitest, ADR-0009). Cada dueño registra su cola con
`BullModule.registerQueue`: `canales` → `canales-inbox`; `plataforma/outbox` → `outbox`.

**"Sin duplicar la conexión" se interpreta como una sola configuración, no un solo socket**: el
cliente de `RedisModule` tiene `enableOfflineQueue: false` y `maxRetriesPerRequest: 1` a propósito
(falla rápido para el health check, PLT4). BullMQ exige `maxRetriesPerRequest: null` y además abre
por diseño una conexión bloqueante adicional por *worker*: pasarle el cliente de plataforma rompería
su semántica de falla rápida o haría fallar a los *workers*. Mismo servidor, misma URL, una sola
fuente de configuración; conexiones distintas, cada una con su dueño y su cierre.

**Arranque y cierre (PLT5)**:

- Los procesadores se declaran con `@Processor(nombre, { autorun: false })`. Un `ArranqueColas`
  (plataforma/colas) no existe como clase aparte: cada procesador, en `onApplicationBootstrap`,
  arranca su `worker.run()` sin esperarlo **solo si `COLAS_TRABAJADORES` es `true`** (default `true`),
  y registra su barrido (`upsertJobScheduler`) con `catch` que loguea, nunca bloquea el arranque.
- Cada procesador cierra su *worker* en `beforeApplicationShutdown` (`await worker.close()`, espera el
  job activo). Nest ejecuta **todas** las `beforeApplicationShutdown` antes que cualquier
  `onApplicationShutdown`, así que ningún job en curso pierde Prisma (`$disconnect`) ni Redis a mitad
  de camino. Las colas (productores) las cierra `@nestjs/bullmq` en su propio apagado.
- Toda `Queue` y todo `Worker` tienen un *listener* de `'error'` que loguea sin PII: sin él, un Redis
  inaccesible emite `'error'` sin escucha y Node lo convierte en excepción no capturada.

**Por qué `COLAS_TRABAJADORES`**: `scripts/generar-contrato.ts`, `test/contrato/*` y la deriva del
contrato (en `verify` y en el hook `pre-push`) construyen `AppModule` completo apuntando a un Redis
inexistente. Con el flag en `false` esos contextos registran colas pero no arrancan *workers* ni
barridos, y el contrato se genera igual de determinista que hoy. No elige una implementación (no es
un `MOCK_*`, skill §3): decide si **este proceso** consume colas, lo mismo que permitirá separar
proceso web y proceso *worker* en Dokploy más adelante.

**Riesgo de compatibilidad**: la primera tarea confirma con `npm view @nestjs/bullmq peerDependencies`
que existe versión compatible con `@nestjs/common@^12`. Si no existe, el plan B es un
`ColasModule` propio que instancia `Queue`/`Worker` de `bullmq` con los mismos puntos de arranque y
cierre (misma interfaz para `canales` y `outbox`; solo cambia `plataforma/colas`).

### D7 — Procesador del inbox: job = id, reintentos de BullMQ, marca en la fila

`infraestructura/procesador-inbox.ts` (`WorkerHost`, cola `canales-inbox`, concurrencia 1) delega en
`aplicacion/procesar-evento-entrante.ts`:

1. `iniciarIntento(id)`: `UPDATE … SET intentos = intentos + 1 WHERE id = $1 AND procesado_en IS NULL
   AND error IS NULL RETURNING payload`. Sin fila → ya procesado o muerto → termina sin error
   (idempotente frente a jobs duplicados o *stalled*).
2. Valida `payload.v === 1` y lo entrega a `CONSUMIDOR_EVENTOS_CANAL.consumir(evento)` (D8).
3. Éxito → `procesado_en = CLOCK.ahora()`.
4. Fallo → relanza para que BullMQ reintente (`attempts: INBOX_MAX_INTENTOS` = 5,
   `backoff: { type: 'exponential', delay: 2000 }` → 2, 4, 8, 16 s). En el último intento
   (`job.attemptsMade + 1 >= attempts`) marca `error` antes de relanzar (CAN4).

`error` guarda solo `<nombre de la clase>[: <código estable>]`, truncado a 200 caracteres; nunca el
`message` libre del error (podría contener texto del cliente, R14). El detalle va al log, con la
redacción de `nestjs-pino`.

**Barrido del inbox** (job repetible cada `INBOX_BARRIDO_MS` = 30 s): filas con `procesado_en IS
NULL AND error IS NULL AND recibido_en < ahora - 30 s` se reencolan con `jobId = id` (BullMQ ignora un
`jobId` ya presente). Cubre: Redis caído durante el ACK (D5), proceso caído con el job en memoria.
Invariante: **ningún evento aceptado se pierde** (ADR-0004); queda procesado, pendiente o muerto
(`error` visible), nunca desaparecido.

**Semántica de entrega al consumidor**: al menos una vez. Si el proceso cae entre el éxito del
consumidor y el `UPDATE procesado_en`, el consumidor corre de nuevo; por eso ADR-0004 lo obliga a ser
idempotente. En el camino normal corre una sola vez (criterio de éxito de la proposal).

**Orden**: concurrencia 1 da orden de llegada en el camino feliz; un evento que reintenta se procesa
después de los siguientes. La Fase 05 resuelve el orden por conversación con su lock (fuera de
alcance aquí).

### D8 — Puerto de consumo con registro: inversión de dependencia sin ciclos

`canales` define `CONSUMIDOR_EVENTOS_CANAL` como interfaz y exporta
`RegistroConsumidorEventosCanal` (`registrar(consumidor)`, falla si ya hay uno registrado que no sea
el de por defecto). Si nadie registra, el procesador usa `ConsumidorRegistrador` (log `info` con
`tipo`, ids y canal; nunca contenido), que es el único consumidor de esta fase (skill
`luxeboreal-fases` §4).

La Fase 05 hará que `conversaciones` importe `CanalesModule` y se registre en `onModuleInit`. Así la
dependencia va en un solo sentido (`conversaciones → canales`) para entrada **y** salida, sin
`forwardRef` ni ciclo de archivos (`sin-ciclos`).

**Alternativas descartadas**: (a) `CanalesModule.conConsumidor(ConversacionesModule, TOKEN)` —
módulo dinámico que importaría `ConversacionesModule`, que a su vez importa `CanalesModule` para
salir: ciclo de módulos de Nest. (b) `EventEmitter2` — un emisor *fire-and-forget* desacopla el error
del consumidor del reintento y de la marca `procesado_en`, rompiendo CAN4; además no está instalado.

El mismo patrón de registro lo usa `plataforma/outbox` para sus manejadores (D10): una sola idea para
"el de abajo no conoce al de arriba".

### D9 — Ubicación del puerto de salida: `canales` exporta `SALIDA_CANAL`; `conversaciones/salida` llega en la Fase 05

Se aplica la regla de D1 de la Fase 03: **no se crea un módulo sin datos propios**. En esta fase
`conversaciones` no tendría tablas que escribir (`conversacion` la escribe la Fase 05), así que un
`modulos/conversaciones/` con solo un puerto sería un módulo vacío.

- **Fase 04**: `canales/puertos/salida-canal.ts` define `SALIDA_CANAL` (enviar secuencia de mensajes,
  cambiar estado, agregar etiquetas; tipos propios, CAN6). Lo implementa `SalidaCanalOutbox`
  (`canales/aplicacion/`), que **encola** en el outbox. `index.ts` exporta el token y sus tipos.
- **Fase 05**: `conversaciones/salida` (nombre del inventario) envuelve `SALIDA_CANAL` y le agrega la
  relectura del estado de la FSM (R5). En ese momento se agrega una regla de fronteras: solo
  `modulos/conversaciones/` puede importar `SALIDA_CANAL` del barril de `canales`. Hasta entonces el
  único consumidor es el test.
- El adaptador síncrono que habla HTTP (`ADAPTADOR_CANAL`, D12) **no** se exporta: solo lo invoca el
  manejador del outbox. Nadie fuera de `canales` puede mandar un mensaje saltándose el outbox.

`sin-ciclos` verificado: `canales` importa solo `plataforma/*` (config, reloj, prisma en
`infraestructura/`, colas, outbox); ningún módulo de negocio. `plataforma/outbox` no importa `canales`
(regla 7): `canales` se registra en él.

**Alternativa descartada**: crear hoy `modulos/conversaciones/salida` con el puerto. Módulo sin datos
propios (señal de "esto es una capacidad del dueño", D1 de la Fase 03) y un nombre que promete la
relectura de estado de R5 que esta fase no puede cumplir.

### D10 — `plataforma/outbox`: sobre genérico, reclamo con *lease*, orden por grupo, contenido efímero

**Sobre** (`outbox.payload`, jsonb):

```json
{ "v": 1, "grupo": "canal:4711", "orden": 0, "datos": { ... }, "efimero": { ... } }
```

- `grupo`: filas del mismo grupo se publican en orden estricto; una no se publica mientras haya una
  anterior del mismo grupo pendiente (no enviada y no muerta). `canales` usa `canal:<idConversacion>`
  para mensajes, estado y etiquetas: un cambio de estado encolado después de un mensaje sale después.
- `orden`: desempata filas insertadas en la misma transacción (comparten `creado = now()` de
  Postgres). Orden total: `(creado, orden, id)`.
- `efimero`: lo que **no** puede quedar persistido más allá de la entrega. Ver "Contenido saliente".

**Reclamo** (una consulta, `$queryRaw` sobre `PrismaService`, sin importar el cliente generado — regla
4):

```sql
WITH candidatos AS (
  SELECT o.id FROM outbox o
  WHERE o.enviado_en IS NULL AND o.error IS NULL AND o.proximo_intento <= $ahora
    AND NOT EXISTS (
      SELECT 1 FROM outbox p
      WHERE p.payload->>'grupo' = o.payload->>'grupo'
        AND p.enviado_en IS NULL AND p.error IS NULL
        AND (p.creado, (p.payload->>'orden')::int, p.id) < (o.creado, (o.payload->>'orden')::int, o.id))
  ORDER BY o.creado, (o.payload->>'orden')::int, o.id
  LIMIT $lote
  FOR UPDATE SKIP LOCKED)
UPDATE outbox SET intentos = outbox.intentos + 1, proximo_intento = $ahora + $lease
FROM candidatos WHERE outbox.id = candidatos.id
RETURNING outbox.*;
```

`$ahora` viene de `CLOCK` (nunca `now()` de la lógica). El *lease* (`OUTBOX_LEASE_S` = 60) hace que
una fila reclamada por un proceso que muere vuelva a estar disponible sola; `intentos` ya quedó
incrementado, lo que activa la reconciliación de D13. Dos procesos no reclaman la misma fila
(`SKIP LOCKED`) y una fila reclamada bloquea a sus sucesoras (sigue pendiente).

**Publicación** (`PublicadorOutbox.publicarPendientes()`): repite reclamar → publicar cada fila en
orden, hasta que un reclamo vuelva vacío o se llegue a 50 vueltas. Sin este bucle, cada paso de una
secuencia esperaría al siguiente barrido. Por cada fila: busca el manejador por `tipo` en
`RegistroManejadoresOutbox` y:

| Resultado del manejador | Actualización | Invariante |
|---|---|---|
| éxito | `enviado_en = ahora`, `payload = payload - 'efimero'` | enviada |
| `FalloPublicacion('transitorio', esperaS?)` e `intentos < OUTBOX_MAX_INTENTOS` | `proximo_intento = ahora + max(backoff(intentos), esperaS)`; `error` sigue `NULL` | pendiente |
| transitorio con `intentos >= máximo` | `error = 'agotado: <causa>'`, `payload - 'efimero'` | muerta |
| `FalloPublicacion('permanente')` | `error = 'permanente: <causa>'`, `payload - 'efimero'`; las filas pendientes de la **misma secuencia** (`datos.secuencia`) pasan a `error = 'secuencia abortada'` | muerta |
| sin manejador para el `tipo` | `error = 'sin-manejador'` | muerta (error de programación, visible) |

Invariante de la tabla (el mismo que el inbox): **`error IS NOT NULL` ⇔ fila muerta**. Una fila
pendiente nunca tiene `error`; la causa del último fallo transitorio va al log. Reprocesar una fila
muerta a mano = `error = NULL, intentos = 0` (documentado en el TSDoc de `plataforma/outbox/index.ts`;
el runbook llega en la Fase 09).

**Disparo**: `RegistroOutbox.agregar(entradas)` inserta (D11) y luego encola un job `publicar` en la
cola `outbox` con el mismo tope de 200 ms de D5; además hay un barrido repetible cada
`OUTBOX_BARRIDO_MS` = 5 s que hace lo mismo (reintentos con backoff, disparos perdidos). Worker de
concurrencia 1.

**Contenido saliente efímero**: el texto de un mensaje al cliente **es** contenido de mensaje, y
ADR-0005 prohíbe guardarlo. Va en `efimero` y el `UPDATE` que cierra la fila (enviada o muerta) lo
elimina con `payload - 'efimero'`. Solo vive en Postgres mientras la fila está pendiente (segundos,
minutos en el peor caso de Q1). Ver ADRs y Open Questions: es la decisión de política más sensible
de esta fase.

**Alternativa descartada — una fila por secuencia con progreso en el payload**: el paso actual se
guardaría mutando el jsonb; mezcla estado de entrega con datos, y la clave única (Q4) quedaría por
secuencia, no por paso, contra lo que el usuario aprobó.
**Alternativa descartada — contenido en Redis con TTL y referencia en la fila**: si Redis pierde la
clave, el mensaje no se puede enviar y la fila muere; el outbox dejaría de cumplir "no se pierde".

**Transacciones**: en esta fase `agregar` abre su propia transacción (todas las filas de una
secuencia o ninguna). La Fase 05 necesita insertar en el outbox **en la misma transacción** que el
cambio de estado de la conversación (ADR-0004); ese día se construye el `SERVICIO_TRANSACCION` que
D6 de la Fase 03 pospuso, y `agregar` recibe el contexto transaccional. Se deja anotado aquí para que
no se resuelva con un `PrismaService` en `aplicacion/`.

### D11 — Clave de idempotencia: formato de dominio, inserción idempotente, columna `NOT NULL UNIQUE`

**Formato** (función pura `canales/dominio/claves-idempotencia.ts`):

| Efecto | `clave_idempotencia` |
|---|---|
| Paso de una secuencia de mensajes | `canal:mensaje:<idConversacion>:<idRespuesta>:<nn>` (`nn` = posición 00-19) |
| Cambio de estado | `canal:estado:<idConversacion>:<idOperacion>` |
| Agregar etiquetas | `canal:etiquetas:<idConversacion>:<idOperacion>` |

- **La construye el dominio de `canales`, no el adaptador**: identifica el efecto de negocio (qué
  respuesta, qué paso), no el formato de Chatwoot. Por eso el prefijo es `canal:` y no `chatwoot:`
  (el ejemplo de la proposal): cambiar de adaptador (ADR-0005) no cambia las claves.
- `idRespuesta`/`idOperacion` los aporta quien llama y MUST ser estables entre reintentos de su propio
  trabajo (la Fase 05 usará el id del turno). Se validan con `^[A-Za-z0-9_-]{1,64}$` (sin `:`), así la
  clave nunca es ambigua. Máximo 20 pasos por secuencia.
- **B5 en forma de outbox**: `agregar` usa `createMany({ skipDuplicates: true })` (`ON CONFLICT DO
  NOTHING`). Si el trabajo que genera la respuesta se reintenta y vuelve a encolar la misma
  secuencia, los pasos ya existentes (enviados o no) no se duplican; cada paso se marca enviado por
  separado, así que la secuencia retoma desde el primer paso no enviado (R4, escenario 2).
- Contrato para quien llama: un `idRespuesta` identifica una secuencia **inmutable**. Encolar otra
  secuencia distinta con el mismo id es un error de programación (los pasos ya existentes ganan).

**Migración** `prisma/migrations/<ts>_outbox_clave_idempotencia/`:

```sql
ALTER TABLE "outbox" ADD COLUMN "clave_idempotencia" TEXT NOT NULL;
CREATE UNIQUE INDEX "outbox_clave_idempotencia_key" ON "outbox"("clave_idempotencia");
```

`schema.prisma`: `claveIdempotencia String @unique @map("clave_idempotencia")`. **`NOT NULL`**,
no nullable: todo efecto externo del outbox debe ser idempotente (ADR-0004, "los consumidores de
inbox y outbox son idempotentes"), así que una fila sin clave es un error que el esquema debe
impedir. La tabla no tiene escritor hasta esta fase (P7: sin datos que migrar); si una base de
desarrollo tuviera filas manuales, la migración falla con un mensaje claro y basta vaciar `outbox`.
Sin `[manual]`: Prisma expresa todo. `MODELO_DATOS.md` §7 se actualiza en el mismo commit.

### D12 — Reintentos: un solo mecanismo (el outbox); el cliente HTTP no reintenta

ADR-0004: "un mecanismo único de reintento para todos los efectos externos". El prototipo reintentaba
2 veces **dentro** de la llamada HTTP; sumado a los 5 intentos del outbox serían hasta 15 POST por
mensaje y el backoff real sería imposible de razonar.

**`ClienteChatwoot`** (`infraestructura/chatwoot/cliente-chatwoot.ts`, portado de
`chatwootClient.real.ts`): `fetch` nativo, `AbortSignal.timeout(CHATWOOT_HTTP_TIMEOUT_MS)` (default
10 000), cabecera `api_access_token`, URL
`<CHATWOOT_URL>/api/v1/accounts/<CHATWOOT_ACCOUNT_ID>/conversations/<id>/<sufijo>`. **Cero
reintentos**. Clasifica cada fallo en `FalloCanal`:

| Respuesta | `naturaleza` | Notas |
|---|---|---|
| 2xx | éxito | |
| 429 | `transitorio` | `esperaSugeridaS` = `Retry-After` en segundos si viene, acotado a `OUTBOX_BACKOFF_MAX_S` |
| 5xx, error de red, timeout | `transitorio` | Para mensajes, además activa la reconciliación del intento siguiente (D13) |
| otro 4xx | `permanente` | Sin reintento (CAN7) |

El mensaje de `FalloCanal` lleva método, ruta (`pathname`, sin query) y status; nunca cuerpo ni
token.

**Backoff del publicador (Q1, valores exactos)**: `OUTBOX_MAX_INTENTOS = 5`,
`OUTBOX_BACKOFF_BASE_S = 15`, `OUTBOX_BACKOFF_MAX_S = 300`.
`retrasoS(intentos) = min(15 × 2^(intentos−1), 300)` → tras el 1.º fallo 15 s, 2.º 30 s, 3.º 60 s,
4.º 120 s; el 5.º fallo marca la fila muerta. Total desde el primer intento ≈ 3 min 45 s (+ la
granularidad de 5 s del barrido): "del orden de minutos", como pide Q1. Sin *jitter*: un solo negocio,
un solo proceso publicador y orden estricto por conversación; el *jitter* solo agregaría
no-determinismo a los tests. Función pura `plataforma/outbox/backoff.ts` con su spec. Valores como
configuración (R15 aplicado a parámetros técnicos, igual que `HEALTH_TIMEOUT_MS`).

**Alerta (Q1)**: sin alerta externa en esta fase. Una fila que muere loguea `error` estructurado
(`tipo`, `clave_idempotencia`, causa); la alerta a Telegram/Sentry llega con `notificaciones/` en la
Fase 08 como un `tipo` más del mismo outbox.

### D13 — Reconciliación antes de reintentar un mensaje (el caso "Chatwoot aceptó pero la respuesta se perdió")

La clave única evita duplicar **filas**; no evita duplicar el **mensaje** si Chatwoot creó el mensaje
y la respuesta se perdió (timeout, conexión cortada, 5xx tardío). Es el riesgo "Media" de la proposal
y un foco de `judgment-day`.

**Elección**: el adaptador envía cada mensaje con una marca
`content_attributes: { luxe_clave: <clave_idempotencia> }`. El manejador de `canal.mensaje`, cuando
`intento > 1` (hubo un intento previo cuyo resultado no se conoce con certeza, incluido un *lease*
vencido), primero llama `ADAPTADOR_CANAL.existeMensajeConMarca(conversacion, clave)` (`GET
…/conversations/{id}/messages`, página más reciente) y, si lo encuentra, marca la fila enviada sin
volver a hacer `POST`. Estado y etiquetas no la necesitan: "poner el estado X" y "agregar la
etiqueta Y" son idempotentes por naturaleza.

**Condicionado a verificación** (Open Questions, junto con Q3): hay que confirmar contra Chatwoot
v4.17.1 local que (a) `content_attributes` enviado en un mensaje `outgoing` de texto se persiste y
vuelve en el `GET`, y (b) no se reenvía a WhatsApp. Si no se cumple, se elimina la reconciliación, el
riesgo residual (duplicado solo en la ventana de respuesta perdida) queda documentado y aceptado, y el
escenario de spec correspondiente se reformula a "fallo con respuesta recibida". La tarea de captura
de fixtures (Q3) hace esta verificación primero.

**Alternativa descartada**: comparar por contenido (último mensaje saliente igual al que se iba a
enviar). Falsos positivos cuando el bot repite un texto legítimamente ("¿Algo más?") y exige leer
contenido de mensajes para decidir.

### D14 — Perfil de capacidades: dominio puro sobre un `CanalOrigen` propio

- `infraestructura/chatwoot/canal-desde-chatwoot.ts`: `'Channel::Whatsapp'` → `'whatsapp'`,
  `'Channel::Instagram'` → `'instagram'`, `'Channel::FacebookPage'` → `'messenger'`,
  `'Channel::WebWidget'` → `'web'`, cualquier otro (incluido `Channel::Api`, el inbox de pruebas
  local) → `'otro'`. `CanalOrigen` usa exactamente los valores del enum `canal_conversacion` ya
  migrado (`schema.prisma:452`), para que la Fase 05 lo persista sin traducir.
- `dominio/perfil-capacidades.ts`: `perfilDeCapacidades(canal)` devuelve la columna WhatsApp de
  `docs/analisis/05-multicanal.md` o `{ soportado: false, canal, motivo: 'canal-no-soportado' }`
  (CAN8). Sin valores "por verificar": la forma del tipo hace imposible devolver un perfil a medias.
- Los valores son **constantes de dominio**, no parámetros del negocio (R15 cubre textos y
  parámetros del negocio; esto son hechos de la plataforma del canal, documentados en el doc 05).
  Cambian cuando cambia Meta, no cuando el negocio decide.
- `mensajeSalienteTieneCosto: true` para WhatsApp: el cobro rige desde el 1-oct-2026 (doc 05) y esta
  fase no llega a producción antes; no se modela como dependiente de la fecha.
- `EventoCanal` trae `canal`; el agente (Fase 07) calcula el perfil a partir de él, sin preguntar por
  el canal (skill §6).

### D15 — Etiquetas: "agregar", no "reemplazar"

`POST …/conversations/{id}/labels` de Chatwoot **reemplaza** el conjunto de etiquetas. Los asesores
etiquetan conversaciones en Chatwoot; un reemplazo ciego borraría sus etiquetas. El puerto expone
`agregarEtiquetas` y el adaptador hace `GET …/labels` → unión → `POST …/labels`. Idempotente
(reintentar la unión da el mismo conjunto). La carrera con un asesor etiquetando en el mismo
segundo se acepta (efecto: una etiqueta del asesor podría perderse; probabilidad despreciable).

**Alternativa descartada**: `fijarEtiquetas` con semántica de reemplazo, como el prototipo. Correcto
solo si el bot fuera el único que etiqueta, y no lo es (bandeja humana, ADR-0005).

### D16 — Registro en `AppModule` y contrato OpenAPI

A diferencia de `catalogo`/`geografia`/`horario`/`medios`, `CanalesModule` **sí** se registra en
`AppModule` en esta fase: expone el único endpoint de entrada, y el criterio de salida (evento
firmado → inbox → procesado) exige la app completa. `AppModule` importa `ColasModule` (una vez, raíz
de la conexión BullMQ) y `CanalesModule` (que importa `OutboxModule`, `PrismaModule` y registra su
cola con `BullModule.registerQueue`). El commit que agrega el controlador regenera
`openapi/openapi.json` y `openapi/openapi.interno.json` (skill §10); el público no cambia (el
endpoint es `internal`), el interno gana `POST /api/v1/webhooks/chatwoot`.

## Módulos y dependencias

| Módulo | Cambio | Importa de |
|---|---|---|
| `plataforma/colas` (**nuevo**) | `ColasModule` (BullMQ raíz), `opcionesConexionColas` | `plataforma/config`; npm `@nestjs/bullmq`, `bullmq` |
| `plataforma/outbox` (**nuevo**) | `OutboxModule`, `REGISTRO_OUTBOX`, `RegistroManejadoresOutbox`, `PublicadorOutbox`, procesador de la cola `outbox`, `backoff` | `plataforma/prisma` (`PrismaService`, barril), `plataforma/colas`, `plataforma/reloj`, `plataforma/config`. **Nunca** `modulos/` (regla 7) |
| `modulos/canales` (**nuevo**) | Entrada, inbox, puertos de consumo y salida, adaptador Chatwoot, perfil | `plataforma/{config,reloj,colas,outbox,errores,documentacion}`; `plataforma/prisma` solo desde `infraestructura/` y `canales.module.ts` (regla 12). Ningún módulo de negocio |
| `AppModule` | Importa `ColasModule` y `CanalesModule` | — |
| `configurar-aplicacion.ts`, `main.ts` | `OPCIONES_APLICACION`, límite JSON, middleware de error de cuerpo (D2) | — |

## Puertos y adaptadores

| Puerto (token) | Interfaz (resumen) | Implementación | Exportado |
|---|---|---|---|
| `SALIDA_CANAL` | `enviarMensajes`, `cambiarEstado`, `agregarEtiquetas` (encolan) | `SalidaCanalOutbox` (aplicación) | **Sí** (D9) |
| `CONSUMIDOR_EVENTOS_CANAL` | `consumir(evento: EventoCanal)` | `ConsumidorRegistrador` por defecto; Fase 05 registra el suyo | Interfaz y `RegistroConsumidorEventosCanal`: sí |
| `ADAPTADOR_CANAL` | `enviarTexto`, `existeMensajeConMarca`, `cambiarEstado`, `agregarEtiquetas` (síncronos, HTTP) | `AdaptadorCanalChatwoot` + `ClienteChatwoot` | No |
| `REPOSITORIO_EVENTO_ENTRANTE` | `registrar`, `iniciarIntento`, `marcarProcesado`, `marcarMuerto`, `listarPendientesAntesDe` | `RepositorioEventoEntrantePrisma` | No |
| `COLA_EVENTOS_ENTRANTES` | `encolar(id)` (con tope de 200 ms) | `ColaEventosEntrantesBullmq` | No |
| `REGISTRO_OUTBOX` (plataforma) | `agregar(entradas)` | `RegistroOutboxPrisma` | Sí (barril de `plataforma/outbox`) |

## Configuración

Nuevas en `plataforma/config/esquema.ts` (única lectura de `process.env`, PLT1), con default de
desarrollo salvo donde se indica; `.env.example` documenta cada una:

```ts
CHATWOOT_URL: z.string().url().default('http://localhost:3001'),
CHATWOOT_ACCOUNT_ID: z.coerce.number().int().min(1).default(1),
CHATWOOT_BOT_TOKEN: z.string().default(''),          // obligatorio no vacío en production (superRefine)
CHATWOOT_WEBHOOK_SECRETO: z.string().default(''),    // obligatorio no vacío en production; vacío ⇒ todo 401 (D3)
CHATWOOT_WEBHOOK_TOLERANCIA_S: z.coerce.number().int().min(30).max(3600).default(300),
CHATWOOT_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
COLAS_PREFIJO: z.string().default('luxe:colas'),
COLAS_TRABAJADORES: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
INBOX_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(5),
INBOX_BARRIDO_MS: z.coerce.number().int().min(1000).default(30000),
OUTBOX_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(5),
OUTBOX_BACKOFF_BASE_S: z.coerce.number().int().min(1).default(15),
OUTBOX_BACKOFF_MAX_S: z.coerce.number().int().min(1).default(300),
OUTBOX_BARRIDO_MS: z.coerce.number().int().min(500).default(5000),
OUTBOX_LEASE_S: z.coerce.number().int().min(10).default(60),
```

`CHATWOOT_BOT_TOKEN` y `CHATWOOT_WEBHOOK_SECRETO` entran en `CLAVES_SECRETOS` de redacción si
alguna vez se loguea la configuración (hoy no se loguea). Los tres sitios que construyen una
`Configuracion` literal (`scripts/generar-contrato.ts`, `test/e2e/aplicacion.e2e-spec.ts`,
`test/contrato/soporte.ts` y `test/contrato/docs.spec.ts`) agregan los campos; los de contrato fijan
`COLAS_TRABAJADORES: false` (D6).

## Data Flow

**Entrada**

```
Chatwoot ─POST /api/v1/webhooks/chatwoot─► body-parser JSON 1 MB (req.body + req.rawBody)   [D2]
   │  >1 MB → 413 problem+json · JSON inválido → 400 · nada se registra
   ▼
GuardiaFirmaChatwoot (HMAC ts.rawBody, tolerancia, CLOCK)                                  [D3]
   │  inválida/ausente → 401 problem+json, sin fila (R3, CAN2)
   ▼
WebhookChatwootController ─► traducirEvento(json, cabeceras)  (lista blanca)               [D4]
   │  ignorado → 200 {estado:'ignorado'}, sin fila (CAN3)
   ▼
RegistrarEventoEntrante ─► INSERT evento_entrante (payload = EventoCanal v1, redactado)    [D5]
   │  P2002 (origen,id_externo) → 200 {estado:'duplicado'} (R4)
   ├─► COLA_EVENTOS_ENTRANTES.encolar(id)  jobId=id, tope 200 ms (fallo → solo log)
   └─► 200 {estado:'registrado'}  (< 500 ms, CAN1)

cola canales-inbox ─► ProcesadorInbox ─► ProcesarEventoEntrante                            [D7]
   ├─ iniciarIntento(id): intentos+1, solo si pendiente (si no, termina)
   ├─ CONSUMIDOR_EVENTOS_CANAL.consumir(evento)  (Fase 04: ConsumidorRegistrador)          [D8]
   ├─ éxito → procesado_en = ahora
   └─ fallo → BullMQ reintenta (2,4,8,16 s); último → error = '<Clase>[: código]' (CAN4)
barrido-inbox (30 s) ─► pendientes > 30 s sin error ─► encolar(id) otra vez
```

**Salida**

```
(Fase 05+) conversaciones/salida ─► SALIDA_CANAL.enviarMensajes({conversacion, idRespuesta, mensajes[]})
   ▼
SalidaCanalOutbox ─► claves (dominio, D11) ─► REGISTRO_OUTBOX.agregar(n filas, una transacción,
   │                  ON CONFLICT DO NOTHING; payload {grupo:'canal:<id>', orden, datos, efimero:{texto}})
   └─► cola outbox: job 'publicar' (tope 200 ms)          + barrido-outbox (5 s)
          ▼
PublicadorOutbox.publicarPendientes()  (bucle ≤ 50 vueltas)                                 [D10]
   ├─ reclamar(lote): FOR UPDATE SKIP LOCKED, sin predecesor pendiente del grupo,
   │                  intentos+1, proximo_intento = ahora + lease
   └─ por fila, en orden ─► RegistroManejadoresOutbox[tipo] ─► PublicarEfectoCanal
          ├─ canal.mensaje: si intento > 1 → existeMensajeConMarca? sí → éxito sin POST     [D13]
          │                 no → ADAPTADOR_CANAL.enviarTexto(conv, texto, marca=clave)
          ├─ canal.estado   → toggle_status
          └─ canal.etiquetas→ GET labels ∪ nuevas → POST labels                              [D15]
                 ▼
          ClienteChatwoot (fetch, timeout 10 s, sin reintentos) → FalloCanal                 [D12]
   éxito → enviado_en, payload - 'efimero'
   transitorio → proximo_intento = ahora + min(15·2^(n−1), 300) s | 5.º → error 'agotado'
   permanente → error 'permanente' + resto de la secuencia 'secuencia abortada'
```

## File Changes

| Archivo | Acción | Slice | Descripción |
|---|---|---|---|
| `test/fixtures/chatwoot/*.json` + `README.md` (procedencia) | Create | (a) | Payloads reales anonimizados: `message_created` incoming (texto y con adjunto), outgoing humano, outgoing bot, nota privada, `conversation_status_changed` (`open`, `pending`, `resolved`), un evento ignorado (Q3) |
| `test/soporte/chatwoot.ts` | Create | (a) | `firmarComoChatwoot`, carga de fixtures |
| `src/modulos/canales/dominio/evento-canal.ts` | Create | (a) | `EventoCanal`, `CanalOrigen`, `TipoContenido`, `EstadoConversacionCanal` |
| `src/modulos/canales/dominio/perfil-capacidades.ts` (+ spec) | Create | (a) | D14, CAN8 |
| `src/modulos/canales/dominio/claves-idempotencia.ts` (+ spec) | Create | (a) | D11 |
| `src/modulos/canales/infraestructura/chatwoot/verificar-firma.ts` (+ spec) | Create | (a) | D3, portado |
| `src/modulos/canales/infraestructura/chatwoot/traducir-evento.ts` (+ spec) | Create | (a) | D4: zod + normalización + redacción por lista blanca (CAN3, CAN5) |
| `src/modulos/canales/infraestructura/chatwoot/canal-desde-chatwoot.ts` (+ spec) | Create | (a) | D14 |
| `src/plataforma/config/esquema.ts` (+ spec) | Modify | (b) | `CHATWOOT_*` (y en (c)/(e) `COLAS_*`, `INBOX_*`, `OUTBOX_*`) |
| `src/configurar-aplicacion.ts`, `src/main.ts` | Modify | (b) | D2 |
| `src/plataforma/errores/catalogo-codigos.ts` | Modify | (b) | `firma-invalida` (401), `carga-demasiado-grande` (413) |
| `src/modulos/canales/puertos/repositorio-evento-entrante.ts`, `cola-eventos-entrantes.ts` | Create | (b) | Tokens + interfaces |
| `src/modulos/canales/infraestructura/repositorio-evento-entrante-prisma.ts` | Create | (b) | `registrar` (P2002 → duplicado) y el resto de métodos de D7 |
| `src/modulos/canales/aplicacion/registrar-evento-entrante.ts` (+ spec) | Create | (b) | D5 |
| `src/modulos/canales/interfaz/guardia-firma-chatwoot.ts`, `webhook-chatwoot.controller.ts`, `esquemas.ts` | Create | (b) | D3, D5; `@ApiTags('internal')` |
| `src/modulos/canales/canales.module.ts`, `index.ts`; `src/app.module.ts` | Create/Modify | (b) | D16 (en (b) la cola es un doble que no encola; (c) la conecta) |
| `openapi/openapi.interno.json`, `openapi/openapi.json` | Modify | (b) | Regenerados en el mismo commit |
| `scripts/generar-contrato.ts`, `test/contrato/soporte.ts`, `test/contrato/docs.spec.ts`, `test/e2e/aplicacion.e2e-spec.ts` | Modify | (b), (c) | Campos nuevos de `Configuracion`, `OPCIONES_APLICACION` |
| `test/integracion/canales/webhook.spec.ts` | Create | (b) | R3, CAN1, CAN2, CAN3, CAN5, R4 (dedupe), 413 |
| `package.json` | Modify | (c) | `bullmq`, `@nestjs/bullmq` |
| `src/plataforma/colas/{colas.module.ts,opciones-conexion.ts,index.ts}` (+ spec) | Create | (c) | D6 |
| `src/modulos/canales/puertos/consumidor-eventos-canal.ts` | Create | (c) | Token, interfaz |
| `src/modulos/canales/aplicacion/{registro-consumidor-eventos-canal.ts,consumidor-registrador.ts,procesar-evento-entrante.ts}` (+ specs) | Create | (c) | D7, D8 |
| `src/modulos/canales/infraestructura/{procesador-inbox.ts,cola-eventos-entrantes-bullmq.ts}` | Create | (c) | D6, D7 |
| `test/integracion/canales/procesador-inbox.spec.ts` | Create | (c) | R4 (una ejecución), CAN4, barrido |
| `src/modulos/canales/puertos/{salida-canal.ts,adaptador-canal.ts}` | Create | (d) | D9, CAN6; `FalloCanal` |
| `src/modulos/canales/infraestructura/chatwoot/{cliente-chatwoot.ts,adaptador-canal-chatwoot.ts}` (+ specs) | Create | (d) | D12, D13, D15 |
| `test/soporte/chatwoot-falso.ts` | Create | (d) | Servidor HTTP local que imita la API de Chatwoot (respuestas programables, registro de llamadas, `content_attributes`) |
| `test/integracion/canales/adaptador-chatwoot.spec.ts` | Create | (d) | CAN6 (3 escenarios), clasificación 429/5xx/4xx/timeout |
| `prisma/schema.prisma`, `prisma/migrations/<ts>_outbox_clave_idempotencia/migration.sql`, `MODELO_DATOS.md` §7 | Modify/Create | (e) | D11 |
| `src/plataforma/outbox/{outbox.module.ts,registro-outbox-prisma.ts,registro-manejadores.ts,publicador-outbox.ts,procesador-outbox.ts,backoff.ts,tipos.ts,index.ts}` (+ specs) | Create | (e) | D10, D12 |
| `src/modulos/canales/aplicacion/{salida-canal-outbox.ts,publicar-efecto-canal.ts}` (+ specs) | Create | (e) | D9, D10, D13 |
| `test/integracion/outbox/publicador-outbox.spec.ts` | Create | (e) | Reclamo, orden por grupo, lease, invariante `error`, `efimero` eliminado |
| `test/integracion/canales/salida-outbox.spec.ts` | Create | (e) | R4 escenario 2, CAN7, cero duplicados (incluida respuesta perdida, D13) |
| `test/e2e/canal-chatwoot.e2e-spec.ts` | Create | (e) | Criterio de salida completo por HTTP contra Chatwoot falso |
| `infra/chatwoot/{docker-compose.yml,.env.example,init/*}`, `scripts/chatwoot-*.sh` | Create | (f) | Portados del prototipo (inventario l. 56); apuntan el webhook del Agent Bot a `/api/v1/webhooks/chatwoot` |
| `scripts/capturar-fixtures-chatwoot.ts` (opcional) | Create | (a) o (f) | Solo si Q3 confirma que no hay capturas: graba y anonimiza |
| `.env.example` | Modify | (b)-(e) | Variables nuevas |
| `docs/analisis/04-chatwoot-delegar-vs-construir.md` §3 | Modify | (f) | P13 (tabla propia) y auto-resolver (apagado) |
| `.claude/skills/whatsapp-meta-conventions/`, `.atl/skill-registry.md` | Create/Modify | (f) | Inventario l. 85 |
| `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modify | (f) | §1 `canales`, `plataforma/colas`, `plataforma/outbox`; convención de body crudo (D2); patrón de registro (D8/D10); flag `COLAS_TRABAJADORES` |
| `docs/adr/0004-inbox-outbox.md` | Modify | (e) | Enmienda propuesta (ver ADRs) |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modify | al archivar | Filas 37-40, 56, 63, 85 |

## Interfaces / Contracts

```ts
// src/modulos/canales/dominio/evento-canal.ts (D4)
export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'web' | 'otro'; // = enum canal_conversacion
export type TipoContenido = 'texto' | 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'sticker' | 'otro';
export type EstadoConversacionCanal = 'abierta' | 'pendiente' | 'resuelta' | 'pospuesta';

export interface ReferenciaConversacion {
  readonly idExterno: string;            // id de conversación del proveedor (Chatwoot: entero como texto)
  readonly idContactoExterno: string | null; // chatwoot_contact_id (CAN5, inventario l. 63)
  readonly canal: CanalOrigen;
  readonly canalProveedor: string | null;    // conversation.channel crudo, p. ej. 'Channel::Whatsapp' (CAN5)
}
interface BaseEvento { readonly v: 1; readonly eventoProveedor: string; readonly conversacion: ReferenciaConversacion }
export type EventoCanal =
  | (BaseEvento & { readonly tipo: 'mensaje-entrante'; readonly idMensaje: string; readonly tipoContenido: TipoContenido })
  | (BaseEvento & { readonly tipo: 'mensaje-humano'; readonly idMensaje: string })
  | (BaseEvento & { readonly tipo: 'estado-conversacion'; readonly estado: EstadoConversacionCanal });

// src/modulos/canales/dominio/perfil-capacidades.ts (D14, CAN8)
export type TipoAdjunto = 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'archivo';
export type PerfilCapacidades =
  | {
      readonly soportado: true;
      readonly canal: CanalOrigen;
      readonly ventanaRespuestaHoras: number | null;   // WhatsApp: 24
      readonly mensajeSalienteTieneCosto: boolean;     // WhatsApp: true
      readonly traeTelefono: boolean;                  // WhatsApp: true
      readonly indicadorEscribiendo: 'meta-directo' | 'chatwoot' | 'ninguno'; // WhatsApp: 'meta-directo' (Fase 08)
      readonly adjuntosEntrantes: readonly TipoAdjunto[]; // WhatsApp: imagen, audio, ubicacion, documento
      readonly limitesInteractivos: { readonly textoBoton: number; readonly descripcionFila: number } | null; // WhatsApp: 24 / 72
    }
  | { readonly soportado: false; readonly canal: CanalOrigen; readonly motivo: 'canal-no-soportado' };
export function perfilDeCapacidades(canal: CanalOrigen): PerfilCapacidades;

// src/modulos/canales/dominio/claves-idempotencia.ts (D11)
export const MAX_PASOS_SECUENCIA = 20;
export function claveMensaje(idConversacion: string, idRespuesta: string, paso: number): string;
export function claveEstado(idConversacion: string, idOperacion: string): string;
export function claveEtiquetas(idConversacion: string, idOperacion: string): string;
export function grupoConversacion(idConversacion: string): string; // 'canal:<id>'

// src/modulos/canales/puertos/consumidor-eventos-canal.ts (D8)
export const CONSUMIDOR_EVENTOS_CANAL = Symbol('CONSUMIDOR_EVENTOS_CANAL');
/** MUST ser idempotente: la entrega es al menos una vez (ADR-0004, D7). */
export interface ConsumidorEventosCanal { consumir(evento: EventoCanal): Promise<void> }

// src/modulos/canales/puertos/salida-canal.ts (D9, CAN6) — exportado
export const SALIDA_CANAL = Symbol('SALIDA_CANAL');
export type MensajeSaliente = { readonly tipo: 'texto'; readonly texto: string }; // 'imagen' llega en la Fase 07
export interface SolicitudEnvioMensajes {
  readonly idConversacion: string;
  readonly idRespuesta: string;                  // estable entre reintentos de quien llama (D11)
  readonly mensajes: readonly MensajeSaliente[]; // 1..20, en orden
}
export interface SolicitudCambioEstado {
  readonly idConversacion: string; readonly idOperacion: string;
  readonly estado: Exclude<EstadoConversacionCanal, 'pospuesta'>;
}
export interface SolicitudEtiquetas {
  readonly idConversacion: string; readonly idOperacion: string; readonly etiquetas: readonly string[];
}
/** Resuelve cuando el efecto quedó durable en el outbox, no cuando llegó al cliente. */
export interface SalidaCanal {
  enviarMensajes(s: SolicitudEnvioMensajes): Promise<void>;
  cambiarEstado(s: SolicitudCambioEstado): Promise<void>;
  agregarEtiquetas(s: SolicitudEtiquetas): Promise<void>;
}

// src/modulos/canales/puertos/adaptador-canal.ts (D12, D13, D15) — interno
export const ADAPTADOR_CANAL = Symbol('ADAPTADOR_CANAL');
export type NaturalezaFallo = 'transitorio' | 'permanente';
export class FalloCanal extends Error {
  constructor(readonly naturaleza: NaturalezaFallo, readonly causa: string, readonly esperaSugeridaS?: number) { super(causa); }
}
export interface AdaptadorCanal {
  enviarTexto(idConversacion: string, texto: string, marca: string): Promise<void>;
  existeMensajeConMarca(idConversacion: string, marca: string): Promise<boolean>;
  cambiarEstado(idConversacion: string, estado: Exclude<EstadoConversacionCanal, 'pospuesta'>): Promise<void>;
  agregarEtiquetas(idConversacion: string, etiquetas: readonly string[]): Promise<void>;
}

// src/modulos/canales/puertos/repositorio-evento-entrante.ts (D5, D7) — interno
export type ResultadoRegistro = { readonly resultado: 'nuevo'; readonly id: string } | { readonly resultado: 'duplicado' };
export interface RepositorioEventoEntrante {
  registrar(e: { origen: string; idExterno: string; payload: EventoCanal }): Promise<ResultadoRegistro>;
  iniciarIntento(id: string): Promise<EventoCanal | null>; // null: ya procesado o muerto
  marcarProcesado(id: string, ahora: Date): Promise<void>;
  marcarMuerto(id: string, error: string): Promise<void>;
  listarPendientesAntesDe(limite: Date, maximo: number): Promise<readonly string[]>;
}

// src/plataforma/outbox/tipos.ts (D10) — barril de plataforma/outbox
export const REGISTRO_OUTBOX = Symbol('REGISTRO_OUTBOX');
export interface NuevaEntradaOutbox {
  readonly tipo: string;                 // 'canal.mensaje' | 'canal.estado' | 'canal.etiquetas' (esta fase)
  readonly claveIdempotencia: string;
  readonly grupo: string;
  readonly orden: number;
  readonly datos: Readonly<Record<string, unknown>>;   // persiste
  readonly efimero?: Readonly<Record<string, unknown>>; // se elimina al cerrar la fila
}
export interface RegistroOutbox { agregar(entradas: readonly NuevaEntradaOutbox[]): Promise<void> } // una transacción, ON CONFLICT DO NOTHING
export interface EntradaOutbox extends NuevaEntradaOutbox { readonly id: string; readonly intento: number } // intento ≥ 1
export class FalloPublicacion extends Error {
  constructor(readonly clase: 'transitorio' | 'permanente', readonly causa: string, readonly esperaSugeridaS?: number) { super(causa); }
}
export interface ManejadorOutbox { publicar(entrada: EntradaOutbox): Promise<void> } // lanza FalloPublicacion
export declare class RegistroManejadoresOutbox { registrar(tipo: string, manejador: ManejadorOutbox): void } // duplicado ⇒ error

// src/plataforma/outbox/backoff.ts (D12)
export function retrasoSegundos(intentos: number, baseS: number, maxS: number): number; // min(base·2^(n−1), max)

// src/plataforma/colas/opciones-conexion.ts (D6)
export function opcionesConexionColas(redisUrl: string): import('ioredis').RedisOptions; // maxRetriesPerRequest: null

// Datos de cada tipo de outbox de canales (D10)
// canal.mensaje   datos: { idConversacion, secuencia: idRespuesta, paso, total }   efimero: { texto }
// canal.estado    datos: { idConversacion, estado }
// canal.etiquetas datos: { idConversacion, etiquetas }
```

Contrato HTTP del webhook (`interfaz/esquemas.ts`, única fuente, skill §10):

- Cuerpo: `z.looseObject({ event: z.string() })` (valida solo la envoltura; el resto lo traduce D4).
- Cabeceras requeridas documentadas: `X-Chatwoot-Signature`, `X-Chatwoot-Timestamp`; opcional
  `X-Chatwoot-Delivery`.
- `200`: `{ estado: 'registrado' | 'duplicado' | 'ignorado' }`. `401` `firma-invalida`, `400`
  `validacion-fallida`, `413` `carga-demasiado-grande`, `500` `error-interno` (todas problem+json).

## Testing Strategy

TDD estricto (RED observado → GREEN → REFACTOR), Vitest. Cada escenario de la spec delta tiene un test
nombrado `"<R#|CAN#> — <título exacto del escenario>"`.

| Nivel | Qué | Escenarios |
|---|---|---|
| Unitario | `verificarFirmaChatwoot`: válida, ausente, prefijo, fuera de tolerancia, secreto vacío, longitud distinta; fixtures reales firmados | R3 (2), CAN2 |
| Unitario | `traducirEvento` sobre cada fixture: tipos reconocidos, ignorados, `id_externo`, y **aserción negativa** de que el JSON serializado no contiene texto, URL de adjunto, teléfono, nombre, correo ni `wamid` de ningún fixture | CAN3, CAN5 (2) |
| Unitario | `perfilDeCapacidades`, `canalDesdeChatwoot` | CAN8 (2) |
| Unitario | `claves-idempotencia`, `retrasoSegundos`, `opcionesConexionColas` | soporte de R4/CAN7, D6 |
| Unitario | `RegistrarEventoEntrante`, `ProcesarEventoEntrante`, `SalidaCanalOutbox`, `PublicarEfectoCanal` con dobles de puertos (`test/fakes/`) y `ClockFalso` | CAN4 (lógica), D13 (rama de reconciliación) |
| Integración | Webhook con la app real (Postgres + Redis de Testcontainers): firma válida → fila redactada y 2xx < 500 ms; inválida/ausente → 401 sin fila; tipo desconocido → 2xx sin fila; duplicado → una fila; > 1 MB → 413 problem+json | R3 (2), CAN1, CAN2, CAN3, CAN5, R4 escenario 1 |
| Integración | Procesador del inbox: mismo evento dos veces → consumidor una vez; consumidor que falla siempre → `error` e `intentos = 5`, fila presente; Redis caído en el ACK → el barrido lo procesa | R4 escenario 1, CAN4 |
| Integración | `AdaptadorCanalChatwoot` contra `chatwoot-falso`: ruta, método y `api_access_token` de cada operación; 429 con `Retry-After`, 500, timeout, 404 → naturaleza correcta; etiquetas por unión | CAN6 (3), CAN7 (clasificación) |
| Integración | `PublicadorOutbox` contra Postgres real: orden por grupo, predecesor pendiente bloquea, dos publicadores concurrentes no duplican (`SKIP LOCKED`), lease vencido se reclama, `efimero` desaparece al cerrar, invariante `error` | R4 escenario 2, CAN7 (2) |
| Integración | Secuencia de 3 mensajes, el 2.º responde 500 una vez → el falso Chatwoot recibe cada mensaje exactamente una vez y en orden; el 2.º responde tras el timeout (mensaje creado, respuesta perdida) → reconciliación, sin segundo POST | R4 escenario 2, D13 |
| Integración | Arranque/cierre: `app.close()` con un job de inbox en curso espera a que termine antes de desconectar Prisma | PLT5 |
| Contrato | `contrato:deriva` sin Redis disponible (`COLAS_TRABAJADORES: false`) sigue determinista y termina | D6, D16 |
| E2E | `canal-chatwoot.e2e-spec.ts`: evento firmado → inbox → consumidor una vez; `SALIDA_CANAL` con reintento → cero duplicados en Chatwoot falso | Criterio de salida de la fila 04 |

Los tests nunca dependen de una instancia real de Chatwoot (proposal, Dependencies); la instancia
local solo sirve para grabar fixtures y la verificación de D13.

## Threat Matrix

Matriz formal de la skill (rutas de documentación, selección de repositorio git, estado de commit,
push, comandos de PR): **N/A** — este cambio no introduce ejecución de shell, subprocesos,
automatización de VCS/PR ni clasificación de archivos ejecutables.

Vectores propios de la fase (el webhook es la primera superficie HTTP expuesta a un tercero):

| Vector | Mitigación | RED test |
|---|---|---|
| Petición falsificada al webhook | HMAC sobre body crudo en guardia, antes de todo (D3) | firma inválida/ausente → 401, sin fila |
| Replay de un payload capturado | Tolerancia de timestamp de 300 s con `CLOCK` (D3); dedupe por `(origen, id_externo)` dentro y fuera de la ventana | timestamp a 301 s → 401 |
| Firma validada sobre JSON re-serializado | `req.rawBody` nativo (D2); el HMAC nunca usa `JSON.stringify(req.body)` | fixture con espacios/orden de claves no canónico firmado de verdad → 200 |
| Despliegue sin secreto acepta todo | Secreto vacío ⇒ `false` (falla cerrada) + `superRefine` en production | secreto `''` → 401 |
| Cuerpo gigante (DoS de memoria) | Límite 1 MB en el parser (D2) | 1 MB + 1 byte → 413 |
| PII en la base (R14) | Lista blanca en la traducción (D4), `wamid` excluido, `efimero` eliminado al cerrar la fila (D10), `error` sin `message` libre (D7) | aserciones negativas sobre fixtures; fila enviada sin `efimero` |
| PII en logs (R14) | `req.body` ya redactado; clientes y procesadores loguean ids, nunca contenido ni token | test de redacción existente + caso con cabecera `api_access_token` |
| Token de Chatwoot filtrado en errores | `FalloCanal` solo con método, `pathname` y status (D12) | fallo 500 → mensaje sin token ni cuerpo |
| Mensaje duplicado al cliente | Clave única + marca por fila + reconciliación (D11, D13) | escenario de respuesta perdida |

## ADRs

| ADR | Relación | Cambio en el documento |
|---|---|---|
| ADR-0004 | Implementado: inbox y outbox reales | **Enmienda propuesta** (estado `propuesta` hasta que el usuario la acepte): (1) los mensajes al cliente viajan por el outbox con su texto en un campo efímero que se borra al cerrar la fila; (2) `clave_idempotencia NOT NULL UNIQUE` como forma de B5; (3) un solo mecanismo de reintento: los clientes HTTP no reintentan |
| ADR-0005 | Implementado: puerto de canal, adaptador Chatwoot único, perfil de capacidades | Ninguno, salvo nota "Implementado en la Fase 04" al cerrar. La enmienda de ADR-0004 cita la prohibición de "guardar contenido de mensajes" y explica por qué el campo efímero no la viola (o la ajusta, según decida el usuario) |
| ADR-0009 | Testcontainers: se usa también para BullMQ (Redis con prefijo por worker) | Nota al cerrar |

**ADR nuevo: ninguno.** D2 (body crudo), D6 (conexiones de BullMQ), D8 (registro) y D15 (unión de
etiquetas) son reversibles sin romper el contrato observable de `canales`; se documentan en la skill
§1-§3 como convenciones. La única decisión de alcance de política (contenido saliente persistido,
aunque sea efímero) toca un ADR aceptado, por eso va como enmienda y no como ADR suelto.

## Migration / Rollout

`auto-chain`, cadena `stacked-to-main`, slices del Approach de la proposal:

- **(a)** Puro + fixtures: firma, traducción/redacción, `CanalOrigen`, perfil, claves. Primero la
  tarea de Q3 (capturas y anonimización), que además verifica `X-Chatwoot-Delivery`,
  `conversation.channel` y la persistencia de `content_attributes` (D13).
- **(b)** Webhook + inbox + dedupe: D2 (`main.ts`), guardia, controlador, repositorio, códigos de
  error, `CanalesModule` en `AppModule`, contrato regenerado. La cola es un doble que no encola.
- **(c)** BullMQ + procesador del inbox: `plataforma/colas`, procesador, registro de consumidor,
  barrido, PLT5.
- **(d)** Adaptador Chatwoot: puertos de salida, cliente HTTP, clasificación de fallos, Chatwoot falso.
- **(e)** Outbox: migración `clave_idempotencia`, `plataforma/outbox`, `SalidaCanalOutbox`, manejador
  de efectos, reconciliación, e2e de cero duplicados, enmienda de ADR-0004. Es la slice con más riesgo
  de superar ~400 líneas; si lo hace, se parte en (e1) migración + `plataforma/outbox` con un manejador
  de prueba y (e2) integración con `canales`, en vez de pedir `size:exception`.
- **(f)** Infra local de Chatwoot, doc 04 §3, skill de Meta, skill de arquitectura.

**Migración de esquema**: una, aditiva (D11). Rollback = migración inversa nueva
(`DROP INDEX`, `DROP COLUMN`), nunca editar la aplicada. Sin datos que migrar (P7).

**Rollback de código**: cada slice se revierte sola en orden inverso. Quitar `ColasModule` deja
intacto el Redis de plataforma y el health check (PLT4 no depende de colas). Revertir D2 devuelve el
límite de 100 kB y retira `req.rawBody`, sin efecto sobre otros endpoints.

**Review**: RDD por commit de unidad de trabajo y `judgment-day` obligatorio sobre el rango de la fase
antes de `sdd-verify` (fila 04 de la lista 04/05/06/10). Focos sugeridos para los jueces: D10
(reclamo y orden), D11/D13 (cero duplicados), D4 (lista blanca y `wamid`), D2 (body crudo).

## Open Questions

Ninguna bloquea `sdd-tasks`. Cada una tiene un default ya aplicado en este diseño; el usuario puede
vetarla al aprobar.

- [ ] **Q1 (proposal)** — aplicado: 5 intentos, backoff 15 s → 300 s (≈ 3 min 45 s en total), 4xx
  sin reintento, sin alerta externa (solo log `error`) hasta la Fase 08. Inbox: 5 intentos, 2 → 16 s.
- [ ] **Q2 (proposal) + D2** — aplicado: 1 MB con 413, pero **global** para toda la app, no solo la
  ruta del webhook (la vía nativa de NestJS no admite límites por ruta sin desmontar el parser global).
- [ ] **Q3 (proposal)** — aplicado: tarea explícita de captura contra Chatwoot v4.17.1 local, con
  anonimización y procedencia; la misma tarea verifica `X-Chatwoot-Delivery` (D4),
  `conversation.channel` y `content_attributes` (D13).
- [ ] **D10 — contenido saliente en el outbox**: el texto de cada mensaje al cliente queda en Postgres
  (`payload.efimero`) solo mientras la fila está pendiente y se borra al enviarse o morir. Es la
  lectura más estricta posible que mantiene "no se pierde" (ADR-0004) sin guardar historial
  (ADR-0005). Si el usuario considera que incluso esto viola "no guardamos mensajes", la alternativa
  es contenido en Redis con TTL, aceptando que un Redis perdido mata mensajes pendientes.
- [ ] **D11** — `clave_idempotencia` **`NOT NULL`** (la proposal decía "text UNIQUE" sin fijar
  nulabilidad).
- [ ] **D13** — reconciliación por `content_attributes.luxe_clave`, condicionada a verificarla en
  Chatwoot local; si no funciona, se acepta el riesgo residual de duplicado en la ventana de
  respuesta perdida.
- [ ] **D15** — `agregarEtiquetas` con unión (GET + POST) en vez del reemplazo del prototipo.
- [ ] **D6** — flag `COLAS_TRABAJADORES` (default `true`) para que la generación del contrato y los
  tests de contrato no arranquen *workers*; no selecciona implementaciones.
- [ ] **D9** — el puerto de salida vive en `canales` (`SALIDA_CANAL`); `conversaciones/salida` lo
  envuelve en la Fase 05 y se agrega la regla de fronteras que lo hace el único consumidor.
- [ ] **Índice parcial en `outbox`** — **no** se agrega (`(proximo_intento) WHERE enviado_en IS NULL
  AND error IS NULL`): con el volumen de un solo negocio el reclamo es trivial; se propone solo si la
  Fase 09 mide lo contrario. El usuario aprobó una sola columna y este diseño no amplía el cambio de
  esquema sin su decisión.
