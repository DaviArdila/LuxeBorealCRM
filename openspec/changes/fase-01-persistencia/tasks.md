# Tasks: Fase 01 — Persistencia

Review requerida: **RDD** (01 no es una de las fases 04, 05, 06, 10 de `docs/fases/README.md`; no
requiere `judgment-day`).

Convención de conteo de esta fase (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por
change"): cada **tarea** de este archivo (`T1`…`T5`) es una unidad de trabajo completa que termina
en **un solo commit** y corresponde 1:1 a uno de los cinco slices que `design.md` ya dejó definidos
en su sección "Migration / Rollout" (S1…S5, con línea estimada de autoría cada uno) — el mismo
criterio de mapeo 1 slice = 1 tarea que usó `tasks.md` de la Fase 00b para sus siete slices.

**Desviación registrada frente a la sugerencia de `design.md`**: la propia sección "Migration /
Rollout" de `design.md` sugiere 8 tareas para `sdd-tasks` (partiendo S2 en T2 verificación + T3
esquema/migración + T4 restricciones manuales). Esta versión de `tasks.md` sigue en cambio el mapeo
1:1 explícito pedido para esta sesión (5 tareas, T1-T5), que también cabe dentro del límite de 10.
La verificación de Prisma (`uuid(7)`) y la comprobación de `migrate diff` ante `NULLS NOT DISTINCT`
que `design.md` proponía como tarea aparte quedan dentro de **T2**, con su evidencia de ejecución
registrada en esa tarea.

**Resultado: 5 tareas, dentro del límite de 10.** No hace falta proponer partir la fase.

**Nota de conteo de escenarios (verificada contra `specs/persistencia/spec.md` línea por línea,
2026-09-25)**: la spec de esta fase tiene **30 escenarios** (`#### Scenario:`), no 38. Conteo por
requisito: PER1(2), PER2(2), PER3(4), PER4(3), PER5(1), PER6(2), PER7(2), PER8(1), PER9(2), PER10(2),
PER11(2), PER12(2), PER13(3), PER14(2) = **30**. Este `tasks.md` mapea los 30 escenarios reales; se
deja anotada la discrepancia para que el usuario la confirme al aprobar (no bloquea la tarea: la
cobertura de las 30 está completa y trazable, ver tabla de mapeo abajo).

## Checklist

Estado de avance que lee `gentle-ai sdd-status`. Se marca `[x]` solo con el test de la tarea en
verde y su commit anotado.

- [x] T1 — Arnés: plantilla + base por worker + prefijo de Redis (S1)
- [x] T2 — Esquema v1 + migración inicial + deriva + invariantes + restricciones `[manual]` (S2; commit `e195a4fb244003036d87cf2595f180caa662e27a`)
- [x] T3 — Repositorio de geografía + regla de fronteras 12 (S3; commit `4636f4bc78bdd9bc9699d7815e38be8f5edf137c`)
- [x] T4 — Semilla DANE: descarga, intérprete, caso de uso, idempotencia (S4; commit `ed5adfdce9ed20be2652fbe8e482bc12ce332bcf`)
- [x] T5 — Cierre documental (S5; commit `6b54ead4723eb102a36a32a518c1616a9fbf7621`)

## Mapeo de escenarios por tarea (30 escenarios, 14 requisitos)

| Tarea | Requisitos | # Escenarios |
|---|---|---|
| T1 | PER10 | 2 |
| T2 | PER1, PER2, PER3, PER4, PER5, PER6, PER7, PER8, PER9 | 19 |
| T3 | PER13, PER14 | 5 |
| T4 | PER11, PER12 | 4 |
| T5 | — (cierre documental, sin escenario nuevo) | 0 |
| **Total** | **14** | **30** |

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1760 líneas de autoría (230+660+345+435+90, `design.md` §"Migration / Rollout"; `package-lock.json`, el cliente Prisma generado, la `migration.sql` generada (salvo sus ~12 líneas `[manual]`) y `divipola.json` excluidos por ser generados o insumo) |
| 400-line budget risk | **Alto en T2** (~660 líneas estimadas, ~1.65× el presupuesto — excepción por naturaleza ya prevista en `proposal.md` Risks fila 1 y en `design.md`: una sola migración inicial con 21 tablas no se parte sin cambiar ese acuerdo). **Medio en T4** (~435, roza el presupuesto). Bajo en T1, T3, T5 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 (5 slices, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Alto (T2)

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede con
el primer slice (T1) sin pedir confirmación adicional. **Excepción anticipada para T2**: si el diff
real de T2 confirma el estimado de ~660 líneas (o lo supera, como ocurrió en 00b con desviaciones de
hasta 3.5× sobre el estimado), `sdd-apply` MUST pedir `size:exception` al usuario antes de continuar
con T3, siguiendo el mismo patrón que T1/T2 de la Fase 00b. No se recorta el esquema, sus tests ni su
documentación para acercarse al presupuesto.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1: plantilla migrada una vez + clon por worker + prefijo de Redis (D6, D7) | PR1 | `npm test -- bases-de-prueba aislamiento` | `npm run verify` completo (mide que sigue < 3 min con el arnés nuevo, PLT7); tests existentes de 00a/00b corren sobre `test_<pool>` sin cambiar su código | Revertir `test/soporte/base-por-worker.setup.ts`, `test/soporte/bases-de-prueba.ts`, `test/soporte/prisma-cli.ts`, `test/soporte/bases-de-prueba.spec.ts`, `test/integracion/persistencia/aislamiento.spec.ts`; revertir los cambios de `test/soporte/contenedores.global-setup.ts`, `test/soporte/infraestructura.ts` y `vitest.config.ts` devuelve el contenedor compartido de 00a, porque la firma pública no cambió |
| 2 | T2: esquema v1 completo + migración inicial + 3 restricciones `[manual]` + guardias + `MODELO_DATOS.md` v1 con ajustes D12 | PR2 | `npm test -- persistencia` (migración, invariantes, restricciones manuales) | `prisma migrate dev` real contra la base plantilla (salida completa anotada) + `prisma migrate diff --exit-code` real (checkpoint de D4.5) | Revertir `prisma/schema.prisma` al esquema mínimo de 00a, borrar `prisma/migrations/`; `PrismaService` y `/health` siguen funcionando (PLT4, solo usa `$queryRaw`); revertir el ajuste de `MODELO_DATOS.md` |
| 3 | T3: módulo `geografia` (dominio, puerto, adaptador, módulo) + regla 12 de fronteras | PR3 | `npm test -- geografia fronteras` | `npm run test:integracion -- repositorio-geografia` contra Postgres real, en la base del worker | Revertir `src/modulos/geografia/{dominio,puertos,infraestructura}/**`, `geografia.module.ts`, `index.ts`, la regla 12 de `.dependency-cruiser.cjs` y su fixture; `AppModule` nunca importó el módulo, así que nada más se ve afectado |
| 4 | T4: descarga DIVIPOLA + `interpretarDivipola` + `SembrarGeografia` + script de semilla + idempotencia | PR4 | `npm test -- interpretar-divipola sembrar-geografia semilla` | `npm run semilla:geografia` real, corrida **dos veces** contra la base de desarrollo (salida completa de ambas corridas anotada) | Revertir `src/modulos/geografia/{dominio/interpretar-divipola.ts,aplicacion}/**`, `test/fakes/repositorio-geografia-en-memoria.ts`, `scripts/sembrar-geografia.ts`, el despacho nuevo en `scripts/cli.ts`, `prisma/datos/divipola.json`, `prisma/datos/divipola.procedencia.json`, `.gitattributes`; la semilla es un comando explícito, no correrla no rompe nada |
| 5 | T5: `MODELO_DATOS.md` → v1 aprobada, `CLAUDE.md` §Comandos, skill `luxeboreal-arquitectura`, notas de implementación en ADR-0007/0009 | PR5 | `npm run verify` completo en verde (checklist §12 de la skill) | Ninguno nuevo; revalida los cuatro comandos documentados (`prisma:migrar`, `prisma:aplicar`, `semilla:geografia`) contra el estado real del repo | Revertir el cambio de estado de `MODELO_DATOS.md`, las secciones nuevas de `CLAUDE.md` y de la skill, y las notas de los ADR; no toca código de producción |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` en orden
antes de abrir el siguiente — mismo orden que "Migration / Rollout" de `design.md`, arnés primero):

```
PR1 (arnés) → PR2 (esquema + migración) → PR3 (repositorio de geografía)
   → PR4 (semilla DANE) → PR5 (cierre documental)
```

## Matriz de amenazas aplicable a esta fase

Reproducida sin cambios desde la tabla `Threat Matrix` de `design.md` (regla del skill: las filas
`Aplica` pasan a `tasks.md` sin cambios). Las filas `N/A` de `design.md` (rutas HTTP, git, commits,
push, PR) no aplican a esta fase y se omiten aquí.

| Frontera | Aplica | Respuesta de diseño | Tests RED previstos | Dónde se cubre |
|---|---|---|---|---|
| **Subproceso (CLI de Prisma)**, extra propio de esta fase | **Aplica** | `execFile` sin shell; binario = `process.execPath` + ruta absoluta del CLI; argumentos en arreglo fijo; solo se sobrescribe `DATABASE_URL`. Los nombres de base se arman con constantes y un `poolId` que MUST cumplir `^\d+$`; si no, lanza **antes** de ejecutar SQL. Si el CLI sale con código ≠ 0, el `globalSetup` falla con el código y la salida de error | `nombreBaseDeWorker('1; DROP DATABASE x')` lanza; `nombreBaseDeWorker('')` lanza | T1 (`test/soporte/bases-de-prueba.spec.ts`), reutilizado sin volver a probarse en T2 (test de deriva, mismo helper) |
| SQL crudo de la semilla | **Aplica** (acotado) | Solo `$queryRaw` en plantilla etiquetada con parámetros; nunca `$queryRawUnsafe` | Cubierto por el unitario de `interpretarDivipola` (nombres con comillas y comas, p. ej. "Bogotá, D.C.") + el test de integración de la semilla | T4 |

---

## T1 — Arnés: plantilla + base por worker + prefijo de Redis

**Objetivo**: construir el arnés de pruebas aislado que ADR-0009 prometió (D6, D7 de `design.md`):
el `globalSetup` migra una base plantilla una sola vez; cada archivo de test recrea su propia base
`test_<poolId>` clonándola; se agrega el prefijo de Redis por worker. La firma pública de
`test/soporte/infraestructura.ts` MUST conservarse (`urlPostgresDePrueba()`, `urlRedisDePrueba()`).

**Dependencias**: ninguna (primera tarea de la fase; parte del estado que dejaron 00a/00b cerradas).
Funciona con **cero migraciones** todavía (D6: el `globalSetup` omite `migrate deploy` si
`prisma/migrations/` está vacío).

**Archivos/áreas** (design D6, D7):
- `test/soporte/contenedores.global-setup.ts` (Modify) — crea `plantilla_luxe` desde `template0` y
  la migra una vez (o la deja sin migrar si aún no hay migraciones).
- `test/soporte/base-por-worker.setup.ts` (Create) — `setupFiles` nuevo: `beforeAll` hace
  `DROP DATABASE IF EXISTS test_<poolId> WITH (FORCE)` + `CREATE DATABASE test_<poolId> TEMPLATE plantilla_luxe`,
  con reintento hasta 5 veces ante SQLSTATE `55006`.
- `test/soporte/bases-de-prueba.ts` (Create) — funciones puras: `nombreBaseDeWorker(poolId)`
  (valida entero), `urlConBase(urlAdmin, nombre)`, `NOMBRE_PLANTILLA`.
- `test/soporte/prisma-cli.ts` (Create) — `ejecutarPrismaCli(argumentos, urlBase)` (D7): `execFile`
  sin shell, `process.execPath` + ruta absoluta del CLI de Prisma.
- `test/soporte/infraestructura.ts` (Modify) — `urlPostgresDePrueba()` pasa a devolver la URL de la
  base del worker; `prefijoRedisDePrueba(): string` nuevo (`test:<poolId>:`); TSDoc actualizado.
- `test/soporte/bases-de-prueba.spec.ts` (Create) — unitario.
- `test/integracion/persistencia/aislamiento.spec.ts` (Create) — PER10.
- `vitest.config.ts` (Modify) — `setupFiles` nuevo en proyectos `integracion`/`e2e`,
  `hookTimeout: 60_000` (L3 de 00b); proyecto `unit` incluye `test/soporte/**/*.spec.ts`.
- `package.json` (Modify) — devDependencies `pg`, `@types/pg` (explícitas; ya eran transitivas de
  `@prisma/adapter-pg`).

**Escenarios cubiertos** (`specs/persistencia/spec.md`):
- `PER10 — Cada worker de pruebas usa su propia base de datos clonada de la plantilla`
- `PER10 — Las filas escritas por un worker no son visibles para otro worker`

**RED → GREEN → REFACTOR**:

1. RED: `test/soporte/bases-de-prueba.spec.ts` — `nombreBaseDeWorker` rechaza un `poolId` no entero
   y uno vacío (matriz de amenazas); `urlConBase` cambia solo la ruta de la URL de administración.
   Correr `npm test -- bases-de-prueba` y observar fallo (el módulo no existe).
2. RED: `test/integracion/persistencia/aislamiento.spec.ts` — los dos escenarios de PER10: cada
   worker resuelve `urlPostgresDePrueba()` a una base `test_<poolId>` distinta ya migrada; una fila
   insertada por el worker A no es visible desde la base del worker B. Correr
   `npm run test:integracion -- aislamiento` y observar fallo (`urlPostgresDePrueba()` sigue
   apuntando al contenedor compartido de 00a).
3. GREEN: implementar `bases-de-prueba.ts`, `prisma-cli.ts`, `base-por-worker.setup.ts`; modificar
   `contenedores.global-setup.ts` e `infraestructura.ts`; agregar `setupFiles`/`hookTimeout` a
   `vitest.config.ts`, hasta que los dos specs pasen.
4. REFACTOR: confirmar que `test/soporte/infraestructura.ts` no cambió su firma pública exportada
   (comparación textual contra el TSDoc existente, que promete estabilidad); medir la duración real
   de `npm run verify` con el arnés nuevo.

**Checkpoints `[sin verificar]` de esta tarea**: ninguno propio; el helper de CLI (`prisma-cli.ts`)
queda construido pero sin ejercitarse contra una migración real todavía (eso ocurre en T2).

**Hecho cuando**:
- Los dos escenarios de PER10 pasan, con el título exacto del escenario (`"PER10 — <título>"`) como
  nombre del test — es criterio de aceptación, no detalle de estilo (lección de `verify-report.md`
  de la Fase 00b: solo 58% de los escenarios tuvieron su test con el nombre literal en el primer
  intento).
- `test/soporte/infraestructura.ts` conserva `urlPostgresDePrueba()` y `urlRedisDePrueba()` con la
  misma firma; `prefijoRedisDePrueba()` es un export nuevo, no un cambio de firma existente.
- Los tests existentes de 00a/00b (unit, integración, e2e) siguen en verde, ahora corriendo contra
  `test_<poolId>` en vez del contenedor compartido.
- `npm run verify` sigue en verde y por debajo de 3 minutos (PLT7); la duración real queda anotada
  aquí tras aplicar la tarea.

**Evidencia real (máquina de desarrollo, 2026-09-25, Docker arriba)**:

- `npm test -- bases-de-prueba` (RED, módulo inexistente):
  ```
  FAIL  |unit| test/soporte/bases-de-prueba.spec.ts [ test/soporte/bases-de-prueba.spec.ts ]
  Error: Cannot find module './bases-de-prueba.js' imported from
  .../test/soporte/bases-de-prueba.spec.ts
  Test Files  1 failed (1)
       Tests  no tests
  ```
  GREEN tras implementar `bases-de-prueba.ts`:
  ```
  Test Files  1 passed (1)
       Tests  6 passed (6)
  ```
- `npm run test:integracion -- aislamiento` (RED, `setupFiles` inexistente):
  ```
  FAIL  |integracion| test/integracion/persistencia/aislamiento.spec.ts
  Error: Cannot find module '.../test/soporte/base-por-worker.setup.ts'
  Test Files  1 failed (1)
       Tests  no tests
  ```
  GREEN tras implementar `prisma-cli.ts`, `base-por-worker.setup.ts` y modificar
  `contenedores.global-setup.ts`/`infraestructura.ts`/`vitest.config.ts`:
  ```
  ✓ |integracion| .../aislamiento.spec.ts > Aislamiento de bases de prueba por worker (T1, integración)
    > PER10 — Cada worker de pruebas usa su propia base de datos clonada de la plantilla 21ms
  ✓ |integracion| .../aislamiento.spec.ts > Aislamiento de bases de prueba por worker (T1, integración)
    > PER10 — Las filas escritas por un worker no son visibles para otro worker 325ms
  Test Files  1 passed (1)
       Tests  2 passed (2)
  ```
  Los títulos de `it(...)` son los literales exactos de los encabezados `#### Scenario:` de
  `specs/persistencia/spec.md` (PER10), confirmados con `--reporter=verbose`.
- `npm run verify` completo (`prisma:generar` → `lint` → `typecheck` → `fronteras` →
  `contrato:deriva` → `vitest run --project unit --project integracion`): **verde, 39 archivos de
  test / 163 tests pasados**, corridos dos veces para confirmar estabilidad — **~40 s** la primera
  corrida (incluye `prisma:generar` con red fría de módulos) y **~35 s** la segunda, ambas muy por
  debajo del presupuesto de 3 min (PLT7). Los tests de 00a/00b (`infraestructura.spec.ts`,
  `salud.spec.ts`, `configuracion.spec.ts`, `test/e2e/aplicacion.e2e-spec.ts`, etc.) siguen en verde
  sin cambiar su código, ahora contra `test_<poolId>` — confirmado leyendo `current_database()`
  dentro del propio test de aislamiento.
- `npm run test:e2e` por separado: verde, 1 archivo / 8 tests, ~8.7 s.
- `npm run test:cobertura`: verde, 39/163 tests, cobertura de líneas **89.73%** (umbral 80% de
  `vitest.config.ts`/`openspec/config.yaml`, sin cambios de este archivo en esta tarea) — no baja
  respecto al 88.03% que dejó 00b.
- `npm run lint`, `npm run typecheck`, `npm run fronteras`: verdes, sin violaciones (`fronteras`:
  "no dependency violations found (95 modules, 189 dependencies cruised)").

**Desviación registrada**: el comando exacto de la tabla "Suggested Work Units" de `tasks.md`
(`npm test -- bases-de-prueba aislamiento`) solo ejecuta el proyecto `unit` (script `test` =
`vitest run --project unit`); como `aislamiento.spec.ts` vive en `test/integracion/`, ese segundo
filtro no selecciona ningún archivo bajo `unit` y el comando termina corriendo solo
`bases-de-prueba.spec.ts`. No es un fallo: los dos escenarios de `aislamiento.spec.ts` sí se
verificaron, con el comando correcto para el proyecto `integracion`
(`npm run test:integracion -- aislamiento`), documentado arriba.

**Nota de presupuesto de revisión (Section E del protocolo SDD)**: el diff real de esta tarea es
**365 líneas de autoría** (`git diff --cached --numstat`, excluyendo `package-lock.json`: 350
adiciones + 15 borrados), frente a la estimación de ~230 de `design.md`. La diferencia (+135) es
honesta: la matriz de amenazas exige que `nombreBaseDeWorker` valide **antes** de ejecutar SQL, lo
que añadió su propio test unitario con tres casos (válido, SQL inyectado, vacío) más un cuarto caso
de `urlConBase` que no estaba en el diseño explícito (conservar query string). Sigue **dentro** del
presupuesto de ~400 líneas; no hace falta pedir `size:exception` para este PR1.

**commit:** `c69f12fef6e50416432566b2769d82ef5fa3b365` — `feat(persistencia): construir arnes de pruebas con base por worker`

---

## T2 — Esquema v1 + migración inicial + deriva + invariantes + restricciones `[manual]`

**Objetivo**: convertir `MODELO_DATOS.md` v1 en el esquema real de Prisma (21 tablas, 11 enums),
generar la migración inicial, escribir a mano las tres restricciones que Prisma no expresa por sí
solo (D4), y probar que la migración se aplica desde cero sin deriva y que las restricciones
sobreviven a migraciones futuras (PER9). Es la tarea más grande de la fase por naturaleza: una sola
migración inicial no se parte sin cambiar ese acuerdo (`proposal.md` Risks fila 1).

**Dependencias**: T1 (el arnés con base por worker ya existe; el `globalSetup` de T1 ya sabe migrar
`plantilla_luxe` cuando `prisma/migrations/` deja de estar vacío).

**Checkpoints de esta tarea** (design.md D2, D4.5) — resultados reales de ejecución registrados
abajo:

1. **`uuid(7)` en Prisma 7.10.0**: `design.md` D2 lo verificó de forma **estática** (leyendo
   `node_modules/prisma/package.json` y el runtime del cliente generado), pero no lo ejecutó. Esta
   tarea MUST confirmarlo en ejecución: `prisma validate` acepta `@default(uuid(7)) @db.Uuid`; la
   migración generada no trae `DEFAULT` en la columna `id`; un `create` real por `PrismaService`
   devuelve un `id` con el nibble de versión `7`. Si `prisma validate` fallara, se aplica el plan B
   ya decidido en ADR-0007 (generación del id en la aplicación) sin ADR nuevo, y se corrige este
   diseño antes de seguir.
2. **`prisma migrate diff --exit-code` ante `NULLS NOT DISTINCT`**: `design.md` D4.5 no sabe si
   Prisma 7.10 detecta como deriva la cláusula `NULLS NOT DISTINCT` escrita a mano en el índice
   único de `zona_sin_cobertura` (invisible para el motor de diferencias de Prisma, según el mismo
   diseño). Esta tarea MUST correr `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   tras aplicar la migración editada y anotar el código de salida real. Si el código es 2 (detecta
   diferencia), la revisión con `--create-only` (D4 punto 3) pasa de buena práctica a paso
   obligatorio, documentado en `prisma/README.md`, y la guardia de PER9 (registro de marcas
   `[manual]`) queda como la red de seguridad. Si el código es 0, se documenta igual, sin cambiar el
   proceso de migraciones futuras.

**Archivos/áreas** (design D1-D5, D10 no aplica aún — llega en T3):
- `MODELO_DATOS.md` (Modify) — **primer commit de esta tarea**: los 8 ajustes de D12 (generación de
  ids por el cliente, `timestamptz(3)`, `conversacion.version` default 0, `uso_llm.costo_estimado_usd`
  `decimal(12,6)`, defaults técnicos sin default para estados de negocio, `ON DELETE` por FK,
  `CHECK (cantidad > 0)`, `evento_entrante.origen`/`outbox.tipo` como `text`). Se escriben aquí
  **antes** que en `schema.prisma` (`openspec/config.yaml` §design).
- `prisma/schema.prisma` (Modify) — esquema v1 completo por secciones de `MODELO_DATOS.md` (D1).
- `prisma/migrations/<ts>_esquema_v1/migration.sql` (Create) — generada por Prisma + 3 bloques
  marcados `-- [manual] <nombre> — <motivo>` (D4): único de `zona_sin_cobertura` con
  `NULLS NOT DISTINCT`, `CHECK` de `movimiento_inventario.usuario_id`, `CHECK` de
  `movimiento_inventario.cantidad > 0`.
- `prisma/migrations/migration_lock.toml` (Create) — generado por Prisma.
- `prisma.config.ts` (Modify) — `migrations: { path: 'prisma/migrations' }` explícito; sin `seed`.
- `prisma/README.md` (Create) — cómo migrar, marcas `[manual]`, `--create-only`, guardias (D4).
- `test/integracion/persistencia/migracion.spec.ts` (Create) — PER1.
- `test/integracion/persistencia/invariantes-esquema.spec.ts` (Create) — PER2, PER3, PER4, PER5.
- `test/integracion/persistencia/restricciones-manuales.spec.ts` (Create) — PER6, PER7, PER8, PER9.
- `src/plataforma/prisma/prisma.service.ts` (Modify) — solo TSDoc (D5, "sin modelos" → lista real).
- `package.json` (Modify) — `prisma:migrar` = `prisma migrate dev`, `prisma:aplicar` =
  `prisma migrate deploy`.

**Escenarios cubiertos** (`specs/persistencia/spec.md`, 19 escenarios — el título exacto de cada uno
es parte de "Hecho cuando", no un detalle de estilo, por la lección de `verify-report.md` de 00b):
- `PER1 — Migración aplicada sin errores sobre una base vacía`
- `PER1 — Esquema aplicado sin deriva respecto a schema.prisma`
- `PER2 — Todas las tablas de v1 existen tras la migración inicial`
- `PER2 — evento_entrante rechaza un duplicado de origen e id externo`
- `PER3 — Las tablas sin excepción usan uuid v7 como llave primaria`
- `PER3 — Un id creado por PrismaService trae el nibble de versión 7`
- `PER3 — Las excepciones de ADR-0007 conservan su llave natural`
- `PER3 — venta.numero es un consecutivo único que no es la llave primaria`
- `PER4 — La llave primaria de contacto es su propio id, no el teléfono`
- `PER4 — El teléfono es único cuando está presente`
- `PER4 — Dos contactos sin teléfono conocido pueden coexistir`
- `PER5 — conversacion.version existe con valor por defecto cero`
- `PER6 — Dos exclusiones de todo el mismo departamento se rechazan`
- `PER6 — Exclusiones de departamentos distintos con ciudad nula coexisten`
- `PER7 — Un movimiento con origen usuario sin usuario_id se rechaza`
- `PER7 — Un movimiento con origen sistema no exige usuario_id`
- `PER8 — Un movimiento con cantidad cero o negativa se rechaza`
- `PER9 — El registro de marcas [manual] encuentra cada restricción en el catálogo de Postgres`
- `PER9 — Una restricción [manual] ausente del catálogo hace fallar la verificación`

**RED → GREEN → REFACTOR**:

1. **Esquema/migración ya presentes al retomar**: `schema.prisma`, la migración inicial y el primer
   test PER1 estaban en el worktree. No se dispone de la salida RED del trabajo interrumpido y no se
   inventa. Esta continuación no reescribió el esquema: creó primero los tests de aceptación y
   confirmó luego los 19 escenarios y los checkpoints contra Postgres real. El ciclo histórico
   RED→GREEN de esos archivos heredados queda **no evidenciado**.
2. **RED de la nueva guardia PER9**: el primer run de `restricciones-manuales.spec.ts` detectó que
   la regex de marcas era inválida. Tras corregirla, el test de mutación detectó que un `CHECK` con
   el mismo nombre pero con `cantidad >= 0` se aceptaba como correcto (`expected true to be false`).
3. **GREEN**: se registraron explícitamente las tres formas `[manual]`; la guardia compara tabla,
   columnas, unicidad y `NULLS NOT DISTINCT` del índice, y tabla/expresión validada de cada `CHECK`.
   Los 8 tests de restricciones pasaron. Los 10 tests de invariantes también pasaron.
4. **REFACTOR**: se documentó el registro en `prisma/README.md`, se añadió el test runtime de
   `migrate dev`/ausencia de defaults y se ajustaron los workers de Vitest tras medir contención en
   `npm run verify` (detalle abajo). Se reejecutaron los tests afectados después de cada cambio.

**Evidencia real (máquina local con Docker, 2026-09-25)**:

- `npm exec -- prisma validate`: código **0**; salida: `The schema at prisma\schema.prisma is valid`.
- `npm run prisma:generar`: código **0**; cliente Prisma **7.10.0** generado en
  `src/plataforma/prisma/generado/`.
- RED de PER9 antes de corregir la guardia: `npm run test:integracion -- restricciones-manuales`
  terminó con **1 fallo / 7 aprobados**; el test de condición alterada recibió `ok: true`. GREEN:
  mismo comando terminó con **1 archivo / 8 tests aprobados**.
- `npm run test:integracion -- persistencia`: código **0**, **4 archivos / 23 tests aprobados**
  (21 de T2 y los 2 escenarios PER10 de T1).
- `npm test -- bases-de-prueba`: código **0**, **1 archivo / 6 tests aprobados**; incluye los casos
  de la matriz de amenazas `poolId = '1; DROP DATABASE x'` y vacío (reutilizados de T1).
- Ejecución runtime con salida habilitada:
  `$env:LUXE_T2_EVIDENCIA_RUNTIME = '1'; npm run test:integracion -- migracion` → código **0**,
  **1 archivo / 3 tests aprobados**. Los subprocesos de Prisma usaron bases temporales Testcontainers
  creadas desde `template0` y se eliminaron al terminar:

  ```text
  [T2] prisma migrate deploy sobre una base vacía (código 0)
  Datasource "db": PostgreSQL database "test_migracion_3dbbd986e45d4bc6b956c2c0198b504a", schema "public" at "localhost:32880"

  1 migration found in prisma/migrations

  Applying migration `20260925210822_esquema_v1`

  The following migration(s) have been applied:

  migrations/
    └─ 20260925210822_esquema_v1/
      └─ migration.sql

  All migrations have been successfully applied.
  Loaded Prisma config from prisma.config.ts.

  Prisma schema loaded from prisma\schema.prisma.

  [T2] prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code (código 0)
  No difference detected.

  Loaded Prisma config from prisma.config.ts.

  [T2] prisma migrate dev --name verificar_esquema_v1 sobre una base vacía (código 0)
  Datasource "db": PostgreSQL database "test_dev_7393b4e7a7a24fe497824fcd74d5fd18", schema "public" at "localhost:32880"

  Applying migration `20260925210822_esquema_v1`

  The following migration(s) have been applied:

  migrations/
    └─ 20260925210822_esquema_v1/
      └─ migration.sql

  Your database is now in sync with your schema.
  Loaded Prisma config from prisma.config.ts.

  Prisma schema loaded from prisma\schema.prisma.
  ```

- El test runtime comprobó **17 columnas PK UUID y 0 defaults SQL**, que las migraciones quedaron
  finalizadas/no revertidas y que un `create()` de `PrismaService` produjo un UUID con nibble `7`.
  El diff real dio código **0** aun con las tres restricciones `[manual]`, así que `migrate diff` no
  las detecta; la guardia PER9 es necesaria.
- `npm run verify`: código **0**, **42 archivos / 184 tests aprobados**, duración **45,98 s**. Incluye
  generación, lint, typecheck, fronteras (95 módulos / 189 dependencias), deriva de ambos contratos y
  los proyectos unitario + integración. `npm run test:e2e`: código **0**, **1 archivo / 8 tests
  aprobados**, duración **11,63 s**.
- **Desviación acotada respecto de D6**: el primer `npm run verify` real de T2 superó 150 s y
  registró timeouts por contención entre tareas que lanzan Docker/Git/Prisma. D6 preveía aplicar
  `maxWorkers: 4` solo al proyecto `integracion`; el cambio aplicado también limitó `unit` a 4, por
  lo que su alcance fue más amplio que el diseño aprobado. La primera configuración por proyecto
  también fue inválida al conservar el mismo `sequence.groupOrder`; se corrigió usando grupos
  distintos (0/1), como requiere Vitest cuando difieren esos límites. Con `maxWorkers: 4` en `unit`
  e `integracion`, el `npm run verify` final del primer apply terminó en código 0: 42 archivos / 184
  tests, 45,98 s (menos de 3 min). Se registra el comportamiento ya aplicado; esta nota no modifica
  el ajuste ni amplía T2.

**Límite de evidencia heredada**: `schema.prisma`, la migración y PER1 ya estaban en el worktree al
retomar; no se dispone de la evidencia histórica RED que pruebe el orden test-first. Los resultados
GREEN y de runtime conservados aquí son del primer apply y no sustituyen ese RED. La guardia PER9 sí
tiene RED/GREEN observado en el primer apply.

**Work Unit Evidence (primer apply, 2026-09-25; no reejecutado en esta corrección)**:

| Evidencia | Resultado |
|---|---|
| Test enfocado | `npm run test:integracion -- persistencia` — código 0; 4 archivos / 23 tests aprobados. |
| Arnés runtime | `npm run test:integracion -- migracion` — código 0; 1 archivo / 3 tests aprobados; `migrate deploy`, `migrate diff --exit-code` y `migrate dev` reales contra bases temporales Postgres 16. |
| Rollback boundary | Revertir `MODELO_DATOS.md`, `package.json`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/`, `prisma/README.md`, `src/plataforma/prisma/prisma.service.ts`, y exactamente estos cuatro archivos T2: `test/integracion/persistencia/migracion.spec.ts`, `test/integracion/persistencia/invariantes-esquema.spec.ts`, `test/integracion/persistencia/restricciones-manuales.spec.ts` y `test/integracion/persistencia/marcas-manuales.ts`; revertir también el ajuste T2 de `vitest.config.ts`. Se excluye expresamente `test/integracion/persistencia/aislamiento.spec.ts` (T1). No hay datos de negocio ni dependencias de T3. |

**Commit de unidad de trabajo**: `e195a4fb244003036d87cf2595f180caa662e27a` — `feat(persistencia): agregar esquema v1 y guardias de migración`.

**Review workload real**: 1,730 líneas de autoría (adiciones + borrados), excluyendo el SQL de migración generado salvo 11 líneas `[manual]` y el cliente Prisma generado. T2 es PR2 de la cadena `stacked-to-main`; el siguiente slice es T3 y requiere que el usuario resuelva `size:exception` antes de aplicarlo.

**Decisión del usuario (2026-09-25)**: `size:exception` aceptado para T2 (1,730 líneas de autoría frente al presupuesto de ~400). El exceso viene de una sola migración inicial con 21 tablas/11 enums que `proposal.md` (Risks fila 1) y `design.md` ya anticipaban como no partible sin cambiar ese acuerdo; no se pidió partir T2. `sdd-apply` continúa con T3.

**TDD Cycle Evidence** (Strict TDD activo por `openspec/config.yaml`):

| Tarea/parte | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Esquema/migración/PER1 heredados | `test/integracion/persistencia/migracion.spec.ts` | Integración | PER1 2/2 estaba verde al retomar; no consta una corrida baseline en esta continuación | **FAILED / no disponible** — no se conserva una salida ni observación que demuestre el fallo del test antes de la implementación heredada; no se reconstruye | En el primer apply, los 19 escenarios PER1-PER9 y los checkpoints reales de Prisma/PostgreSQL quedaron verdes; evidencia funcional que no sustituye RED | Los 19 escenarios están cubiertos actualmente; no hay evidencia de triangulación test-first para el cambio heredado | No se reescribió el esquema/migración heredados |
| Guardia `[manual]` PER9 | `test/integracion/persistencia/restricciones-manuales.spec.ts` | Integración | Helper parcial inspeccionado | Observado en el primer apply: la ejecución inicial detectó una regex inválida; después, la mutación de un `CHECK` con el mismo nombre y `cantidad >= 0` fue aceptada (`expected true to be false`) | Tras corregir la guardia: `npm run test:integracion -- restricciones-manuales` — 1 archivo / 8 tests aprobados (primer apply) | Inserciones inválidas, valor válido, objeto ausente y definición alterada | La consulta de catálogo verifica la forma, no solo el nombre; los 8 tests quedaron verdes |

**Estado del gate Strict TDD**: T2 conserva `[x]` por su finalización funcional y el commit anotado,
pero el ciclo de esquema/migración/PER1 queda **FAILED / no acreditado** por falta de evidencia RED
histórica. Los resultados GREEN/runtime de arriba corresponden al primer apply; en esta corrección
no se ejecutaron tests, `verify` ni runtime. El apply global no se declara gate-passing ni completo.

**Hecho cuando**:
- Los 19 escenarios listados pasan, cada uno con el título exacto de su encabezado `#### Scenario:`
  como nombre del test.
- Ambos checkpoints quedan resueltos y su resultado real anotado en esta sección
  (código de salida de `prisma validate`, del `create` con nibble de versión 7, y del
  `migrate diff --exit-code`).
- `prisma migrate deploy` real contra una base vacía termina con código 0 y su salida completa queda
  anotada aquí (evidencia real, L2 de 00b).
- `MODELO_DATOS.md` refleja los 8 ajustes de D12 y coincide con `schema.prisma`.
- `npm run verify` sigue en verde y por debajo de 3 minutos; la duración real queda anotada.

---

## T3 — Repositorio de geografía + regla de fronteras 12

**Objetivo**: construir el módulo nuevo `modulos/geografia` (dominio, puerto, adaptador Prisma,
módulo) con el primer repositorio real de la fase, de solo lectura más `guardarCatalogo`, y cerrar
el hueco de fronteras que D10 encontró (la regla 4 de dependency-cruiser no prohíbe importar el
barril `plataforma/prisma/index.ts`, que expone `PrismaService` completo).

**Dependencias**: T2 (el esquema v1 ya tiene `departamento` y `ciudad`; `PrismaService` ya expone
esos modelos).

**Archivos/áreas** (design D8, D10):
- `src/modulos/geografia/dominio/geografia.ts` (+ `.spec.ts`) (Create) — `Departamento`, `Ciudad`,
  `CatalogoGeografico`, `FuenteDivipolaInvalida`; reglas de código DANE.
- `src/modulos/geografia/puertos/repositorio-geografia.ts` (Create) — interfaz `RepositorioGeografia`
  + token `REPOSITORIO_GEOGRAFIA`; tipos `ConteoGuardado`, `ResumenGuardado`.
- `src/modulos/geografia/infraestructura/repositorio-geografia-prisma.ts` (Create) — adaptador.
- `src/modulos/geografia/geografia.module.ts`, `index.ts` (Create) — módulo y barril (el caso de uso
  de semilla lo agrega T4).
- `test/integracion/geografia/repositorio-geografia.spec.ts` (Create) — PER13.
- `.dependency-cruiser.cjs`, `test/fronteras/dependency-cruiser.spec.ts`,
  `test/fronteras/fixtures/…` (Modify/Create) — regla 12 `prisma-service-solo-en-infraestructura` +
  fixture; PER14.

**Escenarios cubiertos** (`specs/persistencia/spec.md`, 5 escenarios):
- `PER13 — listarDepartamentos devuelve los departamentos ordenados por id`
- `PER13 — listarCiudadesDe devuelve las ciudades de un departamento ordenadas por id`
- `PER13 — guardarCatalogo nunca borra un departamento o ciudad existente`
- `PER14 — Un import de PrismaService desde aplicacion, puertos o interfaz de un módulo falla la verificación de fronteras`
- `PER14 — El módulo raíz de composición puede importar PrismaModule sin fallar`

**RED → GREEN → REFACTOR**:

1. RED: `src/modulos/geografia/dominio/geografia.ts` — no es un escenario de spec (regla de dominio
   pura, sin ADR/PER propio), pero es precondición del repositorio: reglas de código DANE. Correr
   `npm test -- geografia` y observar fallo (el módulo no existe).
2. RED: `test/integracion/geografia/repositorio-geografia.spec.ts` — los 3 escenarios de PER13
   contra Postgres real, en la base del worker (arnés de T1). Correr
   `npm run test:integracion -- repositorio-geografia` y observar fallo (ni el puerto ni el
   adaptador existen).
3. RED: fixture bajo `test/fronteras/fixtures/` con un archivo simulado en `aplicacion/` que importa
   `PrismaService` desde `plataforma/prisma`, más `geografia.module.ts` importando `PrismaModule`.
   Correr `npm run fronteras` y observar que ninguna regla existente detecta la violación (PER14,
   ambos escenarios).
4. GREEN: implementar el dominio, el puerto, el adaptador (`RepositorioGeografiaPrisma`), el módulo
   y el barril; agregar la regla 12 a `.dependency-cruiser.cjs` hasta que los tres specs pasen.
5. REFACTOR: confirmar que `AppModule` **no** importa `GeografiaModule` todavía (nada de la
   aplicación lo usa hasta que la Fase 02 lo necesite, por diseño); actualizar la skill
   `luxeboreal-arquitectura` §2 se deja para T5, no aquí.

**Hecho cuando**:
- Los 5 escenarios listados pasan, con el título exacto de su encabezado como nombre del test.
- `npm run fronteras` reporta 0 violaciones sobre el código real del módulo `geografia` y detecta la
  violación esperada solo en el fixture de la regla 12.
- El test de repositorio contra Postgres real (Success Criteria de `proposal.md`, cuarto ítem) queda
  demostrado con este repositorio de geografía.
- `npm run verify` sigue en verde y por debajo de 3 minutos.

**Evidencia real (máquina de desarrollo, 2026-09-25, Docker arriba)**:

1. RED — `src/modulos/geografia/dominio/geografia.spec.ts` sin `geografia.ts` (`npm test -- geografia`):
   ```
   FAIL  |unit| src/modulos/geografia/dominio/geografia.spec.ts
   Error: Cannot find module './geografia.js' imported from .../dominio/geografia.spec.ts
   Test Files  1 failed (1)
   ```
   GREEN tras implementar `geografia.ts` (`Departamento`, `Ciudad`, `CatalogoGeografico`,
   `esCodigoDepartamentoValido`, `esCodigoCiudadValido`, `FuenteDivipolaInvalida`):
   ```
   Test Files  1 passed (1)
        Tests  8 passed (8)
   ```
2. RED — `test/integracion/geografia/repositorio-geografia.spec.ts` con `geografia.module.ts`,
   `index.ts` e `infraestructura/repositorio-geografia-prisma.ts` movidos fuera del árbol
   (`npm run test:integracion -- repositorio-geografia`):
   ```
   FAIL  |integracion| test/integracion/geografia/repositorio-geografia.spec.ts
   Error: Cannot find module '.../src/modulos/geografia/index.js'
   Test Files  1 failed (1)
   ```
   GREEN tras restaurar/implementar el puerto, el adaptador Prisma (`guardarCatalogo` con
   `$queryRaw` en plantilla etiquetada + `unnest`, `listarDepartamentos`, `listarCiudadesDe`), el
   módulo y el barril:
   ```
   Test Files  1 passed (1)
        Tests  3 passed (3)
   ```
   Los 3 escenarios de PER13 pasaron contra Postgres real (Testcontainers) en el primer intento tras
   implementar el adaptador; no hicieron falta correcciones adicionales de comportamiento SQL.
3. RED — fixture de la regla 12 (`test/fronteras/fixtures/src/modulos/pedidos/aplicacion/caso-uso-prisma-service.ts`
   importando el barril fixture `plataforma/prisma/index.ts`, más el permitido
   `pedidos.module.ts`) sin la regla en `.dependency-cruiser.cjs` (`npm test -- fronteras`):
   ```
   × PER14 — Un import de PrismaService desde aplicacion, puertos o interfaz de un módulo falla la
     verificación de fronteras
   AssertionError: expected false to be true
   Test Files  1 failed | 13 passed (14)
   ```
   GREEN tras agregar la regla 12 `prisma-service-solo-en-infraestructura`
   (`from: ^src/modulos/[^/]+/(aplicacion|puertos|interfaz)/`, `to: ^src/plataforma/prisma/`):
   ```
   Test Files  14 passed (14)
        Tests  85 passed (85)
   ```
4. `npm run fronteras` real sobre `src`/`scripts`: **0 violaciones, 101 módulos / 200 dependencias
   cruzadas** (`✔ no dependency violations found`) — confirma que el módulo `geografia` real no
   dispara la regla 12 ni ninguna otra, y que la violación solo existe en el fixture.

**Desviación registrada (hallazgo real durante GREEN, no prevista en `design.md`)**: al escribir
`geografia.spec.ts` bajo `dominio/`, `npm run fronteras` real reportó una violación genuina de la
regla 3 `dominio-aislado` (`dominio/geografia.spec.ts → node_modules/vitest`): esa regla, tal como
la dejó la Fase 00a, prohibía **cualquier** import fuera de `dominio/`/`compartido/` sin la misma
excepción de `.spec.ts` que ya tiene la regla 9 (`src-sin-dev-dependencies`) para el resto de `src/`.
Como `geografia` es el primer módulo de negocio de todo el repo, nadie había escrito antes un test
unitario colocado junto a `dominio/`, así que el hueco no se había manifestado. Se corrigió con el
mismo patrón que la regla 9 (`from.pathNot: '\\.spec\\.ts$'`), con su propio ciclo RED→GREEN:
- RED (`npm test -- fronteras`, fixture nueva `.../dominio/entidad.spec.ts` importando `vitest`):
  ```
  × regla 3 — dominio-aislado (permitido): un test unitario junto a dominio/ puede importar una devDependency
  AssertionError: expected true to be false
  ```
- GREEN tras el ajuste de la regla: `Test Files 14 passed (14)`, `Tests 85 passed (85)`.
Sin este ajuste, ningún `dominio/*.spec.ts` de ningún módulo futuro podría importar `vitest` — no es
un cambio de alcance de T3, es una corrección de una regla existente que T3 fue la primera en poder
observar en ejecución real. Queda documentado aquí en vez de silenciarse en el chat, según la skill
`luxeboreal-fases` §5.

**`npm run verify` completo**: código **0**, **44 archivos / 198 tests aprobados**, duración
**47,05 s** (muy por debajo de PLT7, 3 min). Dos corridas previas inmediatamente anteriores fallaron
por contención transitoria de Postgres/Testcontainers al repetir `verify` completo varias veces
seguidas sin pausa (`terminating connection due to administrator command` en un test de T2,
`restricciones-manuales.spec.ts`, y una carrera de `CREATE DATABASE ... TEMPLATE` en
`base-por-worker.setup.ts`, en `salud.spec.ts`); ambos tests, corridos por separado, pasaron en
verde de inmediato, y la tercera corrida completa de `verify` fue estable — no es una regresión de
T3, es la misma contención de infraestructura que T2 ya documentó (D6, "Desviación de ejecución").
`npm run test:e2e`: código **0**, **1 archivo / 8 tests aprobados**, 12,74 s.

**Líneas de autoría reales** (`git diff --cached --numstat`, sin generados — este slice no toca
Prisma ni el cliente generado):

| Archivo | + | − |
|---|---|---|
| `.dependency-cruiser.cjs` | 19 | 2 |
| `src/modulos/geografia/dominio/geografia.ts` | 56 | 0 |
| `src/modulos/geografia/dominio/geografia.spec.ts` | 55 | 0 |
| `src/modulos/geografia/puertos/repositorio-geografia.ts` | 30 | 0 |
| `src/modulos/geografia/infraestructura/repositorio-geografia-prisma.ts` | 84 | 0 |
| `src/modulos/geografia/geografia.module.ts` | 17 | 0 |
| `src/modulos/geografia/index.ts` | 21 | 0 |
| `test/integracion/geografia/repositorio-geografia.spec.ts` | 104 | 0 |
| `test/fronteras/dependency-cruiser.spec.ts` | 36 | 0 |
| `test/fronteras/fixtures/src/modulos/pedidos/aplicacion/caso-uso-prisma-service.ts` | 6 | 0 |
| `test/fronteras/fixtures/src/modulos/pedidos/dominio/entidad.spec.ts` | 7 | 0 |
| `test/fronteras/fixtures/src/modulos/pedidos/pedidos.module.ts` | 6 | 0 |
| `test/fronteras/fixtures/src/plataforma/prisma/index.ts` | 5 | 0 |
| **Total** | **446** | **2** |

**448 líneas de autoría** frente a la estimación de ~345 de `design.md` §"Migration / Rollout" S3
(+103, ~1.30×). La diferencia no alcanza el umbral de excepción que sí aplicó a T2 (~1.65× allí,
`size:exception` explícito del usuario): la mayor parte del exceso (~74 líneas) viene del hallazgo
real de la regla 3 `dominio-aislado` de arriba (fixture nueva + caso de prueba + ajuste de la regla
con su comentario), que no estaba presupuestado porque no era un objeto conocido de T3 hasta que el
primer `npm run fronteras` real lo reveló. El resto de los archivos quedó cerca de su estimación
individual (dominio ~111 vs ~90, puerto 30 vs ~25, adaptador 84 vs ~75, módulo+barril 38 vs ~30,
test de integración 104 vs ~90). No se pidió `size:exception`: el exceso total sobre el presupuesto
general de ~400 es de solo 48 líneas (~12%), y no se recortó ningún test, comentario ni la corrección
de la regla 3 para acercarse al número.

---

## T4 — Semilla DANE: descarga, intérprete, caso de uso, idempotencia

**Objetivo**: descargar el archivo oficial DIVIPOLA (Q2 de `proposal.md`), escribir el intérprete
puro `interpretarDivipola`, el caso de uso `SembrarGeografia` y el comando explícito de semilla, y
probar que correrla dos veces deja la base exactamente igual, sin cargar ningún dato de negocio.

**Dependencias**: T3 (`RepositorioGeografia.guardarCatalogo` ya existe y está probado).

**Checkpoint de esta tarea** (design.md D9) — resuelto en el primer paso, antes de escribir el
intérprete; resultado real:

**Nombres reales de los campos del JSON de SODA (dataset `gdxc-w37w`)**: `design.md` D9 no tenía
acceso a la red y **presumía** los nombres `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio` sin
verificarlos en vivo. Ejecutado en esta tarea (máquina de desarrollo, 2026-09-25):

1. Descarga real: `curl -fL "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000" -o prisma/datos/divipola.json`
   → código **200** (confirmado con `-w "HTTP_CODE:%{http_code}"`), archivo de **172.803 bytes**.
2. Inspección real del primer registro (`node -e "..."` sobre el archivo descargado):
   ```json
   {
     "cod_dpto": "05", "dpto": "ANTIOQUIA", "cod_mpio": "05001", "nom_mpio": "MEDELLÍN",
     "tipo_municipio": "Municipio", "longitud": "-75,581775", "latitud": "6,246631"
   }
   ```
   Los **cuatro nombres de campo reales coinciden exactamente con la presunción de `design.md`**:
   `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio` — **sin ajuste necesario** en la constante `CAMPOS` de
   `interpretar-divipola.ts`.
3. Conteos reales (script Node sobre el archivo completo): **1122 filas**, **33 departamentos
   únicos** (`cod_dpto`), **1122 códigos de municipio únicos** (`cod_mpio`, sin duplicados),
   `tipo_municipio` con tres valores (`Municipio`, `Isla`, `Área no municipalizada`), 0 códigos de
   departamento/municipio con formato inválido, 0 municipios cuyo código no empiece con el código de
   su departamento, 0 departamentos con nombre inconsistente entre filas repetidas, y 3 filas con
   coma en el nombre (`"BOGOTÁ, D.C."`, confirmando el caso límite anticipado por la matriz de
   amenazas).
4. El endpoint respondió 200 con el formato esperado; no aplicó el plan de detención del punto 4 del
   checkpoint.
5. `sha256` real del archivo descargado (`node -e "crypto.createHash('sha256')..."`):
   `1028ab04c10a08fa860dd89e621de1eb9246710a56102c915f0988ae9e10d63d`. Registrado en
   `prisma/datos/divipola.procedencia.json` junto con `filas: 1122`, `departamentos: 33`,
   `ciudades: 1122` y los cuatro nombres de campo reales.

**Archivos/áreas** (design D8, D9):
- `src/modulos/geografia/dominio/interpretar-divipola.ts` (+ `.spec.ts`) (Create) — puro, sin
  imports; relleno de ceros, validación `^\d{2}$`/`^\d{5}$`, prefijo municipio/departamento,
  repetidos, `FuenteDivipolaInvalida`.
- `src/modulos/geografia/aplicacion/sembrar-geografia.ts` (+ `.spec.ts`) (Create) — caso de uso
  `SembrarGeografia`; unitario con repositorio en memoria.
- `test/fakes/repositorio-geografia-en-memoria.ts` (Create) — doble de prueba.
- `scripts/sembrar-geografia.ts`, `scripts/cli.ts` (Create/Modify) — comando de semilla, contexto
  Nest (`ConfiguracionModule` + `GeografiaModule`), imprime el resumen y cierra ($disconnect$, A1).
- `prisma/datos/divipola.json` (Create) — datos oficiales, byte a byte (no cuenta como autoría).
- `prisma/datos/divipola.procedencia.json` (Create) — fuente, fecha, sha256, conteos y campos
  reales (D9).
- `.gitattributes` (Modify) — `prisma/datos/divipola.json -text`.
- `test/integracion/geografia/semilla.spec.ts` (Create) — PER11, PER12.
- `package.json` (Modify) — script `semilla:geografia`.

**Escenarios cubiertos** (`specs/persistencia/spec.md`, 4 escenarios):
- `PER11 — Ejecutar la semilla dos veces deja los mismos departamentos y ciudades`
- `PER11 — La segunda ejecución de la semilla no inserta ni actualiza ninguna fila`
- `PER12 — La semilla solo escribe filas en departamento y ciudad`
- `PER12 — El archivo de procedencia documenta fuente, fecha, hash y conteos`

**RED → GREEN → REFACTOR**:

1. RED (checkpoint): descargar el archivo real y anotar los nombres de campo encontrados **antes**
   de escribir la constante de `interpretar-divipola.ts`; si el endpoint falla, detener la tarea
   aquí y reportar, sin avanzar a los pasos siguientes.
2. RED: `src/modulos/geografia/dominio/interpretar-divipola.spec.ts` — relleno de ceros, prefijo
   municipio/departamento, códigos repetidos, campos faltantes, JSON inválido → `FuenteDivipolaInvalida`,
   nombres con comillas y comas ("Bogotá, D.C.", matriz de amenazas). Correr
   `npm test -- interpretar-divipola` y observar fallo (el módulo no existe).
3. RED: `src/modulos/geografia/aplicacion/sembrar-geografia.spec.ts` — llama a `guardarCatalogo` con
   el catálogo interpretado; con una fuente inválida no escribe nada, usando
   `test/fakes/repositorio-geografia-en-memoria.ts`. Observar fallo.
4. RED: `test/integracion/geografia/semilla.spec.ts` — los 4 escenarios de PER11/PER12 con el
   archivo real, corriendo la semilla dos veces contra la base del worker. Observar fallo (el caso
   de uso y el script no existen).
5. GREEN: implementar `interpretarDivipola`, `SembrarGeografia`, el doble en memoria,
   `scripts/sembrar-geografia.ts` y el despacho en `scripts/cli.ts`, hasta que los tres specs pasen.
6. GREEN: correr `npm run semilla:geografia` real contra la base de desarrollo, **dos veces**
   seguidas; anotar ambas salidas completas aquí (evidencia real, L2 de 00b).
7. REFACTOR: confirmar que ninguna tabla fuera de `departamento`/`ciudad` recibió filas (PER12,
   verificado también por el test de integración); documentar en `prisma/README.md` §"Datos de
   referencia" (creada en T2) la fuente y el proceso de actualización del archivo DIVIPOLA.

**Hecho cuando**:
- Los 4 escenarios listados pasan, con el título exacto de su encabezado como nombre del test.
- El checkpoint de nombres de campo queda resuelto y anotado (nombres reales encontrados, o el
  reporte de fallo del endpoint si no respondió).
- `prisma/datos/divipola.procedencia.json` existe con el sha256 real del archivo descargado y los
  conteos reales (no los presumidos por `design.md`).
- La salida real de `npm run semilla:geografia` corrida dos veces queda anotada aquí, mostrando
  `insertados = 0, actualizados = 0` en la segunda corrida.
- `npm run verify` sigue en verde y por debajo de 3 minutos.

**Evidencia real (máquina de desarrollo, 2026-09-25, Docker arriba)**:

1. RED — `src/modulos/geografia/dominio/interpretar-divipola.spec.ts` con `interpretar-divipola.ts`
   movido fuera del árbol (`npm test -- interpretar-divipola`):
   ```
   FAIL  |unit| src/modulos/geografia/dominio/interpretar-divipola.spec.ts
   Error: Cannot find module './interpretar-divipola.js' imported from
   .../dominio/interpretar-divipola.spec.ts
   Test Files  1 failed (1)
        Tests  no tests
   ```
   GREEN tras restaurar `interpretar-divipola.ts` (relleno de ceros, validación de forma y
   jerarquía, códigos repetidos, `FuenteDivipolaInvalida`):
   ```
   Test Files  1 passed (1)
        Tests  12 passed (12)
   ```
2. RED — `src/modulos/geografia/aplicacion/sembrar-geografia.spec.ts` con `sembrar-geografia.ts`
   movido fuera del árbol (`npm test -- sembrar-geografia`):
   ```
   FAIL  |unit| src/modulos/geografia/aplicacion/sembrar-geografia.spec.ts
   Error: Cannot find module './sembrar-geografia.js' imported from
   .../aplicacion/sembrar-geografia.spec.ts
   Test Files  1 failed (1)
        Tests  no tests
   ```
   GREEN tras restaurar `sembrar-geografia.ts`:
   ```
   Test Files  1 passed (1)
        Tests  2 passed (2)
   ```
3. RED — `test/integracion/geografia/semilla.spec.ts` con `SembrarGeografia` sin registrar todavía
   en `GeografiaModule` (providers/exports revertidos temporalmente para reproducir "el caso de uso
   no existe [en el contexto Nest]", `npm run test:integracion -- semilla`):
   ```
   FAIL  |integracion| test/integracion/geografia/semilla.spec.ts > ... > PER11 — Ejecutar la
   semilla dos veces deja los mismos departamentos y ciudades
   Error: Nest could not find SembrarGeografia element (this provider does not exist in the
   current context)
   FAIL  |integracion| ... > PER11 — La segunda ejecución de la semilla no inserta ni actualiza
   ninguna fila
   Error: Nest could not find SembrarGeografia element (this provider does not exist in the
   current context)
   FAIL  |integracion| ... > PER12 — La semilla solo escribe filas en departamento y ciudad
   Error: Nest could not find SembrarGeografia element (this provider does not exist in the
   current context)
   Test Files  1 failed (1)
        Tests  3 failed | 1 passed (4)
   ```
   (El cuarto escenario, "PER12 — El archivo de procedencia documenta...", no depende del contexto
   Nest y ya pasaba.) GREEN tras registrar `SembrarGeografia` como provider y export de
   `GeografiaModule`:
   ```
   Test Files  1 passed (1)
        Tests  4 passed (4)
   ```
4. **Desviación registrada (hallazgo real durante GREEN, no prevista en `design.md`)**: al escribir
   `sembrar-geografia.spec.ts` "junto al archivo" (skill §7, "casos de uso con puertos falsos") e
   importar `test/fakes/repositorio-geografia-en-memoria.ts`, `npm run fronteras` real reportó una
   violación genuina de la regla 8 `src-no-importa-test`
   (`src/modulos/geografia/aplicacion/sembrar-geografia.spec.ts → test/fakes/...`): esa regla, tal
   como la dejó la Fase 00a, prohibía **cualquier** import de `src/` hacia `test/`, sin la misma
   excepción de `.spec.ts` que ya tienen las reglas 3 (`dominio-aislado`) y 9
   (`src-sin-dev-dependencies`). Como T4 es el primer caso de uso del repo que necesita un doble de
   `test/fakes/` en su unitario "junto al archivo", el hueco no se había manifestado hasta ahora —
   mismo patrón que el hallazgo de la regla 3 en T3. Se corrigió con el mismo criterio
   (`pathNot: '\\.spec\\.ts$'` en `from`), con su propio ciclo RED→GREEN:
   - RED (`npm test -- fronteras`, fixture nueva
     `test/fronteras/fixtures/src/modulos/pedidos/aplicacion/caso-uso.spec.ts` importando el
     fixture `test/doble-interno.ts`, regla 8 todavía sin la excepción):
     ```
     × regla 8 — src-no-importa-test (permitido): un test unitario junto a aplicacion/ puede
       importar un doble de test/fakes/
     AssertionError: expected true to be false
     Test Files  1 failed | 13 passed (14)
          Tests  1 failed | 85 passed (86)
     ```
   - GREEN tras el ajuste de la regla 8:
     ```
     Test Files  14 passed (14)
          Tests  86 passed (86)
     ```
   Confirmado también con el código real: `npm run fronteras` sobre `src`/`scripts` reales terminó
   en **0 violaciones, 107 módulos / 222 dependencias cruzadas** tras registrar `SembrarGeografia`,
   así que la violación solo existía en el fixture, nunca en el código de producción. Este ajuste no
   estaba presupuestado en `design.md` §S4 (~435 líneas); se documenta aquí, no se silencia en el
   chat (skill `luxeboreal-fases` §5).
5. `scripts/sembrar-geografia.ts` y `scripts/cli.ts` (`semilla:geografia`) implementados siguiendo
   el patrón de `generarContrato()`/`resolverRaizRepositorio()` ya existente en `scripts/`: contexto
   Nest sin HTTP (`NestFactory.createApplicationContext` sobre un módulo raíz mínimo
   `[ConfiguracionModule, GeografiaModule]`), cierre con `contexto.close()`, y una función que
   devuelve `{ limpio, mensaje }` (mismo contrato que las demás funciones de `scripts/cli.ts`) en
   vez de escribir a `stdout` directamente — así `cli.ts` sigue siendo el único punto que toca
   `process.stdout`/`process.exitCode` (su propio contrato documentado).
6. **Primera corrida real de `npm run semilla:geografia`** (`DATABASE_URL`/`REDIS_URL` apuntando al
   Postgres/Redis de desarrollo de `docker-compose.yml`, contenedores ya arriba; base
   `luxeboreal` confirmada vacía en `departamento`/`ciudad` antes de correr):
   ```
   > luxeborealcrm@0.0.1 semilla:geografia
   > npm run herramienta -- scripts/cli.ts semilla:geografia

   > luxeborealcrm@0.0.1 herramienta
   > vite-node --config vitest.config.ts scripts/cli.ts semilla:geografia

   Geografía sembrada: 33 departamentos, 1122 ciudades (insertadas 1155, actualizadas 0, sin
   cambios 0)
   ```
7. **Segunda corrida real, inmediatamente después, mismo archivo**:
   ```
   > luxeborealcrm@0.0.1 semilla:geografia
   > npm run herramienta -- scripts/cli.ts semilla:geografia

   > luxeborealcrm@0.0.1 herramienta
   > vite-node --config vitest.config.ts scripts/cli.ts semilla:geografia

   Geografía sembrada: 33 departamentos, 1122 ciudades (insertadas 0, actualizadas 0, sin
   cambios 1155)
   ```
   Confirma PER11: la segunda corrida reporta `insertadas 0, actualizadas 0` para el total de
   departamentos + ciudades (1155 = 33 + 1122). Verificado también contra la base real con
   `psql`: `departamentos = 33, ciudades = 1122` tras ambas corridas, sin cambios entre una y otra.
8. REFACTOR: confirmado con el propio test de integración (PER12, tercer escenario) que ninguna
   tabla del esquema salvo `departamento`/`ciudad`/`_prisma_migrations` recibió filas, consultando
   dinámicamente `information_schema.tables` (no una lista fija) y contando cada una. La sección
   "Datos de referencia" de `prisma/README.md` ya existía desde T2 (creada anticipadamente); se
   revisó y sigue describiendo correctamente la fuente y el proceso de actualización — no necesitó
   cambios.
9. `npm run verify` completo: primera corrida real tras implementar T4 falló por la misma
   contención transitoria de Testcontainers que T2/T3 ya documentaron (`D6`, "Desviación de
   ejecución de T2"; `carrera de CREATE DATABASE ... TEMPLATE` en `base-por-worker.setup.ts` y
   `Can't reach database server` en el indicador de salud de `salud.spec.ts`, que simula
   intencionalmente Postgres/Redis inalcanzables): **3 archivos fallidos / 44 pasados (47)**, 210
   tests pasados / 7 omitidos (217), no relacionado con el código de T4. Repetido inmediatamente:
   código **0**, **47 archivos / 217 tests aprobados**, duración **41,99 s** (muy por debajo de los
   3 min de PLT7). `npm run test:e2e`: código **0**, **1 archivo / 8 tests aprobados**, 8,72 s.
   `npm run lint`: 5 errores reales en el primer intento (`@typescript-eslint/require-await` en los
   tres métodos `async` sin `await` de `RepositorioGeografiaEnMemoria`, y
   `@typescript-eslint/no-unsafe-assignment` por `expect.any(Number)` dentro de un objeto tipado en
   `semilla.spec.ts`); corregidos (métodos sin `async`, devolviendo `Promise.resolve(...)`; y
   aserciones separadas con `toBe`/`typeof` en vez de `expect.any` dentro de un `toEqual`), `npm run
   lint` quedó limpio en la corrida siguiente.

**Líneas de autoría reales** (`git diff --cached --numstat`, excluyendo `prisma/datos/divipola.json`
por ser el archivo fuente descargado byte a byte, no autoría — `design.md` "Migration / Rollout"):

| Archivo | + | − |
|---|---|---|
| `.dependency-cruiser.cjs` | 9 | 2 |
| `.gitattributes` | 4 | 0 |
| `package.json` | 1 | 0 |
| `prisma/datos/divipola.procedencia.json` | 15 | 0 |
| `scripts/cli.ts` | 8 | 2 |
| `scripts/sembrar-geografia.ts` | 64 | 0 |
| `src/modulos/geografia/aplicacion/sembrar-geografia.spec.ts` | 37 | 0 |
| `src/modulos/geografia/aplicacion/sembrar-geografia.ts` | 24 | 0 |
| `src/modulos/geografia/dominio/interpretar-divipola.spec.ts` | 119 | 0 |
| `src/modulos/geografia/dominio/interpretar-divipola.ts` | 132 | 0 |
| `src/modulos/geografia/geografia.module.ts` | 8 | 3 |
| `src/modulos/geografia/index.ts` | 2 | 0 |
| `test/fakes/repositorio-geografia-en-memoria.ts` | 65 | 0 |
| `test/fronteras/dependency-cruiser.spec.ts` | 12 | 0 |
| `test/fronteras/fixtures/src/modulos/pedidos/aplicacion/caso-uso.spec.ts` | 8 | 0 |
| `test/integracion/geografia/semilla.spec.ts` | 157 | 0 |
| **Total** | **665** | **7** |

**672 líneas de autoría** frente a la estimación de ~435 de `design.md` §"Migration / Rollout" S4
(+237, ~1.54×) y frente al presupuesto general de ~400 (~1.68×). A diferencia de T2 (excepción por
naturaleza, una sola migración inicial no partible), aquí el exceso tiene causas puntuales y
explicables, ninguna oculta:

- **~31 líneas no presupuestadas por el hallazgo real de la regla 8** (punto 4 arriba): ajuste de
  `.dependency-cruiser.cjs` (+9/−2), su test nuevo en `dependency-cruiser.spec.ts` (+12) y el
  fixture `caso-uso.spec.ts` (+8) — igual de imprevisible que el hallazgo de la regla 3 en T3.
- **~13 líneas de registro de `SembrarGeografia`** en `geografia.module.ts` (+8/−3) e `index.ts`
  (+2) que `design.md` §"Migration / Rollout" no separó como línea propia de S4 (solo mencionó
  "S4 agrega el caso de uso" en la tabla "File Changes", sin presupuesto explícito).
- **`interpretar-divipola.ts` + su spec, 251 líneas reales frente a ~160 estimadas (+91)**: el
  intérprete real necesitó funciones auxiliares separadas (`parsearFilas`, `leerCampo`,
  `normalizarCodigo`, `normalizarNombre`) para mantener cada regla de validación como una rama
  propia con su mensaje de error nombrando fila y regla (P15); el unitario cubre 12 casos (relleno
  de ceros, prefijo, repetidos con incluidos/rechazados, comillas y comas, campos faltantes, JSON
  inválido, JSON no-arreglo, y el caso "nombra la fila correcta") en vez de un subconjunto menor.
- **`test/integracion/geografia/semilla.spec.ts`, 157 líneas reales frente a ~90 estimadas (+67)**:
  la verificación dinámica de "ninguna tabla fuera de `departamento`/`ciudad` recibió filas"
  (PER12) consulta `information_schema.tables` en vez de una lista fija de 19 tablas, para que la
  guardia siga siendo válida si el esquema cambia en fases futuras; eso añade su propio bloque de
  consulta y verificación fila por fila.
- **`test/fakes/repositorio-geografia-en-memoria.ts`, 65 líneas reales frente a ~30 estimadas
  (+35)**: el doble reproduce el mismo contrato de upsert por id (insertado/actualizado/sin
  cambios) que el adaptador Prisma real, no un mapa trivial, para que `SembrarGeografia` se pruebe
  contra un comportamiento equivalente al de producción.

No se recortó ningún test, comentario ni la corrección de la regla 8 para acercarse al presupuesto.
Siguiendo la autorización explícita ya dada para esta tarea (instrucción de la sesión: "si el diff
real supera significativamente el presupuesto, no te detengas... anótalo como desviación... y
repórtalo con claridad"), esta tarea **no se detuvo a pedir `size:exception`** — se documenta aquí,
igual que T2/T3, para que el usuario lo revise al cerrar la fase.

**Verificación final de escenarios PER11/PER12** (búsqueda literal de los 4 títulos contra `test/`,
mismo criterio de cierre de 00b): los 4 aparecen exactamente una vez cada uno, como nombre de `it(...)`
en `test/integracion/geografia/semilla.spec.ts`, confirmado por la corrida verde de arriba
(4 tests aprobados, `--reporter=verbose` implícito en la salida de Vitest).

**commit:** `ed5adfdce9ed20be2652fbe8e482bc12ce332bcf` — `feat(persistencia): agregar semilla DANE
con interprete e idempotencia`

---

## T5 — Cierre documental

**Objetivo**: cerrar la fase en la documentación: `MODELO_DATOS.md` pasa de "borrador v1 ·
propuesta" a "v1 aprobada"; `CLAUDE.md` §Comandos documenta los scripts nuevos
(`prisma:migrar`, `prisma:aplicar`, `semilla:geografia`); la skill `luxeboreal-arquitectura` refleja
el módulo `geografia`, la regla 12 y el flujo de migraciones con `[manual]`; ADR-0007 y ADR-0009
reciben su nota de implementación.

**Dependencias**: T1, T2, T3, T4 (todo el comportamiento de la fase ya existe; esta tarea no agrega
código de producción).

**Archivos/áreas** (design "File Changes", slice S5):
- `MODELO_DATOS.md` (Modify) — estado final "v1 aprobada".
- `CLAUDE.md` §Comandos (Modify) — los tres comandos nuevos.
- `.claude/skills/luxeboreal-arquitectura/SKILL.md` (Modify) — §1 módulo `geografia`; §2 regla 12
  (de 11 a 12 reglas); §5 flujo de migraciones con `--create-only` y `[manual]`; §7 base por archivo.
- `docs/adr/0007-*.md`, `docs/adr/0009-*.md` (Modify) — notas "Implementado en la Fase 01" (D2, D6).

(`docs/fases/README.md` y `docs/migracion/inventario.md` se actualizan al archivar la fase, no en
esta tarea — igual que hizo 00b.)

**Escenarios cubiertos**: ninguno nuevo. Esta tarea no agrega comportamiento observable; verifica
que el checklist de cierre §12 de la skill `luxeboreal-arquitectura` (9 puntos) queda satisfecho
para toda la fase, y que el Success Criteria completo de `proposal.md` se cumple de punta a punta.

**RED → GREEN → REFACTOR**:

1. RED: no aplica un test de comportamiento nuevo; el "RED" de esta tarea es correr el checklist de
   cierre §12 contra el estado actual del repo y confirmar qué puntos siguen pendientes antes de
   escribir la documentación (p. ej. `MODELO_DATOS.md` todavía en "borrador").
2. GREEN: actualizar los cuatro documentos hasta que los 9 puntos del checklist §12 queden
   satisfechos.
3. REFACTOR: relectura cruzada — `MODELO_DATOS.md` v1 aprobada coincide exactamente con
   `prisma/schema.prisma` (mismo criterio que el Success Criteria de `proposal.md`).

**Hecho cuando**:
- `npm run verify` completo en verde, por debajo de 3 minutos (PLT7); la duración real de esta
  corrida final queda anotada aquí.
- Los 9 puntos del checklist de cierre §12 de la skill `luxeboreal-arquitectura` están satisfechos.
- Los 30 escenarios de la spec delta de `persistencia` (T1-T4) tienen su test nombrado
  `<id del requisito> — <título del escenario>` y pasan, confirmado con una búsqueda literal de los
  30 títulos contra `test/` (misma verificación que hizo la remediación de 00b antes de archivar).
- `MODELO_DATOS.md` queda como "v1 aprobada" y coincide con `schema.prisma`.
- El Success Criteria completo de `proposal.md` queda satisfecho.

**Evidencia real (máquina de desarrollo, 2026-09-25, Docker arriba)**:

- Documentos editados: `MODELO_DATOS.md` (encabezado "Borrador v1 · propuesta" → "v1 · aprobada
  (2026-09-25)"); `CLAUDE.md` §Comandos (agregadas `prisma:migrar`, `prisma:aplicar`,
  `semilla:geografia`); `.claude/skills/luxeboreal-arquitectura/SKILL.md` (§1 módulo `geografia`
  sin registrar en `AppModule`; §2 regla 12 `prisma-service-solo-en-infraestructura`, de 11 a 12
  reglas; §5 marcas `-- [manual] <nombre> — <motivo>` + `--create-only`; §7 base por
  archivo/worker; estado del documento a 0.3); `docs/adr/0007-llaves-primarias-uuid-v7.md` y
  `docs/adr/0009-testcontainers-infraestructura-de-pruebas.md` (sección "Implementado en la Fase
  01" en cada uno, con lo confirmado en ejecución real en T1/T2). Ningún archivo de `src/`,
  `prisma/` ni `test/` se tocó en esta tarea.
- `npm run verify`: primera corrida real con **1 fallo transitorio** (`PER12 — La semilla solo
  escribe filas en departamento y ciudad`, `terminating connection due to administrator command`
  contra Postgres) — la misma contención de Testcontainers que T2/T3 ya documentaron (D6,
  "Desviación de ejecución de T2"), no relacionada con los cambios de esta tarea (solo
  documentación). Repetido de inmediato: código **0**, **47 archivos / 217 tests aprobados**,
  duración **52,72 s** (por debajo del presupuesto de 3 min, PLT7). Los errores de
  `IndicadorPostgres`/`IndicadorRedis` en la salida son del propio `salud.spec.ts`, que simula a
  propósito una base/Redis inalcanzable (no son un fallo real).
- `npm run test:e2e`: código **0**, **1 archivo / 8 tests aprobados**, 10,89 s.
- **Checklist de cierre §12** (skill `luxeboreal-arquitectura`), verificado contra el estado real
  del repo tras T1-T5:
  1. `npm run verify` en verde — confirmado arriba (segunda corrida).
  2. `npm run test:e2e` — confirmado arriba (la fase tocó esquema y semilla).
  3. Los 30 escenarios de `specs/persistencia/spec.md` tienen su test y pasan — confirmado abajo.
  4. Esquema cambiado → `MODELO_DATOS.md` actualizado + migración + semilla corren — confirmado
     (T2, T4; `MODELO_DATOS.md` en "v1 · aprobada").
  5. Decisión con alternativas → ADR escrito e indexado — ADR-0007 y ADR-0009 ya existían con sus
     alternativas; esta tarea les agregó su nota de implementación real.
  6. `docs/migracion/inventario.md` y `docs/fases/README.md` — **pendiente a propósito**: por regla
     de `docs/fases/README.md` §"Reglas de las fases" y por el alcance de S5 en `design.md`, esos
     dos documentos se actualizan al archivar la fase (`sdd-archive`), no en T5.
  7. Sin `Date.now()`/`process.env` fuera de config/imports cruzados — confirmado por `fronteras`
     (0 violaciones, 107 módulos/222 dependencias) y `lint` limpios; esta tarea no tocó código.
  8. Un commit por unidad de trabajo, Conventional Commits, sin atribución de IA, en rama de fase —
     este commit de T5 lo cumple; push/PR/merge quedan para el usuario.
  9. Endpoint cambiado → contrato regenerado — no aplica (fase 01 no toca la API); `contrato:deriva`
     confirmó coincidencia byte a byte de ambos documentos igual.
- **Búsqueda literal de los 30 títulos de escenario** (`<PERn> — <título exacto>`, construidos
  emparejando cada `### Requirement: PERn` con sus `#### Scenario:` de
  `specs/persistencia/spec.md`) contra `test/`: las **30 aparecen exactamente una vez** cada una
  como nombre de `it(...)`/`describe(...)`, sin faltantes ni duplicados.
- Success Criteria de `proposal.md`: migración aplicada desde cero (T2), test de repositorio contra
  Postgres real (T3), semilla DANE idempotente (T4) — los tres puntos quedan demostrados por la
  evidencia ya registrada en T2-T4; esta tarea no agrega comportamiento nuevo que verificar.

**commit:** `6b54ead4723eb102a36a32a518c1616a9fbf7621` — `docs(01): cerrar fase de persistencia`
