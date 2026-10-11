/**
 * Opciones de un mensaje con botones de respuesta (WhatsApp vía Chatwoot): de 1 a 3 botones, cada título de hasta 20
 * caracteres (límite de Meta). Función pura: este archivo no importa nada fuera de `dominio/` (regla `dominio-aislado`).
 *
 * El clic llega de vuelta como un mensaje de texto con el **título** del botón, sin id (Chatwoot descarta el valor), así
 * que los títulos de un mismo mensaje no pueden repetirse. Un título que no cumple se rechaza con un error claro; nunca se
 * trunca en silencio, porque cambiaría lo que el cliente lee y lo que luego se compara.
 */
export const MAX_OPCIONES_BOTONES = 3;
export const MAX_TITULO_BOTON = 20;

/** Error de dominio: el motivo nombra la regla rota y nunca copia el título (R14). */
export class OpcionesBotonesInvalidas extends Error {
  constructor(readonly motivo: string) {
    super(`opciones de botones inválidas: ${motivo}`);
    this.name = 'OpcionesBotonesInvalidas';
  }
}

/** Devuelve los títulos recortados o lanza {@link OpcionesBotonesInvalidas}. */
export function validarOpcionesBotones(opciones: readonly string[]): readonly string[] {
  if (opciones.length < 1 || opciones.length > MAX_OPCIONES_BOTONES) {
    throw new OpcionesBotonesInvalidas(`debe haber entre 1 y ${String(MAX_OPCIONES_BOTONES)} opciones`);
  }
  const titulos = opciones.map((opcion) => opcion.trim());
  for (const titulo of titulos) {
    if (titulo.length === 0) throw new OpcionesBotonesInvalidas('un título está vacío');
    if (titulo.length > MAX_TITULO_BOTON) {
      throw new OpcionesBotonesInvalidas(`un título supera ${String(MAX_TITULO_BOTON)} caracteres`);
    }
  }
  if (new Set(titulos.map((titulo) => titulo.toLowerCase())).size !== titulos.length) {
    throw new OpcionesBotonesInvalidas('hay títulos repetidos');
  }
  return titulos;
}

/** Respaldo para un canal sin botones: cada opción en su línea, numerada (se puede contestar con el número o el título). */
export function enumerarOpciones(opciones: readonly string[]): string {
  return opciones.map((opcion, indice) => `${String(indice + 1)}. ${opcion}`).join('\n');
}
