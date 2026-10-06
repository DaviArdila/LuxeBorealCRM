# 0025. Multiempresa con `negocio_id` y seguridad por fila (reemplazaría a 0006)

- Estado: propuesta
- Fecha: 2026-10-06

> **No se implementa todavía.** El dueño decidió (2026-10-06) terminar primero la lógica del negocio y hacer la
> multiempresa al final. Este ADR deja escrita la dirección para que lo que se construya desde hoy no la cierre.
> Mientras siga en `propuesta`, el [ADR-0006](0006-un-solo-negocio.md) sigue vigente y no se agrega `negocio_id`
> a ninguna tabla. El plan detallado vive en [`odd/tasks/multiempresa.md`](../../odd/tasks/multiempresa.md).

## Contexto

- El ADR-0006 eligió un solo negocio y dejó una condición para reabrirlo: que aparezca un segundo negocio concreto.
  El dueño quiere que el software termine sirviendo a varios negocios.
- **No hay datos reales.** La base solo tiene semillas (DANE, casos del sistema, usuario de desarrollo). Eso quita el
  paso más riesgoso de toda migración multiempresa: rellenar filas existentes. El esquema se puede rehacer.
- Hoy el negocio es implícito en cinco lugares:
  1. **Base de datos.** 24 modelos en `servicio/prisma/schema.prisma` y ninguno sabe de qué negocio es. Hay únicos
     globales que dejarían de serlo: `producto.sku`, `contacto.telefono`, `usuario.email`, `parametro.clave` (PK),
     `venta.numero` (autoincremento), entre otros.
  2. **Configuración.** Las credenciales y los IDs de canal son variables de entorno únicas: `CHATWOOT_ACCOUNT_ID`,
     `CHATWOOT_BOT_TOKEN`, `CHATWOOT_WEBHOOK_SECRETO`, `TELEGRAM_CHAT_ID`, `MINIO_BUCKET` y `CATALOGO_SHEET_ID`.
  3. **Redis.** Las llaves se arman por conversación o contacto, sin negocio: `turno:{id}:lock`,
     `agente:{id}:v{n}:historial`, `rate:{contacto}:h:…`, `sesion:{id}`.
  4. **Memoria del proceso.** El cortacircuitos del LLM (`LlmGateway.circuitos`, ADR-0013) es un `Map` por modelo.
  5. **Constantes.** `ZONA_HORARIA = 'America/Bogota'` en `horario/dominio/horario.ts`.
- Las tres reglas del ADR-0006 (nada del negocio en el código, módulos con fronteras, cliente sin identificarse por
  teléfono) ya se cumplen. Por eso el cambio es amplio pero mecánico: toca casi todos los módulos sin cambiar las
  reglas de negocio R1-R16.

## Alternativas

1. **Una base de datos (o un despliegue) por negocio.** Aislamiento total y cero cambios en las consultas. A cambio,
   cada migración, cada respaldo y cada despliegue se multiplican por N, y no hay vista entre negocios. Para dos
   personas operando, es el modelo más caro.
2. **Un esquema de Postgres por negocio.** Buen aislamiento dentro de una base. Pero las migraciones también se
   multiplican por N, Prisma no maneja bien el cambio de esquema por petición y el pool de conexiones se fragmenta.
3. **Base y esquema compartidos con `negocio_id` en cada tabla del negocio, reforzado con Row-Level Security (RLS)
   de Postgres.** Es el modelo estándar en SaaS: una sola migración y un solo despliegue. El riesgo es olvidar un
   filtro, y lo cubren dos capas: el filtro automático en el código y la política RLS en la base.

## Decisión

Se propone la **alternativa 3**:

- **Concepto y nombre:** `negocio` (tabla) y `negocio_id` (columna `uuid` v7, ADR-0007). Es el término del
  ADR-0006 y el que eligió el dueño.
- **Contexto por petición.** Cada entrada resuelve el negocio una sola vez: webhook, sesión del back office, job de
  BullMQ o CLI. Lo guarda en un contexto de `AsyncLocalStorage` (`ContextoNegocio`) que cualquier capa lee sin
  recibirlo por parámetro.
- **Filtro automático.** Una extensión del cliente Prisma agrega `negocio_id` a cada lectura y a cada escritura de
  las tablas del negocio. Los repositorios no lo escriben a mano. Si no hay negocio en el contexto, la extensión falla
  en vez de consultar sin filtro.
- **RLS como segunda capa.** Cada transacción ejecuta `SET LOCAL app.negocio_id = '…'`. Las políticas de Postgres
  filtran con esa variable, con un rol de aplicación sin `BYPASSRLS`. Aunque el código olvide el filtro, la base no
  devuelve filas de otro negocio.
- **Catálogos compartidos** sin `negocio_id`: `departamento` y `ciudad` (DANE). Las tablas por negocio que cuelgan
  de ellos sí lo llevan (`zona_sin_cobertura`, `tarifa_estimada`).
- **Usuarios con membresía.** `usuario` es la persona y `membresia (usuario_id, negocio_id, rol)` dice en qué
  negocios trabaja y con qué rol. Se suma un rol de plataforma para dar de alta negocios.
- **Chatwoot:** una **cuenta de Chatwoot por negocio** dentro de la misma instancia (ADR-0005). El webhook resuelve el
  negocio por el `account_id` del evento.
- **Secretos por negocio** en la base, cifrados: tokens de Chatwoot, secreto del webhook y chat de Telegram. La llave
  de cifrado es la única que queda en el entorno.

## Consecuencias

- **Gana:** un solo despliegue y una sola migración para todos los negocios. El aislamiento se prueba con un test
  automático (dos negocios, cero filas cruzadas). El consumo del LLM se puede medir y frenar por negocio (`uso_llm`).
- **Paga:** una migración que toca casi todos los módulos, `schema.prisma`, Redis, colas, MinIO, la configuración, el
  cliente Angular y las herramientas de operación. Como no hay datos, se rehace el esquema en vez de migrar filas.
- **Desde hoy (con este ADR en `propuesta`):** no se implementa nada de multiempresa. Lo nuevo que se construya sigue
  las recomendaciones de `luxeboreal-arquitectura` §5 («Preparado para multiempresa»), que son baratas y no agregan
  `negocio_id`.
- **Al aceptarlo:** el ADR-0006 pasa a `reemplazada por 0025`, se escribe la spec de una fase propia siguiendo
  `odd/tasks/multiempresa.md` y se actualizan `MODELO_DATOS.md` y `SPEC.md`.
- **Condición para activarlo:** el dueño da por pulida la lógica del negocio, o aparece un segundo negocio concreto
  con fecha. Queda registrado como P64 en `docs/PREGUNTAS_ABIERTAS.md`.
