/**
 * Superficie pública de `plataforma/salud` (D4). Nadie fuera de este módulo importa rutas
 * internas (`./salud.controller.js`, `./indicador-postgres.js`, `./indicador-redis.js`,
 * `./con-timeout.js`, `./filtro-salud-operativo.js`) — regla de fronteras
 * `sin-rutas-internas-de-plataforma`.
 */
export { esquemaRespuestaSalud, type RespuestaSalud } from './esquema-respuesta.js';
export { SaludModule } from './salud.module.js';
