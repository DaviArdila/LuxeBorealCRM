/**
 * Normalización y enmascarado de números de teléfono (CMP2). Función pura sin dependencias de
 * infraestructura ni de NestJS — regla `compartido-puro` (D11 de `design.md`). Portado de
 * `../ChatLuxeCRM/src/lib/numero.ts` sin cambiar su comportamiento: `enmascarar` normaliza
 * internamente antes de recortar y un número de 4 dígitos o menos conserva todos sus dígitos.
 */

export function normalizarNumero(numero: string): string {
  return numero.replace(/[^\d]/g, '');
}

export function enmascarar(numero: string): string {
  const limpio = normalizarNumero(numero);
  if (limpio.length <= 4) return `***${limpio}`;
  return `***${limpio.slice(-4)}`;
}
