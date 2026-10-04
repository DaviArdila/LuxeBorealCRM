# Proposal: Fase 11a — Usuarios y autenticación

- Change: `fase-11a-autenticacion` · Fase de la hoja de ruta: **11a** · Rama: `fase-11a-autenticacion`
- Fecha: 2026-10-03 · Estado: **cerrada (2026-10-04)**, ver `verify-report.md`
- Depende de: **08d cerrada**. No depende de 09 ni de 10: el dueño adelantó la 11 antes del corte (2026-10-03).
- ADR: [0021](../../../docs/adr/0021-sesion-cookie-redis.md) (sesión en cookie httpOnly guardada en Redis, `propuesta`).

## Intent

El dueño quiere probar y ajustar el bot desde una pantalla real (Fase 11b) en vez de la línea de comandos. Esa
pantalla necesita saber **quién** la usa y **qué** puede hacer. Hoy la API no tiene autenticación: solo expone el
webhook de Chatwoot (firmado) y `GET /health`. La tabla `usuario` ya existe desde la Fase 01
(`prisma/schema.prisma:280`), sin código que la use.

Esta fase crea el módulo `usuarios` con inicio y cierre de sesión, una sesión en **cookie httpOnly guardada en
Redis** (ADR-0021), una guardia global que protege toda ruta salvo las marcadas como públicas, permisos por rol en
el servidor (API7) y un comando para crear el primer administrador. No construye pantallas.

Éxito: con un usuario creado por `npm run usuario:crear`, `POST /api/v1/auth/sesion` deja la cookie `luxe_sesion`,
`GET /api/v1/auth/yo` devuelve el usuario, una ruta de admin rechaza a un asesor con `403`, y
`DELETE /api/v1/auth/sesion` invalida la sesión al instante.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Orden de la fase | La 11 va **antes** de 09 y 10; las 12-14 siguen después del corte | Dueño, 2026-10-03 (P8 enmendada) |
| Mecanismo de autenticación | Cookie httpOnly con sesión en Redis, **no JWT** | Dueño, 2026-10-03; ADR-0021 |
| Roles | `admin` y `asesor`, los del enum `RolUsuario` ya existente | `MODELO_DATOS.md` §6, Fase 01 |
| Esquema | Sin cambios: la tabla `usuario` ya tiene lo necesario | `prisma/schema.prisma:280` |
| Cliente | Angular en `cliente/`, mismo origen; se construye en la 11b | Dueño, 2026-10-03; ADR-0022 |

## Scope

### In Scope

1. Módulo `src/modulos/usuarios/` (dominio, aplicación, puertos, infraestructura, interfaz).
2. Casos de uso `IniciarSesion` (verificación argon2id, usuario activo, `ultimo_acceso` con el `Clock`),
   `CerrarSesion` y `ObtenerSesionActual`.
3. Endpoints `POST /api/v1/auth/sesion`, `DELETE /api/v1/auth/sesion` y `GET /api/v1/auth/yo`.
4. Cookie `luxe_sesion`: httpOnly, `SameSite=Strict`, `Secure` fuera de desarrollo.
5. Sesión en Redis (`sesion:<id>`, id aleatorio de 256 bits) con TTL deslizante y duración máxima configurables.
6. Guardia global de sesión, decorador `@Publico()` y decorador `@Roles('admin')`.
7. Protección CSRF: `SameSite=Strict` más un encabezado propio obligatorio en las mutaciones.
8. Límite de intentos de inicio de sesión por correo e IP, en Redis.
9. Errores RFC 9457 que nunca revelan si un correo existe; códigos nuevos en el catálogo.
10. Comando `npm run usuario:crear -- --email <e> --nombre <n> --rol admin|asesor` con la contraseña pedida en consola.
11. Esquema de seguridad `cookieAuth` en el contrato y deriva del contrato en verde.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Pantallas (login, estilo, mensajes fijos) | Fase 11b | Esta fase deja la API lista para el cliente |
| Gestión de usuarios desde la API o una pantalla (crear, desactivar, cambiar rol o contraseña) | Posterior (P52) | En 11a solo hay un comando; el primer uso es de una o dos personas |
| Recuperar o cambiar la contraseña por correo | Posterior | Exige un proveedor de correo; con el comando basta por ahora |
| Doble factor (2FA) | Posterior | Riesgo bajo mientras el cliente solo corre en local (hasta la 09b) |
| Kill switch R16 | Fase 09a | Se protegerá con `@Roles('admin')` cuando exista |
| CORS para otros orígenes | Sin fase | El cliente usa el mismo origen; la lista blanca de CORS sigue vacía |
| Dashboard App dentro de Chatwoot | Posterior (P14) | Puede embeber el mismo cliente más adelante |

## Qué se migra del prototipo

El prototipo no tiene usuarios ni sesiones: el panel `/panel` ya estaba retirado (fila 57 de
`docs/migracion/inventario.md`) y el kill switch usa un token fijo (fila 54, Fase 09a). La fila 64
(«usuarios, solo tablas → construir, 11+») se cubre con lógica nueva.

| Prototipo | Decisión | Motivo |
|---|---|---|
| `panel/` (retirado, ADR-006 del prototipo) | descartar | El back office es el cliente de la 11b, con su propia autenticación |
| `admin/` (token fijo del kill switch) | posponer (09a) | El kill switch no es parte de esta fase; cuando llegue, usa la sesión y el rol `admin` en vez de un token compartido |
| Tabla `usuario` (estructura, ya creada en la Fase 01) | conservar | Mismo modelo; esta fase solo le agrega el código |

Ningún test del prototipo se reemplaza: no tenía autenticación.

## Preguntas abiertas

Registradas en `docs/PREGUNTAS_ABIERTAS.md` como P51 (Q1) a P54 (Q4). Ninguna bloquea la escritura de la spec:
cada una tiene una recomendación aplicada como valor por defecto, que el dueño confirma o cambia al aprobar.

| Id | Pregunta | Recomendación aplicada |
|---|---|---|
| **Q1** (P51) | ¿Cuánto dura una sesión sin actividad y cuánto como máximo? | 12 h deslizantes (`SESION_INACTIVIDAD_MIN=720`) y 7 días máximo (`SESION_DURACION_MAX_H=168`) |
| **Q2** (P52) | ¿Dónde se gestionan los usuarios? | Solo por comando en 11a; pantalla de usuarios en una fase posterior |
| **Q3** (P53) | ¿Cuántos intentos fallidos antes de bloquear el inicio de sesión? | 5 por correo e IP en 15 minutos (`AUTH_INTENTOS_MAX`, `AUTH_VENTANA_MIN`) |
| **Q4** (P54) | ¿Qué exige una contraseña? | Mínimo 12 caracteres, sin reglas de composición (NIST SP 800-63B) |

## Risks

| Riesgo | Efecto | Mitigación |
|---|---|---|
| La guardia global bloquea el webhook de Chatwoot o `/health` | El bot deja de recibir mensajes | Ambos llevan `@Publico()`; un e2e confirma que el webhook firmado sigue respondiendo sin cookie (USR6) |
| La librería de argon2 no compila en Windows o en la imagen de producción | No se puede iniciar sesión | T1 verifica la librería (binarios precompilados) antes de escribir código |
| Enumeración de correos por tiempo de respuesta | Un atacante descubre qué correos existen | Si el correo no existe se verifica contra un hash ficticio; misma respuesta y mismo código (USR1) |
| Fuerza bruta sobre la contraseña | Acceso indebido | Límite de intentos (USR8) y argon2id con parámetros de OWASP |
| Redis se reinicia | Todas las sesiones se cierran | Aceptable: basta volver a iniciar sesión. Se documenta en la guía |
| Sin kill switch (R16) ni backups (09a) todavía | Sin freno de emergencia ni recuperación | Aceptable mientras el bot no atiende clientes reales; la 09a va antes del corte |
| T6 supera ~400 líneas por los tests e2e | PR grande | Excepción de tamaño anticipada aquí: los e2e de los tres endpoints van juntos con el controlador (`size:exception` automática en `tasks.md`) |

## Rollback

- Sin migración: revertir los commits del módulo `usuarios` deja la API como estaba (solo webhook y `/health`).
- Las sesiones viven en Redis con TTL: al revertir, las claves `sesion:*` expiran solas o se borran con
  `redis-cli --scan --pattern 'sesion:*'`.
- Los usuarios creados con el comando quedan en la tabla `usuario`, que ya existía; no estorban.
