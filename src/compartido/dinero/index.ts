/**
 * Superficie pública de `compartido/dinero` (CMP1). Nadie fuera de este módulo importa rutas
 * internas (`./dinero.js`).
 */
export {
  formatearCop,
  formatearDias,
  formatearRangoCop,
} from './dinero.js';
