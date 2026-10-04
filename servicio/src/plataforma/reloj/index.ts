/**
 * Superficie pública de `plataforma/reloj` (PLT2). Nadie fuera de este módulo importa rutas
 * internas (`./clock.js`, `./clock-sistema.js`, etc.).
 */
export { CLOCK, type Clock } from './clock.js';
export { ClockSistema } from './clock-sistema.js';
export { RelojModule } from './reloj.module.js';
