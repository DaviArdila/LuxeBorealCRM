# Design: Fase 00b — CI y contrato de API

- Change: `fase-00b-ci-contrato-api` · Fecha: 2026-09-24 · Estado: `spec en revisión`
- Insumos: `proposal.md` de esta fase, `openspec/changes/archive/2026-09-23-fase-00a-esqueleto/`
  (`design.md`, `exploration.md`, `verify-report.md`), `openspec/specs/api/spec.md`,
  `openspec/specs/plataforma/spec.md`, ADR-0001 (con enmienda), ADR-0008 (con enmienda), ADR-0009,
  skills `luxeboreal-arquitectura` y `luxeboreal-fases`.
- Specs delta: `sdd-spec` las escribe en `specs/` (capacidad nueva `integracion-continua`, deltas de
  `api` y de `plataforma`). Este diseño **no** fija ids de requisito ni nombres de test: marca con
  «(escenario de `sdd-spec`)» cada comportamiento que debe quedar como escenario, y los tests toman
  el nombre exacto `<id> — <título>` que definan esas specs.

> **Nota de verificación.** Esta sesión de diseño no tuvo acceso a red ni a documentación en vivo.
> Los datos marcados **[verificado 00a]** vienen del registro de compatibilidad de la tarea 1 de 00a
> (`design.md` archivado, D15), que sí consultó el registro público de npm el 2026-09-23. Todo lo
> marcado **[sin verificar]** es conocimiento previo y MUST confirmarse en la tarea donde se usa,
> **antes** de escribir código que dependa de ello; si difiere, se ajusta la decisión afectada y se
> registra aquí como desviación (igual que hizo 00a con D6, D13 y D14).
>
> Puntos [sin verificar] que este diseño aísla a propósito en una sola decisión cada uno:
> `ignoreGlobalPrefix` de `@nestjs/swagger` (D2), forma de la excepción que lanza
> `StandardSchemaValidationPipe` (D5), aceptación de un Standard Schema en `@ApiResponse` (D4),
> estabilidad de la API de `vite-node` (D12), y montaje de volúmenes Docker con rutas de Windows
> (D10).

## Technical Approach

La fase construye **dos subsistemas que se tocan en un solo punto**: la puerta automatizada (hook +
workflow) y el pipeline de contrato de API. El punto de contacto es `npm run ci`: una secuencia
definida **una sola vez** en `package.json`, de la que el hook pre-push ejecuta un prefijo y el
workflow de GitHub Actions ejecuta el total. El YAML no redefine ningún paso; por eso "CI completo en
verde" se puede verificar hoy, con el repositorio todavía local (riesgo alto de la proposal, Q4).

Principios que guían cada decisión:

1. **Una definición por paso.** Cada comprobación es exactamente un script de `package.json`. Los
   agregados (`verify`, `ci:hook`, `ci`) son composiciones de esos scripts, nunca copias de sus
   comandos. `ci:hook` es un **prefijo literal** de `ci`, así que el subconjunto rápido tampoco es
   una segunda definición.
2. **Una sola fuente por endpoint** (ADR-0008): el esquema zod. De él salen la validación
   (`StandardSchemaValidationPipe`), el fragmento OpenAPI (`@nestjs/swagger`) y la documentación de
   la respuesta; nada se escribe dos veces.
3. **Un documento se genera, dos se derivan.** El documento interno (completo) es la salida de
   `@nestjs/swagger`; el público es el resultado de una **función pura** que le quita lo etiquetado
   `internal`. Una sola generación, una sola forma de fallar (D1).
4. **Lo condicional se resuelve por composición, no por flag.** El controlador *fixture* que ejercita
   el pipeline vive en `test/` y solo existe porque un test lo compone con `AppModule`; ningún
   `MOCK_*`, ningún `if (entorno === 'test')` en `src/` (A2, ADR-0001), y la frontera 8
   (`src-no-importa-test`) lo vuelve estructuralmente imposible de filtrar a producción (D3).
5. **Determinismo antes que deriva.** El chequeo de deriva solo vale si la generación es
   reproducible: configuración literal (nunca el entorno), orden de claves normalizado, fin de línea
   fijo (D2).
6. **Nada pasa en verde por omisión.** Sin base de comparación, oasdiff lo dice y deja rastro (D11);
   una excepción de `gitleaks` o de `npm audit` es una entrada versionada con motivo, nunca un
   silencio (D10, D14).

## Módulos tocados y dependencias

Cada submódulo de `plataforma/` expone su API pública en un `index.ts`; nadie importa rutas internas
de otro submódulo (frontera 6, `sin-rutas-internas-de-plataforma`).

| Módulo (carpeta) | Acción | Exporta (`index.ts`) | Importa de | Paquetes npm |
|---|---|---|---|---|
| `plataforma/documentacion` | **New** | `construirDocumentoInterno`, `filtrarDocumentoPublico`, `serializarDocumento`, `montarDocumentacion`, `respuestaDesdeZod`, `ETIQUETA_INTERNA`, `CONFIGURACION_DOCUMENTO` | `plataforma/config` (barril) | `@nestjs/swagger`, `@scalar/nestjs-api-reference`, `zod` |
| `plataforma/errores` | **New** | `ErroresModule`, `FiltroProblemJson`, `ErrorDeAplicacion`, `CATALOGO_CODIGOS`, tipos `CodigoError`/`Problema`, `construirProblema` | `plataforma/config`, `plataforma/observabilidad` (barriles) | `@nestjs/common`, `@nestjs/core`, `nestjs-pino` |
| `plataforma/salud` | Modified | `SaludModule` (sin cambio de superficie) | + `plataforma/documentacion` (barril) | + `zod` |
| `plataforma/config` | Modified | sin cambio de superficie (el tipo `Configuracion` crece con `DOCS_HABILITADO`) | — | `zod` |
| `src/configurar-aplicacion.ts` | Modified | `configurarAplicacion` | + `plataforma/documentacion` (barril) | + `@nestjs/common` |
| `src/app.module.ts` | Modified | `AppModule` | + `plataforma/errores` (barril) | — |
| `scripts/` (nuevo directorio de herramienta, fuera de `src/`) | **New** | no es módulo de la aplicación | `src/**/index.ts` (solo barriles), `@nestjs/testing` | `@nestjs/testing`, `@commitlint/lint`, `vite-node` |
| `test/contrato/` (nuevo) | **New** | fixture de contrato + tests | `src/**/index.ts`, `src/app.module.ts`, `src/configurar-aplicacion.ts` | `@nestjs/testing`, `supertest`, `zod` |

Dirección permitida, sin cambios respecto a 00a:
`scripts → src` · `main → app.module → plataforma/* → compartido/*` · `test → src`.
`plataforma/*` MUST NOT importar `modulos/` (frontera 7) ni `test/` (frontera 8).
`plataforma/documentacion` MUST NOT importar `plataforma/errores` ni al revés: son independientes y
el único que conoce a los dos es el arranque (`configurar-aplicacion.ts` / `app.module.ts`).

## Puertos y adaptadores

Esta fase **no agrega puertos de dominio**: no hay negocio. Lo que agrega son dos piezas de
plataforma sin token nuevo y un decorador reutilizable.

| Pieza | Interfaz / token | Implementación de producción | Sustitución en test |
|---|---|---|---|
| Filtro global de errores | `APP_FILTER` (token de `@nestjs/core`) registrado en `ErroresModule` | `FiltroProblemJson` (inyecta `PinoLogger` y `CONFIGURACION`) | se usa el real; el test compone `AppModule` completo |
| Pipe global de validación | `app.useGlobalPipes(new StandardSchemaValidationPipe())` en `configurarAplicacion` | el pipe nativo de NestJS 12 | se usa el real (D3: el fixture prueba el pipe, no lo sustituye) |
| Documento OpenAPI | funciones puras exportadas por `plataforma/documentacion` (sin token: no hay estado ni provider) | `construirDocumentoInterno(app)` sobre la app real | `scripts/generar-contrato.ts` y `test/contrato/` llaman las mismas funciones |
| Configuración | `CONFIGURACION` (token de 00a) | factory sobre `process.env` | `overrideProvider(CONFIGURACION).useValue(...)` — mismo patrón que `ClockFalso`/e2e de 00a |
| Herramientas externas Go | `ejecutarHerramienta(imagen, argumentos)` en `scripts/herramientas.ts` | `docker run --rm` con imagen fijada | no se sustituye: los tests que la tocan verifican la **política** (D11), no el binario |

`plataforma/documentacion` deliberadamente **no** declara un `@Module`: no registra ningún provider ni
guarda estado, así que un módulo vacío sería ceremonia. Sus funciones se invocan desde
`configurarAplicacion` (que ya recibe la `INestApplication`) y desde los scripts.

## Architecture Decisions

### D1 — Documento público e interno: una generación, dos documentos commiteados

**Choice**: `@nestjs/swagger` genera **un** documento a partir de la app real (el **interno**, con
todo, incluido `GET /health`). El **público** es el resultado de una función pura
`filtrarDocumentoPublico(documento)` que:

1. elimina toda operación cuyo `tags` incluya `internal`;
2. elimina los *path items* que quedan sin ninguna operación;
3. elimina la etiqueta `internal` de la lista `tags` del documento;
4. poda de `components.schemas` todo esquema que ya no esté referenciado (cierre transitivo de
   `$ref`).

Ambos se commitean, ambos se generan y **ninguno se edita a mano**:

| Archivo | Contenido | Quién lo consume |
|---|---|---|
| `openapi/openapi.json` | documento **público** (API1, API8) | Scalar en `/docs`, Spectral, **oasdiff**, cliente de back office (Fase 14) |
| `openapi/openapi.interno.json` | documento **completo**, con `/health` etiquetado `internal` | chequeo de deriva, Spectral, revisión humana del PR |

**Alternatives considered**:
- *Un solo documento commiteado (el público) filtrado al generarse*. Es lo mínimo que exige ADR-0008,
  pero hoy el documento público nace con `paths: {}` (API8 excluye `/health` y no hay endpoints de
  negocio): el chequeo de deriva compararía un archivo vacío contra otro vacío y **no podría fallar
  nunca** hasta la Fase 11. Un paso de CI que no puede fallar es peor que no tenerlo: da confianza
  falsa.
- *Dos generaciones independientes* (construir el documento dos veces con distinto `include` de
  módulos). `SwaggerModule.createDocument` permite filtrar por módulo, no por etiqueta; eso obliga a
  que "interno" coincida con una frontera de módulo, lo que se rompe en la Fase 04 (el webhook de
  Chatwoot es interno pero vive en un módulo que también expondrá endpoints públicos). Además son dos
  caminos de generación que pueden divergir.
- *Marcar `internal` con `@ApiExcludeEndpoint`*. Saca el endpoint de **todos** los documentos: se
  pierde el documento interno y con él la única forma de verificar hoy la deriva y de documentar
  `/health` (fila 00b de `docs/fases/README.md`).

**Rationale**: una sola generación (no hay dos caminos que desincronizar), la exclusión se expresa
como dato (`tags: ['internal']`) y no como estructura de módulos, y el chequeo de deriva es
**observable desde el primer commit** de la fase gracias a `/health`. El filtro es una función pura:
se prueba con un documento de ejemplo sin arrancar Nest, y la Fase 04 y la 09 lo heredan sin tocarlo.

Costo aceptado: un archivo generado más en el repositorio. No es contradicción con ADR-0008 (que fija
"`openapi/openapi.json` se genera y se commitea" y "los internos se excluyen del documento público"),
pero **sí es una decisión nueva con alternativas reales que ata a las Fases 04, 09 y 14** → se
propone **ADR-0010** (`docs/adr/0010-documento-openapi-publico-e-interno.md`, estado `propuesta`).

**Qué alimenta cada herramienta**:

| Herramienta | Documento | Motivo |
|---|---|---|
| Scalar (`/docs`) | público | API8/API9: lo que se sirve es lo que se distribuye |
| Spectral | **ambos** | el público es hoy `paths: {}` y no ejercita ninguna regla; el interno sí |
| oasdiff | **solo el público** | API10 protege al consumidor del contrato (Fase 14); un cambio en `/health` no es un cambio incompatible de API |
| Chequeo de deriva | **ambos** | un cambio en `/health` sin regenerar MUST fallar (skill §12.9) |

### D2 — Generación determinista del documento y chequeo de deriva

**Choice**: `scripts/generar-contrato.ts` construye la app **sin conectar a nada y sin leer el
entorno**, genera, normaliza, serializa y escribe los dos archivos:

```
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(CONFIGURACION).useValue(CONFIGURACION_DE_GENERACION)   ← literal del script
  .compile()  →  createNestApplication({ logger: false })  →  await app.init()
  → configurarAplicacion(app)            (mismo cableado que producción: prefijo, pipe)
  → SwaggerModule.createDocument(app, CONFIGURACION_DOCUMENTO)
  → ordenarDocumento(...)  → serializarDocumento(...)  → openapi/openapi.interno.json
  → filtrarDocumentoPublico(...) → ordenarDocumento → serializarDocumento → openapi/openapi.json
  → await app.close()
```

Las cuatro fuentes de indeterminismo y su respuesta:

| Fuente | Respuesta |
|---|---|
| Entorno (`process.env`, `.env`, puertos, URLs) | `CONFIGURACION` se sustituye por un literal del script; el script **nunca** llama `cargarArchivoEntorno()` ni lee `process.env` |
| Momento (fechas, `version` derivada de git) | `info.version` sale de `package.json` (`version`), que es un valor commiteado; no hay `generatedAt` ni `servers` derivados del entorno (`servers: [{ url: '/' }]` literal) |
| Orden de claves | `ordenarDocumento` fija el orden de primer nivel (`openapi`, `info`, `servers`, `tags`, `paths`, `components`) y ordena **alfabéticamente las claves de todo objeto anidado**; los arrays conservan su orden de origen (que ya es determinista: viene del código) |
| Fin de línea | `serializarDocumento` produce `JSON.stringify(doc, null, 2) + '\n'` con `\n` únicamente, y `.gitattributes` fuerza `eol=lf` en todo el repositorio |

`scripts/verificar-deriva-contrato.ts` regenera **en memoria** (nunca escribe) y compara byte a byte
con los dos archivos commiteados. Si difieren: sale con código ≠ 0, nombra **qué archivo** y la
primera línea distinta, y dice el remedio (`npm run contrato:generar`). Si la única diferencia es el
fin de línea, lo detecta explícitamente y nombra `.gitattributes` / `git add --renormalize .` en vez
de imprimir un diff ilegible.

**Alternatives considered**:
- *Poner variables de entorno fijas desde el script antes de `NestFactory.create`*. Más corto, pero
  una variable ambiental del shell (`PORT=8080`, un `.env` cargado) se cuela y la generación deja de
  ser reproducible entre máquinas — justo lo que API1 prohíbe.
- *Ordenar solo `paths` y `components.schemas`*. Deja sin normalizar objetos anidados (`properties`,
  `responses`, `content`), que es donde el orden puede cambiar entre versiones de la librería.
- *No normalizar y confiar en el orden de `@nestjs/swagger`*. Convierte cualquier actualización menor
  de la dependencia en una deriva falsa en todo el documento.

**Rationale**: separa "el contrato cambió" de "la máquina es distinta". El escenario de API1
«generar dos veces produce el mismo documento» se vuelve un test barato (generar dos veces en el
mismo proceso y comparar cadenas) y el chequeo de deriva solo grita cuando la API cambió de verdad.

**[sin verificar]** `SwaggerModule.createDocument` incluye el prefijo global en `paths` salvo que se
pase `ignoreGlobalPrefix: true`. La tarea del pipeline MUST comprobarlo contra `@nestjs/swagger@12`
(el documento generado debe contener `/api/v1/...`); si el prefijo no aparece, se agrega
explícitamente y se registra aquí como desviación.

### D3 — El pipeline se ejercita con un controlador *fixture* que solo existe en `test/`

**Choice**: `test/contrato/fixture/contrato-fixture.module.ts` declara un `@Module` con un
`ContratoFixtureController` y sus esquemas zod. **Nunca** se importa desde `src/`; solo desde los
tests, que componen la app así:

```ts
Test.createTestingModule({ imports: [AppModule, ContratoFixtureModule] })
```

El registro condicional es, por tanto, la **composición del test**, no una rama de código. Tres
propiedades que ningún flag da:

1. **Imposible de filtrar a producción**: la frontera 8 (`src-no-importa-test`) es `severity: 'error'`
   en `npm run verify`; para que el fixture llegue a producción alguien tendría que romper una regla
   de fronteras verificada, no olvidar un `if`.
2. **Invisible en el contrato**: `scripts/generar-contrato.ts` construye solo `AppModule`, así que
   las rutas del fixture no pueden aparecer en `openapi/openapi.json` ni en el interno. Un test lo
   afirma (escenario de `sdd-spec`).
3. **Precedente del proyecto**: es el mismo patrón que `test/fakes/clock-falso.ts` de 00a — la
   sustitución vive en `test/` y la decide el test, nunca una variable de entorno (A2, ADR-0001,
   skill §3).

Qué expone el fixture (superficie mínima para cubrir API2, API3 y API4 sin inventar negocio):

| Operación | `operationId` | Para qué |
|---|---|---|
| `GET /api/v1/ejemplos` | `listarEjemplos` | prefijo de versión (API2), respuesta camelCase con UUID, fecha ISO 8601 UTC y dinero entero (API3) |
| `POST /api/v1/ejemplos` | `crearEjemplo` | cuerpo validado por esquema zod → error de validación en problem+json (API4) |
| `GET /api/v1/ejemplos/falla` | `fallarEjemplo` | error **no manejado** → problem+json 500 con código estable y sin diagnóstico hacia afuera (API4) |
| `GET /api/v1/ejemplos/interno` | `obtenerEjemploInterno` | etiquetado `internal`: prueba el filtro de D1 con una operación real bajo `/api/v1`, no solo con `/health` |

**Alternatives considered**:
- *`overrideProvider`*: no sirve — Nest no permite **agregar** un controller por override, solo
  sustituir providers.
- *`DesarrolloModule` dentro de `src/` registrado fuera de producción* (la puerta que deja abierta la
  skill §3): mete rutas de prueba en el artefacto de producción y necesita una condición en el
  arranque, que es un flag con otro nombre.
- *Usar `GET /health` como único ejercicio*: no tiene cuerpo de entrada, así que no puede ejercitar
  el pipe de validación ni el error de validación de API4, y además está fuera de `/api/v1`.

**Rationale**: la fase entrega un pipeline demostrablemente funcional sin ampliar ni un endpoint la
superficie pública real, que es exactamente lo que pide el Approach 3 de la proposal.

### D4 — Nombres finales: `plataforma/documentacion` y `plataforma/errores`

**Choice**: `src/plataforma/documentacion/` y `src/plataforma/errores/`, ambos con su `index.ts`
(frontera 6). Nombres de una sola palabra en español, como los seis submódulos existentes (`config`,
`reloj`, `observabilidad`, `prisma`, `redis`, `salud`; skill §1 y §8). Archivos en kebab-case:

```
src/plataforma/documentacion/
├── index.ts                      barril: la única superficie importable
├── configuracion-documento.ts    DocumentBuilder (título, versión, servers, tags) — literal
├── construir-documento.ts        construirDocumentoInterno(app)
├── filtrar-documento-publico.ts  filtrarDocumentoPublico(doc)   (+ .spec.ts, función pura)
├── ordenar-documento.ts          ordenarDocumento(doc)          (+ .spec.ts, función pura)
├── serializar-documento.ts       serializarDocumento(doc)       (+ .spec.ts, función pura)
├── respuesta-desde-zod.ts        respuestaDesdeZod(esquema, opciones) → decorador
└── montar-documentacion.ts       montarDocumentacion(app)  (Scalar en /docs, D7)

src/plataforma/errores/
├── index.ts
├── catalogo-codigos.ts           CATALOGO_CODIGOS + tipo CodigoError derivado de sus claves
├── error-de-aplicacion.ts        ErrorDeAplicacion (código estable + status + extensiones)
├── construir-problema.ts         construirProblema(...) → Problema   (+ .spec.ts, función pura)
├── filtro-problem-json.ts        FiltroProblemJson (ExceptionFilter)
└── errores.module.ts             ErroresModule: registra APP_FILTER
```

**Alternatives considered**: `plataforma/contrato/` (confunde con `openapi/`, que es el contrato);
`plataforma/openapi/` (nombre en inglés, contra skill §8); `plataforma/problemas/` para los errores
(describe el formato de salida, no la responsabilidad).

**Rationale**: `documentacion` cubre las dos responsabilidades que la proposal agrupó (construir el
documento y servirlo) porque el documento **es** la documentación; `errores` nombra la
responsabilidad, no el RFC, así que sobrevive a un cambio de formato. Ninguna regla nueva de
`dependency-cruiser` hace falta: la regla 6 ya está escrita en forma genérica
(`^src/plataforma/([^/]+)/`) y cubre los submódulos nuevos automáticamente.

**[sin verificar]** `respuestaDesdeZod` asume que `@nestjs/swagger@12` acepta el JSON Schema que
produce `z.toJSONSchema(esquema)` dentro de `@ApiResponse({ schema })`. Si además acepta el Standard
Schema directamente (sin `toJSONSchema`), el helper se simplifica a pasarlo tal cual y se registra
aquí. Lo que **no** cambia: el esquema zod sigue siendo la única fuente (skill §10) — nunca se
documenta una respuesta con `@ApiProperty` escrito a mano.

### D5 — RFC 9457: forma del problema y catálogo de códigos estables

**Choice**: toda respuesta de error sale de `construirProblema`, una función pura alimentada por
`CATALOGO_CODIGOS`:

```json
{
  "type": "urn:luxeboreal:error:validacion-fallida",
  "title": "La petición no cumple el esquema del endpoint",
  "status": 400,
  "codigo": "validacion-fallida",
  "instance": "/api/v1/ejemplos",
  "errores": [{ "campo": "precio", "problema": "formato" }]
}
```

con `Content-Type: application/problem+json`. Reglas:

- El **código estable** (`codigo`) es el contrato; el `status` HTTP no lo es (API4). `type` es la
  misma identidad en forma de URN, para clientes que sigan RFC 9457 literalmente.
- `CATALOGO_CODIGOS` es un `Record` congelado `codigo → { status, title }`; el tipo `CodigoError` se
  **deriva de sus claves**, así que un código fuera del catálogo no compila. Cada fase que agregue
  errores agrega su entrada aquí, con el id del requisito en el comentario.
- Códigos en **kebab-case y en español** (skill §8): `validacion-fallida`, `recurso-no-encontrado`,
  `conflicto-de-estado`, `error-interno`. Las Fases 11-13 agregan `peticion-no-autenticada`,
  `rol-insuficiente`, `clave-idempotencia-*`.
- **Errores de validación**: el detalle enumera `{ campo, problema }` con el mismo vocabulario que
  `plataforma/config` de 00a (`falta` | `formato` | `valor`) y **MUST NOT** incluir el valor recibido
  — misma prohibición que `ConfiguracionInvalidaError` (PLT1) y por el mismo motivo (R14).
- **Errores no manejados**: `500`, `codigo: "error-interno"`, `detail` genérico. La respuesta
  **MUST NOT** contener el mensaje ni el stack de la excepción. El filtro los registra con
  `PinoLogger` como campo `err` (sujeto a la redacción de D9 de 00a) más `codigo`, `status` y el id
  de la petición; **no** crea un campo nuevo sin redactar para el diagnóstico.

**Alternatives considered**:
- *`type` como URL HTTP* (`https://…/errores/<codigo>`): RFC 9457 lo recomienda cuando resuelve a
  documentación; aquí no resuelve a nada (el dominio no publica esa página y `/docs` está apagado
  fuera de desarrollo), así que sería una promesa falsa.
- *Solo `type`, sin `codigo`*: obliga al cliente a parsear una URI para obtener el código, justo lo
  que API4 quiere evitar ("sin parsear el mensaje").
- *Solo `codigo`, sin `type`*: se aparta de RFC 9457, que exige `type` como miembro principal.
- *Reusar el `status` como código*: prohibido explícitamente por API4.

**Rationale**: dos miembros derivados de **una** entrada de catálogo; cumple RFC 9457 y API4 sin
obligar a nadie a parsear. Ata a todas las fases con endpoints → se propone **ADR-0011**
(`docs/adr/0011-codigos-de-error-rfc9457.md`, estado `propuesta`).

**Relación con Q2 (redacción de `err.message`)**: este filtro **no necesita** el diagnóstico real
para cumplir API4 — el código estable y el `status` bastan, y el mensaje nunca sale al cliente. Por
tanto Q2 **no bloquea** ninguna tarea de esta fase. Si al implementar se concluye que el log sin
`err.message` deja la fase 09 sin operabilidad, la tarea **se detiene y se pregunta al usuario**; la
tabla D9 de 00a MUST NOT modificarse sin su decisión.

**[sin verificar]** La forma exacta de la excepción que lanza `StandardSchemaValidationPipe` de
NestJS 12 (probablemente `BadRequestException` con los *issues* de Standard Schema). La tarea del
filtro MUST inspeccionarla antes de mapear; si los *issues* no permiten clasificar
`falta`/`formato`/`valor`, se emite `problema: "formato"` para todos y se registra la desviación.
La regla que **no** se relaja: la respuesta nunca repite el valor recibido.

### D6 — `GET /health` queda exento de problem+json y fuera del documento público

**Choice**: `/health` es una ruta **operativa**, no un recurso del contrato, y se trata igual en las
tres dimensiones:

| Regla | `/health` | Dónde ya está decidido |
|---|---|---|
| Prefijo `/api/v1` (API2) | exento: `setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: GET }] })` | API2, Q1 de 00a |
| Documento público (API8) | excluido: etiquetado `internal`, solo aparece en `openapi/openapi.interno.json` | API8 |
| `application/problem+json` (API4) | **exento**: conserva el cuerpo de Terminus | **se decide aquí** (pregunta abierta de 00a) |

Mecanismo de la exención de API4: `SaludController` declara `@UseFilters(FiltroSaludOperativo)`,
donde `FiltroSaludOperativo extends BaseExceptionFilter` (`@nestjs/core`) y reproduce el
comportamiento por defecto. Un filtro a nivel de controlador tiene precedencia sobre el global, así
que la exención queda **escrita donde aplica**, no como una lista de rutas dentro del filtro global.

Además, `/health` se documenta desde su esquema zod: `esquemaRespuestaSalud` en
`plataforma/salud/esquema-respuesta.ts`, usado por `respuestaDesdeZod` (D4) y verificado contra la
respuesta real en e2e.

**Alternatives considered**:
- *Pasar el `503` de Terminus a problem+json*: rompe PLT4 ("el cuerpo nombra cuál dependencia falló")
  y el contrato operativo que ya consultan Docker, Dokploy y Uptime Kuma; además obligaría a
  reescribir tests de 00a que hoy están en verde.
- *Lista de rutas exentas dentro del filtro global* (`['/health']`): compara cadenas de URL, se
  desincroniza de la ruta real y esconde la excepción lejos del endpoint que la tiene.

**Rationale**: la misma razón que ya justificó las otras dos exenciones — `/health` responde a
orquestadores de infraestructura, no al cliente de back office. Coherente, y con un mecanismo
idiomático de Nest. `sdd-spec` MUST registrar esta exención en el delta de API4 (no es solo
implementación: cambia el comportamiento observable).

### D7 — `/docs` con Scalar: `DOCS_HABILITADO`, apagado por omisión y rechazado en producción

**Choice**: variable nueva `DOCS_HABILITADO` (`'true' | 'false'`, **default `'false'`**) en el
esquema Zod de `plataforma/config` (PLT1: única lectura de `process.env`). Sobre ella:

1. `montarDocumentacion(app)` **retorna sin hacer nada** si `DOCS_HABILITADO` es falso: no construye
   el documento ni monta Scalar. `/docs` responde el `404` por defecto de Nest.
2. Si es verdadero: construye el documento interno, lo filtra a público (D1) y monta
   `app.use('/docs', apiReference({ content: documentoPublico }))`. Al ser middleware de Express,
   Scalar queda fuera del prefijo global sin necesidad de excluirlo.
3. **`cargarConfiguracion` rechaza la combinación `NODE_ENV=production` + `DOCS_HABILITADO=true`**
   lanzando `ConfiguracionInvalidaError` con `{ nombre: 'DOCS_HABILITADO', problema: 'valor' }`. En
   producción, hoy, `/docs` no puede encenderse ni por accidente ni a propósito.

**Alternatives considered**:
- *Default derivado de `NODE_ENV`* (`true` en `development`): más cómodo, pero un default implícito
  que depende de otra variable es exactamente el tipo de regla que se olvida al desplegar.
- *Montar siempre y proteger con un guard*: el mecanismo de autenticación es de la Fase 11 (API7,
  ADR-0008); un guard hoy sería un placeholder sin nada que verificar.
- *Comprobar el entorno dentro de `montarDocumentacion`*: mueve la regla de seguridad a una función
  de presentación, en vez de dejarla en el único lugar que valida configuración (PLT1).

**Rationale**: API9 pasa de convención a **garantía de arranque**, verificable con un test unitario
de `cargarConfiguracion` que no necesita levantar nada. La Fase 11 relaja la regla cuando exista
autenticación real, en un solo sitio y con su propio ADR/spec. El documento se construye solo cuando
se va a servir, así que el arranque de producción no paga nada.

Compatibilidad con 00a: el e2e existente crea la app con `NODE_ENV: 'test'` y sin `DOCS_HABILITADO`
→ default `false` → Scalar no se monta y los tests de 00a siguen pasando sin tocarse.

### D8 — Una sola definición de los pasos de CI: `ci:hook` es un prefijo de `ci`

**Choice**: cada comprobación es **un** script atómico; los agregados solo componen esos scripts.

```
ci:hook  = lint → typecheck → test(unit) → contrato:deriva → secretos → commits
ci       = prisma:generar → ci:hook → fronteras → test:cobertura → test:e2e
                          → contrato:lint → contrato:diff → auditoria → flujos
verify   = prisma:generar → lint → typecheck → fronteras → contrato:deriva
                          → vitest(unit + integracion)
```

- El **hook pre-push** ejecuta `npm run ci:hook` y nada más.
- El **workflow de Actions** ejecuta `npm run ci` como un único paso (más `checkout`, `setup-node`,
  `npm ci`). El YAML no nombra ninguna comprobación individual.
- `verify` (PLT7) sigue siendo la puerta local **de build** y gana `contrato:deriva`: pasa de cinco a
  seis comprobaciones. `gitleaks` y `commitlint` **no** entran en `verify` porque dependen del estado
  de git, no del código (lo dice la proposal y se confirma aquí).

**Alternatives considered**:
- *`ci:completo` + `ci:rapido` como hermanos, y `ci = ci:rapido && ci:completo`*: equivalente, pero
  crea un tercer nombre que nadie invoca directamente y esconde que el hook corre un prefijo.
- *Que el hook llame directamente a los scripts atómicos*: son dos listas que mantener; la primera
  vez que se agregue un paso rápido, una de las dos se queda atrás.
- *Definir los pasos en el YAML y que `ci` los replique*: es el fallo que la proposal quiere evitar —
  el YAML no se puede ejecutar hoy (Q4), así que se desincronizaría sin que nadie lo note.

**Rationale**: "CI completo en verde" se verifica corriendo exactamente lo que correrá el servidor.
**Costo aceptado y explícito**: `ci` ejecuta los tests unitarios dos veces (una en `ci:hook`, otra
dentro de `test:cobertura`), ~8 s extra. Se acepta a cambio de que el subconjunto del hook no sea una
segunda definición; si esos segundos molestan, se revisa en 09, no a costa de duplicar listas.

Scripts atómicos nuevos (todos en `package.json`, ver "File Changes"):

| Script | Qué hace | ¿En el hook? |
|---|---|---|
| `contrato:generar` | escribe los dos documentos | no (lo corre quien cambia la API) |
| `contrato:deriva` | regenera en memoria y compara con lo commiteado | **sí** |
| `contrato:lint` | Spectral sobre los dos documentos | no |
| `contrato:diff` | oasdiff del público contra `main` | no |
| `secretos` | gitleaks sobre el árbol de trabajo | **sí** |
| `secretos:historial` | gitleaks sobre el historial de git | no (lento) |
| `commits` | commitlint sobre el rango `merge-base(main, HEAD)..HEAD` | **sí** |
| `auditoria` | `npm audit` filtrado por umbral y excepciones | no |
| `flujos` | actionlint sobre `.github/workflows/` | no |
| `changelog` | `git-cliff -o CHANGELOG.md` | no (ver D16) |

Límite conocido de `secretos` en el hook: escanea el **árbol de trabajo**, así que un secreto
introducido y luego borrado dentro del mismo push lo atrapa `secretos:historial` en CI, no el hook.
Se documenta; no se disfraza.

### D9 — Hook pre-push: `core.hooksPath` con `.githooks/` versionado

**Choice**: dos hooks versionados en `.githooks/`, activados con `git config core.hooksPath .githooks`
desde el script `prepare` de npm (que corre en `npm install`):

| Hook | Contenido | Por qué ahí |
|---|---|---|
| `.githooks/commit-msg` | `npx --no-install commitlint --edit "$1"` | rechaza el mensaje **cuando se escribe**, no diez commits después |
| `.githooks/pre-push` | anuncia qué va a correr y ejecuta `npm run ci:hook` | puerta antes de publicar |

`"prepare": "git config core.hooksPath .githooks || exit 0"` — el `|| exit 0` evita romper
`npm install` donde no hay repositorio git (instalación desde tarball). Saltarse la puerta sigue
siendo `git push --no-verify`: explícito, escrito por la persona, y el hook imprime al empezar qué
comprobaciones corre y cuál falló, así que nunca se salta en silencio (requisito 1 de la proposal).

**Alternatives considered**:

| Opción | Costo real |
|---|---|
| **Husky 9** | Una dependencia y un directorio `.husky/` más; es el estándar de facto, pero no aporta nada que `core.hooksPath` no dé: Husky **es** un instalador de `core.hooksPath` |
| **simple-git-hooks** | Más liviano que Husky, pero exige reinstalar los hooks cada vez que cambia la configuración en `package.json`, y los hooks multilínea quedan incómodos dentro del JSON |
| **`.githooks/` + `core.hooksPath`** (elegida) | Una línea en `prepare`; los hooks son archivos de texto versionados y revisables en el PR; cero dependencias nuevas |

**Rationale**: es el mecanismo más pequeño que cumple todo lo exigido (versionado, revisable,
saltable con `--no-verify`, sin dependencia nueva). No es una decisión arquitectónica que ate a otras
fases —se revierte borrando un directorio y una línea— así que se documenta aquí y **no** genera ADR.

Riesgo de Windows: git ejecuta los hooks con el `sh` de Git for Windows, que falla con
`bad interpreter` si el archivo tiene CRLF. La regla `* text=auto eol=lf` de `.gitattributes` (D2)
lo cubre, y la tarea del hook MUST verificarlo en la máquina real antes de darla por cerrada.

### D10 — Herramientas externas: npm para lo de JavaScript, Docker fijado para los binarios Go

**Choice**: una regla única, sin excepciones:

| Herramienta | Naturaleza | Cómo se obtiene | Igual en local y en CI |
|---|---|---|---|
| Spectral | npm | `@stoplight/spectral-cli` (devDependency) **[verificado 00a: 6.16.x publicado]** | sí |
| commitlint | npm | `@commitlint/cli` + `@commitlint/config-conventional` (devDependencies) | sí |
| git-cliff | npm | `git-cliff` (devDependency; el paquete descarga el binario precompilado) | sí |
| `npm audit` | nativo | ninguno | sí |
| **gitleaks** | binario Go | `docker run --rm` con imagen fijada | sí |
| **oasdiff** | binario Go | `docker run --rm` con imagen fijada | sí |
| **actionlint** | binario Go | `docker run --rm` con imagen fijada | sí |

Las tres imágenes se declaran **en un solo archivo**, `scripts/herramientas.ts`, con su etiqueta de
versión exacta y su digest (`IMAGEN_GITLEAKS`, `IMAGEN_OASDIFF`, `IMAGEN_ACTIONLINT`), junto al
helper `ejecutarHerramienta(imagen, argumentos, opciones)` que monta el repositorio en `/repo` y
propaga el código de salida. Actualizar una herramienta es cambiar una constante.

**Alternatives considered**:
- *Acciones de GitHub para gitleaks/oasdiff/actionlint en el workflow, y binarios instalados a mano
  en local*: dos implementaciones del mismo paso, con dos formas de fallar, y el paso local deja de
  ser reproducible ("instálalo como puedas"). Rompe D8 justo donde más duele: los pasos que solo
  existen en el YAML son los que nadie ejecuta hasta que el repo esté en GitHub (Q4).
- *`go install` en local*: exige un toolchain de Go en la máquina de desarrollo, que hoy no existe.
- *Envolturas npm no oficiales de gitleaks/oasdiff*: dependencias sin dueño claro en la ruta crítica
  de la detección de secretos; contradice el propio paso que intentan ejecutar.

**Rationale**: Docker ya es prerrequisito del proyecto para probar (ADR-0009: "Docker MUST estar
corriendo para probar"), así que no agrega un requisito nuevo; a cambio da la misma invocación, con
la misma versión, en Windows y en el runner de Ubuntu. Si Docker no responde, el script falla
nombrando Docker Desktop — **nunca** pasa en verde ni cae a un camino alternativo silencioso.

Costo aceptado: el hook pre-push arranca un contenedor pequeño (gitleaks). Presupuesto de tiempo del
hook: **≤ 60 s** en la máquina de desarrollo, medido y registrado en su tarea; si se pasa, sale
`secretos` del hook (queda en CI) antes que aflojar cualquier otra comprobación.

**[sin verificar]** Montaje de volúmenes con rutas de Windows (`-v "C:\...:/repo"`) desde un `spawn`
de Node. La tarea que escriba `scripts/herramientas.ts` MUST probarlo en la máquina real; si falla,
la alternativa es convertir la ruta a formato `/c/...` dentro del helper — en un solo sitio.

### D11 — Política explícita de oasdiff cuando no hay documento base

**Choice**: `scripts/comparar-contrato.ts` decide así, y cada rama deja rastro en la salida:

| Situación | Resultado | Salida |
|---|---|---|
| `main` tiene `openapi/openapi.json` | corre `oasdiff breaking <base> <actual> --fail-on ERR` | el reporte de oasdiff |
| `main` existe pero **no** tiene el documento | **no falla** | `oasdiff: SIN BASE DE COMPARACIÓN — main no tiene openapi/openapi.json; este PR no fue comparado` |
| No existe la rama `main` o falla `git show` | **falla** | nombra el comando git que falló |
| Docker no responde | **falla** | nombra Docker Desktop |

La línea `SIN BASE DE COMPARACIÓN` va en mayúsculas y es la **única** forma de que el paso termine en
verde sin comparar; el script MUST NOT imprimir "ok" ni "sin cambios incompatibles" en ese caso.

**Alternatives considered**: *fallar siempre sin base* (bloquea el primer PR de la fase sin que haya
nada que comparar); *tratar "sin base" como "sin cambios"* (un verde que parece una comparación real
— exactamente lo que el riesgo de la proposal pide evitar).

**Rationale**: el primer PR de esta cadena necesariamente no tiene base; a partir del segundo la tiene.
Distinguir "comparado y limpio" de "no comparado" es lo que hace que API10 signifique algo.

### D12 — Scripts de herramienta en `scripts/`, ejecutados con `vite-node`, y frontera 11

**Choice**: todo paso de CI que no sea una invocación trivial de un binario vive en `scripts/*.ts` y
se ejecuta con `vite-node` usando **la misma** `vitest.config.ts` que los tests:

```
"herramienta": "vite-node --config vitest.config.ts",
"contrato:generar": "npm run herramienta -- scripts/generar-contrato.ts",
```

**Alternatives considered**:

| Opción | Por qué no |
|---|---|
| Comandos de shell dentro de `package.json` (`$(git merge-base …)`) | No son portables: `cmd.exe` (Windows) y `bash` (runner) difieren en sustitución de comandos, comillas y variables. Este proyecto se desarrolla en Windows y corre CI en Ubuntu |
| `node scripts/x.ts` con el *type stripping* de Node 24 | No transforma decoradores, y el generador arranca `AppModule` (lleno de decoradores de Nest) |
| `tsx` / esbuild | No emite `emitDecoratorMetadata`: es el mismo fallo que D7 de 00a resolvió con SWC; la inyección por tipo de clase de Nest se rompería |
| Compilar con `nest build` y ejecutar desde `dist/` | Funciona y es la opción más aburrida, pero mete un build completo dentro del hook pre-push |

**Rationale**: `vite-node` reutiliza el plugin `unplugin-swc` ya configurado, así que la receta de
decoradores queda definida **una sola vez** (D7 de 00a sigue siendo la fuente). **[sin verificar]**
estabilidad de la CLI de `vite-node`; se declara como devDependency explícita (no se depende de que
venga con Vitest). **Fallback registrado**: si `vite-node` no resulta confiable, se compila con
`nest build` (incluyendo `scripts/` en `tsconfig.build.json`) y se ejecuta desde `dist/`, sacando
`contrato:deriva` del hook para no pagar el build en cada push.

**Frontera 11 (nueva regla de `dependency-cruiser`)**: `scripts/` solo puede importar el `index.ts` de
un submódulo de `plataforma/` (nunca una ruta interna), y `npm run fronteras` pasa a cruzar
`src scripts`. Se prueba con un fixture que la viola, como las otras diez (`test/fronteras/`).
`src/` sigue sin poder importar `scripts/` ni `test/` (fronteras 8 y 11 no se solapan).

### D13 — commitlint con una regla propia contra la atribución de IA

**Choice**: `commitlint.config.js` extiende `@commitlint/config-conventional` y agrega un plugin
local con la regla `sin-atribucion-ia`, que rechaza (severidad error) cualquier mensaje cuyo texto
crudo contenga una línea de atribución (`Co-Authored-By:`, `Generated with`, o el emoji de robot),
en cualquier combinación de mayúsculas.

Se prueba con la **API programática** (`@commitlint/lint`) sobre mensajes de ejemplo —el mismo patrón
con el que 00a probó ESLint y `dependency-cruiser` en `test/fronteras/`—, no ejecutando `git commit`:

| Mensaje de ejemplo | Resultado esperado |
|---|---|
| `feat(plataforma/errores): agregar filtro problem+json` | pasa |
| `cambios varios` | falla (sin tipo convencional) |
| `feat(x): algo\n\nCo-Authored-By: Alguien <a@b.c>` | falla (`sin-atribucion-ia`) |

**Alternatives considered**: `commit-msg` con un `grep` propio (no da los mensajes de error de
commitlint ni es portable a `cmd.exe`); confiar solo en la revisión humana (es precisamente lo que la
regla 6 de `CLAUDE.md` quiere volver automático).

**Rationale**: convierte dos reglas escritas del proyecto (Conventional Commits, sin atribución de IA)
en comprobaciones ejecutables, con tests que las verifican a ellas — el mismo principio 3 del diseño
de 00a: "las reglas se verifican por herramienta, y las herramientas por tests".

### D14 — `npm audit`: umbral explícito y excepciones versionadas

**Choice**: `scripts/auditar-dependencias.ts` corre `npm audit --json`, descarta lo que esté por
debajo de **`high`**, descarta los avisos listados en `auditoria-excepciones.json` y falla si queda
alguno. Cada excepción es un objeto con `id`, `paquete`, `motivo`, `fecha` y `revisar_antes_de`; una
excepción vencida **falla** el paso, nombrándola.

**Alternatives considered**: `npm audit --audit-level=high` a secas (un aviso alto sin parche
disponible bloquea el pipeline para siempre y empuja a la gente a saltarse el hook); `--omit=dev`
(una vulnerabilidad alta en una devDependency igual se ejecuta en la máquina de desarrollo y en el
runner, con acceso al repositorio).

**Rationale**: mismo principio que la allowlist de `gitleaks` (`.gitleaks.toml`, con una entrada por
falso positivo y su motivo — p. ej. las credenciales de ejemplo de `.env.example`): lo que se ignora
se escribe, se fecha y se revisa; nunca se ignora por omisión (requisito 3 de la proposal).

### D15 — Cobertura: cómo se fija `coverage_threshold` y dónde se hace cumplir

**Choice**: la tarea de cierre **mide** con `npm run test:cobertura` y fija el umbral con una regla,
no con una corazonada: `umbral = max(60, floor(medido / 5) * 5 - 5)`. El valor se escribe en dos
sitios que deben coincidir: `openspec/config.yaml` (`coverage_threshold`, criterio de salida de la
fila 00b) y `vitest.config.ts` (`coverage.thresholds.lines`), que es quien lo **hace cumplir**.
`ci` corre `test:cobertura` en vez de `test` + `test:integracion`, así que el umbral bloquea de verdad.

**Alternatives considered**: dejarlo en 0 con un comentario (la fila 00b exige fijarlo); elegir 80 %
de entrada (sobre un repositorio dominado por cableado de Nest, el número se cumple escribiendo tests
que no verifican nada).

**Rationale**: un umbral derivado de una medición real es un **suelo** contra regresiones, que es para
lo que sirve; un umbral inventado es una invitación a maquillarlo. El margen de 5 puntos evita que un
refactor legítimo ponga el build en rojo sin haber perdido cobertura de verdad.

### D16 — El CHANGELOG se genera, pero no es un paso de `ci`

**Choice**: `cliff.toml` versionado y `npm run changelog` (`git-cliff -o CHANGELOG.md`), invocado en
la tarea de cierre de cada fase (y más adelante al publicar versiones). **No** hay paso de CI que
verifique deriva del `CHANGELOG.md`.

**Rationale**: un chequeo de deriva del changelog fallaría en **todo** commit nuevo por construcción
(el changelog incluiría el commit que se está haciendo), así que sería un paso siempre rojo o siempre
saltado. El archivo es generado y se regenera sin pérdida (la fuente son los commits, plan de
rollback de la proposal); lo que sí protege el pipeline es su insumo: `commitlint` (D13). Prohibido
editar `CHANGELOG.md` a mano (skill §11).

## Data Flow

### Generación y verificación del contrato

```
scripts/generar-contrato.ts              scripts/verificar-deriva-contrato.ts
        │                                             │
        ├─ AppModule + CONFIGURACION literal ─────────┤   (misma construcción, mismo resultado)
        ├─ configurarAplicacion(app)                  │
        │     ├─ setGlobalPrefix('api/v1', exclude health)
        │     ├─ useGlobalPipes(StandardSchemaValidationPipe)
        │     └─ montarDocumentacion(app)  → no-op (DOCS_HABILITADO=false)
        ├─ SwaggerModule.createDocument(app, CONFIGURACION_DOCUMENTO)
        │        │
        │        └──▶ documento INTERNO ──┬──▶ ordenar → serializar ─▶ openapi/openapi.interno.json
        │                                 │
        │                                 └──▶ filtrarDocumentoPublico (quita `internal`,
        │                                       poda paths y schemas huérfanos)
        │                                            └─▶ ordenar → serializar ─▶ openapi/openapi.json
        ▼                                             ▼
    escribe los 2 archivos                 compara en memoria contra los 2 commiteados
                                             iguales → exit 0
                                             distintos → exit 1 nombrando archivo y línea
                                             solo CRLF → exit 1 nombrando .gitattributes
```

### Una petición con error

```
HTTP  ─▶  setGlobalPrefix /api/v1  ─▶  StandardSchemaValidationPipe (esquema zod del endpoint)
                                              │ inválido
                                              ▼
                                        excepción del pipe
                                              │
   ┌──────────────────────────────────────────┴───────────────────────────────┐
   │  ruta /health  ──▶ FiltroSaludOperativo (BaseExceptionFilter)            │
   │                     └─▶ cuerpo de Terminus, 200/503, sin problem+json    │
   │                                                                          │
   │  cualquier otra ─▶ FiltroProblemJson (APP_FILTER, global)                │
   │                     ├─ CATALOGO_CODIGOS[codigo] → { status, title }      │
   │                     ├─ construirProblema(...) → { type, title, status,   │
   │                     │        codigo, instance, errores[{campo,problema}] }│
   │                     ├─ Content-Type: application/problem+json            │
   │                     └─ PinoLogger.error({ err, codigo, status, reqId })  │
   │                          (err.message sujeto a la redacción D9 de 00a)   │
   └──────────────────────────────────────────────────────────────────────────┘

La respuesta NUNCA contiene: el valor recibido, err.message, ni el stack.
```

### La puerta, de local a servidor

```
git commit ─▶ .githooks/commit-msg ─▶ commitlint (Conventional + sin-atribucion-ia)

git push   ─▶ .githooks/pre-push   ─▶ npm run ci:hook
                                        lint · typecheck · test(unit)
                                        contrato:deriva · secretos · commits
                                          │ falla → push bloqueado, nombra el paso
                                          └ --no-verify → se salta explícitamente

GitHub     ─▶ .github/workflows/ci.yml ─▶ checkout(fetch-depth:0) · setup-node(.nvmrc) · npm ci
                                        └─▶ npm run ci
                                              prisma:generar · [ci:hook] · fronteras
                                              test:cobertura · test:e2e · contrato:lint
                                              contrato:diff · auditoria · flujos
```

## Endpoints

Esta fase **no agrega ningún endpoint de producción**. Modifica cómo se presenta el único que existe
y monta una interfaz de lectura.

| Método | Ruta | Request | Response | Códigos | Contrato |
|---|---|---|---|---|---|
| `GET` | `/health` | sin parámetros ni cuerpo | igual que en 00a (cuerpo de Terminus), ahora descrito por `esquemaRespuestaSalud` | `200` / `503` | Sin prefijo `/api/v1` (API2, exclusión explícita); `@ApiTags('internal')`; solo en `openapi/openapi.interno.json`; exento de problem+json (D6); `operationId: obtenerSalud` |
| `GET` | `/docs` | sin parámetros | HTML de Scalar sobre el documento **público** | `200` si `DOCS_HABILITADO=true`; `404` si no | API9; middleware, fuera del prefijo global; imposible de encender en `production` (D7) |

Endpoints solo de test (D3), nunca en `src/`, nunca en el contrato generado:
`GET|POST /api/v1/ejemplos`, `GET /api/v1/ejemplos/falla`, `GET /api/v1/ejemplos/interno`.

Documento público al cerrar esta fase: `paths: {}` — válido en OpenAPI 3.1 y correcto: no hay ningún
recurso de negocio todavía. Lo que la fase entrega es el **pipeline**, verificado con `/health` (real)
y con el fixture (de prueba).

## Configuración nueva

Variable de la aplicación (esquema Zod de `plataforma/config`, única lectura de `process.env`, PLT1):

| Variable | Tipo | Default | Requerida | Notas |
|---|---|---|---|---|
| `DOCS_HABILITADO` | `'true'` \| `'false'` → `boolean` | `false` | no | API9. Con `NODE_ENV=production` el valor `true` es **inválido** y el proceso no arranca (D7). Se documenta en `.env.example` |

No se agrega ninguna variable para el contrato: título, versión y `servers` del documento son
literales o salen de `package.json`, por determinismo (D2, API1). Sin variables `MOCK_*` (A2,
ADR-0001).

Variables **de herramienta** (no las lee la aplicación; se documentan en `.env.example` aparte, como
los puertos de Compose en 00a):

| Variable | Para qué | Default |
|---|---|---|
| `LUXE_COMMITS_DESDE` | forzar la base del rango de `commitlint` (útil en CI o al rebasar) | `merge-base(main, HEAD)` |

## Esquema de datos

Sin cambios: `MODELO_DATOS.md` **no** se toca y `prisma/schema.prisma` sigue sin modelos. Esta fase no
persiste nada (el esquema de datos v1 es de la Fase 01).

## Eventos de dominio

Ninguno. 00b no tiene módulos de negocio.

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `.githooks/pre-push`, `.githooks/commit-msg` | Create | Hooks versionados (D9); LF obligatorio |
| `.gitattributes` | Create | `* text=auto eol=lf` + reglas explícitas para `openapi/*.json` y `.githooks/*` (D2, D9) |
| `commitlint.config.js` | Create | Conventional Commits + regla `sin-atribucion-ia` (D13) |
| `.gitleaks.toml` | Create | Allowlist versionada con motivo por entrada (D14) |
| `auditoria-excepciones.json` | Create | Excepciones de `npm audit` con motivo, fecha y caducidad (D14) |
| `.spectral.yaml` | Create | `extends: spectral:oas` + reglas del proyecto (prefijo `/api/v1` con la excepción de `/health`, `operationId` camelCase, propiedades camelCase, errores en `problem+json`); se corre con `--fail-severity error` |
| `cliff.toml` | Create | Configuración de `git-cliff` (D16) |
| `.github/workflows/ci.yml` | Create | Un solo job: `checkout` (fetch-depth 0) → `setup-node` (`.nvmrc`, cache npm) → `npm ci` → `npm run ci`. Acciones fijadas por SHA; `permissions: contents: read` |
| `openapi/openapi.json` | Create (generado) | Documento **público** (D1) |
| `openapi/openapi.interno.json` | Create (generado) | Documento **interno** (D1) |
| `scripts/herramientas.ts` | Create | Imágenes Docker fijadas + `ejecutarHerramienta` (D10) |
| `scripts/generar-contrato.ts` | Create | Escribe los dos documentos (D2) |
| `scripts/verificar-deriva-contrato.ts` | Create | Chequeo de deriva, sin escribir (D2) |
| `scripts/comparar-contrato.ts` | Create | oasdiff + política de "sin base" (D11) |
| `scripts/buscar-secretos.ts` | Create | gitleaks (árbol e historial) (D10) |
| `scripts/verificar-commits.ts` | Create | Rango + `@commitlint/lint` (D8, D13) |
| `scripts/auditar-dependencias.ts` | Create | `npm audit` con umbral y excepciones (D14) |
| `scripts/validar-flujos.ts` | Create | actionlint (D10) |
| `src/plataforma/documentacion/**` | Create | Ver árbol de D4 |
| `src/plataforma/errores/**` | Create | Ver árbol de D4 |
| `src/plataforma/salud/esquema-respuesta.ts` | Create | Esquema zod de la respuesta de `/health` (D6) |
| `src/plataforma/salud/filtro-salud-operativo.ts` | Create | `BaseExceptionFilter` a nivel de controlador (D6) |
| `src/plataforma/salud/salud.controller.ts` | Modify | `@ApiTags('internal')`, `@ApiOperation({ operationId: 'obtenerSalud' })`, `respuestaDesdeZod`, `@UseFilters` |
| `src/plataforma/config/esquema.ts` | Modify | `DOCS_HABILITADO` + la regla `production` ⇒ no `true` (D7) |
| `src/configurar-aplicacion.ts` | Modify | `setGlobalPrefix` con exclusión de `health`, `useGlobalPipes`, `montarDocumentacion` |
| `src/app.module.ts` | Modify | Importa `ErroresModule` |
| `.dependency-cruiser.cjs` | Modify | Regla 11 `scripts-solo-barriles-de-plataforma` (D12) |
| `vitest.config.ts` | Modify | `include` de `unit` suma `test/contrato/**/*.spec.ts`; `coverage.thresholds.lines` (D15) |
| `tsconfig.build.json` | Modify | Excluye `scripts/` y `test/` del build de producción |
| `package.json` | Modify | Dependencias nuevas + scripts de D8 + `prepare` de D9 |
| `.env.example` | Modify | `DOCS_HABILITADO` y `LUXE_COMMITS_DESDE` |
| `test/contrato/**` | Create | Fixture (D3) + tests de documento y de HTTP |
| `test/fronteras/**` | Modify | Fixture y caso de la regla 11 |
| `test/e2e/aplicacion.e2e-spec.ts` | Modify | Suma el caso de `/health` contra su esquema documentado; los casos existentes no cambian |
| `CHANGELOG.md` | Create (generado) | `git-cliff` (D16) |
| `openspec/config.yaml` | Modify | `strict_tdd: true` y `coverage_threshold` (tarea de cierre) |
| `CLAUDE.md` (§Comandos), `.claude/skills/luxeboreal-arquitectura/SKILL.md` (§1, §2, §7, §10, §11, §12) | Modify | Submódulos nuevos, regla 11, proyecto de contrato, comandos |
| `docs/adr/0010-*.md`, `docs/adr/0011-*.md`, `docs/adr/README.md` | Create / Modify | ADR `propuesta` (D1, D5) |
| `docs/fases/README.md`, `docs/migracion/inventario.md` | Modify | Al archivar; incluye corregir la fila 00b ("`/health` entra al contrato" → al documento **interno**) |

Scripts de `package.json` al cerrar la fase (los de 00a se conservan tal cual):

| Script | Comando (orientativo) |
|---|---|
| `prepare` | `git config core.hooksPath .githooks \|\| exit 0` |
| `herramienta` | `vite-node --config vitest.config.ts` |
| `contrato:generar` | `npm run herramienta -- scripts/generar-contrato.ts` |
| `contrato:deriva` | `npm run herramienta -- scripts/verificar-deriva-contrato.ts` |
| `contrato:lint` | `spectral lint openapi/openapi.json openapi/openapi.interno.json --ruleset .spectral.yaml --fail-severity error` |
| `contrato:diff` | `npm run herramienta -- scripts/comparar-contrato.ts` |
| `secretos` | `npm run herramienta -- scripts/buscar-secretos.ts --arbol` |
| `secretos:historial` | `npm run herramienta -- scripts/buscar-secretos.ts --historial` |
| `commits` | `npm run herramienta -- scripts/verificar-commits.ts` |
| `auditoria` | `npm run herramienta -- scripts/auditar-dependencias.ts` |
| `flujos` | `npm run herramienta -- scripts/validar-flujos.ts` |
| `changelog` | `git-cliff -o CHANGELOG.md` |
| `verify` | `prisma:generar && lint && typecheck && fronteras && contrato:deriva && vitest run --project unit --project integracion` |
| `ci:hook` | `lint && typecheck && test && contrato:deriva && secretos && commits` |
| `ci` | `prisma:generar && ci:hook && fronteras && test:cobertura && test:e2e && contrato:lint && contrato:diff && auditoria && flujos` |

Dependencias nuevas:

| Paquete | Dónde | Motivo |
|---|---|---|
| `@nestjs/swagger` | `dependencies` | lo importa `src/plataforma/documentacion` (frontera 9 prohíbe devDependencies en `src/`). **[verificado 00a: 12.0.2, peer `^12.0.0`]** |
| `@scalar/nestjs-api-reference` | `dependencies` | idem. **[verificado 00a: 1.2.21, sin peer de Nest]** |
| `@stoplight/spectral-cli`, `@commitlint/cli`, `@commitlint/config-conventional`, `git-cliff`, `vite-node` | `devDependencies` | herramientas de la puerta (D10, D12, D13) |

## Interfaces / Contracts

```ts
// src/plataforma/documentacion/index.ts — superficie pública
export const ETIQUETA_INTERNA = 'internal';
export const CONFIGURACION_DOCUMENTO: Omit<OpenAPIObject, 'paths'>; // DocumentBuilder, literal

/** Documento completo desde la app real; incluye lo etiquetado `internal`. */
export function construirDocumentoInterno(app: INestApplication): OpenAPIObject;

/** Pura: quita operaciones `internal`, paths vacíos, la etiqueta y los schemas huérfanos. */
export function filtrarDocumentoPublico(documento: OpenAPIObject): OpenAPIObject;

/** Pura: orden de primer nivel fijo + claves anidadas alfabéticas; arrays intactos. */
export function ordenarDocumento(documento: OpenAPIObject): OpenAPIObject;

/** Pura: JSON con 2 espacios, salto final, solo `\n`. */
export function serializarDocumento(documento: OpenAPIObject): string;

/** No-op si `DOCS_HABILITADO` es falso; si no, monta Scalar en /docs sobre el documento público. */
export function montarDocumentacion(app: INestApplication): void;

/** Documenta la respuesta desde el MISMO esquema zod que define la forma (skill §10). */
export function respuestaDesdeZod(
  esquema: StandardSchemaV1,
  opciones: { readonly status: number; readonly descripcion: string },
): MethodDecorator;

// src/plataforma/errores/index.ts — superficie pública
export const CATALOGO_CODIGOS: Readonly<Record<string, { status: number; title: string }>>;
export type CodigoError = keyof typeof CATALOGO_CODIGOS;   // un código fuera del catálogo no compila

export interface DetalleCampo {
  readonly campo: string;
  readonly problema: 'falta' | 'formato' | 'valor';        // mismo vocabulario que PLT1
}

export interface Problema {
  readonly type: string;        // urn:luxeboreal:error:<codigo>
  readonly title: string;
  readonly status: number;
  readonly codigo: CodigoError; // el contrato estable (API4)
  readonly instance?: string;
  readonly errores?: readonly DetalleCampo[];
}

/** Error de negocio/aplicación con código estable; el filtro lo mapea sin adivinar. */
export class ErrorDeAplicacion extends Error {
  readonly codigo: CodigoError;
  readonly errores?: readonly DetalleCampo[];
}

/** Pura: del código y el contexto al cuerpo RFC 9457. Nunca incluye valores recibidos. */
export function construirProblema(
  codigo: CodigoError,
  contexto: { readonly instance?: string; readonly errores?: readonly DetalleCampo[] },
): Problema;

export class FiltroProblemJson implements ExceptionFilter {}
export class ErroresModule {}   // registra FiltroProblemJson como APP_FILTER

// src/plataforma/salud/esquema-respuesta.ts
export const esquemaRespuestaSalud: z.ZodType<{
  status: 'ok' | 'error';
  info: Record<string, { status: 'up' }>;
  error: Record<string, { status: 'down' }>;
  details: Record<string, { status: 'up' | 'down' }>;
}>;

// src/plataforma/config — el tipo Configuracion crece con:
//   DOCS_HABILITADO: boolean   (default false; `true` + NODE_ENV=production ⇒ ConfiguracionInvalidaError)
```

## Testing Strategy

| Nivel | Qué | Cómo |
|---|---|---|
| Unitario (`src/**/*.spec.ts`, proyecto `unit`) | `filtrarDocumentoPublico` (quita la operación `internal`, borra el path vacío, quita la etiqueta, poda schemas huérfanos, **no** toca lo público); `ordenarDocumento` (idempotente; dos objetos con distinto orden de inserción producen la misma salida); `serializarDocumento` (2 espacios, salto final, sin `\r`); `construirProblema` (código→status/title, nunca valores); `cargarConfiguracion` con `DOCS_HABILITADO` (default, `'true'`, `'false'`, y el rechazo en `production`) | Funciones puras, sin Nest, sin infraestructura |
| Fronteras (`test/fronteras/`, proyecto `unit`) | Regla 11 (`scripts/` importando una ruta interna de `plataforma/` falla; importando el `index.ts` pasa); reglas 1-10 sin cambios | API `cruise` sobre fixtures, como en 00a |
| Herramientas (`test/fronteras/`, proyecto `unit`) | `commitlint`: mensaje válido pasa; sin tipo falla; con `Co-Authored-By` falla | API `@commitlint/lint` sobre mensajes de ejemplo |
| Contrato (`test/contrato/`, proyecto `unit` — **sin Docker**) | Generar dos veces produce cadenas idénticas (API1); el documento público **no** contiene `/health` ni la operación `internal` del fixture (API8); el interno **sí** contiene `/health` con la etiqueta; todo `operationId` cumple `^[a-z][A-Za-z0-9]*$` (API2); los `operationId` del documento generado coinciden con los del interno commiteado (API2, estabilidad); toda ruta empieza con `/api/v1` salvo `/health` (API2); vía Supertest sobre `AppModule + ContratoFixtureModule`: cuerpo inválido → `application/problem+json` con `codigo` estable y sin el valor recibido (API4), error no manejado → `500` problem+json sin `err.message` (API4), respuesta con UUID, fecha ISO 8601 UTC y dinero entero (API3), `/docs` → `404` con `DOCS_HABILITADO=false` y `200` con `true` (API9) | `Test.createTestingModule` + `overrideProvider(CONFIGURACION)` con un literal; ninguna prueba toca Postgres ni Redis, así que no hace falta `globalSetup` |
| Integración (`test/integracion/`, proyecto `integracion`) | Sin cambios de 00a | Testcontainers (ADR-0009) |
| E2E (`test/e2e/`, proyecto `e2e`) | Casos de 00a intactos (`/health` 200/503, `/api/v1/health` 404, apagado); **nuevo**: la respuesta real de `/health` valida contra `esquemaRespuestaSalud` (el documento describe la realidad) | Supertest + Testcontainers |
| Deriva (paso de CI, no test) | Regenerar y comparar contra lo commiteado; RED observable copiando el documento con un campo cambiado | `npm run contrato:deriva` |

TDD: `apply.tdd: true` de `openspec/config.yaml` aplica desde la primera tarea (RED observado → GREEN
→ REFACTOR), con `npm test`. `strict_tdd` pasa a `true` **en la tarea de cierre**, no antes (Approach 5
de la proposal). Los nombres de test siguen `<id del requisito> — <título del escenario>` de las specs
delta que escriba `sdd-spec`.

Los pasos que no son tests también tienen su RED, observado igual que en 00a: un secreto de mentira
en un archivo temporal para `secretos`, un mensaje con `Co-Authored-By` para `commits`, un campo
cambiado a mano en `openapi.json` para `contrato:deriva`, un `operationId` con guion bajo para
`contrato:lint`, y un campo quitado del documento para `contrato:diff`. Cada uno se borra
inmediatamente después, como hizo 00a con el fixture de fronteras.

## Threat Matrix

Esta fase **sí** cruza las fronteras que la matriz cubre: agrega hooks de git (archivos ejecutables),
ejecuta subprocesos (Docker, Spectral, commitlint, git), automatiza VCS/CI y cambia el enrutamiento
HTTP (prefijo global, middleware de `/docs`).

| Frontera | Casos adversarios mínimos | Aplicabilidad | Respuesta de diseño | Tests RED planeados |
|---|---|---|---|---|
| Rutas tipo documentación | `README.sh`, Markdown ejecutable, `requirements.txt` | **N/A**: ningún paso clasifica archivos por extensión ni ejecuta contenido de archivos de documentación. Los únicos archivos ejecutables que la fase crea son los dos hooks de `.githooks/`, que son fijos, versionados y revisados en el PR; ninguna entrada del usuario elige qué archivo se ejecuta | — | — |
| Selección del repositorio git | `git -C`, ruta relativa, ruta absoluta | **Aplicable**: `scripts/verificar-commits.ts`, `scripts/comparar-contrato.ts` y `scripts/buscar-secretos.ts` invocan git y Docker sobre "el repositorio" | Todos los scripts resuelven la raíz **una vez**, con `git rev-parse --show-toplevel`, y usan esa ruta absoluta para el `cwd` de git y para el montaje `-v <raíz>:/repo` de Docker. Ningún script usa `process.cwd()` directamente ni acepta la raíz por argumento. Si `rev-parse` falla, el script falla nombrando el problema; **nunca** cae a `.` | Un test que ejecuta el resolvedor desde un subdirectorio (`test/contrato/`) y afirma que devuelve la raíz del repositorio, no el subdirectorio |
| Estado del índice | staged, `commit -a`, índice vacío | **Aplicable**: `secretos` (árbol de trabajo) y `commits` (rango de commits) leen estados distintos de git | `secretos --arbol` escanea el árbol de trabajo (incluye cambios sin *stage*: lo que se va a empujar tarde o temprano); `commits` opera **solo** sobre commits ya creados, así que un índice vacío o sucio no lo afecta. El límite conocido (secreto borrado del árbol pero presente en un commit del push) queda cubierto por `secretos:historial` en `ci`, y está escrito en D8 | Un test con un rango vacío (`merge-base == HEAD`): `commits` termina en verde sin analizar nada y lo dice |
| Estado del push | rama con *upstream*, primer push, refspec explícito | **Aplicable**: el hook `pre-push` corre en las tres situaciones, y hoy **no hay remoto** (Q4) | El hook **ignora** el refspec que git le pasa por stdin y corre siempre el mismo `ci:hook`: no intenta deducir qué se está empujando, así que se comporta igual en el primer push, con o sin *upstream*. El rango de `commits` sale de `merge-base(main, HEAD)`, que existe con o sin remoto; `LUXE_COMMITS_DESDE` permite fijarlo explícitamente al rebasar | Un test que fija `LUXE_COMMITS_DESDE` a un SHA conocido y afirma el rango resultante; y el caso "rama == main" (rango vacío, verde) |
| Comandos de PR | `--head` explícito, prefijo de entorno, comandos compuestos | **N/A**: esta fase **no** automatiza PRs. Push, PR y merge son siempre decisión del usuario (`CLAUDE.md`), el repositorio no tiene remoto (Q4) y el workflow solo ejecuta `npm run ci`: no abre, comenta ni fusiona nada. Sus `permissions` son `contents: read` | — | — |

Regla transversal para los subprocesos: `ejecutarHerramienta` y los scripts de git usan `spawn` con
**array de argumentos**, nunca `shell: true` ni concatenación de cadenas, así que una ruta con
espacios (`C:\Users\ASUS\Desktop\Project Dani\…` — la ruta real de este repositorio) no puede partirse
en dos argumentos ni inyectar un comando. Test RED: el resolvedor de raíz y el helper de Docker se
ejercitan desde una ruta con espacios.

Las filas `Aplicable` de esta tabla MUST pasar a `tasks.md` sin cambios, y sus tests RED se escriben
antes del código correspondiente.

## Migration / Rollout

No migration required: no hay datos, no hay despliegue, no hay remoto (P7, Q4). Entrega `auto-chain`
con cadena `stacked-to-main`. `openapi/*.json`, `package-lock.json` y `CHANGELOG.md` son **generados**:
no cuentan en el presupuesto de ~400 líneas de autoría, pero sí entran en el commit de su unidad de
trabajo (skill §12.9).

Slices propuestos, en orden de dependencia (cada uno es autónomo, verificable y reversible por
separado; el estimado es de líneas de autoría):

| # | Slice | Contenido | Estimado | Reversión |
|---|---|---|---|---|
| S1 | Puerta local | `.githooks/*`, `prepare`, `commitlint.config.js` + su test, `.gitleaks.toml`, `auditoria-excepciones.json`, scripts `secretos`/`commits`/`auditoria` + `herramientas.ts`, `.gitattributes`, `ci:hook` inicial | ~350 | borrar `.githooks/` y la línea `prepare` |
| S2 | Errores y validación | `plataforma/errores` completo, `StandardSchemaValidationPipe` global, fixture de contrato (D3), tests de API4 y API3 | ~380 | quitar `ErroresModule` de `AppModule` y el pipe de `configurarAplicacion` |
| S3 | Documento determinista | `plataforma/documentacion` (construir/filtrar/ordenar/serializar), `scripts/generar-contrato.ts`, `scripts/verificar-deriva-contrato.ts`, `verify` con `contrato:deriva`, regla 11 de fronteras, `scripts/` en el cruise | ~400 | borrar `openapi/` y el paso `contrato:deriva` |
| S4 | `/health` en el contrato y `/docs` | `esquemaRespuestaSalud`, `respuestaDesdeZod`, `@ApiTags('internal')`, `FiltroSaludOperativo`, `setGlobalPrefix`, `DOCS_HABILITADO`, Scalar | ~330 | `DOCS_HABILITADO=false` apaga `/docs` sin desplegar código |
| S5 | Lint y diff del contrato | `.spectral.yaml`, `scripts/comparar-contrato.ts`, política sin base (D11) | ~250 | quitar los dos pasos de `ci` |
| S6 | Workflow y `npm run ci` | `.github/workflows/ci.yml`, `scripts/validar-flujos.ts`, composición final de `ci` | ~180 | borrar `.github/workflows/` |
| S7 | Cierre | `cliff.toml` + `CHANGELOG.md`, `strict_tdd: true`, `coverage_threshold` medido (D15), `CLAUDE.md` §Comandos, skill §1/§2/§7/§10/§11/§12, corrección de la fila 00b | ~220 | una línea por cada valor de configuración |

**Riesgo de tamaño (Q3)**: siete slices y una tarea de verificación de compatibilidad de las
dependencias nuevas caben en el límite de 10 tareas de `openspec/config.yaml` **si `sdd-tasks` mapea
una tarea por slice**. Si el desglose real supera 10, el límite **NO** se amplía: se le propone al
usuario partir en **00b1 (CI: S1, S6, S7-parcial)** y **00b2 (contrato: S2-S5)** (regla 1 de
`docs/fases/README.md`). La verificación de compatibilidad se reparte dentro del primer slice que
instala cada paquete, en vez de gastar una tarea entera como hizo 00a.

## ADRs referenciados

- **ADR-0001** (monolito modular; prohibición de `MOCK_*` y de `process.env` fuera de config; enmienda
  NestJS 12) → D3, D7, D12.
- **ADR-0008** (contrato OpenAPI code-first con Scalar; enmienda de validación nativa) → D1, D2, D4,
  D5, D7. Este diseño **no** contradice nada de ADR-0008; lo extiende en un punto que ADR-0008 dejó
  abierto (cuántos documentos se commitean), y por eso ese punto va a ADR nuevo.
- **ADR-0009** (Testcontainers como infraestructura única de pruebas) → D10: Docker ya es
  prerrequisito, así que usarlo para las herramientas Go no agrega un requisito nuevo.
- ADR-0003, ADR-0006, ADR-0007: sin efecto en esta fase (no hay datos ni endpoints de negocio).

## ADRs propuestos (estado `propuesta`, los acepta el usuario)

1. **ADR-0010 — Documento OpenAPI público e interno**
   (`docs/adr/0010-documento-openapi-publico-e-interno.md`): decisión de D1. Ata a las Fases 04
   (webhook), 09 (kill switch) y 14 (cliente generado).
2. **ADR-0011 — Códigos de error estables y formato RFC 9457**
   (`docs/adr/0011-codigos-de-error-rfc9457.md`): decisión de D5. Ata a todas las fases con
   endpoints (11-14 agregan entradas al catálogo).

Las demás decisiones de este documento (D2-D4, D6-D16) son de alcance 00b, reversibles borrando un
archivo o una línea, y sin contrato que ate a otra fase: siguen el precedente de 00a, donde quince
decisiones vivieron en `design.md` y solo la que cruzaba fases (Testcontainers) se convirtió en ADR.

## Riesgos técnicos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| `@nestjs/swagger` no incluye el prefijo global en `paths` | Media | El documento no cumple API2 | D2: la tarea lo comprueba **antes** de commitear el primer documento; si falla, se fija el prefijo explícitamente |
| `@nestjs/swagger` + zod v4 con `Date` (nestjs/swagger#3672) | Media | La fecha ISO 8601 de API3 no se documenta bien | Test explícito de fecha en el fixture; si falla, el esquema usa `string` con `format: date-time` y se registra la desviación |
| La excepción de `StandardSchemaValidationPipe` no permite clasificar el problema por campo | Media | Detalle de API4 más pobre | D5: se emite `problema: "formato"` para todos y se registra; la prohibición de exponer el valor recibido no se relaja |
| `vite-node` inestable o con API distinta | Media | Todos los scripts de herramienta | D12: fallback ya decidido a `nest build` + `dist/`, con `contrato:deriva` fuera del hook |
| Montaje de volúmenes Docker con rutas de Windows con espacios | Media | `secretos`, `contrato:diff`, `flujos` | D10 + matriz de amenazas: `spawn` con array, raíz por `git rev-parse`, test desde ruta con espacios |
| Hook pre-push más lento que el presupuesto (60 s) | Media | La gente usa `--no-verify` por costumbre | Medición registrada en la tarea del hook; si se pasa, sale `secretos` del hook antes que cualquier otra comprobación |
| Deriva falsa por CRLF en Windows | Media | Build rojo sin causa real | `.gitattributes` con `eol=lf` + detección explícita de "solo fin de línea" en el mensaje del chequeo (D2) |
| El documento público con `paths: {}` hace que las reglas de Spectral no verifiquen nada | Alta (es el estado real) | Falsa sensación de cobertura | D1: Spectral lintea **también** el documento interno; y los tests de contrato afirman las convenciones sobre el documento del fixture |
| oasdiff sin base en el primer PR | Alta | Un verde que parece comparación | D11: línea `SIN BASE DE COMPARACIÓN` en mayúsculas; prohibido imprimir "ok" |
| `gitleaks` o `npm audit` con falsos positivos que bloquean el hook | Media | Fricción diaria | Allowlist y excepciones versionadas con motivo y caducidad (D10, D14) |
| `strict_tdd: true` activado antes de tiempo bloquea las propias tareas | Baja | La fase se traba | Se activa en la tarea de cierre (Approach 5 de la proposal) |
| La fase supera 10 tareas | **Alta** | Partir la fase | Siete slices ya definidos; si `sdd-tasks` pasa de 10, Q3 va al usuario, no se amplía el límite |
| El workflow nunca se ejecuta de verdad (sin remoto) | Alta | El YAML se desincroniza | D8: el YAML solo invoca `npm run ci`; `actionlint` valida su sintaxis; se reverifica el día que el usuario suba el repo (Q4) |

## Open Questions

- [ ] (usuario, **no bloquea**) Q2 — redacción de `err.message` en logs. Este diseño no la necesita
      (D5): el filtro cumple API4 sin registrar el diagnóstico real. Si una tarea concluye que sí lo
      necesita, se detiene y se pregunta; la tabla D9 de 00a no se toca sin decisión del usuario.
- [ ] (usuario, bloquea solo en `sdd-tasks`) Q3 — partir en 00b1/00b2 si el desglose supera 10 tareas.
- [ ] (usuario, **no bloquea**) Q4 — subir el repositorio a GitHub durante esta fase: cambia solo
      dónde se verifica "CI completo en verde".
- [ ] (usuario) Aceptar o no **ADR-0010** y **ADR-0011**. Mientras no se acepten, D1 y D5 se aplican
      como decisiones de diseño de esta fase.
- [ ] (tarea, no bloquea el diseño) Confirmar los cinco puntos **[sin verificar]** de la nota inicial;
      si alguno difiere, se ajusta su decisión y se registra aquí como desviación.
- [ ] (`sdd-spec`) Registrar como delta, no solo como implementación: la exención de `/health` a API4
      (D6), la distinción documento público/interno en API1 y API8 (D1), y el crecimiento de PLT7 de
      cinco a seis comprobaciones (D8).
