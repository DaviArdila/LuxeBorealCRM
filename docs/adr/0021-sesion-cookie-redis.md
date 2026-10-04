# 0021. Sesión en cookie httpOnly guardada en Redis, no JWT

- Estado: propuesta
- Fecha: 2026-10-03

## Resumen

El back office (Fase 11) se autentica con una **cookie httpOnly** cuyo valor es un id aleatorio de 256 bits; la sesión
vive en **Redis** (`sesion:<id>`) con vencimiento deslizante y duración máxima. Cerrar sesión o desactivar a un usuario
corta el acceso en la siguiente petición. Se descartan los JWT: no aportan nada a un cliente del mismo origen y
complican la revocación. El dueño eligió este mecanismo el 2026-10-03; falta aceptar el ADR.

## Contexto

- La API solo expone el webhook de Chatwoot (firmado, R3) y `GET /health`. No hay autenticación.
- La tabla `usuario` existe desde la Fase 01 (`prisma/schema.prisma:280`): correo único, `password_hash`, rol
  `admin|asesor`, `activo`, `ultimo_acceso`.
- API7 exige permisos por rol en el servidor y dejaba el mecanismo «para la Fase 11».
- El cliente de la 11b (ADR-0022) se sirve desde el **mismo origen** que la API: proxy en desarrollo, mismo dominio en
  producción (09b). No hay terceros que consuman la API.
- Redis ya está en el stack (BullMQ, cachés, locks). Usuarios esperados: una a cinco personas.
- R14 prohíbe correos, cédulas y números completos en logs.

## Alternativas

| | Qué es | Gana | Paga |
|---|---|---|---|
| A | **Sesión opaca en Redis + cookie httpOnly** (id aleatorio) | Revocación inmediata; el navegador no puede leer el valor; sin secretos de firma que rotar | Una lectura de Redis por petición; si Redis se reinicia, todos vuelven a iniciar sesión |
| B | JWT firmado en cookie httpOnly (acceso corto + renovación) | Sin estado en el servidor para validar | Revocar exige lista negra (vuelve el estado); dos tokens, rotación de claves y más casos de error |
| C | JWT en `localStorage` con encabezado `Authorization` | Habitual en SPAs; sin problemas de CSRF | Cualquier script inyectado lee el token (XSS); se descarta por la regla de seguridad del doc 06 |
| D | `express-session` + `connect-redis` | Librería conocida | Más dependencias, cookie firmada con un secreto, y un formato de sesión que no se controla para R14 |

**Protección CSRF** (aplica a A y B por usar cookies):

| | Qué es | Gana | Paga |
|---|---|---|---|
| 1 | `SameSite=Strict` + encabezado propio obligatorio en mutaciones (`X-Luxe-Csrf`) | Dos barreras sin estado | El cliente debe agregar el encabezado (un interceptor) |
| 2 | Token sincronizador por sesión | Estándar clásico | Un endpoint y un estado más |

## Decisión (A + 1)

1. **Cookie** `luxe_sesion`: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` fuera de `development`, sin `Expires`
   ni `Max-Age`. Su valor es solo el id de la sesión.
2. **Sesión** en `sesion:<id>` (id de 32 bytes de `crypto.randomBytes`, base64url) con `{ usuarioId, creada,
   ultimaActividad }`. Vence tras `SESION_INACTIVIDAD_MIN` sin actividad (cada petición la renueva) y deja de valer a
   las `SESION_DURACION_MAX_H` horas de creada. No guarda correo ni contraseña.
3. **El rol y el estado `activo` se leen de la base en cada petición**, no de la sesión.
4. **Cerrar sesión** borra la clave al instante.
5. **Contraseñas** con argon2id (parámetros de OWASP); un correo inexistente se verifica contra un hash ficticio.
6. **Límite de intentos** por correo e IP en Redis, con el correo como hash SHA-256 en la clave.
7. **CSRF**: `SameSite=Strict` + `X-Luxe-Csrf: 1` obligatorio en `POST/PUT/PATCH/DELETE` bajo `/api/v1`, salvo el
   webhook (que usa firma, no cookie). CORS sigue cerrado.

## Consecuencias

- **Gana**: revocación inmediata, nada sensible al alcance de JavaScript, sin claves de firma que gestionar, y un
  mecanismo que se prueba entero contra Redis real.
- **Paga**: una lectura de Redis y una de Postgres por petición autenticada (irrelevante con este tráfico); reiniciar
  Redis cierra todas las sesiones; un cliente de otro origen (p. ej. una app móvil) necesitaría otro mecanismo.
- **Queda prohibido**: guardar tokens o datos del usuario en `localStorage`; abrir CORS a otros orígenes sin un ADR
  nuevo; leer el rol desde la sesión o desde el cliente; registrar en logs el correo, la contraseña, el hash, la cookie
  o el id de la sesión.
- **Queda obligatorio**: toda ruta nueva bajo `/api/v1` nace protegida (la guardia es global) y solo `@Publico()` la
  abre; toda mutación lleva `X-Luxe-Csrf`.
- **Se revisa** si aparece un consumidor de otro origen (Dashboard App de Chatwoot en otro dominio, app móvil, API v1
  para terceros en la Fase 14): entonces se evalúa un mecanismo adicional por token para ese consumidor.
