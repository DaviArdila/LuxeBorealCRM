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
  /**
   * Motivo en texto para el cliente (`detail` de RFC 9457). Quien lo pone es responsable de que nombre la regla rota y
   * nunca copie un valor recibido ni un dato personal (R14).
   */
  readonly detalle?: string;

  constructor(
    codigo: CodigoError,
    opciones?: { readonly errores?: readonly DetalleCampo[]; readonly detalle?: string },
  ) {
    super(`Error de aplicación: ${codigo}`);
    this.name = 'ErrorDeAplicacion';
    this.codigo = codigo;
    this.errores = opciones?.errores;
    this.detalle = opciones?.detalle;
  }
}
