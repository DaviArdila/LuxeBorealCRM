import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENTE } from '../../../../plataforma/redis/index.js';
import type { ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { VersionEstilo } from '../../puertos/version-estilo.js';

/** Clave de versión compartida en Redis (AGT19), gemela de `catalogo:version`. */
const CLAVE_VERSION = 'agente:prompt:version';

/**
 * Adaptador Redis de {@link VersionEstilo}. Conexión perezosa con el mismo protocolo que `CacheCatalogoRedis` e
 * `IndicadorRedis`: `connect()` no es idempotente, así que solo se llama en `wait`, `close` o `end`.
 */
@Injectable()
export class VersionEstiloRedis implements VersionEstilo {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  async obtener(): Promise<string> {
    await this.conectarSiHaceFalta();
    return (await this.redis.get(CLAVE_VERSION)) ?? '0';
  }

  async incrementar(): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis.incr(CLAVE_VERSION);
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
