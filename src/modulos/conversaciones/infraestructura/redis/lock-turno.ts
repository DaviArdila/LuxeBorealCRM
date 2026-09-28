import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';

function claveLock(idConversacion: string): string {
  return `turno:${idConversacion}:lock`;
}

/**
 * Lock por conversación en Redis (D7 de `design.md`, `SET NX EX`): impide que dos procesamientos
 * de la misma conversación corran en paralelo (R8) mientras el `ProcesadorTurno` (T4) corre con
 * concurrencia > 1 entre conversaciones distintas.
 */
@Injectable()
export class LockTurno {
  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  /** `true` si este llamador adquirió el lock; `false` si ya estaba tomado por otro. */
  async adquirir(idConversacion: string): Promise<boolean> {
    await this.conectarSiHaceFalta();
    const resultado = await this.redis.set(
      claveLock(idConversacion),
      '1',
      'EX',
      this.configuracion.LOCK_TURNO_TTL_S,
      'NX',
    );
    return resultado === 'OK';
  }

  async liberar(idConversacion: string): Promise<void> {
    await this.conectarSiHaceFalta();
    await this.redis.del(claveLock(idConversacion));
  }

  private async conectarSiHaceFalta(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'close' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }
}
