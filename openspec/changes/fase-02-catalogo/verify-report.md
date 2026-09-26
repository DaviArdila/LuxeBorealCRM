# Verify Report: Fase 02 — Catálogo

**Change**: `fase-02-catalogo`
**Verificado**: 2026-09-26 (tras T10, antes de archivar)
**Rama**: `fase-02-catalogo`
**Tipo**: registro de cierre de fase (`openspec/config.yaml` §rules.verify: obligatorio antes de
archivar, no bloquea `sdd-archive` por sí mismo pero MUST estar completo).

## Resumen ejecutivo

Las 10 tareas de la fase (T1-T10) están completas. T1 no generó commit nuevo porque
`compartido/texto` ya existía desde la Fase 00a; T2-T9 tienen cada una su commit de unidad de
trabajo; T10 es cierre documental. Los 32 escenarios de las specs delta (`specs/catalogo/spec.md`,
CAT1-CAT11; `specs/horario/spec.md`, HOR1-HOR7) tienen su test nombrado
`"<id del requisito> — <título del escenario>"` y pasan, verificado leyendo directamente cada
`.spec.ts` citado abajo (no solo lo que declara `tasks.md`). `npm run verify` está en verde en su
corrida final, con una flakiness pre-existente de Fase 01 documentada aparte. No se encontraron
hallazgos bloqueantes. RDD no se invocó de forma nativa en esta sesión.

## 1. Resultado de los Success Criteria de `proposal.md`

- [x] **Los tests de cálculo de envío y de horario, portados del prototipo, pasan.** —
  `src/modulos/catalogo/dominio/envio.spec.ts` (CAT6, CAT7, CAT8, CAT10) y
  `src/modulos/horario/dominio/horario.spec.ts` (HOR1-HOR6), ambos en verde (T2, T4).
- [x] **La ficha de producto expone precio y recargo contraentrega como texto ya formateado,
  reutilizando `compartido/dinero` sin nueva lógica de formateo.** —
  `src/modulos/catalogo/dominio/producto.spec.ts`, escenarios `CAT2 — La ficha expone el precio
  como texto formateado` y `CAT2 — La ficha expone el recargo contraentrega leído del parámetro del
  negocio` (T3); `armarFicha` solo llama a `formatearCop`/`formatearRecargoContraentrega`, no
  reimplementa cálculo (design.md D6).
- [x] **La cobertura de envío evalúa exclusión antes que tarifa; sin match, registra
  `evento_fuera_cobertura` y no ofrece ningún rango.** — `CAT7 — Un destino en
  zona_sin_cobertura se trata como sin cobertura aunque exista una tarifa que calzaría`
  (`envio.spec.ts`, T2) y `CAT9 — Sin cobertura por ausencia de tarifa se registra el evento con el
  producto y el destino` (`catalogo/aplicacion/cotizar-envio.spec.ts`, T8).
- [x] **El horario de atención respeta**: excepción gana sobre patrón (`HOR1`), sin parámetro se
  asume dentro (`HOR2`), rango que cruza medianoche se evalúa bien (`HOR6`) — los tres en
  `horario/dominio/horario.spec.ts` (T4).
- [x] **La caché de catálogo se invalida por versión sin esperar el TTL y es un *provider*
  inyectable, no un singleton de módulo.** — `CACHE_CATALOGO` es un token de puerto con adaptador
  `@Injectable()` (`CacheCatalogoRedis`, D2 de `design.md`); los 3 escenarios de `CAT5` pasan en
  `src/modulos/catalogo/infraestructura/cache-catalogo-redis.spec.ts` (fake de Redis) y de nuevo en
  `test/integracion/catalogo/cache-catalogo-redis.spec.ts` (Redis real, "otro proceso") (T7).
- [x] **`npm run verify` en verde.** — ver §4; corrida final limpia, dos corridas previas con
  flakiness ajena a esta fase.
- [x] **Cada escenario de las specs delta de `catalogo` y `horario` tiene su test nombrado
  `<id> — <título>` y pasa.** — ver §2, verificación independiente contra los `.spec.ts` reales.

Los 7 criterios de `proposal.md` §"Success Criteria" están cumplidos.

## 2. Cobertura de escenarios (32/32)

Verificación independiente: se tomó cada `#### Scenario:` de `specs/catalogo/spec.md` y
`specs/horario/spec.md` y se buscó su título literal contra los `.spec.ts` reales del repo (no solo
la tabla de `tasks.md`). Resultado: **las 32 líneas aparecen, cada una en al menos un archivo**, sin
faltantes:

| Requisito | Escenarios | Archivo(s) real(es) |
|---|---|---|
| CAT1 (2) | listado sin precio, excluye inactivos | `src/modulos/catalogo/aplicacion/listar-productos-activos.spec.ts:44,53` |
| CAT2 (3) | precio formateado, recargo formateado, indica fotos | `src/modulos/catalogo/dominio/producto.spec.ts:25,31,37` |
| CAT3 (2) | ficha inactivo rechaza, ficha inexistente rechaza | `src/modulos/catalogo/aplicacion/obtener-ficha-producto.spec.ts:49,63` |
| CAT4 (2) | no refleja escritura directa; compacto sin precios ordenado | `src/modulos/catalogo/infraestructura/cache-catalogo-redis.spec.ts:60` + `test/integracion/catalogo/cache-catalogo-redis.spec.ts:67` (escenario 1); `src/modulos/catalogo/dominio/producto.spec.ts:45` (escenario 2) |
| CAT5 (3) | invalidar incrementa versión, siguiente lectura ve cambio, otro proceso invalida igual | `src/modulos/catalogo/infraestructura/cache-catalogo-redis.spec.ts:73,83,99` + `test/integracion/catalogo/cache-catalogo-redis.spec.ts:80,90,106` (los 3, en ambos niveles) |
| CAT6 (3) | volumétrico gana, real gana, sin datos pesa cero | `src/modulos/catalogo/dominio/envio.spec.ts:31,37,43` |
| CAT7 (1) | exclusión sobre tarifa que calzaría | `src/modulos/catalogo/dominio/envio.spec.ts:51` |
| CAT8 (6) | ciudad exacta gana, cae a departamento, tarifa que no cubre peso cae, ciudad-distrito, franja de peso, sin tarifa aplica | `src/modulos/catalogo/dominio/envio.spec.ts:65,73,80,100,107,127` |
| CAT9 (1) | evento fuera de cobertura con producto y destino | `src/modulos/catalogo/aplicacion/cotizar-envio.spec.ts:72` |
| CAT10 (1) | cotización con cobertura, rango/días formateados | `src/modulos/catalogo/dominio/envio.spec.ts:177` |
| CAT11 (1) | sin cobertura, mensaje del parámetro, sin rango | `src/modulos/catalogo/aplicacion/cotizar-envio.spec.ts:104` |
| HOR1 (1) | excepción cierra el día | `src/modulos/horario/dominio/horario.spec.ts:17` |
| HOR2 (1) | sin parámetro se asume dentro | `src/modulos/horario/dominio/horario.spec.ts:26` |
| HOR3 (1) | forma inválida advierte y asume dentro | `src/modulos/horario/dominio/horario.spec.ts:34` |
| HOR4 (1) | día fuera del patrón se asume dentro | `src/modulos/horario/dominio/horario.spec.ts:44` |
| HOR5 (1) | null/vacío se asume fuera | `src/modulos/horario/dominio/horario.spec.ts:53` |
| HOR6 (1) | cruce de medianoche | `src/modulos/horario/dominio/horario.spec.ts:62` |
| HOR7 (1) | usa el momento del Clock inyectado | `src/modulos/horario/aplicacion/horario-atencion.spec.ts:39` |

Total: 25 (catálogo) + 7 (horario) = **32/32**, cada uno con su título exacto encontrado en el
archivo citado. `CAT4`/`CAT5` quedan cubiertos por partida doble (fake de Redis + Redis real de
integración), consistente con `design.md` §"Testing Strategy" (un mismo escenario probado a dos
niveles no es una discrepancia).

Nota adicional encontrada al leer `cotizar-envio.spec.ts` que `tasks.md` no menciona explícitamente:
además del escenario nombrado `CAT9`, el archivo tiene un segundo test,
`CAT9 — el evento registrado lleva el producto_id y el destino, con departamentoId/ciudadId en null
(D7)` (línea 85), que refuerza D7 (`departamentoId`/`ciudadId` en `null`) sin ser un escenario nuevo
de la spec — es cobertura adicional, no una discrepancia de conteo.

## 3. `npm run verify` (evidencia de T10)

Según `tasks.md` §"T10 — Evidencia de aplicación (2026-09-26)":

- **Corrida 1 y 2**: fallaron por una condición de carrera pre-existente de la Fase 01 en
  `test/soporte/base-por-worker.setup.ts` (`CREATE DATABASE ... TEMPLATE` bajo paralelismo de
  Docker con 4 workers) — riesgo ya documentado en la proposal de la Fase 01 ("Arnés lento o
  inestable"). Afectó solo tests de `persistencia`/`geografia`, ya cerrados en Fase 01; ningún test
  de `catalogo`/`horario` de esta fase falló por esta causa.
- **Corrida 3**: **en verde, completa**: `lint`, `typecheck`, `fronteras` (dependency-cruiser),
  deriva del contrato y tests unitarios + integración, **61 test files, 281 tests aprobados**.

No se re-ejecutó `npm run verify` para este reporte (verificación de solo lectura sobre el resto del
repo); el resultado citado es la evidencia real registrada en `tasks.md` al cerrar T10, no una
afirmación nueva sin respaldo.

## 4. Commits de la fase

De `git log --oneline b4fd0ea..HEAD` (rango real desde la aprobación de proposal/specs/design/tasks
hasta el cierre de T10):

| Commit | Mensaje | Tarea |
|---|---|---|
| `9d85d43` | docs(02): cerrar T1 sin commit nuevo (compartido/texto ya portado en Fase 00a) | T1 (sin código) |
| `0a2c600` | feat(horario): agregar dominio de decision dentro y fuera de horario | T4 |
| `84db4e5` | feat(catalogo): agregar dominio de calculo de envio y cobertura | T2 |
| `e1e02ba` | feat(catalogo): agregar dominio de ficha de producto y catalogo compacto | T3 |
| `4548444` | docs(02): registrar hashes de commit de T2, T3 y T4 en tasks.md | doc |
| `52598fb` | feat(horario): agregar puerto y repositorio prisma de horario | T6 |
| `adcfd6f` | feat(catalogo): agregar repositorios prisma de producto, envio y parametro | T5 |
| `4178e46` | docs(02): registrar hashes de commit de T5 y T6 en tasks.md | doc |
| `5a3dc2f` | feat(horario): agregar servicio de aplicacion y modulo de horario | T9 |
| `1a9eb26` | feat(catalogo): agregar cache de catalogo compacto con invalidacion por version | T7 |
| `c333a7f` | docs(02): registrar hashes de commit de T7 y T9 en tasks.md | doc |
| `ea87f58` | feat(catalogo): agregar servicios de aplicacion y modulo de catalogo | T8 |
| `06984de` | docs(02): registrar hash del commit de T8 en tasks.md | doc |
| `35326c0` | docs(02): cerrar T10, registrar modulos catalogo y horario en la skill de arquitectura | T10 |

Total: 9 commits de código (T2-T9, ninguno para T1) + 5 commits documentales (registro de hashes en
`tasks.md` y cierre de T1/T10) = 14 commits, todos en `fase-02-catalogo`, ninguno directo en `main`.
No hay PRs todavía: la fase no se ha fusionado (push/PR/merge son decisión del usuario, sin acción en
esta sesión).

## 5. Resultado de la review

**RDD no se invocó de forma nativa en esta sesión.** La herramienta `gentle-ai review` no se
confirmó disponible en este entorno durante la aplicación de T1-T10; no hay ningún resultado de
`gentle-ai review assess`/`status`/`start` que reportar, ni consentimiento de candidato, ni
acknowledgement. Se deja constancia explícita de esto en vez de simular o inventar un resultado de
review que no ocurrió.

Sin `judgment-day`: la Fase 02 no está en la lista de fases 04, 05, 06 y 10 que lo exigen
(`docs/fases/README.md` línea 35, regla 6; confirmado también en `proposal.md` §"Decisiones ya
tomadas" y en `design.md` §"Migration / Rollout").

## 6. Desviaciones respecto a la spec y por qué

1. **T1 no generó commit nuevo.** `proposal.md` y `design.md` (tabla "File Changes", fila 1)
   asumían que `src/compartido/texto/{texto.ts,texto.spec.ts,index.ts}` eran archivos nuevos de
   esta fase. Al aplicar T1 se encontró que ya existían desde el commit `d2aa48a` ("feat(compartido):
   portar dinero, texto y numero como funciones puras", Fase 00a, 2026-09-23) — anterior a la
   creación de este change. El módulo ya cumplía el "Hecho cuando" de T1 tal cual estaba
   (`normalizarLugar('Bogotá D.C.')` / `normalizarLugar('BOGOTA, D.C')` producen el mismo resultado,
   sin imports, `npm test -- texto` en verde con 3 tests). Evidencia: nota de aplicación de T1 en
   `tasks.md` líneas 191-199 y commit documental `9d85d43`.

2. **Dos valores por defecto de negocio introducidos sin especificación previa (T5, commit
   `adcfd6f`).** Ninguna spec de esta fase fija qué debe devolver
   `RepositorioParametroCatalogoPrisma` cuando el parámetro correspondiente no existe en la base.
   La implementación fijó: `obtenerRecargoContraentregaPct()` → `0%`, `obtenerMensajeFueraCobertura()`
   → un mensaje genérico en código. Documentados en el JSDoc del adaptador y en la nota de
   aplicación de T5 (`tasks.md` líneas 405-409); son decisiones de facto, no una decisión del
   usuario. Ninguna spec de CAT2/CAT11 exige un valor concreto de negocio para estos dos casos, solo
   que el dato salga del parámetro cuando existe — el "sin fila" queda sin cubrir por la spec.

3. **Discrepancia de conteo CAT8 (5 vs 6 escenarios) entre `design.md` y la spec real.**
   `design.md` §"Testing Strategy" anotó "CAT8 (5 escenarios)"; `specs/catalogo/spec.md` tiene 6
   encabezados `#### Scenario:` bajo `CAT8` (líneas 196-235). `tasks.md` detectó la discrepancia al
   escribirse (nota bajo "Nota de conteo de escenarios", líneas 26-34) y mapeó los 6 reales en T2;
   este `verify-report.md` confirma independientemente (§2) que los 6 títulos exactos existen y
   pasan en `envio.spec.ts`. La discrepancia queda en `design.md` (no se edita desde este reporte;
   se deja para que el usuario la confirme al aprobar el cierre, tal como pidió `tasks.md`).

Ninguna de las tres desviaciones requiere revertir código: las tres son de documentación/decisión de
facto, no de comportamiento incorrecto frente a un escenario de spec.

## 7. ADRs creados

**Ninguno**, confirmado en `design.md` §"ADRs": las tres decisiones con alternativas reales (D1 join
directo vs. depender de `REPOSITORIO_GEOGRAFIA`; D2 caché como *provider*; D4 puerto de parámetro
por módulo vs. módulo `configuracion` compartido) se evaluaron y se descartaron como candidatas a ADR
por el mismo criterio que usó Fase 01 para el módulo `geografia` (D8 de su diseño): alternativa real
pero decisión de implementación reversible, dentro de un ADR ya aceptado (ADR-0001, monolito
modular), sin consecuencias de largo plazo para otros módulos.

## 8. Filas de `docs/migracion/inventario.md` que esta fase migra

Citadas tal como están hoy (no se editan; esa edición la hace `sdd-archive`):

- Línea 25: `envios/calculo.ts` → Conservar → `catalogo/dominio/envio` → Fase 02 → "B12, puro".
- Línea 26: `horario/dentroHorario.ts` → Conservar → `horario/` → Fase 02.
- Línea 27: `motor/catalogoCompacto.ts` → Rediseñar → `catalogo/aplicacion` con caché inyectable →
  Fase 02 → "La invalidación por versión (ADR-005) se conserva".
- Línea 55: `db/repositorios/tarifas.ts`, `envios/` + tabla `tarifa_envio` → Rediseñar →
  `zona_sin_cobertura` + `tarifa_estimada` → Fases 01, 02 → nota ya dice "repositorio y cálculo de
  envío llegan en la Fase 02", cumplido con T2/T5.

**No existen filas individuales** para `db/repositorios/horario.ts`, `db/repositorios/parametros.ts`,
`db/repositorios/productos.ts`, `tools/obtenerFicha.ts` ni `tools/cotizarEnvio.ts`:

- Los tres repositorios quedan cubiertos por la fila genérica de línea 24 (`db/repositorios/*` →
  Fase 01, ya marcada "Migrado" para el patrón general; esta fase no la reabre, solo la extiende con
  los adaptadores concretos de `catalogo`/`horario`).
- `tools/obtenerFicha.ts` y `tools/cotizarEnvio.ts` solo aparecen agrupados en la fila genérica de
  línea 41 (`tools/* (6 tools)` → Fase 07), que no distingue la parte de lógica de aplicación (esta
  fase) del contrato de *tool* del LLM (Fase 07) — la distinción sí está hecha en `proposal.md`
  §"Qué se migra del prototipo" (`ObtenerFichaProducto`/`CotizarEnvio` como servicios de aplicación,
  Fase 02) pero no se reflejó como fila propia en `inventario.md`. Se deja anotado aquí para que
  `sdd-archive` decida si vale la pena una fila más granular; no se edita desde este reporte.

## 9. Qué aprendimos que cambia las fases siguientes

- **Verificar siempre si algo ya fue portado en una fase anterior antes de asumir que una tarea es
  "nueva".** Pasó con `compartido/texto` (T1): tanto `proposal.md` como `design.md` asumieron un
  archivo nuevo sin comprobar contra el commit real de Fase 00a. El costo fue bajo (una tarea sin
  commit, con nota), pero en una fase con más módulos compartidos el mismo supuesto podría llevar a
  reimplementar algo que ya existe con tests distintos.
- **Los repositorios que leen `parametro` sin que ninguna spec fije el valor por defecto de negocio
  generan una decisión de facto que el usuario debería confirmar antes de que la Fase 07 conecte
  estos servicios al LLM.** El recargo contraentrega en `0%` y el mensaje genérico de fuera de
  cobertura (T5) son valores que un cliente real vería tal cual si Fase 07 los conecta sin que el
  usuario primero cargue los parámetros reales en la base. Recomendación: antes de Fase 07, el
  usuario decide y carga `recargo_contraentrega_pct` y `mensaje_fuera_cobertura` reales, o esta fase
  se reabre para documentar el default en la spec.
- **Trabajar tareas independientes en paralelo sobre el mismo *working tree* (sin *worktrees*
  separados) genera carreras reales de `git add`/`git commit`.** Ocurrió 3 veces en esta fase, todas
  autodetectadas y corregidas sin pérdida de trabajo (visible en la secuencia de commits
  documentales intercalados: `4548444` después de T2/T3/T4, `4178e46` después de T5/T6, `c333a7f`
  después de T7/T9). El patrón es frágil: las próximas fases deberían usar *git worktrees* separados
  si van a paralelizar tareas de aplicación, en vez de confiar en que la corrección posterior siempre
  alcance a tiempo.
- **El arnés de base por worker de Fase 01 tiene una condición de carrera real bajo Docker con 4
  workers** (`CREATE DATABASE ... TEMPLATE` en `test/soporte/base-por-worker.setup.ts`), visible en
  2 de 3 corridas de `npm run verify` en esta sesión (§3). Ya estaba anticipada como riesgo en la
  proposal de Fase 01 ("Arnés lento o inestable"), pero la frecuencia observada aquí (2/3, no un caso
  aislado) sugiere que vale la pena que una fase de mantenimiento la investigue antes de que se
  vuelva más frecuente y empiece a esconder fallos reales de fases futuras.

## Veredicto

**Sin hallazgos bloqueantes.** Las tres desviaciones (§6) están documentadas con evidencia real, no
requieren revertir código, y quedan explícitas para que el usuario las confirme o las vete al
aprobar. La fase está lista para `sdd-archive`.
