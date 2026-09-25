# Design: Fase 01 — Persistencia

- Change: `fase-01-persistencia` · Fecha: 2026-09-25 · Insumos: `proposal.md` (aprobada, Q1 y Q2
  decididas), `MODELO_DATOS.md` borrador v1, Engram `sdd/fase-01-persistencia/explore`
- ADRs que aplica: ADR-0003, ADR-0004, ADR-0006, ADR-0007, ADR-0009. **Ningún ADR nuevo** (ver
  §"ADRs").
- Endpoints nuevos: **ninguno**. El contrato OpenAPI no cambia; `contrato:deriva` sigue en verde sin
  regenerar nada.

## Resumen

La fase se construye en este orden: **arnés primero, esquema después**. Así, el primer test que
escribe datos ya corre en una base aislada.

1. **Arnés**: el `globalSetup` migra una **base plantilla** una sola vez. Antes de cada archivo de
   test, cada worker recrea su base `test_<poolId>` clonando esa plantilla
   (`CREATE DATABASE … TEMPLATE`).
2. **Esquema**: `prisma/schema.prisma` pasa a ser el esquema v1 completo en un solo archivo. Lo
   acompaña una única migración inicial generada por Prisma, con tres restricciones escritas a
   mano. Cada restricción manual lleva una marca `-- [manual]` y un test de guardia.
3. **Geografía**: un módulo nuevo y pequeño, `modulos/geografia`, es dueño de `departamento` y
   `ciudad`. Tiene su puerto, su repositorio Prisma (el test de repositorio de la fase) y el caso de
   uso de la semilla DANE. La semilla se invoca desde `scripts/cli.ts`.

`npm run verify` **no** gana ningún paso: la comprobación de deriva de la migración vive dentro del
proyecto de tests `integracion`. **PLT7 no cambia** (siguen siendo seis comprobaciones).

## Technical Approach

La proposal cortaba la entrega en 4 slices: (a) verificación de Prisma + esquema + migración,
(b) arnés, (c) semilla + repositorio y (d) cierre. Este diseño cambia dos cosas, ambas por reglas
que ya están aprobadas:

- **Orden (b) antes que (a).** Por TDD estricto, las restricciones escritas a mano de la migración
  necesitan su test en el mismo commit. Esos tests insertan filas, así que exigen la base aislada
  por worker. Construir el arnés no depende del esquema: funciona con cero migraciones.
- **(c) se parte en dos slices**, repositorio y semilla, para quedar cerca de las ~400 líneas. Queda
  un total de **5 slices** (ver §"Migration / Rollout").

La slice del esquema supera el presupuesto por naturaleza: son 21 tablas en una sola migración
inicial. La proposal ya previó ese caso (Risks, fila 1: "se explica y se sigue"), así que no se abre
ninguna pregunta nueva por esto.

## Architecture Decisions

### D1 — Estructura de `prisma/schema.prisma`: un solo archivo, por secciones de `MODELO_DATOS.md`

**Elección**: un único `prisma/schema.prisma`, ordenado como `MODELO_DATOS.md`:

1. `generator` y `datasource`.
2. §3 Catálogo, §4 Envíos, §5 Atención, §6 Operación y §7 Técnica.
3. §8 Enums al final.

Cada sección abre con un comentario que cita su sección de `MODELO_DATOS.md`.

**Alternativa descartada**: el esquema en varios archivos (carpeta `prisma/schema/`), soportado por
Prisma 7 vía `schema` en `prisma.config.ts`. Descartada por tres motivos:

- La revisión es 1:1 contra un solo documento (`MODELO_DATOS.md`), y un solo archivo se lee en el
  mismo orden.
- Mover el esquema cambia rutas en `prisma.config.ts` y en la salida del cliente generado, que hoy
  funcionan (00a, D6).
- Partir en archivos no reduce las líneas de la slice.

Convenciones confirmadas contra `MODELO_DATOS.md` §1:

| Tema | Regla en `schema.prisma` |
|---|---|
| Nombres | Modelos en PascalCase singular (`ZonaSinCobertura`), campos en camelCase; `@@map("zona_sin_cobertura")` y `@map("departamento_id")` en todo |
| PK uuid | `id String @id @default(uuid(7)) @db.Uuid` |
| PK natural | `departamento.id`, `ciudad.id` (`String @id`, código DANE), `parametro.clave`, `excepcion_horario.fecha` (`DateTime @id @db.Date`) |
| Dinero | `Int` con sufijo `Cop` (`precioCop` → `precio_cop`) |
| Porcentajes | `Decimal @db.Decimal(5, 2)` |
| Fechas | `DateTime @db.Timestamptz(3)`: `MODELO_DATOS.md` dice `timestamptz`, y el `DateTime` de Prisma sin `@db` sería `timestamp(3)` **sin** zona |
| `creado`/`actualizado` | `@default(now())` en la base; **sin `@updatedAt`** (D3) |
| Enums | `enum EstadoAtencion { bot handoff_pendiente humano pausado  @@map("estado_atencion") }`: valores en snake_case tal cual `MODELO_DATOS.md`, 11 enums de §8 |
| `jsonb` | `Json @db.JsonB` |
| Índices | Solo los que `MODELO_DATOS.md` fija (`producto.activo`, `producto.categoria_id`) y las unicidades. Los índices que piden las consultas de fases futuras (`outbox`, `conversacion.expira_control_en`) los agrega la fase que escribe esa consulta, con una migración normal |

### D2 — UUID v7: `@default(uuid(7))` funciona en Prisma 7.10.0; lo genera el cliente, no la base

**Elección**: se usa la vía principal de ADR-0007, `@default(uuid(7))` con `@db.Uuid`. El plan B
(generar el id en la aplicación) **no** aplica.

**Cómo se verificó** (estático, en este diseño):

- Versión instalada: `node_modules/prisma/package.json` → `7.10.0`; `@prisma/client` `^7.10.0`.
- El runtime del cliente (`node_modules/@prisma/client/runtime/client.mjs.map`) registra el
  generador `uuid` con `arg === 7 → uuidv7()` (paquete `uuid`). Cualquier otro argumento lanza
  `Invalid UUID generator arguments`.

**Consecuencia que se documenta** en `MODELO_DATOS.md` §1 y en una nota de implementación de
ADR-0007:

- `uuid(7)` es un default **del cliente Prisma**. La `migration.sql` **no** lleva `DEFAULT` en las
  columnas `id`.
- Postgres 16 no tiene `uuidv7()` nativo (llega en Postgres 18), así que no hay alternativa del lado
  de la base sin extensiones.
- Un `INSERT` en SQL crudo MUST traer su `id`. La semilla DANE no se ve afectada: usa llaves
  naturales.

**Pendiente de comprobar en ejecución** (primer commit de la slice S2, con la salida real anotada en
`tasks.md`, L2 de 00b):

1. `prisma validate` acepta `@default(uuid(7)) @db.Uuid`.
2. La migración generada no trae `DEFAULT` en `id`.
3. Un `create` por `PrismaService` devuelve un id con el nibble de versión `7`. Esto queda como test
   de invariante (D6).

Si (1) fallara, se aplica el plan B de ADR-0007 sin ADR nuevo: un puerto `GENERADOR_ID` en
`plataforma/` con el paquete `uuid`, y se corrige este diseño antes de seguir.

### D3 — Marcas de tiempo: default en la base; la aplicación las escribe desde `Clock`

**Elección**: `creado` y `actualizado` llevan `@default(now())` (default `CURRENT_TIMESTAMP` en
Postgres) y **no** usan `@updatedAt`. Los repositorios de fases futuras MUST escribir `creado` y
`actualizado` explícitamente con `this.clock.ahora()`.

**Alternativa descartada**: `@updatedAt`. Prisma pone la fecha con su propio `new Date()` dentro del
cliente, saltándose el `Clock` inyectado (regla crítica 6 de `CLAUDE.md`, PLT2). Con eso, cualquier
test con `ClockFalso` que mire `actualizado` sería no determinista.

**Por qué conservar el default de la base**: es la red de seguridad para SQL crudo y para
herramientas (Prisma Studio). No es la fuente de la fecha en la lógica.

### D4 — Restricciones que Prisma no expresa: SQL a mano, marcado y con guardia

Inventario decidido:

| Objeto | ¿A mano? | SQL | Motivo |
|---|---|---|---|
| `zona_sin_cobertura` único `(departamento_id, ciudad_id)` | **Sí**: solo la cláusula | Se declara `@@unique([departamentoId, ciudadId], map: "zona_sin_cobertura_departamento_id_ciudad_id_key")` en el esquema y se agrega `NULLS NOT DISTINCT` a la línea `CREATE UNIQUE INDEX` generada | `MODELO_DATOS.md` §4; el bug de `NULL` de `tarifa_envio` (`../ChatLuxeCRM/tests/db/repositorios.test.ts:20-24`) |
| `movimiento_inventario` `CHECK ("origen" <> 'usuario' OR "usuario_id" IS NOT NULL)` | **Sí** | `ALTER TABLE … ADD CONSTRAINT "movimiento_inventario_usuario_si_origen_usuario_check"` | `MODELO_DATOS.md` §6: "obligatorio solo si `origen = usuario` (check)" |
| `movimiento_inventario` `CHECK ("cantidad" > 0)` | **Sí** | `ALTER TABLE … ADD CONSTRAINT "movimiento_inventario_cantidad_positiva_check"` | `MODELO_DATOS.md` §6: "siempre positiva; el signo lo da `tipo`". Es la regla escrita, aplicada por la base (misma idea que los enums nativos, §1) |
| `evento_entrante` único `(origen, id_externo)` | **No** | `@@unique([origen, idExterno])` nativo | Las dos columnas son `NOT NULL`; Prisma lo expresa solo (ADR-0004) |
| Unicidad en `tarifa_estimada` | **No se crea en 01** | — | Ver abajo |

**Por qué `tarifa_estimada` no lleva unicidad en esta fase**:

- `MODELO_DATOS.md` §4 no la fija, y el esquema es decisión del usuario (`CLAUDE.md`).
- La regla que de verdad importa es que los **rangos de peso** de la misma zona no se solapen. Un
  índice único no la expresa; hace falta una restricción de exclusión (`EXCLUDE USING gist` con
  `int4range`, extensión `btree_gist`).
- Esa regla es de la búsqueda "más específica que calce" (Fase 02). Allí se propone al usuario, con
  su test.

**Cómo se mantienen a salvo en migraciones futuras** (patrón documentado en `prisma/README.md`,
nuevo):

1. **Nombre explícito y marca.** Cada objeto escrito a mano lleva nombre propio y, en la
   `migration.sql`, una línea `-- [manual] <nombre> — <motivo>` justo antes de su SQL.
2. **Prisma conoce el índice.** El único de `zona_sin_cobertura` está declarado en `schema.prisma`
   con el mismo nombre (`map:`). Así Prisma no lo ve como "índice sobrante" y no genera un
   `DROP INDEX`. Solo la cláusula `NULLS NOT DISTINCT` es invisible para él. Los `CHECK` no existen
   para el motor de diferencias de Prisma, así que nunca los borra.
3. **Migraciones nuevas siempre con `--create-only`.** Se generan con
   `npm run prisma:migrar -- --create-only --name <que-cambia>`. Antes de aplicarlas se revisa el
   SQL para que no toque ningún objeto `[manual]`. Nunca se edita una migración ya fusionada (skill
   §5).
4. **Guardias en `npm run verify`.** Dos tipos de test:
   - (a) Un test de comportamiento por objeto: el `INSERT` que MUST fallar.
   - (b) Un test de registro: lee todas las marcas `-- [manual]` de `prisma/migrations/**` y
     comprueba que cada objeto nombrado existe en el catálogo de Postgres (`pg_indexes` con
     `indnullsnotdistinct = true` o `pg_constraint`).

   Si una migración futura los borra o los recrea sin la cláusula, `verify` falla.
5. **Comprobación empírica en S2.** Tras aplicar la migración editada,
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` MUST
   dar código 0. Si Prisma 7.10 sí detectara la diferencia de `NULLS NOT DISTINCT` (código 2), cada
   `migrate dev` propondría recrear el índice. En ese caso:
   - Se anota la salida real.
   - Se mantiene la cláusula.
   - El punto 3 (revisión con `--create-only`) pasa de buena práctica a paso obligatorio.
   - La guardia (4a) atrapa cualquier descuido.

   Si una versión de Prisma soporta la cláusula de forma nativa, se usa la nativa y se quita la
   edición a mano.

### D5 — `PrismaService`: sin cambios de código

**Elección**: `PrismaService` extiende el `PrismaClient` generado (00a). Al regenerar el cliente con
el esquema v1, expone `departamento`, `ciudad`, etc. **sin tocar el archivo**. Solo se actualiza su
TSDoc (hoy dice "sin modelos"). Sigue cumpliendo PLT5: no conecta al importarse y hace `$disconnect()`
en `onApplicationShutdown`.

**Sin helper de transacción en esta fase.** Ningún caso de uso de 01 coordina dos repositorios. La
única transacción de la fase (`guardarCatalogo`, D8) vive dentro de un solo método de repositorio,
como `$transaction([...])` por lotes. El servicio de transacción inyectable de la skill §5 lo
necesitan ADR-0003 (transición + outbox) y ADR-0004 (inbox): lo diseñan las fases 04-05, que tienen
el primer caso de uso que lo usa.

### D6 — Arnés: plantilla migrada una vez + clon por worker, recreado por archivo

**Elección** (ADR-0009, sin cambiar la firma de `test/soporte/infraestructura.ts`):

1. **`globalSetup`** (`contenedores.global-setup.ts`), una vez por corrida:
   - Levanta los contenedores (igual que 00a).
   - Crea la base `plantilla_luxe` desde `template0`.
   - Corre `prisma migrate deploy` contra ella (subproceso, D7).
   - Si `prisma/migrations/` todavía no tiene migraciones (slice S1), el deploy se omite.
2. **`setupFiles`** nuevo, `test/soporte/base-por-worker.setup.ts`, en los proyectos `integracion` y
   `e2e`. En un `beforeAll` hace
   `DROP DATABASE IF EXISTS test_<poolId> WITH (FORCE)` + `CREATE DATABASE test_<poolId> TEMPLATE plantilla_luxe`.
   Así, cada archivo de test empieza con una base recién clonada, migrada y vacía, que es solo de su
   worker. Si `CREATE DATABASE` falla con SQLSTATE `55006` (plantilla ocupada), se reintenta hasta 5
   veces con espera creciente.
3. **`urlPostgresDePrueba(): string`** conserva su firma. Ahora devuelve la URL de administración
   con la ruta cambiada a `/test_<VITEST_POOL_ID>`, armada con `new URL()`. Es síncrona porque la
   base ya existe cuando el test la pide.
4. **Redis**: se agrega `prefijoRedisDePrueba(): string` → `test:<poolId>:`. Es un export nuevo, no
   un cambio de firma. `urlRedisDePrueba()` no cambia. En esta fase ningún test escribe claves; el
   helper queda listo para la primera fase que lo haga (04-05).

**Alternativa descartada**: migrar cada base de worker con `prisma migrate deploy`. Es lo que
sugería la proposal y es más simple, pero:

- Cada deploy lanza un proceso de Node con el motor de esquema de Prisma: unos 3-5 s en frío.
- Con N workers, son N procesos en paralelo compitiendo con los contenedores de Docker. Es
  exactamente la contención que midió 00b (L3: subprocesos triviales que pasaban de 5 s).
- Clonar desde la plantilla es una copia de archivos dentro de Postgres (unos 0,1-0,5 s para una
  base de 21 tablas vacías) y no lanza ningún proceso.

Con esto, el costo total de migraciones por corrida es de **un** deploy, sin importar la cantidad de
workers.

**Por qué recrear por archivo y no una vez por worker**: los archivos de un mismo worker corren uno
tras otro sobre la misma base. Sin recrearla, las filas de un archivo se filtran al siguiente y el
resultado depende del orden (el antipatrón A12 del prototipo, que usaba `TRUNCATE` entre tests).
Recrear cuesta un clon por archivo y deja cada archivo aislado de los demás. Dentro de un archivo,
los tests comparten la base, y cada test MUST usar sus propios datos.

**Timeouts y paralelismo** (L3 de 00b):

| Ajuste | Valor | Dónde | Motivo |
|---|---|---|---|
| `testTimeout` | 20 s (sin cambio) | global | Ya absorbe la contención medida en 00b |
| `hookTimeout` | **60 s** | proyectos `integracion` y `e2e` | El `beforeAll` de clonado corre bajo la contención de Docker; el default de 10 s es el mismo riesgo que L3 |
| Timeout del test de deriva | **90 s** en ese test | `test/integracion/persistencia/migracion.spec.ts` | Lanza el CLI de Prisma (subproceso) |
| `maxWorkers` | **sin tope a priori** | — | Con la plantilla, el costo por worker es un clon. Si la medición de S1 o S2 da `npm run verify` > 150 s, se aplica `maxWorkers: 4` al proyecto `integracion` (S1 confirma que Vitest 5 acepta la opción por proyecto) |

**Presupuesto de PLT7 (< 3 min)**:

- Base medida en 00b: `npm run verify` en 1 min 17 s en total; los tests unitarios + integración,
  17,86 s.
- Suma estimada de esta fase: un `migrate deploy` en el `globalSetup` (unos 5 s), un clon por archivo
  de integración (~8 archivos × ≤0,5 s, repartidos entre workers), el test de deriva (~5 s, un
  subproceso) y la semilla con el archivo real (~1 s, D8).
- Estimación: **~1 min 45 s**.
- Cada slice anota en `tasks.md` la duración real de `npm run verify`. Si pasa de 150 s, la slice no
  cierra sin aplicar el tope de workers.

### D7 — CLI de Prisma desde los tests: un solo helper, sin shell

**Elección**: `test/soporte/prisma-cli.ts` exporta
`ejecutarPrismaCli(argumentos, urlBase): Promise<{ codigo, salida, error }>`. Por dentro usa
`execFile(process.execPath, [<raíz>/node_modules/prisma/build/index.js, ...argumentos])` con
`cwd = <raíz>` y `env = { ...process.env, DATABASE_URL: urlBase }`. `prisma.config.ts` ya lee
`DATABASE_URL`, así que no hace falta ningún flag de URL.

Lo usan el `globalSetup` (`migrate deploy`) y el test de deriva (`migrate diff … --exit-code`). No
hay shell ni argumentos compuestos como texto. Los nombres de base de datos se arman solo con
constantes y con un `poolId` validado como entero (ver §"Threat Matrix").

**Alternativa descartada**: aplicar los `migration.sql` con `pg` a mano, sin el CLI. Es más rápido,
pero no prueba que `prisma migrate deploy` (la herramienta real, la misma que usará la Fase 09) aplica
la migración desde cero, y no llena `_prisma_migrations`.

### D8 — Geografía: módulo nuevo `modulos/geografia`

**Elección**: un módulo de negocio pequeño y hoja (no depende de ningún otro módulo), dueño del
catálogo DANE:

```
src/modulos/geografia/
├── dominio/geografia.ts                     Departamento, Ciudad, CatalogoGeografico; reglas de código DANE
├── dominio/interpretar-divipola.ts          texto JSON oficial → CatalogoGeografico (puro, sin imports)
├── puertos/repositorio-geografia.ts         interfaz + token REPOSITORIO_GEOGRAFIA
├── aplicacion/sembrar-geografia.ts          caso de uso SembrarGeografia
├── infraestructura/repositorio-geografia-prisma.ts
├── geografia.module.ts
└── index.ts                                  GeografiaModule, SembrarGeografia, tipos de dominio
```

**Alternativas descartadas**:

- **`plataforma/geografia`**: `plataforma` es técnico y sin negocio. Traducir "lo que escribió el
  cliente" a un código DANE (P4) es negocio de envíos. Es el mismo argumento que usó la proposal
  para no meter `persistencia` en `plataforma`.
- **`modulos/catalogo`** (dueño de la cobertura en la Fase 02, según `inventario.md`
  `catalogo/dominio/envio`): crear `catalogo` ahora adelanta la estructura de la Fase 02, y eso lo
  prohíbe `CLAUDE.md`. Además, la geografía tiene más consumidores: `catalogo` (02), `contactos`
  (04, `contacto.ciudad_id`) y `ventas` (11+, `envio.ciudad_id`). Si viviera dentro de uno, los
  otros dependerían de ese módulo completo solo por una tabla de referencia.

**Sin ADR nuevo**: agregar un módulo es aplicar ADR-0001 (monolito modular), no una decisión
arquitectónica nueva. La lista de módulos de la skill `luxeboreal-arquitectura` §1 se actualiza en
la slice de cierre.

**Semilla idempotente**:

- El repositorio hace upsert por código DANE en **dos sentencias por lotes**, dentro de un
  `$transaction([...])`:

  ```sql
  INSERT INTO ciudad (id, departamento_id, nombre)
  SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
  ON CONFLICT (id) DO UPDATE SET departamento_id = EXCLUDED.departamento_id, nombre = EXCLUDED.nombre
  WHERE (ciudad.departamento_id, ciudad.nombre) IS DISTINCT FROM (EXCLUDED.departamento_id, EXCLUDED.nombre)
  RETURNING (xmax = 0) AS insertada
  ```

  La sentencia de `departamento` va primero y tiene la misma forma. Las dos van con `$queryRaw` en
  plantilla etiquetada, con parámetros.
- Gracias al `WHERE … IS DISTINCT FROM`, una fila sin cambios **no** se reescribe. Por eso la
  segunda corrida devuelve `insertados: 0, actualizados: 0`, que es la evidencia observable de la
  idempotencia.
- La semilla **nunca borra**: un código que desaparezca del DIVIPOLA se queda, porque
  `contacto.ciudad_id` y `envio.ciudad_id` pueden apuntarle. Se documenta.
- **Alternativa descartada**: un `upsert` de Prisma por fila (~1.120 viajes a la base). Es más
  lento, y dentro de una transacción interactiva se arriesga al timeout de 5 s de Prisma bajo la
  contención de L3.

**Invocación** (nunca al arrancar la app ni al importar, A1):

- Comando: `npm run semilla:geografia` → `npm run herramienta -- scripts/cli.ts semilla:geografia`.
- `scripts/sembrar-geografia.ts`:
  1. Lee `prisma/datos/divipola.json`.
  2. Crea un contexto de Nest (`NestFactory.createApplicationContext`) con `ConfiguracionModule` +
     `GeografiaModule`. `DATABASE_URL` se lee solo en `plataforma/config` (PLT1).
  3. Ejecuta `SembrarGeografia` y cierra el contexto (PLT5).
  4. Imprime `Geografía sembrada: N departamentos, M ciudades (insertadas X, actualizadas Y, sin cambios Z)`.
- Por reutilizar la validación completa de configuración, `REDIS_URL` también debe estar definida
  (el `.env` de desarrollo ya la tiene).
- **No** se configura `migrations.seed` en `prisma.config.ts`, para que ningún comando de Prisma
  siembre como efecto secundario.

### D9 — Archivo DIVIPOLA (Q2): JSON de la API de datos abiertos, guardado byte a byte

**Elección**: se descarga en formato **JSON** del endpoint SODA de datos.gov.co y se guarda sin
modificar:

```
curl -fL "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000" -o prisma/datos/divipola.json
```

- SODA devuelve **1.000 filas por defecto**. Sin `$limit`, el archivo queda truncado en silencio.
- Hay unas 1.120 filas esperadas. El conteo real se contrasta con el que muestra la página del
  dataset.

**Por qué JSON y no CSV**: el CSV exige un analizador RFC 4180 propio, porque hay nombres con coma
entre comillas ("Bogotá, D.C."). Serían unas 110 líneas de código y tests, y un caso límite más.
`JSON.parse` es nativo y cabe en el dominio sin imports.

**Procedencia** en `prisma/datos/divipola.procedencia.json` (legible por máquina):

```json
{ "fuente": "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000",
  "dataset": "gdxc-w37w", "descargado": "AAAA-MM-DD", "sha256": "…",
  "filas": 0, "departamentos": 0, "ciudades": 0,
  "campos": { "codigoDepartamento": "…", "departamento": "…", "codigoMunicipio": "…", "municipio": "…" } }
```

La explicación para humanos va en `prisma/README.md` §"Datos de referencia". El archivo se marca
`prisma/datos/divipola.json -text` en `.gitattributes`: así git no normaliza los fines de línea y el
`sha256` corresponde a los bytes descargados.

**Formato no verificado en vivo** (este diseño no tiene acceso a la red):

- Se presume que SODA usa nombres de campo tipo `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio`, más
  otros que se ignoran (tipo, longitud, latitud).
- **Paso de verificación de la tarea de descarga**:
  1. Anotar en `campos` los nombres reales de los cuatro campos.
  2. Ajustar la constante única de nombres en `interpretar-divipola.ts`.
  3. Anotar `filas`, `departamentos` y `ciudades` reales.
- Si el endpoint JSON no responde, **no** se improvisa otro formato: la tarea se detiene y reporta.

**Reglas del intérprete** (dominio, puras):

- Rellena con ceros a la izquierda: departamento a 2 dígitos, municipio a 5.
- Valida `^\d{2}$` y `^\d{5}$`, y que el municipio empiece con el código de su departamento.
- Valida que no haya códigos repetidos con nombres distintos.
- Guarda los nombres **tal como vienen en la fuente** (solo `trim` + normalización Unicode NFC).
- Cualquier violación lanza `FuenteDivipolaInvalida`, que nombra la fila y la regla, y no se
  escribe nada.

### D10 — Frontera de Prisma: se cierra un hueco antes de que exista el primer módulo

**Hallazgo**: la regla 4 de dependency-cruiser (`prisma-solo-en-infraestructura`) prohíbe importar
`@prisma/client` o `generado/` fuera de `plataforma/prisma` e `infraestructura/`. Pero **no**
prohíbe importar el barril `src/plataforma/prisma/index.ts`, que exporta `PrismaService`, un
`PrismaClient` completo. Un `aplicacion/` podría usar Prisma sin romper ninguna regla. Hasta hoy
daba igual porque no existía ningún módulo; `modulos/geografia` es el primero.

**Elección**: se agrega la regla 12 `prisma-service-solo-en-infraestructura`, con su test de
*fixture*. Prohíbe los imports de `^src/modulos/[^/]+/(aplicacion|puertos|interfaz)/` hacia
`^src/plataforma/prisma/`:

- `dominio/` ya lo cubre la regla 3.
- `<m>.module.ts` sí puede importar `PrismaModule`, porque es la raíz de composición del módulo.

**PLT6 no cambia de texto**: su requisito ("`@prisma/client` MUST NOT importarse fuera de
`plataforma/prisma` y de `infraestructura/`") ya cubre este caso en espíritu, porque `PrismaService`
*es* el cliente. El test de la regla nueva se nombra con el escenario existente
`PLT6 — Un import prohibido hace fallar npm run verify`. La tabla de la skill §2 pasa de 11 a 12
reglas en el cierre.

### D11 — Delta de `plataforma` (PLT7): **no hay delta**

**Elección**: la comprobación "migración desde cero, sin deriva" es un **test del proyecto
`integracion`**, no un paso nuevo de `npm run verify`. **PLT7 queda con seis comprobaciones y
`sdd-spec` MUST NOT escribir delta de `plataforma`.**

**Motivo**: la deriva solo se puede comprobar contra un Postgres real, y ese Postgres ya lo levanta
el arnés del proyecto `integracion`. Un paso aparte tendría que levantar su propia base: repetiría el
`globalSetup` o dependería del Postgres de desarrollo (prohibido por ADR-0009). Un test que falla
bloquea `verify` igual que un paso propio. Además, CI ya lo corre dentro de `test:cobertura`
(unit + integración). PLT5, PLT6 y PLT1 tampoco cambian: no hay configuración nueva (ver
§"Configuración").

### D12 — Ajustes a `MODELO_DATOS.md` (se escriben ahí antes que en `schema.prisma`)

Estos ajustes aparecieron al bajar el modelo a Prisma. Se escriben en `MODELO_DATOS.md` en el primer
commit de S2 (regla §design de `openspec/config.yaml`). El usuario los ve al aprobar este diseño, y
el documento pasa a "v1 aprobada" en el cierre.

| # | Ajuste | Decisión |
|---|---|---|
| 1 | Generación de ids | La hace el cliente Prisma (`uuid(7)`); sin `DEFAULT` en la base (D2) |
| 2 | Marcas de tiempo | `timestamptz(3)`; `now()` como red de seguridad; la aplicación las escribe desde `Clock` (D3) |
| 3 | `conversacion.version` | `int`, default `0` |
| 4 | `uso_llm.costo_estimado_usd` | `decimal(12,6)` (§7 decía solo "decimal") |
| 5 | Defaults | Solo los que el documento ya fija (`activo`, `orden`, `stock`, `stock_minimo`, `acepta_contacto`, `peso_min_g`, `contraentrega_disponible`, `es_portada`) más los técnicos: `version = 0`, `intentos = 0`, las fechas de creación/recepción con `now()` y `outbox.proximo_intento` con `now()`. **Sin default para estados de negocio** (`conversacion.estado`, `lead.estado`, `venta.estado`, `envio.estado`, booleanos de `lead`): los fija el caso de uso de su fase |
| 6 | `ON DELETE` no especificado | Geografía: `Restrict` siempre, incluidas las FK opcionales, porque en `zona_sin_cobertura` y `tarifa_estimada` el `NULL` *significa* "todo el departamento" o "nacional". `venta.contacto_id`, `venta.usuario_id`, `envio.venta_id` y `movimiento_inventario.usuario_id`: `Restrict` (registros contables; los usuarios se desactivan, y un `SetNull` violaría el `CHECK` de D4). `uso_llm.conversacion_id`, `venta.lead_id` y `evento_fuera_cobertura.producto_id`: `SetNull` (permiten borrar un contacto en cascada) |
| 7 | `CHECK (cantidad > 0)` en `movimiento_inventario` | Se hace cumplir la frase "siempre positiva" (D4) |
| 8 | `evento_entrante.origen`, `outbox.tipo` | `text` (§8 no les define enum) |

## Módulos tocados y dependencias

Solo se importa lo exportado por cada módulo (su `index.ts`):

| Módulo | Cambio | Importa de |
|---|---|---|
| `plataforma/prisma` | Solo TSDoc (D5); el cliente generado crece con el esquema | `plataforma/config` (sin cambio) |
| `modulos/geografia` (**nuevo**) | Dominio, puerto, caso de uso, repositorio, módulo | `geografia.module.ts` → `plataforma/prisma/index.ts` (`PrismaModule`); `infraestructura/` → `plataforma/prisma/index.ts` (`PrismaService`); `dominio/` → nada |
| `scripts/` | `cli.ts` + `sembrar-geografia.ts` | `src/modulos/geografia/index.ts`, `src/plataforma/config/index.ts`, `@nestjs/core` |
| `test/soporte` | Arnés (D6, D7) | `pg` (devDependency nueva, explícita; ya estaba como dependencia transitiva de `@prisma/adapter-pg`), `vitest` |

`AppModule` **no** importa `GeografiaModule` en esta fase: nada de la aplicación lo usa todavía. Lo
importará la Fase 02 donde haga falta. **PLT6 se respeta**: solo `plataforma/prisma` y
`modulos/geografia/infraestructura/` tocan `PrismaService` o Prisma, y la regla nueva (D10) lo hace
verificable.

## Puertos y adaptadores

| Puerto (token) | Interfaz | Adaptador | Módulo |
|---|---|---|---|
| `REPOSITORIO_GEOGRAFIA` | `RepositorioGeografia` | `RepositorioGeografiaPrisma` (`infraestructura/`) | `geografia` |

No se modifica ningún puerto existente. La lectura del archivo no es un puerto: la hace el script,
que es raíz de composición como `main.ts`. El caso de uso recibe el texto.

## Eventos de dominio

**Ninguno.** Esta fase solo crea esquema, arnés y datos de referencia. Sembrar la geografía no tiene
ningún consumidor que reaccione a ese hecho: la cobertura (02) lee la tabla cuando la necesita. Y las
tablas de negocio nacen sin código que las use. Los eventos de `conversacion`, `lead` y `outbox`
llegan con sus fases (04, 05, 08).

## Configuración

**Sin variables nuevas.** La semilla y los comandos de migración usan la `DATABASE_URL` que ya
existe. El arnés usa las URLs de Testcontainers y `VITEST_POOL_ID`, la variable estándar de Vitest,
leída solo en `test/` (la regla de entorno de ESLint aplica solo a `src/**`). `.env.example` y
`plataforma/config` no cambian.

## ADRs

| ADR | Relación | Cambio en el documento |
|---|---|---|
| ADR-0007 | Se implementa por la vía principal | Nota "Implementado en la Fase 01": ids generados por el cliente Prisma, sin `DEFAULT` en la base (D2) |
| ADR-0009 | Se completa el aislamiento prometido | Nota "Implementado en la Fase 01": plantilla + clon por archivo (D6) |
| ADR-0003, ADR-0004 | Solo las tablas (`conversacion.version`, `evento_entrante` único, `outbox`) | Ninguno |
| ADR-0006 | Sin `cuenta_id` | Ninguno |

**ADR nuevo: ninguno.** Tampoco la plantilla (D6) ni el módulo `geografia` (D8) lo necesitan:
tienen alternativas, pero son decisiones de implementación dentro de ADRs aceptados (0009 y 0001).
Quedan registradas aquí con su motivo.

## Data Flow

```
Arnés (por corrida y por archivo)
  globalSetup ──► contenedores PG16/Redis7 ──► CREATE DATABASE plantilla_luxe
       │                                          │
       └──► ejecutarPrismaCli(migrate deploy) ────┘  (una vez)
  setupFiles (beforeAll, cada archivo)
       └──► DROP test_<pool> WITH (FORCE) ─► CREATE test_<pool> TEMPLATE plantilla_luxe
  test ──► urlPostgresDePrueba() = …/test_<pool> ──► PrismaService

Semilla
  npm run semilla:geografia ─► scripts/cli.ts ─► sembrar-geografia.ts
       lee prisma/datos/divipola.json
       └─► contexto Nest [ConfiguracionModule, GeografiaModule]
             SembrarGeografia.ejecutar(texto)
               ├─► interpretarDivipola(texto)  (dominio, puro)
               └─► RepositorioGeografia.guardarCatalogo(catalogo)
                     └─► $transaction([upsert departamento, upsert ciudad])  ─► Postgres
       ◄── ResumenGuardado ── imprime conteos ── cierra contexto ($disconnect)
```

## File Changes

| Archivo | Acción | Slice | Descripción |
|---|---|---|---|
| `test/soporte/contenedores.global-setup.ts` | Modify | S1 | Crea y migra `plantilla_luxe`; provee la URL de administración (sin cambio de claves) |
| `test/soporte/base-por-worker.setup.ts` | Create | S1 | Recrea `test_<pool>` desde la plantilla por archivo, con reintento en `55006` |
| `test/soporte/bases-de-prueba.ts` | Create | S1 | Funciones puras: `nombreBaseDeWorker(poolId)` (valida entero), `urlConBase(urlAdmin, nombre)`, `NOMBRE_PLANTILLA` |
| `test/soporte/prisma-cli.ts` | Create | S1 | `ejecutarPrismaCli` (D7) |
| `test/soporte/infraestructura.ts` | Modify | S1 | `urlPostgresDePrueba()` → base del worker; `prefijoRedisDePrueba()` nuevo; TSDoc |
| `test/soporte/bases-de-prueba.spec.ts` | Create | S1 | Unitario: nombre inválido lanza, URL bien armada |
| `test/integracion/persistencia/aislamiento.spec.ts` | Create | S1 | Base propia `test_<pool>`, clon fresco por archivo, prefijo Redis por worker |
| `vitest.config.ts` | Modify | S1 | `setupFiles` y `hookTimeout: 60_000` en `integracion` y `e2e`; unit ahora incluye `test/soporte/**/*.spec.ts` |
| `package.json` | Modify | S1, S2, S4 | devDeps `pg`, `@types/pg` (S1); `prisma:migrar` = `prisma migrate dev`, `prisma:aplicar` = `prisma migrate deploy` (S2); `semilla:geografia` (S4) |
| `MODELO_DATOS.md` | Modify | S2, S5 | Ajustes D12 (S2); estado "v1 aprobada" (S5) |
| `prisma/schema.prisma` | Modify | S2 | Esquema v1 completo (D1) |
| `prisma/migrations/<ts>_esquema_v1/migration.sql` | Create | S2 | Generada + 3 bloques `[manual]` (D4) |
| `prisma/migrations/migration_lock.toml` | Create | S2 | Generado por Prisma |
| `prisma.config.ts` | Modify | S2 | `migrations: { path: 'prisma/migrations' }` explícito; sin `seed` |
| `prisma/README.md` | Create | S2 | Cómo migrar, marcas `[manual]`, `--create-only`, guardias; §"Datos de referencia" en S4 |
| `test/integracion/persistencia/migracion.spec.ts` | Create | S2 | Migración aplicada desde cero (lee `_prisma_migrations`), sin deriva (`migrate diff --exit-code`) |
| `test/integracion/persistencia/invariantes-esquema.spec.ts` | Create | S2 | PK uuid salvo excepciones, id v7, teléfono no es PK, `version` con default |
| `test/integracion/persistencia/restricciones-manuales.spec.ts` | Create | S2 | Comportamiento de cada `[manual]` + registro de marcas contra el catálogo |
| `src/plataforma/prisma/prisma.service.ts` | Modify | S2 | Solo TSDoc (D5) |
| `src/modulos/geografia/dominio/geografia.ts` (+ `.spec.ts`) | Create | S3 | Tipos y reglas de código DANE |
| `src/modulos/geografia/puertos/repositorio-geografia.ts` | Create | S3 | Puerto + token |
| `src/modulos/geografia/infraestructura/repositorio-geografia-prisma.ts` | Create | S3 | Adaptador (D8) |
| `src/modulos/geografia/geografia.module.ts`, `index.ts` | Create | S3 (S4 agrega el caso de uso) | Módulo y barril |
| `test/integracion/geografia/repositorio-geografia.spec.ts` | Create | S3 | Escribe y lee contra Postgres real en la base del worker |
| `.dependency-cruiser.cjs`, `test/fronteras/dependency-cruiser.spec.ts`, `test/fronteras/fixtures/…` | Modify/Create | S3 | Regla 12 (D10) + fixture |
| `src/modulos/geografia/dominio/interpretar-divipola.ts` (+ `.spec.ts`) | Create | S4 | Intérprete puro (D9) |
| `src/modulos/geografia/aplicacion/sembrar-geografia.ts` (+ `.spec.ts`) | Create | S4 | Caso de uso; unitario con repositorio en memoria |
| `test/fakes/repositorio-geografia-en-memoria.ts` | Create | S4 | Doble de prueba |
| `scripts/sembrar-geografia.ts`, `scripts/cli.ts` | Create/Modify | S4 | Comando de semilla |
| `prisma/datos/divipola.json` | Create | S4 | Datos oficiales, byte a byte (no cuenta como autoría) |
| `prisma/datos/divipola.procedencia.json` | Create | S4 | Procedencia (D9) |
| `.gitattributes` | Modify | S4 | `prisma/datos/divipola.json -text` |
| `test/integracion/geografia/semilla.spec.ts` | Create | S4 | Idempotencia, sin filas fuera de geografía, archivo real = procedencia |
| `CLAUDE.md` §Comandos | Modify | S5 | `prisma:migrar`, `prisma:aplicar`, `semilla:geografia` |
| `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modify | S5 | §1 módulo `geografia`; §2 regla 12; §5 flujo de migraciones con `--create-only` y `[manual]`; §7 base por archivo |
| `docs/adr/0007-…md`, `docs/adr/0009-…md` | Modify | S5 | Notas de implementación |

(`docs/fases/README.md` y `docs/migracion/inventario.md` se actualizan al archivar, no en estas
slices.)

## Interfaces / Contracts

```ts
// src/modulos/geografia/dominio/geografia.ts
export interface Departamento { readonly id: string; readonly nombre: string }        // id: 2 dígitos DANE
export interface Ciudad { readonly id: string; readonly departamentoId: string; readonly nombre: string } // id: 5 dígitos
export interface CatalogoGeografico {
  readonly departamentos: readonly Departamento[];
  readonly ciudades: readonly Ciudad[];
}
export class FuenteDivipolaInvalida extends Error { /* nombra fila y regla; nunca vuelca el archivo */ }

// src/modulos/geografia/puertos/repositorio-geografia.ts
export const REPOSITORIO_GEOGRAFIA = Symbol('REPOSITORIO_GEOGRAFIA');
export interface ConteoGuardado { readonly insertados: number; readonly actualizados: number; readonly sinCambios: number }
export interface ResumenGuardado { readonly departamentos: ConteoGuardado; readonly ciudades: ConteoGuardado }
export interface RepositorioGeografia {
  /** Upsert por código DANE en una transacción; nunca borra (D8). */
  guardarCatalogo(catalogo: CatalogoGeografico): Promise<ResumenGuardado>;
  listarDepartamentos(): Promise<readonly Departamento[]>;          // orden por id
  listarCiudadesDe(departamentoId: string): Promise<readonly Ciudad[]>; // orden por id
}

// src/modulos/geografia/aplicacion/sembrar-geografia.ts
@Injectable()
export class SembrarGeografia {
  constructor(@Inject(REPOSITORIO_GEOGRAFIA) private readonly repositorio: RepositorioGeografia) {}
  ejecutar(textoFuente: string): Promise<ResumenGuardado>; // interpretarDivipola → guardarCatalogo
}

// test/soporte/infraestructura.ts (firma pública existente intacta)
export function urlPostgresDePrueba(): string;   // ahora …/test_<VITEST_POOL_ID>
export function urlRedisDePrueba(): string;      // sin cambio
export function prefijoRedisDePrueba(): string;  // NUEVO: `test:<poolId>:`

// test/soporte/prisma-cli.ts
export function ejecutarPrismaCli(
  argumentos: readonly string[], urlBase: string,
): Promise<{ codigo: number; salida: string; error: string }>;
```

Ejemplo de la forma del esquema (no exhaustivo):

```prisma
model ZonaSinCobertura {
  id             String       @id @default(uuid(7)) @db.Uuid
  departamentoId String       @map("departamento_id")
  ciudadId       String?      @map("ciudad_id")
  motivo         String?
  creado         DateTime     @default(now()) @db.Timestamptz(3)
  actualizado    DateTime     @default(now()) @db.Timestamptz(3)
  departamento   Departamento @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  ciudad         Ciudad?      @relation(fields: [ciudadId], references: [id], onDelete: Restrict)

  // [manual] NULLS NOT DISTINCT se agrega en la migración (D4, prisma/README.md)
  @@unique([departamentoId, ciudadId], map: "zona_sin_cobertura_departamento_id_ciudad_id_key")
  @@map("zona_sin_cobertura")
}
```

## Testing Strategy

TDD estricto (RED observado → GREEN → REFACTOR), con el runner Vitest. Cada test se nombra
`<PER# o PLT6> — <título del escenario>`, con los títulos exactos que fije `sdd-spec` (L1 de 00b).

| Nivel | Qué se prueba | Enfoque |
|---|---|---|
| Unitario (`npm test`) | `nombreBaseDeWorker` rechaza un `poolId` no entero; `urlConBase` cambia solo la ruta | Funciones puras en `test/soporte` |
| Unitario | Reglas de código DANE; `interpretarDivipola` (relleno de ceros, prefijo municipio/departamento, repetidos, campos faltantes, JSON inválido → `FuenteDivipolaInvalida`) | Datos de prueba pequeños en línea, sin archivo |
| Unitario | `SembrarGeografia` llama a `guardarCatalogo` con el catálogo interpretado; con una fuente inválida no escribe | `test/fakes/repositorio-geografia-en-memoria.ts` |
| Fronteras (unit) | Regla 12: `aplicacion/` que importa `plataforma/prisma` falla; `<m>.module.ts` e `infraestructura/` pasan | Fixture en `test/fronteras/fixtures/` |
| Integración | Aislamiento: base `test_<pool>`, clon fresco por archivo, prefijo Redis distinto por worker | Postgres real (Testcontainers) |
| Integración | Migración: `_prisma_migrations` con todas las migraciones terminadas y sin revertir (la plantilla nació vacía); `migrate diff --exit-code` = 0 | Subproceso del CLI (D7), timeout 90 s |
| Integración | Invariantes: `id uuid` en las 17 tablas no exceptuadas (21 menos `departamento`, `ciudad`, `parametro`, `excepcion_horario`); excepciones con `text`/`date`; id creado con versión 7; PK de `contacto` = `(id)`; `telefono` único y opcional; `conversacion.version` con default `0` | `information_schema` + `pg_constraint` + un `create` por `PrismaService` |
| Integración | Restricciones `[manual]`: dos filas de "todo el departamento" → rechazo; movimiento con `origen = usuario` sin `usuario_id` → rechazo; `cantidad = 0` → rechazo; registro de marcas = catálogo | Prisma real; las filas previas necesarias (departamento, producto) se insertan en el mismo test |
| Integración | Repositorio: `guardarCatalogo` + `listarDepartamentos` / `listarCiudadesDe` devuelven tipos de dominio; `SELECT current_database()` = `test_<pool>` | `Test.createTestingModule([ConfiguracionModule, GeografiaModule])` con la configuración de prueba |
| Integración | Semilla: dos corridas → la segunda `insertados = actualizados = 0` y las tablas iguales; todas las tablas salvo `departamento`, `ciudad` y `_prisma_migrations` con 0 filas; el archivo real da los conteos y el `sha256` de la procedencia | Caso de uso real + archivo real |
| E2E | Sin tests nuevos. `test:e2e` MUST seguir en verde con la base por worker (checklist §12.2: se tocó el esquema) | Arranque completo existente |

Evidencia real en `tasks.md` (L2 de 00b): la salida de `prisma migrate dev` (S2), la de
`npm run semilla:geografia` corrida dos veces contra la base de desarrollo (S4) y la duración de
`npm run verify` en cada slice.

## Threat Matrix

Aplica en parte: la fase agrega **un subproceso** (el CLI de Prisma lanzado desde el arnés de tests,
D7). No agrega rutas HTTP, ni automatización de git, commits, push o PR, ni clasificación de
archivos ejecutables.

| Frontera | Aplica | Respuesta de diseño | Tests RED previstos |
|---|---|---|---|
| Rutas tipo documentación | N/A: no se clasifican ni se ejecutan archivos por su nombre; `divipola.json` se lee como datos con `JSON.parse` | — | — |
| Selección de repositorio git | N/A: ningún comando git nuevo | — | — |
| Estado de commit | N/A: sin automatización de commits | — | — |
| Estado de push | N/A: sin push | — | — |
| Comandos de PR | N/A: sin PR | — | — |
| **Subproceso (CLI de Prisma)**, extra propio de esta fase | **Aplica** | `execFile` sin shell; binario = `process.execPath` + ruta absoluta del CLI; argumentos en arreglo fijo; solo se sobrescribe `DATABASE_URL`. Los nombres de base se arman con constantes y un `poolId` que MUST cumplir `^\d+$`; si no, lanza **antes** de ejecutar SQL (los identificadores no se pueden parametrizar). Si el CLI sale con código ≠ 0, el `globalSetup` falla con el código y la salida de error, y ningún test corre sobre una plantilla a medias | `nombreBaseDeWorker('1; DROP DATABASE x')` lanza; `nombreBaseDeWorker('')` lanza |
| SQL crudo de la semilla | **Aplica** (acotado) | Solo `$queryRaw` en plantilla etiquetada con parámetros; nunca `$queryRawUnsafe` | Cubierto por el unitario de `interpretarDivipola` (nombres con comillas y comas) + el test de integración de la semilla |

## Migration / Rollout

No hay migración de datos: P7 (arranque limpio) y no hay producción. La migración de esquema es la
inicial. La entrega es `auto-chain`, cadena `stacked-to-main`. Las estimaciones cuentan líneas de
autoría (adiciones + borrados). Quedan **excluidos**: `package-lock.json`, el cliente generado, la
`migration.sql` generada (salvo sus ~12 líneas `[manual]`) y `divipola.json`.

| Slice | Contenido | Líneas estimadas | Riesgo de presupuesto | Arranca / termina |
|---|---|---|---|---|
| **S1: Arnés** | D6, D7: plantilla, base por worker, prefijo Redis, helper del CLI, `vitest.config.ts`, tests de aislamiento y unitarios del soporte | ~230 | Bajo | Arranca sobre 00b; termina con `verify` verde y los tests existentes sin cambios, ahora sobre `test_<pool>` |
| **S2: Esquema v1 + migración** | Ajustes D12 en `MODELO_DATOS.md` (~30), `schema.prisma` (~400, 21 tablas + 11 enums), `prisma.config.ts`, SQL `[manual]` (~12), `prisma/README.md` (~40), tests de migración, deriva, invariantes y restricciones (~170), scripts de `package.json`, TSDoc de `PrismaService` | **~660** | **Alto: excepción por naturaleza**, ya prevista en Risks fila 1 de la proposal. Una sola migración inicial no se parte sin cambiar ese acuerdo | Termina con la migración aplicada desde cero, sin deriva, y las guardias en verde |
| **S3: Repositorio de geografía** | Dominio y tipos (~40 + ~50 de tests), puerto (~25), adaptador (~75), módulo y barril (~30), regla 12 + fixture (~35), test de integración del repositorio (~90) | ~345 | Medio | Termina con el test de repositorio contra Postgres real en la base del worker |
| **S4: Semilla DANE** | `interpretarDivipola` (~70 + ~90 de tests), caso de uso (~25 + ~40), doble (~30), script + cli (~55), procedencia + `.gitattributes` + §"Datos de referencia" (~35), test de integración de la semilla (~90), script de `package.json` | ~435 | Medio (roza el presupuesto) | Termina con la semilla idempotente probada y la evidencia de dos corridas reales |
| **S5: Cierre documental** | `MODELO_DATOS.md` v1 aprobada, `CLAUDE.md` §Comandos, skill (§1, §2, §5, §7), notas en ADR-0007/0009 | ~90 | Bajo | Termina con el checklist §12 listo para `sdd-verify` |

Tareas sugeridas para `sdd-tasks` (8, dentro del límite de 10):

- T1 arnés (S1).
- T2 verificación de Prisma: `uuid(7)`, enums y comportamiento de `migrate diff` ante
  `NULLS NOT DISTINCT` (S2).
- T3 esquema + migración + deriva + invariantes (S2).
- T4 restricciones `[manual]` + guardias + `prisma/README.md` (S2).
- T5 dominio + repositorio + regla 12 (S3).
- T6 descarga y procedencia de DIVIPOLA + `interpretarDivipola` (S4).
- T7 caso de uso + script + idempotencia (S4).
- T8 cierre (S5).

Review requerida: **RDD** (sin `judgment-day`).

**Rollback** (sin cambios respecto a la proposal):

- Cada slice se revierte sola, en orden inverso de la cadena.
- Revertir S1 devuelve el contenedor compartido de 00a sin tocar los tests, porque la firma de
  `infraestructura.ts` no cambia.
- Revertir S2 devuelve el esquema mínimo; `PrismaService` y `/health` siguen funcionando (PLT4).
- La base de desarrollo local se limpia con `prisma migrate reset` o borrando el volumen
  `luxeborealcrm_postgres_datos`.

## Open Questions

Ninguna bloquea `sdd-tasks`. Cada una tiene una decisión por defecto ya aplicada en este diseño; se
listan para que el usuario pueda vetarlas al aprobar:

- [ ] **Ajustes a `MODELO_DATOS.md` (D12)**, sobre todo el 5 (sin default para estados de negocio),
  el 6 (acciones `ON DELETE` no especificadas) y el 7 (`CHECK cantidad > 0`). Son cambios al
  esquema del usuario; `CLAUDE.md` pide su visto bueno explícito.
- [ ] **Mayúsculas en los nombres DIVIPOLA (D9)**: se guardan tal como vienen en la fuente. Si el
  dataset los trae en MAYÚSCULAS ("MEDELLÍN"), así quedan en la base y la presentación se resuelve
  en la Fase 02. La alternativa, normalizar a "Medellín" al sembrar, exige reglas de mayúsculas del
  español ("de", "del", "D.C.") que hoy no están en ningún requisito.
- [ ] **Módulo nuevo `modulos/geografia` (D8)**, en lugar de `plataforma/` o `catalogo/`.
- [ ] **Cinco slices en vez de cuatro, con el arnés primero**, y S2 en ~660 líneas como excepción ya
  prevista por la proposal.
- [ ] **A verificar en ejecución, no con el usuario**: el nombre real de los campos del JSON de SODA
  (D9) y si `migrate diff` detecta `NULLS NOT DISTINCT` (D4.5). Los dos tienen su paso de
  verificación y su plan B documentados.
