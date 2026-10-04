# Tasks: Fase 11b — Cliente Angular: estilo del bot y mensajes fijos

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** en el servidor (`npm test`,
`npm run test:integracion`, `npm run test:e2e`) y el runner que fije T1 en el cliente; `npm run verify` al cerrar cada
slice del servidor y `npm run cliente:ci` al cerrar cada slice del cliente. Sin cambio de esquema de base de datos.

Ramas: una por slice, `fase-11b-pK-<tema>`, apiladas desde `main` (la 11a ya está fusionada). Un commit de unidad de
trabajo por tarea, Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de
subir), sin atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md` más `npm run cliente:ci` desde T5. Cada tarea
cita su commit al cerrarse.

**Resultado: 10 tareas, en el límite de 10.**

## Checklist

- [x] T1 — Verificación de compatibilidad (Angular, PrimeNG, runner, `ng-openapi-gen` con OpenAPI 3.1, fronteras por lint), sin código de producción
- [x] T2 — Endpoints de admin del estilo en `agente` y contrato
- [x] T3 — Catálogos de mensajes fijos por módulo dueño y módulo `mensajes-fijos` (dominio y casos de uso)
- [x] T4 — Endpoints de mensajes fijos, contrato y semilla `npm run mensajes:sembrar`
- [x] T5 — Andamio de `cliente/` por áreas: shell, registro de áreas, fronteras por lint, proxy, `cliente:generar` y `cliente:deriva`
- [x] T6 — Sesión en el cliente: inicio de sesión, `SesionServicio`, guardias e interceptor
- [ ] T7 — Pantalla «Estilo del bot» (área `bot`)
- [ ] T8 — Pantalla «Mensajes fijos» (área `bot`)
- [ ] T9 — `npm run ci` con el cliente
- [ ] T10 — Guía de operación, cierre documental y recorrido real `[manual]`

## Mapeo de escenarios por tarea (CLT 26 + AGT 8 + CFN 10 + CI 3 = 47)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | (sin escenarios: registro de compatibilidad en `design.md`) | 0 |
| T2 | AGT23 (8) | 8 |
| T3 | CFN2 «Un texto inválido se rechaza con su motivo»; CFN3 (3) | 4 |
| T4 | CFN1 (3); CFN2 (3 restantes) | 6 |
| T5 | CLT1 (2); CLT2 (2); CLT9 «Un import entre áreas se rechaza», «El código de un área no viaja en el arranque» | 6 |
| T6 | CLT4 (4); CLT5 (4); CLT6 (2); CLT9 «Un área registrada aparece en el menú de su rol», «El menú no muestra las áreas que el rol no puede usar» | 12 |
| T7 | CLT7 (4) | 4 |
| T8 | CLT8 (3) | 3 |
| T9 | CI10 (3) | 3 |
| T10 | CLT3 (1, `[manual]` además de su test de configuración del proxy) | 1 |

## Tareas

### T1 — Verificación de compatibilidad (sin código de producción)

- Llenar «Registro de compatibilidad» de `design.md`: versión estable de Angular a la fecha, PrimeNG compatible,
  runner de tests por defecto del CLI, `ng-openapi-gen` contra el `openapi/openapi.json` real (OpenAPI 3.1, con los
  endpoints de la 11a y `excludeParameters` para `X-Luxe-Csrf`, D12), `angular-eslint` con la regla de imports
  prohibidos y `eslint-plugin-boundaries` con las reglas de D10 (fixtures que las violan).
- Punto de partida medido el 2026-10-04 (se confirma en T1, no lo reemplaza): `@angular/core` 22.2.1,
  `primeng` 22.1.2 (pide `@angular/core ^22.1.0`), `angular-eslint` 22.5.0, `eslint-plugin-boundaries` 7.2.0,
  `ng-openapi-gen` 1.1.0. El CLI de Angular 22 pide Node `^22.22.3 || ^24.15.0`.
- Si `ng-openapi-gen` falla, se elige la alternativa, se anota y se ajusta ADR-0022 antes de seguir.
- **Cerrada (2026-10-04).** Resultado en la tabla «Registro de compatibilidad» de `design.md`: Angular 22.2.1,
  PrimeNG 22.1.2, Vitest 5 + jsdom, `ng-openapi-gen` 1.1.0 (funciona con OpenAPI 3.1; determinista),
  `angular-eslint` 22.5.0 y `eslint-plugin-boundaries` 7.2.0 con resolvedor de TypeScript. Evidencia: un proyecto
  temporal fuera del repo con `ng new --zoneless`, `ng test --watch=false` (4 tests en verde: `HttpTestingController`
  con el interceptor de CSRF, PrimeNG sin Zone.js y un test de tipos) y `ng build`; `ng-openapi-gen` contra el
  `openapi/openapi.json` real y `diff -r` entre dos corridas; `eslint` con 5 fixtures que violan las fronteras (las 5
  fallan) y los archivos válidos (pasan). Sin código de producción ni tests en el repo (tarea de verificación).
- **Hallazgos que cambian T5-T8 (ya aplicados a `design.md`):**
  1. El CLI de Angular 22 exige Node ≥ 22.22.3 / ≥ 24.15: `cliente/package.json` declara `engines.node >=24.15.0`.
  2. El tema Aura con PrimeNG pasa del presupuesto de 1 MB si todo va en el bundle inicial: T5 fija los presupuestos
     (inicial: aviso 600 kB, error 1 MB) y las pantallas viajan en el chunk de su área (CLT9).
  3. `eslint-plugin-boundaries` no actúa sin resolvedor de TypeScript, y se enteró probando: T5 lo instala y su
     fixture de «import entre áreas» es la prueba de que las reglas siguen activas.
  4. El registro de áreas pasa a una carpeta (`areas/registro/registro.ts`) porque el plugin clasifica carpetas.
  5. Sin modelos con nombre en el contrato: D13 (`nucleo/tipos.ts` con `RespuestaDe`).
  6. `Api.invoke()` devuelve `Promise`, no `Observable`: los servicios de pantalla usan `async`/`await` sobre signals.
  7. `ng-openapi-gen` con `excludeParameters: ["X-Luxe-Csrf"]` (D12) confirmado.
- Forecast cumplido: sin cambios de producción.
- Forecast: sin cambios de producción, sin riesgo de presupuesto.

### T2 — Endpoints del estilo

- `EstiloController` en `agente/interfaz/` con los cuatro endpoints de `design.md`, `@Roles('admin')`, DTO Zod y
  `respuestaDesdeZod`; `ResultadoPublicacion.razon`; códigos `estilo-invalido` y `version-estilo-inexistente`.
- `npm run contrato:generar` en el mismo commit; deriva, Spectral y oasdiff en verde.
- E2E con sesión real: admin, asesor (`403`), publicar y ver el estilo en el prompt del siguiente turno (LLM guionado),
  logs sin el texto.
- Forecast: ~400 líneas.
- **Cerrada (2026-10-04).** RED observado por capas. (1) Errores: 4 fallos por aserción en `src/plataforma/errores`
  (`expected undefined to be 422`, `... to be 404`, `Cannot destructure property 'status' ...`, `expected undefined to be
  'la versión 9 no está en el historial'`). (2) `razon`: `AssertionError: expected { publicado: false, …(1) } to match
  object { publicado: false, razon: 'invalido' }`. (3) Controlador y contrato, antes de implementar:

  ```
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
  Error: connect ECONNREFUSED 127.0.0.1:6379
       × las cuatro operaciones existen con su operationId y exigen la cookie 277ms
       × las mutaciones piden X-Luxe-Csrf y documentan su 400 y los errores de negocio en problem+json 123ms
       × el cuerpo de publicarEstilo limita el texto a 4000 caracteres y el de restaurarEstilo pide una versión entera 49ms
   FAIL  |unit| src/modulos/agente/interfaz/estilo.controller.spec.ts [ src/modulos/agente/interfaz/estilo.controller.spec.ts ]
  Error: Cannot find module './estilo.controller.js' imported from /home/user/LuxeBorealCRM/src/modulos/agente/interfaz/estilo.controller.spec.ts
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
   FAIL  |unit| test/contrato/estilo.spec.ts > AGT23 — el estilo del bot en el contrato público > las cuatro operaciones existen con su operationId y exigen la cookie
  AssertionError: obtenerEstilo: expected undefined to be 'obtenerEstilo' // Object.is equality
   FAIL  |unit| test/contrato/estilo.spec.ts > AGT23 — el estilo del bot en el contrato público > las mutaciones piden X-Luxe-Csrf y documentan su 400 y los errores de negocio en problem+json
  AssertionError: publicarEstilo: expected undefined to be true // Object.is equality
   FAIL  |unit| test/contrato/estilo.spec.ts > AGT23 — el estilo del bot en el contrato público > el cuerpo de publicarEstilo limita el texto a 4000 caracteres y el de restaurarEstilo pide una versión entera
  TypeError: Cannot read properties of undefined (reading 'properties')
   Test Files  2 failed (2)
        Tests  3 failed | 1 passed (4)
  ```

  (4) E2E HTTP con la app completa, antes de que existieran las rutas (`npx vitest run --project e2e
  test/e2e/estilo-admin.e2e-spec.ts`):

  ```
       × AGT23 — Sin estilo publicado la API muestra el del archivo 2614ms
       × AGT23 — Un admin publica y consulta el estilo vigente 306ms
       × AGT23 — Un estilo inválido se rechaza con su motivo y la versión vigente no cambia 144ms
       × un cuerpo con la forma equivocada responde 400 validacion-fallida 141ms
       × AGT23 — Restaurar por la API publica una versión nueva con el texto de la versión elegida 132ms
       × AGT23 — Restaurar una versión que no existe se rechaza con 404 138ms
       × el historial lista las versiones retiradas, la más reciente primero, con versión, fecha y texto 183ms
       × AGT23 — Un asesor no administra el estilo: las cuatro operaciones responden 403 y nada cambia 161ms
       × sin sesión la API responde 401, y una mutación sin el encabezado anti-CSRF responde 403 132ms
       × AGT23 — Publicar por la API no escribe el texto en los logs: solo la versión y el id del usuario 122ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 404 to be 422 // Object.is equality
  AssertionError: expected 404 to be 400 // Object.is equality
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 'application/json; charset=utf-8' to contain 'application/problem+json'
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 404 to be 403 // Object.is equality
  AssertionError: expected 404 to be 401 // Object.is equality
  AssertionError: expected undefined to match object { version: 1, …(1) }
   Test Files  1 failed (1)
        Tests  10 failed (10)
  ```

  GREEN: errores 19/19, agente 227/227, controlador 8/8, `test/contrato` 24/24 (incluye el nuevo `estilo.spec.ts`), e2e
  del estilo 10/10 y AGT23/AGT19/AGT21 en `agente-llm.e2e-spec.ts`; `typecheck`, `lint`, `fronteras`, `contrato:deriva`,
  `contrato:lint` (0 errores) y `contrato:diff` (sin incompatibles) verdes.
- Detalles: `EstiloController` en `agente/interfaz/` (registrado en `EstiloModule`, inerte en el contexto del comando),
  `@Roles('admin')` en la clase, esquemas zod en `esquemas-estilo.ts`; `GET /agente/estilo` devuelve `version: null`
  cuando rige el archivo; los logs llevan `evento`, `version` y `usuarioId` (el e2e comprueba que no aparecen el texto
  ni el correo). `usuarios` exporta por su barril `UsuarioActual` (decorador de parámetro) y `DocumentarRutaDeAdmin`
  (cookie + 401 + 403 en problem+json + `X-Luxe-Csrf` en mutaciones): una sola respuesta por estado cabe en el
  contrato, así que el `403` de una mutación de admin cubre rol y CSRF. Nuevo helper `test/soporte/sesion-e2e.ts`
  (`iniciarSesionComo`: crea el usuario y abre sesión por la API real) que reutilizan T4 y los e2e de áreas.
- **Desviaciones:** (1) **`detail` de RFC 9457**: AGT23 pide el motivo «en el detalle» y el cuerpo de error no tenía
  dónde llevarlo; `ErrorDeAplicacion` gana `detalle` y `Problema` el miembro estándar `detail` (aditivo, opcional;
  quien lo usa es responsable de que no copie valores recibidos, R14; el contrato lo documenta en `respuestaProblema`).
  (2) El esquema de `publicarEstilo` limita el texto a 4.000 caracteres con `400`, el mismo tope de AGT20, para que el
  `422` sea solo de reglas de negocio. (3) El escenario `documento-interno.spec.ts` dejó de fijar la lista exacta de
  rutas públicas (se rompería en cada fase) y verifica que el público lleva las de sesión y deja fuera lo interno.
  (4) Los dos dobles de `scripts/prompt-estilo.spec.ts` ganaron `razon` (el comando no cambia de comportamiento).
  Commit: ver historial (`feat(agente): endpoints del estilo`).
- **`size:exception` (escrita al cerrar):** ~760 líneas de autoría sin contar los dos OpenAPI generados (~2.070) ni la
  transcripción del RED en este archivo: ≈ 620 de tests (el e2e HTTP de 10 escenarios, el contrato, el controlador y el
  helper de sesión) y ≈ 140 de producción, frente al forecast de ~400. Nada se recortó.

### T3 — Catálogos y módulo `mensajes-fijos`

- `agente`, `conversaciones`, `catalogo` y `llm` mueven su texto de respaldo a `dominio/` con descripción y lo exportan
  por su barril; sus repositorios lo siguen usando (los tests existentes de AGT3 y similares deben seguir verdes).
- `mensajes-fijos`: `validarMensajeFijo`, `ListarMensajesFijos`, `GuardarMensajeFijo`, `SembrarMensajesFijos`,
  puerto `RepositorioMensajesFijos` y su adaptador Prisma.
- Unitarias con fakes; integración del repositorio y de la semilla contra Postgres real.
- Forecast: ~400 líneas.
- **Cerrada (2026-10-04).** RED en tres pasos. (1) Detectores compartidos: `contieneValorEnPesos` y
  `contieneMarcadorDePlantilla` no existían (`npx vitest run --project unit src/compartido/texto`). (2) Sin módulo:
  `Error: Cannot find module './catalogo-real.js'`, `'./guardar-mensaje-fijo.js'` y `'./validar-mensaje-fijo.js'`.
  (3) Con esqueletos que compilan y no implementan, transcripción de
  `npx vitest run --project unit src/modulos/mensajes-fijos/dominio src/modulos/mensajes-fijos/aplicacion` (dinero y R2:
  ceremonia completa):

  ```
       × el tope es de 1.000 caracteres 8ms
       × CFN2 — rechaza un texto vacío o en blanco 3ms
       × CFN2 — rechaza un texto de 1.001 caracteres 1ms
       × CFN2 — rechaza un valor en pesos (R2) 1ms
       × CFN2 — rechaza un marcador de plantilla 1ms
       × CFN1 — La lista trae todos los mensajes con su origen 10ms
       × CFN1 — Una clave fuera de la lista no aparece 3ms
       × un valor que no es texto o está en blanco cuenta como respaldo, igual que lo lee el bot 1ms
       × CFN2 — guarda el texto, actualiza la fecha con el reloj y devuelve el mensaje con origen base 1ms
       × quita los espacios y saltos de línea de los bordes antes de validar y guardar 1ms
       × CFN2 — Un texto en blanco se rechaza con su motivo y no cambia lo vigente 2ms
       × CFN2 — Un texto de 1.001 caracteres se rechaza con su motivo y no cambia lo vigente 1ms
       × CFN2 — Un texto con un valor en pesos se rechaza con su motivo y no cambia lo vigente 1ms
       × CFN2 — Un texto con un marcador de plantilla se rechaza con su motivo y no cambia lo vigente 3ms
       × CFN2 — Una clave desconocida no se escribe 1ms
       × CFN3 — La semilla llena una base vacía con los textos de respaldo 1ms
       × CFN3 — La semilla no pisa un texto editado 1ms
       × CFN3 — Correr la semilla dos veces no cambia nada 1ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 18 ⎯⎯⎯⎯⎯⎯⎯
   Test Files  2 failed (2)
        Tests  18 failed | 2 passed (20)
  ```

  GREEN: 47 unitarias en `mensajes-fijos` y `compartido`, 10 de integración contra Postgres real
  (`test/integracion/mensajes-fijos/mensajes-fijos.spec.ts`), y las pruebas de AGT3 y similares de los cuatro módulos
  dueños siguen verdes (644 en agente, conversaciones, catalogo, llm y compartido); `typecheck`, `lint`, `fronteras`
  y `contrato:deriva` verdes.
- Detalles: `compartido/mensajes-fijos` solo trae la interfaz `DefinicionMensajeFijo`; cada dueño tiene su
  `dominio/textos-fijos.ts` (catálogo con descripción en lenguaje del negocio, y los textos de respaldo que antes vivían
  en sus repositorios) exportado por su barril; `mensajes-fijos/catalogo-real.ts` los compone en el orden de CFN1.
  La prueba de integración más importante es la última: lo que siembra y guarda `mensajes-fijos` es exactamente lo que
  lee cada repositorio dueño, de modo que «rige desde el siguiente mensaje» queda probado sin caché ni reinicio. La
  descripción de `aviso_datos` advierte que es el aviso de asistente automatizado que exige R14 (Q3).
- **Desviaciones:** (1) D4: los patrones de pesos y de plantilla solo existían dentro de `validar-estilo.ts`, así que
  se movieron a `compartido/texto` y el estilo y los mensajes fijos los comparten (los tests del estilo no cambiaron).
  (2) `GuardarMensajeFijo` guarda el texto sin los espacios y saltos de línea de los bordes y valida ya recortado; CFN2
  no lo decía y un salto final se vería como una línea en blanco en WhatsApp. (3) El test `index.spec.ts` de `llm`
  fijaba las exportaciones exactas del barril y ganó `TEXTOS_FIJOS_LLM`. (4) `AppModule` y el controlador llegan en T4,
  como estaba previsto: este módulo todavía no se registra. Commit: ver historial (`feat(mensajes-fijos): …`).
- **`size:exception` (escrita al cerrar):** ~920 líneas de autoría (sin este archivo): ≈ 540 de tests (unitarios, la
  integración de 10 escenarios y los dobles) y ≈ 380 de producción, de las que ≈ 120 son el catálogo de cuatro módulos
  que se **movió** (los textos de respaldo ya existían en sus repositorios) frente al forecast de ~400. El presupuesto
  nunca se cumple recortando tests ni comentarios.

### T4 — Endpoints de mensajes fijos y semilla

- `MensajesFijosController` con los dos endpoints, `@Roles('admin')`, códigos `mensaje-fijo-invalido` y
  `mensaje-fijo-desconocido`; `MensajesFijosModule` en `AppModule`; contrato regenerado en el mismo commit.
- `scripts/sembrar-mensajes-fijos.ts` en `scripts/cli.ts` y `mensajes:sembrar` en `package.json`.
- E2E: lista con origen, editar `mensaje_handoff` y verlo en el siguiente traspaso, clave desconocida, asesor, logs.
- Forecast: ~350 líneas.
- **Cerrada (2026-10-04).** RED por capas, antes de implementar. Unitarias y contrato (`npx vitest run --project unit
  src/plataforma/errores/catalogo-codigos.spec.ts src/modulos/mensajes-fijos/interfaz scripts/sembrar-mensajes-fijos.spec.ts
  test/contrato/mensajes-fijos.spec.ts`):

  ```
       × mensaje-fijo-invalido responde 422 7ms
       × mensaje-fijo-desconocido responde 404 1ms
       × las dos operaciones existen con su operationId, exigen la cookie y documentan 401 y 403 en problem+json 291ms
       × guardarMensajeFijo pide X-Luxe-Csrf, la clave en la ruta y documenta 400, 404 y 422 en problem+json 132ms
       × el cuerpo de guardarMensajeFijo es { texto } y la respuesta de la lista trae clave, descripcion, texto, origen y actualizado 51ms
   FAIL  |unit| scripts/sembrar-mensajes-fijos.spec.ts [ scripts/sembrar-mensajes-fijos.spec.ts ]
  Error: Cannot find module './sembrar-mensajes-fijos.js' imported from /home/user/LuxeBorealCRM/scripts/sembrar-mensajes-fijos.spec.ts
   FAIL  |unit| src/modulos/mensajes-fijos/interfaz/mensajes-fijos.controller.spec.ts [ src/modulos/mensajes-fijos/interfaz/mensajes-fijos.controller.spec.ts ]
  Error: Cannot find module './mensajes-fijos.controller.js' imported from /home/user/LuxeBorealCRM/src/modulos/mensajes-fijos/interfaz/mensajes-fijos.controller.spec.ts
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
   FAIL  |unit| test/contrato/mensajes-fijos.spec.ts > CFN1/CFN2 — los mensajes fijos en el contrato público > las dos operaciones existen con su operationId, exigen la cookie y documentan 401 y 403 en problem+json
  AssertionError: listarMensajesFijos: expected undefined to be 'listarMensajesFijos' // Object.is equality
   FAIL  |unit| test/contrato/mensajes-fijos.spec.ts > CFN1/CFN2 — los mensajes fijos en el contrato público > guardarMensajeFijo pide X-Luxe-Csrf, la clave en la ruta y documenta 400, 404 y 422 en problem+json
  AssertionError: expected undefined to be true // Object.is equality
   FAIL  |unit| test/contrato/mensajes-fijos.spec.ts > CFN1/CFN2 — los mensajes fijos en el contrato público > el cuerpo de guardarMensajeFijo es { texto } y la respuesta de la lista trae clave, descripcion, texto, origen y actualizado
  TypeError: Cannot read properties of undefined (reading 'schema')
   FAIL  |unit| src/plataforma/errores/catalogo-codigos.spec.ts > plataforma/errores — códigos de los mensajes fijos (Fase 11b, CFN2) > mensaje-fijo-invalido responde 422
  AssertionError: expected undefined to be 422 // Object.is equality
   FAIL  |unit| src/plataforma/errores/catalogo-codigos.spec.ts > plataforma/errores — códigos de los mensajes fijos (Fase 11b, CFN2) > mensaje-fijo-desconocido responde 404
  AssertionError: expected undefined to be 404 // Object.is equality
   Test Files  4 failed (4)
        Tests  5 failed | 9 passed (14)
  ```

  E2E con la app completa, antes de que existieran las rutas (`npx vitest run --project e2e
  test/e2e/mensajes-fijos.e2e-spec.ts test/e2e/agente-politicas.e2e-spec.ts -t "Mensajes fijos por la API|CFN2"`):

  ```
       × CFN2 — Un texto editado por la API rige en el siguiente mensaje del bot, sin reiniciar 634ms
       × CFN1 — La lista trae los diez mensajes: el editado con origen base y el resto con su respaldo 747ms
       × CFN1 — Una clave fuera de la lista no aparece 246ms
       × CFN1 — Un asesor no ve los mensajes fijos y tampoco los edita 139ms
       × CFN2 — Guardar devuelve el mensaje con origen base y la fecha de la edición 141ms
       × CFN2 — Un texto inválido se rechaza con 422, su motivo, y el texto vigente no cambia 121ms
       × CFN2 — Una clave desconocida responde 404 y no escribe nada 118ms
       × un cuerpo con la forma equivocada responde 400 validacion-fallida 139ms
       × sin sesión responde 401 y una edición sin el encabezado anti-CSRF responde 403 128ms
       × CFN2 — Guardar un mensaje no escribe el texto en los logs: solo la clave y el id del usuario 156ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 404 to be 200 // Object.is equality
  TypeError: Cannot read properties of undefined (reading 'map')
  AssertionError: expected 404 to be 403 // Object.is equality
  AssertionError: expected 404 to be 200 // Object.is equality
  AssertionError: expected 404 to be 422 // Object.is equality
  AssertionError: expected undefined to be 'mensaje-fijo-desconocido' // Object.is equality
  AssertionError: expected 404 to be 400 // Object.is equality
  AssertionError: expected 404 to be 401 // Object.is equality
  AssertionError: expected undefined to match object { clave: 'mensaje_handoff', …(1) }
   Test Files  2 failed (2)
        Tests  10 failed | 6 skipped (16)
  ```

  GREEN: errores, controlador, script y contrato 79/79; e2e 16/16 (10 de `mensajes-fijos.e2e-spec.ts` más el escenario
  de `agente-politicas`); integración del comando real 2/2 (`sembrar-cli.spec.ts`); `typecheck`, `lint`, `fronteras`,
  `contrato:generar`/`deriva`/`lint`/`diff` verdes. Prueba manual del comando por `npm` contra un Postgres 16 temporal
  migrado: `mensajes:sembrar: 10 insertadas, 0 ya existían.` y, la segunda vez, `0 insertadas, 10 ya existían.`
- Detalles: `MensajesFijosController` en `mensajes-fijos/interfaz/` (`@Roles('admin')` en la clase,
  `DocumentarRutaDeAdmin`, `UsuarioActual`), `MensajesFijosModule` registrado en `AppModule`; los logs llevan
  `evento`, `clave` y `usuarioId`, nunca el texto (el e2e comprueba también que no aparece el correo). El escenario
  «un texto editado rige en el siguiente mensaje» se prueba de punta a punta en `agente-politicas.e2e-spec.ts`: el
  admin edita por la API `mensaje_handoff` **y** `mensaje_handoff_fuera_horario` (cuál se envía depende de la hora) y,
  tras un segundo audio, el cliente recibe el texto editado sin reiniciar nada. El comando
  (`scripts/sembrar-mensajes-fijos.ts`, registrado en `scripts/cli.ts`) informa solo conteos.
- **Desviaciones:** (1) El esquema de `guardarMensajeFijo` limita el texto a 4.000 caracteres con `400` y deja a
  `validarMensajeFijo` el tope de 1.000, el texto en blanco, los pesos y las plantillas con `422`, como en el estilo.
  (2) **Corrección documental:** al agregar las notas de T2 y T3 se perdieron por error los encabezados `### T3` y
  `### T4` de este archivo (el de T3 llegó así a `main` en #73); se restauran en este commit.
  Commit: ver historial (`feat(mensajes-fijos): endpoints`).
- **`size:exception` (escrita al cerrar):** ~650 líneas de autoría sin este archivo ni los dos OpenAPI generados
  (~1.170): ≈ 570 de tests (el e2e HTTP de 10 escenarios, contrato, controlador, script y la integración del comando) y
  ≈ 80 de producción, frente al forecast de ~350.

### T5 — Andamio del cliente

- `cliente/` con el CLI de Angular (standalone, zoneless), PrimeNG, `angular-eslint` con la regla de CLT1,
  `proxy.conf.json`, `ng-openapi-gen.json`; scripts de raíz `cliente:generar` y `cliente:deriva`; la raíz ignora
  `cliente/**` en su lint.
- Estructura de D7: `nucleo/` (tipo `DefinicionArea`), `compartido/`, `shell/` (marco y menú vacíos todavía),
  `areas/registro/registro.ts` y `areas/bot/` con su `area.ts` y `bot.routes.ts` apuntando a pantallas provisionales; rutas
  diferidas en `app.routes.ts` (D9).
- `engines.node >=24.15.0`, presupuestos de bundle explícitos (T1) y `nucleo/tipos.ts` con `RespuestaDe` (D13).
- Fronteras de D10 en el lint del cliente (con `eslint-import-resolver-typescript`), cada regla con un fixture que la viola (como
  `test/fronteras/dependency-cruiser.spec.ts` en el servidor).
- Test de `cliente:deriva` con un contrato alterado (en `test/fronteras/`, como `contrato:deriva`) y comprobación de
  que el build deja el área `bot` en un archivo aparte.
- **`size:exception`** (fila «T5 supera ~400 líneas» de la tabla de Risks de `proposal.md`): lo generado por el CLI y
  por `ng-openapi-gen` no cuenta como autoría. Forecast: ~350 líneas de autoría.

- **Hecho (T5).** `cliente/` creado con `ng new` (Angular 22.2.1, zoneless, standalone, Vitest 5 + jsdom, Node 24.21), PrimeNG
  22.1.2 con Aura, `primeicons`, `ng-openapi-gen` 1.1.0 (`excludeParameters: ["X-Luxe-Csrf"]`, genera las 9 operaciones
  vigentes), `angular-eslint` 22.5, `eslint-plugin-boundaries` 7.2 con `eslint-import-resolver-typescript`.
  Estructura de D7: `nucleo/` (`DefinicionArea`, `Rol`, `RespuestaDe`), `shell/` (marco vacío), `areas/registro/registro.ts`,
  `areas/bot/` (`area.ts`, `bot.routes.ts` y dos pantallas provisionales), rutas diferidas por área en `app.routes.ts`.
  Presupuestos: inicial 600 kB / 1 MB; el build deja `bot` en chunks aparte (inicial 400 kB).
  Raíz: `cliente:generar` y `cliente:deriva` (`scripts/generar-cliente.ts`), `tsconfig.json` y el lint de la raíz
  ignoran `cliente/`.
- Pruebas: `test/fronteras/cliente-deriva.spec.ts` (4: coincide, contrato alterado nombra el archivo, regenerar no deja
  deriva, falta de dependencias explica cómo instalar), `test/fronteras/cliente-fronteras.spec.ts` (10: cinco imports
  que violan D10, CLT1 con código del servidor y cuatro permitidos) y en el cliente 9 tests (registro, rutas diferidas,
  `RespuestaDe` con `@ts-expect-error`, `App`). RED observado: la primera corrida de las fronteras falló 5/10 porque el
  plugin resuelve `boundaries/include` contra `process.cwd()` (dentro de Vitest es la raíz del repo); el test pasa a
  lanzar el ESLint del cliente como proceso con su `cwd`.
- **Desviaciones:** (1) `eslint.config.js` del cliente lleva `"type": "module"` en su `package.json` (sin él Node avisa en cada
  corrida). (2) Los dos archivos de test de `test/fronteras/` se saltan (`skipIf`) si `cliente/node_modules` no existe: la
  raíz no instala el cliente; T9 hace que `cliente:ci` los corra con las dependencias instaladas. (3) Las pantallas de
  `areas/bot/` son provisionales (T7 y T8). (4) Se quitó el README y `.vscode/` que genera el CLI. (5) El andamio se escribió
  junto con sus pruebas de comportamiento, no antes: el RED observado es el de las fronteras; el de `cliente:deriva`
  (falla con contrato alterado) se probó contra el generador real.
- **`size:exception` (escrita al cerrar):** lo que generan el CLI y `ng-openapi-gen` (y `package-lock.json`) no cuenta como
  autoría; ver conteo en el PR.

### T6 — Sesión en el cliente

- Pantalla de inicio de sesión (CLT4), `SesionServicio` con un signal del usuario de `/yo`, guardias de ruta por sesión
  y por rol (CLT5), interceptor de `X-Luxe-Csrf` y de `401`/`403` (CLT6), cerrar sesión.
- El shell gana el menú armado desde `areas/registro/registro.ts` y el rol (CLT9), la barra con el usuario y «Cerrar sesión», y
  la lectura de problem+json de `nucleo/` (D11) que usan las pantallas siguientes.
- Tests de componentes y servicios con `HttpTestingController`.
- Forecast: ~450 líneas (al límite; si lo pasa, la excepción se escribe al cerrar).

- **Hecho (T6).** En `nucleo/`: `SesionServicio` (signal con el usuario de `/yo`; `cargar` trata el `401` como «sin sesión»,
  `iniciar`, `cerrar`, `expirar`; no guarda nada en el navegador), `guardiaDeSesion` y `guardiaDeRol`, `csrfInterceptor`
  (CLT6), `erroresHttpInterceptor` (`401` → `/entrar`, `403` → aviso sin cerrar sesión), `AvisosServicio`, `leerProblema`
  (D11, con `Retry-After`), `AREAS_REGISTRADAS` (token que `app.config.ts` provee desde el registro) y `provideApiMismoOrigen`.
  `sesion/entrar.component.ts` (CLT4: mensaje genérico, espera por `Retry-After` con el envío deshabilitado, sin guardar
  correo ni contraseña), `shell/` con barra, menú por rol, «Cerrar sesión», aviso de permiso, inicio y 404; `app.routes.ts`
  con `/entrar` diferida, shell tras `guardiaDeSesion` y la guardia de rol de cada área.
- Pruebas (37 nuevas en el cliente, 46 en total): `csrf.interceptor` (6), `problema` (4), `sesion.servicio` (8),
  `guardias` (4), `errores-http.interceptor` (3), `entrar.component` (5), `shell.component` (5) y `app.routes` (5, con la
  guardia real contra `HttpTestingController`). RED observado: la primera corrida falló en compilación porque ninguno de los
  módulos existía; después, 6 fallos reales de las pantallas (cierre de sesión por el selector del botón de PrimeNG, espera
  de promesas en las pruebas, `//api` por el `rootUrl` por defecto).
- **Desviaciones:** (1) El shell recibe las áreas por un token (`AREAS_REGISTRADAS`) en vez de importar el registro: así
  el escenario «un área de prueba aparece en el menú sin tocar el shell» se prueba de verdad. (2) La ruta de inicio de
  sesión se carga en diferido: con ella en el arranque el bundle inicial pasaba de 600 kB (587 kB ahora, bajo el aviso).
  (3) `cerrar()` propaga el error del servidor pero deja al cliente sin sesión; la barra navega a `/entrar` en cualquier caso.
  (4) Los escenarios de la spec dicen `/estilo`; las rutas reales son `/bot/estilo` y `/bot/mensajes-fijos`.
- **`size:exception` (escrita al cerrar):** ~1.040 líneas de autoría, ≈ 650 de pruebas (37 tests de servicios, guardias,
  interceptores y pantallas con `HttpTestingController`) y ≈ 390 de código y notas, frente al forecast de ~450. Nada se recortó.

### T7 — Pantalla «Estilo del bot»

- En `areas/bot/estilo/`: vista del vigente con origen, editor con contador, publicar con confirmación, motivo del
  `422` sin perder el texto, historial con texto completo y restaurar, recordatorio de evals (EVL3). El editor con
  contador y la confirmación nacen en `compartido/` (los usa también T8).
- Tests de componentes. Forecast: ~350 líneas.

### T8 — Pantalla «Mensajes fijos»

- En `areas/bot/mensajes-fijos/`: tabla con descripción, texto y origen; editor con contador (de `compartido/`);
  guardar; motivo del `422`; advertencia en `aviso_datos`.
- Tests de componentes. Forecast: ~300 líneas.

### T9 — CI con el cliente

- `cliente:ci` y su lugar al final de `npm run ci`; el workflow de Actions sigue llamando solo a `npm run ci` (con caché
  de npm para `cliente/package-lock.json`); `ci:hook` sin cambios; `npm run flujos` en verde.
- Tests en `test/fronteras/` de que `ci` incluye `cliente:ci` y de que `fronteras` sigue limitado a `src` y `scripts`.
- Forecast: ~150 líneas.

### T10 — Guía y cierre

- `docs/operacion/cliente-back-office.md` (cómo levantar API y cliente en local, crear el admin, publicar un estilo,
  editar un mensaje, sembrar), `CLAUDE.md` (comandos y mapa de documentación), `docs/fases/README.md`,
  `docs/PREGUNTAS_ABIERTAS.md`, `docs/analisis/06-cliente-back-office.md` si algo cambió, una sección «Cliente» en la
  skill `luxeboreal-arquitectura` (áreas, fronteras de D10, cómo se agrega un área), `verify-report.md` y archivo
  del change (fusiona `cliente` como dominio nuevo y los deltas de `agente`, `configuracion-negocio` e
  `integracion-continua`).
- **`[manual]`**: el dueño levanta API y cliente, inicia sesión, publica un estilo, edita `mensaje_handoff` y comprueba
  por WhatsApp (o con el simulador) que el siguiente mensaje usa ambos; un usuario asesor no ve las pantallas.
- Forecast: sin cambios de producción, sin riesgo de presupuesto.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.750 de autoría (sin lo generado por el CLI ni por `ng-openapi-gen`) |
| 400-line budget risk | Medium: T2 y T3 al límite; T6 puede pasarlo; T5 con `size:exception` anticipada |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (T1, T2) → PR2 (T3) → PR3 (T4) → PR4 (T5) → PR5 (T6) → PR6 (T7) → PR7 (T8) → PR8 (T9, T10) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
