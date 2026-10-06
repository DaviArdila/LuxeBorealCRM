import { Inject, Injectable } from '@nestjs/common';
import { asegurarConexion, REDIS_CLIENTE } from '../../../../plataforma/redis/index.js';
import type { ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { VersionEstilo } from '../../puertos/version-estilo.js';

/** Clave de versión compartida en Redis (AGT19), gemela de `catalogo:version`. */
const CLAVE_VERSION = 'agente:prompt:version';

/**
 * Adaptador Redis de {@link VersionEstilo}. Conexión perezosa con `asegurarConexion` de `plataforma/redis`, igual
 * que `CacheCatalogoRedis` e `IndicadorRedis`.
 */
@Injectable()
export class VersionEstiloRedis implements VersionEstilo {
  /** Clave de la versión; protegida para que las pruebas de integración usen una por worker y no se pisen entre archivos. */
  protected readonly clave: string = CLAVE_VERSION;

  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  async obtener(): Promise<string> {
    await asegurarConexion(this.redis);
    return (await this.redis.get(this.clave)) ?? '0';
  }

  async incrementar(): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.incr(this.clave);
  }
}
