# Proposal: Fase 02 — Catálogo

- Change: `fase-02-catalogo` · Fase de la hoja de ruta: **02** (`docs/fases/README.md`)
- Rama: `fase-02-catalogo` · Fecha: 2026-09-26 · Estado: **aprobada** (proposal, specs, design y
  tasks aprobados por el usuario el 2026-09-26)
- Depende de: **Fase 00a y Fase 01, cerradas** (`compartido/dinero`, `plataforma/reloj`, esquema v1 de
  Prisma con `Producto`, `Foto`, `Parametro`, `Departamento`/`Ciudad`, `ZonaSinCobertura`,
  `TarifaEstimada`, `EventoFueraCobertura`, `ExcepcionHorario`; patrón de módulo `geografia` como
  referencia de puerto + infraestructura Prisma)
- Insumo principal: exploración delegada del prototipo `../ChatLuxeCRM` y del repo actual (código y
  tests de `envios/calculo.ts`, `horario/dentroHorario.ts`, `motor/catalogoCompacto.ts`,
  `tools/obtenerFicha.ts`, `tools/cotizarEnvio.ts`); `docs/migracion/inventario.md`;
  `SPEC.md` §4 (R2, R15); `openspec/specs/agente/spec.md` y `openspec/specs/configuracion-negocio/spec.md`;
  `MODELO_DATOS.md` §3-§5; `prisma/schema.prisma` real. *(Nota de proceso: la exploración se hizo con
  un agente genérico y no con `sdd-explore`, porque el dispatcher de agentes SDD de esta sesión
  rechazó el lanzamiento pese al preflight ya confirmado; el material se verificó de todas formas
  leyendo directamente el código y las specs citadas en este documento.)*

## Intent

Hoy el esquema de Fase 01 ya tiene las tablas de catálogo (`producto`, `foto`, `parametro`), de
envío/cobertura (`departamento`, `ciudad`, `zona_sin_cobertura`, `tarifa_estimada`,
`evento_fuera_cobertura`) y de horario (`excepcion_horario`), pero **nada las lee todavía**: no hay
repositorio de producto, ni cálculo de envío, ni puerto de horario. Ninguna fase de negocio que cite
precios, envíos u horario (07 Agente, 08 Leads) puede empezar sin esto.

Esta fase construye esa lectura: la ficha de producto con dinero ya formateado (R2), la cobertura de
envío por exclusión + rango aproximado (P4), y el horario de atención como dato editable, nunca una
constante (R15) — portando la lógica probada del prototipo (`envios/calculo.ts`,
`horario/dentroHorario.ts`, B1/B12 en `docs/analisis/01-analisis-chatluxecrm.md`) pero corrigiendo
cómo vive el estado: el prototipo abre Redis y cachea en un `let` de módulo al importarse (**A1**,
**A3**); aquí la caché de catálogo es un *provider* inyectable detrás de su propio puerto.

Éxito = la verificación de salida de la fila 02 de `docs/fases/README.md`: **tests del cálculo de
envío y del horario portados del prototipo; caché con invalidación por versión.**

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| Cobertura y tarifas | Cobertura por **exclusión** (lista corta); rango aproximado nacional + excepciones; precio real al despachar; recargo contraentrega como % que paga el cliente | P4, R2, `MODELO_DATOS.md` §4 |
| Esquema de envío/cobertura | `zona_sin_cobertura` + `tarifa_estimada` **ya están migradas** (Fase 01); esta fase no crea tablas nuevas para envío, solo repositorio y cálculo | `verify-report.md` de Fase 01, `prisma/schema.prisma:135-170` |
| Horario | Tabla propia (`parametro.horario_atencion` + `excepcion_horario`) detrás de un puerto `Horario`; Fase 04 evalúa si Chatwoot puede reemplazarla (no se decide aquí) | P13, `docs/PREGUNTAS_ABIERTAS.md` |
| El LLM nunca calcula dinero | El backend devuelve precio, rango de envío y recargo ya formateados; el LLM (Fase 07) solo cita | R2, `openspec/specs/agente/spec.md` |
| Horario/textos/parámetros son datos | Nunca constantes en código; ya especificado con escenarios, esta fase los implementa sin cambiar el texto del requisito | R15, `openspec/specs/configuracion-negocio/spec.md` |
| Formateo de dinero | `formatearCop`/`formatearRangoCop`/`formatearRecargoContraentrega`/`formatearDias` **ya existen y tienen tests** en `src/compartido/dinero/` (Fase 00a) | `docs/migracion/inventario.md` línea 22 |
| Entrega | `auto-chain`, cadena `stacked-to-main`, slices de ~400 líneas de autoría | preflight de esta sesión |
| Review | RDD por commit de unidad de trabajo; **sin** `judgment-day` (02 no es 04/05/06/10) | regla 6 de `docs/fases/README.md` |

## Scope

### In Scope

1. **Módulo `catalogo`**: repositorio de producto sobre Prisma (patrón de `geografia`, Fase 01, T3):
   `listarProductosActivos()` (resumen sin precio, para el futuro `buscar_producto` de Fase 07) y
   `buscarPorIdOSku()` para la ficha. Servicio de aplicación `ObtenerFichaProducto` que arma la ficha
   con `precio_texto`, `recargo_contraentrega_texto` y `tiene_fotos`, reutilizando
   `compartido/dinero` sin reimplementar formateo. Rechaza producto inactivo o inexistente.
2. **Caché de catálogo compacto con invalidación por versión**: *provider* de NestJS (DI, sin abrir
   Redis al importarse — corrige **A1**) detrás de un puerto propio del módulo `catalogo` (sin que
   `catalogo` dependa directamente del módulo de colas — corrige **A3**); compara una clave de
   versión en Redis en cada lectura y recarga si difiere, sin esperar el TTL; expone una operación
   de invalidación explícita (incrementa la versión).
3. **Dominio de envío** (`catalogo/dominio/envio`, puro, sin NestJS): peso facturable
   (`max(peso real, largo×ancho×alto / factor_volumetrico)`, con `factor_volumetrico` como
   parámetro del negocio, R15) y elección de tarifa con prioridad **exclusión → ciudad exacta →
   departamento → nacional**. Repositorio sobre `ZonaSinCobertura` y `TarifaEstimada` (esquema ya
   migrado). Sin match de tarifa → sin cobertura; se registra en `EventoFueraCobertura`.
4. **Módulo `horario`**: puerto `Horario` con `estaDentroDeHorario(fecha = reloj.ahora())` usando el
   `Clock` inyectado de `plataforma/reloj` (nunca `Date.now()`/`new Date()` — principio de **A11**
   aplicado aquí aunque el antipatrón original no citaba esta pieza). Porta el comportamiento exacto
   de `horario/dentroHorario.ts` del prototipo: excepción del día gana sobre el patrón semanal; sin
   parámetro configurado se asume dentro de horario; JSON inválido en el parámetro solo advierte y
   asume dentro de horario; día fuera del patrón semanal se asume dentro de horario; patrón vacío o
   `null` para el día se asume fuera; rango que cruza medianoche se evalúa correctamente.
5. **Servicio de cotización de envío** (`CotizarEnvio`, servicio de aplicación, no todavía una *tool*
   del LLM): dado un destino y un producto, devuelve `{cobertura: true, rango_texto, dias_texto,
   contraentrega_disponible}` o `{cobertura: false}` registrando el evento. El envoltorio que el LLM
   invoca (`cotizar_envio`, una de las 6 *tools*) es explícitamente **Fase 07** — aquí solo se
   construye la lógica que esa tool va a llamar (R2 se implementa aquí del lado "backend calcula y
   formatea"; Fase 07 implementa "el LLM solo cita").
6. **Tests portados del prototipo** con el mismo criterio de aserción exacta contra el formateador
   (no contra strings fijos): los de `envios/calculo.ts`, `horario/dentroHorario.ts`,
   `motor/catalogoCompacto.ts` y las partes de `tools/obtenerFicha.ts`/`tools/cotizarEnvio.ts` que
   son lógica de aplicación (no el contrato de *tool* del LLM, que llega en Fase 07).

### Out of Scope

| Qué | Fase | Motivo |
|---|---|---|
| Importador de catálogo (Sheets/Drive) y collage/fotos | 03 | `docs/migracion/inventario.md` línea 28-29 |
| Las 6 *tools* conectadas al LLM (`buscar_producto`, `obtener_ficha`, `cotizar_envio` como contrato de function-calling) | 07 | `docs/migracion/inventario.md` línea 41; R2 "Fase que lo implementa: 02, **07**" |
| Búsqueda difusa de catálogo por texto (`buscarProducto.ts` del prototipo) | 07 | Agrupada con las 6 *tools* en el inventario; ver Q1 |
| Verificar si Chatwoot puede reemplazar la tabla de horario | 04 | P13 |
| Registro de `uso_llm` / techo de gasto | 06-07 | Sin relación con catálogo |
| Máquina de estados bot/humano, handoff | 05 | Fuera del objetivo de esta fase |
| Crear tablas nuevas de envío/cobertura/horario | — | Ya migradas en Fase 01; ver Decisiones ya tomadas |

## Qué se migra del prototipo

| Prototipo (`../ChatLuxeCRM`) | Decisión | Destino | Motivo |
|---|---|---|---|
| `envios/calculo.ts` | **Conservar** | `catalogo/dominio/envio` | **B12**: lógica pura y probada, se porta casi igual |
| `horario/dentroHorario.ts` | **Conservar** | `horario/dominio` | **B12** (mismo criterio: pura y probada) |
| `motor/catalogoCompacto.ts` | **Rediseñar** | `catalogo/aplicacion` con caché inyectable (provider) | **A1**, **A3**: el `let cache` de módulo y la conexión a Redis de `queue/` se convierten en DI |
| `lib/dinero.ts` | **Conservar** (ya migrado) | `compartido/dinero` (sin cambios) | Ya tiene tests desde Fase 00a; esta fase solo lo reutiliza |
| `db/repositorios/tarifas.ts`, `db/repositorios/horario.ts`, `db/repositorios/parametros.ts`, `db/repositorios/productos.ts` | **Rediseñar** | repositorios de `catalogo`/`horario` sobre `PrismaService` | **A1**; mismo patrón que el repositorio de `geografia` (Fase 01, T3) |
| `tools/obtenerFicha.ts` (lógica, no el contrato de *tool*) | **Rediseñar** | servicio de aplicación `ObtenerFichaProducto` | La lógica se conserva (**B1**); el contrato de *tool* del LLM es Fase 07 |
| `tools/cotizarEnvio.ts` (lógica, no el contrato de *tool*) | **Rediseñar** | servicio de aplicación `CotizarEnvio` | Igual que arriba |
| `tools/buscarProducto.ts` | **Posponer** | Fase 07, junto con las demás *tools* | Ver Out of Scope y Q1 |

### Tests del prototipo que esta fase reemplaza

- `tests/envios/calculo.test.ts` — peso facturable y elección de tarifa (ciudad/departamento/nacional,
  ciudad-distrito de otro departamento, sin match).
- `tests/tools/cotizarEnvio.test.ts` — solo la parte de lógica de aplicación (cobertura, registro de
  evento fuera de cobertura, normalización de texto); el contrato de *tool* queda para Fase 07.
- `tests/horario/dentroHorario.test.ts` — conversión de hora, excepción, patrón semanal, cruce de
  medianoche, sin parámetro.
- `tests/motor/catalogoCompacto.test.ts` — no lleva precios, invalidación inmediata por versión,
  TTL como respaldo.
- `tests/tools/obtenerFicha.test.ts` y `tests/tools/formateoDinero.test.ts` — solo la parte de armado
  de ficha y reutilización del formateador; `formateoDinero.test.ts` ya está cubierto por los tests de
  `compartido/dinero` de Fase 00a, se verifica que no falte ningún caso.

## Capabilities

### New Capabilities

- `catalogo`: contrato observable de la lectura de productos, la ficha con dinero formateado, la
  caché con invalidación por versión y el cálculo de cobertura/tarifa de envío. Ids sugeridos:
  `CAT1…CATn`.
- `horario`: contrato observable de si un momento dado está dentro del horario de atención,
  incluyendo excepciones puntuales. Ids sugeridos: `HOR1…HORn`. Se separa de `catalogo` porque es un
  puerto reutilizable por otras fases (Fase 08, R10 de `openspec/specs/leads/spec.md`, ya depende de
  "fuera de horario") y por Fase 04 (P13), no solo por el catálogo.

### Modified Capabilities

- `agente` (R2): sin delta de texto esperado — los escenarios ya escritos describen el lado del LLM
  (Fase 07); esta fase **implementa** la mitad "backend calcula y formatea" sin cambiar el requisito.
- `configuracion-negocio` (R15): sin delta de texto esperado — el escenario 3 ya cita literalmente
  "el factor volumétrico" como ejemplo de parámetro; esta fase lo implementa.
- `persistencia`: sin delta esperado — Q2 ya decidió que la especificidad de `tarifa_estimada` se
  resuelve en el algoritmo de búsqueda, sin restricción nueva de esquema.

## Approach

1. **Reutilizar el patrón de `geografia`** (Fase 01, T3: dominio puro + puerto + infraestructura
   Prisma) para los módulos `catalogo` y `horario`.
2. **Dominio primero, puro, sin NestJS**: portar `calculo.ts` y `dentroHorario.ts` con sus tests
   como están, cambiando solo la forma (reloj inyectado, sin acceso a Prisma ni Redis en el dominio).
3. **Repositorios sobre el esquema ya migrado**: ningún repositorio de esta fase crea tablas; si
   aparece la necesidad de la restricción de `tarifa_estimada` (Q2), se seclara primero en
   `MODELO_DATOS.md`.
4. **Caché como provider con DI**: construida por Nest (`@Injectable`), inyectando el cliente de
   Redis ya presente en el stack (usado hoy en `plataforma/salud`), nunca abriendo conexión al
   importar el módulo (**A1**) ni importando el módulo de colas (**A3**).
5. **Servicios de aplicación, no *tools* todavía**: `ObtenerFichaProducto` y `CotizarEnvio` devuelven
   texto ya formateado; el contrato de *tool* para el LLM (`ai` / function-calling) es explícitamente
   Fase 07 — este límite se marca en el código con un comentario TSDoc, no solo en este documento.
6. **Evidencia real por tarea** (patrón de Fase 01): cada tarea deja en `tasks.md` la salida real del
   test (RED → GREEN → REFACTOR) y el nombre exacto del escenario que cubre.

**Entrega**: `auto-chain`, `stacked-to-main`. Corte natural de slices: (a) dominio puro de envío y
horario + tests portados, (b) repositorios de catálogo/envío/horario sobre Prisma, (c) caché de
catálogo con invalidación por versión + servicios de aplicación de ficha y cotización, (d) cierre
documental.

## Affected Areas

| Área | Impacto | Descripción |
|---|---|---|
| `src/modulos/catalogo/` | New | Dominio (envío), aplicación (ficha, cotización, caché), puertos, infraestructura Prisma |
| `src/modulos/horario/` | New | Puerto `Horario`, dominio, infraestructura Prisma |
| `test/` | New | Tests portados de envío, horario, caché, ficha |
| `openspec/specs/catalogo/`, `openspec/specs/horario/` | New (al archivar) | Dominios nuevos |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modified | Al archivar: filas migradas y estado de la fase |

## Risks

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Repetir A1/A3 si la caché de catálogo no queda bien aislada del módulo de colas | Media | Approach punto 4; revisión explícita en `sdd-design` de las dependencias del módulo `catalogo` |
| Que el algoritmo de `tarifa_estimada` (Q2) no cubra un caso real de ambigüedad en los datos | Baja | `sdd-tasks` incluye un test que demuestre el criterio de desempate; si aparece un caso real, se documenta primero en `MODELO_DATOS.md` antes de añadir restricción |
| Presupuesto de ~400 líneas por PR con 2 módulos nuevos | Media | Slices del Approach; si una slice lo supera por naturaleza, se explica y se sigue |

## Rollback Plan

- Todo vive en la rama `fase-02-catalogo` y en slices apilados (`stacked-to-main`). Revertir = no
  fusionar la cadena, o `git revert` del commit de la slice afectada.
- No hay datos en producción; las tablas de envío/cobertura/horario nacen sin filas de negocio (P7).
- No hay cambios de esquema previstos (Q2): revertir el código de esta fase no toca `prisma/migrations/`.

## Dependencies

- Fase 00a y Fase 01 cerradas: `compartido/dinero`, `plataforma/reloj`, esquema v1 de Prisma,
  patrón de módulo `geografia`.
- Redis disponible (ya en `docker-compose.yml`, ya usado por `plataforma/salud`).

## Preguntas abiertas

**Ninguna pregunta de `docs/PREGUNTAS_ABIERTAS.md` bloquea esta fase.** P13 (horario) ya está resuelta
para esta fase (tabla propia); solo su reemplazo eventual por Chatwoot es cosa de Fase 04.

Preguntas nuevas de esta proposal, ya decididas por el usuario (2026-09-26):

| # | Pregunta | Decisión del usuario | Efecto |
|---|---|---|---|
| Q1 | ¿La búsqueda difusa de catálogo por texto (`buscarProducto.ts` del prototipo) se construye en esta fase, o se pospone íntegra a la Fase 07 junto con las demás *tools*? | **Posponer a Fase 07** (recomendación aceptada) | Fase 02 solo expone `listarProductosActivos()`; `sdd-tasks` no incluye búsqueda difusa |
| Q2 | ¿La especificidad de `tarifa_estimada` (evitar que dos tarifas empaten) se resuelve con una restricción de base de datos, o basta un algoritmo determinístico de búsqueda sin restricción nueva? | **Algoritmo primero, sin restricción nueva** (recomendación aceptada) | `sdd-design` no agrega migración a `tarifa_estimada`; si aparece ambigüedad real en los datos, se documenta primero en `MODELO_DATOS.md` antes de añadir la restricción |

## Success Criteria

- [ ] Los tests de cálculo de envío y de horario, portados del prototipo, pasan.
- [ ] La ficha de producto expone precio y recargo contraentrega como texto ya formateado,
      reutilizando `compartido/dinero` sin nueva lógica de formateo.
- [ ] La cobertura de envío evalúa exclusión antes que tarifa; sin match, registra
      `evento_fuera_cobertura` y no ofrece ningún rango.
- [ ] El horario de atención respeta: excepción del día gana sobre el patrón semanal; sin parámetro
      configurado se asume dentro de horario; un rango que cruza medianoche se evalúa correctamente.
- [ ] La caché de catálogo se invalida por versión sin esperar el TTL y es un *provider* inyectable,
      no un singleton de módulo.
- [ ] `npm run verify` en verde.
- [ ] Cada escenario de las specs delta de `catalogo` y `horario` tiene su test nombrado
      `<id> — <título>` y pasa.
