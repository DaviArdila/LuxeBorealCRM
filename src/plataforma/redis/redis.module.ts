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
 * en el apagado. `lazyConnect: true`: construir esta clase no conecta (A1); la primera operación
 * (`PING`, indicador de salud en T9) dispara la conexión. `enableOfflineQueue: false` y
 * `maxRetriesPerRequest: 1`: sin cola offline, un Redis caído falla en milisegundos en vez de
 * colgar el health check.
 *
 * El cierre en {@link onApplicationShutdown} (`cliente.quit()`) queda implementado aquí (T8); T9
 * solo necesita llamar `app.enableShutdownHooks()` para que Nest lo dispare — no vuelve a tocar
 * este archivo.
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
    if (this.cliente.status !== 'end') {
      await this.cliente.quit();
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
