# Verify Report: Fase 00a — Esqueleto y verificación local

- Change: `fase-00a-esqueleto` · Fecha de cierre: 2026-09-23 · Rama: `fase-00a-esqueleto`
- Registro de cierre exigido por `openspec/config.yaml` §`rules.verify.checklist` (`verify-report.md`
  MUST registrar: resultado por escenario, salida de `npm run verify`, commits y PRs, resultado de
  review, desviaciones, ADRs creados, filas de `inventario.md` migradas y aprendizajes para fases
  siguientes).

## Resumen

`npm run verify` termina en verde en 23.69 s (segunda corrida de confirmación: 24.99 s), muy por
debajo del límite de 3 minutos de `SPEC.md` §5, con Postgres 16 y Redis 7 levantados por
Testcontainers. Los 30 escenarios de las tres specs delta de esta fase (`plataforma`, `compartido`,
`api`) están cubiertos por test y pasan, salvo los tres explícitamente diferidos a 00b/04 que la
propia spec delta documenta como fuera de alcance de 00a. No hubo `judgment-day` (00a no es una de
las fases 04, 05, 06, 10; review requerida: RDD por commit de unidad de trabajo). Se acepta
ADR-0009. La fase queda `cerrada` en `docs/fases/README.md`.

## Resultado por escenario

### `specs/plataforma/spec.md`

| Requisito | Escenario | Test | Resultado |
|---|---|---|---|
| PLT1 | La aplicación no arranca con configuración inválida o incompleta | `src/plataforma/config/cargar-configuracion.spec.ts` (varios casos) + `test/integracion/configuracion.spec.ts` → `PLT1 — La aplicación no arranca con configuración inválida o incompleta` | Pasa |
| PLT1 | Una lectura de `process.env` fuera de `plataforma/config` falla la verificación | `test/fronteras/eslint.spec.ts`, bloque `Entorno` (regla ESLint; el escenario es la garantía de herramienta, no un test con este título exacto) | Pasa |
| PLT2 | El código de aplicación lee la hora del `Clock` inyectado | `src/plataforma/reloj/clock-sistema.spec.ts` | Pasa |
| PLT2 | Un test fija el tiempo con `ClockFalso` | `test/fakes/clock-falso.spec.ts` | Pasa |
| PLT2 | Un uso de `Date.now()`/`new Date()` fuera de `plataforma/reloj` falla la verificación | `test/fronteras/eslint.spec.ts`, bloque `Reloj` (regla ESLint) | Pasa |
| PLT3 | Los logs se emiten en JSON estructurado | `src/plataforma/observabilidad/crear-opciones-logger.spec.ts` → `PLT3 — log normal produce una línea JSON con nivel, mensaje y metadatos` | Pasa |
| PLT3 | Un log que incluiría datos personales sale redactado | mismo archivo → `R14 — Redacción en logs` (nombre fijado por la proposal para este segundo escenario de PLT3, que implementa R14 de `openspec/specs/privacidad/spec.md`) | Pasa |
| PLT4 | Postgres y Redis arriba responden 200 | `test/e2e/aplicacion.e2e-spec.ts` → `PLT4 — Postgres y Redis arriba responden 200`; indicadores unitarios en `test/integracion/salud.spec.ts` | Pasa |
| PLT4 | Una dependencia caída responde error nombrándola | `test/e2e/aplicacion.e2e-spec.ts` → `PLT4 — Una dependencia caída responde error nombrándola`; `test/integracion/salud.spec.ts` (casos "down" postgres/redis) | Pasa |
| PLT4 | El cuerpo de health no expone secretos | `test/e2e/aplicacion.e2e-spec.ts` → `PLT4 — El cuerpo de health no expone secretos` | Pasa |
| PLT5 | `SIGTERM` cierra las conexiones a Postgres y Redis | `test/e2e/aplicacion.e2e-spec.ts` → `PLT5 — SIGTERM cierra las conexiones a Postgres y Redis` (verificado con `app.close()`, no con la señal real — nota de portabilidad D14: `SIGTERM` no es portable en Windows) | Pasa |
| PLT5 | Una solicitud en curso termina antes de cerrar el servidor | `test/e2e/aplicacion.e2e-spec.ts` → `PLT5 — Una solicitud en curso termina antes de cerrar el servidor` | Pasa |
| PLT6 | Un import prohibido hace fallar `npm run verify` | `test/fronteras/dependency-cruiser.spec.ts` (10 reglas, una violación cada una) + `test/fronteras/eslint.spec.ts` | Pasa |
| PLT6 | Un import permitido no afecta la verificación de fronteras | mismos archivos, casos "(permitido)" | Pasa |
| PLT7 | `npm run verify` en verde ejecuta las cinco comprobaciones | Corrida real de `npm run verify` (ver "Salida de `npm run verify`" abajo) — verificación manual/de inspección, como indica `tasks.md` T10 (no hay test automatizado del propio script) | Pasa |
| PLT7 | Un fallo en cualquier comprobación hace fallar `npm run verify` | RED del cierre (T10): violación temporal reutilizando el fixture de T7 `consumidor-dev-dependency.ts`; ver "RED del escenario negativo" abajo | Pasa |

### `specs/compartido/spec.md`

Los 11 escenarios de `CMP1`/`CMP2`/`CMP3` pasan, cada uno con un `it()` nombrado exactamente igual
al título del escenario (`src/compartido/dinero/dinero.spec.ts`, `numero/numero.spec.ts`,
`texto/texto.spec.ts`): 5 de `CMP1` (formatear COP, rango, recargo, días igual/distinto), 3 de
`CMP2` (normalizar, enmascarar, enmascarar corto), 3 de `CMP3` (normalizar texto, normalizar lugar,
palabras clave).

### `specs/api/spec.md` (delta)

| Requisito | Escenario | Resultado en 00a |
|---|---|---|
| API2 | Ruta con prefijo y nombre de recurso en español | Diferido — no hay endpoints de negocio bajo `/api/v1` en 00a; se verifica desde que exista un recurso de negocio (00b en adelante) |
| API2 | `operationId` estable entre despliegues | Diferido — depende del pipeline OpenAPI de 00b |
| API2 | `GET /health` es la única ruta pública sin el prefijo de versión | Pasa — `test/e2e/aplicacion.e2e-spec.ts` → `API2 — GET /health es la única ruta pública sin el prefijo de versión` |
| API8 | Webhook interno no aparece en el documento público | Diferido a la Fase 04 (el webhook de Chatwoot no existe todavía) |
| API8 | `GET /health` no aparece en el documento público | Diferido a 00b (no hay pipeline OpenAPI ni `openapi/openapi.json` en 00a; `design.md` sección "API8 en 00a") |

Los tres escenarios diferidos son los que la propia `proposal.md`/`design.md` declaran fuera de
alcance de 00a; no son deuda oculta.

## Salida de `npm run verify`

Corrida real en local (Windows, Docker Desktop activo, Node 24.19.0), sin fixtures ni violaciones:

```
> luxeborealcrm@0.0.1 verify
> npm run prisma:generar && npm run lint && npm run typecheck && npm run fronteras && vitest run --project unit --project integracion

✔ Generated Prisma Client (7.10.0) to .\src\plataforma\prisma\generado in 27ms
✔ no dependency violations found (52 modules, 86 dependencies cruised)

 Test Files  13 passed (13)
      Tests  62 passed (62)
   Duration  11.23s (import 46%, tests 44%, transform 8%, worker 2%)

real    0m23.690s
```

Los `[Nest] ERROR` de `IndicadorPostgres`/`IndicadorRedis` que aparecen en la salida completa
pertenecen a los casos "down" de `test/integracion/salud.spec.ts` (T9): verifican el camino de
error contra un puerto sin servicio y son el resultado **esperado** de esas pruebas, no un fallo.

### RED del escenario negativo (`PLT7`, segundo escenario)

1. Se copió temporalmente el fixture de T7 `test/fronteras/fixtures/src/consumidor-dev-dependency.ts`
   (D11 regla 9, `src-sin-dev-dependencies`: `src/` no puede importar una `devDependency`) a
   `src/verificacion-temporal-fronteras.ts`.
2. `npm run verify` → **exit 1**, se detuvo en el paso `fronteras` (los pasos previos, `prisma:generar`/
   `lint`/`typecheck`, sí corrieron y pasaron; los tests no llegaron a ejecutarse porque el script
   encadena los comandos con `&&`):
   ```
   error src-sin-dev-dependencies: src/verificacion-temporal-fronteras.ts → node_modules/vitest/dist/index.js
   x 1 dependency violations (1 errors, 0 warnings). 53 modules, 87 dependencies cruised.
   ```
3. El archivo temporal se borró de inmediato (`rm src/verificacion-temporal-fronteras.ts`); no quedó
   rastro en el árbol de trabajo (`git status --short` limpio) ni en ningún commit.
4. Reverificación: `npm run verify` → **exit 0** de nuevo, `Test Files 13 passed (13)`,
   `Tests 62 passed (62)`, 24.99 s.

## Commits de T1–T10

| Tarea | Commits (orden cronológico) |
|---|---|
| T1 | `5cb5c07` docs(adr): replace nestjs-zod with native nestjs 12 zod support; `475545e` docs(sdd): mark fase-00a task 1 done (nestjs 12 confirmed) |
| T2 | `a51a0d1` feat(scaffold): inicializar esqueleto NestJS 12 ESM con Vitest |
| T3 | `2aa152d` feat(plataforma/config): validar configuración con Zod al arrancar; `1677fdc` fix(plataforma/config): reforzar clasificacion de errores tras review RDD; `b2bd6d0` docs(plataforma/config): documentar variables de entorno de desarrollo; `c8a6fc6` docs(00a): registrar hash del commit de cierre de T3 |
| T4 | `fcb182b` feat(plataforma/reloj): agregar Clock inyectable y ClockFalso para tests |
| T5 | `d2aa48a` feat(compartido): portar dinero, texto y numero como funciones puras; `85d5e9b` docs(00a): registrar hash del commit de T5 en tasks.md |
| T6 | `2214f0c` feat(plataforma/observabilidad): logger nestjs-pino con redaccion R14; `9910bb3` docs(00a): registrar hash del commit de T6 en tasks.md; `462f935` docs(00a): registrar hallazgo de review sobre redaccion de err.message |
| T7 | `92b9211` test(fronteras): verificar reglas de dependency-cruiser y eslint; `0daed13` docs(00a): registrar hash del commit de T7; `704e895` fix(fronteras): cubrir ruta resuelta de @prisma/* tras review RDD |
| T8 | `8c93a13` feat(plataforma): compose de desarrollo, prisma minimo y cliente redis; `899378b` docs(00a): registrar hash del commit de T8 en tasks.md |
| T9 | `7344138` feat(plataforma/salud): health check de postgres y redis con apagado ordenado; `995988c` docs(00a): registrar hash del commit de T9 en tasks.md; `4048771` fix(plataforma/redis): no lanzar en apagado si el cliente nunca conecto; `8e0250c` test(plataforma/redis): restaurar el spy del logger en finally |
| T10 | Este commit de cierre — ver el hash reportado en el resultado de `sdd-apply` o `git log -1 --oneline` (no puede autoreferenciarse dentro de su propio mensaje) |

No hubo PRs (decisión del usuario: `stacked-to-main` con slices autónomos, sin abrir PR en GitHub
durante 00a — push/PR/merge quedan pendientes de decisión del usuario, `CLAUDE.md` §"Cómo se
trabaja").

## Resultado de las revisiones RDD

00a no requiere `judgment-day` (no es una de las fases 04, 05, 06, 10 — `docs/fases/README.md` regla
6, `tasks.md` cabecera). Review requerida: **RDD** por commit de unidad de trabajo. Durante la fase se
ejecutaron revisiones RDD agrupadas por work unit, todas **aprobadas y reconocidas** (acknowledge);
los hallazgos que produjeron cambios quedaron como commits de corrección independientes, visibles en
el historial:

| Work unit revisado | Hallazgo corregido | Commit de corrección |
|---|---|---|
| T1+T2 | Sin hallazgos que generaran commit de corrección | — |
| T3+T4 | Clasificación `falta`/`formato` de un issue `invalid_type` de Zod | `1677fdc` |
| T5+T6+T7+T3 cierre | Redacción de `err.message` en logs (pendiente señalado, no corregido — requiere decisión del usuario, ver "Desviaciones" abajo); patrón de la regla `prisma-solo-en-infraestructura` para la ruta resuelta en `node_modules` | `704e895`; hallazgo de `err.message` registrado en `462f935` sin cambiar D9 sin discutirlo |
| T8 | Sin hallazgos que generaran commit de corrección | — |
| T9 | `RedisModule` lanzaba en apagado si el cliente nunca llegó a conectar; el spy del logger de un test no se restauraba en `finally` | `4048771`; `8e0250c` |

## Desviaciones respecto a la spec y por qué

- **`nestjs-zod` descartado, no diferido**: la proposal y el `design.md` (D15) preveían instalar
  `nestjs-zod` en 00b. La tarea 1 encontró que `nestjs-zod@5.5.0` (única versión publicada) excluye
  `@nestjs/common@^12` de su rango de `peerDependencies`. En vez de retroceder el monolito a NestJS
  11 por una dependencia que 00a nunca instala, el usuario decidió (2026-09-23) descartar
  `nestjs-zod` por completo: 00b usará el soporte **nativo** de Standard Schema de NestJS 12
  (`StandardSchemaValidationPipe` + conversión nativa de `@nestjs/swagger`). Registrado en las
  enmiendas de `docs/adr/0001-monolito-modular-nestjs.md` y `docs/adr/0008-contrato-api-openapi.md`.
- **D6 (Prisma): sin campo `adapter` en `prisma.config.ts`**: el diseño preveía una función
  `adapter()` async en `prisma.config.ts`. El tipo `PrismaConfig` de Prisma 7.10.0 instalado no
  expone ese campo — solo `datasource: { url, shadowDatabaseUrl }`. `prisma.config.ts` usa
  `datasource.url` en su lugar, que cumple el mismo propósito documentado en D6 (la URL vive fuera
  de `schema.prisma`). `PrismaService` en tiempo de ejecución sigue usando `@prisma/adapter-pg`
  directamente; no se activó la regla de escalamiento de D6 (no hubo que tocar el diseño de datos).
- **D13 (health): `HealthIndicatorService.attempt()` descartado**: Terminus 12.1.0 agrega
  `{ message: error.message }` al resultado de `.attempt()` en caso de fallo, justo lo que D13
  prohíbe. Los dos indicadores usan `check(clave).up()/down()` manuales con `try/catch` propio, como
  pide D13 literalmente.
- **D14/PLT5: `app.close()` en vez de `SIGTERM` real**: en Windows, `SIGTERM` a un proceso hijo lo
  mata sin ejecutar los hooks de apagado; el test de `PLT5` usa `app.close()`, que dispara la misma
  secuencia de `OnApplicationShutdown` que una señal real en producción — documentado como nota de
  portabilidad desde el propio `tasks.md` de T9, no es una desviación silenciosa.
- **Pendiente señalado, no resuelto en 00a**: `message` está en `CLAVES_CONTENIDO_MENSAJE` (tabla D9)
  para redactar contenido de chat, pero esa misma clave aparece en cualquier `err.message`
  serializado — hoy también se redacta el mensaje de diagnóstico de un error. No se cambió la tabla
  D9 aprobada sin discutirlo primero (T6, commit `462f935`). Queda para que el usuario decida antes
  de que una fase futura dependa de logging de errores reales: (a) aceptar la pérdida de
  diagnóstico, (b) usar `serializers.err = pino.stdSerializers.err` y excluir `err.*` de la
  redacción por `message`, o (c) otra alternativa. No bloquea el cierre de 00a (ninguna spec de esta
  fase depende de logging de errores de aplicación real).
- **Reglas de fronteras (D11) ajustadas durante T7/T8** sin cambiar la intención del diseño: la
  regla 6 se corrigió para distinguir imports internos entre submódulos de `plataforma/` de imports
  dentro del mismo submódulo (el patrón original excluía todos los orígenes dentro de `plataforma/`,
  en contradicción con la regla); la regla 9 excluye `*.spec.ts` de su origen (los tests unitarios
  de esta fase viven en `src/`, junto al código); la regla 4 se amplió en T8 para cubrir tanto el
  specifier bare de `@prisma/client` como su ruta resuelta en `node_modules` (ver "Qué aprendimos"
  abajo).

## ADRs creados

- **ADR-0009 — Testcontainers como infraestructura única de pruebas**
  (`docs/adr/0009-testcontainers-infraestructura-de-pruebas.md`), **Estado: aceptada**
  (2026-09-23). El usuario aceptó explícitamente la propuesta de `design.md` durante el cierre de
  esta fase (no queda como `propuesta`). Indexado en `docs/adr/README.md`.
- `docs/adr/0001-monolito-modular-nestjs.md`: **no** se modificó en el cierre — su enmienda a NestJS
  12 y el descarte de `nestjs-zod` ya quedaron registrados en commits previos de T1 (`5cb5c07`).

## Filas de `docs/migracion/inventario.md` migradas

- `lib/dinero.ts`, `lib/texto.ts`, `lib/numero.ts` → marcada **Migrado**, con referencia a
  `src/compartido/dinero/`, `src/compartido/texto/`, `src/compartido/numero/` (T5, commit `d2aa48a`).
- `scripts/chatwoot-*.sh`, `infra/chatwoot/` → columna "Fase" corregida de `00, 04` a `04` (N1 de
  `proposal.md`: 00a no integra canales; la nota se agregó a la columna "Motivo / nota").

Las demás filas de la sección "00" (`config/env.ts`, `lib/logger.ts`, `lib/tiempo.ts`, `health/`)
quedan con su decisión y destino ya registrados desde que se creó el inventario; T10 solo tenía
alcance explícito sobre las dos filas de arriba (proposal, tabla "Qué se migra del prototipo";
instrucción de cierre de esta tarea).

## Qué aprendimos que cambia las fases siguientes

1. **`ioredis` con `lazyConnect: true` no tiene un `connect()` idempotente**: llamar `connect()` sin
   comprobar el estado del cliente (`status`) lanza si ya está conectando o conectado. Todo código
   futuro que use el cliente `REDIS_CLIENTE` (colas BullMQ desde la Fase 05, locks, debounce) MUST
   comprobar `status` antes de llamar `connect()` — patrón ya aplicado en
   `src/plataforma/redis/redis.module.ts` y en `IndicadorRedis` (T9).
2. **Prisma 7 no expone `adapter()` en `PrismaConfig`**: la URL de conexión vive en
   `datasource: { url }` dentro de `prisma.config.ts`; el adaptador (`@prisma/adapter-pg`) se
   construye en tiempo de ejecución dentro del servicio (`PrismaService`), no en el archivo de
   configuración de la CLI. Cualquier fase que agregue modelos (Fase 01) o cambie el datasource debe
   partir de esta forma real, no de la que documentaba el borrador de D6.
3. **`dependency-cruiser` necesita cubrir dos formas del mismo import**: antes de instalar un
   paquete, `to.path` es el specifier bare (`@prisma/client`); una vez instalado, es la ruta
   resuelta bajo `node_modules/@prisma/client/...`, y esa ruta resuelta depende del `baseDir` desde
   el que corre `cruise` (raíz del repo vs. `test/fronteras/fixtures/`, con distinta profundidad
   relativa). Un patrón de regla escrito y probado **antes** de instalar el paquete real (como pasó
   con la regla 4 en T7) debe reverificarse con el paquete ya instalado antes de confiar en que
   sigue atrapando la violación (T8 lo hizo con un import ad-hoc temporal); cualquier regla nueva de
   fronteras sobre un paquete de npm en fases futuras (BullMQ, AI SDK) debe anticipar esto desde el
   diseño de la regla, no descubrirlo después.
4. **Terminus marca sus propios checks `shutting_down` (503) apenas arranca el apagado**, antes de
   que el servidor HTTP deje de aceptar conexiones — una solicitud aceptada justo cuando empieza
   `SIGTERM`/`app.close()` puede recibir legítimamente `200` o `503 shutting_down`; un test de
   apagado ordenado en una fase futura que agregue más indicadores de health debe aceptar ambos
   desenlaces en vez de fijar un código único.
5. **Prisma reconecta perezosamente tras `$disconnect()`**, a diferencia de `ioredis` (que sí expone
   un `status` que refleja el cierre); verificar un apagado ordenado de Prisma en fases futuras
   requiere espiar el método (`vi.spyOn`), no inferir el cierre por una consulta fallida.
