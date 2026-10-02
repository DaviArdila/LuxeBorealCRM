const colapsar = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

/**
 * R2: cuando una herramienta devolvió un mensaje del negocio que debe llegar tal cual (hoy, el de «sin
 * cobertura»), la respuesta final lo contiene literal. Si el texto del modelo ya lo trae (comparado sin
 * distinguir espacios ni saltos de línea, pero sí palabras, mayúsculas y signos) no se toca; si lo parafrasea
 * u omite, se añade al final en un párrafo aparte, así el modelo conserva su frase propia (por ejemplo la
 * invitación a dar otra dirección) y la cita queda íntegra. Función pura: sin reloj ni E/S.
 */
export function asegurarMensajeLiteral(texto: string, mensaje: string): string {
  const literal = colapsar(mensaje);
  if (literal.length === 0 || colapsar(texto).includes(literal)) {
    return texto;
  }
  return `${texto}\n\n${mensaje.trim()}`;
}
