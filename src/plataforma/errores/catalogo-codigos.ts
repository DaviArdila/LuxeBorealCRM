/**
 * Catálogo de códigos de error estables (D5 de `design.md`, ADR-0011 propuesta). `CodigoError` se
 * deriva de las claves de este objeto: un código fuera del catálogo no compila (skill
 * `luxeboreal-arquitectura` §8, kebab-case en español). Cada fase que agregue un error nuevo
 * agrega su propia entrada aquí, con el id del requisito en el comentario — la Fase 11a agrega
 * los cinco de autenticación y las Fases 12-13 `clave-idempotencia-*` (design.md D5);
 * la Fase 04 (T3, D2/D3 de `design.md`) agrega `firma-invalida` y `carga-demasiado-grande` para el
 * webhook de Chatwoot.
 */
export const CATALOGO_CODIGOS = Object.freeze({
  /** API4: el cuerpo de la petición no cumple el esquema Standard Schema del endpoint. */
  'validacion-fallida': {
    status: 400,
    title: 'La petición no cumple el esquema del endpoint',
  },
  /** API4: una excepción no capturada por el código de la aplicación. */
  'error-interno': {
    status: 500,
    title: 'Ocurrió un error inesperado',
  },
  /** R3, D3 de la Fase 04: firma HMAC ausente, inválida o fuera de tolerancia del webhook. */
  'firma-invalida': {
    status: 401,
    title: 'La firma de la petición es inválida o está ausente',
  },
  /** D2 de la Fase 04: el cuerpo de la petición supera el límite de tamaño configurado. */
  'carga-demasiado-grande': {
    status: 413,
    title: 'El cuerpo de la petición supera el límite de tamaño permitido',
  },
  /** USR1: correo inexistente, contraseña incorrecta o usuario inactivo responden igual. */
  'credenciales-invalidas': {
    status: 401,
    title: 'Las credenciales no son válidas',
  },
  /** USR3, USR5, USR6, API7: sin sesión, o con una sesión vencida, cerrada o de un usuario inactivo. */
  'peticion-no-autenticada': {
    status: 401,
    title: 'La petición necesita una sesión válida',
  },
  /** USR6, API7: la sesión es válida pero su rol no alcanza para la operación. */
  'rol-insuficiente': {
    status: 403,
    title: 'El rol de la sesión no permite esta operación',
  },
  /** USR7: una mutación bajo /api/v1 llegó sin el encabezado X-Luxe-Csrf. */
  'encabezado-csrf-ausente': {
    status: 403,
    title: 'Falta el encabezado anti-CSRF de la petición',
  },
  /** USR8: la pareja correo e IP agotó sus intentos de inicio de sesión en la ventana. */
  'demasiados-intentos': {
    status: 429,
    title: 'Demasiados intentos de inicio de sesión; intenta más tarde',
  },
} as const);

/** Un código fuera de {@link CATALOGO_CODIGOS} no compila (D5). */
export type CodigoError = keyof typeof CATALOGO_CODIGOS;
