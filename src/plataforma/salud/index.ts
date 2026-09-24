/**
 * Superficie pública de `plataforma/salud` (D4). Nadie fuera de este módulo importa rutas
 * internas (`./salud.controller.js`, `./indicador-postgres.js`, `./indicador-redis.js`,
 * `./con-timeout.js`) — regla de fronteras `sin-rutas-internas-de-plataforma`.
 */
export { SaludModule } from './salud.module.js';
