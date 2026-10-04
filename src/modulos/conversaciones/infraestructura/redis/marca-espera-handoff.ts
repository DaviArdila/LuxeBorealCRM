import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';

function claveMarca(idConversacion: string): string {
  return `handoff:${idConversacion}:espera-enviada`;
}

/**
 * Marca efímera del aviso único de espera (D12 de `design.md`, CNV3): `SET … NX EX
 * HANDOFF_TTL_MIN` (vive como máximo lo que puede vivir el propio episodio de
 * `handoff_pendiente`). `marcarSiEsPrimeraVez` es atómica (`NX`): dos llamadas concurrentes para la
 * misma conversación nunca envían dos avisos.
 */
@Injectable()
export class MarcaEsperaHandoff {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  /** `true` si esta llamada creó la marca (primer aviso); `false` si ya existía (no avisar de nuevo). */
  async marcarSiEsPrimeraVez(idConversacion: string): Promise<boolean> {
    await asegurarConexion(this.redis);
    const resultado = await this.redis.set(
      claveMarca(idConversacion),
      '1',
      'EX',
      this.configuracion.HANDOFF_TTL_MIN * 60,
      'NX',
    );
    return resultado === 'OK';
  }

  /** Cualquier transición que saca la conversación de `handoff_pendiente` borra la marca (D12). */
  async borrar(idConversacion: string): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.del(claveMarca(idConversacion));
  }
}
