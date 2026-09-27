# Design: Fase 03 — Importador y medios

- Change: `fase-03-importador-medios` · Fecha: 2026-09-26 · Insumos: `proposal.md` (Q1-Q4 decididas),
  `specs/catalogo/spec.md` (IMP1-IMP13), `specs/medios/spec.md` (MED1-MED9), ADR-0012 (MinIO), ADR-0009
  (Testcontainers), módulos reales `modulos/catalogo` y `modulos/geografia` (Fases 01-02),
  `compartido/texto`, `plataforma/reloj`, `plataforma/config`, precedente `scripts/sembrar-geografia.ts`
  (Fase 01, mismo patrón de comando CLI vía `NestFactory.createApplicationContext`).
- ADRs que aplica: **ADR-0012** (MinIO, backend de `Almacenamiento`), **ADR-0009** (Testcontainers,
  extendido a MinIO — hallazgo D9 abajo). **Ningún ADR nuevo** (ver §"ADRs").
- Endpoints nuevos: **ninguno**. Todo el trabajo de esta fase es un comando CLI (`catalogo:importar`)
  y lógica interna de aplicación/infraestructura; no hay `interfaz/` (controllers) en ningún módulo
  tocado. El contrato OpenAPI no cambia; `contrato:deriva` sigue en verde sin regenerar nada.
- Esquema: **sin cambios**. `Producto`, `Foto`, `Parametro`, `Departamento`, `Ciudad`,
  `ZonaSinCobertura`, `TarifaEstimada`, `ExcepcionHorario` ya existen desde la Fase 01 con las columnas
  que este importador necesita (`foto.clave_archivo`, `producto.clave_collage`, `producto.fotos_hash`
  como claves de objeto/hash, no rutas de filesystem — ya así desde `MODELO_DATOS.md`). `prisma/schema.prisma`
  no se toca.

## Resumen

1. **El importador extiende `modulos/catalogo`** (dominio, puertos, aplicación e infraestructura
   nuevos), tal como sugería la proposal: escribe exactamente las tablas que `catalogo` ya lee (Fase
   02) y reutiliza `CACHE_CATALOGO.invalidar()` sin reimplementar nada.
2. **Módulo nuevo `modulos/medios`** para el puerto `Almacenamiento` (adaptador MinIO) y la generación
   de collage: capacidad genérica reutilizable por módulos futuros, mismo criterio que separó
   `horario` de `catalogo` en la Fase 02.
3. **`catalogo` gana una dependencia nueva de módulo: `modulos/geografia`** (D5 abajo), solo para
   resolver departamento/ciudad de texto a código DANE (IMP9) — nunca para la lectura de envío en
   tiempo real, que sigue comparando por nombre (D1 de la Fase 02, sin cambios).
4. **El comando CLI vive en `scripts/`**, no en `src/` (D11 abajo): el repo ya tiene un patrón
   aceptado y probado para exactamente este tipo de tarea (`scripts/sembrar-geografia.ts`, Fase 01).
5. **Tres dependencias nuevas de producción** (`sharp`, `@aws-sdk/client-s3`, `csv-parse`) y una de
   test (`@testcontainers/minio`, confirmada disponible — D9).

## Architecture Decisions

### D1 — Ubicación del código: extiende `catalogo`, módulo nuevo `medios`

Se confirma la sugerencia de la proposal, sin alternativa real que la dispute:

- **`modulos/catalogo`** gana `dominio/validar-catalogo.ts`, `dominio/resolver-lugar.ts`,
  `puertos/fuente-catalogo.ts`, `puertos/repositorio-importacion.ts`,
  `infraestructura/fuente-catalogo-sheets.ts`, `infraestructura/fuente-catalogo-directorio.ts`,
  `infraestructura/csv.ts`, `infraestructura/descarga-drive.ts`,
  `infraestructura/repositorio-importacion-prisma.ts`, `aplicacion/importar-catalogo.ts`,
  `aplicacion/procesar-fotos.ts`, `aplicacion/resolver-geografia-importacion.ts`. Motivo: escribe
  las mismas tablas que `catalogo` ya lee (CAT1-CAT11) y reutiliza `CACHE_CATALOGO`,
  `REPOSITORIO_PRODUCTO` (lectura de estado previo) y el dominio de envío existente sin cruzar
  ninguna frontera de módulo.
- **`modulos/medios` (nuevo)** para `puertos/almacenamiento.ts`, `infraestructura/almacenamiento-minio.ts`,
  `aplicacion/collage.ts` (ver D-collage abajo). Motivo: es una capacidad genérica — cualquier módulo
  futuro con archivos (fotos de perfil, adjuntos de soporte) la reutiliza sin depender de `catalogo` —
  mismo criterio documentado en `specs/medios/spec.md` §Purpose y ya usado para separar `horario`.

**Alternativa descartada**: un tercer módulo `importador` dueño de todo el flujo. Se descarta porque
el importador no tiene ningún dato propio que persistir fuera de las tablas que ya son de `catalogo`
(`producto`, `foto`, `tarifa_estimada`, `zona_sin_cobertura`, `parametro`, `excepcion_horario`); un
módulo sin tablas propias, cuyos casos de uso solo escriben en el agregado de otro módulo, es la señal
que la skill usa para "esto no es un módulo, es una capacidad del dueño de los datos".

### D2 — Puerto `FuenteCatalogo`: cinco pestañas fijas, dos adaptadores intercambiables

```ts
export type NombrePestana = 'productos' | 'tarifas' | 'cobertura' | 'parametros' | 'excepciones_horario';
```

(IMP1: las cinco pestañas exactas, sin pestaña separada de "fotos" — los enlaces de foto son una
columna `fotos` dentro de `productos`, IMP3/IMP4.) `FuenteCatalogoSheets` descarga cada pestaña por
nombre desde `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<nombre>`;
`FuenteCatalogoDirectorio` lee `<dir>/<nombre>.csv` (IMP1, `productos.csv`, `tarifas.csv`,
`cobertura.csv`, `parametros.csv`, `excepciones_horario.csv` — nombres literales del escenario de
IMP1). Ambos parsean con el mismo helper `infraestructura/csv.ts` (D10) y devuelven `FilaCruda[]`
(`Record<string, string>`), sin que `aplicacion/` distinga cuál origen se usó (IMP1, segundo
escenario: "sin que el resto del importador distinga cuál de los dos orígenes se usó").

**Detección de hoja no compartida / pestaña inexistente (IMP2)**: `FuenteCatalogoSheets` MUST
detectar respuesta HTML (`Content-Type: text/html` o cuerpo que empieza por `<!DOCTYPE`/`<html`) antes
de intentar parsear como CSV, y lanzar `PestanaNoDisponible` con motivo `'no_compartida'`. Un CSV con
cero filas de cabecera reconocible, o un archivo local inexistente (`ENOENT`), lanza el mismo error con
motivo `'inexistente'`, nombrando la pestaña.

### D3 — Puerto `Almacenamiento` sobre MinIO: bucket público, SDK S3-compatible

`AlmacenamientoMinio` usa `@aws-sdk/client-s3` (`S3Client`, `PutObjectCommand`, `DeleteObjectCommand`)
apuntando al endpoint MinIO (ADR-0012 ya nombra este SDK explícitamente como la vía elegida). El
bucket se configura con política de lectura pública al aprovisionarlo (fuera del código: documentado
en `docs/operacion/` o el script de arranque de Fase 09, no en esta fase): `obtenerUrl` construye la
URL pública (`http(s)://<endpoint>/<bucket>/<clave>`) de forma **síncrona** por dentro, envuelta en
`Promise.resolve(...)` para cumplir la interfaz — no pide una URL firmada.

**Alternativa descartada**: URL firmada con expiración (`getSignedUrl` de
`@aws-sdk/s3-request-presigner`). Se descarga porque las fotos de producto se citan al cliente por
WhatsApp y pueden reabrirse días o semanas después (el agente del Fase 07 puede volver a mencionar el
mismo producto); una URL que expira rompería ese enlace sin que ningún flujo la regenere. Bucket
público es aceptable: son fotos de catálogo público de un negocio de venta, no contienen PII (R14 no
aplica a `foto`/`producto`).

**Nota para el usuario (no bloquea, queda en Open Questions)**: la política de bucket público es una
decisión de seguridad menor que ADR-0012 no fijó explícitamente (solo eligió el backend). Se aplica
aquí como valor por defecto razonable; el usuario puede vetarla al aprobar este diseño.

### D4 — Claves de objeto por SKU, no por `productoId`

```
catalogo/<sku>/foto-<orden>.jpg
catalogo/<sku>/collage.jpg
```

**Por qué**: IMP10/proposal fijan que las fotos se procesan y suben a MinIO **antes** de abrir la
transacción de escritura (D6 abajo). Para un producto nuevo, `producto.id` (UUID v7) todavía no
existe en ese momento — solo existe una vez que la fila se inserta dentro de la transacción. `sku`
(único, `@unique` en `schema.prisma`) sí se conoce desde la fila cruda de la hoja, antes de tocar la
base de datos, y es estable entre reimportaciones (a diferencia de un id que Prisma generaría de
nuevo cada vez que un producto se recreara). `foto.claveArchivo` y `producto.claveCollage` son
columnas de texto libre (no `FK`), así que usar el SKU como prefijo del objeto no rompe ninguna
restricción del esquema.

**Alternativa descartada**: reservar el `id` con `crypto.randomUUID()` antes de la transacción y
usarlo como prefijo, insertándolo luego con ese mismo valor (`Prisma` permite pasar `id` explícito).
Se descarta por indirección innecesaria: el SKU ya cumple el mismo papel (estable, conocido antes de
la transacción, único) sin tener que desactivar el generador de UUID v7 del cliente Prisma para este
único flujo.

### D5 — Resolución de departamento/ciudad a DANE (IMP9): `catalogo` reutiliza `REPOSITORIO_GEOGRAFIA` sin cambiarlo

**Hallazgo real** (contradice una suposición inicial de la proposal): `RepositorioGeografia`
(`modulos/geografia/puertos/repositorio-geografia.ts`) hoy solo expone
`listarDepartamentos(): Promise<readonly Departamento[]>` y
`listarCiudadesDe(departamentoId): Promise<readonly Ciudad[]>` — ningún método de "buscar por
nombre". La proposal ya anticipaba que podía hacer falta un método nuevo en ese puerto; **no hace
falta**: el catálogo geográfico completo es pequeño (33 departamentos, ~1.120 ciudades DANE) y se
puede cargar entero, una sola vez por corrida de importación, componiendo los dos métodos existentes.

**Elección**: `catalogo/aplicacion/resolver-geografia-importacion.ts` (nuevo, interno — no se exporta
en `catalogo/index.ts`) inyecta `REPOSITORIO_GEOGRAFIA` (de `modulos/geografia`) y, al arrancar una
importación, llama `listarDepartamentos()` y luego `listarCiudadesDe(id)` para cada uno (33 llamadas
en paralelo, `Promise.all`), armando una estructura en memoria. Esa estructura se pasa al dominio puro
`resolverLugar` (`catalogo/dominio/resolver-lugar.ts`), que compara nombres con `normalizarLugar`
(mismo criterio que IMP9/CAT8) y devuelve `departamentoId`/`ciudadId` o `null` si no matchea (Q1: fila
inválida, todo-o-nada).

**Por qué el dominio no importa los tipos de `geografia`**: la regla `dominio-aislado` (skill
§2, `.dependency-cruiser.cjs` regla 3) prohíbe que `catalogo/dominio/` importe nada fuera de sí mismo
y `compartido/` — ni siquiera el tipo `Departamento`/`Ciudad` de otro módulo. `resolver-lugar.ts`
declara sus **propios** tipos locales estructuralmente compatibles (`LugarDepartamento`,
`LugarCiudad`), y `resolver-geografia-importacion.ts` (aplicación, sí puede cruzar módulos) hace el
mapeo entre los tipos de `geografia` y estos tipos locales antes de llamar al dominio.

**Alternativa descartada**: agregar `buscarDepartamentoPorNombre`/`buscarCiudadPorNombre` al puerto
`RepositorioGeografia`. Se descarta porque (a) el contrato actual de ese puerto es "solo lectura de
catálogo completo, ordenado por id" (comentario propio del puerto) y añadir búsqueda difusa por
nombre normalizado mezclaría una responsabilidad de negocio de `catalogo` (comparación de nombres,
tildes, mayúsculas) dentro de un puerto que hoy es agnóstico de eso; (b) cargar el catálogo completo
una vez por corrida de importación (no por fila) es barato — 34 consultas totales, no miles — así que
no hay problema de rendimiento que justifique mover la búsqueda al lado de Postgres.

**Consecuencia**: `catalogo.module.ts` importa `GeografiaModule` (arista nueva; antes `catalogo` no
dependía de ningún otro módulo de negocio). `RepositorioGeografia` **no cambia** su interfaz.

### D6 — La transacción todo-o-nada la abre el repositorio de infraestructura, no un servicio genérico

La skill (§5) describe un patrón aspiracional: "el caso de uso las abre (servicio de transacción
inyectable); los repositorios reciben el cliente transaccional". Ese servicio genérico **no existe
todavía** en el repo, y construirlo aquí no es necesario:

- La regla de fronteras 12 (`prisma-service-solo-en-infraestructura`) prohíbe que `aplicacion/`,
  `puertos/` o `interfaz/` de cualquier módulo importen `plataforma/prisma` — así que
  `ImportarCatalogo` (aplicación) **no puede** abrir `this.prisma.$transaction(...)` aunque quisiera.
- Todas las escrituras de esta fase (`producto`, `foto`, `tarifa_estimada`, `zona_sin_cobertura`,
  `parametro`, `excepcion_horario`) las hace **un solo repositorio nuevo** (no hay una segunda
  infraestructura de otro módulo que necesite unirse a la misma transacción).

**Elección**: `RepositorioImportacionPrisma.escribirTodoONada(datos, hoy)` abre
`this.prisma.$transaction(async (tx) => { ... })` **internamente** y hace las seis escrituras con el
cliente `tx` dentro de ese único callback: upsert de productos por SKU, borrar+recrear fotos,
desactivar productos ausentes, reemplazo completo de tarifas y zonas, upsert de parámetros, sincronizar
excepciones futuras. `ImportarCatalogo.ejecutar()` llama a este único método después de validar y
procesar fotos; nunca ve un cliente Prisma.

**Alternativa descartada**: construir ahora el `SERVICIO_TRANSACCION` genérico e inyectable que la
skill describe (un puerto `puertos/servicio-transaccion.ts` en `plataforma/prisma` con
`ejecutar<T>(fn): Promise<T>`, que `aplicacion/` sí podría inyectar sin tocar `PrismaService`
directamente). Se pospone: hoy solo hay **un** repositorio que necesita transacción interactiva; la
abstracción genérica solo paga su costo cuando una fase futura necesite unir repositorios de **dos**
módulos distintos en una sola transacción (por ejemplo, `ventas` + `inventario`). Construirla ahora,
con un solo consumidor, es la misma clase de sobre-ingeniería que D4 de la Fase 02 evitó con
`RepositorioParametro` propio por módulo.

### D7 — Orden de escritura: fotos antes de la transacción; borrado de sobrantes después de que confirme

Se confirma el orden del prototipo que pide la proposal (fotos antes de `$transaction`) para las
**subidas**: `ImportarCatalogo.ejecutar()` llama `ProcesarFotos` (descarga, redimensiona, sube a
`Almacenamiento`, arma collage) **antes** de `escribirTodoONada`. Riesgo aceptado explícitamente
(proposal, Risks): si la transacción falla después, quedan objetos huérfanos en MinIO — barato de
limpiar con un job de mantenimiento futuro, fuera de alcance de esta fase.

**Refinamiento no cubierto por la proposal, decidido aquí**: el **borrado** de fotos sobrantes (MED7 —
posiciones que existían en una importación anterior y ya no están en la hoja actual) se ejecuta
**después** de que `escribirTodoONada` confirma con éxito, no antes ni durante. Si se borrara antes
(junto con las subidas) y la transacción de BD fallara después, la base seguiría apuntando
(`foto.clave_archivo`) a un objeto que ya no existe en MinIO — un daño peor que el huérfano aceptado
(un enlace roto para el cliente, no solo espacio desperdiciado). `ProcesarFotos` devuelve las claves a
borrar como parte de su resultado; `ImportarCatalogo` las borra con `ALMACENAMIENTO.eliminar(clave)`
solo tras el `await escribirTodoONada(...)` exitoso. Ninguna spec de MED7/IMP11 exige un orden
distinto: ambas solo verifican el estado final "después de importar".

### D8 — Idempotencia de fotos (MED5/MED9): estado previo se lee antes de tocar `Almacenamiento`

`RepositorioImportacionPrisma.leerEstadoActualPorSku()` (fuera de cualquier transacción, una simple
lectura) devuelve, por SKU, las fotos actuales (`orden`, `claveArchivo`, `origenUrl`), el
`fotosHash` y `claveCollage` guardados. `ProcesarFotos` compara esto contra las filas nuevas de la
hoja **antes** de descargar nada: una foto se redescarga solo si su `origenUrl` cambió o si su
`claveArchivo` ya no existe en `Almacenamiento` (comprobado con `obtenerUrl` + `HEAD`, o
directamente intentando el `guardar` — se decide en `sdd-tasks`/apply cuál API de S3 confirma
existencia sin descargar el objeto completo, p. ej. `HeadObjectCommand`). El collage se regenera solo
si `ProcesarFotos` redescargó al menos una foto, o si el hash de enlaces de origen (`fotosHash`,
calculado con un hash determinístico de los `origenUrl` en orden — p. ej. SHA-256 vía
`node:crypto`, sin dependencia nueva) cambió respecto al guardado, o si no existe collage previo
(MED9).

### D9 — Testcontainers de MinIO: paquete oficial disponible, mismo patrón que Postgres/Redis

**Hallazgo confirmado en esta sesión** (`npm view @testcontainers/minio version` → `12.1.0`): existe
un paquete oficial `@testcontainers/minio`, publicado desde hace varias versiones mayores, **en la
misma versión exacta** ya fijada para `testcontainers`, `@testcontainers/postgresql` y
`@testcontainers/redis` (`^12.1.0` en `package.json`). Esto resuelve el riesgo que la proposal dejaba
abierto ("puede no tener imagen oficial de Testcontainers tan probada como Postgres/Redis"): **sí la
tiene**, sin necesidad de `GenericContainer`.

**Elección**: agregar `@testcontainers/minio` a `devDependencies` (misma versión `^12.1.0`) y extender
`test/soporte/contenedores.global-setup.ts` (ADR-0009) con un tercer contenedor arrancado igual que
Postgres/Redis — mismo mecanismo único de infraestructura de pruebas, en local y en CI. El bucket de
pruebas se crea (o se confirma) en el `globalSetup`, una vez por corrida, igual que la plantilla
`plantilla_luxe` de Postgres.

### D10 — Nuevas dependencias de producción: `sharp`, `@aws-sdk/client-s3`, `csv-parse`

Ninguna está instalada hoy (`package.json` no las lista). Las tres son necesarias y van a
`dependencies` (nunca `devDependencies`: la regla de fronteras 9, `src-sin-dev-dependencies`, lo
exigiría si quedaran mal clasificadas, y el importador corre también en producción vía `scripts/`,
que la regla 9 no exime):

- **`sharp`**: ya está en el stack decidido (`CLAUDE.md`, "Stack") para redimensionar (MED6) y
  componer el collage (MED8); esta fase es la primera que realmente lo usa.
- **`@aws-sdk/client-s3`**: SDK S3-compatible que ADR-0012 ya nombra explícitamente para hablar con
  MinIO (D3).
- **`csv-parse`** (API síncrona, `csv-parse/sync`): parsear el CSV de cada pestaña.
  **Alternativa descartada**: parser manual con `String.split(',')`/`split('\n')`. Se descarga porque
  las columnas de texto libre de `productos` (`nombre`, `descripcion_larga`) pueden contener comas,
  comillas o saltos de línea dentro de un campo entrecomillado — exactamente la clase de bug que un
  split ingenuo produce silenciosamente (una fila válida se corta mal, sin ningún error que lo
  delate). `csv-parse` es una dependencia pequeña, sin dependencias propias, con soporte ESM nativo.

### D11 — El comando CLI vive en `scripts/`, siguiendo el precedente de `scripts/sembrar-geografia.ts`

La proposal dejaba la ubicación abierta (`src/catalogo-cli/` o `scripts/`). **Se decide `scripts/`**,
por un precedente real ya aceptado y en producción desde la Fase 01: `scripts/sembrar-geografia.ts`
resuelve exactamente el mismo problema (un comando de una sola vez que carga datos reales usando un
caso de uso de un módulo de negocio, sin servidor HTTP) con el mismo mecanismo que esta fase necesita:

```ts
// scripts/sembrar-geografia.ts (patrón existente, T4 de fase-01-persistencia)
@Module({ imports: [ConfiguracionModule, GeografiaModule] })
class ContextoSemillaGeografia {}

export async function sembrarGeografia(): Promise<ResultadoSemillaGeografia> {
  const contexto = await NestFactory.createApplicationContext(ContextoSemillaGeografia, { logger: false });
  try { /* ... */ } finally { await contexto.close(); }
}
```

`scripts/cli.ts` ya es el único punto de entrada de comandos de este tipo (`secretos`, `commits`,
`auditoria`, `contrato:*`, `flujos`, `semilla:geografia`), con su propio `switch` sobre
`process.argv`. La regla de fronteras 11 (`scripts-solo-barriles-de-plataforma`) solo restringe qué de
`plataforma/` puede importar `scripts/` (solo barriles); no restringe `modulos/`, y
`sembrar-geografia.ts` ya importa `GeografiaModule`/`SembrarGeografia` desde
`../src/modulos/geografia/index.js` sin violar ninguna regla.

**Elección**: `scripts/importar-catalogo.ts` exporta `importarCatalogo(argumentos: readonly string[])`,
con un módulo de contexto mínimo:

```ts
@Module({ imports: [ConfiguracionModule, RelojModule, CatalogoModule] })
class ContextoImportacionCatalogo {}
```

`RelojModule` se incluye explícito en el contexto (igual que `AppModule` lo hace en `src/app.module.ts`
"para que el cableado completo de arranque quede explícito", aunque sea `@Global()`): `CatalogoModule`
no lo importa por sí mismo (mismo patrón ya usado para `CacheCatalogoRedis`, que también necesita
`CLOCK`), así que quien componga el árbol de módulos MUST incluirlo. `CatalogoModule` sí importa
`GeografiaModule` y el nuevo `MediosModule` internamente (D5, D1), así que el contexto del CLI no
necesita importarlos aparte.

`scripts/cli.ts` gana un caso `'catalogo:importar'`; `package.json` gana
`"catalogo:importar": "npm run herramienta -- scripts/cli.ts catalogo:importar"` (mismo mecanismo
`vite-node` ya usado por todos los demás comandos). `npm run catalogo:importar -- --dir <fixtures>`
reenvía los flags tal como npm ya hace para cualquier script (`resto` en `cli.ts` los recibe intactos).

**Alternativa descartada**: `src/catalogo-cli/main-cli.ts` como segundo mecanismo de arranque paralelo
a `scripts/cli.ts` y a `src/main.ts`. Se descarta porque el repo ya resolvió este problema exacto una
vez (Fase 01) y un segundo mecanismo solo fragmentaría dónde busca un desarrollador nuevo "cómo se
agregan comandos de una sola vez".

### D12 — Ubicación de `collage.ts`: `medios/aplicacion/`, no `medios/dominio/`

**Hallazgo real, no anticipado por la proposal** ("medios/collage.ts, puro"): aunque `collage.ts` es
puro en el sentido de comportamiento (determinístico, sin puertos inyectados, sin tocar red ni disco
— solo transforma buffers de imagen en memoria), usa `sharp` para componer los tiles del collage.
`sharp` es una dependencia npm, y la regla `dominio-aislado` (regla 3 de `.dependency-cruiser.cjs`)
prohíbe que cualquier archivo bajo `dominio/` importe algo que no sea su propio `dominio/` o
`compartido/` — un import de `sharp` (resuelto a `node_modules/sharp/...`) no matchea ninguno de los
dos patrones permitidos, así que la regla lo rechazaría igual que rechazaría `@nestjs`/`@prisma`
(el comentario de la regla ya lo generaliza: "PROHIBIDO importar @nestjs, @prisma, redis, http").

**Elección**: `medios/aplicacion/collage.ts` exporta una función simple (`construirCollage`), sin
`@Injectable()` ni puertos inyectados — vive en `aplicacion/` solo porque esa carpeta sí puede
importar dependencias npm, no porque orqueste nada. Se documenta aquí explícitamente para que
`sdd-tasks`/`sdd-apply` no la coloquen por error en `dominio/` guiados solo por la palabra "puro" de
la proposal.

## Módulos y dependencias

Solo se importa lo exportado por cada módulo (su `index.ts` / los barriles de `plataforma`):

| Módulo | Cambio | Importa de |
|---|---|---|
| `modulos/medios` (**nuevo**) | Puerto `Almacenamiento` + adaptador MinIO; `construirCollage` (D12) | `medios.module.ts` → nada de `modulos/` (hoja); `infraestructura/almacenamiento-minio.ts` → `@aws-sdk/client-s3`, `plataforma/config` (`CONFIGURACION`, Global, sin import explícito — mismo patrón que `RedisModule`); `aplicacion/collage.ts` → `sharp` |
| `modulos/catalogo` (**modificado**) | Dominio (`validar-catalogo.ts`, `resolver-lugar.ts`), puertos (`FUENTE_CATALOGO`, `REPOSITORIO_IMPORTACION_CATALOGO`), infraestructura (`fuente-catalogo-sheets.ts`, `fuente-catalogo-directorio.ts`, `csv.ts`, `descarga-drive.ts`, `repositorio-importacion-prisma.ts`), aplicación (`importar-catalogo.ts`, `procesar-fotos.ts`, `resolver-geografia-importacion.ts`, interno) | `catalogo.module.ts` → **nuevo**: `modulos/geografia` (`GeografiaModule`, `REPOSITORIO_GEOGRAFIA`, D5), `modulos/medios` (`MediosModule`, `ALMACENAMIENTO`, D1); ya existentes: `plataforma/prisma`, `plataforma/redis`; `infraestructura/` → `plataforma/prisma` (`PrismaService`), `@aws-sdk/client-s3` no (eso vive en `medios`), `csv-parse`, `node:fs/promises` (directorio local), `medios/index.ts` (`construirCollage`, `ALMACENAMIENTO`); `aplicacion/` → `plataforma/reloj` (`CLOCK`, `Clock`, para "hoy" en excepciones e idempotencia), `modulos/geografia/index.ts` (`REPOSITORIO_GEOGRAFIA`, tipos `Departamento`/`Ciudad`); `dominio/` → `compartido/texto` (`normalizarLugar`), sin importar `modulos/geografia` (D5) |
| `scripts/` (**modificado**) | `importar-catalogo.ts`, caso nuevo en `cli.ts` | `src/modulos/catalogo/index.ts` (`CatalogoModule`, `ImportarCatalogo`), `src/plataforma/config/index.ts` (`ConfiguracionModule`), `src/plataforma/reloj/index.ts` (`RelojModule`) — todos vía barril (regla 5, D11) |
| `AppModule` | **sin cambio** | Ni `CatalogoModule` ni `MediosModule` se registran ahí todavía — mismo patrón que `geografia`/`horario` quedaron sin registrar tras sus fases; los conecta la primera fase que exponga un endpoint sobre ellos (07+) |

`medios` no importa `catalogo` ni al revés en sentido inverso (`catalogo` → `medios`, nunca
`medios` → `catalogo`): sin ciclo. `geografia` sigue sin depender de nadie (regla `sin-ciclos`
verificada: `catalogo` → `geografia`, `geografia` no importa `catalogo`).

## Puertos y adaptadores

| Puerto (token) | Interfaz (resumen) | Adaptador(es) | Módulo |
|---|---|---|---|
| `FUENTE_CATALOGO` | `leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]>` | `FuenteCatalogoSheets` (gviz CSV), `FuenteCatalogoDirectorio` (CSV local) — D2 | `catalogo` |
| `REPOSITORIO_IMPORTACION_CATALOGO` | `leerEstadoActualPorSku()`, `escribirTodoONada(datos, hoy)` | `RepositorioImportacionPrisma` (D6, transacción interna) | `catalogo` |
| `ALMACENAMIENTO` | `guardar(clave, contenido, contentType)`, `obtenerUrl(clave)`, `eliminar(clave)` | `AlmacenamientoMinio` (D3) | `medios` |

Puertos existentes **reutilizados sin cambio de interfaz**: `REPOSITORIO_GEOGRAFIA` (D5),
`CACHE_CATALOGO.invalidar()` (IMP12), `CLOCK`. `REPOSITORIO_PRODUCTO` (lectura, Fase 02) no cambia —
la escritura vive en el puerto nuevo, no se le agregan métodos de escritura (su comentario "ningún
caso de uso de esta fase escribe en `producto` todavía" queda desactualizado por esta fase y se
corrige como comentario, ver File Changes).

## Configuración

**Variables nuevas** en `plataforma/config/esquema.ts` (única lectura de `process.env`, PLT1). Todas
con valor por defecto de desarrollo, mismo patrón que `docker-compose.yml` ya usa para
Postgres/Redis (`${LUXE_PG_USUARIO:-luxe}`), para que `npm run start:dev`/tests no se rompan sin un
`.env` local:

```ts
MINIO_ENDPOINT: z.string().default('localhost'),
MINIO_PUERTO: z.coerce.number().int().min(1).max(65535).default(9000),
MINIO_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
MINIO_ACCESS_KEY: z.string().default('luxe'),
MINIO_SECRET_KEY: z.string().default('luxeclave'),
MINIO_BUCKET: z.string().default('luxeboreal-medios'),
MINIO_URL_PUBLICA: z.string().url().optional(), // si falta, AlmacenamientoMinio la arma con endpoint+puerto+ssl
CATALOGO_SHEET_ID: z.string().optional(), // el CLI también acepta --sheet-id; el env es solo un valor por defecto
```

Valores exactos por defecto (`luxe`/`luxeclave`/nombre del bucket) son provisionales — se confirman en
`sdd-tasks`/apply junto con el servicio `minio` de `docker-compose.yml`; lo que este diseño fija es la
**forma** del esquema (variables, tipos, dónde viven) y que ninguna se lee fuera de
`plataforma/config` (regla del checklist de cierre §7). `docker-compose.yml` gana el servicio `minio`
(imagen `minio/minio`, mismo patrón de `healthcheck`+volumen que `postgres`/`redis`); `.env.example`
documenta las ocho variables nuevas.

## Data Flow

```
ImportarCatalogo.ejecutar(origen: { sheetId } | { dir }, opciones: { soloValidar })
  ├─► FUENTE_CATALOGO.leerPestana('productos'|'tarifas'|'cobertura'|'parametros'|'excepciones_horario')
  │     pestaña no compartida / inexistente ─────────────────────► PestanaNoDisponible (IMP2)
  ├─► resolverGeografiaImportacion(): REPOSITORIO_GEOGRAFIA.listarDepartamentos() + listarCiudadesDe(*) (33x)
  │     ─► CatalogoLugares en memoria (D5)
  ├─► dominio: validarCatalogoCompleto(filasCrudas, catalogoLugares, hoy=CLOCK.ahora())
  │     ├─ validarFilaProducto (IMP3, IMP4, IMP5)
  │     ├─ validarFilaTarifa (IMP6) + resolverLugar (IMP9)
  │     ├─ validarFilaCobertura + resolverLugar (IMP9)
  │     ├─ validarParametro (IMP7)
  │     └─ validarExcepcion (IMP8)
  │     algún error ─────────────────────────────────────────────► aborta, MUST NOT tocar fotos ni BD (IMP10)
  ├─► REPOSITORIO_IMPORTACION_CATALOGO.leerEstadoActualPorSku() ─► estado previo (D8)
  ├─► ProcesarFotos.ejecutar(productosValidados, estadoPrevio)
  │     ├─ descarga-drive.ts: convierte enlace Drive (MED2), rechaza carpeta (MED3)
  │     ├─ descarga + magic bytes (MED4) ── falla ──────────────► aborta, MUST NOT escribir BD (IMP10)
  │     ├─ D8: solo redescarga si origenUrl cambió o falta el objeto (MED5)
  │     ├─ sharp: redimensiona ≤1600px, JPEG80 (MED6) ─► ALMACENAMIENTO.guardar(clave-sku, buffer, 'image/jpeg')
  │     ├─ D9/MED9: regenera collage solo si hubo foto nueva o cambió fotosHash ─► construirCollage ─► ALMACENAMIENTO.guardar(...)
  │     └─ devuelve: fotos procesadas + claves de fotos sobrantes a borrar (D7, MED7)
  │     `--solo-validar` ⇒ termina aquí, reporta válido/errores, MUST NOT llamar escribirTodoONada (IMP13)
  ├─► REPOSITORIO_IMPORTACION_CATALOGO.escribirTodoONada(datosImportacion, hoy) [D6, una sola $transaction]
  │     ├─ upsert producto por sku
  │     ├─ deleteMany + createMany foto (reemplazo completo por producto, IMP11)
  │     ├─ updateMany producto SET activo=false WHERE sku NOT IN (...) (IMP11, nunca borra)
  │     ├─ deleteMany + createMany tarifa_estimada, zona_sin_cobertura (reemplazo completo, IMP11)
  │     ├─ upsert parametro (por clave, IMP7)
  │     └─ deleteMany WHERE fecha >= hoy + createMany excepcion_horario (solo futuras, IMP11)
  │     falla dentro de la transacción ────────────────────────► rollback completo (IMP11, último escenario)
  ├─► ALMACENAMIENTO.eliminar(clave) por cada foto sobrante (D7: después de que la transacción confirmó)
  └─► CACHE_CATALOGO.invalidar() (IMP12, reutiliza Fase 02 sin reimplementar)
```

## File Changes

| Archivo | Acción | Slice | Descripción |
|---|---|---|---|
| `src/modulos/catalogo/dominio/validar-catalogo.ts` (+ `.spec.ts`) | Create | (a) | Validación pura por pestaña (IMP3-IMP8), sin I/O |
| `src/modulos/catalogo/dominio/resolver-lugar.ts` (+ `.spec.ts`) | Create | (a) | `LugarDepartamento`/`LugarCiudad` locales, `resolverLugar` (D5, IMP9) |
| `src/modulos/medios/aplicacion/collage.ts` (+ `.spec.ts`) | Create | (a) | `construirCollage` (D12, MED8) — primer archivo de `medios/` |
| `src/modulos/catalogo/puertos/fuente-catalogo.ts` | Create | (b) | Puerto + token (D2) |
| `src/modulos/catalogo/puertos/repositorio-importacion.ts` | Create | (b) | Puerto + token (D6, D8) |
| `src/modulos/medios/puertos/almacenamiento.ts` | Create | (b) | Puerto + token (D3, MED1) |
| `src/modulos/catalogo/infraestructura/csv.ts` (+ `.spec.ts`) | Create | (b) | Helper `csv-parse` compartido (D10) |
| `src/modulos/catalogo/infraestructura/fuente-catalogo-directorio.ts` (+ `.spec.ts`) | Create | (b) | Adaptador CSV local (IMP1) |
| `src/modulos/catalogo/infraestructura/fuente-catalogo-sheets.ts` (+ `.spec.ts`) | Create | (b) | Adaptador gviz CSV, detección HTML (IMP1, IMP2) |
| `src/modulos/catalogo/infraestructura/descarga-drive.ts` (+ `.spec.ts`) | Create | (b) | Conversión de enlaces, detección de carpeta, magic bytes (MED2-MED4) |
| `src/modulos/medios/infraestructura/almacenamiento-minio.ts` | Create | (b) | Adaptador `@aws-sdk/client-s3` (D3) |
| `test/integracion/medios/almacenamiento-minio.spec.ts` | Create | (b) | Contra MinIO real vía Testcontainers (D9, MED1) |
| `src/modulos/catalogo/infraestructura/repositorio-importacion-prisma.ts` | Create | (b) | `leerEstadoActualPorSku`, `escribirTodoONada` (D6) |
| `test/integracion/catalogo/repositorio-importacion.spec.ts` | Create | (b) | Contra Postgres real, incluye el escenario de rollback (IMP11) |
| `src/modulos/medios/medios.module.ts`, `index.ts` | Create | (b) | Módulo y barril |
| `src/modulos/catalogo/aplicacion/resolver-geografia-importacion.ts` (+ `.spec.ts`) | Create | (c) | Carga catálogo geográfico completo, mapea a tipos locales (D5) |
| `src/modulos/catalogo/aplicacion/procesar-fotos.ts` (+ `.spec.ts`) | Create | (c) | Orquesta descarga, `sharp`, `Almacenamiento`, collage, idempotencia (D7, D8, MED5-MED9) |
| `src/modulos/catalogo/aplicacion/importar-catalogo.ts` (+ `.spec.ts`) | Create | (d) | Orquestador todo-o-nada completo (IMP1-IMP13) |
| `src/modulos/catalogo/catalogo.module.ts` | Modify | (d) | Registra `GeografiaModule`, `MediosModule`, nuevos providers/puertos |
| `src/modulos/catalogo/index.ts` | Modify | (d) | Exporta `ImportarCatalogo` |
| `src/modulos/catalogo/puertos/repositorio-producto.ts` | Modify | (d) | Corrige comentario desactualizado ("ningún caso de uso escribe todavía") |
| `src/plataforma/config/esquema.ts` (+ `.spec.ts` si aplica) | Modify | (b) | Ocho variables `MINIO_*`/`CATALOGO_SHEET_ID` |
| `docker-compose.yml` | Modify | (b) | Servicio `minio` |
| `.env.example` | Modify | (b) | Documenta las variables nuevas |
| `test/soporte/contenedores.global-setup.ts` | Modify | (b) | Arranca contenedor MinIO (D9, ADR-0009) |
| `package.json` | Modify | (b, d) | Deps nuevas (D10, D9); script `catalogo:importar` (D11) |
| `scripts/importar-catalogo.ts` (+ `.spec.ts`) | Create | (e) | Comando CLI (D11, IMP13) |
| `scripts/cli.ts` | Modify | (e) | Caso `catalogo:importar` |
| `test/fixtures/catalogo/*.csv` + fotos reales pequeñas | Create | (e) | Entrada del criterio de salida (`--dir <fixtures>`, Q4) |
| `.claude/skills/luxeboreal-arquitectura/SKILL.md` | Modify | (e) | §1: módulo `medios`, ampliación de `catalogo` |
| `docs/migracion/inventario.md`, `docs/fases/README.md` | Modify | (e, al archivar) | Filas migradas y estado de fase |

## Interfaces / Contracts

```ts
// src/modulos/catalogo/puertos/fuente-catalogo.ts (D2)
export const FUENTE_CATALOGO = Symbol('FUENTE_CATALOGO');
export type NombrePestana = 'productos' | 'tarifas' | 'cobertura' | 'parametros' | 'excepciones_horario';
export interface FilaCruda { readonly [columna: string]: string }
export type MotivoPestanaNoDisponible = 'no_compartida' | 'inexistente';
export class PestanaNoDisponible extends Error {
  constructor(public readonly pestana: NombrePestana, public readonly motivo: MotivoPestanaNoDisponible) { /* IMP2 */ }
}
export interface FuenteCatalogo {
  leerPestana(nombre: NombrePestana): Promise<readonly FilaCruda[]>;
}

// src/modulos/medios/puertos/almacenamiento.ts (D3, MED1)
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');
export interface Almacenamiento {
  guardar(clave: string, contenido: Buffer, contentType: string): Promise<void>;
  obtenerUrl(clave: string): Promise<string>;
  eliminar(clave: string): Promise<void>;
}

// src/modulos/medios/aplicacion/collage.ts (D8, D12, MED8-MED9)
export interface FotoParaCollage { readonly buffer: Buffer }
export function construirCollage(fotos: readonly FotoParaCollage[]): Promise<Buffer>; // grilla 2x2/2x3, tiles 400x400 cover, JPEG85

// src/modulos/catalogo/dominio/resolver-lugar.ts (D5, IMP9) — tipos locales, sin importar geografia
export interface LugarDepartamento { readonly id: string; readonly nombre: string }
export interface LugarCiudad { readonly id: string; readonly departamentoId: string; readonly nombre: string }
export interface CatalogoLugares {
  readonly departamentos: readonly LugarDepartamento[];
  readonly ciudades: readonly LugarCiudad[];
}
export interface LugarResuelto { readonly departamentoId: string; readonly ciudadId: string | null }
export function resolverLugar(
  catalogo: CatalogoLugares, departamentoTexto: string, ciudadTexto: string | null,
): LugarResuelto | null; // null = sin match (Q1, fila inválida)

// src/modulos/catalogo/dominio/validar-catalogo.ts (IMP3-IMP8)
export interface ErrorValidacionFila {
  readonly pestana: NombrePestana;
  readonly fila: number;      // número de fila de la hoja/CSV (1-indexado, sin contar cabecera)
  readonly columna: string;
  readonly mensaje: string;
}
export interface AdvertenciaValidacion { readonly pestana: NombrePestana; readonly fila: number; readonly mensaje: string }
export interface ResultadoValidacionCatalogo {
  readonly valido: boolean;
  readonly errores: readonly ErrorValidacionFila[];
  readonly advertencias: readonly AdvertenciaValidacion[];
  readonly datos: DatosImportacion | null; // null si valido = false
}
export function validarCatalogoCompleto(
  crudo: Readonly<Record<NombrePestana, readonly FilaCruda[]>>,
  lugares: CatalogoLugares,
  hoy: Date,
): ResultadoValidacionCatalogo;

// src/modulos/catalogo/puertos/repositorio-importacion.ts (D6, D8)
export const REPOSITORIO_IMPORTACION_CATALOGO = Symbol('REPOSITORIO_IMPORTACION_CATALOGO');

export interface EstadoFotoActual { readonly orden: number; readonly claveArchivo: string; readonly origenUrl: string | null }
export interface EstadoProductoActual {
  readonly fotos: readonly EstadoFotoActual[];
  readonly fotosHash: string | null;
  readonly claveCollage: string | null;
}

export interface NuevaFotoImportada { readonly orden: number; readonly claveArchivo: string; readonly esPortada: boolean; readonly origenUrl: string }
export interface NuevoProductoImportado {
  readonly sku: string;
  readonly nombre: string;
  readonly descripcionCorta: string;
  readonly descripcionLarga: string;
  readonly precioCop: number;
  readonly pesoGramos: number | null;
  readonly largoMm: number | null;
  readonly anchoMm: number | null;
  readonly altoMm: number | null;
  readonly claveCollage: string | null;
  readonly fotosHash: string;
  readonly fotos: readonly NuevaFotoImportada[];
}
export interface NuevaTarifaImportada {
  readonly departamentoId: string | null; // null = nacional (D1 de Fase 02, sin cambio de criterio)
  readonly ciudadId: string | null;
  readonly pesoMinG: number;
  readonly pesoMaxG: number | null;
  readonly rangoMinCop: number;
  readonly rangoMaxCop: number;
  readonly diasMin: number;
  readonly diasMax: number;
  readonly contraentregaDisponible: boolean;
}
export interface NuevaZonaSinCoberturaImportada {
  readonly departamentoId: string;
  readonly ciudadId: string | null; // null = todo el departamento (IMP9)
  readonly motivo: string | null;
}
export interface NuevoParametroImportado { readonly clave: string; readonly valor: unknown } // jsonb ya serializado (IMP7)
export interface NuevaExcepcionImportada { readonly fecha: Date; readonly motivo: string | null }

export interface DatosImportacion {
  readonly productos: readonly NuevoProductoImportado[];
  readonly tarifas: readonly NuevaTarifaImportada[];
  readonly zonasSinCobertura: readonly NuevaZonaSinCoberturaImportada[];
  readonly parametros: readonly NuevoParametroImportado[];
  readonly excepciones: readonly NuevaExcepcionImportada[];
}
export interface ResultadoImportacion {
  readonly productosActivados: number;
  readonly productosDesactivados: number;
  readonly fotosEscritas: number;
}

export interface RepositorioImportacionCatalogo {
  /** Estado previo por SKU, leído fuera de cualquier transacción (D8, MED5/MED9). */
  leerEstadoActualPorSku(): Promise<ReadonlyMap<string, EstadoProductoActual>>;
  /** Una sola `$transaction` interna (D6); nunca deja escritura parcial (IMP10, IMP11). */
  escribirTodoONada(datos: DatosImportacion, hoy: Date): Promise<ResultadoImportacion>;
}
```

## Testing Strategy

TDD estricto (RED observado → GREEN → REFACTOR), runner Vitest. Cada test se nombra
`"<IMP#|MED#> — <título exacto del escenario>"` (nota de implementación de ambas specs).

| Nivel | Qué se prueba | Escenarios |
|---|---|---|
| Unitario | `validarCatalogoCompleto` y sus validadores por fila | IMP3-IMP8 (17 escenarios) |
| Unitario | `resolverLugar` | IMP9 (3 escenarios) |
| Unitario | `construirCollage` (con buffers de imagen reales pequeños, sin Testcontainers) | MED8 (2 escenarios) |
| Unitario | Conversión de enlaces Drive, detección de carpeta | MED2, MED3 (3 escenarios) |
| Unitario | `csv.ts`: parseo con campos entrecomillados/comas embebidas | (soporte de IMP1, sin id propio) |
| Unitario | `ImportarCatalogo`/`ProcesarFotos` con dobles de los tres puertos (`test/fakes/`) | IMP2, IMP10 (parcial), IMP12, IMP13, MED5, MED9 |
| Integración | `FuenteCatalogoDirectorio` contra los fixtures reales de `test/fixtures/catalogo/` | IMP1 (escenario directorio) |
| Integración | `FuenteCatalogoSheets` contra un servidor HTTP local que simula respuestas CSV/HTML | IMP1 (escenario Sheets), IMP2 |
| Integración | `descarga-drive.ts`: magic bytes contra un servidor HTTP local | MED4 (3 escenarios) |
| Integración | `AlmacenamientoMinio` contra MinIO real (Testcontainers, D9) | MED1 (3 escenarios), MED6, MED7 |
| Integración | `RepositorioImportacionPrisma`: upsert, reemplazo completo, desactivación, rollback | IMP9-IMP11 (todos los escenarios de escritura) contra Postgres real |
| Integración | Comando `catalogo:importar --dir <fixtures>` de punta a punta (criterio de salida de la fase) | IMP13, éxito completo + `--solo-validar` |

## Threat Matrix

Vectores propios de esta fase, más allá del SQL ya cubierto por el *query builder* de Prisma
(`RepositorioImportacionPrisma` no usa `$queryRaw`, salvo que `sdd-tasks` encuentre que el upsert por
lotes de `parametro`/`tarifa_estimada` lo necesite por rendimiento — con pocas filas por importación,
no se anticipa esa necesidad):

| Vector | Mitigación |
|---|---|
| Comando de descarga de imágenes con URL controlada por el contenido de la hoja (SSRF potencial) | Solo se aceptan enlaces `http://`/`https://` (IMP4); la conversión de Drive (MED2) normaliza a un dominio fijo (`drive.google.com`) antes de pedir; un enlace no-Drive se descarga tal cual con `fetch` nativo (sin seguir redirecciones a esquemas no-HTTP) |
| Contenido descargado que dice ser imagen pero no lo es (Drive devuelve HTML de "acceso denegado") | Magic bytes (MED4), nunca solo `content-type` |
| CSV con campos maliciosamente formateados (comillas/comas para forzar una fila mal parseada) | `csv-parse` (D10), parser probado en vez de `split` manual |
| Credenciales de MinIO (`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`) | Solo en `plataforma/config`, nunca logueadas; `.env.example` documenta las variables sin valores reales |
| Comando `catalogo:importar` ejecutado por error con `--sheet-id` de producción contra una base de desarrollo | Fuera de alcance técnico de esta fase (mismo riesgo que `semilla:geografia`); el `--dir` del criterio de salida no toca la hoja real |

## ADRs

| ADR | Relación | Cambio en el documento |
|---|---|---|
| ADR-0012 | El puerto `Almacenamiento` y su adaptador MinIO implementan exactamente lo que el ADR decidió (backend, interfaz mínima) | Ninguno |
| ADR-0009 | Se extiende con un tercer contenedor (MinIO, D9) sobre el mismo mecanismo | Se agrega una sección "Implementado en la Fase 03" al cerrar, igual que ya tiene una "Implementado en la Fase 01" |

**ADR nuevo: ninguno.** Se evaluaron las decisiones con alternativas reales (D3 política de bucket,
D5 dependencia nueva `catalogo`→`geografia`, D6 transacción en el repositorio, D11 ubicación del CLI)
y ninguna tiene el peso de una decisión de arquitectura de largo plazo que otros módulos deban seguir
— todas son reversibles sin romper el contrato observable de `catalogo`/`medios` (mismo criterio que
usó la Fase 02 para no abrir ADR por D1/D2/D4 de su propio diseño). La única decisión de esa escala
(qué backend de objetos usar) ya tiene su ADR, escrito antes de este documento.

## Migration / Rollout

`auto-chain`, `stacked-to-main`. Slices (a)-(e), mapeados 1:1 al Approach de la proposal:

- **(a)** Dominio puro: `validar-catalogo.ts`, `resolver-lugar.ts`, `collage.ts` (D12: vive en
  `aplicacion/` pero se construye en este slice porque no depende de ningún puerto).
- **(b)** Puertos + adaptadores + repositorios, cada uno con su test de integración: `FUENTE_CATALOGO`
  (Sheets + Directorio), `ALMACENAMIENTO` (MinIO + Testcontainers, D9), `REPOSITORIO_IMPORTACION_CATALOGO`.
  Configuración (`MINIO_*`), `docker-compose.yml`, `contenedores.global-setup.ts`.
- **(c)** Procesamiento de fotos + resolución de geografía sobre los puertos ya construidos.
- **(d)** Orquestador todo-o-nada (`ImportarCatalogo`) + invalidación de caché + wiring de módulos.
- **(e)** Comando CLI + fixtures + cierre documental (skill, inventario, README de fases).

Sin migración de esquema (confirmado arriba). El recuento exacto de líneas por slice y las tareas
concretas (máximo 10 por convención del proyecto) quedan para `sdd-tasks`; este diseño solo fija qué
contenido entra en cada slice.

Review requerida: **RDD** por commit de unidad de trabajo (sin `judgment-day`; 03 no está en la lista
de fases 04/05/06/10 de `docs/fases/README.md`).

**Rollback**: cada slice se revierte solo, en orden inverso de la cadena. `docker-compose.yml`:
revertir el servicio `minio` no afecta Postgres/Redis existentes (mismo argumento que la proposal ya
documenta en su Rollback Plan). Ningún slice toca `prisma/migrations/` ni datos reales (P7: el
importador nunca corrió contra datos del negocio).

## Open Questions

Ninguna bloquea `sdd-tasks`. Cada una tiene una decisión por defecto ya aplicada en este diseño; se
listan para que el usuario pueda vetarlas al aprobar:

- [ ] **D3**: bucket de MinIO con política de lectura **pública** (URL permanente, sin expiración)
  en vez de URLs firmadas — decisión de seguridad menor que ADR-0012 no fijó explícitamente.
- [ ] **D5**: `catalogo` pasa a depender de `modulos/geografia` (arista nueva); `RepositorioGeografia`
  no gana ningún método nuevo, se reutiliza cargando el catálogo completo una vez por importación.
- [ ] **D6**: la transacción todo-o-nada la abre `RepositorioImportacionPrisma` internamente; el
  `SERVICIO_TRANSACCION` genérico que sugiere la skill §5 se pospone hasta que una fase futura
  necesite unir repositorios de dos módulos distintos en una sola transacción.
- [ ] **D7**: las subidas de fotos van antes de la transacción (riesgo de huérfanos aceptado, igual
  que la proposal); el **borrado** de fotos sobrantes va después de que la transacción confirma
  (afinamiento no cubierto explícitamente por la proposal, para no borrar un objeto que la base
  todavía referencia si la transacción falla).
- [ ] **D11**: el comando vive en `scripts/importar-catalogo.ts` (no en `src/`), seguindo el
  precedente de `scripts/sembrar-geografia.ts`.
- [ ] **D12**: `collage.ts` vive en `medios/aplicacion/`, no en `medios/dominio/` (restricción real de
  la regla `dominio-aislado` contra cualquier import de `sharp`).

**Nada quedó sin confirmar por falta de información** — a diferencia de lo que anticipaba la proposal,
tanto la disponibilidad de `@testcontainers/minio` (D9) como la ubicación exacta del CLI (D11) se
verificaron en esta sesión en vez de dejarse como pregunta para `sdd-tasks`.
