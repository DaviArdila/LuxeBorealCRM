/**
 * Formato de dinero en pesos colombianos (CMP1). Función pura sin dependencias de infraestructura
 * ni de NestJS — regla `compartido-puro` (D11 de `design.md`): ningún archivo de `compartido/`
 * importa nada, ni de `src/` ni de `npm`. Portado de `../ChatLuxeCRM/src/lib/dinero.ts` sin
 * cambiar su comportamiento (proposal, tabla "Tests del prototipo que esta fase reemplaza").
 */

const formateadorCop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatearCop(valorCop: number): string {
  return formateadorCop.format(valorCop).replace(/\s/g, '');
}

export function formatearRangoCop(minCop: number, maxCop: number): string {
  return `entre ${formatearCop(minCop)} y ${formatearCop(maxCop)}`;
}

export function formatearRecargoContraentrega(porcentaje: number): string {
  return `${porcentaje}% adicional si pagas contra entrega`;
}

export function formatearDias(diasMin: number, diasMax: number): string {
  if (diasMin === diasMax) return `${diasMin} día${diasMin === 1 ? '' : 's'}`;
  return `entre ${diasMin} y ${diasMax} días`;
}
