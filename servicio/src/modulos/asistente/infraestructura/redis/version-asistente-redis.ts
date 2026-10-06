import { Inject, Injectable } from '@nestjs/common';
import { asegurarConexion, REDIS_CLIENTE } from '../../../../plataforma/redis/index.js';
import type { ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { VersionAsistente } from '../../puertos/version-asistente.js';

/** Clave de versión compartida en Redis (CAS7), gemela de `agente:prompt:version` y `catalogo:version`. */
const CLAVE_VERSION = 'asistente:version';

/** Adaptador Redis de {@link VersionAsistente}; conexión perezosa con `asegurarConexion` de `plataforma/redis`. */
@Injectable()
export class VersionAsistenteRedis implements VersionAsistente {
  constructor(@Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis) {}

  async obtener(): Promise<string> {
    await asegurarConexion(this.redis);
    return (await this.redis.get(CLAVE_VERSION)) ?? '0';
  }

  async incrementar(): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.incr(CLAVE_VERSION);
  }
}
