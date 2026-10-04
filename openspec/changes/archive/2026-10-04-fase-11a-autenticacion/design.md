# Design: Fase 11a — Usuarios y autenticación

- Change: `fase-11a-autenticacion` · Fecha: 2026-10-03 · Estado: **cerrada (2026-10-04)**, ver `verify-report.md`
- Proposal: `proposal.md` · Specs: `usuarios` (USR1-USR10, dominio nuevo), `api` (API7 modificado, API11)
- ADRs: [0021](../../../docs/adr/0021-sesion-cookie-redis.md) nuevo (`propuesta`); se apoya en 0008, 0010 y 0011.

## Technical Approach

Un módulo nuevo, `usuarios`, dueño de la tabla `usuario` y de las sesiones. Tres guardias globales, en este orden,
deciden si una petición pasa; los controladores no repiten ninguna comprobación.

```
petición ──▶ GuardiaCsrf ──▶ GuardiaSesion ──────────────▶ GuardiaRoles ──▶ controlador
             mutación sin     @Publico() → pasa             @Roles('admin')
             X-Luxe-Csrf      cookie → sesion:<id> (Redis)  y rol distinto
             → 403            usuario activo (Postgres)     → 403
                              renueva TTL; si no → 401
```

El inicio de sesión vive en `IniciarSesion`: límite de intentos → buscar usuario → verificar argon2id (contra un hash
ficticio si no existe) → crear sesión → `ultimo_acceso` con el `Clock`. El controlador solo traduce el resultado a
HTTP y pone o vacía la cookie.

## Registro de compatibilidad (lo llena T1)

Como en la Fase 00a, nada se escribe hasta confirmar estas dependencias con la versión real del repo
(NestJS 12.1, `@nestjs/platform-express` 12, Express 5, Node LTS, Windows y la imagen Linux de CI).

| Pieza | Candidata | Qué se verifica | Resultado |
|---|---|---|---|
| Hash de contraseñas | `@node-rs/argon2` (binarios precompilados) o `argon2` (node-gyp) | instala sin compilar en Windows y en Linux; `hash`/`verify` argon2id con m=19456 KiB, t=2, p=1 | **`@node-rs/argon2` 2.2.1.** Instala sin compilar en Linux x64 (`argon2-linux-x64-gnu`); trae binario `win32-x64-msvc` entre sus `optionalDependencies`. `hash` con m=19456, t=2, p=1 da `$argon2id$v=19$m=19456,t=2,p=1$…` (~90 ms); `verify` acepta la correcta y rechaza otra. `Algorithm` es un `const enum` ambiental que `isolatedModules` no deja usar: se omite `algorithm`, porque argon2id ya es el valor por defecto, y los tests comprueban el prefijo `$argon2id$` |
| Lectura de cookies | `cookie-parser` o el paquete `cookie` leído en la guardia | funciona con Express 5 y `NestExpressApplication` 12; no rompe `rawBody` del webhook | **`cookie` 2.0.1** (`parseCookie`, ESM con tipos) leído en `GuardiaSesion` sobre `req.headers.cookie`, sin middleware global. Con `OPCIONES_APLICACION` (`rawBody: true`) y prefijo `api/v1`, un `POST` JSON conserva `req.rawBody` intacto (8 bytes de `{"a": 1}`) |
| Escritura de cookies | `res.cookie()` de Express 5 vía `@Res({ passthrough: true })` | atributos `HttpOnly`, `SameSite=Strict`, `Secure`; vaciado con `clearCookie` | **Sirve tal cual** (Express 5.2.1). `res.cookie` da `luxe_sesion=<43>; Path=/; HttpOnly; Secure; SameSite=Strict`, sin `Expires` ni `Max-Age`. `clearCookie` da `luxe_sesion=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict` y responde `204` |
| Contrato | `@nestjs/swagger` 12 `addCookieAuth` / `@ApiCookieAuth` / `@ApiSecurity` | `security: []` en operaciones públicas; Spectral sin errores nuevos | **`@nestjs/swagger` 12.0.2.** `addCookieAuth('luxe_sesion', { type: 'apiKey', in: 'cookie', name: 'luxe_sesion' }, 'cookieAuth')` declara el esquema; `@ApiCookieAuth('cookieAuth')` da `security: [{ cookieAuth: [] }]`. **`@ApiSecurity({})` no sirve** (da `[{}]`): para `security: []` se usa `@ApiOperation({ security: [] })`. Spectral se comprueba en T6 con el contrato real |
| Consola sin eco | `node:readline` con salida silenciada | lee la contraseña sin mostrarla en PowerShell y en bash | **`node:readline`** con un `Writable` que descarta la salida mientras se pide la contraseña. En bash con TTY (`script -qc`) no se muestra nada de lo tecleado y se lee completa; sin TTY (`echo x \| node …`) termina con código 2 sin leer. **PowerShell no se pudo probar en la nube**: queda dentro de la prueba `[manual]` de T8 |

Probado el 2026-10-04 con Node 22.22 (sin Node 24 en la sesión) sobre Linux x64, en un script y un spec temporales
que no se commitean.

Si una candidata falla, se usa la otra y se anota aquí; si ninguna sirve, se detiene la fase y se avisa al dueño.

## Architecture Decisions

### D1: sesión opaca en Redis, no JWT (ADR-0021)

**Choice**: el valor de la cookie es un id aleatorio de 32 bytes (`crypto.randomBytes`, base64url, 43 caracteres); la
sesión vive en `sesion:<id>` como JSON `{ usuarioId, creada, ultimaActividad }` con `EXPIRE` igual a
`SESION_INACTIVIDAD_MIN`. Cada petición autenticada hace `GET` + `EXPIRE` (renovación) y compara `creada` con
`SESION_DURACION_MAX_H`.
**Alternatives**: JWT firmado en cookie (sin estado, pero no se puede revocar al instante sin una lista negra); JWT en
`localStorage` (legible por cualquier script, expuesto a XSS); `express-session` con `connect-redis` (más piezas y un
formato de cookie firmado que no aporta nada a un id aleatorio).
**Rationale**: cerrar sesión o desactivar a un usuario corta el acceso en la siguiente petición; Redis ya está en el
stack y la carga es de una o dos personas.

### D2: el rol y el estado se leen de la base en cada petición

**Choice**: la sesión guarda solo `usuarioId`. `GuardiaSesion` llama a `RepositorioUsuario.buscarPorId` (consulta por
llave primaria) y deja en la petición `{ id, rol }`. Si el usuario no existe o está inactivo, borra la sesión y
responde `401`.
**Alternatives**: copiar el rol en la sesión (una consulta menos, pero un cambio de rol o una desactivación no aplica
hasta que la sesión vence).
**Rationale**: con el tráfico de un back office interno la consulta no se nota, y evita la clase entera de errores
de «permiso viejo».

### D3: tres guardias globales con metadatos, registradas desde `UsuariosModule`

**Choice**: `GuardiaCsrf`, `GuardiaSesion` y `GuardiaRoles` como `APP_GUARD` en `UsuariosModule`, en ese orden. Los
decoradores `@Publico()` y `@Roles(...roles)` viven en `usuarios/interfaz/` y se exportan por el barril, de modo que
otros módulos los usan en sus controladores (`canales` en el webhook; `agente` y la 11b en sus rutas de admin).
`GET /health` vive en `plataforma/salud`, que no puede importar módulos (regla de fronteras 7), así que no puede usar
`@Publico()`. Para no crear una dependencia inversa, `GuardiaSesion` trata como pública toda ruta fuera de `/api/v1`
(hoy solo `/health`; `/docs` lo monta Scalar como middleware y no pasa por las guardias). Dentro de `/api/v1`, solo
`@Publico()` abre una ruta.
**Alternatives**: `@UseGuards` por controlador (fácil olvidar uno; una ruta nueva nacería abierta); que `plataforma`
defina el decorador (`plataforma` tendría conceptos de negocio).
**Rationale**: «cerrado por defecto»: una ruta nueva en `/api/v1` exige sesión aunque nadie se acuerde.

| Ruta | Cómo queda abierta |
|---|---|
| `POST /api/v1/auth/sesion`, `DELETE /api/v1/auth/sesion` | `@Publico()` |
| `POST /api/v1/webhooks/chatwoot` | `@Publico()` (su firma sigue en `GuardiaFirmaChatwoot`, R3) y exento de CSRF con `@SinCsrf()` |
| `GET /health` | fuera de `/api/v1` |
| `/docs` | middleware de Scalar, fuera del enrutado de Nest (API9) |

### D4: CSRF con `SameSite=Strict` más un encabezado propio

**Choice**: `GuardiaCsrf` exige `X-Luxe-Csrf: 1` en `POST`/`PUT`/`PATCH`/`DELETE` bajo `/api/v1`, salvo rutas con
`@SinCsrf()` (solo el webhook). Un formulario de otro sitio no puede poner encabezados propios, y sin CORS abierto un
`fetch` de otro origen con ese encabezado exige un *preflight* que el servidor no aprueba.
**Alternatives**: token sincronizador (más estado y un endpoint para pedirlo); solo `SameSite=Strict` (depende de que
todo navegador lo respete).
**Rationale**: dos barreras independientes, sin estado extra.

### D5: límite de intentos propio sobre Redis

**Choice**: `LimiteIntentosRedis` con `INCR` + `EXPIRE NX` en `auth:intentos:<sha256(correo)>:<ip>`. `IniciarSesion`
consulta antes de verificar la contraseña y registra el fallo después; un éxito hace `DEL`. La IP sale de `req.ip`;
cuando haya proxy inverso (09b) se configura `trust proxy`, anotado como pendiente.
**Alternatives**: `@nestjs/throttler` con almacenamiento en Redis (limita por ruta e IP, no por correo e IP, y suma
una dependencia).
**Rationale**: la regla es de negocio (por cuenta y origen) y cabe en unas líneas probadas contra Redis real.
**Desviación en T3 (2026-10-04, resuelve el hallazgo RDD «carrera en el límite de intentos»)**: con `estaBloqueado`
y luego `registrarFallo`, varias peticiones simultáneas pasaban todas la consulta antes de que alguna contara, y se
podían probar más de `AUTH_INTENTOS_MAX` contraseñas. El puerto queda en `consumirIntento` + `reiniciar`:
`consumirIntento` hace `INCR` + `EXPIRE NX` + `TTL` en un solo `MULTI` **antes** de verificar la contraseña y
responde si el intento entra o cuántos segundos faltan; un éxito hace `DEL`. Como un éxito reinicia, el contador
sigue midiendo fallos y los escenarios de USR8 no cambian. Probado con 12 intentos simultáneos: entran 5.

### D6: hash ficticio para no revelar correos

**Choice**: al arrancar, `HasheadorArgon2` calcula una vez el hash de una cadena aleatoria; si el correo no existe,
`IniciarSesion` verifica contra ese hash y descarta el resultado. Los parámetros argon2id son los recomendados por
OWASP (m=19456 KiB, t=2, p=1).
**Rationale**: el tiempo de un correo inexistente queda del orden del de una contraseña incorrecta (USR1).

### D7: el comando lee la contraseña por un puerto

**Choice**: `scripts/usuario-crear.ts` (registrado en `scripts/cli.ts`) usa `CrearUsuario` (caso de uso de `usuarios`)
y un puerto `LectorContrasena`; en producción lo implementa `node:readline` sin eco y exige `process.stdin.isTTY`; los
tests inyectan un lector falso.
**Rationale**: la regla (longitud, coincidencia, correo repetido) se prueba sin terminal; nunca hay contraseña en
argumentos ni variables de entorno (quedarían en el historial del shell).

## Módulos tocados

| Módulo | Cambio | Depende de |
|---|---|---|
| `usuarios` (nuevo) | dominio, casos de uso, guardias, controlador, adaptadores | `plataforma/{prisma,redis,reloj,config,errores,documentacion}` |
| `canales` | el webhook gana `@Publico()` y `@SinCsrf()` | barril de `usuarios` (solo los decoradores) |
| `plataforma/errores` | cinco códigos nuevos en `CATALOGO_CODIGOS` | — |
| `plataforma/config` | variables nuevas | — |
| `plataforma/observabilidad` | `cookie` y `set-cookie` en la redacción de pino | — |
| `plataforma/documentacion` | `addCookieAuth('luxe_sesion')` al construir el documento | — |
| `AppModule` | importa `UsuariosModule` | — |

`usuarios` no importa ningún otro módulo de negocio; `canales` importa solo sus decoradores, sin ciclo. Si
`dependency-cruiser` exige una regla nueva (p. ej. «nadie importa rutas internas de `usuarios`»), basta la regla 5
existente.

## Puertos y adaptadores

| Puerto (token) | Qué hace | Adaptador |
|---|---|---|
| `RepositorioUsuario` (`REPOSITORIO_USUARIO`) | `buscarPorEmail`, `buscarPorId`, `registrarAcceso(id, instante)`, `crear` | `RepositorioUsuarioPrisma` |
| `AlmacenSesiones` (`ALMACEN_SESIONES`) | `crear`, `leerYRenovar`, `borrar` | `AlmacenSesionesRedis` |
| `HasheadorContrasena` (`HASHEADOR_CONTRASENA`) | `hashear`, `verificar`, `verificarFicticio` | `HasheadorArgon2` |
| `LimiteIntentos` (`LIMITE_INTENTOS`) | `consumirIntento`, `reiniciar` (ver «Desviación en T3» de D5) | `LimiteIntentosRedis` |
| `LectorContrasena` (`LECTOR_CONTRASENA`) | pide la contraseña en consola | `LectorContrasenaConsola` (solo en `scripts/`) |

Dominio puro: `normalizarEmail`, `validarContrasenaNueva` (≥ 12 caracteres), `sesionVencida(creada, ahora, maxH)`,
tipo `Rol = 'admin' | 'asesor'`.

## Endpoints

| Método y ruta | operationId | Seguridad | Request | Respuesta | Errores |
|---|---|---|---|---|---|
| `POST /api/v1/auth/sesion` | `iniciarSesion` | `security: []`, `X-Luxe-Csrf` | `{ email: string (email), contrasena: string (1-200) }` | `200 { id, nombre, email, rol }` + `Set-Cookie` | `400 validacion-fallida`, `401 credenciales-invalidas`, `403 encabezado-csrf-ausente`, `429 demasiados-intentos` |
| `DELETE /api/v1/auth/sesion` | `cerrarSesion` | `security: []`, `X-Luxe-Csrf` | — | `204` + `Set-Cookie` vencida | `403 encabezado-csrf-ausente` |
| `GET /api/v1/auth/yo` | `obtenerSesionActual` | `cookieAuth` | — | `200 { id, nombre, email, rol }` | `401 peticion-no-autenticada` |

`auth/sesion` es un recurso único (la sesión de quien llama), por eso va en singular; es la excepción declarada a la
convención de plural de API2. Los tres van al documento **público** (los consume el cliente de la 11b).

Códigos nuevos en `CATALOGO_CODIGOS` (ADR-0011):

| Código | Status | Requisito |
|---|---|---|
| `credenciales-invalidas` | 401 | USR1 |
| `peticion-no-autenticada` | 401 | USR3, USR5, USR6, API7 |
| `rol-insuficiente` | 403 | USR6, API7 |
| `encabezado-csrf-ausente` | 403 | USR7 |
| `demasiados-intentos` | 429 | USR8 |

## Configuración nueva (Zod, `.env.example`)

| Variable | Defecto | Regla |
|---|---|---|
| `SESION_INACTIVIDAD_MIN` | 720 | entero 5-10080 (Q1) |
| `SESION_DURACION_MAX_H` | 168 | entero 1-720; debe ser ≥ inactividad (Q1) |
| `AUTH_INTENTOS_MAX` | 5 | entero 1-50 (Q3) |
| `AUTH_VENTANA_MIN` | 15 | entero 1-1440 (Q3) |

El atributo `Secure` se deriva de `NODE_ENV` (no es una variable aparte): así no se puede apagar por error en producción.

## Eventos de dominio

Ninguno. `ultimo_acceso` se escribe en el mismo caso de uso; nada más reacciona al inicio de sesión todavía.

## Esquema de datos

Sin cambios. Se usa `usuario` tal como está (`prisma/schema.prisma:280`). `email` ya es único; el comando lo guarda
en minúsculas y `buscarPorEmail` compara en minúsculas, así que no hace falta un índice nuevo. `actualizado` se
escribe a mano en `registrarAcceso` (el esquema no tiene `@updatedAt`).

## Testing Strategy

| Nivel | Qué | Escenarios |
|---|---|---|
| Unitario | dominio puro, `IniciarSesion`/`CerrarSesion`/`ObtenerSesionActual`/`CrearUsuario` con fakes y `ClockFalso` | USR1, USR3 (vencimiento máximo), USR10 |
| Integración | adaptadores Prisma y Redis reales; guardias con un controlador *fixture* de prueba | USR3, USR6, USR7, USR8 |
| E2E (Supertest) | los tres endpoints con la app completa; webhook y `/health` sin cookie; logs capturados | USR1, USR2, USR4, USR5, USR6, USR9 |
| Contrato | `cookieAuth`, `security: []`, encabezado `X-Luxe-Csrf` | API11 |

Ningún test usa `vi.useFakeTimers` sobre lógica: el tiempo viene de `ClockFalso`; el TTL real de Redis se prueba con
valores cortos.

## Open Questions

Q1-Q4 de la proposal (P51-P54). Ninguna bloquea: los valores recomendados quedan como defecto de Zod.
