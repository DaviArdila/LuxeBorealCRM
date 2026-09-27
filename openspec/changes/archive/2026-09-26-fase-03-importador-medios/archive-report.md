# Archive Report: Fase 03 — Importador y medios

**Change**: `fase-03-importador-medios`
**Archivado**: 2026-09-26
**Rama**: `fase-03-importador-medios`
**Ubicación de archivo**: `openspec/changes/archive/2026-09-26-fase-03-importador-medios/`

## Resumen ejecutivo

Fase 03 (Importador y medios) queda cerrada y archivada. Las 10 tareas (T1-T10) están completas, cada
una con su commit de unidad de trabajo confirmado en `git log` de la rama `fase-03-importador-medios`.
Los 13 requisitos nuevos de escritura del importador (`IMP1-IMP13`, 39 escenarios) quedaron anexados a
`openspec/specs/catalogo/spec.md` sin tocar los 11 requisitos CAT1-CAT11 ya fusionados en la Fase 02, y
los 9 requisitos del dominio nuevo `medios` (`MED1-MED9`, 20 escenarios) quedaron en
`openspec/specs/medios/spec.md`. `npm run verify` pasó completo (76 archivos, 366 tests, código de
salida 0) según `verify-report.md`, tras resolver un hallazgo ambiental de esa sesión (proceso
huérfano en un puerto HTTP fijo, ajeno al código de la fase). No quedan tareas pendientes; quedan 5
hallazgos abiertos declarados como deuda no bloqueante (0 críticos, 3 advertencias que requieren una
decisión o confirmación del usuario, 2 sugerencias menores — ver sección dedicada abajo), ninguno
impide archivar ni fusionar los delta specs.

## Artefactos del change

Este archivo contiene:
- `proposal.md` — objetivo, alcance, tabla "Qué se migra del prototipo", cuatro decisiones de producto
  (Q1: sin match de departamento/ciudad a DANE → fila inválida; Q2: pestaña `cobertura` nueva; Q3:
  parser jsonb propio por clave conocida de `parametro`; Q4: fotos reales en fixtures, sin
  placeholders sintéticos) y riesgos.
- `design.md` — decisiones D1-D12, módulos/puertos/adaptadores, matriz de amenazas.
- `specs/catalogo/spec.md`, `specs/medios/spec.md` — specs delta: extensión de `catalogo` (IMP1-IMP13)
  y dominio nuevo `medios` (MED1-MED9).
- `tasks.md` — checklist de 10 tareas completas, mapeo de 59 escenarios por tarea, pronóstico de
  presupuesto de revisión y `size:exception` automático para T4/T5/T6/T7.
- `verify-report.md` — verificación diagnóstica: cobertura de los 59 escenarios contra tests reales,
  criterio de salida de la fase confirmado por vía equivalente, puertas de calidad ejecutadas, y los 4
  hallazgos abiertos que pidió el usuario para esta sesión de archivo.

## Specs fusionadas en la especificación principal

### Dominio extendido

| Dominio | Acción | Requisitos nuevos | Ubicación |
|---|---|---|---|
| `catalogo` | Extendido (delta anexado) | 13 (IMP1-IMP13), 39 escenarios | `openspec/specs/catalogo/spec.md` |

**Verificación de composición nativa**: la fusión se ejecutó con
`gentle-ai sdd-archive-compose --canonical openspec/specs/catalogo/spec.md --delta
openspec/changes/fase-03-importador-medios/specs/catalogo/spec.md --output
openspec/specs/catalogo/spec.md.compose-tmp`, seguido de `mv` sobre el archivo canónico (escritura
atómica). Salida cero. El archivo resultante conserva los 11 requisitos CAT1-CAT11 (25 escenarios) de
la Fase 02 sin ningún cambio y anexa los 13 requisitos IMP1-IMP13 (39 escenarios): 24 requisitos y 64
escenarios totales, confirmados contando encabezados `### Requirement:`/`#### Scenario:` en el archivo
resultante.

### Dominio nuevo

| Dominio | Acción | Requisitos | Ubicación |
|---|---|---|---|
| `medios` | Creado | 9 (MED1-MED9), 20 escenarios | `openspec/specs/medios/spec.md` |

**Verificación de copia mecánica**: no existía `openspec/specs/medios/spec.md` previo, así que el
delta se copió mecánicamente por shell (`cp` a un archivo temporal dentro del mismo directorio
destino, `diff -r` contra el origen, `mv` atómico al nombre final) — nunca por Read/Write del modelo.
`diff -r` entre el delta original y la copia temporal fue vacío (código de salida 0) antes del `mv`.

## Estado de las tareas

Las 10 tareas están completas, con commit de unidad de trabajo confirmado en `git log` de la rama:

| Tarea | Título | Commit(s) | Evidencia (verify-report.md) |
|---|---|---|---|
| T1 | Dominio: resolución de departamento/ciudad a DANE | `6184871` (+ fix `0616557`) | IMP9 (3 esc.) |
| T2 | Dominio: validación del catálogo por pestaña | `ecfde9d` | IMP3-IMP8 (19 esc.) |
| T3 | `medios/aplicacion/collage.ts` | `17d3abc` | MED8 (2 esc.) |
| T4 | Puerto `FuenteCatalogo` + adaptadores Sheets/Directorio + `csv.ts` | `312f2c3` | IMP1, IMP2 (4 esc.) |
| T5 | Puerto `Almacenamiento` + adaptador MinIO + wiring config/Docker/Testcontainers | `74f8526` | MED1 (3 esc.) |
| T6 | `descarga-drive.ts` | `af86ab4` | MED2, MED3, MED4 (6 esc.) |
| T7 | Puerto `RepositorioImportacionCatalogo` + adaptador Prisma | `ece9719` | IMP11 (6 esc.) |
| T8 | Resolución de geografía de importación + `ProcesarFotos` | `76b4aa7` (+ fix `858e596`) | MED5, MED6, MED9 (8 esc.) |
| T9 | `ImportarCatalogo`: orquestador todo-o-nada + wiring de módulos | `5e1db77` | IMP10, IMP12, IMP13 parcial, MED7 (7 esc.) |
| T10 | Comando CLI + fixtures + cierre documental | `dfe2c6b` | IMP13 restante (1 esc.) |

**Commits totales**: 12 (10 de tarea + 2 correcciones intra-fase: `0616557` sobre T1, `858e596` sobre
T8), todos en `fase-03-importador-medios`, ninguno directo en `main`. Sin PRs todavía: push, PR y
merge quedan como decisión del usuario (mismo criterio de las fases anteriores).

### Cobertura de escenarios

Los 59 escenarios de `specs/catalogo/spec.md` (IMP1-IMP13) y `specs/medios/spec.md` (MED1-MED9) tienen
un test con su título exacto y pasan, confirmado en `verify-report.md` §1 contra los `.spec.ts` reales
(archivo:línea de cada uno), con una desviación documentada: el escenario combinado de IMP13
("--solo-validar reporta los errores de validación y de fotos inaccesibles sin escribir nada") no
demuestra la cláusula completa de "ambos problemas" porque `validarCatalogoCompleto` aborta en el
primer error de fila (D6/D7) — comportamiento real y consistente con el diseño aceptado, no un test
roto ni un defecto oculto (ver hallazgos abiertos, ítem 4).

### Resultados de verificación

De `verify-report.md` §2-3:

```
npm test (unit)                 → OK: 56 archivos, 286 tests
npm run test:integracion        → OK: 20 archivos, 80 tests (tras resolver un proceso huérfano
                                    en el puerto HTTP fijo del fixture de fotos, 47850 —
                                    hallazgo ambiental de esa sesión, no de la fase)
npm run lint                    → OK: sin errores
npm run typecheck               → OK: sin errores
npm run fronteras               → OK: sin violaciones (171 módulos, 378 dependencias)
npm run contrato:deriva         → OK: ambos documentos OpenAPI coinciden byte a byte
npm run verify (completo)       → OK: 76 archivos, 366 tests, código de salida 0
```

El criterio de salida de la fase (`docs/fases/README.md` fila 03: `npm run catalogo:importar -- --dir
<fixtures>` deja el catálogo y las fotos listos, todo-o-nada) no se pudo ejecutar como proceso de
shell independiente en la sesión de verificación (el clasificador de modo automático de esa sesión
denegó la invocación directa); se confirmó por la vía equivalente documentada en `verify-report.md` §2:
`test/integracion/catalogo/importar-catalogo-cli.spec.ts` invoca la misma función
`importarCatalogo(['--dir', ...])` contra Postgres/Redis/MinIO reales (Testcontainers) y un servidor
HTTP local que sirve las fotos del fixture, con sus dos tests en verde (`--solo-validar` sin escribir
nada; importación completa con 2 productos, fotos y collage confirmados en MinIO real vía
`HeadObjectCommand`).

## Documentación actualizada al cerrar

1. **`docs/fases/README.md`** — fila de la Fase 03 marcada `cerrada`; nota de archivo actualizada para
   referenciar las cinco fases cerradas (00a, 00b, 01, 02, 03) y los 5 hallazgos abiertos de esta fase
   que el usuario debería revisar antes de la Fase 09.
2. **`docs/migracion/inventario.md`** — filas migradas por esta fase: `catalogo/importar.ts` →
   `catalogo/aplicacion/importar-catalogo.ts` (T9); `catalogo/fuentes.ts` →
   `fuente-catalogo-sheets.ts`/`fuente-catalogo-directorio.ts` (T4); `catalogo/drive.ts` →
   `descarga-drive.ts` (T6); `catalogo/validar.ts` → `validar-catalogo.ts` (T2); `catalogo/cli.ts` →
   comando Nest CLI (T10); `catalogo/fotos.ts` → `procesar-fotos.ts` (T8); `media/collage.ts` →
   `medios/aplicacion/collage.ts` (T3), todas marcadas **Migrado** con su commit. `media/placeholder.ts`
   y `catalogo/notificar.ts` quedan explícitamente **sin migrar** (Posponer, Q4 y Fase 08
   respectivamente) — no se marcaron como migradas. La fila genérica de `db/repositorios/*` se extendió
   con una nota de migración **parcial**: esta fase porta el lado de escritura de
   `db/repositorios/catalogo.ts` (`repositorio-importacion-prisma.ts`, T7); el lado de lectura de ese
   mismo archivo del prototipo ya había migrado en la Fase 02.

No se tocó `.claude/skills/luxeboreal-arquitectura/SKILL.md` desde este archivado — T10 ya la actualizó
durante `sdd-apply`, según su propio registro en `tasks.md`; este cierre no repite ese cambio.

### Requisito de revisión

La Fase 03 requiere RDD (Receipt-Driven Development) por commit de unidad de trabajo; **no** requiere
`judgment-day` (03 no es una de las fases 04/05/06/10 de `docs/fases/README.md`, regla 6, confirmado en
`proposal.md` §"Decisiones ya tomadas" y en `tasks.md`). No hay evidencia en los artefactos de esta
fase (`tasks.md`, `verify-report.md`) de que `gentle-ai review` nativo se haya invocado en esta sesión
de cierre; se deja constancia explícita en vez de simular un resultado de revisión que no está
documentado.

## Verificación de integridad del archivado

- **Origen**: `openspec/changes/fase-03-importador-medios/` (bajo control de Git).
- **Destino**: `openspec/changes/archive/2026-09-26-fase-03-importador-medios/` (movido con `git mv`).
- **Verificación del movimiento**: `diff -r` entre una copia (`cp -R`) del origen tomada antes del
  movimiento y el destino después del movimiento — salida vacía, código de salida 0. Los mismos 5
  artefactos del origen (`proposal.md`, `design.md`, `tasks.md`, `verify-report.md`,
  `specs/{catalogo,medios}/spec.md`) están presentes en el destino, byte a byte, más este
  `archive-report.md` nuevo (aditivo, no existía en el origen).
- **Fusión de `catalogo`**: ejecutada por `gentle-ai sdd-archive-compose` (salida cero) — nunca por
  Read/Edit del modelo. Los 11 requisitos CAT1-CAT11 preexistentes quedan intactos; los 13 requisitos
  IMP1-IMP13 quedan anexados.
- **Copia de `medios`**: `cp` a un archivo temporal + `diff -r` (vacío) + `mv` atómico — nunca por
  Read/Write del modelo.
- **Directorio activo de changes**: `openspec/changes/` ya no contiene `fase-03-importador-medios/`;
  solo queda `openspec/changes/archive/`.

## Trabajo pendiente y hallazgos abiertos (deuda declarada, no bloqueante)

**Ninguno bloquea el archivado ni la fusión de los delta specs.** Esta fase se cierra con esta deuda
declarada explícitamente, tal como pidió el usuario para esta sesión, en vez de una completitud
sintética. 0 críticos, 3 advertencias (requieren decisión o confirmación explícita del usuario antes
de que otra fase dependa de ellas) y 2 sugerencias (menores, ya documentadas en código, sin impacto en
ningún escenario):

### Advertencias (requieren confirmación del usuario)

1. **Imagen de MinIO no oficial**: `docker-compose.yml` (línea 58) y
   `test/soporte/contenedores.global-setup.ts` (línea 63) usan `bitnamilegacy/minio:latest`, no
   `minio/minio` — Docker Hub retiró la imagen oficial gratuita en 2025 y `quay.io/minio/minio` exige
   login. Ambos archivos documentan el motivo en comentario extenso. Es una decisión de
   infraestructura tomada por necesidad durante `sdd-apply`, **no aprobada explícitamente por el
   usuario**. Pendiente de que el usuario la confirme o decida una alternativa antes de que la Fase 09
   despliegue producción (ADR-0012 decide el backend, no esta imagen específica).
2. **`.env.example` sin las 8 variables `MINIO_*`/`CATALOGO_SHEET_ID`**: no se pudo verificar ni
   completar directamente en ninguna sesión de esta fase — el permiso de sandbox bloqueó leer y
   escribir archivos `.env*` durante toda la fase (`sdd-apply` y `sdd-verify` lo documentaron por
   igual). Pendiente de que alguien con acceso al archivo real lo complete antes de que otra persona
   necesite levantar el entorno desde cero.
3. **Escenario combinado de IMP13 no demostrado punto por punto**: el test con el título exacto
   `"IMP13 — --solo-validar reporta los errores de validación y de fotos inaccesibles sin escribir
   nada"` pasa, pero no ejercita las dos causas de error en la misma corrida — `validarCatalogoCompleto`
   aborta en el primer error de fila (D6/D7 de `design.md`, IMP10), así que `ProcesarFotos` nunca llega
   a ejecutarse en esa corrida y no puede reportar además una foto inaccesible. Es el comportamiento
   real y documentado de la arquitectura, no un test que miente sobre su nombre; se registra como
   advertencia porque el texto exacto del escenario en `specs/catalogo/spec.md` sigue prometiendo algo
   que el contrato actual no puede demostrar combinado — el usuario decide si ajusta el texto del
   escenario en una fase de mantenimiento futura o lo acepta tal como quedó.

### Sugerencias (menores, sin impacto en ningún escenario)

4. **`ResultadoImportacion.productosActivados` cuenta el total importado, no los que quedan
   `activo=true`**: confirmado en `repositorio-importacion-prisma.ts` línea 200
   (`productosActivados: datos.productos.length`). Es solo un contador informativo del resultado;
   ningún escenario de las specs depende de este valor.
5. **`FUENTE_CATALOGO` no se registra como *provider* fijo en `catalogo.module.ts`**: documentado en
   comentario explícito en `importar-catalogo.ts` (líneas 56-62) — el adaptador (Sheets vs. Directorio)
   depende de un flag de CLI en tiempo de ejecución que solo conoce `scripts/importar-catalogo.ts`
   (T10); el módulo expone el token para que el contexto de aplicación del CLI lo provea. Decisión de
   cableado correctamente razonada y visible en código, no un defecto oculto; no afecta ningún
   escenario ni el criterio de salida de la fase.

## Aprendizajes clave para fases futuras

1. **Un proceso huérfano de una sesión anterior puede quedar ocupando un puerto HTTP fijo de un
   fixture de pruebas y aparentar una falla de infraestructura real (Testcontainers/Docker).** Ocurrió
   en la verificación de esta fase (`EADDRINUSE: 127.0.0.1:47850`): el diagnóstico correcto exigió
   identificar el PID huérfano antes de descartar Testcontainers como causa. Fases futuras con
   servidores HTTP de fixture en puerto fijo deberían cerrar explícitamente ese proceso al final de
   cada corrida de test, o usar un puerto efímero si el formato del fixture lo permite.
2. **Cuando la validación aborta en el primer error de fila (todo-o-nada), un escenario que promete
   demostrar "ambos problemas a la vez" en la misma corrida puede quedar sin poder demostrarse punto
   por punto, aunque el comportamiento real sea correcto y esté documentado.** Vale la pena que
   `sdd-spec` verifique, al redactar un escenario combinado, si el contrato de la función que valida
   permite realmente combinar las dos causas en una sola corrida, antes de prometerlo en el texto del
   escenario.
3. **Una decisión de infraestructura tomada por necesidad durante `sdd-apply` (como sustituir una
   imagen de Docker retirada por su editor original) queda como deuda de aprobación explícita, no como
   un defecto**, y debe declararse así en el archivo de cierre en vez de darse por aceptada
   silenciosamente porque los tests pasan contra ella.

## Estado del archivado

| Aspecto | Estado |
|---|---|
| Specs fusionadas a la principal | ✓ `catalogo` extendido (13 req./39 esc. nuevos) y `medios` creado (9 req./20 esc.) |
| Carpeta del change movida a archivo | ✓ con prefijo de fecha 2026-09-26, `diff -r` vacío |
| Artefactos preservados | ✓ proposal, design, specs, tasks, verify-report, archive-report |
| Documentación actualizada | ✓ `docs/fases/README.md`, `docs/migracion/inventario.md` |
| Suite de test en verde | ✓ 366 tests (unit + integración), según `verify-report.md` |
| Tareas sin terminar | ✓ ninguna (10/10) |
| Hallazgos críticos | ✓ ninguno |
| Bloqueadores | ✓ ninguno |
| Decisiones pendientes del usuario (no bloqueantes) | ⚠ imagen de MinIO, variables de `.env.example`, texto del escenario combinado de IMP13 |

## Siguiente fase

Fase 04 (Canal Chatwoot) es la siguiente cuando se autorice, según `docs/fases/README.md`. Dependencia
declarada en su fila del mapa de fases; no depende directamente de esta fase salvo por el orden general
de la hoja de ruta.

---

**Archivado por**: sesión interactiva de `sdd-archive` (ejecución directa de la fase, sin delegación
adicional).
**Ejecutado**: 2026-09-26
**Versión de esquema**: OpenSpec 2.0 (artefactos híbridos: OpenSpec + Engram)
