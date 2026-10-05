/**
 * Políticas del negocio (CAT12): filas `politica_<tema>` de la tabla `parametro` (R15).
 * Funciones puras; el acceso a datos vive detrás de `RepositorioPolitica`.
 */

const PREFIJO_POLITICA = 'politica_';

/** Tope de caracteres por política, para que un texto enorme no infle cada conversación. */
export const LIMITE_CARACTERES_POLITICA = 1200;

/** Texto aprobado por el negocio el 2026-09-29; se usa mientras no exista `politica_contra_entrega`. */
export const POLITICA_CONTRAENTREGA_POR_DEFECTO =
  'Tu pedido se envía contra entrega: pagas cuando lo recibes. El recargo por contra entrega se suma al total de tu compra. ' +
  'Te enviaremos la evidencia del despacho (guía y foto del paquete). Al recibirlo tienes derecho a abrirlo y revisarlo: ' +
  'verifica que sea exactamente lo que pediste y, si presenta cualquier novedad, puedes devolverlo de inmediato.';

/** Temas que tienen texto de respaldo cuando el negocio no los ha configurado. */
export const POLITICAS_POR_DEFECTO: Readonly<Record<string, string>> = {
  contra_entrega: POLITICA_CONTRAENTREGA_POR_DEFECTO,
};

export function esClavePolitica(clave: string): boolean {
  return clave.startsWith(PREFIJO_POLITICA);
}

export function temaDeClave(clave: string): string {
  return clave.slice(PREFIJO_POLITICA.length);
}

export function claveDeTema(tema: string): string {
  return `${PREFIJO_POLITICA}${tema}`;
}

/** Devuelve el motivo del rechazo, o `null` si el tema es válido. */
export function validarTemaPolitica(tema: string): string | null {
  if (!/^[a-z0-9_]+$/.test(tema)) {
    return `el tema "${tema}" debe tener solo minúsculas sin acentos, dígitos y guion bajo`;
  }
  return null;
}

export function validarTextoPolitica(textoCrudo: string): { readonly texto: string } | { readonly error: string } {
  const texto = textoCrudo.trim();
  if (texto === '') return { error: 'la política está vacía' };
  if (texto.length > LIMITE_CARACTERES_POLITICA) {
    return { error: `la política tiene ${texto.length} caracteres; el máximo es ${LIMITE_CARACTERES_POLITICA}` };
  }
  return { texto };
}
