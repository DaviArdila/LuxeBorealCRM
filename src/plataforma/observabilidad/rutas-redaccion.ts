/**
 * Rutas de redacción de `pino` (PLT3, D9 de `design.md`, R14). Cada categoría de claves se cubre
 * en los tres niveles de anidación que `pino` redacta por patrón: la clave sola (`x`), un nivel
 * de anidación (`*.x`) y dos niveles de anidación (`*.*.x`). La categoría `HTTP` usa rutas fijas
 * porque nombra una posición concreta (`req.headers.authorization`), no un nombre de clave que
 * pueda aparecer en cualquier nivel.
 *
 * Cambiar esta lista MUST venir con su caso en el test `R14 — Redacción en logs`
 * (`crear-opciones-logger.spec.ts`).
 */

const CLAVES_TELEFONO = [
  'telefono',
  'numero',
  'celular',
  'phone',
  'phoneNumber',
  'phone_number',
] as const;

const CLAVES_CONTENIDO_MENSAJE = [
  'contenido',
  'mensaje',
  'texto',
  'content',
  'message',
  'adjuntos',
  'attachments',
] as const;

const CLAVES_CEDULA = ['cedula', 'documento', 'numeroDocumento'] as const;

const CLAVES_CORREO = ['correo', 'email'] as const;

const CLAVES_SECRETOS = [
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'secreto',
  'password',
  'contrasena',
  'authorization',
] as const;

const RUTAS_HTTP = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers.api_access_token',
  'res.headers["set-cookie"]',
  'req.body',
] as const;

/**
 * Claves cuyo último segmento de ruta identifica un teléfono. `crearOpcionesLogger` usa este
 * conjunto para decidir cuándo el `censor` de `pino` aplica `enmascarar` de `compartido/numero`
 * en vez de `"[REDACTADO]"`.
 */
export const CLAVES_TELEFONO_SET: ReadonlySet<string> = new Set<string>(CLAVES_TELEFONO);

function rutasPorNiveles(claves: readonly string[]): string[] {
  return claves.flatMap((clave) => [clave, `*.${clave}`, `*.*.${clave}`]);
}

/**
 * Tabla completa de rutas de redacción (D9): 6 categorías (teléfono, contenido de mensajes,
 * cédula, correo, secretos, HTTP) × hasta 3 niveles de anidación cada una.
 */
export const RUTAS_REDACCION: readonly string[] = [
  ...rutasPorNiveles(CLAVES_TELEFONO),
  ...rutasPorNiveles(CLAVES_CONTENIDO_MENSAJE),
  ...rutasPorNiveles(CLAVES_CEDULA),
  ...rutasPorNiveles(CLAVES_CORREO),
  ...rutasPorNiveles(CLAVES_SECRETOS),
  ...RUTAS_HTTP,
];
