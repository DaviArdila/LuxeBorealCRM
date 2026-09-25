# Proposal: Fase 01 — Persistencia

- Change: `fase-01-persistencia` · Fase de la hoja de ruta: **01** (`docs/fases/README.md`)
- Rama: `fase-01-persistencia` · Fecha: 2026-09-25 · Estado: `spec en revisión`
- Depende de: **Fase 00a y Fase 00b, cerradas** (`openspec/changes/archive/2026-09-23-fase-00a-esqueleto/`,
  `openspec/changes/archive/2026-09-25-fase-00b-ci-contrato-api/`)
- Insumo principal: exploración en Engram `sdd/fase-01-persistencia/explore`; `MODELO_DATOS.md`
  borrador v1; `verify-report.md` de 00b §"Qué aprendimos"

## Intent

Hoy el proyecto tiene una base de datos que responde `SELECT 1` y nada más. `prisma/schema.prisma`
es el esquema mínimo de 00a (D6): `generator` y `datasource`, **sin modelos**. `PrismaService` ya
existe (00a, T8), pero no tiene tablas que servir. Ninguna fase de negocio (02 cobertura, 04 canal,
05 traspaso, 06 agente) puede empezar sin tablas donde escribir.

Además, el arnés de pruebas comparte **un solo** Postgres entre todos los workers. Eso funciona en
00a porque ningún test escribe datos; deja de funcionar en cuanto un test de repositorio inserta
filas. ADR-0009 ya lo decidió y fijó el momento: *"El aislamiento por worker (base por worker, prefijo
de claves de Redis) se construye sobre ese mismo arnés en la Fase 01."*

Esta fase convierte `MODELO_DATOS.md` v1 en esquema real, sin repetir los errores de datos del
prototipo: teléfono como llave primaria (P1, A9), estado de conversación por cliente y no por sesión
(ADR-0003, A6), unicidad rota por `NULL` en `tarifa_envio` (demostrada por
`../ChatLuxeCRM/tests/db/repositorios.test.ts:20-24`) y cliente Prisma creado al importar (A1).

Éxito = la verificación de salida de la fila 01 de `docs/fases/README.md`: **migración aplicada desde
cero; test de repositorio contra Postgres real; semilla DANE idempotente.**

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Llaves primarias | UUID v7 nativo (`@db.Uuid`, `@default(uuid(7))`); si la versión de Prisma fijada no lo soporta, se genera en la aplicación. Excepciones con llave natural: `departamento.id`, `ciudad.id` (DANE), `parametro.clave`. Consecutivo aparte: `venta.numero` | ADR-0007 |
| Teléfono | Nunca PK. `contacto.id` propia; `telefono` único y opcional; `chatwoot_contact_id` único | P1, ADR-0005, `MODELO_DATOS.md` §5 |
| Estado de conversación | Tabla `conversacion` por sesión con `estado`, `expira_control_en` y `version` (bloqueo optimista); Postgres es la única fuente de verdad | ADR-0003 |
| Envíos | `zona_sin_cobertura` + `tarifa_estimada` reemplazan a `tarifa_envio` | P4, `MODELO_DATOS.md` §4 |
| Datos del prototipo | Ninguno se migra; solo la estructura | P7 |
| Historial de mensajes | No se guarda; `evento_entrante.payload` va redactado | P3, P15, R14 |
| Infraestructura de pruebas | Testcontainers en local y CI; base por worker y prefijo de Redis se construyen **en esta fase** | ADR-0009 |
| Topología de Postgres en producción | Mismo servidor que Chatwoot, base y rol propios. Se **cita por referencia** el ADR-0001 del prototipo como antecedente (convención de `docs/adr/README.md`); no se copia ni se redecide. En desarrollo, `docker-compose.yml` ya levanta un Postgres propio (puerto 5435) | ADR-0001 del prototipo (antecedente); `docker-compose.yml` |
| Review | **RDD** por commit de unidad de trabajo; **sin** `judgment-day` (01 no es 04/05/06/10) | regla 6 de `docs/fases/README.md` |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas de autoría | preflight (`CLAUDE.md`) |

## Scope

### In Scope

1. **Esquema v1 en `prisma/schema.prisma`** según `MODELO_DATOS.md` §1-§8: modelos, enums nativos,
   `@@map`/`@map` a snake_case, dinero en `Int`, porcentajes en `Decimal(5,2)`, `creado`/`actualizado`
   donde la tabla se edita. Alcance de tablas: ver Q1.
2. **Restricciones que Prisma no expresa solo**, escritas a mano en la migración y probadas:
   - `zona_sin_cobertura`: único `(departamento_id, ciudad_id)` con `NULLS NOT DISTINCT` (el bug de
     `tarifa_envio` del prototipo MUST NOT repetirse).
   - `tarifa_estimada`: la unicidad equivalente sobre columnas opcionales, si el diseño la exige
     (lo decide `sdd-design`; hoy `MODELO_DATOS.md` §4 no la fija).
   - `movimiento_inventario`: `CHECK` que exige `usuario_id` cuando `origen = usuario` (si la tabla
     entra, Q1).
   - `evento_entrante`: único `(origen, id_externo)` (ADR-0004).
3. **Migración inicial** (`prisma/migrations/`) que se aplica limpia **sobre una base vacía**, y
   comprobación automatizada de que el esquema resultante coincide con `schema.prisma` (sin deriva).
4. **`PrismaService`**: ya existe desde 00a y cumple A1 (no conecta al importarse). En esta fase se
   **extiende**, no se reescribe: expone los modelos nuevos y MUST seguir cumpliendo PLT5 (cierre
   ordenado). Si hace falta un helper de transacción para ADR-0003/0004, `sdd-design` lo decide.
5. **Semilla DANE idempotente**: carga `departamento` y `ciudad` desde el listado oficial DIVIPOLA
   con *upsert* por código DANE. Correrla dos veces MUST dejar la base igual. La semilla MUST NOT
   cargar ningún dato de negocio (P7). Fuente y formato del archivo: ver Q2.
6. **Arnés de pruebas con base aislada** (ADR-0009): cada worker de Vitest obtiene su propia base
   (`CREATE DATABASE test_<poolId>` + migraciones) y su propio prefijo de claves de Redis, sobre el
   mismo `globalSetup` de 00a. `test/soporte/infraestructura.ts` MUST conservar su firma para que
   los tests existentes no cambien (así lo promete su TSDoc).
7. **Un test de repositorio contra Postgres real** que demuestre el arnés. Recomendado: un
   repositorio de **lectura de geografía** (`departamento`/`ciudad`), porque es lo único con datos
   reales en esta fase. Dónde vive el repositorio lo decide `sdd-design`, sin crear lógica de
   cobertura (eso es Fase 02).
8. **Tests de invariantes del esquema** (no de lógica): PK `uuid` en las tablas que no son
   excepción, teléfono no es PK, `conversacion.version` existe con default, unicidad con
   `NULLS NOT DISTINCT` rechaza el duplicado de "todo el departamento".
9. **Cierre**: `MODELO_DATOS.md` pasa de "borrador v1 · propuesta" a **v1 aprobada** (fila de
   `docs/migracion/inventario.md`: "se aprueba al escribir la Fase 01"); `CLAUDE.md` §Comandos con los
   scripts nuevos (migrar, sembrar); `.env.example` con lo que haga falta (L4 de 00b: `.env.example`
   no está bloqueado).

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Máquina de estados de `conversacion` (transiciones, rechazo de inválidas, `UPDATE … WHERE version = ?`) | 05 | ADR-0003; Fase 01 solo crea la **tabla** con `version` |
| Búsqueda de cobertura y tarifa (exclusión → ciudad → departamento → nacional), peso facturable | 02 | P4, `MODELO_DATOS.md` §4; Fase 01 solo crea las **tablas** |
| Sincronización de contactos con Chatwoot (`chatwoot_contact_id`), webhook, inbox en uso | 04 | ADR-0004, ADR-0005; Fase 01 solo crea las **tablas** |
| Escritura de `outbox` y su despachador | 04-05 | ADR-0004 |
| Registro de `uso_llm` y techo de gasto | 06-07 | P9, P17 |
| Lógica de inventario, ventas, envíos y usuarios | 11+ | fila de `inventario.md`: "Construir … Fase 11+" |
| Carga de parámetros (`parametro`), catálogo o tarifas iniciales | 02-03 y siguientes | P7: sin datos de negocio en la semilla; R15: los parámetros son datos que se cargan, no constantes |
| Crear base y rol de producción en el servidor de Chatwoot | 09 | Despliegue (fila 09); en esta fase no se despliega |
| Purga de `evento_entrante` a los 30 días | 04 o 09 | Es comportamiento, no esquema |
| Repositorios de negocio por módulo | Cada fase que construye su módulo | La regla "solo la capa de datos toca Prisma" (PLT6) ya está verificada desde 00a |

Regla para `sdd-tasks`: ninguna tarea de esta fase MUST implementar comportamiento de las fases 02,
04, 05 u 11+. Las tablas nacen vacías (salvo geografía) y sin código que las use.

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `src/db/prisma.ts` (`export const prisma = new PrismaClient()` al importar) | **Rediseñar** | `PrismaService` inyectado (ya existe desde 00a) | **A1** (efectos al importar y singletons globales); la regla "solo la capa de datos toca Prisma" se conserva, por módulo (PLT6) |
| `src/db/repositorios/*`, `db/tipos.ts` | **Rediseñar** → cada fase los reescribe en `infraestructura/` de su módulo; aquí solo el de geografía | repositorios por módulo | **A1**; `inventario.md` fila de `db/prisma.ts` |
| Tabla `estado_conversacion` (1:1 con contacto, PK = teléfono) | **Rediseñar** | tabla `conversacion` por sesión con `version` (solo la tabla) | **ADR-0003**, **A6**; lógica en Fase 05 |
| Tabla `tarifa_envio` (texto libre, `ciudad = ""` como parche) | **Rediseñar** | `zona_sin_cobertura` + `tarifa_estimada` con FK DANE (solo tablas) | P4; bug de `NULL` probado en `tests/db/repositorios.test.ts:20-24`; lógica en Fase 02 |
| `Contacto.numero` como `@id` y FK en `Lead`, `EstadoConversacion`, `Venta` | **Rediseñar** | `contacto.id` UUID v7 + `telefono` único opcional + `chatwoot_contact_id` | P1, **A9**, **ADR-0007**; sincronización en Fase 04 |
| Todos los `@id @default(cuid())` en `text` | **Rediseñar** | `uuid` v7 nativo | **ADR-0007** |
| `Departamento`/`Ciudad` con código DANE como PK | **Conservar** | igual en `MODELO_DATOS.md` §4 | Diseño del usuario, estable y oficial; ADR-0007 lo exceptúa |
| `prisma/seedGeografia.ts` (upsert por código DANE) | **Rediseñar** (se porta el patrón, no el código) | semilla DANE del repo | Es lógica simple y probada, pero hoy usa el cliente global (**A1**) |
| Dinero en `Int` con sufijo `Cop`, precio congelado en `venta_item`, ledger de inventario | **Conservar** | `MODELO_DATOS.md` §1, §6 | Diseño del usuario; soporta R2 (el LLM nunca calcula dinero) |
| `tests/helpers/prismaTestClient.ts` (un solo Postgres, `TRUNCATE … CASCADE` antes de cada test, `fileParallelism: false`) | **Rediseñar** | base por worker con Testcontainers | **A12** (pirámide invertida, tests en serie), **ADR-0009** |
| Todos los datos (catálogo de prueba, contactos, leads, parámetros, tarifas) | **Descartar** | — | P7 (arranque limpio) |
| `data/sqlite/`, `db.sql` | **Descartar** | — | **A14** (restos de la era SQLite) |
| Historial de mensajes | **Delegar** | Chatwoot | P3, ADR-0005 |
| Lógica de cobertura, estado, contactos, inventario/ventas | **Posponer** | Fases 02, 05, 04, 11+ | Ver Out of Scope |

### Tests del prototipo que esta fase reemplaza

- `tests/db/repositorios.test.ts`: solo la parte de **esquema y unicidad** (colisión de dos tarifas
  por defecto del mismo departamento). La parte que prueba lógica de tarifas y estado pasa a las
  fases 02 y 05.
- `tests/helpers/prismaTestClient.ts`: reemplazado por el arnés de base por worker.

## Capabilities

### New Capabilities

- `persistencia`: contrato observable del modelo de datos y su ciclo de vida — la migración se aplica
  desde cero sin deriva, las llaves siguen ADR-0007, el teléfono no es identidad, las reglas de
  unicidad con columnas opcionales se cumplen, la semilla DANE es idempotente y no carga datos de
  negocio, y cada worker de pruebas tiene su base aislada. Ids sugeridos: `PER1…PERn`.

  **Por qué un dominio nuevo y no un delta de `plataforma`**: `plataforma` describe comportamiento
  técnico *transversal y sin negocio* (config, reloj, logs, salud, apagado, verificación). Las reglas
  de esta fase son del **modelo de datos del usuario** (`CLAUDE.md`: "el esquema es lógica de negocio
  del usuario") y las fases 02, 04, 05 y 11+ las van a leer y ampliar. Meterlas en `plataforma` lo
  convertiría en el cajón de todo lo que no es un módulo, y mezclaría reglas que cambian con cada
  fase de negocio con reglas que casi no cambian. Hoy `plataforma/spec.md` no menciona Prisma ni
  migraciones, así que no hay nada que partir.

### Modified Capabilities

- `plataforma`: **ninguna modificación esperada.** PLT5 (cierre ordenado, sin conexión al importar)
  y PLT6 (Prisma solo en `plataforma/prisma` e `infraestructura/`) ya cubren `PrismaService` y se
  **implementan** aquí sin que su texto cambie. PLT7 no cambia si la comprobación de migración queda
  dentro de los tests de integración. Si `sdd-design` decide agregar a `npm run verify` una
  comprobación **nueva** (por ejemplo, deriva de migraciones como paso propio), PLT7 pasa a siete
  comprobaciones y `sdd-spec` MUST escribir ese delta; si no, MUST decir explícitamente que no hay
  delta.
- `privacidad`: sin delta. R14 se refleja en el esquema (no hay columna de contenido de mensaje;
  `documento` y `correo` marcados "nunca en logs") sin cambiar el requisito.

## Approach

1. **Primero verificar la herramienta, después modelar.** Como la T1 de 00a hizo con NestJS 12, la
   primera tarea confirma con la versión de Prisma instalada (Prisma 7, adaptador `pg`) que
   `@default(uuid(7))` y los enums nativos funcionan, y cómo se incorporan a la migración las
   restricciones que el esquema no expresa (`NULLS NOT DISTINCT`, `CHECK`). Si `uuid(7)` no existe,
   se aplica la alternativa ya decidida en ADR-0007 (generación en la aplicación), sin ADR nuevo.
2. **`MODELO_DATOS.md` antes que `schema.prisma`** (`openspec/config.yaml` §design). Cualquier
   ajuste que aparezca al escribir el esquema se hace primero en el documento y se le presenta al
   usuario; no se cambia el esquema sin su decisión (`CLAUDE.md`).
3. **Una sola migración inicial**, generada por Prisma y completada a mano solo en las restricciones
   del punto 2 del Scope. Esas líneas escritas a mano son las que llevan test propio.
4. **El arnés antes que el test de repositorio.** Orden: base por worker + migraciones aplicadas por
   worker → prefijo de Redis → test de repositorio de geografía → semilla. Así el primer test que
   escribe datos ya corre aislado. Por L3 de 00b (contención de Docker en paralelo), `sdd-design`
   MUST revisar el `timeout` global de Vitest y cuántas bases se migran por corrida **antes** de que
   aparezca el problema.
5. **La semilla es un comando, no un efecto.** Se ejecuta explícitamente (script de `package.json`),
   nunca al arrancar la aplicación ni al importar (A1), y su idempotencia se prueba corriéndola dos
   veces en el mismo test.
6. **Evidencia real** (L2 de 00b): cada tarea deja en `tasks.md` la salida real de la migración y de
   la semilla, además del test. Y (L1 de 00b) el título exacto del escenario es parte del "Hecho
   cuando" de cada tarea, no un detalle de estilo.

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) verificación de Prisma +
esquema v1 + migración, (b) arnés de base por worker + prefijo de Redis, (c) semilla DANE + test de
repositorio, (d) cierre documental. `package-lock.json` y el cliente generado no cuentan como autoría;
el archivo de datos DIVIPOLA tampoco (es un insumo, no código). La `migration.sql` generada por Prisma
no cuenta, **salvo** las líneas escritas a mano, que sí se revisan.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `MODELO_DATOS.md` | Modified | Pasa a v1 aprobada; ajustes que surjan se hacen aquí primero |
| `prisma/schema.prisma` | Modified | De esquema mínimo a esquema v1 completo |
| `prisma/migrations/` | New | Migración inicial (+ `migration_lock.toml`) |
| `prisma.config.ts` | Modified (probable) | Ruta de migraciones y de la semilla |
| Archivo DIVIPOLA + script de semilla (ubicación en design) | New | Semilla idempotente de `departamento`/`ciudad` (Q2) |
| `src/plataforma/prisma/` | Modified | `PrismaService` expone los modelos; helper de transacción si design lo decide |
| Repositorio de geografía (ubicación en design) | New | Primer repositorio real, solo lectura |
| `test/soporte/contenedores.global-setup.ts`, `test/soporte/infraestructura.ts` | Modified | Base por worker, migraciones por worker, prefijo de Redis; misma firma pública |
| `test/integracion/` | New | Tests de migración, invariantes del esquema, semilla y repositorio |
| `vitest.config.ts` | Modified (probable) | `timeout` y paralelismo (L3 de 00b) |
| `package.json` | Modified | Scripts de migrar y sembrar |
| `.env.example`, `src/plataforma/config/` | Modified (si aplica) | Variables nuevas, leídas solo en `plataforma/config` (PLT1) |
| `openspec/specs/persistencia/` | New (al archivar) | Dominio nuevo |
| `CLAUDE.md` §Comandos, `docs/fases/README.md`, `docs/migracion/inventario.md` | Modified | Comandos nuevos; al archivar, estado de 01 y filas migradas |
| `docs/adr/` | New (solo si aparece una decisión con alternativas reales) | Ninguno previsto |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Presupuesto de ~400 líneas**: el esquema v1 completo tiene ~20 tablas y 11 enums; solo `schema.prisma` puede acercarse al presupuesto | **Alta** | Slices del Approach; si una slice lo supera por naturaleza (el esquema no se parte bien), se explica y se sigue, sin borrar comentarios ni tests. Q1 reduce el volumen si se eligen menos tablas |
| **Más de 10 tareas** | Media | El corte de 4 slices cabe en ~8 tareas. Si `sdd-tasks` pasa de 10, se propone al usuario partir en 01a (esquema + migración) y 01b (arnés + semilla); no se amplía el límite |
| **Prisma no expresa `NULLS NOT DISTINCT` ni `CHECK`**: una migración futura generada por Prisma podría no verlas o intentar quitarlas | Media | Líneas a mano en la migración con test que falla si desaparecen; `sdd-design` documenta cómo se mantienen en migraciones futuras |
| **`uuid(7)` no soportado** en la versión de Prisma fijada | Baja-Media | Primera tarea lo verifica; plan B ya decidido en ADR-0007 |
| **Arnés lento o inestable** al migrar una base por worker con Docker en paralelo (L3 de 00b) | Media | Migrar una plantilla una vez y clonarla por worker (`CREATE DATABASE … TEMPLATE`), o migrar por worker; lo decide design midiendo. `npm run verify` MUST seguir por debajo de 3 minutos (PLT7) |
| **Tablas sin uso durante varias fases** (sobre todo §6, operación) que cambien antes de usarse | Media | Es la pregunta Q1; si se crean ahora, cambiarlas después es una migración normal, no un rollback |
| **`prisma migrate dev` necesita base *shadow*** (permiso `CREATEDB`) | Baja | En desarrollo el usuario del Compose es superusuario; en tests, el contenedor también. El rol de producción es Fase 09 |
| **Deriva de fin de línea en `migration.sql`** en Windows (CRLF) | Baja | Mismo tratamiento que el contrato en 00b (`.gitattributes`) |

## Rollback Plan

- Todo vive en la rama `fase-01-persistencia` y en slices apilados (`stacked-to-main`). **No hay
  datos que perder**: no hay producción y las tablas nacen vacías (P7). Revertir = no fusionar la
  cadena, o `git revert` del commit de la slice afectada.
- **Esquema y migración**: volver `prisma/schema.prisma` al esquema mínimo de 00a y borrar
  `prisma/migrations/` devuelve el repo al estado de 00b; `PrismaService` sigue funcionando porque el
  health check solo usa `$queryRaw` (PLT4).
- **Base de desarrollo local**: `prisma migrate reset` o borrar el volumen
  `luxeborealcrm_postgres_datos` de `docker-compose.yml`. Nada fuera de la máquina del desarrollador.
- **Arnés**: la firma de `test/soporte/infraestructura.ts` no cambia, así que revertir el arnés
  vuelve al contenedor compartido de 00a sin tocar los tests existentes (los nuevos de repositorio
  se revierten en la misma slice).
- **Semilla**: es un comando explícito; no correrla no rompe nada. Sus datos se borran con la base.
- **`MODELO_DATOS.md`**: el cambio de estado a "v1 aprobada" se revierte con el mismo commit.

## Dependencies

- Fases 00a y 00b cerradas (lo están): `PrismaService`, `plataforma/config`, Testcontainers
  (ADR-0009), `npm run verify`, hook pre-push y CI.
- Docker corriendo donde se ejecuten los tests de integración.
- Archivo oficial DIVIPOLA (Q2).
- Acceso al registro de npm si design agrega dependencias.

## Preguntas abiertas

**Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase.** Las tres abiertas bloquean
otras: P13 (horario) la Fase 04, P14 (dashboard) la Fase 11 y P17 (techo de gasto LLM) la Fase 06.
Las que tocan datos ya están resueltas y reflejadas en `MODELO_DATOS.md`: P1, P2, P3, P4, P7, P15,
P16.

Lo siguiente no eran preguntas P# — salieron de esta proposal — y el usuario ya las decidió el
2026-09-25:

| # | Pregunta | Decisión del usuario | Efecto |
|---|---|---|---|
| Q1 | ¿La migración inicial crea **todas** las tablas de `MODELO_DATOS.md` v1, incluidas las de operación (§6: `usuario`, `movimiento_inventario`, `venta`, `venta_item`, `envio`), que no se usan hasta la Fase 11? ¿O solo §3-§5 y §7, y §6 se crea en la Fase 11? | **Todas** (recomendación aceptada) | `sdd-spec`/`sdd-tasks` cubren el esquema v1 completo, incluido §6; las tablas de operación nacen vacías y sin código que las use hasta la Fase 11 |
| Q2 | ¿De dónde sale el archivo DIVIPOLA? `MODELO_DATOS.md` §4 solo dice "listado oficial (divipola)"; no fija ruta ni formato. | **Descargarlo de la fuente oficial** (datos.gov.co, dataset `gdxc-w37w`) y versionarlo en el repo con fuente y fecha de descarga anotadas (recomendación aceptada) | La tarea de semilla descarga y commitea el archivo con esa procedencia documentada, en vez de copiar el CSV del prototipo |

## Success Criteria

- [ ] Sobre una base vacía, la migración inicial se aplica sin errores y el esquema resultante no
      tiene deriva respecto a `prisma/schema.prisma`.
- [ ] Las tablas usan `uuid` como PK salvo las excepciones de ADR-0007; `contacto` no usa el
      teléfono como PK; `conversacion` tiene `version`.
- [ ] Insertar dos filas de "todo el departamento" en `zona_sin_cobertura` falla (el bug de
      `NULL` del prototipo no existe).
- [ ] Un test de repositorio escribe y lee contra Postgres real, en una base propia de su worker,
      sin afectar a los tests de otros workers.
- [ ] Correr la semilla DANE dos veces deja exactamente los mismos departamentos y ciudades, y no
      crea ninguna fila fuera de `departamento` y `ciudad`.
- [ ] `npm run verify` en verde, en menos de 3 minutos (PLT7).
- [ ] `MODELO_DATOS.md` queda como v1 aprobada y coincide con `schema.prisma`.
- [ ] Cada escenario de la spec delta de `persistencia` tiene su test, nombrado
      `<id del requisito> — <título del escenario>`, y pasa.
