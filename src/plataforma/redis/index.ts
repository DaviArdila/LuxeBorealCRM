/**
 * Superficie pública de `plataforma/redis` (D12). Nadie fuera de este módulo importa rutas
 * internas (`./redis.module.js`, etc.) — regla de fronteras `sin-rutas-internas-de-plataforma`.
 */
export { REDIS_CLIENTE, RedisModule, type ClienteRedis } from './redis.module.js';
