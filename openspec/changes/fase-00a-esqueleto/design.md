# Design: Fase 00a — Esqueleto y verificación local

- Change: `fase-00a-esqueleto` · Fecha: 2026-09-23 · Estado: `spec en revisión`
- Insumos: `proposal.md` (con Q1 y N1 resueltas), `exploration.md`, skill `luxeboreal-arquitectura`,
  ADR-0001 (con enmienda 2026-09-23), ADR-0003, ADR-0007, ADR-0008, `openspec/specs/api/spec.md`,
  `openspec/specs/privacidad/spec.md`.
- Specs delta: se escriben en paralelo en `specs/` (capacidades `plataforma`, `compartido` y delta de
  `api` para la excepción de `GET /health`). Este diseño no fija ids de requisito; los tests toman el
  nombre exacto que definan esas specs.

> **Nota de verificación.** Esta sesión de diseño no tuvo acceso a web ni a documentación en vivo.
> **Verificación del orquestador (2026-09-23):** Node 24 LTS activa (24.21.0); Prisma 7 exige
> `prisma.config.ts`, driver adapter, generador `prisma-client` y ESM (guía oficial de migración a
> Prisma 7); receta SWC + Vitest confirmada; `process.loadEnvFile` no sobrescribe. **La máquina de
> desarrollo tiene Node 20.19.4: instalar Node 24 es prerrequisito de la tarea 1.** Puerto por
> defecto de Postgres cambiado de 5434 a **5435** (5433 y 5434 los usa el prototipo). Sigue sin
> verificar: Prisma 7 con schema sin modelos (lo resuelve la tarea de Prisma, escalando si falla).
>
> Todo dato externo marcado **[sin verificar]** es conocimiento previo (corte: junio 2026) y MUST
> confirmarse en la tarea 1 (compatibilidad) o en la tarea donde se usa, antes de escribir código
> que dependa de él. Los datos marcados **[verificado]** vienen de `exploration.md` (fuente primaria
> consultada por el orquestador el 2026-09-23).

## Technical Approach

El diseño deja un monolito NestJS 12 en ESM que cumple desde el primer commit las reglas que el
prototipo rompía (A1, A2, A3, A10, A11, B8, B11, R14), sin lógica de negocio. Todo lo de 00a vive en
`src/plataforma/` (transversal técnico) y `src/compartido/` (funciones puras); `src/modulos/` no
existe todavía, pero las reglas de fronteras ya lo contemplan y se prueban con fixtures.

Principios que guían cada decisión:

1. **Nada se abre ni se lee al importar** (A1): configuración, conexiones y logger se construyen en
   factories de proveedores de Nest, nunca en el cuerpo de un módulo ES.
2. **Una sola fuente por cosa**: `process.env` solo en `plataforma/config`; hora del sistema solo en
   `plataforma/reloj`; `@prisma/client` y el cliente generado solo en `plataforma/prisma` (y en el
   futuro `modulos/*/infraestructura`).
3. **Reglas verificadas por herramienta, y las herramientas verificadas por tests**: cada regla de
   ESLint y de `dependency-cruiser` tiene un test con un fixture que la viola; así "un import que
   viole una frontera hace fallar `npm run verify`" es observable aunque `modulos/` esté vacío.
4. **Un único mecanismo de infraestructura de pruebas**: Testcontainers, en local y en CI (00b).
   Docker Compose queda solo para desarrollo manual (`npm run start:dev`).

## Módulos tocados y dependencias

Cada submódulo de `plataforma/` expone su API pública en un `index.ts` (barril). Nadie importa rutas
internas de otro submódulo (regla de fronteras 5, abajo).

| Módulo (carpeta) | Exporta (`index.ts`) | Importa de | Paquetes npm |
|---|---|---|---|
| `plataforma/config` | `ConfiguracionModule`, token `CONFIGURACION`, tipo `Configuracion`, `cargarConfiguracion`, `ConfiguracionInvalidaError`, `cargarArchivoEntorno` | — | `zod` |
| `plataforma/reloj` | `RelojModule`, token `CLOCK`, interfaz `Clock` | — | — |
| `plataforma/observabilidad` | `ObservabilidadModule`, `crearOpcionesLogger`, `RUTAS_REDACCION` | `plataforma/config`, `compartido/numero` | `nestjs-pino`, `pino`, `pino-http` |
| `plataforma/prisma` | `PrismaModule`, `PrismaService` | `plataforma/config` | `@prisma/client`, `@prisma/adapter-pg` [verificado, ver D6], cliente generado |
| `plataforma/redis` | `RedisModule`, token `REDIS_CLIENTE`, tipo `ClienteRedis` | `plataforma/config` | `ioredis` |
| `plataforma/salud` | `SaludModule` | `plataforma/config`, `plataforma/prisma`, `plataforma/redis` | `@nestjs/terminus` |
| `compartido/dinero`, `compartido/texto`, `compartido/numero` | funciones puras (ver Contratos) | nada | ninguno |
| `app.module.ts` | `AppModule` | todos los `index.ts` de `plataforma/` | `@nestjs/common` |
| `main.ts` / `configurar-aplicacion.ts` | `configurarAplicacion` | `app.module`, `plataforma/config`, `plataforma/observabilidad` | `@nestjs/core`, `nestjs-pino` |

Dirección permitida: `main → app.module → plataforma/* → compartido/*`. `plataforma/*` MUST NOT
importar `modulos/`. `compartido/` MUST NOT importar nada fuera de sí mismo (ni npm).

## Puertos y adaptadores

| Puerto / token | Interfaz | Adaptador de producción | Fake de test |
|---|---|---|---|
| `CLOCK = Symbol('CLOCK')` | `Clock { ahora(): Date }` | `ClockSistema` (`plataforma/reloj/clock-sistema.ts`, único `new Date()` sin argumentos permitido) | `ClockFalso` (`test/fakes/clock-falso.ts`) con `fijar(fecha)` y `avanzar(ms)` |
| `CONFIGURACION = Symbol('CONFIGURACION')` | `Configuracion` (tipo inferido del esquema Zod, `Readonly`, congelado) | factory que llama `cargarConfiguracion(process.env)` | `overrideProvider(CONFIGURACION).useValue(...)` con valores de Testcontainers |
| `REDIS_CLIENTE = Symbol('REDIS_CLIENTE')` | `ClienteRedis` = `Redis` de `ioredis` (tipo de plataforma, no de dominio) | `new Redis(url, { lazyConnect: true, ... })` en factory | contenedor real (A12: sin mocks de infraestructura) |
| `PrismaService` (clase como token, convención de la skill §1) | subclase de `PrismaClient` generado | `PrismaService` con adaptador `pg` | contenedor real |

`Clock` es el único puerto "de negocio" en 00a. `REDIS_CLIENTE` y `PrismaService` son recursos de
plataforma; los módulos futuros no los usan directamente en `aplicacion/` sino a través de sus
propios puertos (repositorios, colas).

## Architecture Decisions

### D1 — Infraestructura de pruebas: Testcontainers en local y en CI

**Choice**: las pruebas de integración y e2e levantan Postgres 16 y Redis 7 con Testcontainers
(`testcontainers` + `@testcontainers/postgresql` + `@testcontainers/redis`) desde un `globalSetup`
de Vitest. Docker Compose es solo para desarrollo manual.

**Alternatives considered**:
- Servicios de Docker Compose ya levantados (`docker compose up` antes de `npm run verify`):
  arranque más rápido, pero exige un paso manual, comparte datos con el entorno de desarrollo (tests
  no reproducibles) y difiere de CI (00b usa Testcontainers, fila 00b de `docs/fases/README.md`).
- Compose en local + Testcontainers en CI: dos mecanismos que mantener y dos maneras de fallar.

**Rationale**: un solo mecanismo, idéntico en local y CI; cada corrida parte de contenedores limpios;
no toca los Postgres de la máquina (5432 nativo; 5433 Postgres del Chatwoot y 5434 Postgres de
desarrollo del prototipo) porque Testcontainers
usa puertos efímeros. Costo aceptado: ~10-20 s de arranque de contenedores por corrida, dentro del
presupuesto de 3 min de `npm run verify` (`SPEC.md` §5). Requiere Docker Desktop corriendo en local,
igual que Compose.

**Aislamiento por worker de Vitest**: en 00a ningún test escribe datos (solo `SELECT 1` y `PING`), así
que todos los workers comparten un contenedor de cada tipo. El arnés de base aislada por worker
(`CREATE DATABASE test_<VITEST_POOL_ID>` + migraciones) es alcance de la Fase 01 (proposal, Out of
Scope). Para no bloquearlo, el `globalSetup` expone la URL **de administración** del contenedor vía
`project.provide(...)` y un helper `test/soporte/infraestructura.ts` entrega a cada test su URL; en 01
ese helper pasa a crear la base del worker sin cambiar los tests. Redis: en 01+ cada worker usará un
prefijo de claves `test:<poolId>:`; en 00a no hace falta.

Esta decisión cruza fases (01 construye sobre ella), por eso se propone **ADR-0009** (ver sección
"ADR propuesto").

### D2 — Umbral de cobertura en 00a: 0 (se mantiene), con reporte

**Choice**: `coverage_threshold` de `openspec/config.yaml` queda en `0` en 00a. Se instala
`@vitest/coverage-v8` y un script `npm run test:cobertura` que solo reporta. El umbral numérico se
decide en 00b, junto con CI, que es donde se haría cumplir.

**Alternatives considered**: 80 % sobre `src/compartido/**` y `src/plataforma/**` desde ya.

**Rationale**: en 00a casi todo el código es cableado de Nest (módulos, factories) cubierto por e2e;
un porcentaje sobre un repo de ~30 archivos mide ruido. Los dos controles reales de la fase son TDD
estricto observado (RED → GREEN) y la cobertura **por nombre de escenario** (cada escenario de las
specs delta tiene un test con su nombre exacto; `sdd-verify` lo busca). El comentario "revisar en
Fase 00a" del config se reemplaza por "revisado en 00a: 0; se fija en 00b con CI".

### D3 — Versión de Node: 24 LTS

**Choice**: Node **24** (LTS "Krypton"). `.nvmrc` = `24`; `package.json` `engines.node` =
`">=24.0.0"`.

**Alternatives considered**: Node 22 (LTS en mantenimiento); Node 26 (Current, pasa a LTS en
octubre 2026).

**Rationale**: al 2026-09-23 la LTS activa es la 24 (salió a LTS en octubre 2025) y la 26 aún no es
LTS **[verificado 2026-09-23: v24.21.0 "Krypton" es la LTS activa — https://nodejs.org/dist/index.json]**. La 24 trae
`process.loadEnvFile` y `--env-file-if-exists`, usados en D8. La tarea 1 MUST leer
`engines` de `@nestjs/core@12` (`npm view @nestjs/core@12 engines`) y confirmar que 24 cumple; si
NestJS 12 exigiera otra mayor, se ajusta aquí y se registra.

### D4 — Health en `src/plataforma/salud/`, ruta `GET /health`

**Choice**: carpeta `src/plataforma/salud/` (`salud.module.ts`, `salud.controller.ts`,
`indicador-postgres.ts`, `indicador-redis.ts`). La ruta es `GET /health`, sin prefijo de versión
(excepción operativa decidida en Q1; la delta de `api` la nombra en API2 y la marca `internal` en
API8).

**Alternatives considered**: `src/modulos/salud/` (módulo de negocio); nombre en inglés `health/`.

**Rationale**: `modulos/` son contextos de negocio (skill §1); el health es transversal técnico y
depende solo de recursos de plataforma. Nombre de carpeta en español por la skill §8; la ruta
queda en inglés porque es el contrato operativo que consultan Docker, Dokploy y Uptime Kuma. La skill
§1 se actualiza al cierre para listar `salud/`. En 00b, cuando entre `setGlobalPrefix('api/v1')`, se
usa `exclude: ['health']`.

### D5 — Puertos de Compose configurables y sin choque

**Choice**: `docker-compose.yml` con `name: luxeborealcrm`, servicios `postgres` (`postgres:16-alpine`)
y `redis` (`redis:7-alpine`) con `healthcheck` (`pg_isready`, `redis-cli ping`), volúmenes con nombre
propio, y puertos del host por variable con defaults que no chocan:
`"${LUXE_PG_PUERTO_HOST:-5435}:5432"` y `"${LUXE_REDIS_PUERTO_HOST:-6380}:6379"`.

**Alternatives considered**: puertos fijos (5432/6379) — chocan con el Postgres nativo (5432), el
Chatwoot del prototipo (5433) y probablemente su Redis (6379).

**Rationale**: el nombre de proyecto aísla contenedores y volúmenes del prototipo; `docker compose
down -v` solo borra los de este repo. Estas dos variables son de Compose, no de la aplicación: no
entran al esquema Zod; `.env.example` las documenta en una sección aparte y `DATABASE_URL` /
`REDIS_URL` de ejemplo usan 5435 y 6380.

### D6 — Prisma mínimo: `schema.prisma` sin modelos + `prisma.config.ts` + adaptador `pg`

**Choice**: `prisma/schema.prisma` con solo `generator` y `datasource` (sin modelos). Con Prisma 7
**[verificado 2026-09-23 en la guía oficial de migración a Prisma 7; el caso "sin modelos" sigue
sin verificar]** esto implica:
- generador `prisma-client` (el nuevo, ESM/TypeScript) con `output = "../src/plataforma/prisma/generado"`
  (en `.gitignore`; se genera con `npm run prisma:generar`, que corre antes de `typecheck` en
  `verify` y en `postinstall`);
- la URL ya no va en `schema.prisma` sino en `prisma.config.ts` en la raíz;
- `PrismaClient` exige un driver adapter: `@prisma/adapter-pg` (`new PrismaPg({ connectionString })`).

Si la versión instalada todavía acepta `url` en el `datasource` y el generador `prisma-client-js`,
se usa la forma que la documentación de esa versión marque como recomendada, y se registra aquí.

**Alternatives considered**: cliente `pg` crudo solo para health (alternativa de la exploración).

**Rationale**: el usuario ya decidió `schema.prisma` mínimo (proposal, "Decisiones ya tomadas").
El adaptador `pg` es la vía **oficial** de Prisma 7, no un cambio de estrategia: se sigue usando
`PrismaClient` y `$queryRaw`. **Regla de escalamiento**: si el cliente no se genera sin modelos, o
`$queryRaw` no funciona sin modelos, o Prisma exige algo que obligue a tocar el diseño de datos, la
tarea de health se detiene y se consulta al usuario; MUST NOT cambiarse a `pg` crudo en silencio.

Detalles de ESM: el cliente generado se importa con extensión `.js` (resolución `nodenext`); el
directorio `generado/` queda excluido de ESLint, de `dependency-cruiser` como origen y de
cobertura. `prisma.config.ts` es un archivo de herramienta en la raíz: la regla de `process.env` de
ESLint aplica solo a `src/**`, así que puede leer `DATABASE_URL`. Si `prisma generate` exige
`DATABASE_URL` definida aunque no conecte, el script `prisma:generar` usa un valor de relleno no
secreto (`postgresql://generar:generar@localhost:5432/generar`) — se decide al implementar.

### D7 — ESM + Vitest + metadatos de decoradores: `unplugin-swc`

**Choice**: base = lo que genera `nest new` (ESM + Vitest) con NestJS CLI 12 **[verificado: ESM es el
default y usa Vitest, https://docs.nestjs.com/cli/overview]**. Vitest transforma con esbuild, que no
emite `emitDecoratorMetadata`; sin ese metadato la inyección por tipo de clase de Nest falla. Se usa
`unplugin-swc` en `vitest.config.ts` (`swc.vite({ module: { type: 'es6' } })`) y `.swcrc` con
`jsc.transform.legacyDecorator = true` y `decoratorMetadata = true`, como indica la receta
"SWC → Vitest" de https://docs.nestjs.com/recipes/swc **[verificado 2026-09-23: `unplugin-swc` con `module.type: es6` y `.swcrc` con `legacyDecorator` + `decoratorMetadata`; si el
scaffold de NestJS 12 ya trae esta configuración, se conserva tal cual y se registra]**. El build de
producción sigue con `tsc` (`nest build`); SWC solo en tests.

**Alternatives considered**: `@Inject(Clase)` explícito en cada constructor para no depender del
metadato (frágil y fácil de olvidar); volver a CommonJS + Jest (descartado por decisión del usuario).

**Rationale**: es la vía documentada por NestJS para Vitest. Riesgo conocido: con SWC + ESM, un ciclo
de imports entre clases con metadatos puede dar `ReferenceError` de inicialización; la regla
`no-circular` de `dependency-cruiser` lo previene. Relativos en ESM MUST llevar extensión `.js`.

### D8 — Configuración propia con Zod (sin `@nestjs/config`)

**Choice**: `plataforma/config` define `esquemaConfiguracion` (Zod) y una función pura
`cargarConfiguracion(fuente)` que valida, congela y devuelve `Configuracion`, o lanza
`ConfiguracionInvalidaError` con la lista de variables inválidas y el tipo de problema
(`falta`, `formato inválido`, `valor no permitido`), **nunca el valor**. `ConfiguracionModule`
(global) registra el token `CONFIGURACION` con una factory que llama `cargarConfiguracion(process.env)`
— la única lectura de `process.env` del sistema. El archivo `.env` se carga fuera de producción con
`cargarArchivoEntorno()` (usa `process.loadEnvFile('.env')` de Node si el archivo existe, sin pisar
variables ya definidas **[verificado 2026-09-23 en Node: no sobrescribe variables ya definidas; si pisa, se usa
`--env-file-if-exists=.env` en el script `start:dev`]**), llamado desde `main.ts` antes de crear la
app.

**Alternatives considered**: `@nestjs/config` con `validate` Zod — trae `dotenv`, un
`ConfigService.get('X')` sin tipado fuerte por defecto y su propia lectura de `process.env`.

**Rationale**: un token tipado y una función pura fácil de probar (unitario sin Nest); ninguna
validación al importar (A1); sin `MOCK_*` (A2). La validación ocurre al construir el módulo, así que
`NestFactory.create` falla y el proceso termina con código ≠ 0.

### D9 — Logger `nestjs-pino` con redacción por rutas y censura de teléfonos

**Choice**: `plataforma/observabilidad` construye las opciones con una función pura
`crearOpcionesLogger(config)` (probada en unitario) y las registra con
`LoggerModule.forRootAsync({ inject: [CONFIGURACION], useFactory })`. Redacción con `pino` `redact`:
`paths = RUTAS_REDACCION` y `censor` como función: si la última clave de la ruta es de teléfono, se
aplica `enmascarar` de `compartido/numero` (solo últimos 4 dígitos, R14); en cualquier otro caso,
`"[REDACTADO]"`. Además: `serializers.req` registra `method`, ruta **sin query string** e `id`; no se
registran cuerpos; `autoLogging` ignora `GET /health`.

**Alternatives considered**: enmascarar a mano en cada llamada (lo que hacía el prototipo, B11 —
depende de disciplina); serializador que recorra todo el objeto buscando patrones (costoso y con
falsos positivos).

**Rationale**: redacción centralizada y declarativa (R14). Limitación aceptada y documentada: `redact`
actúa por **nombre de clave**, no sobre texto libre; la convención es que un dato personal nunca se
interpola en `msg` y siempre va como campo con nombre. El test `R14 — Redacción en logs` cubre
contenido de mensaje, teléfono, cédula, correo y token.

Lista inicial de `RUTAS_REDACCION` (pino: cada `*` es un nivel; se cubren dos niveles de anidación):

| Tipo | Claves (se aplican como `x`, `*.x` y `*.*.x`) | Censura |
|---|---|---|
| Teléfono | `telefono`, `numero`, `celular`, `phone`, `phoneNumber`, `phone_number` | `enmascarar` (últimos 4) |
| Contenido de mensajes | `contenido`, `mensaje`, `texto`, `content`, `message`, `adjuntos`, `attachments` | `[REDACTADO]` |
| Cédula | `cedula`, `documento`, `numeroDocumento` | `[REDACTADO]` |
| Correo | `correo`, `email` | `[REDACTADO]` |
| Secretos | `token`, `accessToken`, `refreshToken`, `apiKey`, `secret`, `secreto`, `password`, `contrasena`, `authorization` | `[REDACTADO]` |
| HTTP | `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]`, `req.headers.api_access_token` (Chatwoot), `res.headers["set-cookie"]`, `req.body` | `[REDACTADO]` |

Nota: `mensaje` y `message` se redactan como campo de datos; el mensaje del log de pino es `msg`, que
no está en la lista. Cambiar la lista MUST venir con su caso en el test de R14.

### D10 — Reglas de lint (ESLint flat config)

**Choice**: `eslint.config.js` con `typescript-eslint` (`recommendedTypeChecked`) y estas reglas
propias. Como en flat config un bloque posterior **reemplaza** (no fusiona) las opciones de
`no-restricted-syntax`, los selectores se definen como constantes y cada bloque arma su lista
completa:

| Regla | Selector / configuración | Aplica a | Excepción |
|---|---|---|---|
| Reloj | `CallExpression[callee.object.name='Date'][callee.property.name='now']`; `NewExpression[callee.name='Date'][arguments.length=0]`; `CallExpression[callee.name='Date']` (sin `new`, devuelve la hora como texto); `MemberExpression[object.name='Temporal'][property.name='Now']` | `src/**`, `test/**` | `src/plataforma/reloj/**` |
| Entorno | `no-restricted-syntax`: `MemberExpression[object.name='process'][property.name='env']`; `no-restricted-imports`: `env` desde `process` y `node:process` | `src/**` | `src/plataforma/config/**` |
| Consola | `no-console: error` | todo | ninguna |

Ignorados: `dist/`, `coverage/`, `src/plataforma/prisma/generado/`, `test/fronteras/fixtures/`
(los fixtures se lintean solo desde sus tests). `new Date(valor)` con argumento sigue permitido
(riesgo de la proposal).

**Rationale**: skill §3 y regla 6 de `CLAUDE.md`. Cada regla tiene un test (ver Testing Strategy) que
usa la API `ESLint` con `lintText(codigo, { filePath })` para probar violación y excepción.

### D11 — Fronteras con `dependency-cruiser`

**Choice**: `.dependency-cruiser.cjs` (CommonJS porque la herramienta carga su config así en
proyectos ESM **[sin verificar; si acepta `.mjs`, se usa]**) con `tsConfig` del proyecto y estas
reglas, todas `severity: 'error'` salvo indicación:

| # | Nombre | Qué prohíbe (from → to) | Origen |
|---|---|---|---|
| 1 | `sin-ciclos` | cualquier ciclo (`circular: true`) | skill §2; además evita el fallo de SWC+ESM (D7) |
| 2 | `compartido-puro` | `^src/compartido/` → todo lo que no sea `^src/compartido/` (incluye npm y core de Node) | skill §2, §1 |
| 3 | `dominio-aislado` | `^src/modulos/([^/]+)/dominio/` → todo salvo `^src/modulos/$1/dominio/` y `^src/compartido/` | skill §2 |
| 4 | `prisma-solo-en-infraestructura` | origen fuera de `^src/plataforma/prisma/` y `^src/modulos/[^/]+/infraestructura/` → `@prisma/client`, `@prisma/adapter-pg`, `^src/plataforma/prisma/generado/` | skill §2 |
| 5 | `sin-rutas-internas-de-modulo` | `^src/modulos/([^/]+)/` → `^src/modulos/[^/]+/` que no sea `^src/modulos/$1/` ni `^src/modulos/[^/]+/index\.ts$` | skill §2, ADR-0001 |
| 6 | `sin-rutas-internas-de-plataforma` | origen fuera de `^src/plataforma/([^/]+)/` → `^src/plataforma/[^/]+/` que no sea el mismo submódulo ni su `index.ts` | extensión de la regla 5 a `plataforma/` |
| 7 | `plataforma-no-conoce-modulos` | `^src/plataforma/` → `^src/modulos/` | dirección de dependencias |
| 8 | `src-no-importa-test` | `^src/` → `^test/` | fakes solo en tests (skill §3) |
| 9 | `src-sin-dev-dependencies` | `^src/` → dependencias de `devDependencies` (excepto tipos) | producción limpia |
| 10 | `sin-irresolubles` | imports que no resuelven | ESM con `.js` mal escrito |

Los tipos de Prisma que no salen de `infraestructura/` (skill §2) no son verificables por import; se
cubren en review desde la Fase 01.

**Rationale**: la skill §2 pide `dependency-cruiser`; se usa su API (`cruise`) en un test con un árbol
de fixtures (`test/fronteras/fixtures/src/...`) que contiene una violación por regla, para probar las
reglas 3 y 5 aunque `modulos/` aún no exista.

### D12 — Cliente Redis `ioredis`, perezoso y con fallo rápido

**Choice**: `ioredis` con `lazyConnect: true`, `enableOfflineQueue: false`,
`maxRetriesPerRequest: 1` y reconexión con tope; la factory no conecta. El indicador de health hace
`PING` con timeout (`HEALTH_TIMEOUT_MS`).

**Alternatives considered**: `redis` (node-redis) — BullMQ (Fase 05) usa `ioredis`, así que se
tendrían dos clientes.

**Rationale**: una sola librería para todo Redis; nada se conecta al importar (A1); sin cola offline
un `PING` con Redis caído falla en milisegundos en vez de colgar el health.

### D13 — Indicadores de health propios, sin mensajes de error hacia afuera

**Choice**: dos indicadores con `HealthIndicatorService` de Terminus (`check(clave).up()/down()`):
`postgres` ejecuta `SELECT 1` con `$queryRaw` y `redis` ejecuta `PING`, ambos con timeout. En caso de
fallo devuelven `{ status: 'down' }` **sin** el mensaje de la excepción; el error se registra en el
log (con redacción).

**Alternatives considered**: `PrismaHealthIndicator` incluido en Terminus — no está garantizado que
soporte el cliente de Prisma 7 con adaptador, y expone el mensaje de error.

**Rationale**: un mensaje de error de conexión puede incluir host o usuario; `/health` responde a
herramientas externas. Los indicadores propios son ~20 líneas cada uno y se prueban en integración.

### D14 — Arranque en un solo lugar reutilizable y apagado ordenado

**Choice**: `src/configurar-aplicacion.ts` exporta `configurarAplicacion(app)` (logger de pino,
`enableShutdownHooks()`); `main.ts` solo llama `cargarArchivoEntorno()`, `NestFactory.create(AppModule,
{ bufferLogs: true })`, `configurarAplicacion(app)` y `listen(config.PORT)`. `PrismaService` y el
proveedor de Redis implementan `OnApplicationShutdown` (`$disconnect()` y `quit()`). La app arranca
aunque Postgres o Redis estén caídos: `/health` lo reporta con `503`.

**Alternatives considered**: fallar el arranque si una dependencia no responde — convierte una caída
momentánea de Redis en un bucle de reinicios y oculta el estado real al monitoreo.

**Rationale**: el e2e usa `configurarAplicacion` y prueba exactamente el mismo cableado que
producción. El apagado se prueba con `app.close()`, no enviando `SIGTERM`: en Windows `SIGTERM` a un
proceso hijo lo mata sin ejecutar hooks, así que el test no sería portable.

### D15 — Verificación de compatibilidad con NestJS 12 (tarea 1) y fallback

**Procedimiento** (antes de cualquier otro código):

1. `npm view <paquete>@latest version peerDependencies engines --json` para `@nestjs/core`,
   `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/testing`, `@nestjs/terminus`, `nestjs-pino`,
   `nestjs-zod`, `@nestjs/swagger`, `@scalar/nestjs-api-reference`, `@nestjs/bullmq`, `prisma`,
   `@prisma/client`, `@prisma/adapter-pg`, `vitest`, `unplugin-swc`.
2. Instalación real en el scaffold con `npm install` **sin** `--legacy-peer-deps`, `--force` ni
   `overrides`. Los paquetes de 00b (`nestjs-zod`, `@nestjs/swagger`, Scalar) y de 05
   (`@nestjs/bullmq`) se instalan en un directorio de prueba fuera del repo (en el scratchpad de la
   sesión, no en `/tmp` del repo) y **no** quedan en `package.json`.
3. Humo en tiempo de ejecución para los que 00a sí integra (`nestjs-pino`, `@nestjs/terminus`): el
   e2e de health los ejercita.

**Criterio de "falla"**: el rango de `peerDependencies` excluye `^12`, o la instalación da
`ERESOLVE`/error, o el humo falla. Cualquier falla → fallback ya decidido (ADR-0001, enmienda):
`@nestjs/*@^11` (dist-tag `legacy`, 11.2.6 **[verificado]**), `@nestjs/terminus@^11`, y en 11 el CLI
se configura igual en ESM + Vitest (a mano si `nest new` de la 11 genera CommonJS + Jest). El motivo
se registra en la tabla de abajo y en la enmienda de ADR-0001. Un hallazgo solo informativo (p. ej.
nestjs/swagger#3672 con zod v4 y fechas) se anota para la proposal de 00b sin disparar el fallback.

**Registro de compatibilidad** (lo completa la tarea 1; versiones exactas):

| Paquete | Versión | `peerDependencies` de Nest | Instalación | Humo | Resultado |
|---|---|---|---|---|---|
| `@nestjs/core` / `common` / `platform-express` / `testing` | | — | | | |
| `@nestjs/terminus` | | | | | |
| `nestjs-pino` | | | | | |
| `nestjs-zod` (00b) | | | | n/a | |
| `@nestjs/swagger` (00b) | | | | n/a | |
| `@scalar/nestjs-api-reference` (00b) | | | | n/a | |
| `@nestjs/bullmq` (05) | | | | n/a | |
| `prisma` / `@prisma/client` / `@prisma/adapter-pg` | | n/a | | | |
| `vitest` / `unplugin-swc` | | n/a | | | |
| Node (`engines` de `@nestjs/core`) | | n/a | n/a | n/a | |

## Data Flow

### Arranque

```
main.ts
  ├─ cargarArchivoEntorno()            (plataforma/config; solo fuera de producción)
  ├─ NestFactory.create(AppModule)
  │     ├─ ConfiguracionModule → factory → cargarConfiguracion(process.env)
  │     │        └─ inválida → ConfiguracionInvalidaError (nombra variables, no valores) → exit ≠ 0
  │     ├─ RelojModule         → CLOCK = ClockSistema
  │     ├─ ObservabilidadModule → pino con RUTAS_REDACCION
  │     ├─ PrismaModule        → PrismaService (adaptador pg; conecta en la primera consulta)
  │     ├─ RedisModule         → REDIS_CLIENTE (lazyConnect)
  │     └─ SaludModule         → GET /health
  ├─ configurarAplicacion(app)         (useLogger(pino), enableShutdownHooks)
  └─ app.listen(PORT)
```

### `GET /health`

```mermaid
sequenceDiagram
    participant M as Monitor (Docker / Uptime Kuma)
    participant C as SaludController
    participant T as HealthCheckService (Terminus)
    participant P as IndicadorPostgres
    participant R as IndicadorRedis
    participant DB as PostgreSQL 16
    participant RD as Redis 7
    M->>C: GET /health
    C->>T: check([postgres, redis])
    par en paralelo
        T->>P: verificar('postgres')
        P->>DB: SELECT 1 (timeout HEALTH_TIMEOUT_MS)
        DB-->>P: 1 / error / timeout
        P-->>T: up | down (sin mensaje de error)
    and
        T->>R: verificar('redis')
        R->>RD: PING (timeout HEALTH_TIMEOUT_MS)
        RD-->>R: PONG / error / timeout
        R-->>T: up | down (sin mensaje de error)
    end
    alt ambos up
        T-->>C: status ok
        C-->>M: 200 {status:"ok", info, error:{}, details}
    else alguno down
        T-->>C: ServiceUnavailableException
        C-->>M: 503 {status:"error", info, error, details}
    end
```

### Apagado

```
SIGTERM/SIGINT (o app.close() en tests)
  → Nest: OnModuleDestroy → BeforeApplicationShutdown → OnApplicationShutdown
      ├─ PrismaService.$disconnect()   (cierra el pool del adaptador pg)
      └─ RedisModule: cliente.quit()
  → el servidor HTTP deja de aceptar conexiones → exit 0
```

## Endpoints

| Método | Ruta | Request | Response | Códigos | Contrato |
|---|---|---|---|---|---|
| `GET` | `/health` | sin parámetros ni cuerpo | `application/json` de Terminus: `{ status: "ok" \| "error", info: Record<string,{status:"up"}>, error: Record<string,{status:"down"}>, details: Record<string,{status:"up"\|"down"}> }` con claves `postgres` y `redis` | `200` ambos arriba; `503` alguno caído | Sin prefijo `/api/v1` (excepción operativa, Q1); `internal` (API8). En 00a no hay `openapi/openapi.json`: entra al contrato en 00b |

Ejemplo `503`:

```json
{
  "status": "error",
  "info": { "postgres": { "status": "up" } },
  "error": { "redis": { "status": "down" } },
  "details": { "postgres": { "status": "up" }, "redis": { "status": "down" } }
}
```

El formato RFC 9457 (API4) empieza en 00b; si el `503` de `/health` debe o no pasar a
`problem+json` se decide allí (pregunta abierta para 00b, no bloquea 00a). Cualquier otra ruta
devuelve el `404` por defecto de Nest.

**API8 en 00a**: la exclusión de `GET /health` del documento público (escenario "`GET /health` no
aparece en el documento público") **se verifica en 00b**, cuando exista el pipeline OpenAPI y
`openapi/openapi.json`. En 00a solo aplican la ruta sin versión (API2, con su test e2e) y la
intención de etiquetarla `internal`.

## Configuración nueva

Variables de la aplicación (esquema Zod de `plataforma/config`). Nombres en inglés por convención
operativa (Prisma, Docker y Dokploy usan `DATABASE_URL`, `PORT`, `NODE_ENV`).

| Variable | Tipo | Default | Requerida | Notas |
|---|---|---|---|---|
| `NODE_ENV` | enum `development` \| `test` \| `production` | `development` | no | En `production` no se carga `.env` |
| `PORT` | entero 1-65535 | `3000` | no | Puerto HTTP |
| `LOG_LEVEL` | enum `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info` | no | Nivel de pino |
| `DATABASE_URL` | URL con esquema `postgresql://` o `postgres://` | — | **sí** | Secreto (contiene contraseña). Default de `.env.example`: `postgresql://luxe:luxe@localhost:5435/luxeboreal` |
| `REDIS_URL` | URL con esquema `redis://` o `rediss://` | — | **sí** | Default de `.env.example`: `redis://localhost:6380` |
| `HEALTH_TIMEOUT_MS` | entero 100-10000 | `1500` | no | Timeout de cada indicador |

Variables de Docker Compose (no las lee la aplicación; documentadas aparte en `.env.example`):

| Variable | Tipo | Default | Requerida |
|---|---|---|---|
| `LUXE_PG_PUERTO_HOST` | entero | `5435` | no |
| `LUXE_REDIS_PUERTO_HOST` | entero | `6380` | no |
| `LUXE_PG_USUARIO` / `LUXE_PG_CLAVE` / `LUXE_PG_BASE` | texto | `luxe` / `luxe` / `luxeboreal` | no (solo desarrollo local) |

Sin variables `MOCK_*` (A2, ADR-0001).

## Esquema de datos

Sin cambios de modelo: `MODELO_DATOS.md` **no** se toca en 00a. `prisma/schema.prisma` contiene solo
`generator` y `datasource` (decisión del usuario, fila 00a). No hay migraciones. El diseño de datos
v1 es de la Fase 01 (ADR-0003, ADR-0007 aplican desde allí).

## Eventos de dominio

Ninguno. 00a no tiene módulos de negocio.

## File Changes

Árbol de 00a (los nombres finales de los archivos generados por `nest new` pueden variar; los de
`src/` y `test/` son los del diseño):

```
LuxeBorealCRM/
├── .dependency-cruiser.cjs
├── .env.example
├── .gitignore                      (+ dist/, coverage/, .env, src/plataforma/prisma/generado/)
├── .nvmrc                          (24)
├── .swcrc
├── docker-compose.yml
├── eslint.config.js
├── nest-cli.json
├── package.json / package-lock.json
├── prisma.config.ts
├── tsconfig.json / tsconfig.build.json
├── vitest.config.ts                (proyectos: unit, integracion, e2e)
├── prisma/
│   └── schema.prisma               (generator + datasource, sin modelos)
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── configurar-aplicacion.ts
│   ├── compartido/
│   │   ├── dinero/  index.ts · dinero.ts · dinero.spec.ts
│   │   ├── texto/   index.ts · texto.ts · texto.spec.ts
│   │   └── numero/  index.ts · numero.ts · numero.spec.ts
│   └── plataforma/
│       ├── config/          index.ts · esquema.ts · cargar-configuracion.ts (+ .spec.ts) · cargar-archivo-entorno.ts · configuracion.module.ts
│       ├── reloj/           index.ts · clock.ts (interfaz + CLOCK) · clock-sistema.ts (+ .spec.ts) · reloj.module.ts
│       ├── observabilidad/  index.ts · rutas-redaccion.ts · crear-opciones-logger.ts (+ .spec.ts, incluye "R14 — Redacción en logs") · observabilidad.module.ts
│       ├── prisma/          index.ts · prisma.service.ts · prisma.module.ts · generado/ (ignorado en git)
│       ├── redis/           index.ts · redis.module.ts (token REDIS_CLIENTE, factory, cierre)
│       └── salud/           index.ts · salud.module.ts · salud.controller.ts · indicador-postgres.ts · indicador-redis.ts
└── test/
    ├── fakes/
    │   └── clock-falso.ts (+ clock-falso.spec.ts)
    ├── soporte/
    │   ├── contenedores.global-setup.ts   (Testcontainers: Postgres 16 + Redis 7, provide de URLs)
    │   └── infraestructura.ts             (URLs por test; en 01 crea la base por worker)
    ├── fronteras/
    │   ├── dependency-cruiser.spec.ts     (una violación por regla)
    │   ├── eslint.spec.ts                 (reloj, entorno, consola: violación y excepción)
    │   └── fixtures/src/...               (árbol falso con violaciones)
    ├── integracion/
    │   ├── salud.spec.ts                  (indicadores up/down contra contenedores reales)
    │   └── configuracion.spec.ts          (módulo Nest no compila con config inválida)
    └── e2e/
        └── aplicacion.e2e-spec.ts         (arranque con configurarAplicacion, GET /health 200/503, apagado)
```

| Archivo | Acción | Descripción |
|---|---|---|
| todo lo del árbol anterior | Create | Esqueleto 00a |
| `openspec/config.yaml` | Modify | `test_command`/`build_command` confirmados (sin "PLANEADO"); comentario de `coverage_threshold` (D2); `strict_tdd` sin cambios |
| `CLAUDE.md` | Modify | Sección "Comandos" con los scripts reales |
| `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modify | §1 agrega `salud/` y `index.ts` por submódulo; §2 herramienta fijada y reglas; §7 proyectos de Vitest y Testcontainers |
| `docs/adr/0009-testcontainers-infraestructura-de-pruebas.md` + `docs/adr/README.md` | Create / Modify | Solo si el usuario acepta la propuesta (estado `propuesta` mientras tanto) |
| `docs/adr/0001-monolito-modular-nestjs.md` | Modify | Solo si hay fallback a NestJS 11 |
| `docs/fases/README.md`, `docs/migracion/inventario.md` | Modify | Al archivar (estado de 00a, filas migradas, fila de Chatwoot → 04 por N1) |

Scripts de `package.json`:

| Script | Comando (orientativo) |
|---|---|
| `start:dev` | `nest start --watch` |
| `build` | `nest build` |
| `prisma:generar` | `prisma generate` (también en `postinstall`) |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `fronteras` | `depcruise src --config .dependency-cruiser.cjs` |
| `test` | `vitest run --project unit` |
| `test:integracion` | `vitest run --project integracion` |
| `test:e2e` | `vitest run --project e2e` |
| `test:cobertura` | `vitest run --project unit --project integracion --coverage` |
| `verify` | `prisma:generar` → `lint` → `typecheck` → `fronteras` → `vitest run --project unit --project integracion` |

## Interfaces / Contracts

```ts
// src/plataforma/reloj/clock.ts
export interface Clock {
  ahora(): Date;
}
export const CLOCK = Symbol('CLOCK');

// src/plataforma/config/index.ts (superficie pública)
export const CONFIGURACION = Symbol('CONFIGURACION');
export type Configuracion = Readonly<z.infer<typeof esquemaConfiguracion>>;
export function cargarConfiguracion(
  fuente: Readonly<Record<string, string | undefined>>,
): Configuracion; // lanza ConfiguracionInvalidaError
export class ConfiguracionInvalidaError extends Error {
  readonly variables: readonly { nombre: string; problema: 'falta' | 'formato' | 'valor' }[];
}

// src/plataforma/redis/index.ts
export const REDIS_CLIENTE = Symbol('REDIS_CLIENTE');
export type ClienteRedis = Redis; // de ioredis

// src/plataforma/observabilidad/index.ts
export const RUTAS_REDACCION: readonly string[];
export function crearOpcionesLogger(config: Configuracion): Params; // Params de nestjs-pino

// src/compartido (firmas portadas del prototipo, sin cambios de comportamiento)
export function formatearCop(valorCop: number): string;
export function formatearRangoCop(minCop: number, maxCop: number): string;
export function formatearRecargoContraentrega(pct: number): string;
export function formatearDias(diasMin: number, diasMax: number): string;
export function normalizarTexto(texto: string): string;
export function normalizarLugar(texto: string): string;
export function palabrasClave(texto: string, minimo?: number): string[];
export function normalizarNumero(numero: string): string;
export function enmascarar(numero: string): string; // solo últimos 4 dígitos visibles (R14)
```

## Testing Strategy

| Nivel | Qué | Cómo |
|---|---|---|
| Unitario (`src/**/*.spec.ts`, proyecto `unit`) | `compartido/*` (casos reescritos del prototipo + nuevos de `numero`); `cargarConfiguracion` (válida, falta, formato, el error no contiene el valor); `ClockSistema`; `crearOpcionesLogger` con `R14 — Redacción en logs` (logger pino sobre un stream en memoria; teléfono → últimos 4, contenido, cédula, correo y token → `[REDACTADO]`); `ClockFalso` | Sin infraestructura, sin Nest salvo `Test.createTestingModule` puntual |
| Fronteras (`test/fronteras/`, proyecto `unit`) | Cada regla de `dependency-cruiser` (D11) y de ESLint (D10): un caso que la viola y, donde hay excepción, un caso permitido | API `cruise` sobre fixtures; API `ESLint.lintText` con `filePath` |
| Integración (`test/integracion/`, proyecto `integracion`) | Indicadores `postgres`/`redis` up contra contenedores y down contra un puerto sin servicio (respuesta rápida, sin mensaje de error); módulo raíz que no compila con configuración inválida (`vi.stubEnv`) | Testcontainers vía `globalSetup` (D1) |
| E2E (`test/e2e/`, proyecto `e2e`) | Arranque real con `configurarAplicacion`; `GET /health` → `200` con ambos arriba y `503` con Redis apuntando a un puerto cerrado; `app.close()` cierra Prisma y Redis (`status === 'end'`); importar `app.module.js` sin variables no lanza (A1); test `API2 — \`GET /health\` es la única ruta pública sin el prefijo de versión` (responde en `/health` y no en `/api/v1/health`) | Supertest + Testcontainers; `overrideProvider(CONFIGURACION)` |

TDD: la tarea que instala el runner es la última sin RED observado; desde ahí toda tarea MUST mostrar
RED antes de GREEN (proposal, Approach). Los nombres de test siguen `<id> — <título del escenario>` de
las specs delta.

## Threat Matrix

N/A — 00a no introduce enrutamiento de mensajes, ejecución de comandos de shell ni subprocesos en
código de producción, automatización de VCS/PR, clasificación de archivos ejecutables ni integración
entre procesos. Testcontainers y Docker Compose son herramientas de desarrollo y prueba que no forman
parte del artefacto de producción. Los riesgos de exposición de datos (logs, `/health`) se tratan en
D9 y D13.

## Migration / Rollout

No migration required: no hay datos ni despliegue (P7). Entrega en PRs apilados `stacked-to-main` de
~400 líneas de autoría; `package-lock.json` y `src/plataforma/prisma/generado/` no cuentan (el
segundo ni siquiera se commitea).

## ADRs referenciados

- ADR-0001 (monolito modular, fronteras verificadas, prohibiciones de `process.env`/`MOCK_*`, enmienda
  NestJS 12 con fallback) — D8, D10, D11, D15.
- ADR-0003 (Postgres fuente de verdad; Redis para lo efímero) — justifica que Redis sea solo cliente
  de plataforma en 00a (D12).
- ADR-0007 (UUID v7) — sin efecto en 00a (no hay modelos); aplica desde la Fase 01.
- ADR-0008 (contrato OpenAPI) — `/health` entra al contrato en 00b; excepción de prefijo (D4).

## ADR propuesto

**ADR-0009 — Testcontainers como infraestructura única de pruebas** (estado `propuesta`; no se
escribe en `docs/adr/` hasta que el usuario lo acepte o hasta que `sdd-tasks` lo incluya como parte
de la documentación de cierre). Borrador:

```markdown
# 0009. Testcontainers como infraestructura única de pruebas

- Estado: propuesta
- Fecha: 2026-09-23

## Contexto
Las pruebas de integración y e2e necesitan Postgres 16 y Redis 7 reales (A12: sin mocks de
infraestructura). CI (Fase 00b) usa Testcontainers. En la máquina de desarrollo ya hay un Postgres
nativo en 5432 y el Postgres del Chatwoot del prototipo en 5433.

## Alternativas
1. Servicios de Docker Compose levantados a mano antes de probar: rápido, pero paso manual, datos
   compartidos con desarrollo y distinto de CI.
2. Compose en local y Testcontainers en CI: dos mecanismos que mantener.
3. Testcontainers en local y en CI (elegida): contenedores limpios por corrida, puertos efímeros,
   ~10-20 s de arranque.

## Decisión
Las pruebas de integración y e2e levantan sus contenedores con Testcontainers desde un globalSetup
de Vitest. Docker Compose queda solo para desarrollo manual. El aislamiento por worker (base por
worker, prefijo de claves de Redis) se construye sobre ese mismo arnés en la Fase 01.

## Consecuencias
- `npm run verify` y CI usan el mismo mecanismo; Docker MUST estar corriendo para probar.
- No hay choque de puertos con otros servicios de la máquina.
- Prohibido: pruebas que dependan de servicios levantados a mano o de datos del entorno de desarrollo.
```

## Riesgos técnicos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Alguna dependencia no declara soporte de NestJS 12 | Media | Fallback a 11 | D15 antes de escribir código; criterio de falla explícito |
| Prisma 7 cambia la configuración (config file, adaptador obligatorio, generador ESM) o no genera sin modelos | Media | Tarea de health bloqueada | D6; escalar al usuario, nunca cambiar a `pg` crudo en silencio |
| `prisma generate` exige `DATABASE_URL` definida | Media | `verify` falla sin `.env` | Valor de relleno no secreto en el script (D6) |
| SWC + ESM + decoradores: metadatos faltantes o `ReferenceError` por ciclos | Media | Tests de Nest fallan | `unplugin-swc` (D7); regla `sin-ciclos` (D11) |
| Node 24 no instalado en la máquina de desarrollo (hoy 20.19.4) | Alta | La tarea 1 no puede empezar | Prerrequisito: instalar Node 24 LTS antes de `sdd-apply`; receta SWC/Vitest ya verificada |
| Testcontainers en Windows (Docker Desktop apagado, Ryuk, tiempos de arranque) | Media | `verify` lento o falla | Mensaje claro si Docker no responde; timeout del `globalSetup` ≥ 60 s; medir contra el límite de 3 min |
| Redacción por clave no cubre PII interpolada en `msg` | Media | Fuga en logs (R14) | Convención de campos con nombre; review; ampliar `RUTAS_REDACCION` con su test |
| Wildcards de pino solo cubren dos niveles de anidación | Baja | Campo profundo sin redactar | Logs con objetos planos; caso de prueba anidado |
| `no-restricted-syntax` se sobrescribe entre bloques del flat config | Alta si se ignora | Una regla desaparece sin aviso | Listas de selectores como constantes; tests de lint por regla (D10) |
| `SIGTERM` no portable en Windows | Alta | Test de apagado inestable | Probar con `app.close()` (D14) |
| Tags de imagen divergentes entre Compose y Testcontainers | Baja | Probar contra otra versión | Mismos tags (`postgres:16-alpine`, `redis:7-alpine`) en ambos; se revisa en review |
| `process.loadEnvFile` sobrescribe variables ya definidas | Baja | Config de tests pisada | Solo fuera de producción y de tests; alternativa `--env-file-if-exists` (D8) |
| La fase supera 10 tareas | Media | Partir la fase | Alcance cerrado; si pasa, mover a 00b |

## Open Questions

- [ ] (00b, no bloquea) ¿El `503` de `/health` pasa a `application/problem+json` cuando entre API4?
- [ ] (diferido a 00b) Verificar el escenario de API8 "`GET /health` no aparece en el documento
      público" cuando exista el pipeline OpenAPI; en 00a no hay documento que comprobar.
- [ ] (usuario, no bloquea) Aceptar o no ADR-0009 (Testcontainers como infraestructura única de
      pruebas). Mientras no se acepte, D1 se aplica como decisión de diseño de esta fase.
- [ ] (tarea 1, no bloquea el diseño) Confirmar Node 24 LTS, Prisma 7 y la receta SWC/Vitest; si
      alguna difiere, se ajusta D3/D6/D7 y se registra aquí.
