# Tasks: Fase 03 — Importador y medios

Review requerida: **RDD** (03 no es una de las fases 04, 05, 06, 10 de `docs/fases/README.md`; no
requiere `judgment-day`; confirmado en `proposal.md` §"Decisiones ya tomadas" y `design.md`
§"Migration / Rollout").

Convención de conteo de esta fase (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por
change"): cada **tarea** de este archivo (`T1`…`T10`) es una unidad de trabajo completa que termina
en **un solo commit**. Los 5 slices de `design.md` (`S(a)`-`S(e)`) se reparten en **10 tareas**,
siguiendo la tabla "File Changes" de `design.md`: cada tarea toma un grupo cohesivo de archivos que
comparten slice y responsabilidad. Ninguna tarea mezcla archivos de dos slices distintos.

**Resultado: 10 tareas, exactamente en el límite de 10.** No hace falta proponer partir la fase.

## Nota de conteo de escenarios (verificada línea por línea contra `specs/catalogo/spec.md` y
`specs/medios/spec.md`, 2026-09-26)

Hay **59 escenarios** (`#### Scenario:`) entre las dos specs delta de esta fase, no 58 ni las cifras
parciales que sugiere la tabla "Testing Strategy" de `design.md` sumadas literalmente. Conteo real por
requisito:

- **`catalogo` (IMP#, 39 escenarios)**: IMP1(2), IMP2(2), IMP3(4), IMP4(3), IMP5(2), IMP6(3), IMP7(5),
  IMP8(2), IMP9(3), IMP10(3), **IMP11(6)**, IMP12(1), IMP13(3).
- **`medios` (MED#, 20 escenarios)**: MED1(3), MED2(2), MED3(1), MED4(3), MED5(3), MED6(2), MED7(1),
  MED8(2), MED9(3).

**Discrepancia detectada y no corregida silenciosamente**: la tabla "Testing Strategy" de `design.md`
anota "IMP3-IMP8 (17 escenarios)" en la fila del validador de filas. Contando los encabezados
`#### Scenario:` reales bajo IMP3-IMP8 en `specs/catalogo/spec.md` hay **19**, no 17 (IMP3=4, IMP4=3,
IMP5=2, IMP6=3, IMP7=5, IMP8=2). También anota implícitamente 5 escenarios para IMP11 (la fila de
"Testing Strategy" no da un número, pero el listado de requisitos de la proposal sugiere ese orden de
magnitud); contando los encabezados reales bajo IMP11 hay **6**, no 5 (incluye por separado "Un producto
nuevo se crea y uno existente se actualiza por su SKU" y "Las fotos de un producto actualizado se
reemplazan por completo" como dos escenarios distintos). Este `tasks.md` mapea los 19 y los 6 reales; se
deja anotada la discrepancia para que el usuario la confirme al aprobar — no bloquea `sdd-apply` porque
la cobertura de ambos grupos está completa y trazable (ver tabla de mapeo abajo).

## Nota sobre dónde vive cada escenario (lectura de `design.md` §"Data Flow", no solo de la tabla
"Testing Strategy")

La tabla "Testing Strategy" de `design.md` agrupa MED1, MED6 y MED7 en la misma fila de integración
("`AlmacenamientoMinio` contra MinIO real ... MED1 (3 escenarios), MED6, MED7"). El diagrama de "Data
Flow" es más específico y se sigue en su lugar (mismo criterio que usó `tasks.md` de la Fase 02 para
CAT9/CAT11):

- **MED6** (redimensionar a ≤1600px, JPEG80) ocurre dentro de `ProcesarFotos`, con `sharp` sobre buffers
  en memoria — no necesita MinIO real para probarse. Se asigna a **T8** (unitario, con doble de
  `Almacenamiento`).
- **MED7** (borrado de fotos sobrantes) según D7 lo ejecuta **`ImportarCatalogo`**, no `ProcesarFotos`:
  "`ProcesarFotos` devuelve las claves a borrar ...; `ImportarCatalogo` las borra con
  `ALMACENAMIENTO.eliminar(clave)` solo tras el `await escribirTodoONada(...)` exitoso". Se asigna a
  **T9** (unitario, con doble de `Almacenamiento`), no a T5 ni a T8.
- **MED1** (los tres escenarios propios del puerto `Almacenamiento`: guardar/obtenerUrl/eliminar) es lo
  único de esa fila que de verdad ejercita `AlmacenamientoMinio` contra MinIO real. Se asigna a **T5**.

## Resolución de la idempotencia de fotos sin ampliar el puerto `Almacenamiento` (D8)

`design.md` D8 deja abierto "cuál API de S3 confirma existencia sin descargar el objeto completo, p. ej.
`HeadObjectCommand`", y delega esa elección a `sdd-tasks`/apply. El puerto `Almacenamiento` (canónico en
`design.md` §"Interfaces / Contracts") solo expone `guardar`/`obtenerUrl`/`eliminar` — **no** se le
agrega un cuarto método `existe(clave)`, porque el bucket es público y de URL determinística (D3):
`ProcesarFotos` (T8) resuelve la existencia con `ALMACENAMIENTO.obtenerUrl(clave)` (ya en el puerto) más
una petición `HEAD` HTTP corriente contra esa URL pública (`fetch(url, { method: 'HEAD' })`), sin tocar
el SDK de S3 desde `aplicacion/`. Esto respeta la frontera `prisma-service-solo-en-infraestructura` y su
equivalente para `Almacenamiento` (el puerto no cambia de forma) y resuelve la pregunta que D8 dejaba
abierta sin ampliar ningún contrato.

## Checklist

- [x] T1 — Dominio: resolución de departamento/ciudad a DANE (`resolver-lugar.ts`) (S(a))
- [x] T2 — Dominio: validación del catálogo por pestaña (`validar-catalogo.ts`) (S(a))
- [x] T3 — `medios/aplicacion/collage.ts`: generación de collage (S(a))
- [x] T4 — Puerto `FuenteCatalogo` + adaptadores Sheets/Directorio + helper CSV (S(b))
- [ ] T5 — Puerto `Almacenamiento` + adaptador MinIO + wiring de config/Docker/Testcontainers (S(b))
- [ ] T6 — `descarga-drive.ts`: conversión de enlaces, carpeta, magic bytes (S(b))
- [ ] T7 — Puerto `RepositorioImportacionCatalogo` + adaptador Prisma (escritura todo-o-nada) (S(b))
- [ ] T8 — Resolución de geografía de importación + `ProcesarFotos` (S(c))
- [ ] T9 — `ImportarCatalogo`: orquestador todo-o-nada + wiring de módulos (S(d))
- [ ] T10 — Comando CLI + fixtures + cierre documental (S(e))

## Mapeo de escenarios por tarea (59 escenarios, 22 requisitos)

| Tarea | Requisitos | # Escenarios |
|---|---|---|
| T1 | IMP9 | 3 |
| T2 | IMP3, IMP4, IMP5, IMP6, IMP7, IMP8 | 4+3+2+3+5+2 = 19 |
| T3 | MED8 | 2 |
| T4 | IMP1, IMP2 | 2+2 = 4 |
| T5 | MED1 | 3 |
| T6 | MED2, MED3, MED4 | 2+1+3 = 6 |
| T7 | IMP11 | 6 |
| T8 | MED5, MED6, MED9 | 3+2+3 = 8 |
| T9 | IMP10, IMP12, IMP13 (2 de 3), MED7 | 3+1+2+1 = 7 |
| T10 | IMP13 (1 de 3) | 1 |
| **Total** | **22** | **59** |

Dependencias entre tareas: T2 depende de T1 (`validarFilaTarifa`/`validarFilaCobertura` llaman a
`resolverLugar`). T4, T5, T6, T7 no tienen dependencia nueva entre sí (puertos y adaptadores
independientes). T8 depende de T3 (`ProcesarFotos` llama a `construirCollage`), T5 (puerto
`Almacenamiento`) y T6 (`descarga-drive.ts`). T9 depende de T2 (`validarCatalogoCompleto`), T4 (puerto
`FuenteCatalogo`), T7 (puerto `RepositorioImportacionCatalogo`) y T8 (`ProcesarFotos`,
`resolverGeografiaImportacion`). T10 depende de T9 (`ImportarCatalogo`) y, por tanto, de todas las
anteriores.

## Matriz de amenazas aplicable a esta fase

Reproducida desde `design.md` §"Threat Matrix" (regla del skill: las filas se copian sin cambios;
ninguna fila de esta fase es `N/A`, a diferencia de fases anteriores):

| Vector | Mitigación | Dónde se cubre |
|---|---|---|
| Descarga de imágenes con URL controlada por el contenido de la hoja (SSRF potencial) | Solo `http://`/`https://` (IMP4); conversión de Drive normaliza a `drive.google.com` antes de pedir; sin seguir redirecciones a esquemas no-HTTP | T6 (`descarga-drive.ts`), T2 (IMP4) |
| Contenido descargado que dice ser imagen pero no lo es (HTML de "acceso denegado") | Magic bytes (MED4), nunca solo `content-type` | T6 |
| CSV con campos maliciosamente formateados (comillas/comas para forzar una fila mal parseada) | `csv-parse` (D10), parser probado en vez de `split` manual | T4 (`csv.ts`) |
| Credenciales de MinIO (`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`) | Solo en `plataforma/config`, nunca logueadas; `.env.example` sin valores reales | T5 |
| Comando `catalogo:importar` ejecutado por error con `--sheet-id` de producción contra una base de desarrollo | Fuera de alcance técnico (mismo riesgo que `semilla:geografia`); `--dir` del criterio de salida no toca la hoja real | T10 (documentado, sin mitigación de código nueva) |

Ninguna tarea de esta fase agrega una fila propia distinta a las que `design.md` ya identificó.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3.730 líneas de autoría (estimación propia de `sdd-tasks`, ver tabla por tarea abajo; `design.md` no incluye desglose de líneas por archivo en "Migration / Rollout" para esta fase — el número real lo confirma cada tarea con `git diff --numstat` al aplicarla) |
| 400-line budget risk | **Alto**: T2 (~700, dominio de validación con seis sub-validadores + registro de parsers jsonb), T4 (~420, límite), T7 (~560, transacción de seis escrituras + rollback), T8 (~480, combina dos servicios de aplicación), T9 (~400, límite). Medio en T5, T6. Bajo en T1, T3, T10 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → … → PR10 (10 tareas, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Alto

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de esta sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede
con T1 sin pedir confirmación adicional.

**Excepción automática vs. pregunta explícita, por tarea** (regla de `openspec/config.yaml`
§rules.tasks: "si el exceso ya está anticipado y motivado en la tabla de Risks de `proposal.md`,
`tasks.md` aplica `size:exception` automáticamente ...; solo se pregunta cuando el exceso no estaba
previsto"). La fila 4 de Risks de `proposal.md` anticipa explícitamente el exceso de **"5+ archivos de
infraestructura nuevos (Sheets, Drive, MinIO, repositorio)"** — es decir, T4 (Sheets), T5 (MinIO), T6
(Drive) y T7 (repositorio) por nombre:

- **T4, T5, T6, T7**: si el diff real confirma o supera el estimado, `size:exception` se aplica
  **automáticamente**, citando esa fila de Risks; `sdd-apply` no pregunta.
- **T2, T8, T9**: son dominio/aplicación, no "infraestructura" — **no** están anticipados por esa fila
  ni por ninguna otra de `proposal.md` §Risks. Si su diff real supera significativamente el
  presupuesto, `sdd-apply` **MUST pedir `size:exception` al usuario** antes de continuar con la
  siguiente tarea, con la misma regla que usaron T2 de la Fase 01 y T2/T8 de la Fase 02.

Ninguna tarea recorta tests, comentarios ni documentación para acercarse al presupuesto.

Estimación de líneas de autoría por tarea (propia de `sdd-tasks`, no medida — cada tarea la corrige
con su diff real al aplicarla):

| Tarea | Archivo(s) principal(es) | Estimado | Anticipado en Risks de `proposal.md` |
|---|---|---|---|
| T1 | `resolver-lugar.ts` + spec | ~130 | No (bajo presupuesto) |
| T2 | `validar-catalogo.ts` + spec (6 sub-validadores + parser jsonb) | ~700 | **No** — pregunta si excede |
| T3 | `collage.ts` + spec (+ dependencia `sharp`) | ~180 | No (bajo presupuesto) |
| T4 | puerto `FuenteCatalogo` + `csv.ts` + 2 adaptadores + specs (+ `csv-parse`) | ~420 | **Sí** — fila 4 (Sheets) |
| T5 | puerto `Almacenamiento` + `AlmacenamientoMinio` + módulo + config + Docker + Testcontainers + spec | ~380 | **Sí** — fila 4 (MinIO) |
| T6 | `descarga-drive.ts` + spec | ~260 | **Sí** — fila 4 (Drive) |
| T7 | puerto `RepositorioImportacionCatalogo` + adaptador Prisma + spec de integración | ~560 | **Sí** — fila 4 (repositorio) |
| T8 | `resolver-geografia-importacion.ts` + `procesar-fotos.ts` + specs | ~480 | **No** — pregunta si excede |
| T9 | `importar-catalogo.ts` + spec + wiring de módulo | ~400 | **No** — pregunta si excede |
| T10 | CLI + fixtures + cierre documental | ~220 | No (bajo presupuesto) |
| **Total** | | **~3.730** | |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1: `resolverLugar` (dominio, IMP9) | PR1 | `npm test -- catalogo/dominio/resolver-lugar` | N/A — dominio puro, sin I/O | Revertir `src/modulos/catalogo/dominio/resolver-lugar.ts` (+spec) |
| 2 | T2: `validarCatalogoCompleto` y sus 6 sub-validadores (IMP3-IMP8) | PR2 | `npm test -- catalogo/dominio/validar-catalogo` | N/A — dominio puro, sin I/O | Revertir `src/modulos/catalogo/dominio/validar-catalogo.ts` (+spec) |
| 3 | T3: `construirCollage` (`medios/aplicacion`, MED8) | PR3 | `npm test -- medios/aplicacion/collage` | N/A — `sharp` en memoria, sin red ni disco | Revertir `src/modulos/medios/aplicacion/collage.ts` (+spec); revertir dependencia `sharp` de `package.json` si nada más la usa aún |
| 4 | T4: `FuenteCatalogo` (Sheets + Directorio) + `csv.ts` (IMP1, IMP2) | PR4 | `npm test -- csv` + `npm run test:integracion -- fuente-catalogo` | `npm run test:integracion -- fuente-catalogo-sheets` contra un servidor HTTP local que simula CSV/HTML | Revertir `src/modulos/catalogo/puertos/fuente-catalogo.ts`, `src/modulos/catalogo/infraestructura/{csv,fuente-catalogo-directorio,fuente-catalogo-sheets}.ts` (+specs); revertir dependencia `csv-parse` |
| 5 | T5: `Almacenamiento` + `AlmacenamientoMinio` (MED1) + wiring de config/Docker/Testcontainers | PR5 | `npm run test:integracion -- almacenamiento-minio` | MinIO real vía Testcontainers (D9), arrancado en `globalSetup` | Revertir `src/modulos/medios/**`, `docker-compose.yml` (servicio `minio`), `.env.example`, `src/plataforma/config/esquema.ts` (variables `MINIO_*`), `test/soporte/contenedores.global-setup.ts`; revertir dependencias `@aws-sdk/client-s3`/`@testcontainers/minio` |
| 6 | T6: `descarga-drive.ts` (MED2, MED3, MED4) | PR6 | `npm test -- descarga-drive` + `npm run test:integracion -- descarga-drive` | Servidor HTTP local que simula respuestas de Drive (HTML, magic bytes) | Revertir `src/modulos/catalogo/infraestructura/descarga-drive.ts` (+spec) |
| 7 | T7: `RepositorioImportacionCatalogo` + `RepositorioImportacionPrisma` (IMP11) | PR7 | `npm run test:integracion -- repositorio-importacion` | Postgres real (base del worker), incluye el escenario de rollback | Revertir `src/modulos/catalogo/puertos/repositorio-importacion.ts`, `src/modulos/catalogo/infraestructura/repositorio-importacion-prisma.ts`, `test/integracion/catalogo/repositorio-importacion.spec.ts` |
| 8 | T8: `resolverGeografiaImportacion` + `ProcesarFotos` (MED5, MED6, MED9) | PR8 | `npm test -- catalogo/aplicacion/resolver-geografia-importacion` + `npm test -- catalogo/aplicacion/procesar-fotos` | N/A — dobles de `Almacenamiento`/`descarga-drive`/`REPOSITORIO_GEOGRAFIA`, sin infraestructura real | Revertir `src/modulos/catalogo/aplicacion/{resolver-geografia-importacion,procesar-fotos}.ts` (+specs) |
| 9 | T9: `ImportarCatalogo` (orquestador todo-o-nada) + wiring de `catalogo.module.ts` (IMP10, IMP12, IMP13 parcial, MED7) | PR9 | `npm test -- catalogo/aplicacion/importar-catalogo` | N/A — dobles de los tres puertos (`test/fakes/`) | Revertir `src/modulos/catalogo/aplicacion/importar-catalogo.ts` (+spec), `src/modulos/catalogo/catalogo.module.ts`, `src/modulos/catalogo/index.ts`, `src/modulos/catalogo/puertos/repositorio-producto.ts` (comentario) |
| 10 | T10: comando CLI + fixtures + cierre documental (IMP13 restante) | PR10 | `npm run catalogo:importar -- --dir test/fixtures/catalogo --solo-validar` + `npm run verify` completo | Comando real de punta a punta contra Postgres/Redis/MinIO reales (criterio de salida de la fase) | Revertir `scripts/importar-catalogo.ts` (+spec), el caso nuevo de `scripts/cli.ts`, la línea `catalogo:importar` de `package.json`, `test/fixtures/catalogo/**`, `.claude/skills/luxeboreal-arquitectura/SKILL.md` |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` antes de abrir
el siguiente, mismo orden que el Approach de `proposal.md`: dominio → puertos → fotos/collage →
orquestador → CLI):

```
PR1 (resolver-lugar) → PR2 (validar-catalogo) → PR3 (collage)
  → PR4 (FuenteCatalogo) → PR5 (Almacenamiento/MinIO) → PR6 (descarga-drive) → PR7 (repositorio)
  → PR8 (resolver-geografia + ProcesarFotos) → PR9 (ImportarCatalogo) → PR10 (CLI + fixtures + cierre)
```

---

## T1 — Dominio: resolución de departamento/ciudad a DANE (`resolver-lugar.ts`)

**Objetivo**: portar la resolución de nombres de departamento/ciudad a código DANE como función pura
(`design.md` D5), con tipos locales propios (`LugarDepartamento`/`LugarCiudad`) que no importan nada de
`modulos/geografia` (regla `dominio-aislado`).

**Dependencias**: ninguna (primera tarea de la fase).

**Archivos** (design.md, tabla "File Changes", fila 2):
- `src/modulos/catalogo/dominio/resolver-lugar.ts` (Create) — `LugarDepartamento`, `LugarCiudad`,
  `CatalogoLugares`, `LugarResuelto`, `resolverLugar(catalogo, departamentoTexto, ciudadTexto)`;
  compara nombres con `normalizarLugar` de `compartido/texto` (mismo criterio que CAT8/IMP9).
- `src/modulos/catalogo/dominio/resolver-lugar.spec.ts` (Create).

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`):
- `IMP9 — Un departamento y ciudad de la hoja se resuelven a su código DANE`
- `IMP9 — Un departamento sin match en geografia es una fila inválida que cita el texto exacto`
- `IMP9 — Una fila de cobertura con departamento y sin ciudad excluye todo el departamento`

**RED → GREEN → REFACTOR** (planificado; la transcripción real la registra `sdd-apply`):
1. RED: `resolver-lugar.spec.ts` con los 3 escenarios contra el módulo inexistente. Correr
   `npm test -- catalogo/dominio/resolver-lugar` y observar fallo.
2. GREEN: implementar `resolverLugar` (comparación por `normalizarLugar`, `ciudadId` nulo cuando la
   fila solo trae departamento) hasta que los 3 casos pasen.
3. REFACTOR: confirmar que el archivo no importa nada de `modulos/geografia` ni de NestJS/Prisma
   (regla `dominio-aislado`); solo `compartido/texto` y tipos propios.

**Hecho cuando**:
- Los 3 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- `resolverLugar` devuelve `null` (nunca adivina) cuando el texto no matchea ningún nombre (Q1).
- El archivo no depende de `modulos/geografia`, NestJS ni Prisma.

**Comando de test**: `npm test -- catalogo/dominio/resolver-lugar`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T2 — Dominio: validación del catálogo por pestaña (`validar-catalogo.ts`)

**Objetivo**: portar `validar.ts` del prototipo como función pura `validarCatalogoCompleto` (IMP3-IMP8):
seis sub-validadores (SKU/nombre/precio, fotos, peso/medidas, tarifas, parámetros jsonb con parser
propio por clave — Q3, excepciones de horario) sin ningún I/O.

**Dependencias**: T1 (`validarFilaTarifa`/`validarFilaCobertura` llaman a `resolverLugar`).

**Archivos** (design.md, tabla "File Changes", fila 1):
- `src/modulos/catalogo/dominio/validar-catalogo.ts` (Create) — `ErrorValidacionFila`,
  `AdvertenciaValidacion`, `ResultadoValidacionCatalogo`,
  `validarCatalogoCompleto(crudo, lugares, hoy)`; incluye el registro de parsers jsonb por clave
  conocida (`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`) y el criterio de
  advertencia para clave desconocida (Q3, R15).
- `src/modulos/catalogo/dominio/validar-catalogo.spec.ts` (Create).

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`, 19 escenarios — ver nota de
conteo arriba):
- `IMP3 — Un SKU vacío o con una forma distinta a SKU-XXXX es un error`
- `IMP3 — Un SKU repetido en dos filas es un error que cita la primera fila`
- `IMP3 — Un nombre o una descripción fuera de los límites de las listas de WhatsApp es un error`
- `IMP3 — Un precio que no es un entero positivo es un error`
- `IMP4 — Un producto activo sin fotos o con más de 6 es un error`
- `IMP4 — Un enlace de foto que no es http(s) es un error`
- `IMP4 — Un producto inactivo no necesita ninguna foto`
- `IMP5 — Peso y medidas vacíos se aceptan sin error`
- `IMP5 — Un peso o medida que no es un entero es un error en su columna`
- `IMP6 — Una franja de peso, un rango de precio o un rango de días invertido es un error`
- `IMP6 — Dos tarifas con franjas de peso distintas para el mismo destino conviven sin error`
- `IMP6 — Dos tarifas con la misma franja de peso para el mismo destino son un error de solape`
- `IMP7 — horario_atencion con JSON válido se guarda como objeto jsonb`
- `IMP7 — horario_atencion con un valor que no es JSON válido es un error`
- `IMP7 — recargo_contraentrega_pct y factor_volumetrico se guardan como número jsonb`
- `IMP7 — recargo_contraentrega_pct o factor_volumetrico no numérico es un error`
- `IMP7 — Una clave desconocida solo genera una advertencia y se guarda tal cual`
- `IMP8 — Una fecha en formato YYYY-MM-DD o DD/MM/YYYY se acepta`
- `IMP8 — Una fecha que no existe en el calendario es un error`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `validar-catalogo.spec.ts` con los 19 escenarios contra el módulo inexistente. Correr
   `npm test -- catalogo/dominio/validar-catalogo` y observar fallo.
2. GREEN: implementar los seis sub-validadores y el registro de parsers jsonb hasta que los 19 casos
   pasen. Recibe `hoy: Date` (nunca `Date.now()`/`new Date()`, regla del proyecto) para IMP8/excepciones
   futuras.
3. REFACTOR: confirmar que el archivo no importa nada fuera de sí mismo, `compartido/` y tipos propios
   de `resolver-lugar.ts` (mismo módulo `dominio/`, permitido); ningún parser de clave conocida queda
   como constante mágica sin nombre (R15).

**Nota de tamaño**: esta tarea excede el presupuesto de ~400 líneas por su naturaleza (6
sub-validadores + registro de parsers en un solo módulo cohesivo, 19 escenarios). No está anticipada
por nombre en la tabla de Risks de `proposal.md` (esa tabla anticipa solo los 4 archivos de
"infraestructura": Sheets, Drive, MinIO, repositorio) — si el diff real confirma un exceso
significativo, `sdd-apply` **MUST pedir `size:exception` al usuario** antes de continuar con T3.

**Hecho cuando**:
- Los 19 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Una clave de parámetro desconocida nunca produce un error, solo una advertencia (IMP7).
- El archivo no depende de NestJS, Prisma, Redis ni de ningún puerto.

**Comando de test**: `npm test -- catalogo/dominio/validar-catalogo`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T3 — `medios/aplicacion/collage.ts`: generación de collage

**Objetivo**: construir `construirCollage` (D12, MED8) — primer archivo del módulo nuevo `medios/`:
grilla 2×2 (≤4 fotos) o 2×3 (5-6 fotos), tiles 400×400 `cover`, JPEG calidad 85. Vive en `aplicacion/`,
no en `dominio/`, porque usa `sharp` (D12: la regla `dominio-aislado` prohibiría el import).

**Dependencias**: ninguna nueva.

**Archivos** (design.md, tabla "File Changes", fila 3):
- `src/modulos/medios/aplicacion/collage.ts` (Create) — `FotoParaCollage`,
  `construirCollage(fotos): Promise<Buffer>`.
- `src/modulos/medios/aplicacion/collage.spec.ts` (Create) — con buffers de imagen reales pequeños.
- `package.json` (Modify) — agrega `sharp` a `dependencies` (D10).

**Nota de secuencia (no reabre D10)**: `design.md` asigna el cambio de `package.json` a las slices
`(b, d)` porque agrupa ahí las tres dependencias nuevas de producción. En la práctica, `collage.ts`
(slice `(a)`, esta tarea) es el primer archivo que importa `sharp`, así que su instalación MUST
ocurrir aquí para que el ciclo RED→GREEN de esta tarea sea ejecutable. D10 ya decidió que `sharp` va
a `dependencies`, sin alternativa; esto solo ajusta **cuándo** se declara en `package.json`, no si.

**Escenarios cubiertos** (título exacto, `specs/medios/spec.md`):
- `MED8 — De 1 a 4 fotos generan un collage en grilla 2×2`
- `MED8 — 5 o 6 fotos generan un collage en grilla 2×3`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `collage.spec.ts` con los 2 escenarios (usando 4 y 6 buffers de imagen reales pequeños)
   contra el módulo inexistente. Correr `npm test -- medios/aplicacion/collage` y observar fallo.
2. GREEN: instalar `sharp`, implementar `construirCollage` (composición de tiles `cover`,
   codificación JPEG85) hasta que los 2 casos pasen.
3. REFACTOR: confirmar que `construirCollage` no recibe ningún puerto inyectado ni hace I/O (puro en
   comportamiento, aunque no en ubicación de carpeta — D12).

**Hecho cuando**:
- Los 2 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- El collage de 4 fotos tiene grilla 2×2 y el de 6 fotos tiene grilla 2×3, ambos con tiles 400×400.
- `sharp` queda en `dependencies`, no en `devDependencies` (regla de fronteras 9).

**Comando de test**: `npm test -- medios/aplicacion/collage`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T4 — Puerto `FuenteCatalogo` + adaptadores Sheets/Directorio + helper CSV

**Objetivo**: construir el puerto `FuenteCatalogo` (D2) con sus dos adaptadores intercambiables y el
helper `csv.ts` compartido (D10), cubriendo la lectura de las cinco pestañas y la detección de hoja no
compartida/pestaña inexistente (IMP1, IMP2).

**Dependencias**: ninguna nueva.

**Archivos** (design.md, tabla "File Changes", filas 4, 7-9):
- `src/modulos/catalogo/puertos/fuente-catalogo.ts` (Create) — `FUENTE_CATALOGO`, `NombrePestana`,
  `FilaCruda`, `MotivoPestanaNoDisponible`, `PestanaNoDisponible`, `FuenteCatalogo`.
- `src/modulos/catalogo/infraestructura/csv.ts` (Create) — helper `csv-parse/sync` compartido.
- `src/modulos/catalogo/infraestructura/csv.spec.ts` (Create) — parseo con campos entrecomillados y
  comas embebidas (soporte de IMP1, sin id propio).
- `src/modulos/catalogo/infraestructura/fuente-catalogo-directorio.ts` (Create) —
  `FuenteCatalogoDirectorio`, lee `<dir>/<nombre>.csv`.
- `src/modulos/catalogo/infraestructura/fuente-catalogo-directorio.spec.ts` (Create) — contra los
  fixtures reales (el mismo directorio que usará T10, o un fixture propio equivalente).
- `src/modulos/catalogo/infraestructura/fuente-catalogo-sheets.ts` (Create) —
  `FuenteCatalogoSheets`, descarga gviz CSV por pestaña, detección de HTML (IMP2).
- `src/modulos/catalogo/infraestructura/fuente-catalogo-sheets.spec.ts` (Create) — contra un servidor
  HTTP local que simula respuestas CSV/HTML.
- `package.json` (Modify) — agrega `csv-parse` a `dependencies` (D10).

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`):
- `IMP1 — Leer desde un directorio local carga las cinco pestañas del catálogo`
- `IMP1 — Leer desde Google Sheets descarga cada pestaña por su nombre`
- `IMP2 — Una hoja no compartida por enlace responde HTML y el importador falla con un error claro`
- `IMP2 — Una pestaña inexistente falla con un error que la nombra`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `csv.spec.ts` contra el helper inexistente. Correr `npm test -- csv` y observar fallo.
2. RED: `fuente-catalogo-directorio.spec.ts` y `fuente-catalogo-sheets.spec.ts` con los 4 escenarios
   contra los adaptadores inexistentes. Correr `npm run test:integracion -- fuente-catalogo` y
   observar fallo.
3. GREEN: instalar `csv-parse`, implementar `csv.ts`, `FuenteCatalogoDirectorio` y
   `FuenteCatalogoSheets` (con detección de `Content-Type: text/html` o cuerpo `<!DOCTYPE`/`<html`,
   IMP2) hasta que los specs pasen.
4. REFACTOR: confirmar que `aplicacion/` (aún no construida) no distinguirá cuál adaptador se usó —
   ambos devuelven exactamente `FilaCruda[]` con la misma forma.

**Hecho cuando**:
- Los 4 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- `FuenteCatalogoSheets` detecta HTML antes de intentar parsear como CSV.
- Una pestaña inexistente (archivo local o pestaña de Sheets) falla nombrando la pestaña faltante.
- `csv-parse` queda en `dependencies`.

**Comando de test**: `npm test -- csv` + `npm run test:integracion -- fuente-catalogo`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T5 — Puerto `Almacenamiento` + adaptador MinIO + wiring de config/Docker/Testcontainers

**Objetivo**: construir el módulo nuevo `medios` en su totalidad para el puerto `Almacenamiento` (D3,
MED1): `guardar`/`obtenerUrl`/`eliminar` sobre claves de objeto, con `AlmacenamientoMinio` sobre
`@aws-sdk/client-s3`, más el wiring de configuración, `docker-compose.yml` y el contenedor de pruebas
(D9).

**Dependencias**: ninguna nueva.

**Archivos** (design.md, tabla "File Changes", filas 5-6, 11, 15, 20-21):
- `src/modulos/medios/puertos/almacenamiento.ts` (Create) — `ALMACENAMIENTO`, `Almacenamiento`
  (`guardar`, `obtenerUrl`, `eliminar` — sin cuarto método, ver nota de idempotencia arriba).
- `src/modulos/medios/infraestructura/almacenamiento-minio.ts` (Create) — `AlmacenamientoMinio`
  (`S3Client`, `PutObjectCommand`, `DeleteObjectCommand`; `obtenerUrl` construye la URL pública de
  forma síncrona envuelta en `Promise.resolve`, D3).
- `src/modulos/medios/medios.module.ts`, `src/modulos/medios/index.ts` (Create).
- `test/integracion/medios/almacenamiento-minio.spec.ts` (Create) — contra MinIO real (Testcontainers).
- `src/plataforma/config/esquema.ts` (Modify, + `.spec.ts` si aplica) — ocho variables `MINIO_*` y
  `CATALOGO_SHEET_ID` (design.md §"Configuración").
- `docker-compose.yml` (Modify) — servicio `minio` (imagen `minio/minio`, `healthcheck` + volumen,
  mismo patrón que `postgres`/`redis`).
- `.env.example` (Modify) — documenta las ocho variables nuevas.
- `test/soporte/contenedores.global-setup.ts` (Modify) — arranca el tercer contenedor MinIO (D9).
- `package.json` (Modify) — agrega `@aws-sdk/client-s3` a `dependencies` y `@testcontainers/minio`
  (versión `^12.1.0`, D9) a `devDependencies`.

**Escenarios cubiertos** (título exacto, `specs/medios/spec.md`):
- `MED1 — Guardar un archivo lo asocia a una clave de objeto, no a una ruta de disco`
- `MED1 — Obtener la URL de una clave guardada devuelve una URL utilizable`
- `MED1 — Eliminar una clave borra el objeto correspondiente`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `almacenamiento-minio.spec.ts` con los 3 escenarios contra el puerto/adaptador inexistentes.
   Correr `npm run test:integracion -- almacenamiento-minio` y observar fallo (sin contenedor MinIO
   todavía en el `globalSetup`).
2. GREEN: agregar `@testcontainers/minio` al `globalSetup`, instalar `@aws-sdk/client-s3`, implementar
   `AlmacenamientoMinio`, las variables `MINIO_*` en `esquema.ts` y el servicio `minio` de
   `docker-compose.yml`, hasta que los 3 escenarios pasen contra MinIO real.
3. REFACTOR: confirmar que ninguna de las tres operaciones acepta ni devuelve una ruta de filesystem
   (MED1); que las credenciales de MinIO nunca se loguean (matriz de amenazas).

**Hecho cuando**:
- Los 3 escenarios listados pasan, con el título exacto del escenario como nombre del test, contra
  MinIO real (Testcontainers).
- `foto.clave_archivo`/`producto.clave_collage` siguen siendo claves de objeto, nunca rutas.
- `.env.example` documenta las ocho variables `MINIO_*`/`CATALOGO_SHEET_ID` sin valores reales.
- `npm run fronteras` sigue sin violaciones nuevas.

**Comando de test**: `npm run test:integracion -- almacenamiento-minio`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T6 — `descarga-drive.ts`: conversión de enlaces, carpeta, magic bytes

**Objetivo**: portar `drive.ts` del prototipo (conversión de enlaces de Google Drive a descarga
directa, detección de carpeta y validación de magic bytes JPEG/PNG/WEBP).

**Dependencias**: ninguna nueva.

**Archivos** (design.md, tabla "File Changes", fila 10):
- `src/modulos/catalogo/infraestructura/descarga-drive.ts` (Create) — conversión de enlaces
  (`/file/d/ID/`, `open?id=`, `uc?id=`), detección de carpeta, descarga + validación de magic bytes.
- `src/modulos/catalogo/infraestructura/descarga-drive.spec.ts` (Create).

**Escenarios cubiertos** (título exacto, `specs/medios/spec.md`):
- `MED2 — Un enlace de archivo de Drive en cualquiera de sus formatos se convierte a descarga directa`
- `MED2 — Un enlace que no es de Google Drive se conserva tal cual`
- `MED3 — Un enlace de carpeta de Drive se rechaza antes de intentar descargar`
- `MED4 — Una respuesta HTML se rechaza aunque no lo diga el content-type`
- `MED4 — Unos bytes que no son de JPEG, PNG ni WEBP se rechazan aunque el content-type diga imagen`
- `MED4 — Una imagen válida se acepta por sus magic bytes aunque el content-type sea genérico`

**RED → GREEN → REFACTOR** (planificado):
1. RED: casos de MED2/MED3 (conversión de enlaces, sin red) contra el módulo inexistente. Correr
   `npm test -- descarga-drive` y observar fallo.
2. RED: casos de MED4 (magic bytes) contra un servidor HTTP local que simula las tres respuestas.
   Correr `npm run test:integracion -- descarga-drive` y observar fallo.
3. GREEN: implementar la conversión de enlaces, el rechazo de carpetas y la validación de magic bytes
   (nunca solo `content-type`) hasta que los 6 casos pasen.
4. REFACTOR: confirmar que solo se aceptan enlaces `http://`/`https://` (matriz de amenazas, SSRF) y
   que un enlace de carpeta se rechaza **antes** de cualquier petición de red (MED3).

**Hecho cuando**:
- Los 6 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Un enlace de carpeta nunca dispara una petición HTTP (MED3).
- La validación de magic bytes nunca confía únicamente en `content-type` (MED4).

**Comando de test**: `npm test -- descarga-drive` + `npm run test:integracion -- descarga-drive`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T7 — Puerto `RepositorioImportacionCatalogo` + adaptador Prisma (escritura todo-o-nada)

**Objetivo**: construir el puerto `RepositorioImportacionCatalogo` (D6, D8) y su adaptador Prisma:
`leerEstadoActualPorSku()` (lectura fuera de transacción) y `escribirTodoONada(datos, hoy)` (una sola
`$transaction` interna con las seis escrituras de IMP11).

**Dependencias**: ninguna nueva (los tipos de `DatosImportacion`/`ResultadoImportacion` ya están
fijados en `design.md` §"Interfaces / Contracts").

**Archivos** (design.md, tabla "File Changes", filas 12-13):
- `src/modulos/catalogo/puertos/repositorio-importacion.ts` (Create) —
  `REPOSITORIO_IMPORTACION_CATALOGO`, `EstadoFotoActual`, `EstadoProductoActual`,
  `NuevaFotoImportada`, `NuevoProductoImportado`, `NuevaTarifaImportada`,
  `NuevaZonaSinCoberturaImportada`, `NuevoParametroImportado`, `NuevaExcepcionImportada`,
  `DatosImportacion`, `ResultadoImportacion`, `RepositorioImportacionCatalogo`.
- `src/modulos/catalogo/infraestructura/repositorio-importacion-prisma.ts` (Create) —
  `RepositorioImportacionPrisma.escribirTodoONada` abre `this.prisma.$transaction(async (tx) => {...})`
  internamente (D6): upsert de productos por SKU, borrar+recrear fotos, desactivar productos
  ausentes, reemplazo completo de tarifas/zonas, upsert de parámetros, sincronizar excepciones
  futuras (conserva pasadas).
- `test/integracion/catalogo/repositorio-importacion.spec.ts` (Create) — contra Postgres real,
  incluye el escenario de rollback.

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`):
- `IMP11 — Un producto nuevo se crea y uno existente se actualiza por su SKU`
- `IMP11 — Las fotos de un producto actualizado se reemplazan por completo`
- `IMP11 — Un producto ausente de la hoja se desactiva, nunca se borra`
- `IMP11 — tarifa_estimada y zona_sin_cobertura se reemplazan por completo en cada importación`
- `IMP11 — Las excepciones de horario futuras se sincronizan conservando las pasadas`
- `IMP11 — Un fallo dentro de la transacción revierte todos los cambios de esa importación`

**Nota de tamaño**: seis escrituras dentro de una sola transacción interactiva, más su rollback, no
se dividen sin romper la garantía todo-o-nada (D6, D11 requisito). Este archivo está **anticipado**
por la fila 4 de Risks de `proposal.md` ("... repositorio"): si el diff real confirma o supera el
estimado, `size:exception` se aplica automáticamente, citando esa fila; `sdd-apply` no pregunta.

**RED → GREEN → REFACTOR** (planificado):
1. RED: `repositorio-importacion.spec.ts` con los 6 escenarios contra el puerto/adaptador
   inexistentes. Correr `npm run test:integracion -- repositorio-importacion` y observar fallo.
2. GREEN: implementar `leerEstadoActualPorSku` y `escribirTodoONada` (las seis escrituras dentro de
   `$transaction`) hasta que los 6 escenarios pasen contra Postgres real, incluido el rollback
   provocando una restricción de base de datos a mitad de transacción.
3. REFACTOR: confirmar que `RepositorioImportacionPrisma` no usa `$queryRaw` (matriz de amenazas,
   solo *query builder*) y que `aplicacion/` (todavía no construida) nunca verá un cliente Prisma
   (regla de fronteras 12).

**Hecho cuando**:
- Los 6 escenarios listados pasan, con el título exacto del escenario como nombre del test, contra
  Postgres real.
- Un producto ausente de la hoja queda `activo = false`, nunca borrado.
- Un fallo a mitad de la transacción revierte las seis escrituras, sin dejar ningún resto parcial.
- `npm run fronteras` sigue sin violaciones nuevas.

**Comando de test**: `npm run test:integracion -- repositorio-importacion`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T8 — Resolución de geografía de importación + `ProcesarFotos`

**Objetivo**: construir los dos servicios de aplicación que preparan los datos antes de la escritura
todo-o-nada: `resolverGeografiaImportacion` (D5, carga el catálogo geográfico completo una vez por
corrida) y `ProcesarFotos` (D7, D8: descarga, redimensiona, sube a `Almacenamiento`, arma collage, con
idempotencia).

**Dependencias**: T3 (`ProcesarFotos` llama a `construirCollage`), T5 (puerto `Almacenamiento`), T6
(`descarga-drive.ts`).

**Archivos** (design.md, tabla "File Changes", filas 14, 16):
- `src/modulos/catalogo/aplicacion/resolver-geografia-importacion.ts` (Create, interno, no se exporta
  en `index.ts`) — inyecta `REPOSITORIO_GEOGRAFIA`, llama `listarDepartamentos()` +
  `listarCiudadesDe(id)` para cada uno (33 llamadas, `Promise.all`), mapea a los tipos locales de
  `resolver-lugar.ts` (D5).
- `src/modulos/catalogo/aplicacion/resolver-geografia-importacion.spec.ts` (Create).
- `src/modulos/catalogo/aplicacion/procesar-fotos.ts` (Create) — orquesta descarga (`descarga-drive`),
  `sharp` (MED6), `Almacenamiento.guardar` (con clave `catalogo/<sku>/foto-<orden>.jpg`, D4),
  `construirCollage`, idempotencia (D8: redescarga solo si `origenUrl` cambió o el objeto no existe,
  comprobado con `obtenerUrl` + `HEAD` HTTP contra la URL pública, ver nota arriba); devuelve fotos
  procesadas + claves de fotos sobrantes a borrar (D7, sin borrarlas aquí).
- `src/modulos/catalogo/aplicacion/procesar-fotos.spec.ts` (Create) — con dobles de
  `Almacenamiento`/`descarga-drive`.

**Escenarios cubiertos** (título exacto, `specs/medios/spec.md`):
- `MED5 — Una foto cuyo enlace no cambió y cuyo archivo existe no se vuelve a descargar`
- `MED5 — Una foto cuyo enlace cambió respecto a la importación anterior se redescarga`
- `MED5 — Una foto cuyo archivo ya no existe se redescarga aunque el enlace no haya cambiado`
- `MED6 — Una foto más grande que el límite se reduce a 1600 píxeles de lado más largo`
- `MED6 — Una foto más pequeña que el límite no se agranda`
- `MED9 — Reimportar sin ningún cambio de fotos no regenera el collage`
- `MED9 — Cambiar el enlace de una sola foto regenera el collage aunque las demás no cambien`
- `MED9 — Redescargar una foto por archivo faltante regenera el collage aunque el hash no haya cambiado`

**Nota de tamaño**: esta tarea combina dos archivos de aplicación (`resolver-geografia-importacion.ts`
es pequeño; `procesar-fotos.ts` es el más complejo del slice `(c)`, con idempotencia MED5/MED9 y
redimensionamiento MED6). No está anticipada por nombre en la tabla de Risks de `proposal.md`
(aplicación, no "infraestructura") — si el diff real supera significativamente el estimado,
`sdd-apply` **MUST pedir `size:exception` al usuario** antes de continuar con T9.

**RED → GREEN → REFACTOR** (planificado):
1. RED: `resolver-geografia-importacion.spec.ts` con un doble de `REPOSITORIO_GEOGRAFIA`, confirmando
   el mapeo a `CatalogoLugares`. Correr
   `npm test -- catalogo/aplicacion/resolver-geografia-importacion` y observar fallo.
2. RED: `procesar-fotos.spec.ts` con los 8 escenarios (dobles de `Almacenamiento`/descarga) contra el
   servicio inexistente. Correr `npm test -- catalogo/aplicacion/procesar-fotos` y observar fallo.
3. GREEN: implementar ambos servicios hasta que los specs pasen; `ProcesarFotos` calcula `fotosHash`
   con SHA-256 (`node:crypto`) de los `origenUrl` en orden (D8).
4. REFACTOR: confirmar que `resolver-geografia-importacion.ts` hace el mapeo entre tipos de
   `geografia` y los tipos locales de `resolver-lugar.ts` **antes** de llamar al dominio (D5); que
   `ProcesarFotos` nunca llama a `ALMACENAMIENTO.eliminar` (eso lo hace `ImportarCatalogo`, T9, D7).

**Hecho cuando**:
- Los 8 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- `ProcesarFotos` nunca redescarga una foto cuyo `origenUrl` no cambió y cuyo objeto sigue existiendo.
- El collage se regenera exactamente en los tres casos de MED9, nunca fuera de ellos.
- `resolverGeografiaImportacion` no se exporta en `catalogo/index.ts` (uso interno).

**Comando de test**: `npm test -- catalogo/aplicacion/resolver-geografia-importacion` + `npm test --
catalogo/aplicacion/procesar-fotos`

**Slice de PR**: S(c)

**Review requerida**: RDD

---

## T9 — `ImportarCatalogo`: orquestador todo-o-nada + wiring de módulos

**Objetivo**: construir el orquestador completo (`design.md` §"Data Flow"): lee las cinco pestañas,
resuelve geografía, valida, procesa fotos, escribe todo-o-nada, borra fotos sobrantes tras el éxito de
la transacción (D7, MED7), invalida `CACHE_CATALOGO` (IMP12); registra `GeografiaModule` y
`MediosModule` en `catalogo.module.ts` (D1, D5).

**Dependencias**: T2 (`validarCatalogoCompleto`), T4 (puerto `FuenteCatalogo`), T7 (puerto
`RepositorioImportacionCatalogo`), T8 (`ProcesarFotos`, `resolverGeografiaImportacion`).

**Archivos** (design.md, tabla "File Changes", filas 17-19):
- `src/modulos/catalogo/aplicacion/importar-catalogo.ts` (Create) — `ImportarCatalogo.ejecutar(origen,
  opciones)`: lee pestañas → resuelve geografía → valida → (si `--solo-validar`, reporta y termina,
  IMP13) → procesa fotos → `escribirTodoONada` → `ALMACENAMIENTO.eliminar(clave)` por cada foto
  sobrante (D7, MED7, solo tras el éxito de la transacción) → `CACHE_CATALOGO.invalidar()` (IMP12).
- `src/modulos/catalogo/aplicacion/importar-catalogo.spec.ts` (Create) — con dobles de los tres
  puertos (`test/fakes/`).
- `src/modulos/catalogo/catalogo.module.ts` (Modify) — importa `GeografiaModule` (D5) y `MediosModule`
  (D1); registra los nuevos *providers* de puertos.
- `src/modulos/catalogo/index.ts` (Modify) — exporta `ImportarCatalogo`.
- `src/modulos/catalogo/puertos/repositorio-producto.ts` (Modify) — corrige el comentario
  desactualizado ("ningún caso de uso escribe todavía en producto").

**Escenarios cubiertos** (título exacto):
- `IMP10 — Un SKU repetido deja la base sin ningún cambio` (`specs/catalogo/spec.md`)
- `IMP10 — Una foto que no se puede descargar aborta la importación sin escribir nada`
- `IMP10 — Un departamento sin match DANE deja la base sin ningún cambio`
- `IMP12 — Una importación exitosa invalida la caché de catálogo compacto`
- `IMP13 — --solo-validar reporta un catálogo válido sin escribir nada`
- `IMP13 — --solo-validar reporta los errores de validación y de fotos inaccesibles sin escribir nada`
- `MED7 — Un producto con menos fotos que antes borra las posiciones sobrantes del almacenamiento`
  (`specs/medios/spec.md`)

**Nota de tamaño**: orquestador que coordina los cuatro puertos + dominio + collage en una sola
secuencia todo-o-nada; no anticipado por nombre en Risks de `proposal.md` (aplicación, no
"infraestructura") — si el diff real supera significativamente el estimado, `sdd-apply` **MUST
pedir `size:exception` al usuario** antes de continuar con T10.

**RED → GREEN → REFACTOR** (planificado):
1. RED: `importar-catalogo.spec.ts` con los 7 escenarios (dobles de `FuenteCatalogo`,
   `RepositorioImportacionCatalogo`, `Almacenamiento`, `REPOSITORIO_GEOGRAFIA`) contra el orquestador
   inexistente. Correr `npm test -- catalogo/aplicacion/importar-catalogo` y observar fallo.
2. GREEN: implementar `ImportarCatalogo.ejecutar` siguiendo exactamente el orden de "Data Flow" hasta
   que los 7 escenarios pasen; registrar `GeografiaModule`/`MediosModule` en `catalogo.module.ts`.
3. REFACTOR: confirmar que ningún error de validación ni foto inaccesible llega a invocar
   `escribirTodoONada` (IMP10); que `ALMACENAMIENTO.eliminar` de fotos sobrantes ocurre **después**
   de que la transacción confirma, nunca antes ni durante (D7); que la invalidación de caché
   reutiliza `CACHE_CATALOGO.invalidar()` sin reimplementar nada (IMP12).

**Hecho cuando**:
- Los 7 escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Ningún error de validación o de foto deja un rastro parcial en los dobles del repositorio (IMP10).
- El doble de `Almacenamiento` recibe `eliminar` solo después de que el doble del repositorio confirma
  `escribirTodoONada` con éxito (MED7, D7).
- `catalogo.module.ts` no se importa todavía desde `AppModule` (mismo patrón que `geografia`/`horario`
  tras sus fases).

**Comando de test**: `npm test -- catalogo/aplicacion/importar-catalogo`

**Slice de PR**: S(d)

**Review requerida**: RDD

---

## T10 — Comando CLI + fixtures + cierre documental

**Objetivo**: exponer `catalogo:importar` (D11, IMP13 restante) sobre `scripts/importar-catalogo.ts`
(mismo patrón que `scripts/sembrar-geografia.ts`), construir los fixtures reales del criterio de salida
de la fase, y dejar constancia del módulo `medios` y la ampliación de `catalogo` en la skill de
arquitectura.

**Dependencias**: T9 (`ImportarCatalogo`), y por tanto todas las anteriores.

**Archivos** (design.md, tabla "File Changes", filas 22-25):
- `scripts/importar-catalogo.ts` (Create) — `importarCatalogo(argumentos)`, contexto
  `ContextoImportacionCatalogo` (`ConfiguracionModule`, `RelojModule`, `CatalogoModule`); exige
  exactamente uno de `--sheet-id`/`--dir` (IMP13); reenvía `--solo-validar`.
- `scripts/importar-catalogo.spec.ts` (Create) — parseo de argumentos (incluido el caso de ninguno de
  los dos flags).
- `scripts/cli.ts` (Modify) — caso nuevo `'catalogo:importar'`.
- `package.json` (Modify) — línea `"catalogo:importar": "npm run herramienta -- scripts/cli.ts
  catalogo:importar"` (D11).
- `test/fixtures/catalogo/{productos,tarifas,cobertura,parametros,excepciones_horario}.csv` (Create)
  — mismo formato que las pestañas de la hoja (IMP1).
- `test/fixtures/catalogo/fotos/*.jpg` (Create) — fotos reales pequeñas versionadas (Q4, no
  generadas), suficientes para cubrir 1-6 fotos por producto de al menos un producto de la fixture.
- `.claude/skills/luxeboreal-arquitectura/SKILL.md` (Modify) — §1: agrega `medios` a la lista de
  módulos y amplía la entrada de `catalogo` (dominio de importación, puertos nuevos).

**Nota de secuencia (no reabre D11)**: `design.md` asigna la línea de `package.json` a la slice `(d)`
por agruparla con el wiring de módulos, pero solo es funcional junto con `scripts/cli.ts` y
`scripts/importar-catalogo.ts` (ambos de la slice `(e)`). Se agrupan aquí, en la misma tarea, para que
`npm run catalogo:importar` sea ejecutable de punta a punta al cerrar esta tarea — no cambia el
contenido de la línea, solo en qué tarea se escribe.

**`docs/migracion/inventario.md`/`docs/fases/README.md` no se tocan en esta tarea**: los actualiza
`sdd-archive` al cerrar la fase (confirmado contra el precedente de T10 de la Fase 02 y T5 de la Fase
01, que dejan esa actualización fuera de `tasks.md`).

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`):
- `IMP13 — Ejecutar el comando sin --sheet-id ni --dir falla con un error claro`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `importar-catalogo.spec.ts` (parseo de argumentos) contra el módulo inexistente. Correr
   `npm test -- scripts/importar-catalogo` y observar fallo.
2. GREEN: implementar `importarCatalogo`, el caso nuevo de `scripts/cli.ts`, la línea de
   `package.json`, y construir los fixtures, hasta que el escenario pase y el comando corra de punta
   a punta.
3. REFACTOR: confirmar que el comando construye su propio contexto de aplicación al ejecutarse
   (`NestFactory.createApplicationContext`), nunca una conexión abierta al importar el módulo (A1).

**Verificación de cierre** (criterio de salida de la fase, `docs/fases/README.md` fila 03):
- `npm run catalogo:importar -- --dir test/fixtures/catalogo` deja productos, fotos (en MinIO) y
  collages listos, sin tocar la red.
- `npm run catalogo:importar -- --dir test/fixtures/catalogo --solo-validar` reporta válido sin
  escribir nada.
- Cada uno de los 59 escenarios de `specs/catalogo/spec.md` (IMP1-IMP13) y `specs/medios/spec.md`
  (MED1-MED9) tiene su test nombrado `"<id> — <título exacto>"` y pasa, confirmado con
  `--reporter=verbose`.
- `npm run verify` en verde.

**Hecho cuando**:
- El escenario IMP13 listado pasa, con el título exacto como nombre del test.
- El comando `catalogo:importar --dir <fixtures>` corre de punta a punta contra Postgres/Redis/MinIO
  reales, cumpliendo los 4 puntos de "Verificación de cierre" arriba.
- La skill `luxeboreal-arquitectura` §1 lista `medios` y la entrada de `catalogo` queda ampliada.
- `npm run verify` en verde.

**Comando de test**: `npm run catalogo:importar -- --dir test/fixtures/catalogo --solo-validar` +
`npm run verify` completo

**Slice de PR**: S(e)

**Review requerida**: RDD

---

## Preguntas para el usuario

Ninguna pregunta bloquea `sdd-apply`. Las ambigüedades reales encontradas al desglosar esta fase se
resolvieron dentro de este documento, sin reabrir ninguna decisión de Q1-Q4 ni de D1-D12:

1. **Idempotencia de fotos sin ampliar el puerto `Almacenamiento`** (resuelto arriba, sección
   dedicada): `ProcesarFotos` (T8) usa `obtenerUrl` + `HEAD` HTTP contra la URL pública en vez de un
   cuarto método del puerto. Esto respeta el contrato canónico de `Almacenamiento` que fija
   `design.md` §"Interfaces / Contracts" (solo `guardar`/`obtenerUrl`/`eliminar`) y resuelve lo que D8
   dejaba delegado a `sdd-tasks`/apply. Si el usuario prefiere en cambio ampliar el puerto con un
   método `existe(clave)` explícito (más simple de leer, algo más de superficie de contrato), puede
   vetarlo al aprobar y T5/T8 se ajustan antes de aplicar.
2. **Discrepancia de conteo de escenarios** (IMP3-IMP8: 19 reales vs. 17 anotados en la tabla "Testing
   Strategy" de `design.md`; IMP11: 6 reales) — no bloquea, ya mapeada arriba con los números reales.
3. Las seis preguntas ya listadas en `design.md` §"Open Questions" (D3 bucket público, D5 dependencia
   nueva `catalogo`→`geografia`, D6 transacción en el repositorio, D7 orden de borrado de fotos
   sobrantes, D11 ubicación del CLI, D12 ubicación de `collage.ts`) siguen pendientes de que el usuario
   las vete o las acepte al aprobar el diseño — no se repiten aquí porque ya están completas en ese
   documento; este `tasks.md` las da por vigentes tal como quedaron fijadas.
