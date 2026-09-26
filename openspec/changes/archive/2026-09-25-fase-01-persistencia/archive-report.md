# Archive Report: Fase 01 — Persistencia

**Change**: `fase-01-persistencia`
**Archivado**: 2026-09-25
**Rama**: `fase-01-persistencia`
**Ubicación de archivo**: `openspec/changes/archive/2026-09-25-fase-01-persistencia/`

## Resumen ejecutivo

Fase 01 (Persistencia) queda cerrada y archivada. Las 5 tareas (T1-T5) están completas, cada una con
su commit de unidad de trabajo. El dominio nuevo `persistencia` (14 requisitos, PER1-PER14; 30
escenarios) se fusionó en `openspec/specs/persistencia/spec.md`. `npm run verify` pasa las seis
comprobaciones (~53 s) y `npm run test:e2e` pasa (8/8, ~11 s). No quedan tareas pendientes ni
hallazgos bloqueantes (ver `verify-report.md`).

## Artefactos del change

Este archivo contiene:
- `proposal.md` — objetivo, alcance, tabla "Qué migra del prototipo", riesgos (incluida la excepción
  de tamaño prevista para T2).
- `design.md` — 12 decisiones de diseño (D1-D12), matriz de amenazas, secuencia de slices S1-S5.
- `specs/persistencia/spec.md` — spec delta del dominio nuevo (14 requisitos, 30 escenarios).
- `tasks.md` — checklist de 5 tareas completas con commits, evidencia real de ejecución (RED/GREEN,
  salidas de comandos reales) y desviaciones documentadas.
- `verify-report.md` — verificación diagnóstica: cobertura de escenarios, cruce contra `design.md`,
  checklist de cierre §12.

## Specs fusionadas en la especificación principal

### Dominio nuevo

| Dominio | Acción | Requisitos | Ubicación |
|---|---|---|---|
| `persistencia` | Creado | 14 (PER1-PER14), 30 escenarios | `openspec/specs/persistencia/spec.md` |

**Verificación de copia mecánica**: copiado con `cp` desde
`openspec/changes/fase-01-persistencia/specs/persistencia/spec.md`, confirmado con `diff` (vacío
salvo dos cambios intencionales: el encabezado `## ADDED Requirements` → `## Requirements`, y el
recorte del texto de "Purpose" que explicaba el mecanismo del delta — información del proceso de
change, no comportamiento vigente del dominio). Los 14 requisitos y sus 30 escenarios quedan
byte a byte idénticos al delta original.

No hubo dominios existentes modificados: la nota de `specs/persistencia/spec.md` ya aclaraba "No hay
delta de `plataforma`" (PLT7 se queda igual; D11 decidió que la verificación de deriva de la
migración es un test de `integracion`, no un paso nuevo de `npm run verify`).

## Estado de las tareas

Las 5 tareas están completas, con commit de unidad de trabajo cada una:

| Tarea | Título | Commit | Evidencia |
|---|---|---|---|
| T1 | Arnés: plantilla + base por worker + prefijo de Redis | `c69f12f` | PER10 (2 escenarios); `npm run verify` 42 archivos/184 tests |
| T2 | Esquema v1 + migración inicial + guardias `[manual]` | `e195a4f` | PER1-PER9 (19 escenarios); migración real aplicada desde cero, `migrate diff --exit-code` código 0 |
| T3 | Repositorio de geografía + regla de fronteras 12 | `4636f4b` | PER13-PER14 (5 escenarios); `fronteras` 0 violaciones |
| T4 | Semilla DANE: descarga, intérprete, idempotencia | `ed5adfd` | PER11-PER12 (4 escenarios); semilla corrida dos veces, `insertados=0` en la segunda |
| T5 | Cierre documental | `6b54ead` (+ `e14c02e` registro de hash) | Checklist §12; 30/30 escenarios confirmados con test nombrado |

**Líneas de autoría totales**: ~3 615 (365 + 1 730 + 448 + 672 + 84 + 3, por tarea, excluyendo
generados: cliente Prisma, SQL de migración salvo bloques `[manual]`, `divipola.json`,
`package-lock.json`). T2 recibió `size:exception` explícito del usuario (una sola migración inicial
con 21 tablas no se parte sin cambiar ese acuerdo, ya anticipado en `proposal.md`/`design.md`).
Entregado en 5 PRs encadenados, estrategia `stacked-to-main` (`auto-chain`).

### Cobertura de escenarios

Los 30 escenarios de `specs/persistencia/spec.md` (PER1-PER14) tienen su test nombrado
`<id del requisito> — <título del escenario>` y pasan; confirmado con búsqueda literal contra
`test/` (100 % de cobertura nombrada desde el primer intento, a diferencia del 58 % que registró
`verify-report.md` de la Fase 00b — ver "Aprendizajes" abajo).

### Resultados de verificación

De `verify-report.md`:

```
npm run verify   → código 0; 47 archivos / 217 tests; 52,72 s (< 3 min, PLT7)
npm run test:e2e → código 0; 1 archivo / 8 tests; 10,89 s
```

Un fallo transitorio de contención de Testcontainers (`terminating connection due to administrator
command`) apareció en el primer intento y desapareció al repetir; ya documentado como patrón
conocido en T2/T3 (`design.md` D6).

## Documentación y registros de migración

### Archivos actualizados al cerrar

1. **`docs/fases/README.md`** — fila de la Fase 01 marcada `cerrada`; nota de archivo actualizada
   para referenciar las tres fases cerradas (00a, 00b, 01).
2. **`docs/migracion/inventario.md`** — filas migradas por esta fase: `db/prisma.ts` +
   repositorios (**Migrado** — `PrismaService` + `repositorio-geografia-prisma.ts`); las filas de
   `estadoConversacion`, `tarifas`/`envios` y contacto por teléfono (destino en 2 fases) quedan
   anotadas con lo que aportó específicamente la Fase 01 (esquema), sin marcarse "Migrado" completo
   porque su repositorio/lógica real llega en las fases 02/04/05; fila de `MODELO_DATOS.md`
   actualizada a "v1 aprobada".
3. **ADR-0007, ADR-0009** — recibieron su nota "Implementado en la Fase 01" durante T5 (antes de
   este archivado).

### Requisito de revisión

La Fase 01 requiere RDD (Receipt-Driven Development) por commit; **no** requiere `judgment-day`
(01 no es una de las fases 04/05/06/10 de `docs/fases/README.md`).

## Verificación de integridad del archivado

- **Origen**: `openspec/changes/fase-01-persistencia/` (bajo control de Git).
- **Destino**: `openspec/changes/archive/2026-09-25-fase-01-persistencia/` (movido con `git mv`).
- **Verificación del movimiento**: sin pérdida de contenido — los mismos 6 archivos
  (`proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, `archive-report.md`,
  `specs/persistencia/spec.md`) presentes en el destino.
- **Fusión de spec**: copia mecánica verificada con `diff` (ver arriba), sin pérdida de datos.

## Trabajo pendiente y hallazgos abiertos

**Ninguno.** Las 5 tareas están completas. Ambas desviaciones documentadas (`size:exception` de T2;
los dos huecos de `dependency-cruiser` encontrados en T3/T4) ya quedaron resueltas dentro de sus
propias tareas, con su ciclo RED→GREEN.

## Aprendizajes clave para fases futuras

1. **Nombrar el test con el título exacto del escenario desde la primera escritura evita
   remediación posterior**: la Fase 01 llegó a 30/30 escenarios con nombre literal en el primer
   intento, frente al 58 % inicial de la Fase 00b (que necesitó un commit de remediación aparte);
   la disciplina de declarar el nombre exacto en "Hecho cuando" antes de escribir el test funcionó.
2. **La contención de Testcontainers bajo corridas repetidas de `npm run verify` es un patrón
   recurrente, no un caso aislado**: apareció de forma independiente en T2, T3 y en esta
   verificación final; repetir la corrida una vez basta para confirmar si es real o transitorio,
   y no debe tratarse como regresión sin repetir primero.
3. **Una regla de fronteras nueva revela huecos en las reglas existentes que nadie había
   ejercitado**: tanto la regla 3 (`dominio-aislado`) como la regla 8 (`src-no-importa-test`)
   carecían de la excepción para archivos `.spec.ts` desde la Fase 00a, pero el hueco solo se
   manifestó cuando el primer módulo de negocio real (`geografia`) escribió un test unitario junto
   a `dominio/` y otro junto a `aplicacion/` importando un doble de `test/fakes/`. Revisar las
   reglas de fronteras contra el primer caso de uso real de cada patrón nuevo, no solo contra
   fixtures sintéticos.
4. **Una migración inicial con muchas tablas es una excepción de tamaño legítima, no un fallo de
   planeación**: `proposal.md` y `design.md` anticiparon correctamente que T2 (~1730 líneas)
   superaría el presupuesto de ~400 líneas por PR; documentar la excepción de antemano evitó
   sorpresas al pedir `size:exception`.

## Estado del archivado

| Aspecto | Estado |
|---|---|
| Spec fusionada a la principal | ✓ dominio `persistencia` creado, 14 requisitos/30 escenarios |
| Carpeta del change movida a archivo | ✓ con prefijo de fecha 2026-09-25 |
| Artefactos preservados | ✓ proposal, design, specs, tasks, verify-report, archive-report |
| Documentación actualizada | ✓ `docs/fases/README.md`, `docs/migracion/inventario.md` |
| Suites de test en verde | ✓ 217 tests (unit+integración) + 8 e2e |
| Tareas sin terminar | ✓ ninguna (5/5) |
| Hallazgos críticos | ✓ ninguno |
| Bloqueadores | ✓ ninguno |

## Siguiente fase

Fase 02 (Catálogo: lectura de productos, ficha con dinero formateado, cobertura por exclusión +
rango aproximado de envío, horario de atención) es la siguiente cuando se autorice. Dependencias:
Fase 01 completa (✓).

---

**Archivado por**: sesión interactiva (el despacho de subagentes `sdd-verify`/`sdd-archive` fue
rechazado por un defecto del hook de despacho de Gentle AI — preflight correctamente confirmado dos
veces sin que el guard lo reconociera; el usuario autorizó continuar sin reportarlo y ejecutar el
trabajo directamente).
**Ejecutado**: 2026-09-25
**Versión de esquema**: OpenSpec 2.0 (artefactos híbridos: OpenSpec + Engram)
