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
