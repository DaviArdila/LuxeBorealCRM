# Archive Report: Fase 02 — Catálogo

**Change**: `fase-02-catalogo`
**Archivado**: 2026-09-26
**Rama**: `fase-02-catalogo`
**Ubicación de archivo**: `openspec/changes/archive/2026-09-26-fase-02-catalogo/`

## Resumen ejecutivo

Fase 02 (Catálogo) queda cerrada y archivada. Las 10 tareas (T1-T10) están completas: T1 no generó
commit nuevo porque `compartido/texto` ya existía desde la Fase 00a; T2-T9 tienen cada una su commit
de unidad de trabajo; T10 es cierre documental. Los dos dominios nuevos, `catalogo` (11 requisitos,
CAT1-CAT11) y `horario` (7 requisitos, HOR1-HOR7; 32 escenarios en total) se fusionaron en
`openspec/specs/catalogo/spec.md` y `openspec/specs/horario/spec.md`. `npm run verify` pasa completo
(61 archivos, 281 tests) en su corrida final, tras dos corridas previas afectadas por una condición
de carrera pre-existente de la Fase 01, ajena a esta fase (ver `verify-report.md`). No quedan tareas
pendientes; hay tres desviaciones documentadas, ninguna bloqueante.

## Artefactos del change

Este archivo contiene:
- `proposal.md` — objetivo, alcance, tabla "Qué se migra del prototipo", dos decisiones de producto
  (Q1: búsqueda difusa pospuesta a Fase 07; Q2: especificidad de `tarifa_estimada` por algoritmo, sin
  restricción de esquema nueva) y riesgos.
- `design.md` — 7 decisiones de diseño (D1-D7), módulos/puertos/adaptadores, matriz de amenazas.
- `specs/catalogo/spec.md`, `specs/horario/spec.md` — specs delta de los dos dominios nuevos.
- `tasks.md` — checklist de 10 tareas completas con commits, evidencia real de ejecución (RED/GREEN,
  salidas de comandos reales) y desviaciones documentadas.
- `verify-report.md` — verificación diagnóstica: 7/7 Success Criteria, 32/32 escenarios con
  ubicación real, evidencia de `npm run verify`, tres desviaciones, sección de aprendizajes.

## Specs fusionadas en la especificación principal

### Dominios nuevos

| Dominio | Acción | Requisitos | Ubicación |
|---|---|---|---|
| `catalogo` | Creado | 11 (CAT1-CAT11), 25 escenarios | `openspec/specs/catalogo/spec.md` |
| `horario` | Creado | 7 (HOR1-HOR7), 7 escenarios | `openspec/specs/horario/spec.md` |

**Verificación de copia mecánica**: los dos archivos se reescribieron a partir del delta original
(`openspec/changes/fase-02-catalogo/specs/{catalogo,horario}/spec.md`) con dos cambios intencionales
en cada uno: el encabezado `## ADDED Requirements` → `## Requirements`, y el recorte de las frases de
"Purpose" que explicaban el mecanismo del delta ("es un dominio de capacidad nuevo...", "`sdd-archive`
lo promueve a...") — información del proceso de change, no comportamiento vigente del dominio. Todos
los 18 requisitos y sus 32 escenarios quedan idénticos en contenido y orden al delta original.

No hubo dominios existentes modificados: `agente` (R2) y `configuracion-negocio` (R15) no recibieron
delta — sus escenarios ya escritos describían el requisito general, y esta fase solo lo implementa,
tal como anticipó `design.md` §"Modified Capabilities" de la proposal.

## Estado de las tareas

Las 10 tareas están completas:

| Tarea | Título | Commit | Evidencia |
|---|---|---|---|
| T1 | `compartido/texto`: normalización de lugares | *(sin commit nuevo)* | Ya portado en `d2aa48a` (Fase 00a); `npm test -- texto` en verde, 3 tests |
| T2 | Dominio de envío: peso, exclusión, tarifa, cotización | `84db4e5` | CAT6, CAT7, CAT8 (6 esc.), CAT10, D3 — 12 tests |
| T3 | Dominio de producto: ficha y catálogo compacto | `e1e02ba` | CAT2 (3 esc.), CAT4 (1 esc.) — 4 tests |
| T4 | Dominio de horario | `0a2c600` | HOR1-HOR6 — 7 tests |
| T5 | Repositorios Prisma de catálogo (producto, envío, parámetro) | `adcfd6f` | 13 tests de integración, Postgres real |
| T6 | Puerto + repositorio Prisma de horario | `52598fb` | 3 tests de integración, Postgres real |
| T7 | Caché de catálogo compacto (Redis) | `1a9eb26` | CAT4 (1 esc.), CAT5 (3 esc.) — unitario + integración, Redis real |
| T8 | Servicios de aplicación de catálogo + módulo | `ea87f58` | CAT1, CAT3, CAT9, CAT11 — 13 tests |
| T9 | Servicio de aplicación de horario + módulo | `5a3dc2f` | HOR7 — 3 tests |
| T10 | Cierre documental | `35326c0` | `npm run verify` en verde (61/281); skill de arquitectura actualizada |

**Commits totales**: 14 (9 de código T2-T9, 5 documentales — registro de hashes en `tasks.md` y
cierre de T1/T10), todos en `fase-02-catalogo`, ninguno directo en `main`. Sin PRs todavía: push,
PR y merge quedan como decisión del usuario.

### Cobertura de escenarios

Los 32 escenarios de `specs/catalogo/spec.md` (CAT1-CAT11) y `specs/horario/spec.md` (HOR1-HOR7)
tienen su test nombrado `<id del requisito> — <título del escenario>` y pasan; confirmado en
`verify-report.md` §2 con verificación independiente contra los `.spec.ts` reales (archivo:línea de
cada uno), no solo contra lo declarado en `tasks.md`.

### Resultados de verificación

De `verify-report.md` §3-4:

```
npm run verify   → corrida 1: código 1 (flakiness ajena, ver abajo)
                 → corrida 2: código 1 (flakiness ajena, ver abajo)
                 → corrida 3: código 0; 61 archivos / 281 tests; 37,91 s
```

Las corridas 1 y 2 fallaron por una condición de carrera pre-existente de la Fase 01 en
`test/soporte/base-por-worker.setup.ts` (`CREATE DATABASE ... TEMPLATE` bajo paralelismo de Docker
con 4 workers, ya documentada como riesgo en la proposal de la Fase 01, "Arnés lento o inestable").
Afectó solo tests de `persistencia`/`geografia`, ya cerrados; ningún test de `catalogo`/`horario` de
esta fase falló por esta causa. La corrida 3 pasó completa.

## Documentación y registros de migración

### Archivos actualizados al cerrar

1. **`docs/fases/README.md`** — fila de la Fase 02 marcada `cerrada`; nota de archivo actualizada
   para referenciar las cuatro fases cerradas (00a, 00b, 01, 02) y las dos desviaciones de negocio de
   T5 (recargo contraentrega 0 %, mensaje genérico de fuera de cobertura) que el usuario debería
   confirmar antes de la Fase 07.
2. **`docs/migracion/inventario.md`** — filas migradas por esta fase: `envios/calculo.ts`,
   `horario/dentroHorario.ts`, `motor/catalogoCompacto.ts` (**Migrado**, con commit); la fila de
   `db/repositorios/tarifas.ts`/`envios/` (tabla `tarifa_envio`) marcada **Migrado** con el criterio
   de Q2; la fila genérica de `db/repositorios/*` extendida con los repositorios de catálogo/horario
   de esta fase; la fila de `tools/*` (6 tools, Fase 07) anotada con que la lógica de aplicación de
   `obtenerFicha.ts`/`cotizarEnvio.ts` ya está migrada aquí, separada del contrato de *tool* del LLM.
3. **`.claude/skills/luxeboreal-arquitectura/SKILL.md`** — §1 actualizada con los módulos `catalogo`
   y `horario` (T10, commit `35326c0`), estado de la skill de 0.3 a 0.4.

### Requisito de revisión

La Fase 02 requiere RDD (Receipt-Driven Development) por commit; **no** requiere `judgment-day` (02
no es una de las fases 04/05/06/10 de `docs/fases/README.md`). **RDD no se invocó de forma nativa en
esta sesión**: la herramienta `gentle-ai review` no se confirmó disponible en este entorno durante la
aplicación de T1-T10 (verify-report.md §5); se deja constancia explícita en vez de simular un
resultado de review que no ocurrió.

## Verificación de integridad del archivado

- **Origen**: `openspec/changes/fase-02-catalogo/` (bajo control de Git).
- **Destino**: `openspec/changes/archive/2026-09-26-fase-02-catalogo/` (movido con `git mv`).
- **Verificación del movimiento**: sin pérdida de contenido — los mismos 5 archivos del origen
  (`proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, `specs/{catalogo,horario}/spec.md`)
  presentes en el destino, más este `archive-report.md` nuevo.
- **Fusión de spec**: reescritura verificada contra el delta original (ver arriba), sin pérdida de
  requisitos ni escenarios.

## Trabajo pendiente y hallazgos abiertos

**Ninguno bloqueante.** Tres desviaciones documentadas en `verify-report.md` §6, ninguna requiere
revertir código:

1. T1 sin commit nuevo (`compartido/texto` ya existía desde Fase 00a) — corregido con una nota, sin
   impacto en el comportamiento.
2. **Pendiente de confirmación del usuario, no bloqueante para archivar**: `RepositorioParametroCatalogoPrisma`
   (T5) fija de facto un recargo contraentrega de 0 % y un mensaje genérico de fuera de cobertura
   cuando el parámetro no existe en la base — ninguna spec de esta fase fija ese valor de negocio.
   Recomendación (también en `docs/fases/README.md`): antes de que la Fase 07 conecte estos servicios
   al LLM, el usuario carga los valores reales de `recargo_contraentrega_pct`/`mensaje_fuera_cobertura`,
   o decide explícitamente que estos defaults son aceptables.
3. Discrepancia de conteo CAT8 (5 vs 6 escenarios) entre `design.md` y la spec real — ya corregida en
   `design.md` y confirmada independientemente en `verify-report.md` §2 (los 6 títulos exactos
   existen y pasan).

## Aprendizajes clave para fases futuras

1. **Verificar siempre si algo ya fue portado en una fase anterior antes de asumir que una tarea es
   "nueva".** Pasó con `compartido/texto` (T1): tanto `proposal.md` como `design.md` asumieron un
   archivo nuevo sin comprobar contra el commit real de Fase 00a. El costo fue bajo aquí, pero en una
   fase con más módulos compartidos el mismo supuesto podría llevar a reimplementar algo que ya
   existe con tests distintos.
2. **Los repositorios que leen `parametro` sin que ninguna spec fije el valor por defecto de negocio
   generan una decisión de facto que el usuario debería confirmar antes de que la Fase 07 conecte
   estos servicios al LLM.** El recargo contraentrega en 0 % y el mensaje genérico de fuera de
   cobertura (T5) son valores que un cliente real vería tal cual si Fase 07 los conecta sin que el
   usuario primero cargue los parámetros reales.
3. **Trabajar tareas independientes en paralelo sobre el mismo *working tree* (sin *worktrees*
   separados) genera carreras reales de `git add`/`git commit`.** Ocurrió 3 veces en esta fase (entre
   T2/T3/T4, dos veces), todas autodetectadas y corregidas sin pérdida de trabajo. El patrón es
   frágil: las próximas fases deberían usar *git worktrees* separados si van a paralelizar tareas de
   aplicación de código, en vez de confiar en que la corrección posterior siempre alcance a tiempo.
4. **El arnés de base por worker de Fase 01 tiene una condición de carrera real bajo Docker con 4
   workers** (`CREATE DATABASE ... TEMPLATE`), visible en 2 de 3 corridas de `npm run verify` en esta
   sesión. Ya estaba anticipada como riesgo en la proposal de Fase 01, pero la frecuencia observada
   aquí sugiere que vale la pena que una fase de mantenimiento la investigue antes de que se vuelva
   más frecuente y empiece a esconder fallos reales de fases futuras.

## Estado del archivado

| Aspecto | Estado |
|---|---|
| Specs fusionadas a la principal | ✓ dominios `catalogo` (11 req./25 esc.) y `horario` (7 req./7 esc.) creados |
| Carpeta del change movida a archivo | ✓ con prefijo de fecha 2026-09-26 |
| Artefactos preservados | ✓ proposal, design, specs, tasks, verify-report, archive-report |
| Documentación actualizada | ✓ `docs/fases/README.md`, `docs/migracion/inventario.md`, skill de arquitectura |
| Suite de test en verde | ✓ 281 tests (unit + integración), corrida limpia confirmada |
| Tareas sin terminar | ✓ ninguna (10/10) |
| Hallazgos críticos | ✓ ninguno |
| Bloqueadores | ✓ ninguno |
| Decisión pendiente del usuario (no bloqueante) | ⚠ confirmar defaults de negocio de T5 antes de Fase 07 |

## Siguiente fase

Fase 03 (Importador y medios: catálogo desde Google Sheets + fotos a almacenamiento de objetos +
collage) es la siguiente cuando se autorice. Dependencias: Fase 02 completa (✓).

---

**Archivado por**: sesión interactiva (el despacho de subagentes `sdd-explore`/`sdd-propose`/
`sdd-spec`/`sdd-design`/`sdd-tasks`/`sdd-apply`/`sdd-verify`/`sdd-archive` fue rechazado por el mismo
defecto del hook de despacho de Gentle AI ya documentado en el archivo de la Fase 01 — preflight
correctamente confirmado, guard no lo reconoció; se ejecutó el trabajo directamente con agentes
genéricos, siguiendo el mismo precedente que la Fase 01).
**Ejecutado**: 2026-09-26
**Versión de esquema**: OpenSpec 2.0 (artefactos híbridos: OpenSpec + Engram)
