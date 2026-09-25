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
que `design.md` proponía como tarea aparte quedan como los primeros pasos de **T2**, marcados
`[sin verificar]` abajo, en vez de como una tarea separada.

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
- [ ] T2 — Esquema v1 + migración inicial + deriva + invariantes + restricciones `[manual]` (S2)
- [ ] T3 — Repositorio de geografía + regla de fronteras 12 (S3)
- [ ] T4 — Semilla DANE: descarga, intérprete, caso de uso, idempotencia (S4)
- [ ] T5 — Cierre documental (S5)

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

- `npm exec -- prisma validate`: código **0**; salida: `The schema at prisma\\schema.prisma is valid`.
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
  prisma migrate deploy: código 0
  1 migration found in prisma/migrations
  Applying migration `20260925210822_esquema_v1`
  All migrations have been successfully applied.

  prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code:
  código 0 — No difference detected.

  prisma migrate dev --name verificar_esquema_v1: código 0
  Applying migration `20260925210822_esquema_v1`
  Your database is now in sync with your schema.
  ```

- El test runtime comprobó **17 columnas PK UUID y 0 defaults SQL**, que las migraciones quedaron
  finalizadas/no revertidas y que un `create()` de `PrismaService` produjo un UUID con nibble `7`.
  El diff real dio código **0** aun con las tres restricciones `[manual]`, así que `migrate diff` no
  las detecta; la guardia PER9 es necesaria.
- `npm run verify`: código **0**, **42 archivos / 184 tests aprobados**, duración **45,98 s**. Incluye
  generación, lint, typecheck, fronteras (95 módulos / 189 dependencias), deriva de ambos contratos y
  los proyectos unitario + integración. `npm run test:e2e`: código **0**, **1 archivo / 8 tests
  aprobados**, duración **11,63 s**.
- Para cumplir D6 de `design.md`, el primer verify real se midió por encima de 150 s y hubo timeouts
  por contención entre tareas que lanzan Docker/Git/Prisma. Se fijaron 4 workers en `unit` e
  `integracion`; Vitest exige `sequence.groupOrder` distinto cuando los límites por proyecto
  difieren. Con esa configuración el comando exacto `npm run verify` quedó en verde, por debajo de
  3 minutos.

**Límite de evidencia heredada**: las pruebas, runtime y criterios de aceptación actuales están en
verde, pero el RED histórico de `schema.prisma`/`migration.sql` no se puede reconstruir desde este
worktree. El ciclo de la guardia `[manual]` sí tiene RED observado en esta continuación.

**Work Unit Evidence**:

| Evidencia | Resultado |
|---|---|
| Test enfocado | `npm run test:integracion -- persistencia` — código 0; 4 archivos / 23 tests aprobados. |
| Arnés runtime | `npm run test:integracion -- migracion` — código 0; `migrate deploy`, `migrate diff --exit-code` y `migrate dev` reales contra bases temporales Postgres 16. |
| Rollback boundary | Revertir `MODELO_DATOS.md`, `package.json`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/`, `prisma/README.md`, `src/plataforma/prisma/prisma.service.ts`, los cuatro archivos nuevos/modificados bajo `test/integracion/persistencia/` y el ajuste T2 de `vitest.config.ts`. No hay datos de negocio ni dependencias de T3. |

**Review workload real**: 1,695 líneas de autoría (adiciones + borrados), excluyendo el SQL de migración generado salvo 11 líneas `[manual]` y el cliente Prisma generado. T2 es PR2 de la cadena `stacked-to-main`; el siguiente slice es T3 y requiere que el usuario resuelva `size:exception` antes de aplicarlo.

**TDD Cycle Evidence** (Strict TDD activo por `openspec/config.yaml`):

| Parte de T2 | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Esquema y migración heredados | PER1 2/2 ya pasaba al retomar | No observado en esta continuación: los archivos de implementación ya existían y no se dispone de evidencia anterior | Checkpoints y 19 escenarios PER1-PER9 pasan ahora | 19 escenarios exactos | No se reescribió el esquema heredado |
| Guardias `[manual]` | Helper parcial inspeccionado | Regex inválida y, después, mutación de `CHECK` aceptada incorrectamente | 8/8 tests de restricciones pasan tras registrar las formas esperadas | Inserciones inválidas, valor válido, objeto ausente y definición alterada | Consulta de catálogo verifica forma, no solo nombre |
| Presupuesto de ejecución | Verify inicial con contención | Timeouts y configuración Vitest inválida al diferir `maxWorkers` con mismo `groupOrder` | Verify exacto 42/184, 45,98 s | Unit + integración agrupados; e2e aparte 8/8 | Límite 4 y grupos secuenciales por proyecto |

**Límite de TDD heredado**: no se afirma un RED previo para `schema.prisma`/`migration.sql`; el
worktree contenía esa implementación antes de iniciar esta continuación. Sus criterios sí quedaron
verificados en bases PostgreSQL reales. La única desviación de proceso que no puede reconstruirse es
ese orden histórico; no se ocultó ni se fabricó.

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

---

## T4 — Semilla DANE: descarga, intérprete, caso de uso, idempotencia

**Objetivo**: descargar el archivo oficial DIVIPOLA (Q2 de `proposal.md`), escribir el intérprete
puro `interpretarDivipola`, el caso de uso `SembrarGeografia` y el comando explícito de semilla, y
probar que correrla dos veces deja la base exactamente igual, sin cargar ningún dato de negocio.

**Dependencias**: T3 (`RepositorioGeografia.guardarCatalogo` ya existe y está probado).

**Checkpoint `[sin verificar]` de esta tarea** (design.md D9) — se resuelve en el primer paso de
esta tarea, antes de escribir el intérprete, y su resultado real se anota aquí:

**Nombres reales de los campos del JSON de SODA (dataset `gdxc-w37w`)**: `design.md` D9 no tiene
acceso a la red y **presume** los nombres `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio` sin verificarlos
en vivo. Esta tarea MUST:
1. Descargar el archivo real: `curl -fL "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000" -o prisma/datos/divipola.json`.
2. Anotar en `prisma/datos/divipola.procedencia.json` (`campos`) los nombres reales de los cuatro
   campos usados (código de departamento, nombre de departamento, código de municipio, nombre de
   municipio) y los conteos reales (`filas`, `departamentos`, `ciudades`).
3. Ajustar la constante única de nombres de campo en `interpretar-divipola.ts` a lo que el archivo
   realmente trae, si difiere de la presunción de `design.md`.
4. **Si el endpoint JSON no responde** (código ≠ 200, timeout, formato inesperado), esta tarea
   **se detiene y reporta** el error tal cual, sin improvisar otro formato ni otra fuente.

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
