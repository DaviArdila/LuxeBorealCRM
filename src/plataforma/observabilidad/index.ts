/**
 * Superficie pública de `plataforma/observabilidad` (PLT3, R14). Nadie fuera de este módulo
 * importa rutas internas (`./crear-opciones-logger.js`, `./rutas-redaccion.js`,
 * `./observabilidad.module.js`).
 *
 * Un campo nuevo con datos personales MUST agregarse a `RUTAS_REDACCION` con su caso en el test
 * `R14 — Redacción en logs` (`crear-opciones-logger.spec.ts`).
 */
export { crearOpcionesLogger, type ConfiguracionLogger } from './crear-opciones-logger.js';
export { RUTAS_REDACCION } from './rutas-redaccion.js';
export { ObservabilidadModule } from './observabilidad.module.js';
