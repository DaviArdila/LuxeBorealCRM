import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CONFIGURACION } from '../config/index.js';
import type { Configuracion } from '../config/index.js';

/** Token de inyección del cliente Redis de plataforma (D12 de `design.md`). */
export const REDIS_CLIENTE = Symbol('REDIS_CLIENTE');

/** Tipo del cliente Redis de plataforma; alias de `Redis` de `ioredis`. */
export type ClienteRedis = Redis;

/**
 * Provider real (con ciclo de vida de Nest) que construye el cliente Redis y cierra la conexión
 * en el apagado. `lazyConnect: true`: construir esta clase no conecta (A1) — a diferencia de lo
 * que podría sugerir el nombre, la conexión NO se abre sola con el primer comando: quien use este
 * cliente (el indicador de salud de T9) MUST llamar `cliente.connect()` explícitamente antes de
 * su primer `PING`/comando en cada uso, y comprobar `cliente.status` antes de repetir esa llamada
 * — `connect()` no es idempotente, rechaza con "Redis is already connecting/connected" si el
 * estado ya es `connecting`/`connect`/`ready` (`node_modules/ioredis/built/Redis.js`,
 * `_connect()`). `enableOfflineQueue: false` y `maxRetriesPerRequest: 1`: sin cola offline, un
 * Redis caído falla en milisegundos en vez de colgar el health check.
 *
 * El cierre en {@link onApplicationShutdown} queda implementado aquí (T8); T9 solo necesita
 * llamar `app.enableShutdownHooks()` para que Nest lo dispare — no vuelve a tocar este archivo.
 * Solo se llama `quit()` (cierre ordenado, espera respuestas pendientes) cuando el cliente está
 * `ready`; en cualquier otro estado salvo `end` se usa `disconnect()` (cierre inmediato,
 * síncrono, nunca rechaza) — `quit()` con `enableOfflineQueue: false` rechaza si el socket no es
 * escribible todavía (cliente nunca conectado o Redis caído), lo que Nest atraparía y solo
 * logueraría como error en cada apagado sin necesidad real.
 */
@Injectable()
class ProveedorClienteRedis implements OnApplicationShutdown {
  readonly cliente: ClienteRedis;

  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    this.cliente = new Redis(configuracion.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.cliente.status === 'ready') {
      await this.cliente.quit();
    } else if (this.cliente.status !== 'end') {
      this.cliente.disconnect();
    }
  }
}

/**
 * Módulo global del cliente Redis de plataforma (D12). Registra el cliente bajo el token
 * {@link REDIS_CLIENTE}; los módulos de negocio futuros no lo usan directamente en `aplicacion/`,
 * sino a través de sus propios puertos.
 */
@Module({
  providers: [
    ProveedorClienteRedis,
    {
      provide: REDIS_CLIENTE,
      useFactory: (proveedor: ProveedorClienteRedis): ClienteRedis => proveedor.cliente,
      inject: [ProveedorClienteRedis],
    },
  ],
  exports: [REDIS_CLIENTE],
})
export class RedisModule {}
