# Design: Fase 02 — Catálogo

- Change: `fase-02-catalogo` · Fecha: 2026-09-26 · Insumos: `proposal.md` (Q1 y Q2 decididas),
  `specs/catalogo/spec.md` (CAT1-CAT11), `specs/horario/spec.md` (HOR1-HOR7), patrón de módulo
  `geografia` (Fase 01), `../ChatLuxeCRM/src/envios/calculo.ts`,
  `../ChatLuxeCRM/src/horario/dentroHorario.ts`, `../ChatLuxeCRM/src/motor/catalogoCompacto.ts`,
  `../ChatLuxeCRM/src/tools/{obtenerFicha,cotizarEnvio}.ts`, `../ChatLuxeCRM/src/lib/texto.ts`.
- ADRs que aplica: ADR-0007 (llaves), ADR-0006 (un solo negocio, sin cambio). **Ningún ADR nuevo**
  (ver §"ADRs").
- Endpoints nuevos: **ninguno**. Esta fase es lógica interna (dominio + aplicación + repositorios);
  no hay `interfaz/` (controllers) todavía. El contrato de *tool* del LLM que consumirá estos
  servicios es explícitamente Fase 07 (proposal, Out of Scope). El contrato OpenAPI no cambia;
  `contrato:deriva` sigue en verde sin regenerar nada.
- Esquema: **sin cambios**. Q2 (proposal) ya decidió que la especificidad de `tarifa_estimada` se
  resuelve con un algoritmo determinístico, no con una restricción nueva. `MODELO_DATOS.md` no se
  toca.

## Resumen

La fase se construye en el mismo orden que Fase 01: **dominio puro primero, repositorios Prisma
después, caché y orquestación al final**.

1. **Dos módulos nuevos, hojas del monolito**: `modulos/catalogo` (dominio `producto` + `envio`,
   puertos, aplicación, infraestructura Prisma + Redis) y `modulos/horario` (puerto `Horario`,
   dominio, infraestructura Prisma). Ninguno depende de `modulos/geografia`: la especificidad de
   envío (CAT8) se resuelve comparando **nombres** normalizados de departamento/ciudad — el mismo
   criterio que ya usaba el prototipo —, y esos nombres llegan por la relación Prisma que ya declara
   `schema.prisma` entre `tarifa_estimada`/`zona_sin_cobertura` y `departamento`/`ciudad`, sin cruzar
   ninguna frontera de módulo (ver D1).
2. **Nuevo helper compartido `compartido/texto`**: `normalizarTexto`/`normalizarLugar`, portados de
   `../ChatLuxeCRM/src/lib/texto.ts` sin cambios de comportamiento. Los necesita el dominio de envío
   para CAT8 ("ignorar tildes, mayúsculas y puntuación").
3. **Caché de catálogo como *provider* de NestJS**, no un `let` de módulo: corrige A1 (abría Redis al
   importarse) y A3 (dependía de la conexión del módulo de colas) reutilizando el patrón ya aceptado
   de `plataforma/redis` (`REDIS_CLIENTE`, conexión perezosa) y el mismo protocolo de conexión bajo
   demanda que ya usa `IndicadorRedis` (Fase 00b).
4. **`RepositorioParametro` propio por módulo**, no un módulo `configuracion` compartido: `catalogo`
   y `horario` leen `parametro` cada uno por su cuenta, con su propio puerto tipado (D5).

## Technical Approach

Los 4 slices del Approach de la proposal no cambian: (a) dominio puro de envío/horario + tests
portados + `compartido/texto`, (b) repositorios sobre Prisma, (c) caché + servicios de aplicación
de ficha y cotización, (d) cierre documental. Este diseño solo precisa el contenido de cada uno; el
recuento de líneas por slice lo fija `sdd-tasks`.

## Architecture Decisions

### D1 — Especificidad de envío por nombre normalizado, sin depender de `geografia`

**Hallazgo al leer `specs/catalogo/spec.md`**: CAT8 exige comparar **nombres** de departamento/ciudad
ignorando tildes, mayúsculas y puntuación (`"Cundinamarca"/"Bogotá"` → tarifa de "Bogotá D.C."), no
comparar códigos DANE. Esto descarta una idea más simple que se consideró al leer solo la proposal
(derivar el departamento desde el prefijo del código DANE de la ciudad): el algoritmo real que pide
la spec necesita los **nombres**, porque el cliente (o el LLM que lo transcribe) escribe lugares en
texto libre y puede equivocarse de departamento — exactamente el caso que porta CAT8 desde
`elegirTarifa` del prototipo.

**Elección**: `catalogo/infraestructura/repositorio-envio-prisma.ts` consulta `tarifa_estimada` y
`zona_sin_cobertura` con `include: { departamento: true, ciudad: true }` (relaciones que
`schema.prisma` ya declara) y mapea cada fila a un tipo de dominio con `departamentoNombre` /
`ciudadNombre` (`null` = tarifa nacional o exclusión de todo el departamento). El dominio puro
(`catalogo/dominio/envio.ts`) hace el match normalizando con `compartido/texto`, igual que
`elegirTarifa` del prototipo.

**Alternativa descartada**: que `catalogo` inyecte `REPOSITORIO_GEOGRAFIA` (el puerto de
`geografia`, Fase 01) y arme sus propios mapas id↔nombre. Se descarta porque:

- `REPOSITORIO_GEOGRAFIA` hoy solo expone `listarDepartamentos()` y `listarCiudadesDe(departamentoId)`
  — ninguno sirve para resolver "¿cómo se llama la ciudad de esta fila de tarifa?" sin antes
  paginar las ~1.120 ciudades o añadir un método nuevo al puerto de `geografia` solo para este caso.
- La relación Prisma (`departamento`/`ciudad` en `TarifaEstimada`/`ZonaSinCobertura`) ya resuelve
  exactamente ese join en una sola consulta, sin round-trip adicional.
- La regla de fronteras 4/12 (`dependency-cruiser`) restringe **dónde** vive el cliente Prisma
  (infraestructura/plataforma-prisma), no **qué modelos** puede leer cada `infraestructura/`; usar
  el include no cruza ninguna frontera de módulo (`catalogo` no importa nada de `modulos/geografia`).
- El comentario de `geografia.module.ts` ("el puerto se exporta para que otros módulos... puedan
  inyectarlo") es una expectativa general, escrita antes de que existiera este diseño; esta decisión
  la reemplaza con una razón concreta, sin abrir una dependencia de módulo que ningún otro punto de
  la proposal pide. Si una fase futura (contactos, ventas) sí necesita **escribir** o **listar
  completo** el catálogo geográfico, ese caso sí amerita el puerto — no es este.

**Consecuencia**: `catalogo` NO importa `modulos/geografia`. Su dependencia con las tablas
`departamento`/`ciudad` es solo de esquema compartido (mismo Postgres), nunca de código.

### D2 — Caché de catálogo: *provider* de Nest + puerto propio, reutilizando el patrón de `plataforma/redis`

**Elección**: `CACHE_CATALOGO` (puerto de `catalogo`) con un adaptador `@Injectable()`
(`CacheCatalogoRedis`) cuyo **estado es de instancia** (un campo privado, construido por Nest),
nunca un `let` de módulo. El adaptador inyecta `REDIS_CLIENTE` de `plataforma/redis` (D12 de Fase
00b: cliente con `lazyConnect: true`, no conecta al construirse) y `CLOCK` de `plataforma/reloj`
(TTL de respaldo leído con `this.clock.ahora()`, nunca `Date.now()`, PLT2). Antes del primer
`GET`/`INCR` sobre la clave de versión, comprueba `this.redis.status` y llama `connect()` solo si
hace falta — el mismo protocolo que ya usa `IndicadorRedis` (`plataforma/salud/indicador-redis.ts`),
reutilizado en vez de inventado.

Esto corrige los dos antipatrones citados por la proposal:

- **A1** (abría Redis al importar el módulo): construir `CacheCatalogoRedis` no conecta nada; la
  conexión se abre en el primer uso real, igual que el indicador de salud.
- **A3** (dependía de la conexión del módulo de colas): `catalogo` no importa ningún módulo de
  colas — hoy no existe ninguno en este repo (`src/modulos/colas/` no existe) — sino
  `plataforma/redis`, que ya es la única fuente de cliente Redis compartido del monolito. Si una
  fase futura agrega `modulos/colas` (BullMQ), `catalogo` seguirá sin importarlo: su único canal a
  Redis es `plataforma/redis`, detrás de su propio puerto.

**Clave de versión**: `catalogo:version` (prefijo de módulo, skill §8), igual que el prototipo.
**TTL de respaldo**: 5 minutos, como constante de código (no `parametro`): es un valor de
resiliencia técnica, no un dato de negocio que R15 obligue a hacer editable (a diferencia de
`horario_atencion` o los textos al cliente).

### D3 — Elección de tarifa: orden de especificidad + desempate determinístico (Q2)

CAT8 fija el orden de especificidad (ciudad exacta → departamento por defecto → nacional) y el caso
de "ciudad-distrito bajo otro departamento". Lo que la spec no fija (y Q2 dejó para el diseño) es
**qué pasa si, dentro del mismo nivel de especificidad, dos filas de `tarifa_estimada` cubren el
mismo peso facturable** (dato mal cargado, sin restricción de esquema que lo impida).

**Elección**: dentro del nivel elegido, se ordena por **franja de peso más angosta primero**
(`(pesoMaxG ?? Infinity) - pesoMinG` ascendente) y, si sigue empatado, por `creado` ascendente (gana
la fila más antigua, la que ya estaba operando cuando se cargó la segunda). Determinístico y
documentado; `sdd-tasks` incluye un test que dos filas del mismo nivel con rangos traslapados eligen
la de franja más angosta.

**Por qué no una restricción de esquema** (alternativa real, ya cerrada por Q2 de la proposal): una
`EXCLUDE USING gist` con `int4range` necesitaría la extensión `btree_gist` y una migración; el
usuario ya decidió no tocar el esquema en esta fase salvo que aparezca un caso real de ambigüedad en
los datos (proposal, Risks fila 2). Este desempate es la vía que Q2 pidió explícitamente
("algoritmo, no restricción").

### D4 — `RepositorioParametro` propio por módulo, no un módulo `configuracion` compartido

`catalogo` necesita `factor_volumetrico`, `recargo_contraentrega_pct` y `mensaje_fuera_cobertura`;
`horario` necesita `horario_atencion`. Los dos leen la misma tabla `parametro`, pero ningún módulo de
la lista de `luxeboreal-arquitectura` §1 la posee (a diferencia de `geografia`, dueña de
`departamento`/`ciudad`).

**Elección**: cada módulo define su propio puerto minúsculo y tipado
(`RepositorioParametroCatalogo`, `RepositorioHorario.obtenerPatronSemanal`), implementado en su
propia `infraestructura/` contra la misma tabla `parametro`. Sin puerto compartido nuevo.

**Alternativa descartada**: un módulo nuevo `modulos/configuracion` (o `plataforma/parametros`)
dueño de `parametro`. Se descarta por ahora:

- Solo dos módulos lo necesitan, con dos claves cada uno; el costo de duplicar un `findUnique` es
  menor que el de introducir un módulo nuevo con su propio puerto genérico.
- P13 (`docs/PREGUNTAS_ABIERTAS.md`) ya prevé que Fase 04 reevalúe cómo vive `horario_atencion`
  (posible reemplazo por Chatwoot); crear un módulo compartido ahora se adelantaría a esa decisión.
- Es una decisión de organización interna, reversible, sin alternativas con consecuencias de largo
  plazo — mismo criterio que Fase 01 usó para no abrir ADR por el módulo `geografia` (D8 de su
  diseño).

Si una tercera fase necesita leer `parametro` con lógica no trivial, se reevalúa (nota en Open
Questions).

### D5 — `parametro.valor` es `jsonb`, no `text`: HOR3 valida forma, no sintaxis

El prototipo guardaba `parametro.valor` como `text` y hacía `JSON.parse` con `try/catch` (HOR3:
"JSON inválido... advierte y asume dentro"). En este esquema (`schema.prisma`, Fase 01) `valor` ya es
`Json @db.JsonB`: Postgres rechaza JSON sintácticamente inválido al escribir, así que Prisma siempre
devuelve un valor ya parseado (objeto, `null`, string, etc.), nunca un texto que pueda fallar
`JSON.parse`.

**Elección**: `decidirDentroDeHorario` (dominio puro) valida la **forma** del valor deserializado —
MUST ser un objeto plano, no arreglo, no `null` tratado como "clave ausente" — y trata cualquier
forma inesperada (no-objeto, o el valor de un día que no es string/`null`) igual que el prototipo
trataba un JSON inválido: advierte y asume dentro de horario. El escenario HOR3 se prueba guardando
un `parametro.horario_atencion` con una forma no válida (`"no soy un objeto"`, un arreglo, un número),
no con una cadena de texto rota — la única manera de expresarlo contra una columna `jsonb`.

### D6 — Formateo de ficha y cotización vive en `dominio/`, no en `aplicacion/`

`compartido/dinero` no tiene dependencias (`compartido-puro`), y la regla `dominio-aislado` permite
que `dominio/` importe `compartido/`. Por eso `armarFicha` (CAT2) y `armarCotizacionConCobertura`
(CAT10) son funciones puras en `catalogo/dominio/producto.ts` y `catalogo/dominio/envio.ts`
respectivamente, no lógica dentro de los servicios `@Injectable()`. Los servicios de aplicación
(`ObtenerFichaProducto`, `CotizarEnvio`) quedan como orquestadores finos: piden datos a los puertos y
llaman a la función pura del dominio. Resultado: la lógica de formateo se prueba sin arnés de Nest,
igual que `pesoFacturableG` o `dentroDeRango`.

### D7 — `EventoFueraCobertura.departamentoId`/`ciudadId` quedan `null` en esta fase

El modelo Prisma ya tiene columnas `departamento_id`/`ciudad_id` (nullable) en
`evento_fuera_cobertura` para guardar el código DANE **si se pudo traducir** el texto libre del
cliente. CAT9 solo exige guardar `departamentoTexto`/`ciudadTexto` (tal como los escribió el
cliente) y el producto; no pide resolver el código. Traducir el texto libre a un código DANE
necesitaría una búsqueda difusa de nombres de lugar contra `geografia` — la misma clase de
capacidad que Q1 ya pospuso para `buscarProducto` — que no existe todavía en ningún módulo.

**Elección**: `registrarEventoFueraCobertura` siempre guarda `departamentoId: null, ciudadId: null`
en esta fase. Se documenta aquí para que el usuario pueda vetarlo (Open Questions): la fila igual
sirve para "decidir si ampliar la cobertura" (MODELO_DATOS.md §4) porque el texto queda guardado;
solo el enlace automático a un código DANE queda pendiente de una fase que sí construya búsqueda de
lugares (candidata natural: junto con Q1 en Fase 07, o antes si el usuario lo pide ahora).

## Módulos tocados y dependencias

Solo se importa lo exportado por cada módulo (su `index.ts` / los barriles de `plataforma`):

| Módulo | Cambio | Importa de |
|---|---|---|
| `compartido/texto` (**nuevo**) | `normalizarTexto`, `normalizarLugar` (D1), puro, sin imports | nada |
| `modulos/catalogo` (**nuevo**) | dominio (`producto`, `envio`), puertos, aplicación, infraestructura Prisma + Redis | `catalogo.module.ts` → `plataforma/prisma` (`PrismaModule`), `plataforma/redis` (`RedisModule`), `plataforma/reloj` (`RelojModule`); `infraestructura/` → `plataforma/prisma` (`PrismaService`), `plataforma/redis` (`REDIS_CLIENTE`, `ClienteRedis`), `plataforma/reloj` (`CLOCK`, `Clock`); `dominio/` → `compartido/dinero`, `compartido/texto` (permitido, `dominio-aislado`); `aplicacion/` → nada fuera de los puertos y el dominio del propio módulo |
| `modulos/horario` (**nuevo**) | puerto `Horario`, dominio, infraestructura Prisma | `horario.module.ts` → `plataforma/prisma`; `infraestructura/` → `plataforma/prisma`; `aplicacion/` → `plataforma/reloj` (`CLOCK`, `Clock`); `dominio/` → nada |
| `AppModule` | **sin cambio** | Ninguno de los dos módulos se importa todavía — igual que `GeografiaModule` quedó sin registrar tras Fase 01. Los conectará la primera fase que los necesite (07 para `catalogo`, 07/08 para `horario`) |

`catalogo` y `horario` **no** se importan entre sí ni importan `modulos/geografia` (D1). Ninguno
importa un futuro `modulos/colas`: no existe hoy, y aunque exista, la caché de `catalogo` seguirá
detrás de `plataforma/redis` (D2).

## Puertos y adaptadores

| Puerto (token) | Interfaz (resumen) | Adaptador | Módulo |
|---|---|---|---|
| `REPOSITORIO_PRODUCTO` | `listarActivosResumen()`, `buscarPorIdOSku(idOSku)` | `RepositorioProductoPrisma` | `catalogo` |
| `REPOSITORIO_ENVIO` | `listarExclusiones()`, `listarTarifas()`, `registrarEventoFueraCobertura(evento)` | `RepositorioEnvioPrisma` (D1: joins con `departamento`/`ciudad`) | `catalogo` |
| `REPOSITORIO_PARAMETRO_CATALOGO` | `obtenerFactorVolumetrico()`, `obtenerRecargoContraentregaPct()`, `obtenerMensajeFueraCobertura()` | `RepositorioParametroCatalogoPrisma` | `catalogo` |
| `CACHE_CATALOGO` | `obtenerVigente()`, `reemplazar(productos)`, `invalidar()` | `CacheCatalogoRedis` (D2) | `catalogo` |
| `HORARIO` | `estaDentroDeHorario(fecha?)` | `HorarioAtencion` (aplicación, no infraestructura: orquesta dominio + `REPOSITORIO_HORARIO`) | `horario` |
| `REPOSITORIO_HORARIO` | `existeExcepcion(fechaIso)`, `obtenerPatronSemanal()` | `RepositorioHorarioPrisma` | `horario` |

Ningún puerto existente (`CLOCK`, `REDIS_CLIENTE`, `REPOSITORIO_GEOGRAFIA`) se modifica.

## Eventos de dominio

**Ninguno.** `EventoFueraCobertura` es una fila que `CotizarEnvio` escribe directamente a través de
`REPOSITORIO_ENVIO.registrarEventoFueraCobertura`, sin ningún consumidor reactivo dentro de esta
fase (igual criterio que la semilla de geografía en Fase 01, D8 de su diseño: una escritura sin
efecto secundario asíncrono no es un evento). `Horario` tampoco lo necesita: otros módulos lo
consultan como **consulta** (llamada al caso de uso `estaDentroDeHorario`), no como **hecho pasado**
— la comunicación entre módulos de la skill §4 reserva los eventos para "esto pasó", no para "dime
si". Si una fase futura (08, leads) necesita reaccionar de forma asíncrona a "quedó sin cobertura" o
"se cerró fuera de horario", esa fase decide el evento cuando construya su propio consumidor.

## Configuración

**Sin variables nuevas.** `catalogo` y `horario` no leen `process.env` en ningún punto: la clave de
versión de Redis (`catalogo:version`), el TTL de respaldo de la caché (5 min) y las claves de
`parametro` que cada módulo lee (`factor_volumetrico`, `recargo_contraentrega_pct`,
`mensaje_fuera_cobertura`, `horario_atencion`) son constantes de código o datos ya persistidos en
`parametro`/`excepcion_horario` (Fase 01). `plataforma/config` no cambia.

## ADRs

| ADR | Relación | Cambio en el documento |
|---|---|---|
| ADR-0007 | Sin cambio: los ids nuevos que se leen (`Producto.id`, `TarifaEstimada.id`, etc.) ya existen desde Fase 01 | Ninguno |
| ADR-0006 | Un solo negocio, sin `cuenta_id` — esta fase no lo toca | Ninguno |

**ADR nuevo: ninguno.** Se evaluaron tres candidatas y las tres se descartan por el mismo criterio
que usó Fase 01 para su módulo `geografia` (D8 de su diseño: alternativa real pero decisión de
implementación reversible, dentro de un ADR ya aceptado, sin consecuencias de largo plazo para otros
módulos):

- **D1** (join directo vía Prisma vs. depender de `REPOSITORIO_GEOGRAFIA`): aplica ADR-0001
  (monolito modular); no compromete a `contactos` ni `ventas` a seguir el mismo patrón cuando lleguen
  a necesitar geografía.
- **D2** (caché como *provider* detrás de un puerto propio): es la corrección de un antipatrón ya
  señalado por la proposal (A1/A3), no una decisión nueva con alternativas por evaluar.
- **D4** (puerto de parámetro por módulo vs. módulo `configuracion` compartido): reversible, de bajo
  costo, y P13 ya anticipa que Fase 04 puede reabrir cómo vive `horario_atencion`.

## Data Flow

```
ObtenerFichaProducto.ejecutar(idOSku)
  ├─► REPOSITORIO_PRODUCTO.buscarPorIdOSku(idOSku) ──► Producto | null
  │     null o !activo ─────────────────────────────► ProductoNoDisponible (CAT3)
  └─► REPOSITORIO_PARAMETRO_CATALOGO.obtenerRecargoContraentregaPct()
        └─► dominio: armarFicha(producto, pct, tieneFotos) ─► FichaProducto (CAT2)

ListarProductosActivos.ejecutar() / ObtenerCatalogoCompacto.ejecutar()
  ├─► CACHE_CATALOGO.obtenerVigente() ─► copia | null
  │     copia ──────────────────────────────────────► listo (CAT4)
  └─► null: REPOSITORIO_PRODUCTO.listarActivosResumen() ─► CACHE_CATALOGO.reemplazar(...) ─► listo
  (ObtenerCatalogoCompacto compone con dominio: armarCatalogoCompacto(resumen) ─► texto, CAT4)

CotizarEnvio.ejecutar(idOSku, destino)
  ├─► REPOSITORIO_PRODUCTO.buscarPorIdOSku(idOSku) ──► Producto | null (null ⇒ peso 0, CAT6)
  ├─► REPOSITORIO_PARAMETRO_CATALOGO.obtenerFactorVolumetrico()
  │     └─► dominio: pesoFacturableG([...], factor)
  ├─► REPOSITORIO_ENVIO.listarExclusiones() ──► dominio: hayExclusion(..., destino) (CAT7)
  │     true ⇒ registrarEventoFueraCobertura + REPOSITORIO_PARAMETRO_CATALOGO.obtenerMensajeFueraCobertura() ⇒ {cobertura:false} (CAT9, CAT11)
  └─► REPOSITORIO_ENVIO.listarTarifas() ──► dominio: elegirTarifa(..., destino, pesoG) (CAT8, D3)
        sin match ⇒ igual que arriba (CAT9, CAT11)
        match ⇒ dominio: armarCotizacionConCobertura(tarifa) ⇒ {cobertura:true, rangoTexto, diasTexto, contraentregaDisponible} (CAT10)

HorarioAtencion.estaDentroDeHorario(fecha = CLOCK.ahora())
  ├─► dominio: momentoLocal(fecha)
  ├─► REPOSITORIO_HORARIO.existeExcepcion(fechaIso) ──► true ⇒ dominio: decidirDentroDeHorario(...) = false (HOR1)
  └─► REPOSITORIO_HORARIO.obtenerPatronSemanal() ──► dominio: decidirDentroDeHorario(momento, false, valorCrudo)
        (HOR2 sin parámetro, HOR3 forma inválida, HOR4 día fuera de patrón, HOR5 null/"", HOR6 cruce de medianoche)
```

## File Changes

| Archivo | Acción | Slice | Descripción |
|---|---|---|---|
| `src/compartido/texto/texto.ts` (+ `.spec.ts`), `index.ts` | Create | S(a) | `normalizarTexto`, `normalizarLugar` portados de `lib/texto.ts` |
| `src/modulos/catalogo/dominio/envio.ts` (+ `.spec.ts`) | Create | S(a) | `LineaPeso`, `DestinoEnvio`, tipos de tarifa/exclusión de dominio, `pesoRealG`/`pesoVolumetricoG`/`pesoFacturableG`, `validarFactorVolumetrico`, `hayExclusion`, `elegirTarifa` (D1, D3), `armarCotizacionConCobertura` (D6) |
| `src/modulos/catalogo/dominio/producto.ts` (+ `.spec.ts`) | Create | S(a) | `Producto`, `ProductoResumen`, `FichaProducto`, `ProductoNoDisponible`, `armarFicha` (D6), `armarCatalogoCompacto` |
| `src/modulos/horario/dominio/horario.ts` (+ `.spec.ts`) | Create | S(a) | `momentoLocal`, `rangoDelDia`, `dentroDeRango`, `decidirDentroDeHorario` (D5), portados de `dentroHorario.ts` |
| `src/modulos/catalogo/puertos/repositorio-producto.ts` | Create | S(b) | Puerto + token |
| `src/modulos/catalogo/puertos/repositorio-envio.ts` | Create | S(b) | Puerto + token |
| `src/modulos/catalogo/puertos/repositorio-parametro.ts` | Create | S(b) | Puerto + token (D4) |
| `src/modulos/catalogo/infraestructura/repositorio-producto-prisma.ts` | Create | S(b) | Adaptador |
| `src/modulos/catalogo/infraestructura/repositorio-envio-prisma.ts` | Create | S(b) | Adaptador con `include` (D1) |
| `src/modulos/catalogo/infraestructura/repositorio-parametro-prisma.ts` | Create | S(b) | Adaptador |
| `test/integracion/catalogo/repositorio-*.spec.ts` | Create | S(b) | Contra Postgres real, base del worker |
| `src/modulos/horario/puertos/horario.ts` | Create | S(b) | Puerto `HORARIO` + token |
| `src/modulos/horario/puertos/repositorio-horario.ts` | Create | S(b) | Puerto + token |
| `src/modulos/horario/infraestructura/repositorio-horario-prisma.ts` | Create | S(b) | Adaptador |
| `test/integracion/horario/repositorio-horario.spec.ts` | Create | S(b) | Contra Postgres real |
| `src/modulos/catalogo/puertos/cache-catalogo.ts` | Create | S(c) | Puerto + token (D2) |
| `src/modulos/catalogo/infraestructura/cache-catalogo-redis.ts` (+ `.spec.ts` con fake de Redis) | Create | S(c) | Adaptador (D2) |
| `src/modulos/catalogo/aplicacion/obtener-ficha-producto.ts` (+ `.spec.ts`) | Create | S(c) | Caso de uso (CAT2, CAT3) |
| `src/modulos/catalogo/aplicacion/listar-productos-activos.ts` (+ `.spec.ts`) | Create | S(c) | Caso de uso + invalidación (CAT1, CAT4, CAT5) |
| `src/modulos/catalogo/aplicacion/obtener-catalogo-compacto.ts` (+ `.spec.ts`) | Create | S(c) | Compone con dominio (CAT4) |
| `src/modulos/catalogo/aplicacion/cotizar-envio.ts` (+ `.spec.ts`) | Create | S(c) | Caso de uso (CAT6-CAT11) |
| `src/modulos/horario/aplicacion/horario-atencion.ts` (+ `.spec.ts`) | Create | S(c) | Implementa `Horario` (HOR1-HOR7) |
| `src/modulos/catalogo/catalogo.module.ts`, `index.ts` | Create | S(c) | Módulo y barril |
| `src/modulos/horario/horario.module.ts`, `index.ts` | Create | S(c) | Módulo y barril |
| `test/integracion/catalogo/cache-catalogo-redis.spec.ts` | Create | S(c) | Redis real, invalidación entre procesos (CAT5) |
| `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modify | S(d) | §1: módulos `catalogo`, `horario`, `compartido/texto` |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modify | S(d, al archivar) | Filas migradas y estado de fase |

## Interfaces / Contracts

```ts
// src/compartido/texto/texto.ts (D1)
export function normalizarTexto(texto: string): string;
export function normalizarLugar(texto: string): string; // solo letras, números, espacios

// src/modulos/catalogo/dominio/envio.ts
export interface LineaPeso {
  readonly cantidad: number;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
}
export interface DestinoEnvio { readonly departamento: string; readonly ciudad?: string | null }
export const FACTOR_VOLUMETRICO_POR_DEFECTO = 4000;

export function pesoFacturableG(lineas: readonly LineaPeso[], factorVolumetrico: number): number;
export function validarFactorVolumetrico(valorCrudo: unknown): number; // default si falta/inválido

export interface CandidataTarifa {
  readonly id: string;
  readonly departamentoNombre: string | null; // null = nacional
  readonly ciudadNombre: string | null;        // null = tarifa por defecto del departamento
  readonly pesoMinG: number;
  readonly pesoMaxG: number | null;
  readonly rangoMinCop: number;
  readonly rangoMaxCop: number;
  readonly diasMin: number;
  readonly diasMax: number;
  readonly contraentregaDisponible: boolean;
  readonly creado: Date;
}
export interface CandidataExclusion {
  readonly departamentoNombre: string;
  readonly ciudadNombre: string | null; // null = todo el departamento
}

export function hayExclusion(exclusiones: readonly CandidataExclusion[], destino: DestinoEnvio): boolean; // CAT7
export function elegirTarifa(
  candidatas: readonly CandidataTarifa[], destino: DestinoEnvio, pesoFacturableG: number,
): CandidataTarifa | undefined; // CAT8, D3

export type ResultadoCotizacion =
  | { readonly cobertura: true; readonly rangoTexto: string; readonly diasTexto: string; readonly contraentregaDisponible: boolean }
  | { readonly cobertura: false; readonly mensaje: string };
export function armarCotizacionConCobertura(tarifa: CandidataTarifa): ResultadoCotizacion; // CAT10, D6

// src/modulos/catalogo/dominio/producto.ts
export interface ProductoResumen { readonly id: string; readonly sku: string; readonly nombre: string; readonly descripcionCorta: string }
export interface Producto extends ProductoResumen {
  readonly descripcionLarga: string; readonly precioCop: number; readonly activo: boolean;
  readonly pesoGramos: number | null; readonly largoMm: number | null; readonly anchoMm: number | null; readonly altoMm: number | null;
  readonly tieneFotos: boolean;
}
export interface FichaProducto {
  readonly id: string; readonly sku: string; readonly nombre: string; readonly descripcionLarga: string;
  readonly precioTexto: string; readonly recargoContraentregaTexto: string; readonly tieneFotos: boolean;
}
export class ProductoNoDisponible extends Error {} // CAT3: inexistente o inactivo
export function armarFicha(producto: Producto, recargoContraentregaPct: number): FichaProducto; // CAT2, D6
export function armarCatalogoCompacto(productos: readonly ProductoResumen[]): string; // CAT4

// src/modulos/catalogo/puertos/repositorio-producto.ts
export const REPOSITORIO_PRODUCTO = Symbol('REPOSITORIO_PRODUCTO');
export interface RepositorioProducto {
  listarActivosResumen(): Promise<readonly ProductoResumen[]>; // ordenado por nombre (CAT4)
  buscarPorIdOSku(idOSku: string): Promise<Producto | null>;
}

// src/modulos/catalogo/puertos/repositorio-envio.ts
export const REPOSITORIO_ENVIO = Symbol('REPOSITORIO_ENVIO');
export interface NuevoEventoFueraCobertura {
  readonly productoId: string | null;
  readonly departamentoTexto: string;
  readonly ciudadTexto: string | null;
  readonly departamentoId: null; // D7: no se resuelve en esta fase
  readonly ciudadId: null;
}
export interface RepositorioEnvio {
  listarExclusiones(): Promise<readonly CandidataExclusion[]>;
  listarTarifas(): Promise<readonly CandidataTarifa[]>;
  registrarEventoFueraCobertura(evento: NuevoEventoFueraCobertura): Promise<void>;
}

// src/modulos/catalogo/puertos/repositorio-parametro.ts
export const REPOSITORIO_PARAMETRO_CATALOGO = Symbol('REPOSITORIO_PARAMETRO_CATALOGO');
export interface RepositorioParametroCatalogo {
  obtenerFactorVolumetrico(): Promise<number>;
  obtenerRecargoContraentregaPct(): Promise<number>;
  obtenerMensajeFueraCobertura(): Promise<string>;
}

// src/modulos/catalogo/puertos/cache-catalogo.ts
export const CACHE_CATALOGO = Symbol('CACHE_CATALOGO');
export interface CacheCatalogo {
  obtenerVigente(): Promise<readonly ProductoResumen[] | null>;
  reemplazar(productos: readonly ProductoResumen[]): Promise<void>;
  invalidar(): Promise<void>;
}

// src/modulos/horario/dominio/horario.ts
export const ZONA_HORARIA = 'America/Bogota';
export interface MomentoLocal { readonly dia: string; readonly minutos: number; readonly fechaIso: string }
export function momentoLocal(fecha: Date): MomentoLocal;
export function dentroDeRango(rango: string, minutos: number): boolean;
export interface ResultadoHorario { readonly dentro: boolean; readonly advertencia?: string }
export function decidirDentroDeHorario(
  momento: MomentoLocal, existeExcepcion: boolean, valorCrudo: unknown,
): ResultadoHorario; // HOR1-HOR5, D5

// src/modulos/horario/puertos/horario.ts
export const HORARIO = Symbol('HORARIO');
export interface Horario { estaDentroDeHorario(fecha?: Date): Promise<boolean> } // HOR7

// src/modulos/horario/puertos/repositorio-horario.ts
export const REPOSITORIO_HORARIO = Symbol('REPOSITORIO_HORARIO');
export interface RepositorioHorario {
  existeExcepcion(fechaIso: string): Promise<boolean>;
  obtenerPatronSemanal(): Promise<unknown>; // valor crudo de parametro.horario_atencion, o null
}
```

## Testing Strategy

TDD estricto (RED observado → GREEN → REFACTOR), runner Vitest. Cada test se nombra
`<CAT#|HOR#> — <título exacto del escenario>` (nota de implementación de ambas specs).

| Nivel | Qué se prueba | Escenarios |
|---|---|---|
| Unitario | `normalizarTexto`/`normalizarLugar` | (soporte de CAT8, sin id propio: cubierto por los tests de `elegirTarifa`) |
| Unitario | `pesoFacturableG`, `validarFactorVolumetrico` | CAT6 (3 escenarios) |
| Unitario | `hayExclusion`, `elegirTarifa`, `armarCotizacionConCobertura` | CAT7, CAT8 (6 escenarios), CAT9 (parcial: forma del evento), CAT10, CAT11 |
| Unitario | `armarFicha`, `armarCatalogoCompacto` | CAT2 (3 escenarios), CAT4 (escenario 2) |
| Unitario | `momentoLocal`, `dentroDeRango`, `decidirDentroDeHorario` | HOR1-HOR6 |
| Unitario | Casos de uso con dobles de puertos (`test/fakes/`) | CAT1, CAT3, CAT5 (parcial), HOR7 |
| Integración | `RepositorioProductoPrisma`, `RepositorioEnvioPrisma` (incluye el join de D1), `RepositorioParametroCatalogoPrisma`, `RepositorioHorarioPrisma` | Contra Postgres real, base del worker |
| Integración | `CacheCatalogoRedis`: versión compartida entre dos instancias (simula "otro proceso"), TTL como respaldo | CAT4 (escenario 1), CAT5 (los 3 escenarios) — Redis real |
| Integración | `CotizarEnvio` completo: escribe `evento_fuera_cobertura` con `producto_id`/departamento/ciudad | CAT9 |

## Threat Matrix

No aplica de forma diferencial a esta fase: sin rutas HTTP nuevas, sin subprocesos, sin comandos git
nuevos. El único vector propio es SQL: `RepositorioEnvioPrisma`/`RepositorioProductoPrisma` usan
exclusivamente el *query builder* de Prisma (`findMany`, `include`) — sin `$queryRaw`, a diferencia
del repositorio de geografía de Fase 01 (que sí lo necesitaba para el `upsert` por lotes). No hay
texto de usuario que llegue a SQL crudo en esta fase.

## Migration / Rollout

Igual que la proposal: `auto-chain`, `stacked-to-main`, slices (a)-(d) del Approach. Sin migración de
esquema (Q2). El detalle de líneas por slice y las tareas concretas (máximo 10) quedan para
`sdd-tasks`; este diseño solo fija qué contenido entra en cada slice (ver "File Changes").

Review requerida: **RDD** (sin `judgment-day`; 02 no está en la lista de fases 04/05/06/10 de
`docs/fases/README.md`).

**Rollback**: cada slice se revierte solo en orden inverso de la cadena. Ningún slice toca
`prisma/migrations/` ni datos existentes (P7, sin filas de negocio todavía). Revertir cualquier
slice deja `AppModule` exactamente igual, porque ninguno de los dos módulos se importa ahí todavía.

## Open Questions

Ninguna bloquea `sdd-tasks`. Cada una tiene una decisión por defecto ya aplicada en este diseño; se
listan para que el usuario pueda vetarlas al aprobar:

- [ ] **D1**: unir por nombre vía relación Prisma directa en `catalogo/infraestructura`, sin
  depender del puerto de `geografia`.
- [ ] **D3**: desempate de tarifas empatadas en especificidad por franja de peso más angosta, luego
  por `creado` ascendente.
- [ ] **D4**: puerto de parámetro propio por módulo (`catalogo`, `horario`), sin un módulo
  `configuracion` compartido.
- [ ] **D7**: `evento_fuera_cobertura.departamento_id`/`ciudad_id` quedan `null` en esta fase; no se
  resuelve el texto libre del cliente a código DANE (esa capacidad no existe todavía en ningún
  módulo, y ninguna spec de esta fase la exige).
- [ ] **TTL de la caché de catálogo (5 min)** como constante de código, no como `parametro` editable
  (D2): es una decisión de resiliencia técnica, no un dato de negocio en el sentido de R15.
