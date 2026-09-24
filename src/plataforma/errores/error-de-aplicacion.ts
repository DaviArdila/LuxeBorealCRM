import type { CodigoError } from './catalogo-codigos.js';
import type { DetalleCampo } from './construir-problema.js';

/**
 * Error de negocio/aplicación con código estable (D5). El filtro global lo mapea a RFC 9457 sin
 * adivinar: el código y, si aplica, el detalle por campo, ya vienen resueltos por quien lo lanza
 * (p. ej. `fabricaErrorValidacion` para el pipe de validación).
 */
export class ErrorDeAplicacion extends Error {
  readonly codigo: CodigoError;
  readonly errores?: readonly DetalleCampo[];

  constructor(codigo: CodigoError, opciones?: { readonly errores?: readonly DetalleCampo[] }) {
    super(`Error de aplicación: ${codigo}`);
    this.name = 'ErrorDeAplicacion';
    this.codigo = codigo;
    this.errores = opciones?.errores;
  }
}
