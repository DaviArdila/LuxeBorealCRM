import type { RedisOptions } from 'bullmq';

/**
 * Traduce `REDIS_URL` (`redis://`/`rediss://`) a las opciones de conexión que BullMQ exige para
 * sus *workers* (D6 de `design.md`): `maxRetriesPerRequest: null`. Conexión propia de BullMQ,
 * distinta de la de `plataforma/redis` (que falla rápido para el health check, PLT4 — su
 * `maxRetriesPerRequest: 1` rompería la semántica de los *workers* de BullMQ, que la exigen en
 * `null`): mismo servidor, misma URL, configuración separada por dueño. Se usa el `RedisOptions`
 * propio de `bullmq` (no el de `ioredis`): son estructuralmente parecidos, pero BullMQ tipa
 * `connection` contra su propia unión (`ConnectionOptions`, `bullmq/dist/.../redis-options.d.ts`),
 * más permisiva (`[key: string]: any`) que el `RedisOptions` estricto de `ioredis`.
 *
 * `new URL(redisUrl)` funciona con el esquema `redis:`/`rediss:` porque el estándar WHATWG URL
 * extrae usuario, contraseña, host y puerto de la autoridad (`//...`) para cualquier esquema con
 * ese separador, no solo los "especiales" (http, https, etc.) — no hace falta un parser propio.
 */
export function opcionesConexionColas(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const opciones: RedisOptions = {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
    maxRetriesPerRequest: null,
  };

  if (url.protocol === 'rediss:') {
    opciones.tls = {};
  }
  if (url.username !== '') {
    opciones.username = decodeURIComponent(url.username);
  }
  if (url.password !== '') {
    opciones.password = decodeURIComponent(url.password);
  }
  const baseDeDatos = url.pathname.replace(/^\//, '');
  if (baseDeDatos !== '') {
    opciones.db = Number(baseDeDatos);
  }

  return opciones;
}
