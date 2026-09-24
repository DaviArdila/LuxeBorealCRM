/**
 * Catálogo de códigos de error estables (D5 de `design.md`, ADR-0011 propuesta). `CodigoError` se
 * deriva de las claves de este objeto: un código fuera del catálogo no compila (skill
 * `luxeboreal-arquitectura` §8, kebab-case en español). Cada fase que agregue un error nuevo
 * agrega su propia entrada aquí, con el id del requisito en el comentario — las Fases 11-13
 * agregan `peticion-no-autenticada`, `rol-insuficiente`, `clave-idempotencia-*` (design.md D5);
 * esta fase (00b, T2) solo necesita los dos códigos que sus propios escenarios ejercitan.
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
} as const);

/** Un código fuera de {@link CATALOGO_CODIGOS} no compila (D5). */
export type CodigoError = keyof typeof CATALOGO_CODIGOS;
