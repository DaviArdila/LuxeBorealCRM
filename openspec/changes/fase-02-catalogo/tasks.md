# Tasks: Fase 02 — Catálogo

Review requerida: **RDD** (02 no es una de las fases 04, 05, 06, 10 de `docs/fases/README.md`; no
requiere `judgment-day`; confirmado en `proposal.md` §"Decisiones ya tomadas" y `design.md`
§"Migration / Rollout").

Convención de conteo de esta fase (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por
change"): cada **tarea** de este archivo (`T1`…`T10`) es una unidad de trabajo completa que termina
en **un solo commit**. A diferencia de la Fase 01 (mapeo 1 slice = 1 tarea, 5 tareas para 5 slices),
esta fase reparte los 4 slices de `design.md` (`S(a)`-`S(d)`) en **10 tareas más finas**, siguiendo
el orden de la tabla "File Changes" de `design.md`: cada tarea toma un grupo cohesivo de archivos de
esa tabla que comparten slice y responsabilidad (un archivo de dominio + su spec, un grupo de
puertos+adaptadores del mismo módulo, etc.). El slice de cada tarea es literalmente el que
`design.md` ya asignó a sus archivos en la columna "Slice"; ninguna tarea mezcla archivos de dos
slices distintos.

**Resultado: 10 tareas, exactamente en el límite de 10.** No hace falta proponer partir la fase.

**Nota de conteo de escenarios (verificada línea por línea contra `specs/catalogo/spec.md` y
`specs/horario/spec.md`, 2026-09-26)**: entre las dos specs hay **32 escenarios** (`#### Scenario:`),
no 30 como sugeriría sumar las cifras de la tabla "Testing Strategy" de `design.md` tarea por tarea.
Conteo real por requisito — catálogo: CAT1(2), CAT2(3), CAT3(2), CAT4(2), CAT5(3), CAT6(3), CAT7(1),
**CAT8(6)**, CAT9(1), CAT10(1), CAT11(1) = 25; horario: HOR1(1), HOR2(1), HOR3(1), HOR4(1), HOR5(1),
HOR6(1), HOR7(1) = 7. **Total 32.**

**Discrepancia detectada y no corregida silenciosamente**: la tabla "Testing Strategy" de `design.md`
anota "CAT8 (5 escenarios)" en la fila de `hayExclusion, elegirTarifa, armarCotizacionConCobertura`.
Contando los encabezados `#### Scenario:` reales bajo `### Requirement: CAT8` en
`specs/catalogo/spec.md` (líneas 196-235) hay **6**, no 5: "La ciudad exacta gana...", "Una ciudad
sin tarifa propia...", "Una ciudad con tarifa propia que no cubre el peso...", "Una ciudad-distrito
registrada bajo otro departamento...", "Se elige la franja de peso...", "Sin ninguna tarifa que
aplique...". Este `tasks.md` mapea los 6 reales (T2, más abajo); se deja anotada la discrepancia para
que el usuario la confirme al aprobar — no bloquea `sdd-tasks` porque la cobertura de los 6 está
completa y trazable.

**Nota sobre dónde vive cada escenario (lectura de `design.md` §"Data Flow" e "Interfaces /
Contracts", no solo de la tabla "Testing Strategy")**: `armarCotizacionConCobertura(tarifa)` recibe
siempre una `CandidataTarifa` ya elegida — su tipo de retorno `ResultadoCotizacion` incluye la rama
`cobertura: false`, pero esa rama la construye el servicio de aplicación `CotizarEnvio` (con el
mensaje de `REPOSITORIO_PARAMETRO_CATALOGO.obtenerMensajeFueraCobertura()`), no la función de
dominio, según el diagrama de "Data Flow". Por eso CAT9 y CAT11 quedan asignados a T8 (aplicación),
no a T2 (dominio), aunque la fila de "Testing Strategy" los liste junto a la fila del dominio de
envío — se sigue el diagrama de flujo de datos por ser más específico que la tabla resumen.

## Checklist

- [x] T1 — `compartido/texto`: `normalizarTexto`/`normalizarLugar` (S(a)) — ya portado en
      `d2aa48a` (Fase 00a); sin commit nuevo, ver nota bajo "T1" más abajo.
- [ ] T2 — Dominio de envío: peso facturable, exclusión, elección de tarifa, cotización con
      cobertura (S(a))
- [ ] T3 — Dominio de producto: ficha y catálogo compacto (S(a))
- [ ] T4 — Dominio de horario: momento local, rango, decisión dentro/fuera (S(a))
- [ ] T5 — Puertos + repositorios Prisma de catálogo (producto, envío, parámetro) + tests de
      integración (S(b))
- [ ] T6 — Puerto + repositorio Prisma de horario + test de integración (S(b))
- [ ] T7 — Caché de catálogo compacto (puerto + adaptador Redis) + tests (S(c))
- [ ] T8 — Servicios de aplicación de catálogo (ficha, listado, catálogo compacto, cotización) +
      módulo Nest + barril (S(c))
- [ ] T9 — Servicio de aplicación de horario (`HorarioAtencion`) + módulo Nest + barril (S(c))
- [ ] T10 — Cierre documental (S(d))

## Mapeo de escenarios por tarea (32 escenarios, 18 requisitos)

| Tarea | Requisitos | # Escenarios |
|---|---|---|
| T1 | — (soporte de CAT8, sin escenario propio) | 0 |
| T2 | CAT6, CAT7, CAT8, CAT10 | 3+1+6+1 = 11 |
| T3 | CAT2, CAT4 (escenario 2 de 2) | 3+1 = 4 |
| T4 | HOR1, HOR2, HOR3, HOR4, HOR5, HOR6 | 6 |
| T5 | — (infraestructura, sin escenario propio; confirma persistencia real del evento de CAT9) | 0 |
| T6 | — (infraestructura, sin escenario propio) | 0 |
| T7 | CAT4 (escenario 1 de 2), CAT5 | 1+3 = 4 |
| T8 | CAT1, CAT3, CAT9, CAT11 | 2+2+1+1 = 6 |
| T9 | HOR7 | 1 |
| T10 | — (cierre documental, sin escenario nuevo) | 0 |
| **Total** | **18** | **32** |

Dependencias entre tareas: T2 depende de T1 (`elegirTarifa` normaliza nombres con
`compartido/texto`). T5 depende de T2 y T3 (los adaptadores Prisma devuelven los tipos de dominio
`CandidataTarifa`/`CandidataExclusion`/`Producto`/`ProductoResumen`). T6 depende de T4. T7 depende de
T3 (`ProductoResumen`). T8 depende de T2, T3, T5, T7. T9 depende de T4 y T6. T10 depende de todas.

## Matriz de amenazas aplicable a esta fase

Reproducida desde `design.md` §"Threat Matrix": **no aplica de forma diferencial**. Sin rutas HTTP
nuevas, sin subprocesos, sin comandos git nuevos. El único vector potencial (SQL) usa exclusivamente
el *query builder* de Prisma (`findMany`, `include`) en `RepositorioEnvioPrisma`/
`RepositorioProductoPrisma` — sin `$queryRaw`, a diferencia del repositorio de `geografia` de la
Fase 01. Ninguna tarea de esta fase agrega una fila propia a esta matriz.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2.100 líneas de autoría (estimación propia de `sdd-tasks`: `design.md` de esta fase no incluye, a diferencia del de la Fase 01, un desglose de líneas por archivo en "Migration / Rollout" — el número real lo confirma cada tarea con `git diff --numstat` al aplicarla) |
| 400-line budget risk | **Medio en T2** (~380 líneas estimadas: 11 escenarios de dominio de envío en un solo archivo + spec) y **Medio en T8** (~380 líneas estimadas: 4 casos de uso + módulo + barril). Bajo en T1, T3, T4, T5, T6, T7, T9, T10 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → … → PR10 (10 tareas, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — `auto-chain` ya trae la cadena `stacked-to-main` cacheada desde
el preflight de sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede con T1 sin
pedir confirmación adicional. **A diferencia de T2 de la Fase 01**, ninguna fila de `proposal.md`
§Risks anticipa un exceso concreto para una tarea puntual de esta fase (la fila 3 de Risks solo
advierte el riesgo general de ~400 líneas/PR con 2 módulos nuevos, sin fijar una tarea): por eso
**no se auto-aplica `size:exception`** para T2 ni T8; si el diff real de cualquiera las supera de
forma significativa, `sdd-apply` MUST pedir `size:exception` al usuario antes de continuar, con la
misma regla que usó la Fase 01.

Estimación de líneas de autoría por tarea (propia de `sdd-tasks`, no medida — cada tarea la corrige
con su diff real al aplicarla):

| Tarea | Archivo(s) principal(es) | Estimado |
|---|---|---|
| T1 | `compartido/texto/texto.ts` + spec + `index.ts` | ~70 |
| T2 | `catalogo/dominio/envio.ts` + spec | ~380 |
| T3 | `catalogo/dominio/producto.ts` + spec | ~160 |
| T4 | `horario/dominio/horario.ts` + spec | ~200 |
| T5 | 3 puertos + 3 adaptadores + tests de integración de catálogo | ~350 |
| T6 | 2 puertos + 1 adaptador + test de integración de horario | ~150 |
| T7 | puerto + adaptador Redis + spec + test de integración | ~230 |
| T8 | 4 casos de uso + specs + módulo + barril | ~380 |
| T9 | caso de uso + spec + módulo + barril | ~140 |
| T10 | solo documentación | ~40 |
| **Total** | | **~2.100** |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Slice | Rollback boundary |
|------|------|-----------|----------------------|-------|-------------------|
| 1 | T1: `normalizarTexto`/`normalizarLugar` portados de `lib/texto.ts` | PR1 | `npm test -- texto` | S(a) | Revertir `src/compartido/texto/**` |
| 2 | T2: dominio de envío completo (peso, exclusión, tarifa, cotización con cobertura) | PR2 | `npm test -- catalogo/dominio/envio` | S(a) | Revertir `src/modulos/catalogo/dominio/envio.ts` (+spec) |
| 3 | T3: dominio de producto (ficha, catálogo compacto) | PR3 | `npm test -- catalogo/dominio/producto` | S(a) | Revertir `src/modulos/catalogo/dominio/producto.ts` (+spec) |
| 4 | T4: dominio de horario (momento local, rango, decisión) | PR4 | `npm test -- horario/dominio` | S(a) | Revertir `src/modulos/horario/dominio/horario.ts` (+spec) |
| 5 | T5: puertos + repositorios Prisma de catálogo | PR5 | `npm run test:integracion -- catalogo/repositorio` | S(b) | Revertir `src/modulos/catalogo/puertos/**`, `src/modulos/catalogo/infraestructura/repositorio-*.ts`, `test/integracion/catalogo/repositorio-*.spec.ts` |
| 6 | T6: puerto + repositorio Prisma de horario | PR6 | `npm run test:integracion -- horario/repositorio` | S(b) | Revertir `src/modulos/horario/puertos/**`, `src/modulos/horario/infraestructura/repositorio-horario-prisma.ts`, `test/integracion/horario/repositorio-horario.spec.ts` |
| 7 | T7: caché de catálogo (puerto + adaptador Redis) | PR7 | `npm test -- cache-catalogo` + `npm run test:integracion -- cache-catalogo-redis` | S(c) | Revertir `src/modulos/catalogo/puertos/cache-catalogo.ts`, `src/modulos/catalogo/infraestructura/cache-catalogo-redis.ts` (+spec), `test/integracion/catalogo/cache-catalogo-redis.spec.ts` |
| 8 | T8: servicios de aplicación de catálogo + módulo + barril | PR8 | `npm test -- catalogo/aplicacion` | S(c) | Revertir `src/modulos/catalogo/aplicacion/**`, `catalogo.module.ts`, `index.ts` |
| 9 | T9: servicio de aplicación de horario + módulo + barril | PR9 | `npm test -- horario/aplicacion` | S(c) | Revertir `src/modulos/horario/aplicacion/**`, `horario.module.ts`, `index.ts` |
| 10 | T10: cierre documental | PR10 | `npm run verify` completo | S(d) | Revertir `.claude/skills/luxeboreal-arquitectura/SKILL.md`, `docs/migracion/inventario.md`, `docs/fases/README.md` |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` antes de abrir
el siguiente):

```
PR1 (texto) → PR2 (dominio envío) → PR3 (dominio producto) → PR4 (dominio horario)
   → PR5 (repos catálogo) → PR6 (repo horario) → PR7 (caché) → PR8 (aplicación catálogo)
   → PR9 (aplicación horario) → PR10 (cierre documental)
```

---

## T1 — `compartido/texto`: `normalizarTexto`/`normalizarLugar`

**Objetivo**: portar sin cambios de comportamiento el helper de normalización de texto que necesita
CAT8 ("ignorar tildes, mayúsculas y puntuación" al comparar nombres de departamento/ciudad),
siguiendo `design.md` D1.

**Dependencias**: ninguna (primera tarea de la fase).

**Archivos** (design.md, tabla "File Changes", fila 1):
- `src/compartido/texto/texto.ts` (Create) — `normalizarTexto(texto)`, `normalizarLugar(texto)`
  (solo letras, números, espacios), portados de `../ChatLuxeCRM/src/lib/texto.ts`.
- `src/compartido/texto/texto.spec.ts` (Create).
- `src/compartido/texto/index.ts` (Create) — barril.

**Escenarios cubiertos**: ninguno con id propio. Es soporte de CAT8 (design.md, Testing Strategy:
"soporte de CAT8, sin id propio: cubierto por los tests de `elegirTarifa`"); su propio test unitario
prueba el comportamiento del helper en sí (tildes, mayúsculas, puntuación, espacios repetidos), no un
escenario de spec.

**RED → GREEN → REFACTOR** (planificado; la transcripción real la registra `sdd-apply`):
1. RED: `texto.spec.ts` con casos de `normalizarTexto`/`normalizarLugar` (acentos, mayúsculas, comas,
   espacios dobles) contra el módulo inexistente. Correr `npm test -- texto` y observar fallo.
2. GREEN: implementar `texto.ts` portando la lógica de `lib/texto.ts` hasta que los casos pasen.
3. REFACTOR: confirmar que no importa nada (helper puro, `compartido-puro` de la regla de fronteras).

**Hecho cuando**:
- `normalizarLugar("Bogotá, D.C.")` y `normalizarLugar("BOGOTA D.C.")` producen el mismo resultado.
- El módulo no tiene ningún import (regla de fronteras `compartido-puro`).
- `npm test -- texto` en verde.

**Comando de test**: `npm test -- texto`

**Slice de PR**: S(a)

**Review requerida**: RDD

**Nota de aplicación (2026-09-26)**: al ejecutar `sdd-apply` para T1 se encontró que
`src/compartido/texto/texto.ts`, `texto.spec.ts` e `index.ts` ya existían, portados junto con
`compartido/dinero` y `compartido/numero` en el commit `d2aa48a` ("feat(compartido): portar
dinero, texto y numero como funciones puras", Fase 00a, 2026-09-23) — anterior a la creación de
esta fase. El módulo ya cumple "Hecho cuando" tal cual está: `normalizarLugar('Bogotá D.C.')` y
`normalizarLugar('BOGOTA, D.C')` producen el mismo resultado (`texto.spec.ts` línea 12-13), el
archivo no importa nada, y `npm test -- texto` está en verde (3 tests). No se creó ningún commit
nuevo para T1 porque no había ningún cambio de comportamiento que aplicar; el checklist se marca
completo con esta nota como evidencia en vez de un hash de commit.

---

## T2 — Dominio de envío: peso facturable, exclusión, elección de tarifa, cotización con cobertura

**Objetivo**: portar `envios/calculo.ts` del prototipo como funciones puras (`design.md` D1, D3, D6):
peso facturable, prioridad de exclusión sobre tarifa, elección de tarifa por especificidad con
desempate determinístico (Q2/D3), y el armado de la cotización cuando hay cobertura.

**Dependencias**: T1 (`elegirTarifa` normaliza nombres con `compartido/texto`).

**Archivos** (design.md, tabla "File Changes", fila 2):
- `src/modulos/catalogo/dominio/envio.ts` (Create) — `LineaPeso`, `DestinoEnvio`,
  `CandidataTarifa`, `CandidataExclusion`, `pesoRealG`/`pesoVolumetricoG`/`pesoFacturableG`,
  `validarFactorVolumetrico`, `hayExclusion`, `elegirTarifa` (D1, D3), `armarCotizacionConCobertura`
  (D6, solo la rama con cobertura — ver nota de flujo de datos arriba).
- `src/modulos/catalogo/dominio/envio.spec.ts` (Create).

**Escenarios cubiertos** (título exacto, `specs/catalogo/spec.md`):
- `CAT6 — Gana el peso volumétrico cuando el producto es voluminoso y liviano`
- `CAT6 — Gana el peso real cuando el producto es denso, multiplicado por la cantidad`
- `CAT6 — Un producto sin peso ni medidas pesa cero`
- `CAT7 — Un destino en zona_sin_cobertura se trata como sin cobertura aunque exista una tarifa que calzaría`
- `CAT8 — La ciudad exacta gana sobre la tarifa por defecto del departamento`
- `CAT8 — Una ciudad sin tarifa propia cae a la tarifa por defecto de su departamento`
- `CAT8 — Una ciudad con tarifa propia que no cubre el peso cae a la tarifa del departamento`
- `CAT8 — Una ciudad-distrito registrada bajo otro departamento se resuelve por la ciudad`
- `CAT8 — Se elige la franja de peso que contiene el peso facturable`
- `CAT8 — Sin ninguna tarifa que aplique, el resultado es sin cobertura`
- `CAT10 — Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida`

Además, un test propio de D3 (no es escenario de spec, lo pide `design.md`): dos tarifas del mismo
nivel de especificidad con rangos de peso traslapados eligen la de franja más angosta (y, si sigue
empatada, la de `creado` más antiguo).

**RED → GREEN → REFACTOR** (planificado):
1. RED: `envio.spec.ts` con los 10 escenarios más el caso de desempate D3, contra el módulo
   inexistente. Correr `npm test -- catalogo/dominio/envio` y observar fallo.
2. GREEN: implementar `pesoFacturableG`/`validarFactorVolumetrico`, `hayExclusion`, `elegirTarifa`
   (orden ciudad → departamento → nacional, desempate D3, comparación con `normalizarLugar`),
   `armarCotizacionConCobertura`, hasta que los 11 casos pasen.
3. REFACTOR: confirmar que el archivo no importa nada de NestJS/Prisma (regla `dominio-aislado`);
   solo `compartido/dinero` y `compartido/texto`.

**Hecho cuando**:
- Los 10 escenarios listados pasan con el título exacto de su encabezado `#### Scenario:` como
  nombre del test, más el caso de desempate D3.
- `elegirTarifa` nunca busca tarifa cuando `hayExclusion` es verdadero (CAT7 antes que CAT8).
- El archivo no depende de NestJS, Prisma ni Redis.

**Comando de test**: `npm test -- catalogo/dominio/envio`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T3 — Dominio de producto: ficha y catálogo compacto

**Objetivo**: portar el armado de la ficha con dinero ya formateado (R2) y el texto del catálogo
compacto sin precios, como funciones puras (`design.md` D6).

**Dependencias**: ninguna nueva (usa `compartido/dinero`, ya existente desde Fase 00a).

**Archivos** (design.md, tabla "File Changes", fila 3):
- `src/modulos/catalogo/dominio/producto.ts` (Create) — `Producto`, `ProductoResumen`,
  `FichaProducto`, `ProductoNoDisponible`, `armarFicha(producto, recargoContraentregaPct)` (D6),
  `armarCatalogoCompacto(productos)`.
- `src/modulos/catalogo/dominio/producto.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CAT2 — La ficha expone el precio como texto formateado`
- `CAT2 — La ficha expone el recargo contraentrega leído del parámetro del negocio`
- `CAT2 — La ficha indica si el producto tiene fotos`
- `CAT4 — El catálogo compacto no lleva precios y solo lista productos activos ordenados por nombre`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `producto.spec.ts` con los 4 escenarios contra el módulo inexistente. Correr
   `npm test -- catalogo/dominio/producto` y observar fallo.
2. GREEN: implementar `armarFicha` (reutilizando `formatearCop`/`formatearRecargoContraentrega` de
   `compartido/dinero`, sin reimplementar formateo) y `armarCatalogoCompacto` (ordenado por nombre,
   sin precios) hasta que los 4 casos pasen.
3. REFACTOR: confirmar que `armarFicha` no calcula ningún valor de dinero por su cuenta, solo llama
   al formateador (R2).

**Hecho cuando**:
- Los 4 escenarios listados pasan con el título exacto del escenario como nombre del test.
- `armarFicha` no reimplementa ninguna lógica de `compartido/dinero`.
- `ProductoNoDisponible` es una clase de error propia del dominio.

**Comando de test**: `npm test -- catalogo/dominio/producto`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T4 — Dominio de horario: momento local, rango, decisión dentro/fuera

**Objetivo**: portar `horario/dentroHorario.ts` del prototipo (`design.md` D5): resolución del
momento local en zona horaria de Bogotá, evaluación de un rango (incluido el que cruza medianoche), y
la decisión de dentro/fuera combinando excepción + patrón semanal + forma del valor guardado.

**Dependencias**: ninguna nueva (dominio puro; el `Clock` inyectado lo usa la aplicación en T9, no el
dominio).

**Archivos** (design.md, tabla "File Changes", fila 4):
- `src/modulos/horario/dominio/horario.ts` (Create) — `ZONA_HORARIA`, `MomentoLocal`,
  `momentoLocal(fecha)`, `dentroDeRango(rango, minutos)`, `ResultadoHorario`,
  `decidirDentroDeHorario(momento, existeExcepcion, valorCrudo)` (D5).
- `src/modulos/horario/dominio/horario.spec.ts` (Create).

**Escenarios cubiertos** (título exacto, `specs/horario/spec.md`):
- `HOR1 — Una excepción (festivo) cierra el día aunque el patrón diga abierto`
- `HOR2 — Sin parámetro horario_atencion configurado se asume dentro de horario`
- `HOR3 — Un valor de horario_atencion que no es JSON válido asume dentro de horario y solo advierte`
- `HOR4 — Un día no mencionado en el patrón semanal se asume dentro de horario`
- `HOR5 — Un día con valor null en el patrón semanal se asume fuera de horario`
- `HOR6 — Un rango que cruza medianoche incluye las horas antes y después de medianoche, y excluye las de en medio`

Nota D5: como `parametro.valor` es `jsonb`, HOR3 se prueba guardando una **forma** no válida (un
string plano, un arreglo, un número) como `valorCrudo`, no una cadena de texto rota — Postgres nunca
entrega JSON sintácticamente inválido.

**RED → GREEN → REFACTOR** (planificado):
1. RED: `horario.spec.ts` con los 6 escenarios contra el módulo inexistente. Correr
   `npm test -- horario/dominio` y observar fallo.
2. GREEN: implementar `momentoLocal` (zona `America/Bogota`), `dentroDeRango` (incluido el cruce de
   medianoche: tramo inicio→medianoche + medianoche→fin), `decidirDentroDeHorario` (excepción gana
   sobre patrón; sin parámetro o forma inválida ⇒ dentro + advertencia; día fuera del patrón ⇒
   dentro; entrada `null`/vacía para el día ⇒ fuera) hasta que los 6 casos pasen.
3. REFACTOR: confirmar que el archivo no llama a `Date.now()`/`new Date()` en ningún punto (recibe
   siempre `fecha`/`momento` como parámetro).

**Hecho cuando**:
- Los 6 escenarios listados pasan con el título exacto del escenario como nombre del test.
- `decidirDentroDeHorario` nunca lanza ante una forma inválida de `valorCrudo`: solo advierte.
- El archivo no importa nada fuera de tipos propios (dominio puro, sin `Clock` inyectado aquí).

**Comando de test**: `npm test -- horario/dominio`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T5 — Puertos + repositorios Prisma de catálogo (producto, envío, parámetro)

**Objetivo**: construir los tres puertos de `catalogo` y sus adaptadores Prisma, reutilizando el
patrón de repositorio de `geografia` (Fase 01, T3): `RepositorioProducto`, `RepositorioEnvio` (con el
`include` de `departamento`/`ciudad` que resuelve D1 sin depender de `modulos/geografia`) y
`RepositorioParametroCatalogo` (D4: puerto propio del módulo, sin módulo `configuracion`
compartido).

**Dependencias**: T2 (tipos `CandidataTarifa`/`CandidataExclusion`), T3 (tipos `Producto`/
`ProductoResumen`).

**Archivos** (design.md, tabla "File Changes", filas 5-10):
- `src/modulos/catalogo/puertos/repositorio-producto.ts` (Create) — puerto + token
  `REPOSITORIO_PRODUCTO`.
- `src/modulos/catalogo/puertos/repositorio-envio.ts` (Create) — puerto + token
  `REPOSITORIO_ENVIO`, `NuevoEventoFueraCobertura` (D7: `departamentoId`/`ciudadId` siempre `null`
  en esta fase).
- `src/modulos/catalogo/puertos/repositorio-parametro.ts` (Create) — puerto + token
  `REPOSITORIO_PARAMETRO_CATALOGO` (D4).
- `src/modulos/catalogo/infraestructura/repositorio-producto-prisma.ts` (Create).
- `src/modulos/catalogo/infraestructura/repositorio-envio-prisma.ts` (Create) — con `include:
  { departamento: true, ciudad: true }` (D1).
- `src/modulos/catalogo/infraestructura/repositorio-parametro-prisma.ts` (Create).
- `test/integracion/catalogo/repositorio-producto.spec.ts`,
  `repositorio-envio.spec.ts`, `repositorio-parametro.spec.ts` (Create) — contra Postgres real, base
  del worker (arnés de Fase 01, T1).

**Escenarios cubiertos**: ninguno con id propio (design.md, "Testing Strategy": la fila de
integración de estos repositorios no lista escenarios, solo "contra Postgres real, base del
worker"). Esta tarea **confirma la persistencia real** que usará CAT9 (`registrarEventoFueraCobertura`
escribe una fila real con `producto_id`/`departamento_id: null`/`ciudad_id: null` y los textos tal
como se guardaron) sin que el nombre del test lleve el id CAT9 — el test con el nombre exacto
`"CAT9 — <título>"` vive en T8 (aplicación), con dobles de puerto.

**RED → GREEN → REFACTOR** (planificado):
1. RED: los tres archivos de test de integración contra el puerto/adaptador inexistentes. Correr
   `npm run test:integracion -- catalogo/repositorio` y observar fallo.
2. GREEN: implementar los tres puertos y sus adaptadores (incluido el `include` de D1 en
   `RepositorioEnvioPrisma`) hasta que los tests pasen contra Postgres real.
3. REFACTOR: confirmar que ningún adaptador usa `$queryRaw` (solo *query builder*, `design.md`
   §"Threat Matrix") y que `catalogo` no importa `modulos/geografia` (D1).

**Hecho cuando**:
- Los tres repositorios funcionan contra Postgres real (Testcontainers/base del worker).
- `RepositorioEnvioPrisma.listarTarifas()`/`listarExclusiones()` devuelven `departamentoNombre`/
  `ciudadNombre` ya resueltos por el `include` de Prisma, sin ningún import de `modulos/geografia`.
- `RepositorioEnvioPrisma.registrarEventoFueraCobertura(evento)` persiste una fila con
  `departamento_id`/`ciudad_id` en `null` (D7) y los textos tal como llegaron.
- `npm run fronteras` sigue sin violaciones nuevas.

**Comando de test**: `npm run test:integracion -- catalogo/repositorio`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T6 — Puerto + repositorio Prisma de horario

**Objetivo**: construir `RepositorioHorario` (consulta de excepción por fecha y patrón semanal
crudo) y su adaptador Prisma sobre `excepcion_horario`/`parametro`.

**Dependencias**: T4 (tipos del dominio de horario, aunque el repositorio solo mueve datos crudos).

**Archivos** (design.md, tabla "File Changes", filas 11-13):
- `src/modulos/horario/puertos/horario.ts` (Create) — puerto `Horario` (`estaDentroDeHorario`) +
  token `HORARIO` (la implementación real, `HorarioAtencion`, llega en T9; aquí solo el puerto).
- `src/modulos/horario/puertos/repositorio-horario.ts` (Create) — puerto `RepositorioHorario`
  (`existeExcepcion(fechaIso)`, `obtenerPatronSemanal()`) + token `REPOSITORIO_HORARIO`.
- `src/modulos/horario/infraestructura/repositorio-horario-prisma.ts` (Create).
- `test/integracion/horario/repositorio-horario.spec.ts` (Create) — contra Postgres real.

**Escenarios cubiertos**: ninguno con id propio (misma razón que T5: infraestructura de lectura,
"contra Postgres real, base del worker" en `design.md`). Esta tarea confirma que
`existeExcepcion`/`obtenerPatronSemanal` leen exactamente lo guardado en `excepcion_horario`/
`parametro`, precondición de HOR1-HOR7 (que se prueban en T4 y T9).

**RED → GREEN → REFACTOR** (planificado):
1. RED: `repositorio-horario.spec.ts` contra el puerto/adaptador inexistentes. Correr
   `npm run test:integracion -- horario/repositorio` y observar fallo.
2. GREEN: implementar el puerto `RepositorioHorario` y su adaptador Prisma hasta que el test pase.
3. REFACTOR: confirmar que `obtenerPatronSemanal()` devuelve el valor crudo sin parsear (la forma la
   valida el dominio en T4, no el repositorio).

**Hecho cuando**:
- `existeExcepcion(fechaIso)` devuelve `true` solo si hay una fila en `excepcion_horario` para esa
  fecha exacta.
- `obtenerPatronSemanal()` devuelve `null` cuando no existe el parámetro `horario_atencion`, y el
  valor crudo (cualquier forma) cuando sí existe.
- `npm run test:integracion -- horario/repositorio` en verde.

**Comando de test**: `npm run test:integracion -- horario/repositorio`

**Slice de PR**: S(b)

**Review requerida**: RDD

---

## T7 — Caché de catálogo compacto (puerto + adaptador Redis)

**Objetivo**: construir `CACHE_CATALOGO` como *provider* inyectable (D2), corrigiendo A1 (sin abrir
Redis al importarse) y A3 (sin depender de un módulo de colas): conecta bajo demanda, igual que
`IndicadorRedis` (`plataforma/salud`), y compara la clave de versión `catalogo:version` en cada
lectura.

**Dependencias**: T3 (`ProductoResumen`, el tipo que cachea).

**Archivos** (design.md, tabla "File Changes", filas 14-15, más el test de integración de la fila
21):
- `src/modulos/catalogo/puertos/cache-catalogo.ts` (Create) — puerto + token `CACHE_CATALOGO`
  (`obtenerVigente()`, `reemplazar(productos)`, `invalidar()`).
- `src/modulos/catalogo/infraestructura/cache-catalogo-redis.ts` (Create) — adaptador
  `CacheCatalogoRedis` (D2: estado de instancia, conecta bajo demanda, TTL de respaldo 5 min como
  constante de código).
- `src/modulos/catalogo/infraestructura/cache-catalogo-redis.spec.ts` (Create) — con fake de Redis.
- `test/integracion/catalogo/cache-catalogo-redis.spec.ts` (Create) — Redis real, invalidación entre
  procesos.

**Escenarios cubiertos** (título exacto):
- `CAT4 — Una escritura directa en producto sin pasar por la invalidación no se refleja de inmediato`
- `CAT5 — Invalidar el catálogo incrementa la versión compartida`
- `CAT5 — Invalidar el catálogo hace que la siguiente lectura vea el cambio de inmediato`
- `CAT5 — Otro proceso que incrementa la versión compartida invalida esta copia igual`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `cache-catalogo-redis.spec.ts` (fake de Redis) con los 4 escenarios contra el adaptador
   inexistente. Correr `npm test -- cache-catalogo` y observar fallo.
2. RED: `test/integracion/catalogo/cache-catalogo-redis.spec.ts` simulando "otro proceso" con una
   segunda instancia del adaptador contra el mismo Redis real. Correr
   `npm run test:integracion -- cache-catalogo-redis` y observar fallo.
3. GREEN: implementar `CacheCatalogoRedis` (conexión perezosa igual que `IndicadorRedis`, comparación
   de `catalogo:version`, TTL de respaldo de 5 min) hasta que ambos specs pasen.
4. REFACTOR: confirmar que construir el adaptador (sin llamar a ningún método) no abre conexión
   Redis (A1) y que el módulo no importa ningún futuro `modulos/colas` (A3).

**Hecho cuando**:
- Los 4 escenarios listados pasan, con el título exacto como nombre del test.
- Instanciar `CacheCatalogoRedis` sin invocar ningún método no conecta a Redis (verificable con
  `this.redis.status` antes del primer uso).
- Dos instancias del adaptador contra el mismo Redis comparten la invalidación (escenario "otro
  proceso").

**Comando de test**: `npm test -- cache-catalogo` + `npm run test:integracion -- cache-catalogo-redis`

**Slice de PR**: S(c)

**Review requerida**: RDD

---

## T8 — Servicios de aplicación de catálogo (ficha, listado, catálogo compacto, cotización) + módulo + barril

**Objetivo**: construir los cuatro casos de uso de aplicación de `catalogo` como orquestadores finos
(D6: piden datos a los puertos y llaman a las funciones puras del dominio), y registrar el módulo
Nest.

**Dependencias**: T2 (dominio de envío), T3 (dominio de producto), T5 (repositorios), T7 (caché).

**Archivos** (design.md, tabla "File Changes", filas 16-19 y 22):
- `src/modulos/catalogo/aplicacion/obtener-ficha-producto.ts` (+ `.spec.ts`) (Create) —
  `ObtenerFichaProducto`: busca el producto, rechaza si `null`/`!activo` (`ProductoNoDisponible`),
  llama a `armarFicha`.
- `src/modulos/catalogo/aplicacion/listar-productos-activos.ts` (+ `.spec.ts`) (Create) —
  `ListarProductosActivos`: usa `CACHE_CATALOGO.obtenerVigente()`/`reemplazar()`.
- `src/modulos/catalogo/aplicacion/obtener-catalogo-compacto.ts` (+ `.spec.ts`) (Create) — compone
  con `armarCatalogoCompacto`.
- `src/modulos/catalogo/aplicacion/cotizar-envio.ts` (+ `.spec.ts`) (Create) — `CotizarEnvio`: peso
  facturable → exclusión → tarifa → cotización; sin cobertura ⇒
  `registrarEventoFueraCobertura` + `obtenerMensajeFueraCobertura()`.
- `src/modulos/catalogo/catalogo.module.ts`, `index.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CAT1 — El listado de productos activos no lleva precio`
- `CAT1 — El listado excluye productos inactivos`
- `CAT3 — Ficha de un producto inactivo se rechaza`
- `CAT3 — Ficha de un producto inexistente se rechaza`
- `CAT9 — Sin cobertura por ausencia de tarifa se registra el evento con el producto y el destino`
- `CAT11 — Sin cobertura se devuelve el mensaje del parámetro del negocio, sin ningún rango`

Además, un test complementario (no un escenario nuevo, `design.md` "CAT5 (parcial)"): con un doble de
`CACHE_CATALOGO`, `ObtenerCatalogoCompacto` llama a `obtenerVigente()` antes que a
`REPOSITORIO_PRODUCTO.listarActivosResumen()` — confirma la orquestación que CAT5 ya probó de punta a
punta en T7, sin repetir esos 3 escenarios aquí.

**RED → GREEN → REFACTOR** (planificado):
1. RED: los 4 archivos `.spec.ts` con dobles de puerto (`test/fakes/`), cubriendo los 6 escenarios
   más el test complementario de CAT5, contra los casos de uso inexistentes. Correr
   `npm test -- catalogo/aplicacion` y observar fallo.
2. GREEN: implementar los 4 casos de uso hasta que los specs pasen.
3. REFACTOR: confirmar que ningún caso de uso reimplementa lógica ya escrita en `dominio/` (solo
   orquesta puertos + funciones puras); registrar `catalogo.module.ts` con sus *providers* y
   exportar los tokens de puerto necesarios en `index.ts`.

**Hecho cuando**:
- Los 6 escenarios listados pasan, con el título exacto como nombre del test.
- `ObtenerFichaProducto` nunca devuelve ningún dato del producto cuando rechaza (CAT3).
- `CotizarEnvio` registra el evento fuera de cobertura con `departamentoId`/`ciudadId` en `null`
  (D7) tanto por exclusión (CAT7, ya cubierto en T2) como por ausencia de tarifa (CAT9).
- `catalogo.module.ts` no se importa todavía desde `AppModule` (igual que `GeografiaModule` en Fase
  01; lo conecta la primera fase que lo necesite).

**Comando de test**: `npm test -- catalogo/aplicacion`

**Slice de PR**: S(c)

**Review requerida**: RDD

---

## T9 — Servicio de aplicación de horario (`HorarioAtencion`) + módulo + barril

**Objetivo**: implementar el puerto `Horario` con `HorarioAtencion`, orquestando el dominio de
horario (T4) y `RepositorioHorario` (T6), resolviendo el momento por defecto desde el `Clock`
inyectado (HOR7, nunca `Date.now()`/`new Date()`).

**Dependencias**: T4 (dominio de horario), T6 (repositorio de horario).

**Archivos** (design.md, tabla "File Changes", filas 20 y 23):
- `src/modulos/horario/aplicacion/horario-atencion.ts` (+ `.spec.ts`) (Create) — implementa
  `Horario.estaDentroDeHorario(fecha = CLOCK.ahora())`: `momentoLocal` → `existeExcepcion` →
  `obtenerPatronSemanal` → `decidirDentroDeHorario`.
- `src/modulos/horario/horario.module.ts`, `index.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `HOR7 — Sin fecha explícita, el puerto usa el momento que devuelve el Clock inyectado`

Además, un test de wiring (no un escenario nuevo, ya cubiertos en T4): con dobles de
`RepositorioHorario`, `HorarioAtencion` combina correctamente `existeExcepcion` + patrón semanal a
través de `decidirDentroDeHorario`, confirmando que la orquestación llama al dominio con los
argumentos correctos — sin repetir los 6 escenarios de HOR1-HOR6 (ya probados como funciones puras
en T4).

**RED → GREEN → REFACTOR** (planificado):
1. RED: `horario-atencion.spec.ts` con un `Clock` de prueba fijado a un instante conocido y un doble
   de `RepositorioHorario`, contra el caso de uso inexistente. Correr `npm test -- horario/aplicacion`
   y observar fallo.
2. GREEN: implementar `HorarioAtencion` hasta que el escenario HOR7 y el test de wiring pasen.
3. REFACTOR: confirmar que `horario-atencion.ts` nunca llama a `Date.now()`/`new Date()` directamente
   (siempre `this.clock.ahora()` como valor por defecto del parámetro `fecha`); registrar
   `horario.module.ts` con sus *providers*.

**Hecho cuando**:
- El escenario HOR7 pasa con el título exacto como nombre del test.
- Sin pasar `fecha`, `HorarioAtencion.estaDentroDeHorario()` usa el instante del `Clock` inyectado,
  no el reloj real.
- `horario.module.ts` no se importa todavía desde `AppModule`.

**Comando de test**: `npm test -- horario/aplicacion`

**Slice de PR**: S(c)

**Review requerida**: RDD

---

## T10 — Cierre documental

**Objetivo**: dejar constancia de los módulos nuevos en la skill de arquitectura y confirmar que
`npm run verify` sigue en verde con las 32 escenarios de esta fase implementados.

**Dependencias**: T1-T9 (todas).

**Sin cambios de producción, sin riesgo de presupuesto** (`openspec/config.yaml` §rules.tasks: tarea
solo de documentación, se omite la tabla completa de "Review Workload Forecast").

**Archivos** (design.md, tabla "File Changes", fila 24; fila 25 queda para `sdd-archive`, no para
esta tarea):
- `.claude/skills/luxeboreal-arquitectura/SKILL.md` (Modify) — §1: agregar `catalogo`, `horario`,
  `compartido/texto` a la lista de módulos.

`docs/migracion/inventario.md` y `docs/fases/README.md` (design.md, misma fila, marcados "al
archivar") **no** se tocan en esta tarea: los actualiza `sdd-archive` al cerrar la fase, no
`sdd-apply` de T10 — evita que dos pasos distintos escriban el mismo archivo con información
parcialmente distinta.

**Escenarios cubiertos**: ninguno nuevo (cierre documental).

**RED → GREEN → REFACTOR**: no aplica (tarea documental, sin comportamiento que probar en RED/GREEN).
Verificación: `npm run verify` completo, más una revisión manual de que cada uno de los 32
escenarios listados en el mapeo de arriba tiene su test nombrado `"<id> — <título exacto>"` en verde.

**Hecho cuando**:
- La skill `luxeboreal-arquitectura` §1 lista `catalogo`, `horario` y `compartido/texto`.
- `npm run verify` en verde.
- Los 32 escenarios de `specs/catalogo/spec.md` y `specs/horario/spec.md` tienen su test con el
  título exacto, confirmado revisando la salida de `--reporter=verbose`.

**Comando de test**: `npm run verify`

**Slice de PR**: S(d)

**Review requerida**: RDD
