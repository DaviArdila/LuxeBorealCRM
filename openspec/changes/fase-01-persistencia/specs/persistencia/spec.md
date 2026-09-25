# Persistencia Specification

## Purpose

Este es un dominio de capacidad nuevo (no existe `openspec/specs/persistencia/spec.md` previo).
Define el contrato observable del modelo de datos de LuxeBorealCRM y de su ciclo de vida: la
migración inicial se aplica desde cero sin deriva, las llaves siguen ADR-0007, el teléfono nunca es
identidad, las restricciones que Prisma no expresa por sí solo se cumplen y sobreviven a migraciones
futuras, cada worker de pruebas tiene su base aislada, la semilla DANE es idempotente y no carga
datos de negocio, y el repositorio de geografía expone un contrato de solo lectura. Todo el
contenido de esta sección se escribe como `## ADDED Requirements` porque no hay comportamiento
previo del dominio `persistencia` contra el cual escribir un delta; `sdd-archive` lo promueve a
`openspec/specs/persistencia/spec.md`.

**No hay delta de `plataforma`.** El diseño (D11) decidió que la comprobación de deriva de la
migración es un test del proyecto `integracion`, no un paso nuevo de `npm run verify`; PLT7 se queda
en seis comprobaciones sin cambiar su texto.

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo
(`verify-report.md` de la Fase 00b registró que solo el 58 % de los escenarios obtuvo su test con el
nombre literal en el primer intento). Cada test de esta fase MUST nombrarse
`"<id del requisito> — <título del escenario>"`, usando el título exacto de los encabezados
`#### Scenario:` de abajo, sin parafrasear.

## ADDED Requirements

### Requirement: PER1 — Migración inicial aplicada desde cero sin deriva

El sistema MUST proveer una migración inicial de Prisma que se aplique sin errores sobre una base de
datos Postgres 16 vacía, y el esquema resultante MUST coincidir exactamente con
`prisma/schema.prisma`, sin diferencias pendientes.

#### Scenario: Migración aplicada sin errores sobre una base vacía

- Dado un Postgres 16 recién creado, sin tablas y sin la tabla `_prisma_migrations`
- Cuando se ejecuta `prisma migrate deploy` contra esa base
- Entonces el comando termina con código de salida 0
- Y la tabla `_prisma_migrations` registra cada migración como aplicada (`finished_at` no nulo) y
  ninguna como revertida

#### Scenario: Esquema aplicado sin deriva respecto a schema.prisma

- Dado que la migración inicial ya se aplicó sobre una base vacía
- Cuando se ejecuta `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
- Entonces el comando termina con código de salida 0

### Requirement: PER2 — Esquema v1 completo, incluidas las tablas de operación

Conforme a la decisión Q1 de la proposal, el sistema MUST crear en la migración inicial las 21
tablas de `MODELO_DATOS.md` v1 (§3-§8), incluidas las tablas de operación de §6 (`usuario`,
`movimiento_inventario`, `venta`, `venta_item`, `envio`) aunque ninguna fase anterior a la 11 tenga
código que las use todavía. El sistema MUST rechazar un evento entrante duplicado por
`(origen, id_externo)` (ADR-0004).

#### Scenario: Todas las tablas de v1 existen tras la migración inicial

- Dado el esquema v1 aplicado en una base de pruebas
- Cuando se listan las tablas del esquema `public`
- Entonces están presentes las 21 tablas de `MODELO_DATOS.md` §3-§8, incluidas `usuario`,
  `movimiento_inventario`, `venta`, `venta_item` y `envio`

#### Scenario: evento_entrante rechaza un duplicado de origen e id externo

- Dado una fila ya guardada en `evento_entrante` con `origen = "chatwoot"` e `id_externo = "abc"`
- Cuando se intenta insertar otra fila con el mismo `origen` e `id_externo`
- Entonces la base de datos rechaza la segunda inserción por violar la restricción única
  `(origen, id_externo)`

### Requirement: PER3 — Llaves primarias UUID v7 salvo las excepciones documentadas de ADR-0007

El sistema MUST usar `uuid` v7 (generado por el cliente Prisma con `uuid(7)`, `@db.Uuid`) como
llave primaria en toda tabla del esquema v1, salvo las excepciones de llave natural documentadas en
ADR-0007: `departamento.id` y `ciudad.id` (código DANE, `text`), `parametro.clave` (`text`) y
`excepcion_horario.fecha` (`date`). `venta` MUST conservar `id uuid` como llave primaria y exponer
además `numero` como consecutivo legible único, sin que `numero` sea su llave primaria.

#### Scenario: Las tablas sin excepción usan uuid v7 como llave primaria

- Dado el esquema v1 aplicado en una base de pruebas
- Cuando se consulta `information_schema` y `pg_constraint` para cada tabla que no está en la lista
  de excepciones
- Entonces la llave primaria de cada una es una sola columna `id` de tipo `uuid`

#### Scenario: Un id creado por PrismaService trae el nibble de versión 7

- Dado una fila nueva creada a través de `PrismaService` en una tabla con `id uuid` por defecto
- Cuando se lee el `id` generado
- Entonces el nibble de versión del UUID es `7`

#### Scenario: Las excepciones de ADR-0007 conservan su llave natural

- Dado el esquema v1 aplicado
- Cuando se consulta la llave primaria de `departamento`, `ciudad`, `parametro` y
  `excepcion_horario`
- Entonces cada una usa su columna natural (`id` texto DANE, `clave` texto, `fecha` date) en vez de
  un `uuid`

#### Scenario: venta.numero es un consecutivo único que no es la llave primaria

- Dado el esquema v1 aplicado
- Cuando se consulta la llave primaria y las restricciones únicas de `venta`
- Entonces la llave primaria sigue siendo `id uuid`
- Y `numero` tiene una restricción única independiente de la llave primaria

### Requirement: PER4 — El teléfono nunca es la identidad del contacto

El sistema MUST identificar cada `contacto` por su propio `id uuid`, nunca por el teléfono.
`telefono` y `chatwoot_contact_id` MUST ser columnas opcionales, únicas cuando tienen valor, y
MUST NOT formar parte de ninguna llave primaria ni foránea del esquema.

#### Scenario: La llave primaria de contacto es su propio id, no el teléfono

- Dado el esquema v1 aplicado
- Cuando se consulta la llave primaria de `contacto`
- Entonces es la columna `id uuid`, y `telefono` no forma parte de ninguna llave primaria ni foránea
  del esquema

#### Scenario: El teléfono es único cuando está presente

- Dado un contacto ya guardado con `telefono = "573001234567"`
- Cuando se intenta guardar otro contacto con el mismo `telefono`
- Entonces la base de datos rechaza la segunda inserción por violar la unicidad de `telefono`

#### Scenario: Dos contactos sin teléfono conocido pueden coexistir

- Dado un contacto guardado con `telefono` nulo
- Cuando se guarda otro contacto distinto también con `telefono` nulo
- Entonces ambas inserciones se aceptan, porque la unicidad de `telefono` no aplica a los valores
  nulos

### Requirement: PER5 — conversacion.version lista para bloqueo optimista

`conversacion` MUST tener una columna `version` de tipo entero, no nula, con valor por defecto `0`,
para que una fase futura (05) implemente bloqueo optimista sobre las transiciones de estado.

#### Scenario: conversacion.version existe con valor por defecto cero

- Dado el esquema v1 aplicado
- Cuando se inserta una fila en `conversacion` sin especificar `version`
- Entonces la fila queda guardada con `version = 0`

### Requirement: PER6 — Unicidad de zona_sin_cobertura con NULLS NOT DISTINCT

El índice único `(departamento_id, ciudad_id)` de `zona_sin_cobertura` MUST usar
`NULLS NOT DISTINCT`, de modo que dos filas con el mismo `departamento_id` y `ciudad_id` nulo (ambas
significan "todo el departamento") se traten como duplicadas. Esto MUST impedir el bug de
`tarifa_envio` del prototipo (dos tarifas por defecto para el mismo departamento).

#### Scenario: Dos exclusiones de todo el mismo departamento se rechazan

- Dado una fila ya guardada en `zona_sin_cobertura` con `departamento_id = "05"` y `ciudad_id` nulo
- Cuando se intenta guardar otra fila con `departamento_id = "05"` y `ciudad_id` nulo
- Entonces la base de datos rechaza la segunda inserción por violar la unicidad
  `(departamento_id, ciudad_id)`

#### Scenario: Exclusiones de departamentos distintos con ciudad nula coexisten

- Dado una fila guardada en `zona_sin_cobertura` con `departamento_id = "05"` y `ciudad_id` nulo
- Cuando se guarda otra fila con `departamento_id = "08"` y `ciudad_id` nulo
- Entonces ambas inserciones se aceptan

### Requirement: PER7 — movimiento_inventario exige usuario cuando el origen es manual

`movimiento_inventario` MUST rechazar, mediante un `CHECK`, cualquier fila con `origen = 'usuario'`
y `usuario_id` nulo. Una fila con `origen = 'sistema'` MAY dejar `usuario_id` nulo.

#### Scenario: Un movimiento con origen usuario sin usuario_id se rechaza

- Dado los datos de referencia necesarios (`producto`, `usuario`) ya guardados
- Cuando se intenta insertar un `movimiento_inventario` con `origen = 'usuario'` y `usuario_id` nulo
- Entonces la base de datos rechaza la inserción por violar el `CHECK` de origen y usuario

#### Scenario: Un movimiento con origen sistema no exige usuario_id

- Dado los datos de referencia necesarios (`producto`) ya guardados
- Cuando se inserta un `movimiento_inventario` con `origen = 'sistema'` y `usuario_id` nulo
- Entonces la inserción se acepta

### Requirement: PER8 — movimiento_inventario exige cantidad positiva

`movimiento_inventario.cantidad` MUST ser siempre mayor que cero; el signo del movimiento lo
determina `tipo`, no el valor de `cantidad`.

#### Scenario: Un movimiento con cantidad cero o negativa se rechaza

- Dado los datos de referencia necesarios (`producto`) ya guardados
- Cuando se intenta insertar un `movimiento_inventario` con `cantidad = 0` o con un valor negativo
- Entonces la base de datos rechaza la inserción por violar el `CHECK` de cantidad positiva

### Requirement: PER9 — Las restricciones escritas a mano sobreviven a migraciones futuras

Cada restricción de PER6, PER7 y PER8 que Prisma no puede generar por sí solo MUST quedar marcada
con un comentario `-- [manual] <nombre> — <motivo>` inmediatamente antes de su SQL en
`prisma/migrations/**`. El sistema MUST verificar, leyendo todas las marcas `[manual]` del historial
de migraciones y consultando el catálogo de Postgres (`pg_indexes`, `pg_constraint`), que cada
objeto marcado sigue existiendo con su forma esperada, de modo que una migración futura generada
automáticamente que lo elimine o lo recree sin la cláusula correcta se detecte antes de fusionarse.

#### Scenario: El registro de marcas [manual] encuentra cada restricción en el catálogo de Postgres

- Dado el historial de `prisma/migrations/**` con sus marcas `-- [manual]` y el esquema v1 aplicado
- Cuando se ejecuta la verificación de marcas `[manual]`
- Entonces cada objeto marcado (el índice único de `zona_sin_cobertura` con `NULLS NOT DISTINCT` y
  los dos `CHECK` de `movimiento_inventario`) aparece en el catálogo de Postgres con su forma
  esperada

#### Scenario: Una restricción [manual] ausente del catálogo hace fallar la verificación

- Dado el esquema v1 aplicado y una de las restricciones marcadas eliminada del catálogo
  (simulando una migración futura que la borró)
- Cuando se ejecuta la verificación de marcas `[manual]`
- Entonces la verificación falla y reporta el nombre del objeto marcado que no encontró

### Requirement: PER10 — Aislamiento de base de datos por worker de pruebas

Cada worker de Vitest MUST ejecutar sus tests de integración contra una base de datos propia
(`test_<poolId>`), clonada de una base plantilla ya migrada, y MUST recrearla antes de cada archivo
de test. Las filas escritas por un worker MUST NOT ser visibles para otro worker.

#### Scenario: Cada worker de pruebas usa su propia base de datos clonada de la plantilla

- Dado el arnés de pruebas de integración en marcha con más de un worker de Vitest
- Cuando cada worker resuelve `urlPostgresDePrueba()`
- Entonces cada uno apunta a una base `test_<poolId>` distinta, existente y ya migrada

#### Scenario: Las filas escritas por un worker no son visibles para otro worker

- Dado dos workers de Vitest ejecutando tests de integración en paralelo
- Cuando el worker A inserta una fila de geografía en su propia base
- Entonces una consulta contra la base del worker B no encuentra esa fila

### Requirement: PER11 — La semilla DANE es idempotente

Ejecutar el caso de uso de semilla dos veces con el mismo archivo DIVIPOLA MUST dejar exactamente
los mismos `departamento` y `ciudad` en la base, y la segunda ejecución MUST reportar cero filas
insertadas y cero actualizadas.

#### Scenario: Ejecutar la semilla dos veces deja los mismos departamentos y ciudades

- Dado un archivo DIVIPOLA válido y una base con el esquema v1 aplicado
- Cuando se ejecuta la semilla dos veces seguidas con el mismo archivo
- Entonces el conjunto de filas de `departamento` y `ciudad` es idéntico después de ambas corridas

#### Scenario: La segunda ejecución de la semilla no inserta ni actualiza ninguna fila

- Dado que la semilla ya se ejecutó una vez sobre una base vacía
- Cuando se ejecuta la semilla una segunda vez con el mismo archivo
- Entonces el resumen devuelto reporta `insertados = 0` y `actualizados = 0` para `departamento` y
  `ciudad`

### Requirement: PER12 — La semilla no carga datos de negocio y deja su procedencia documentada

La semilla MUST NOT escribir ninguna fila fuera de `departamento` y `ciudad` (P7). El repositorio
MUST incluir un archivo de procedencia legible por máquina con la fuente, la fecha de descarga, el
hash SHA-256 y los conteos de filas, departamentos y ciudades del archivo DIVIPOLA descargado.

#### Scenario: La semilla solo escribe filas en departamento y ciudad

- Dado una base con el esquema v1 recién aplicado, sin datos
- Cuando se ejecuta la semilla con el archivo DIVIPOLA real
- Entonces todas las tablas del esquema salvo `departamento`, `ciudad` y `_prisma_migrations` siguen
  con cero filas

#### Scenario: El archivo de procedencia documenta fuente, fecha, hash y conteos

- Dado el archivo `prisma/datos/divipola.json` descargado en el repositorio
- Cuando se lee `prisma/datos/divipola.procedencia.json`
- Entonces contiene la URL de la fuente, la fecha de descarga, el SHA-256 de `divipola.json` y los
  conteos de filas, departamentos y ciudades
- Y el SHA-256 registrado coincide con el hash real del archivo `divipola.json`

### Requirement: PER13 — Contrato de solo lectura del repositorio de geografía

`RepositorioGeografia` MUST exponer `guardarCatalogo` (upsert por código DANE, sin borrar filas
existentes), `listarDepartamentos` (orden por `id`) y `listarCiudadesDe` (orden por `id`, filtrado
por departamento), devolviendo tipos de dominio (`Departamento`, `Ciudad`), no filas crudas de
Prisma.

#### Scenario: listarDepartamentos devuelve los departamentos ordenados por id

- Dado una base con departamentos ya sembrados
- Cuando se llama a `listarDepartamentos()`
- Entonces la lista devuelta viene ordenada por `id` ascendente y cada elemento es un `Departamento`
  de dominio

#### Scenario: listarCiudadesDe devuelve las ciudades de un departamento ordenadas por id

- Dado una base con ciudades ya sembradas de más de un departamento
- Cuando se llama a `listarCiudadesDe(departamentoId)` con un departamento específico
- Entonces la lista devuelta solo contiene ciudades de ese departamento, ordenadas por `id`
  ascendente

#### Scenario: guardarCatalogo nunca borra un departamento o ciudad existente

- Dado una base con un departamento y una ciudad ya guardados
- Cuando se llama a `guardarCatalogo` con un catálogo que no incluye ese departamento ni esa ciudad
- Entonces el departamento y la ciudad existentes siguen presentes después de la llamada

### Requirement: PER14 — La frontera de PrismaService se cierra para las capas de negocio

Ningún archivo bajo `src/modulos/<módulo>/(aplicacion|puertos|interfaz)/` MUST importar
`src/plataforma/prisma` (directamente o a través de su barril `index.ts`, incluido `PrismaService`).
Solo `<módulo>.module.ts` (raíz de composición del módulo) e `infraestructura/` MUST poder hacerlo.

#### Scenario: Un import de PrismaService desde aplicacion, puertos o interfaz de un módulo falla la verificación de fronteras

- Dado un archivo de prueba (`fixture`) bajo `aplicacion/` de un módulo que importa `PrismaService`
  desde `plataforma/prisma`
- Cuando se ejecuta `npm run fronteras` sobre ese fixture
- Entonces `dependency-cruiser` reporta una violación de la regla 12 y el comando termina con
  código de salida distinto de cero

#### Scenario: El módulo raíz de composición puede importar PrismaModule sin fallar

- Dado `geografia.module.ts` importando `PrismaModule` desde `plataforma/prisma`
- Cuando se ejecuta `npm run fronteras`
- Entonces no se reporta ninguna violación de la regla 12 para ese archivo
