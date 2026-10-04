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
- [ ] T2 — Dominio, configuración y códigos de error del módulo `usuarios`
- [ ] T3 — Adaptadores: `RepositorioUsuarioPrisma`, `HasheadorArgon2`, `AlmacenSesionesRedis`, `LimiteIntentosRedis`
- [ ] T4 — Casos de uso `IniciarSesion`, `CerrarSesion`, `ObtenerSesionActual`
- [ ] T5 — Guardias globales (`GuardiaCsrf`, `GuardiaSesion`, `GuardiaRoles`) y decoradores
- [ ] T6 — `AuthController`, cookie, contrato con `cookieAuth` y e2e
- [ ] T7 — Comando `npm run usuario:crear`
- [ ] T8 — Guía de operación, cierre documental y prueba real `[manual]`

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

### T3 — Adaptadores

- Puertos y tokens de `design.md`; `RepositorioUsuarioPrisma`, `HasheadorArgon2` (con hash ficticio al arrancar),
  `AlmacenSesionesRedis` (`SET EX`, `GET` + `EXPIRE`, `DEL`), `LimiteIntentosRedis` (`INCR` + `EXPIRE NX`, clave con
  SHA-256 del correo).
- Integración con Postgres y Redis reales (Testcontainers, base por worker).
- Forecast: ~350 líneas.

### T4 — Casos de uso

- `IniciarSesion` (límite → buscar → verificar o verificar ficticio → crear sesión → `registrarAcceso` con el
  `Clock`), `CerrarSesion`, `ObtenerSesionActual` (aplica duración máxima, lee usuario de la base).
- Unitarias con puertos falsos y `ClockFalso`; transcripción completa de RED (seguridad).
- Forecast: ~350 líneas.

### T5 — Guardias y decoradores

- `GuardiaCsrf`, `GuardiaSesion`, `GuardiaRoles` como `APP_GUARD` en `UsuariosModule`; `@Publico()`, `@SinCsrf()`,
  `@Roles()`; rutas fuera de `/api/v1` quedan fuera de la guardia de sesión (D3).
- El webhook de Chatwoot gana `@Publico()` y `@SinCsrf()` en este mismo commit (si no, el e2e del webhook falla).
- Integración con un controlador *fixture* en `test/integracion/` que expone una ruta abierta, una protegida y una
  de admin.
- Forecast: ~400 líneas.

### T6 — Controlador, cookie, contrato y e2e

- `AuthController` con los tres endpoints de `design.md`, DTO Zod, `respuestaDesdeZod`, `Set-Cookie` y
  `clearCookie`; `addCookieAuth('luxe_sesion')` en `plataforma/documentacion`.
- `npm run contrato:generar` en el mismo commit; `contrato:deriva`, `contrato:lint` y `contrato:diff` en verde.
- E2E en `test/e2e/autenticacion.e2e-spec.ts`: recorrido completo, atributos de la cookie por `NODE_ENV`, webhook y
  `/health` sin cookie, logs capturados sin correo ni cookie.
- **`size:exception`** (fila «T6 supera ~400 líneas» de la tabla de Risks de `proposal.md`): controlador, contrato
  regenerado y e2e van juntos. Forecast: ~500 líneas (≈ 60 % tests y contrato generado).

### T7 — Comando `npm run usuario:crear`

- `CrearUsuario` en `usuarios/aplicacion/`; `scripts/usuario-crear.ts` registrado en `scripts/cli.ts`;
  `LectorContrasenaConsola` sin eco y con exigencia de TTY; script `usuario:crear` en `package.json`.
- Unitarias de `CrearUsuario` con lector falso; integración contra Postgres real (correo repetido no pisa nada).
- Forecast: ~300 líneas.

### T8 — Guía y cierre

- `docs/operacion/usuarios-y-sesiones.md` (crear el primer admin, cuánto dura una sesión, qué hacer si alguien queda
  bloqueado, qué pasa si Redis se reinicia), `CLAUDE.md` (comando y mapa de documentación), `docs/fases/README.md`,
  `docs/migracion/inventario.md` (fila 64, parte de usuarios), `docs/PREGUNTAS_ABIERTAS.md`, `verify-report.md` y
  archivo del change (fusiona `usuarios` como dominio nuevo y API7/API11 en `openspec/specs/api/spec.md`).
- **`[manual]`**: el dueño crea su usuario con el comando e inicia sesión desde Scalar o `curl` contra su entorno local.
  Incluye comprobar en PowerShell que la contraseña no se muestra al teclearla (T1 solo pudo probar bash).
- Forecast: sin cambios de producción, sin riesgo de presupuesto.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.150 de autoría (≈ 60 % tests) |
| 400-line budget risk | Medium: T5 al límite; T6 con `size:exception` anticipada |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (T1, T2) → PR2 (T3) → PR3 (T4) → PR4 (T5) → PR5 (T6) → PR6 (T7, T8) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
