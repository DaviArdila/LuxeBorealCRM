# Multiempresa (plan de referencia)

Trabajo fuera de fase (ODD). **Estado: borrador, no iniciado.** Pendiente de que el dueño apruebe el
[ADR-0025](../../docs/adr/0025-multiempresa-negocio-id-y-rls.md) y decida cuándo empezar (P64). El dueño quiere hacerlo
**al final**, cuando la lógica del negocio esté pulida.

Es una foto del repositorio al **2026-10-06** (después de la Fase 12). Antes de empezar, se vuelve a recorrer el código:
las fases que vengan agregarán tablas, llaves y colas que este inventario aún no tiene.

## Objetivo

Que una sola instalación de LuxeBoreal atienda a varios negocios, cada uno con su catálogo, sus conversaciones, sus
usuarios, sus canales y su estilo de bot, sin que ningún negocio vea datos de otro. Las reglas R1-R16 no cambian.

## Qué no es

- No es una fase del roadmap todavía. Cuando arranque, se escribe su spec de fase (OpenSpec) a partir de este plan.
- No cambia las reglas de negocio, solo agrega «de qué negocio» a todo.
- No migra datos: no hay datos reales (P7). El esquema se rehace y las semillas se vuelven a correr.

## Cómo funciona el modelo elegido

Base compartida, `negocio_id` en cada tabla del negocio, filtro automático en el código y RLS en Postgres como red de
seguridad (ADR-0025).

```
  ENTRADAS                      RESOLVER NEGOCIO                 APLICACIÓN                     DATOS
 ┌────────────────┐          ┌──────────────────────┐       ┌────────────────────┐       ┌───────────────────────┐
 │ Webhook        │─────────▶│ account_id del evento│       │                    │       │ PostgreSQL            │
 │ Chatwoot       │          │  → negocio_id        │       │ ContextoNegocio    │       │  tablas con negocio_id│
 └────────────────┘          │                      │       │ (AsyncLocalStorage)│       │          ▲            │
 ┌────────────────┐          │ sesión → membresía   │──────▶│         │          │       │ RLS: SET LOCAL        │
 │ Back office    │─────────▶│  (usuario + negocio) │       │         ▼          │──────▶│ app.negocio_id        │
 │ Angular        │          │                      │       │ Extensión Prisma   │       └───────────────────────┘
 └────────────────┘          │ negocioId en el      │       │ (filtra / inserta) │       ┌───────────────────────┐
 ┌────────────────┐          │ payload del job      │       │         │          │──────▶│ Redis: n:{negocio}:…  │
 │ Jobs, barridos │─────────▶│                      │       │         ▼          │       ├───────────────────────┤
 │ y outbox       │          │ --negocio en la CLI  │       │ Módulos de dominio │──────▶│ MinIO: {negocio}/…    │
 └────────────────┘          └──────────────────────┘       └────────────────────┘       ├───────────────────────┤
 ┌────────────────┐                     ▲                                                │ Secretos por negocio  │
 │ CLI operación  │─────────────────────┘                                                │ (cifrados en la base) │
 └────────────────┘                                                                      └───────────────────────┘
```

Tres piezas:

1. **Resolver una vez, en la entrada.** Ninguna capa interior busca el negocio por su cuenta.
2. **`ContextoNegocio`** guarda el negocio de la petición o del job. Si falta, falla (nunca «todos los negocios»).
3. **Dos capas de filtro:** la extensión de Prisma en el código y la política RLS en la base.

## Inventario: base de datos

Referencia: `servicio/prisma/schema.prisma` al 2026-10-06 (24 modelos).

### Tablas nuevas

| Tabla | Para qué |
|---|---|
| `negocio` | Nombre, estado (activo/suspendido), zona horaria, fecha de alta |
| `membresia` | `(usuario_id, negocio_id, rol)`: en qué negocios trabaja una persona y con qué rol |
| `credencial_negocio` | Secretos por negocio, cifrados: token del bot y token de lectura de Chatwoot, secreto del webhook, chat de Telegram |
| `canal_negocio` | Cómo llega un evento a su negocio: `chatwoot_account_id` (único) y, si se suma, `phone_number_id` de Meta |

### Tablas que ganan `negocio_id`

| Modelo | Qué más cambia |
|---|---|
| `CategoriaProducto` | `nombre @unique` → `@@unique([negocioId, nombre])` |
| `Producto` | `sku @unique` → `@@unique([negocioId, sku])` |
| `Foto` | Hereda el negocio del producto; la clave de MinIO lleva el prefijo del negocio |
| `Parametro` | PK `clave` → PK `(negocio_id, clave)`. Incluye `llm_estado_techo`: el techo del LLM pasa a ser por negocio |
| `ZonaSinCobertura` | Único `(departamento, ciudad)` → `(negocio, departamento, ciudad)` |
| `TarifaEstimada` | Las tarifas son del negocio |
| `EventoFueraCobertura` | — |
| `Contacto` | `telefono`, `documento` y `chatwoot_contact_id` únicos → únicos **por negocio** (la misma persona puede ser cliente de dos negocios) |
| `Conversacion` | `chatwoot_conversation_id @unique` → `(negocio, chatwoot_conversation_id)`: con varias cuentas de Chatwoot los IDs ya no son únicos en la instancia |
| `Lead` | — |
| `ExcepcionHorario` | PK `fecha` → PK `(negocio_id, fecha)` |
| `MovimientoInventario` | — |
| `Venta` | `numero` autoincremental global → consecutivo **por negocio** (contador en `negocio` o secuencia por negocio) |
| `VentaItem`, `Envio` | Heredan el negocio de la venta; se agrega la columna igual para que RLS no dependa de un join |
| `EventoEntrante` | Único `(origen, id_externo)` → `(negocio, origen, id_externo)` |
| `Outbox` | `clave_idempotencia` única por negocio. El worker restablece el contexto del negocio de la fila antes de despachar |
| `UsoLlm` | Base para medir, frenar y facturar el consumo por negocio |
| `VersionEstilo` | `version @unique` → `(negocio, version)` |
| `CategoriaCaso` | `nombre_normalizado` único por negocio |
| `CasoAsistente` | `titulo_normalizado` y `clave_sistema` únicos por negocio. `casos:sembrar` siembra los casos del sistema **por negocio** |

### Tablas que quedan globales

| Modelo | Por qué |
|---|---|
| `Departamento`, `Ciudad` | Catálogo DANE, igual para todos (ADR-0007: llave natural) |
| `Usuario` | La persona es global. `email` sigue único; el rol sale de `membresia` (el campo `rol` actual se mueve allá) |

### Restricciones de la base

- Política RLS por tabla del negocio: `USING (negocio_id = current_setting('app.negocio_id')::uuid)`, con el mismo
  `WITH CHECK` para escribir.
- Rol de aplicación sin `BYPASSRLS`. Las migraciones corren con otro rol.
- Las políticas y los `SET LOCAL` se escriben como bloques `-- [manual]` en la migración y se registran en
  `prisma/README.md`. Una guardia de test los busca en el catálogo de Postgres (skill §5).

## Inventario: servicios e infraestructura

| Área | Hoy | Con multiempresa |
|---|---|---|
| **Webhook de Chatwoot** (`canales/interfaz/webhook-chatwoot.controller.ts`) | Un secreto (`CHATWOOT_WEBHOOK_SECRETO`) y una cuenta | Resuelve el negocio por `account.id` del evento (`canal_negocio`), valida la firma con el secreto de **ese** negocio y abre el contexto. Evento de una cuenta desconocida: se descarta y se registra |
| **Cliente de Chatwoot** (`canales/infraestructura/chatwoot/cliente-chatwoot.ts`) | URL con `CHATWOOT_ACCOUNT_ID` y `CHATWOOT_BOT_TOKEN` del entorno | Lee cuenta y tokens de `credencial_negocio` según el contexto. `CHATWOOT_URL` sigue en el entorno: misma instancia |
| **Enlaces a Chatwoot** (`notificaciones/aplicacion/resolver-enlace-conversacion.ts`) | `CHATWOOT_ACCOUNT_ID` | La cuenta del negocio |
| **Telegram** (`notificaciones/infraestructura/notificador-telegram.ts`) | Un `TELEGRAM_CHAT_ID` | Un chat por negocio. El bot (`TELEGRAM_BOT_TOKEN`) puede ser uno solo para todos |
| **Colas BullMQ** (`conversaciones-turno`, tres barridos, `leads-barrido`) | Jobs con el ID de la conversación | Cada job lleva `negocioId` y el worker abre el contexto antes de ejecutar. Los barridos recorren negocio por negocio. Límite de concurrencia por negocio, para que uno ruidoso no frene a los demás |
| **Inbox y outbox** (`plataforma/outbox`) | Filas sin negocio | Cada fila trae `negocio_id`; el despachador abre el contexto de la fila |
| **Redis** | `turno:{id}:lock`, `turno:{id}:buffer`, `mensaje:{id}:procesado`, `handoff:{id}:espera-enviada`, `rate:{contacto}:…`, `agente:{id}:v{n}:…` | Todas con prefijo `n:{negocioId}:`, armado por una sola función. Los IDs uuid ya evitan choques; el prefijo sirve para borrar, medir y depurar por negocio |
| **Sesión del back office** (`usuarios/infraestructura/redis/almacen-sesiones-redis.ts`) | `sesion:{id}` con usuario y rol | La sesión guarda el negocio activo y el rol de esa membresía. Cambiar de negocio rota la sesión. `auth:intentos:…` sigue global (el login es antes de elegir negocio) |
| **Guardias** (`usuarios/interfaz/guardia-sesion.ts`, `guardia-roles.ts`) | Rol del usuario | Rol de la membresía en el negocio activo, más un rol de plataforma para administrar negocios |
| **Pasarela LLM** (`llm/aplicacion/llm-gateway.ts`) | Cortacircuitos por modelo en memoria; techo mensual global en `parametro` | El cortacircuitos puede seguir por modelo si la llave del proveedor es compartida (la falla es del proveedor). El techo y el estado del techo pasan a ser por negocio. Si un negocio trae su propia llave, el circuito pasa a ser por `(negocio, modelo)` |
| **Agente** (estilo, casos, herramientas) | Un estilo y un juego de casos | Ya son datos (R15, ADR-0020, ADR-0024): basta con el filtro por negocio |
| **Horario** (`horario/dominio/horario.ts`) | `ZONA_HORARIA` constante | Zona horaria en `negocio`. `Clock` sigue igual; la conversión a hora local usa la zona del contexto |
| **Medios / MinIO** (`medios/infraestructura/almacenamiento-minio.ts`) | Un bucket y claves sin prefijo | Mismo bucket, claves `{negocioId}/…`. La URL pública cambia de forma: revisar el contrato |
| **Catálogo** (`CATALOGO_SHEET_ID`, `catalogo:importar`) | Una hoja y un import | Hoja por negocio en su configuración, e import con `--negocio` |
| **Configuración del entorno** (`plataforma/config/esquema.ts`) | Credenciales del negocio en `.env` | Salen del entorno: `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_BOT_TOKEN`, `CHATWOOT_API_TOKEN_LECTURA`, `CHATWOOT_WEBHOOK_SECRETO`, `TELEGRAM_CHAT_ID`, `CATALOGO_SHEET_ID`. Entra `LLAVE_CIFRADO_CREDENCIALES`. Lo técnico (timeouts, TTL, concurrencia) sigue en el entorno |
| **Logs y métricas** (`nestjs-pino`) | Sin negocio | Cada línea lleva `negocioId` (un ID, no PII: R14 se mantiene) |
| **CLI** (`usuario:crear`, `casos:sembrar`, `prompt:estilo`, `semilla:geografia`, `catalogo:importar`) | Un negocio implícito | `--negocio <id>` obligatorio, salvo `semilla:geografia` (global). Nuevo `negocio:crear` (alta con sus credenciales y su semilla de casos) |
| **Contrato OpenAPI** | Sin negocio | El negocio sale de la sesión, no de la URL, así que las rutas casi no cambian. Se agregan `GET /negocios` (los del usuario) y `POST /sesion/negocio` (cambiar el activo). Pasa por `contrato:diff` |
| **Cliente Angular** (`cliente/`) | Un negocio | Selector de negocio en la barra si el usuario tiene más de uno, y pantalla de administración de negocios para el rol de plataforma |
| **Tests** | Un negocio implícito | Fixture con un negocio por defecto en integración y e2e. **Test de aislamiento nuevo:** dos negocios, cada caso de uso, cero filas cruzadas, y otro que confirma que RLS bloquea una consulta sin filtro |
| **Evals** | Base de prueba | Corren dentro de un negocio de prueba |

## Plan por pasos

Cada paso es un slice de PR de unas 400 líneas (skill `chained-pr`). Los pasos 4 a 8 pueden ir en paralelo una vez
exista el contexto.

| # | Paso | Entrega |
|---|---|---|
| 0 | Aprobación | ADR-0025 `aceptada`, ADR-0006 `reemplazada por 0025`, P64 resuelta, spec de fase escrita y aprobada |
| 1 | Modelo de datos | `MODELO_DATOS.md`: `negocio`, `membresia`, `credencial_negocio`, `canal_negocio` y las llaves compuestas. **Lo decide el dueño** |
| 2 | Esquema y semillas | `schema.prisma` rehecho, migraciones reiniciadas (no hay datos), semillas por negocio, `negocio:crear` |
| 3 | Contexto | `ContextoNegocio` (`AsyncLocalStorage`) en `plataforma/`, extensión de Prisma que filtra e inserta, falla sin contexto |
| 4 | RLS | Políticas por tabla, `SET LOCAL` en el servicio de transacción, rol sin `BYPASSRLS`, guardia de test |
| 5 | Entradas | Webhook por `account_id`, sesión y membresía, jobs y outbox con `negocioId`, `--negocio` en la CLI |
| 6 | Infraestructura | Prefijo en Redis, claves de MinIO, concurrencia por negocio en BullMQ, `negocioId` en los logs |
| 7 | Configuración y secretos | `credencial_negocio` cifrada, salida de las variables del entorno, zona horaria y techo del LLM por negocio |
| 8 | Cliente y contrato | Selector de negocio, administración de negocios, contrato regenerado, `api:generar` |
| 9 | Aislamiento | Test de dos negocios en todos los casos de uso, evals en un negocio de prueba, documentación de operación |

## Preguntas para cuando arranque

No se responden ahora. Se pasan a `docs/PREGUNTAS_ABIERTAS.md` al escribir la spec de la fase.

1. ¿Cada negocio trae su propia llave del LLM, o la plataforma paga y le cobra?
2. ¿Una instancia de Chatwoot con una cuenta por negocio, o una instancia por negocio?
3. ¿Un asesor puede trabajar en varios negocios a la vez?
4. ¿Cómo se da de alta un negocio nuevo: solo por CLI, o con autoservicio?
5. ¿Hay facturación o planes? Hoy queda fuera del alcance.

## Recomendaciones vigentes (desde hoy, sin implementar multiempresa)

Están en la skill `luxeboreal-arquitectura` §5, «Preparado para multiempresa». Resumen:

1. Ningún dato del negocio en el código (R15): textos, horario, zona horaria, credenciales y parámetros son datos o
   configuración.
2. Todo acceso a datos pasa por el repositorio del módulo dueño, nunca un `prisma.x` suelto en un caso de uso.
3. Las llaves de Redis y las claves de MinIO se arman en **una** función por módulo, nunca con plantillas sueltas.
4. No se crean `@unique` globales en datos que serían por negocio (SKU, nombres, claves) sin anotarlo en esta tarea.
5. Un job de BullMQ lleva en su payload todo lo que necesita y no deduce su contexto de estado global.
6. Nada de estado en memoria del proceso (`Map`, caché) que dependa de datos del negocio sin una llave explícita.
7. Una credencial de canal nueva se lee en el adaptador, nunca en dominio o aplicación.
8. Si se agrega una tabla, llave, cola o credencial nueva, se suma una fila al inventario de este archivo.
