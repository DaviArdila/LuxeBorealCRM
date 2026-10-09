# Migraciones de Prisma — LuxeBorealCRM

`prisma/schema.prisma` es el esquema; `MODELO_DATOS.md` es el diseño (se decide ahí primero,
`openspec/config.yaml` §design). Este documento es el **cómo** operativo de las migraciones.

## Comandos

| Comando | Qué hace | Cuándo |
|---|---|---|
| `npm run prisma:migrar -- --name <que-cambia>` | `prisma migrate dev --name <que-cambia>`: crea y aplica una migración nueva contra la base de desarrollo (usa una base *shadow* para calcular el diff) | Desarrollo local, cuando cambia el esquema |
| `npm run prisma:aplicar` | `prisma migrate deploy`: aplica las migraciones pendientes sin crear ninguna nueva ni usar base *shadow* | CI, producción (Fase 09), y el `globalSetup` de los tests de integración (`test/soporte/contenedores.global-setup.ts`, sobre la base plantilla) |
| `npm run prisma:generar` | `prisma generate`: regenera el cliente en `src/plataforma/prisma/generado/` | Tras cualquier cambio de `schema.prisma`; corre también en `postinstall` |

## El patrón `[manual]`: restricciones que Prisma no expresa por sí solo

Prisma genera la migración desde el esquema, pero hay tres restricciones de esta fase que Prisma
**no puede declarar**: la cláusula `NULLS NOT DISTINCT` de un índice único, y dos `CHECK` de
`movimiento_inventario` (D4 de `openspec/changes/fase-01-persistencia/design.md`). Se escriben a
mano, directamente en el `migration.sql` generado, siguiendo este patrón:

1. **Generar con `--create-only`, nunca aplicar directo.**

   ```
   npm run prisma:migrar -- --name <que-cambia> --create-only
   ```

   Esto crea el archivo `migration.sql` sin aplicarlo, para poder revisarlo y editarlo antes.

2. **Marcar cada objeto escrito a mano** con un comentario `-- [manual] <nombre> — <motivo>`
   inmediatamente antes de su SQL. Ejemplo real, de la migración inicial
   (`20260925210822_esquema_v1/migration.sql`):

   ```sql
   -- [manual] zona_sin_cobertura_departamento_id_ciudad_id_key — NULLS NOT DISTINCT (D4, PER6/PER9):
   -- dos filas de "todo el departamento" (mismo departamento_id, ciudad_id nulo) MUST tratarse como
   -- duplicadas; sin esta cláusula, Postgres trata NULL <> NULL y el bug de tarifa_envio del
   -- prototipo se repetiría aquí.
   CREATE UNIQUE INDEX "zona_sin_cobertura_departamento_id_ciudad_id_key" ON "zona_sin_cobertura"("departamento_id", "ciudad_id") NULLS NOT DISTINCT;
   ```

   El índice **sí** está declarado en `schema.prisma` con el mismo nombre (`map:`), así que Prisma
   no lo ve como "índice sobrante" y no genera un `DROP INDEX` en una migración futura. Solo la
   cláusula `NULLS NOT DISTINCT` es invisible para Prisma. Los `CHECK` no existen en absoluto para
   el motor de diferencias de Prisma, así que una migración futura nunca los borra por su cuenta —
   pero tampoco los recrea si alguien edita a mano la tabla sin repetir este patrón.

3. **Revisar el SQL generado antes de aplicar.** Toda migración nueva que toque una tabla con un
   objeto `[manual]` MUST revisarse a mano para confirmar que no lo elimina ni lo recrea sin su
   cláusula. Nunca se edita una migración ya fusionada a `main` (skill `luxeboreal-arquitectura`
   §5): si algo quedó mal, se genera una migración nueva que lo corrige.

4. **Por qué la revisión manual es el paso obligatorio, no solo buena práctica**: se comprobó en
   ejecución (Fase 01, T2, Prisma 7.10.0) que
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   termina con código **0** ("No difference detected") aun con las tres restricciones `[manual]`
   ya aplicadas en la base. Es decir, **`migrate diff` no detecta ninguna de las tres** como
   deriva — ni la cláusula `NULLS NOT DISTINCT`, ni los dos `CHECK`. La comparación automática de
   Prisma no es una red de seguridad para estos objetos; la revisión manual del paso 3 y la guardia
   del paso 5 sí lo son.

5. **Guardia en `npm run verify`**: `test/integracion/persistencia/restricciones-manuales.spec.ts`
   lee todas las marcas `-- [manual]` de `prisma/migrations/**` y compara cada nombre con un
   registro de formas esperadas. Consulta `pg_index` para confirmar que el índice único de
   `zona_sin_cobertura` es válido, usa exactamente las dos columnas declaradas y conserva
   `indnullsnotdistinct`; consulta `pg_constraint` para confirmar que cada `CHECK` está validado,
   en la tabla esperada y con la expresión exacta. Una marca desconocida, un objeto ausente o uno
   recreado con otra forma hace fallar la verificación y bloquea `npm run verify` (PER9).

### Objetos `[manual]` vigentes

La guardia del paso 5 (`test/integracion/persistencia/marcas-manuales.ts`) tiene una forma esperada por cada uno.

| Objeto | Tabla | Qué impone | Desde |
|---|---|---|---|
| `zona_sin_cobertura_departamento_id_ciudad_id_key` | `zona_sin_cobertura` | índice único `NULLS NOT DISTINCT` | Fase 01 |
| `movimiento_inventario_cantidad_positiva_check` | `movimiento_inventario` | `cantidad > 0` | Fase 01 |
| `movimiento_inventario_usuario_si_origen_usuario_check` | `movimiento_inventario` | origen `usuario` exige `usuario_id` | Fase 01 |
| `version_estilo_vigente_key` | `version_estilo` | una sola versión vigente | Fase 08c |
| `caso_asistente_evento_requiere_sistema_check` | `caso_asistente` | un caso `evento` exige clave del sistema y modo `literal` | Fase 12 |
| `caso_asistente_sistema_activo_check` | `caso_asistente` | un caso del sistema nunca está inactivo | Fase 12 |
| `contacto_consentimiento_excluyente_check` | `contacto` | `consentimiento_datos_en` y `consentimiento_rechazado_en` nunca tienen valor a la vez (PRV1) | Fase 12d |

### Migraciones de datos escritas a mano

Una migración que solo mueve datos (no crea objetos) lleva un encabezado que lo dice y no usa la marca `-- [manual] <nombre> —`,
porque no deja ningún objeto que la guardia deba buscar en el catálogo. Se prueba con su SQL real contra Postgres.

| Migración | Qué hace | Desde |
|---|---|---|
| `20261009130000_casos_a_intencion` | `contra_entrega`, `mensaje_fuera_cobertura` y `mensaje_captura_completa` pasan a casos de intención (clave y disparador en la misma sentencia por el CHECK `caso_asistente_evento_requiere_sistema_check`), a «Políticas» si existe; idempotente (CAS14, paso 1) | Fase 12d |

## UUID v7: quién genera el id

`id uuid @default(uuid(7))` es un default **del cliente Prisma**, no de la base (D2, confirmado en
ejecución en T2): la columna `id` de cada tabla **no** tiene `DEFAULT` en `migration.sql`. Postgres
16 no tiene `uuidv7()` nativo (llega en Postgres 18). Consecuencia práctica: cualquier `INSERT` en
SQL crudo (como los `$queryRaw` de la semilla DANE, que no aplica porque usa llaves naturales) MUST
traer su propio `id`; solo `PrismaService.<modelo>.create()` lo genera automáticamente.

## Datos de referencia (geografía DANE)

La semilla de `departamento`/`ciudad` (`npm run semilla:geografia`, T4) descarga el archivo oficial
DIVIPOLA y lo guarda en `prisma/datos/divipola.json` con su procedencia documentada en
`prisma/datos/divipola.procedencia.json` (fuente, fecha, SHA-256, conteos). Para actualizar el
archivo cuando el DANE publique un nuevo listado, repetir la descarga documentada ahí y volver a
correr la semilla — es idempotente (PER11), así que no duplica ni sobrescribe filas sin cambios.
