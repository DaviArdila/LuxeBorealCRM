/** Mínimo de USR10 (P54, NIST SP 800-63B: longitud, sin reglas de composición). */
export const LONGITUD_MINIMA_CONTRASENA = 12;

/** Igual al límite del inicio de sesión (design.md «Endpoints»): una más larga nunca podría usarse. */
export const LONGITUD_MAXIMA_CONTRASENA = 200;

export type MotivoContrasenaInvalida = 'corta' | 'larga' | 'no-coincide';

export type ValidacionContrasena =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: MotivoContrasenaInvalida };

/** Cuenta puntos de código, no unidades UTF-16, para que un emoji valga un carácter. */
function longitud(texto: string): number {
  return [...texto].length;
}

export function validarContrasenaNueva(contrasena: string, confirmacion: string): ValidacionContrasena {
  if (longitud(contrasena) < LONGITUD_MINIMA_CONTRASENA) {
    return { valida: false, motivo: 'corta' };
  }
  if (longitud(contrasena) > LONGITUD_MAXIMA_CONTRASENA) {
    return { valida: false, motivo: 'larga' };
  }
  if (contrasena !== confirmacion) {
    return { valida: false, motivo: 'no-coincide' };
  }
  return { valida: true };
}
