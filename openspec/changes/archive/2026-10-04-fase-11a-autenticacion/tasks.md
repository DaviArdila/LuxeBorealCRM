# Tasks: Fase 11a — Usuarios y autenticación

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10). Toca seguridad, así que ninguna tarea de producción usa la ceremonia reducida.

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** (`npm test`, `npm run test:integracion`,
`npm run test:e2e`); `npm run verify` al cerrar cada slice. Sin cambio de esquema de base de datos.

Ramas: una por slice, `fase-11a-pK-<tema>`, apiladas desde `main` (`stacked-to-main`, ver «Suggested split»). Un
commit de unidad de trabajo por tarea, Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres:
`npm run commits` antes de subir), sin atribución de IA. Antes de cada push, la batería completa de `CLAUDE.md`. Cada tarea cita su commit al cerrarse.

**Resultado: 8 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Verificación de compatibilidad (argon2, cookies, `cookieAuth`, consola sin eco), sin código de producción
- [x] T2 — Dominio, configuración y códigos de error del módulo `usuarios`
- [x] T3 — Adaptadores: `RepositorioUsuarioPrisma`, `HasheadorArgon2`, `AlmacenSesionesRedis`, `LimiteIntentosRedis`
- [x] T4 — Casos de uso `IniciarSesion`, `CerrarSesion`, `ObtenerSesionActual`
- [x] T5 — Guardias globales (`GuardiaCsrf`, `GuardiaSesion`, `GuardiaRoles`) y decoradores
- [x] T6 — `AuthController`, cookie, contrato con `cookieAuth` y e2e
- [x] T7 — Comando `npm run usuario:crear`
- [x] T8 — Guía de operación, cierre documental y prueba real `[manual]` (queda pendiente solo la parte `[manual]`)

## Mapeo de escenarios por tarea (USR 37 + API 5 = 42)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | (sin escenarios: registro de compatibilidad en `design.md`) | 0 |
| T2 | (dominio puro y configuración; sus tests no son escenarios de la spec) | 0 |
| T3 | USR3 «La sesión no guarda datos personales»; USR8 «El contador no guarda el correo en claro» | 2 |
| T4 | USR1 (6); USR3 «Una sesión vence al llegar a su duración máxima»; USR8 (3 restantes) | 10 |
| T5 | USR3 «La actividad renueva el vencimiento», «Una sesión inactiva vence»; USR6 (4: sin sesión, asesor, desactivado, cambio de rol); USR7 (3) | 9 |
| T6 | USR2 (3); USR4 (3); USR5 (2); USR6 (2: webhook, health); USR9 (2); API7 (2); API11 (3) | 17 |
| T7 | USR10 (4) | 4 |
| T8 | Guía y cierre | 0 |

## Tareas

### T1 — Verificación de compatibilidad (sin código de producción)

- Llenar la tabla «Registro de compatibilidad» de `design.md` con las versiones reales: librería de argon2 (instala
  sin compilar en Windows y en el runner Linux; `hash`/`verify` argon2id con los parámetros de OWASP), lectura y
  escritura de cookies con Express 5 y `@nestjs/platform-express` 12 sin romper `rawBody`, `addCookieAuth` y
  `security: []` en `@nestjs/swagger` 12, y lectura de contraseña sin eco en PowerShell y bash.
- Prueba en una rama descartable o en un script temporal fuera de `src/`; nada de eso se commitea salvo la tabla.
- Si una candidata falla, se anota la alternativa elegida; si ninguna sirve, se detiene la fase y se avisa al dueño.
- Forecast: sin cambios de producción, sin riesgo de presupuesto.
- **Cerrada (2026-10-04).** Resultado en la tabla «Registro de compatibilidad» de `design.md`: `@node-rs/argon2`
  2.2.1, `cookie` 2.0.1 (`parseCookie` en la guardia), `res.cookie`/`clearCookie` de Express 5.2.1,
  `@ApiOperation({ security: [] })` para las rutas públicas (`@ApiSecurity({})` da `[{}]`) y `node:readline`
  silenciado. Evidencia: script temporal de argon2 y un spec temporal de Nest con `OPCIONES_APLICACION`
  (`rawBody` intacto, `Set-Cookie` con los atributos, `401` sin cookie, `security` del documento), ambos borrados;
  lectura sin eco con `script -qc` en bash. Desviación: PowerShell no está en la nube, pasa a la prueba `[manual]`
  de T8. Sin código de producción ni tests (tarea de verificación). Commit: ver historial (`docs(fase-11a)`).

### T2 — Dominio, configuración y códigos de error

- `usuarios/dominio/`: `Rol`, `normalizarEmail`, `validarContrasenaNueva`, `sesionVencida`, `generarIdSesion` (en
  `infraestructura` si depende de `node:crypto`).
- `plataforma/config`: `SESION_INACTIVIDAD_MIN`, `SESION_DURACION_MAX_H`, `AUTH_INTENTOS_MAX`, `AUTH_VENTANA_MIN`
  con sus reglas (incluida «duración máxima ≥ inactividad») y `.env.example`.
- `plataforma/errores`: los cinco códigos nuevos con su requisito en el comentario.
- `plataforma/observabilidad`: `req.headers.cookie` y `res.headers["set-cookie"]` en la redacción de pino.
- RED: pruebas del dominio y del esquema Zod. Forecast: ~250 líneas (60 % tests).
- **Cerrada (2026-10-04).** RED observado con `npx vitest run --project unit src/modulos/usuarios
  src/plataforma/errores/catalogo-codigos.spec.ts`: 4 archivos con `Error: Cannot find module './usuario.js'`
  (y `./contrasena.js`, `./sesion.js`, `./generar-id-sesion.js`) y 6 tests de `catalogo-codigos.spec.ts` con
  `AssertionError: expected undefined to be 401` (403, 429). Config: 3 tests con `expected undefined to be 720`,
  `expected [] to include 'SESION_INACTIVIDAD_MIN'` y `expected [] to deeply equal [ 'SESION_DURACION_MAX_H' ]`.
  GREEN: `npm test` (170 archivos, 1267 tests), `typecheck`, `lint`, `fronteras` y `contrato:deriva` en verde.
- Desviaciones: (1) la redacción de `req.headers.cookie` y `res.headers["set-cookie"]` **ya existía** desde la
  00a; el test `USR9 — Los logs de una petición no contienen la cookie` pasó en verde a la primera y queda como
  regresión. (2) `validarContrasenaNueva` también rechaza más de 200 caracteres (motivo `larga`), el mismo tope
  del inicio de sesión: si no, se podría crear una contraseña que nunca serviría para entrar. (3) `generarIdSesion`
  vive en `infraestructura/` (usa `node:crypto`). (4) Las cuatro variables nuevas entran a las ~40
  configuraciones literales de los tests con el bloque `CONFIGURACION_AUTH_DE_PRUEBA`
  (`test/soporte/configuracion-auth-de-prueba.ts`), como ya se hacía con las de LLM. Commit: ver historial
  (`feat(usuarios): dominio`).

### T3 — Adaptadores

- Puertos y tokens de `design.md`; `RepositorioUsuarioPrisma`, `HasheadorArgon2` (con hash ficticio al arrancar),
  `AlmacenSesionesRedis` (`SET EX`, `GET` + `EXPIRE`, `DEL`), `LimiteIntentosRedis` (`INCR` + `EXPIRE NX`, clave con
  SHA-256 del correo).
- Integración con Postgres y Redis reales (Testcontainers, base por worker).
- Forecast: ~350 líneas.
- **Cerrada (2026-10-04).** RED observado con `npx vitest run --project integracion test/integracion/usuarios`:
  `Error: Cannot find module '../../../src/modulos/usuarios/infraestructura/redis/almacen-sesiones-redis.js'`.
  GREEN: 19 tests de `test/integracion/usuarios/adaptadores-usuarios.spec.ts` (incluye `USR3 — La sesión no guarda
  datos personales` y `USR8 — El contador no guarda el correo en claro`); `typecheck`, `lint` y `fronteras` verdes.
- Desviaciones: (1) `LimiteIntentos` pasa a `consumirIntento` + `reiniciar` (atómico, «Desviación en T3» de D5 en
  `design.md`). (2) Renovar una sesión reescribe la última actividad con `SET … EX … XX` en vez de solo `EXPIRE`,
  para que USR3 guarde de verdad la última actividad y una sesión borrada a la vez no resucite. (3) Un id de sesión
  que no tiene la forma de 43 caracteres base64url no se consulta en Redis. (4) `@node-rs/argon2` agregado con
  npm 11 (`npx npm@11`): npm 10 reescribía el lockfile. Commit: ver historial (`feat(usuarios): adaptadores`).
- **`size:exception` (escrita al cerrar, no anticipada):** ~570 líneas de autoría sin contar el lockfile (268 de
  ellas el test de integración de los cuatro adaptadores, ~250 de producción) frente al forecast de ~350. Los
  cuatro adaptadores son independientes, pero partirlos rompería «un commit por tarea»; se deja como un PR (p2)
  con esta excepción en vez de recortar tests.

### T4 — Casos de uso

- `IniciarSesion` (límite → buscar → verificar o verificar ficticio → crear sesión → `registrarAcceso` con el
  `Clock`), `CerrarSesion`, `ObtenerSesionActual` (aplica duración máxima, lee usuario de la base).
- Unitarias con puertos falsos y `ClockFalso`; transcripción completa de RED (seguridad).
- Forecast: ~350 líneas.
- **Cerrada (2026-10-04).** RED en dos pasos. (1) Sin implementación: `Error: Cannot find module
  './iniciar-sesion.js'` (y `./obtener-sesion-actual.js`, `./cerrar-sesion.js`). (2) Con esqueletos que compilan y
  devuelven `{ resultado: 'sin-implementar' }`, transcripción completa de
  `npx vitest run --project unit src/modulos/usuarios/aplicacion`:

  ```
       × borra la sesión indicada y deja las demás 32ms
       × una sesión vigente devuelve el usuario leído de la base y renueva la última actividad 13ms
       × USR3 — Una sesión vence al llegar a su duración máxima 1ms
       × sin id de sesión o con una sesión desconocida da null 1ms
       × un usuario desactivado o borrado invalida la sesión y la borra (D2) 1ms
       × el rol sale de la base, no de la sesión: un cambio de rol se ve en la siguiente lectura 2ms
       × USR1 — Credenciales válidas abren la sesión 11ms
       × USR1 — El correo se compara sin distinguir mayúsculas 2ms
       × USR1 — Una contraseña incorrecta se rechaza sin decir por qué 1ms
       × USR1 — Un correo inexistente responde igual que una contraseña incorrecta 2ms
       × USR1 — Un usuario inactivo no inicia sesión 1ms
       × USR1 — El último acceso se registra con el reloj inyectado 1ms
       × USR8 — El sexto intento fallido se bloquea 1ms
       × USR8 — Pasada la ventana se puede volver a intentar 1ms
       × USR8 — Un éxito reinicia el contador 1ms
       × el límite cuenta por el correo normalizado: cambiar mayúsculas no da intentos nuevos 1ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 16 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected [ 'sesion-a', 'sesion-b' ] to deeply equal [ 'sesion-b' ]
  AssertionError: expected { resultado: 'sin-implementar' } to deeply equal { resultado: 'sesion-abierta', …(2) }
  AssertionError: expected 'sin-implementar' to be 'sesion-abierta' // Object.is equality
  AssertionError: expected { resultado: 'sin-implementar' } to deeply equal { resultado: 'credenciales-invalidas' }
  AssertionError: expected [] to deeply equal [ 'clave-de-prueba-123' ]
  AssertionError: expected { resultado: 'sin-implementar' } to deeply equal { resultado: 'credenciales-invalidas' }
  AssertionError: expected [] to deeply equal [ { …(2) } ]
  AssertionError: expected 'sin-implementar' to be 'demasiados-intentos' // Object.is equality
  AssertionError: expected 'sin-implementar' to be 'sesion-abierta' // Object.is equality
  AssertionError: expected 'sin-implementar' to be 'sesion-abierta' // Object.is equality
  AssertionError: expected 'sin-implementar' to be 'demasiados-intentos' // Object.is equality
  AssertionError: expected { rol: 'sin-implementar' } to deeply equal { …(4) }
  AssertionError: expected { rol: 'sin-implementar' } to be null
  AssertionError: expected { rol: 'sin-implementar' } to be null
  AssertionError: expected { rol: 'sin-implementar' } to be null
  AssertionError: expected 'sin-implementar' to be 'admin' // Object.is equality
   Test Files  3 failed (3)
        Tests  16 failed | 2 passed (18)
  ```

  Los dos que pasan con el esqueleto son los de «no hace nada» («un inicio de sesión fallido no registra acceso» y
  «sin sesión o con una sesión que ya no existe no falla»); se quedan porque fijan ese comportamiento. GREEN: 35
  tests en `src/modulos/usuarios`; `npm test` (173 archivos, 1285 tests), `typecheck`, `lint` y `fronteras` verdes.
- Detalles: el usuario inactivo también verifica la contraseña (el tiempo no lo distingue de uno activo); el límite
  cuenta por el correo normalizado; un éxito llama a `reiniciar` después de crear la sesión; el log de éxito solo
  lleva el id del usuario (USR9). Fakes nuevos en `test/fakes/`: `RepositorioUsuarioEnMemoria`,
  `AlmacenSesionesEnMemoria`, `HasheadorContrasenaFalso`, `LimiteIntentosEnMemoria` (con la ventana del `ClockFalso`).
  Commit: ver historial (`feat(usuarios): casos de uso`).
- **`size:exception` (escrita al cerrar):** ~580 líneas, de ellas ~140 de producción, ~300 de tests unitarios, ~130
  de fakes reutilizables (T5 y T6 los usan) y ~40 de la transcripción del RED en este archivo. Se deja como un PR
  (p3) en vez de recortar tests.

### T5 — Guardias y decoradores

- `GuardiaCsrf`, `GuardiaSesion`, `GuardiaRoles` como `APP_GUARD` en `UsuariosModule`; `@Publico()`, `@SinCsrf()`,
  `@Roles()`; rutas fuera de `/api/v1` quedan fuera de la guardia de sesión (D3).
- El webhook de Chatwoot gana `@Publico()` y `@SinCsrf()` en este mismo commit (si no, el e2e del webhook falla).
- Integración con un controlador *fixture* en `test/integracion/` que expone una ruta abierta, una protegida y una
  de admin.
- Forecast: ~400 líneas.
- **Cerrada (2026-10-04).** RED en dos pasos con `npx vitest run --project integracion
  test/integracion/usuarios/guardias.spec.ts`. (1) Sin el barril: `Error: Cannot find module
  '../../../src/modulos/usuarios/index.js'`. (2) Con decoradores, barril y `UsuariosModule` pero **sin** registrar las
  guardias como `APP_GUARD` (tras corregir el propio test, que no llamaba a `asegurarConexion` antes de sembrar en
  Redis):

  ```
       × USR6 — Una ruta protegida sin sesión se rechaza 114ms
       × una cookie con un id desconocido se rechaza igual que sin cookie 31ms
       × USR3 — La actividad renueva el vencimiento 235ms
       × USR3 — Una sesión inactiva vence 79ms
       × una sesión creada hace más de SESION_DURACION_MAX_H horas se rechaza y se borra 55ms
       × USR6 — Un asesor no entra a una ruta de admin 47ms
       × USR6 — Un usuario desactivado pierde el acceso en su siguiente petición 59ms
       × USR6 — Un cambio de rol aplica sin volver a iniciar sesión 48ms
       × USR7 — Una mutación sin el encabezado se rechaza 40ms
       × USR7 — El inicio de sesión exige el encabezado 36ms
       × el encabezado anti-CSRF debe valer 1 26ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 11 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected 200 to be 401 // Object.is equality
  AssertionError: expected 200 to be 401 // Object.is equality
  AssertionError: expected 1200 to be greater than 43195
  AssertionError: expected 200 to be 401 // Object.is equality
  AssertionError: expected 200 to be 401 // Object.is equality
  AssertionError: expected 200 to be 403 // Object.is equality
  AssertionError: expected 200 to be 401 // Object.is equality
  AssertionError: expected 200 to be 403 // Object.is equality
  AssertionError: expected 204 to be 403 // Object.is equality
  AssertionError: expected 200 to be 403 // Object.is equality
  AssertionError: expected 200 to be 403 // Object.is equality
   Test Files  1 failed (1)
        Tests  11 failed | 4 passed (15)
  ```

  Los 4 que pasan sin guardias son los de «deja pasar» (ruta `@Publico()`, admin en ruta de admin, mutación con
  encabezado, lectura sin encabezado). GREEN: 34 tests en `test/integracion/usuarios`; `test/contrato` 15/15;
  `typecheck`, `lint`, `fronteras` y `contrato:deriva` verdes.
- Detalles: `GuardiaSesion` lee la cookie con `parseCookie` (paquete `cookie` 2, agregado con npm 11) y delega en
  `ObtenerSesionActual`; deja el perfil en `solicitud.usuario`. Las rutas fuera de `/api/v1` no pasan por las
  guardias de sesión ni de CSRF (D3). El webhook gana `@Publico()` y `@SinCsrf()` y `AppModule` importa
  `UsuariosModule`. **Desviación:** el controlador *fixture* de `test/contrato/` también gana `@Publico()` y
  `@SinCsrf()`: sus 7 tests (API2-API4) miden la validación y los errores, no la autenticación, y sin eso respondían
  401/403 antes del pipe. Commit: ver historial (`feat(usuarios): guardias`).
- **`size:exception` (escrita al cerrar):** ~540 líneas, de ellas ~250 del test de integración con su controlador
  *fixture*, ~200 de producción y ~40 de la transcripción del RED; el forecast ya marcaba T5 «al límite».

### T6 — Controlador, cookie, contrato y e2e

- `AuthController` con los tres endpoints de `design.md`, DTO Zod, `respuestaDesdeZod`, `Set-Cookie` y
  `clearCookie`; `addCookieAuth('luxe_sesion')` en `plataforma/documentacion`.
- `npm run contrato:generar` en el mismo commit; `contrato:deriva`, `contrato:lint` y `contrato:diff` en verde.
- E2E en `test/e2e/autenticacion.e2e-spec.ts`: recorrido completo, atributos de la cookie por `NODE_ENV`, webhook y
  `/health` sin cookie, logs capturados sin correo ni cookie.
- **`size:exception`** (fila «T6 supera ~400 líneas» de la tabla de Risks de `proposal.md`): controlador, contrato
  regenerado y e2e van juntos. Forecast: ~500 líneas (≈ 60 % tests y contrato generado).
- **Cerrada (2026-10-04).** RED con los tests nuevos y sin controlador. Contrato
  (`npx vitest run --project unit test/contrato/autenticacion.spec.ts`):

  ```
       × API11 — El documento público declara `cookieAuth` 295ms
       × API11 — Una operación protegida exige la cookie en el contrato 127ms
       × API11 — El inicio de sesión es público en el contrato 51ms
       × toda operación de /api/v1 declara su seguridad, y toda mutación salvo el webhook exige X-Luxe-Csrf 117ms
       × las respuestas 401 y 403 de las operaciones protegidas van en problem+json 50ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected undefined to deeply equal { type: 'apiKey', in: 'cookie', …(1) }
  AssertionError: expected undefined to be 'obtenerSesionActual' // Object.is equality
  AssertionError: expected undefined to be 'iniciarSesion' // Object.is equality
  AssertionError: expected 1 to be greater than or equal to 4
  AssertionError: expected 0 to be greater than 0
        Tests  5 failed (5)
  ```

  E2E (`npx vitest run --project e2e test/e2e/autenticacion.e2e-spec.ts`):

  ```
       × inicia sesión, consulta la sesión actual y la cierra: recorrido completo 2520ms
       × una contraseña incorrecta responde 401 credenciales-invalidas en problem+json y sin cookie 159ms
       × el intento que pasa el límite responde 429 demasiados-intentos con Retry-After 179ms
       × un cuerpo sin correo válido responde 400 validacion-fallida sin repetir el valor 86ms
       × USR2 — La cookie lleva los atributos de seguridad 3ms
       × USR2 — En desarrollo la cookie no exige HTTPS 217ms
       × USR2 — La cookie solo contiene el identificador de la sesión 93ms
       × USR4 — Cerrar sesión borra la clave y vacía la cookie 108ms
       × USR4 — La cookie de una sesión cerrada ya no sirve 94ms
       × USR4 — Cerrar sesión sin sesión también responde 204 74ms
       × USR5 — La sesión válida devuelve el usuario 94ms
       × USR5 — Sin sesión la consulta se rechaza 80ms
       × USR6 — El webhook de Chatwoot sigue respondiendo sin cookie 99ms
       × API7 — Rol insuficiente rechazado en el servidor 111ms
       × USR9 — Un inicio de sesión fallido no escribe el correo en los logs 88ms
       × USR9 — Los logs de una petición no contienen la cookie 87ms
  ⎯⎯⎯⎯⎯⎯ Failed Tests 16 ⎯⎯⎯⎯⎯⎯⎯
  Error: la respuesta no trae la cookie luxe_sesion
  AssertionError: expected 404 to be 401 // Object.is equality
  AssertionError: expected 404 to be 429 // Object.is equality
  AssertionError: expected 404 to be 400 // Object.is equality
  ConfiguracionInvalidaError: Configuración inválida o incompleta: CHATWOOT_BOT_TOKEN (valor), TELEGRAM_BOT_TOKEN (valor), TELEGRAM_CHAT_ID (valor), OPENROUTER_API_KEY (valor)
  Error: la respuesta no trae la cookie luxe_sesion
  Error: la respuesta no trae la cookie luxe_sesion
  Error: la respuesta no trae la cookie luxe_sesion
  Error: la respuesta no trae la cookie luxe_sesion
  AssertionError: expected 404 to be 204 // Object.is equality
  Error: la respuesta no trae la cookie luxe_sesion
  AssertionError: expected 404 to be 401 // Object.is equality
  AssertionError: expected 201 to be 200 // Object.is equality
  Error: la respuesta no trae la cookie luxe_sesion
  AssertionError: expected 0 to be greater than 0
  Error: la respuesta no trae la cookie luxe_sesion
        Tests  16 failed | 2 passed (18)
  ```

  Dos de esas fallas eran del propio test y se corrigieron antes del GREEN: la configuración `production` exigía
  sus secretos (se pasan valores ficticios) y el webhook responde `201`, no `200` (se acepta 2xx como en
  `canal-chatwoot.e2e-spec.ts`). Tras el GREEN, los dos de USR9 seguían sin líneas: `nestjs-pino` crea su logger
  raíz una vez por proceso con el destino de la primera app, así que el e2e usa un único stream por archivo.
  GREEN: e2e 18/18, `test/contrato` 20/20 (incluye API11), `npm test` 174 archivos; `typecheck`, `lint`,
  `fronteras`, `contrato:deriva`, `contrato:lint` (0 errores; 16 avisos de descripción y etiquetas, del mismo tipo
  que los que ya tenían `/health` y el webhook) y `contrato:diff` (sin cambios incompatibles) verdes.
- Detalles: `respuestaProblema` en `plataforma/documentacion` documenta los 4xx en problem+json;
  `DocumentarSesionRequerida` y `DocumentarCsrf` en `usuarios/interfaz`; `addCookieAuth` en
  `CONFIGURACION_DOCUMENTO`. El webhook declara `security: []` (es `@Publico()`). `Retry-After` se pone antes de
  lanzar `demasiados-intentos` y el filtro lo conserva. La ruta de admin de API7 es un *fixture* del e2e: la 11a aún
  no trae ninguna propia. **Desviación:** dos tests existentes asumían el documento público vacío
  (`documento-interno.spec.ts` y el escenario PLT7 de `verificar-deriva-contrato.spec.ts`); su premisa pasa a «el
  público no tiene `/health`», que es lo que de verdad protegen. Commit: ver historial (`feat(usuarios): endpoints`).
- **`size:exception` (anticipada, cifra real):** ~710 líneas de autoría sin contar los dos documentos OpenAPI
  generados (~1.110): ~450 de tests (e2e y contrato), ~180 de producción y ~70 de este archivo. Supera los ~500 del
  forecast por el e2e (18 escenarios con arranque completo).

### T7 — Comando `npm run usuario:crear`

- `CrearUsuario` en `usuarios/aplicacion/`; `scripts/usuario-crear.ts` registrado en `scripts/cli.ts`;
  `LectorContrasenaConsola` sin eco y con exigencia de TTY; script `usuario:crear` en `package.json`.
- Unitarias de `CrearUsuario` con lector falso; integración contra Postgres real (correo repetido no pisa nada).
- Forecast: ~300 líneas.
- **Cerrada (2026-10-04).** RED en dos pasos con `npx vitest run --project unit
  src/modulos/usuarios/aplicacion/crear-usuario.spec.ts scripts/usuario-crear.spec.ts`. (1) `Error: Cannot find
  module './crear-usuario.js'` y `'./usuario-crear.js'`. (2) Con un esqueleto de `CrearUsuario` que siempre responde
  `{ creado: false, motivo: 'sin-implementar' }`:

  ```
       × crea el usuario con el correo en minúsculas y solo el hash de la contraseña 7ms
       × USR10 — Una contraseña corta o que no coincide se rechaza 3ms
       × USR10 — Un correo repetido no pisa al usuario existente 1ms
       × USR10 — Sin terminal interactiva el comando no corre 1ms
       × rechaza un correo sin formato válido o un nombre vacío sin pedir la contraseña 1ms
  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
  AssertionError: expected false to be true // Object.is equality
  AssertionError: expected { creado: false, …(1) } to deeply equal { creado: false, motivo: 'corta' }
  AssertionError: expected { creado: false, …(1) } to deeply equal { creado: false, …(1) }
  AssertionError: expected { creado: false, …(1) } to deeply equal { creado: false, …(1) }
  AssertionError: expected { creado: false, …(1) } to deeply equal { creado: false, …(1) }
        Tests  5 failed (5)
  ```

  GREEN: 51 unitarias en `src/modulos/usuarios` + `scripts/usuario-crear.spec.ts`, 36 de integración en
  `test/integracion/usuarios` (incluye `USR10 — Crear el primer administrador` con Postgres y argon2id reales);
  `typecheck`, `lint` y `fronteras` verdes. Prueba real del comando: sin TTY (`echo x | npm run usuario:crear …`)
  termina con código 1 sin leer; con `--contrasena` lo rechaza; con TTY (`script -qc`) contra un Postgres 16
  temporal migrado con `prisma:aplicar`, pide la contraseña dos veces sin mostrarla y deja `admin@ejemplo.co`,
  `admin`, activo, con hash `$argon2id$`.
- Detalles: un correo repetido se detecta antes de pedir la contraseña (y el repositorio lo vuelve a comprobar al
  insertar); también se rechazan un correo sin formato válido y un nombre vacío; el mensaje de éxito solo lleva id y
  rol. **Desviación de D7:** `LectorContrasena` es un puerto, pero se pasa como argumento de
  `CrearUsuario.ejecutar` en vez de inyectarse con un token: solo el comando lo tiene y así `CrearUsuario` puede
  vivir en `UsuariosModule` sin un proveedor de consola. `LectorContrasenaConsola` vive en `scripts/usuario-crear.ts`.
  Commit: ver historial (`feat(usuarios): comando`).
- **`size:exception` (escrita al cerrar):** ~490 líneas (≈ 250 de tests y el lector falso, ≈ 200 de producción)
  frente a ~300; con T8, que es solo documentación, el PR p6 queda en torno a 600.

### T8 — Guía y cierre

- `docs/operacion/usuarios-y-sesiones.md` (crear el primer admin, cuánto dura una sesión, qué hacer si alguien queda
  bloqueado, qué pasa si Redis se reinicia), `CLAUDE.md` (comando y mapa de documentación), `docs/fases/README.md`,
  `docs/migracion/inventario.md` (fila 64, parte de usuarios), `docs/PREGUNTAS_ABIERTAS.md`, `verify-report.md` y
  archivo del change (fusiona `usuarios` como dominio nuevo y API7/API11 en `openspec/specs/api/spec.md`).
- **`[manual]`**: el dueño crea su usuario con el comando e inicia sesión desde Scalar o `curl` contra su entorno local.
  Incluye comprobar en PowerShell que la contraseña no se muestra al teclearla (T1 solo pudo probar bash).
- Forecast: sin cambios de producción, sin riesgo de presupuesto.
- **Cerrada (2026-10-04), salvo la parte `[manual]`.** `docs/operacion/usuarios-y-sesiones.md`; `CLAUDE.md` (comando y
  mapa de documentación); `docs/fases/README.md` (11a `cerrada`); `docs/migracion/inventario.md` (fila 64);
  `docs/PREGUNTAS_ABIERTAS.md` (P51-P54 resueltas al aprobar la 11a); `verify-report.md`; delta specs fusionadas
  (`openspec/specs/usuarios/spec.md` nuevo, API7 reemplazado y API11 agregado en `openspec/specs/api/spec.md`) y change
  archivado. `docs/CONTEXTO_SESIONES.md` actualizado. Commit: el que archiva el change (`docs(fase-11a): cierre`).
- **Pendiente `[manual]`:** crear el usuario del dueño, iniciar sesión desde Scalar o `curl` y comprobar el no-eco en
  PowerShell.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.150 de autoría (≈ 60 % tests) |
| 400-line budget risk | Medium: T5 al límite; T6 con `size:exception` anticipada |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (T1, T2) → PR2 (T3) → PR3 (T4) → PR4 (T5) → PR5 (T6) → PR6 (T7, T8) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
