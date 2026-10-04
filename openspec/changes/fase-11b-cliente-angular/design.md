# Design: Fase 11b — Cliente Angular: estilo del bot y mensajes fijos

- Change: `fase-11b-cliente-angular` · Fecha: 2026-10-03 · Estado: **aprobada por el dueño (2026-10-04), en curso**
- Proposal: `proposal.md` · Specs: `cliente` (CLT1-CLT9, dominio nuevo), `agente` (AGT23),
  `configuracion-negocio` (CFN1-CFN3), `integracion-continua` (CI10)
- ADRs: [0022](../../../docs/adr/0022-cliente-angular-en-el-repo.md) nuevo (`propuesta`); se apoya en 0008, 0020 y 0021.

## Technical Approach

Dos mitades que se prueban por separado y se unen por el contrato:

```
cliente/ (Angular, puerto 4200)                         API NestJS (puerto local)
┌──────────────────────────────┐   /api/* por proxy    ┌──────────────────────────────────────┐
│ pantallas: login, estilo,    │ ────────────────────▶ │ usuarios (11a): sesión, guardias      │
│ mensajes fijos               │   mismo origen,       │ agente: EstiloController (AGT23)      │
│ cliente HTTP generado ◀──────┼── openapi.json ◀──────│ mensajes-fijos: MensajesFijosCtrl     │
│ interceptor CSRF y 401       │   (ng-openapi-gen)    │   (CFN1, CFN2)                        │
└──────────────────────────────┘                       └──────────────────────────────────────┘
```

El servidor no sabe que existe Angular: expone endpoints de admin normales, documentados en el contrato público. El
cliente no sabe cómo está hecho el servidor: solo usa el código generado desde `openapi/openapi.json`.

## Registro de compatibilidad (lo llena T1)

| Pieza | Candidata | Qué se verifica | Resultado |
|---|---|---|---|
| Angular | versión estable más reciente a la fecha de T1 | `ng new` standalone y zoneless; Node LTS del repo | **Angular 22.2.1** (`@angular/cli` 22.2.1, TypeScript 6.0.3). `ng new --zoneless` genera una app sin Zone.js; `ng build` termina (216 kB iniciales). El CLI pide Node `^22.22.3 \|\| ^24.15.0`: la sesión en la nube trae 22.22.0, así que T1 se corrió con Node 24.21 (el `.nvmrc` de la CI es `24`, cumple). `cliente/package.json` declara `engines.node >=24.15.0` |
| Componentes | PrimeNG compatible con esa versión de Angular | tabla, editor de texto, diálogo de confirmación, mensajes | **PrimeNG 22.1.2** con `@primeuix/themes` 3.0.1 (tema Aura) y `@angular/cdk` 22. Un componente de prueba con `p-table`, `pTextarea`, `p-confirmdialog` y `p-message` renderiza sin Zone.js bajo el runner y compila en producción. **Peso**: tema Aura + PrimeNG en la configuración suben el bundle inicial a ≈ 364 kB (83 kB transferidos); un área cargada en diferido deja el inicial en 451 kB y las pantallas en un archivo aparte de ≈ 700 kB (111 kB transferidos). Con todo en el bundle inicial se pasaba de 1 MB y el build fallaba por el presupuesto por defecto: **T5 fija los presupuestos a propósito** (inicial: aviso 600 kB, error 1 MB) y CLT9 los respeta |
| Runner de tests del cliente | el que trae por defecto esa versión del CLI | corre sin navegador en CI | **Vitest 5.0.3 + jsdom 30** (`ng test --watch=false`), sin navegador. Probado: `HttpTestingController`, `TestBed` zoneless, componentes PrimeNG y un test de tipos con `@ts-expect-error` |
| Generador del cliente HTTP | `ng-openapi-gen` | lee el `openapi.json` real (OpenAPI 3.1) y genera servicios por `operationId` | **`ng-openapi-gen` 1.1.0 funciona**: lee `openapi.json` (3.1) y genera `Api` (`providedIn: 'root'`, `invoke()` devuelve `Promise`) y una función por `operationId` (`iniciarSesion`, `cerrarSesion`, `obtenerSesionActual`). `excludeParameters: ["X-Luxe-Csrf"]` quita el encabezado de los parámetros (D12); con un interceptor, la mutación lo lleva y la lectura no (probado con `HttpTestingController`). **Determinista**: dos corridas dan carpetas idénticas (`diff -r`), así que `cliente:deriva` es viable. **Hallazgo**: reporta «0 models»: los esquemas de respuesta van en línea en el contrato, así que no hay interfaces con nombre; D13 lo resuelve con un tipo auxiliar. No hizo falta la alternativa (`@hey-api/openapi-ts`) |
| Lint | `angular-eslint` | regla de imports prohibidos hacia `../src`, `../scripts`, `../test` (CLT1) | **`angular-eslint` 22.5.0** con ESLint 9.39 y `typescript-eslint` 8.71. `no-restricted-imports` con un patrón regex rechaza `../../../../../src/algo` con el mensaje de CLT1. Tal cual viene, `@angular-eslint/prefer-inject` obliga a `inject()` (se usa en todo el cliente) |
| Fronteras del cliente | `eslint-plugin-boundaries` (o `no-restricted-imports`) | las reglas de D10 con fixtures que las violan (CLT9) | **`eslint-plugin-boundaries` 7.2.0 sirve**, con tres requisitos que se descubrieron probando: (1) un **resolvedor** (`eslint-import-resolver-typescript` con `settings['import/resolver']`); sin él los imports sin extensión quedan sin resolver y ninguna regla actúa, sin avisar; (2) elementos de carpeta con `partialMatch: false` y la regla `boundaries/dependencies` con `policies` (la API `rules`/`mode` está deprecada); (3) para varios tipos, `types: { anyOf: [...] }` (plural). Probado con 5 fixtures que la violan (entre áreas, `nucleo`→área, `compartido`→`nucleo`, `shell`→área, import del servidor) y con los archivos válidos (área→`nucleo`/`compartido`/su propia carpeta, registro→área, `shell`→registro) que pasan sin errores. La configuración verificada está en D10 |

Probado el 2026-10-04 con Node 24.21 en Linux x64, en un proyecto temporal fuera del repo que no se commitea.

Si `ng-openapi-gen` no maneja OpenAPI 3.1, se evalúan `@hey-api/openapi-ts` y `openapi-generator` (generador
`typescript-angular`) y se anota aquí; ADR-0022 se ajusta antes de seguir.

## Architecture Decisions

### D1: endpoints del estilo en `agente`, sobre los casos de uso existentes

**Choice**: `EstiloController` en `agente/interfaz/`, registrado en `EstiloModule` (que ya provee `PublicarEstilo`,
`RestaurarEstilo`, `ListarHistorialEstilo` y `ProveedorEstilo`). El controlador solo traduce: `publicado: false` →
`422 estilo-invalido` con el motivo; versión ausente en el historial → `404 version-estilo-inexistente`. Todas las rutas
con `@Roles('admin')` (11a).
**Alternatives**: un módulo `administracion` que importe `agente` (otra capa sin regla propia).
**Rationale**: el comando de la 08c y la API comparten los mismos casos de uso; cero reglas duplicadas.

`RestaurarEstilo` hoy devuelve el motivo «la versión N no está en el historial» como un `publicado: false` más. Para
distinguir `404` de `422` sin comparar textos, `ResultadoPublicacion` gana un campo `razon: 'invalido' |
'version-inexistente'` (cambio interno, sin efecto en el comando).

### D2: los mensajes fijos se agregan en un módulo nuevo que lee el catálogo de cada dueño

**Choice**: módulo `src/modulos/mensajes-fijos/` con `ListarMensajesFijos`, `GuardarMensajeFijo` y
`SembrarMensajesFijos`. Cada módulo dueño **exporta por su barril** un catálogo de datos puros
`{ clave, descripcion, textoRespaldo }`: `agente` mueve su `TEXTOS_DE_RESPALDO` a `dominio/textos-fijos.ts` y su
repositorio lo sigue usando desde ahí; `conversaciones`, `catalogo` y `llm` hacen lo mismo con su constante. El
respaldo sigue definido en un solo lugar (AGT3).
**Alternatives**: (a) duplicar la lista con los textos en el módulo nuevo (dos fuentes de verdad); (b) un registro en
`plataforma` donde cada módulo se inscribe al arrancar (más maquinaria para una lista fija de diez claves); (c) poner
los endpoints en `agente` (no es dueño de los textos de `conversaciones`, `catalogo` ni `llm`).
**Rationale**: la dependencia va de arriba hacia abajo (`mensajes-fijos` → barriles de los cuatro dueños), sin ciclos
ni reglas de fronteras nuevas; ningún dueño conoce al módulo nuevo.

### D3: escribir en `parametro` desde `mensajes-fijos`

**Choice**: `RepositorioMensajesFijosPrisma` (en `mensajes-fijos/infraestructura/`) lee y escribe solo las claves de la
lista con `upsert` y `actualizado` explícito. Los repositorios de cada dueño ya leen `parametro` en cada uso, sin
caché (verificado: `repositorio-parametro-agente-prisma.ts`, `repositorio-parametro-conversaciones-prisma.ts`,
`repositorio-parametro-prisma.ts` de `catalogo` y `repositorio-parametro-llm-prisma.ts`), así que el cambio rige en el
siguiente mensaje sin invalidar nada.
**Rationale**: `parametro` es una tabla de clave/valor compartida (ADR-0020); varios módulos ya la leen. La lista
cerrada evita que esta vía se vuelva un editor genérico de parámetros.

### D4: validación de un mensaje fijo como función pura

**Choice**: `validarMensajeFijo` en `mensajes-fijos/dominio/`: no vacío, ≤ 1.000 caracteres, sin valores en pesos y
sin `{{...}}` (Q2). Reutiliza la detección de pesos de `compartido/` si existe; si solo existe dentro de
`agente/dominio/validar-estilo.ts`, se mueve a `compartido/texto` en el mismo commit y ambos la usan.
**Rationale**: la misma regla que el estilo (R2: el dinero sale solo del backend), probada sin infraestructura.

### D5: semilla como comando, no como migración

**Choice**: `npm run mensajes:sembrar` (`scripts/sembrar-mensajes-fijos.ts`, registrado en `scripts/cli.ts`) llama a
`SembrarMensajesFijos`, que hace `createMany` con `skipDuplicates` sobre las claves que faltan.
**Alternatives**: una migración de datos (corre una sola vez y mezcla datos del negocio con el esquema).
**Rationale**: mismo patrón que `semilla:geografia`; idempotente y seguro de correr en cualquier entorno.

### D6: el cliente, mismo origen en desarrollo, producción decidida en la 09b

**Choice**: `ng serve` con `proxy.conf.json` que reenvía `/api` a `http://localhost:<PORT>` (el de `.env`). En
producción el cliente se servirá bajo el mismo dominio que la API; cómo (Nest con estáticos o el proxy inverso) se
decide en la 09b (Q1, P55). Ninguna de las dos opciones cambia el código del cliente.
**Rationale**: la cookie `SameSite=Strict` y la ausencia de CORS (11a, D4) exigen un solo origen.

### D7: estructura del cliente por áreas (revisada el 2026-10-04)

El cliente nace con tres pantallas, pero va a recibir el bot configurable (11c), inventario, ventas y envíos (12-14).
La estructura se organiza para ese crecimiento desde el primer commit: la unidad de crecimiento es el **área**, una
carpeta por funcionalidad de negocio con sus propias rutas, cargada en diferido y sin dependencias con otras áreas.

```
cliente/
├── package.json · angular.json · proxy.conf.json · eslint.config.js · ng-openapi-gen.json
└── src/app/
    ├── api/              generado por `npm run cliente:generar`; nadie lo edita (CLT2)
    ├── nucleo/           transversal sin pantallas: SesionServicio (signal con el usuario de /yo), guardias de
    │                     ruta, interceptores (CSRF, 401/403), lectura de problem+json, tipo `DefinicionArea`
    ├── compartido/       piezas de interfaz sin dominio: editor con contador, confirmación, aviso de error del
    │                     servidor, estado vacío o cargando; las usan todas las áreas
    ├── shell/            marco de la app: barra superior, menú lateral armado con las áreas y el rol, inicio, 404
    ├── sesion/           pantalla de inicio de sesión (pública, fuera del shell) (CLT4)
    ├── areas/
    │   ├── registro/     `registro.ts`: lista de áreas, lo único que el shell conoce de ellas
    │   └── bot/          área «Bot» (11b)
    │       ├── area.ts           definición: título, ícono, roles, entradas del menú, cargador diferido
    │       ├── bot.routes.ts     rutas hijas del área
    │       ├── estilo/           pantalla «Estilo del bot» (CLT7)
    │       └── mensajes-fijos/   pantalla «Mensajes fijos» (CLT8)
    ├── app.routes.ts     sesión + shell, con una ruta `loadChildren` por área del registro
    └── app.config.ts     providers: router, HttpClient con interceptores, PrimeNG, zoneless
```

Lo que viene después cabe sin mover nada: la 11c agrega `areas/bot/perfil/` y `areas/bot/escenarios/`; la 12 agrega
`areas/inventario/`; la 13, `areas/ventas/`. Cada una es una carpeta nueva y una línea en `areas/registro/registro.ts`.

Componentes standalone, signals para el estado, sin Zone.js, detección `OnPush`. Nombres de dominio en español,
sufijos de Angular en inglés (`*.component.ts`, `*.service.ts`), igual que en el servidor (skill
`luxeboreal-arquitectura` §8).

### D8: scripts de la raíz que orquestan el cliente

| Script (raíz) | Qué hace |
|---|---|
| `cliente:generar` | `ng-openapi-gen` sobre `openapi/openapi.json` hacia `cliente/src/app/api/` |
| `cliente:deriva` | genera en una carpeta temporal y compara byte a byte con `cliente/src/app/api/` |
| `cliente:ci` | `npm ci`, lint, tests, build y `npm audit` filtrado por `high` dentro de `cliente/`, más `cliente:deriva` |
| `ci` | agrega `npm run cliente:ci` al final; `ci:hook` no cambia (CI10) |

El `eslint.config` de la raíz agrega `cliente/**` a sus ignorados; `.dependency-cruiser.cjs` no cambia (cruza `src` y
`scripts`).

### D9: un área se define con datos y se carga en diferido

**Choice**: cada área exporta en su `area.ts` una `DefinicionArea` (tipo de `nucleo/`):
`{ id, titulo, icono, roles, menu: [{ titulo, ruta, roles }], rutas: () => import('./bot.routes') }`.
`areas/registro/registro.ts` las lista; `app.routes.ts` crea una ruta `loadChildren` por área dentro del shell, protegida por
la guardia de rol con los `roles` del área, y el shell arma el menú con las entradas que el rol de `/yo` puede ver.
**Alternatives**: (a) rutas y menú escritos a mano en el shell (cada área nueva toca el shell y el menú por separado y
se olvidan); (b) módulos federados o micro-frontends (complejidad de equipos grandes, no de un dueño con un cliente).
**Rationale**: agregar un área es una carpeta y una línea; el código de un área solo se descarga cuando alguien entra a
ella, así el arranque no crece con cada fase. El menú y las rutas siguen solo reflejando al servidor (CLT5, API7).

### D10: fronteras del cliente verificadas por lint

**Choice**: `eslint-plugin-boundaries` 7 con `eslint-import-resolver-typescript` (T1 los verificó con fixtures que
violan cada regla). Elementos de carpeta con `partialMatch: false`; la regla `boundaries/dependencies` en `error` con
`default: 'disallow'`:

| Elemento | Carpeta | Puede importar |
|---|---|---|
| `api` (generado) | `api/` | solo `api` |
| `nucleo` | `nucleo/` | `nucleo`, `api` |
| `compartido` | `compartido/` | solo `compartido` (más Angular y PrimeNG) |
| `sesion` | `sesion/` | `sesion`, `nucleo`, `compartido`, `api` |
| `shell` | `shell/` | `shell`, `nucleo`, `compartido`, `registro` |
| `registro` | `areas/registro/` | `nucleo`, las definiciones de las áreas |
| `area` | `areas/<x>/` | `nucleo`, `compartido`, `api` y **su propia carpeta**; nunca otra área |
| cualquier archivo | | nunca `../src`, `../scripts` ni `../test` del servidor (CLT1, `no-restricted-imports`) |

Los archivos de la raíz de `src/app/` (`app.ts`, `app.config.ts`, `app.routes.ts`) no son un elemento: componen la app
y no están restringidos. Configuración verificada (fragmento de `eslint.config.js`):

```js
settings: {
  'import/resolver': { typescript: { project: './tsconfig.json' } },   // sin esto ninguna regla actúa
  'boundaries/include': ['src/app/**/*'],
  'boundaries/elements': [
    { type: 'registro', pattern: 'src/app/areas/registro', partialMatch: false },  // antes que `area`
    { type: 'area', pattern: 'src/app/areas/*', partialMatch: false, capture: ['area'] },
    { type: 'api', pattern: 'src/app/api', partialMatch: false },
    // nucleo, compartido, sesion y shell, igual
  ],
},
rules: {
  'boundaries/dependencies': ['error', { default: 'disallow', policies: [
    { from: { element: { type: 'nucleo' } }, allow: { to: { element: { types: { anyOf: ['nucleo', 'api'] } } } } },
    { from: { element: { type: 'area' } }, allow: { to: { element: { types: { anyOf: ['nucleo', 'compartido', 'api'] } } } } },
    { from: { element: { type: 'area' } },   // su propia carpeta
      allow: { to: { element: { type: 'area', captured: { area: '{{ from.element.captured.area }}' } } } } },
    // el resto, según la tabla
  ] }],
}
```

Si dos áreas necesitan lo mismo, la pieza sube a `compartido/` (si es de interfaz) o a `nucleo/` (si es transversal).
Si un área necesita datos de otro dominio, los pide a la API, como en el servidor: el contrato es la frontera.
**Alternatives**: confiar en la convención (es lo que la estructura plana dejaba abierto); Nx con etiquetas por
librería (exige reorganizar el repo, descartado en ADR-0022); solo `no-restricted-imports` con patrones (no sabe de
«la propia área», habría que repetir una regla por área).
**Rationale**: es el equivalente de `dependency-cruiser` en el servidor; sin una regla que falle, la estructura se
erosiona con la primera prisa.

### D11: estado con signals por área, sin store global

**Choice**: cada pantalla o área tiene su servicio con signals (`signal`, `computed`, `resource`/`httpResource` si la
versión de T1 los trae estables) que envuelve las funciones generadas. `nucleo/` solo guarda la sesión. Los errores
problem+json se leen con una función de `nucleo/` que devuelve `{ codigo, titulo, motivo }` y la pantalla decide qué
mostrar.
**Alternatives**: NgRx o un store global (ceremonia para pantallas de formulario que no comparten estado).
**Rationale**: el estado del back office es casi todo «lo que dijo el servidor»; un store global se reconsidera si una
fase de inventario o ventas comparte estado vivo entre áreas, con su propio ADR.

### D12: el cliente generado no pide el encabezado anti-CSRF

**Choice**: `ng-openapi-gen.json` lleva `"excludeParameters": ["X-Luxe-Csrf"]`; el interceptor de `nucleo/` lo agrega a
toda mutación (CLT6). **Hallazgo previo a T1 (2026-10-04)**: `ng-openapi-gen` 1.1.0 lee el `openapi/openapi.json` real
(OpenAPI 3.1) y genera `iniciarSesion`, `cerrarSesion` y `obtenerSesionActual`; sin esa opción, cada función exigía
`'X-Luxe-Csrf': '1'` como parámetro. T1 lo confirma con la versión de Angular elegida.
**Rationale**: el encabezado es una regla transversal, no un dato de cada pantalla.

### D13: tipos de respuesta derivados del cliente generado

**Choice**: `ng-openapi-gen` entrega 0 modelos con nombre porque el servidor documenta las respuestas con
`respuestaDesdeZod` en línea. `nucleo/tipos.ts` exporta `RespuestaDe<typeof funcionGenerada>`, que extrae el tipo del
cuerpo de la respuesta (probado en T1: un rol fuera de `'admin' | 'asesor'` no compila); cada servicio de pantalla
declara su alias (`type PerfilUsuario = RespuestaDe<typeof obtenerSesionActual>`).
**Alternatives**: registrar esquemas con nombre en `components` desde el servidor (cambia `plataforma/documentacion` y
el contrato público de todas las fases, fuera del alcance de la 11b); interfaces escritas a mano en el cliente (se
desalinean del contrato, que es justo lo que `cliente:deriva` evita).
**Rationale**: los tipos siguen saliendo del contrato; si más adelante el servidor nombra sus esquemas, los alias se
reemplazan por los modelos generados sin tocar las pantallas.

## Módulos tocados

| Módulo | Cambio | Depende de |
|---|---|---|
| `agente` | `EstiloController`; `ResultadoPublicacion.razon`; `TEXTOS_DE_RESPALDO` pasa a `dominio/textos-fijos.ts` y se exporta | barril de `usuarios` (decoradores) |
| `conversaciones`, `catalogo`, `llm` | exportan su catálogo de mensajes fijos (constante movida a `dominio/`) | — |
| `mensajes-fijos` (nuevo) | dominio, casos de uso, repositorio, controlador | barriles de `agente`, `conversaciones`, `catalogo`, `llm`, `usuarios`; `plataforma/prisma` |
| `plataforma/errores` | códigos nuevos | — |
| `AppModule` | importa `MensajesFijosModule` | — |

Regla 13 (`solo-conversaciones-importa-canales`) y regla 15 (`conversaciones-no-conoce-agente`) siguen intactas:
`mensajes-fijos` no importa `canales` y ningún módulo de abajo lo importa a él.

## Endpoints

Todos con `cookieAuth`, `@Roles('admin')`, en el documento **público**, y `X-Luxe-Csrf` en las mutaciones (API11).

| Método y ruta | operationId | Request | Respuesta | Errores |
|---|---|---|---|---|
| `GET /api/v1/agente/estilo` | `obtenerEstilo` | — | `200 { version: int \| null, origen: 'base' \| 'archivo', texto }` | 401, 403 |
| `GET /api/v1/agente/estilo/historial` | `listarHistorialEstilo` | — | `200 { versiones: [{ version, fecha, texto }] }` | 401, 403 |
| `PUT /api/v1/agente/estilo` | `publicarEstilo` | `{ texto: string (1-4000) }` | `200 { version }` | 400, 401, 403, `422 estilo-invalido` |
| `POST /api/v1/agente/estilo/restauraciones` | `restaurarEstilo` | `{ version: int ≥ 1 }` | `200 { version }` | 400, 401, 403, `404 version-estilo-inexistente`, `422 estilo-invalido` |
| `GET /api/v1/mensajes-fijos` | `listarMensajesFijos` | — | `200 { mensajes: [{ clave, descripcion, texto, origen: 'base' \| 'respaldo', actualizado: string \| null }] }` | 401, 403 |
| `PUT /api/v1/mensajes-fijos/{clave}` | `guardarMensajeFijo` | `{ texto: string }` | `200` el mensaje guardado | 400, 401, 403, `404 mensaje-fijo-desconocido`, `422 mensaje-fijo-invalido` |

El esquema de `texto` en `publicarEstilo` acepta hasta 4.000 caracteres para que el `400` cubra solo la forma; la regla
de negocio completa (pesos, SKU, plantillas) responde `422` con su motivo. Lo mismo en `guardarMensajeFijo`.

Códigos nuevos en `CATALOGO_CODIGOS` (ADR-0011):

| Código | Status | Requisito |
|---|---|---|
| `estilo-invalido` | 422 | AGT23 |
| `version-estilo-inexistente` | 404 | AGT23 |
| `mensaje-fijo-invalido` | 422 | CFN2 |
| `mensaje-fijo-desconocido` | 404 | CFN2 |

## Configuración nueva

Ninguna en el servidor. En el cliente, la URL de la API del proxy sale de `proxy.conf.json` (desarrollo); no hay
variables de entorno con secretos en el cliente (CLT1).

## Eventos de dominio

Ninguno. Publicar el estilo ya sube la versión en Redis (AGT19); guardar un mensaje fijo no necesita aviso porque nadie
lo guarda en caché (D3).

## Esquema de datos

Sin cambios: `parametro` (clave/valor) ya existe; la semilla solo inserta filas.

## Testing Strategy

| Nivel | Qué | Escenarios |
|---|---|---|
| Unitario (servidor) | `validarMensajeFijo`, `ListarMensajesFijos`, `GuardarMensajeFijo`, `SembrarMensajesFijos` con fakes | CFN1, CFN2 (validación), CFN3 |
| Integración (servidor) | repositorio de mensajes fijos contra Postgres real; semilla idempotente | CFN2, CFN3 |
| E2E (servidor) | endpoints con sesión real de la 11a: admin, asesor, logs; publicar estilo y ver el prompt del siguiente turno con el LLM guionado | AGT23, CFN1, CFN2 |
| Tests del cliente | componentes y servicios con `HttpTestingController` (sin servidor real) | CLT4-CLT8 |
| Tests del cliente (estructura) | registro de áreas, menú por rol, rutas diferidas | CLT9 |
| Lint / build del cliente | imports prohibidos (servidor y entre áreas); build de producción con un chunk por área | CLT1, CLT9 |
| Scripts | `cliente:deriva` con un contrato alterado | CLT2 |
| `[manual]` | recorrido real en el navegador contra la API local | CLT3 y el criterio de éxito |

## Open Questions

Q1-Q4 de la proposal (P55-P58). Ninguna bloquea: las recomendaciones quedan como defecto.
