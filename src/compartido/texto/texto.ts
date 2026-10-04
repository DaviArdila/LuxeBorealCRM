/**
 * Normalización de texto libre y de nombres de lugar para comparación (CMP3). Función pura sin
 * dependencias de infraestructura ni de NestJS — regla `compartido-puro` (D11 de `design.md`).
 * Portado de `../ChatLuxeCRM/src/lib/texto.ts` sin cambiar su comportamiento.
 */

export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarLugar(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function palabrasClave(texto: string, minimo = 3): string[] {
  return normalizarTexto(texto)
    .split(' ')
    .filter((palabra) => palabra.length >= minimo);
}

const PATRON_PESOS = /\$\s?\d/;
const PATRON_PLANTILLA = /\{\{|\}\}/;

/**
 * `true` si el texto trae un valor en pesos (`$389.000`, `$ 120.000`). El dinero sale solo del backend (R1, R2): un
 * texto fijo o un estilo editable no puede llevarlo. Lo comparten la validación del estilo (AGT20) y la de los
 * mensajes fijos (CFN2).
 */
export function contieneValorEnPesos(texto: string): boolean {
  return PATRON_PESOS.test(texto);
}

/** `true` si el texto trae un marcador de plantilla `{{...}}`, que no se reemplazaría y llegaría tal cual al cliente. */
export function contieneMarcadorDePlantilla(texto: string): boolean {
  return PATRON_PLANTILLA.test(texto);
}
